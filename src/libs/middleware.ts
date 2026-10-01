import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ZodSchema, ZodError } from 'zod';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { createLogger, Logger } from './logger';
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from './errors';
import { getCorsHeaders } from './corsConfig';
import { getConfig } from './config';
import { AuthUser } from './interfaces';
import { recordAudit } from './journal';
import { requirePermission, resolveGrant } from './auth/authorize';
import { describeAudit } from './audit-describe';
import type { Permission } from './permissions';

export interface ExtendedEvent extends APIGatewayProxyEvent {
  body: any;
  logger: Logger;
  user?: AuthUser;
}

type Handler = (
  event: ExtendedEvent,
  context: Context
) => Promise<APIGatewayProxyResult>;

interface MiddlewareOptions {
  auth?: boolean;
  clientAuth?: boolean;
  optionalAuth?: boolean;
  /** Accept either admin OR client pool token (e.g. createOrder — callable by both) */
  anyAuth?: boolean;
  cors?: boolean;
  validation?: {
    body?: ZodSchema;
    pathParameters?: ZodSchema;
    queryStringParameters?: ZodSchema;
  };
  /**
   * Audit label for this endpoint, for example `order.update`.
   *
   * Set it on every route that changes data. Reads are not audited: they would
   * bury the entries that matter under noise.
   */
  audit?: { action: string; entityType: string };
  /**
   * Permission the caller must hold, for example `payments.create`.
   *
   * Checked here, on the server. Hiding a button in the dashboard is comfort,
   * not security: anyone who knows the API address can still call it.
   */
  requires?: Permission;
}

/**
 * One verifier per user pool, cached for the life of the Lambda container.
 *
 * The verifier downloads the pool's JSON Web Key Set once, then checks every
 * later token in memory. This replaces a GetUser call to Cognito on every
 * authenticated request, which added a network round trip to each one.
 */
type Verifier = ReturnType<typeof CognitoJwtVerifier.create<{
  userPoolId: string;
  tokenUse: 'access';
  clientId: null;
}>>;

const verifiers = new Map<string, Verifier>();

function getVerifier(userPoolId: string): Verifier {
  let verifier = verifiers.get(userPoolId);
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: 'access',
      // The pool the token was issued by is the security boundary here. The app
      // client id is not checked, because it is not present in the environment
      // of every function that authenticates.
      clientId: null,
    });
    verifiers.set(userPoolId, verifier);
  }
  return verifier;
}

async function resolveUser(
  event: APIGatewayProxyEvent,
  poolId?: string
): Promise<AuthUser | null> {
  const authHeader =
    event.headers?.['Authorization'] || event.headers?.['authorization'];
  if (!authHeader) return null;
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null;

  const accessToken = authHeader.slice(7).trim();
  const expectedPoolId = poolId ?? process.env.COGNITO_USER_POOL_ID!;
  const isStaff = expectedPoolId === process.env.COGNITO_USER_POOL_ID;

  try {
    // Verifies the signature, the issuer, the expiry and token_use.
    const payload = await getVerifier(expectedPoolId).verify(accessToken);

    return {
      sub: payload.sub,
      // A Cognito access token carries no email attribute — that lives on the
      // id token. Nothing on the server reads these two, so they stay empty
      // rather than costing a call to Cognito on every request.
      email: '',
      // Deliberately blank. The username claim is a UUID on a phone-username
      // pool, and showing it as a person's name is worse than showing nothing.
      name: '',
      username: typeof payload.username === 'string' ? payload.username : '',
      groups: Array.isArray(payload['cognito:groups'])
        ? (payload['cognito:groups'] as string[])
        : [],
      authType: 'cognito',
      isStaff,
    };
  } catch {
    throw new AuthenticationError('Invalid or expired token');
  }
}

/** The saved record from a response body, when there is one. */
function extractDataFromBody(body: string | undefined): Record<string, any> | undefined {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body);
    return parsed?.data ?? parsed ?? undefined;
  } catch {
    return undefined;
  }
}

export function middleware(options: MiddlewareOptions = {}) {
  return (handler: Handler): Handler => {
    return async (
      event: ExtendedEvent,
      context: Context
    ): Promise<APIGatewayProxyResult> => {
      const traceId =
        (event.requestContext as any)?.requestId || context.awsRequestId;
      const logger = createLogger(traceId, context.functionName);
      event.logger = logger;

      logger.info('Handler invoked', {
        method: event.httpMethod,
        path: event.path,
      });

      const corsHeaders = options.cors
        ? getCorsHeaders(event.headers?.origin || event.headers?.Origin)
        : {};

      const baseHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...corsHeaders,
      };

      try {
        // JSON body parsing
        if (event.body && typeof event.body === 'string') {
          try {
            event.body = JSON.parse(event.body);
          } catch {
            throw new ValidationError('Invalid JSON body');
          }
        }

        // Authentication
        if (options.auth || options.clientAuth || options.optionalAuth || options.anyAuth) {
          let user: AuthUser | null = null;

          if (options.anyAuth) {
            // Try admin pool first, then client pool
            try {
              user = await resolveUser(event, process.env.COGNITO_USER_POOL_ID!);
            } catch { /* not an admin token */ }
            if (!user) {
              try {
                user = await resolveUser(event, process.env.CLIENTS_USER_POOL_ID!);
              } catch { /* not a client token either */ }
            }
            if (!user) throw new AuthenticationError();
          } else if (options.optionalAuth) {
            // The caller is allowed to be anonymous, so a token that does not
            // resolve must degrade to "no user" instead of failing the request.
            // A shop customer browsing with a client-pool token would otherwise
            // get a 401 from an endpoint that is meant to be open.
            try {
              user = await resolveUser(event, process.env.COGNITO_USER_POOL_ID!);
            } catch {
              user = null;
            }
          } else {
            const poolId = options.clientAuth
              ? process.env.CLIENTS_USER_POOL_ID!
              : process.env.COGNITO_USER_POOL_ID!;
            user = await resolveUser(event, poolId);
            if (!user && (options.auth || options.clientAuth)) {
              throw new AuthenticationError();
            }
          }

          event.user = user || undefined;
        }

        // Authorization. Runs after the token resolves and before validation,
        // so a caller without the permission never reaches the handler.
        if (options.requires) {
          const grant = await requirePermission(event.user, options.requires);
          if (event.user) event.user.name = grant.displayName;
        } else if (options.audit && event.user?.isStaff) {
          // Not a permission check — just the real name for the journal. The
          // grant is cached, so this costs nothing after the first call.
          const grant = await resolveGrant(event.user).catch(() => null);
          if (grant) event.user.name = grant.displayName;
        }

        // Validation
        if (options.validation) {
          if (options.validation.body && event.body) {
            event.body = options.validation.body.parse(event.body);
          }
          if (options.validation.pathParameters && event.pathParameters) {
            event.pathParameters = options.validation.pathParameters.parse(
              event.pathParameters
            );
          }
          if (
            options.validation.queryStringParameters &&
            event.queryStringParameters
          ) {
            event.queryStringParameters =
              options.validation.queryStringParameters.parse(
                event.queryStringParameters
              );
          }
        }

        const result = await handler(event, context);
        logger.success('Handler completed', { statusCode: result.statusCode });

        const method =
          (event.requestContext as any)?.http?.method ?? event.httpMethod ?? '';

        // Audit only successful changes.
        //
        // A rejected request changed nothing, and neither did a read. The
        // journal answers "who changed what", so a GET has no place in it —
        // and a page that opens a client fires several, which buries the one
        // entry somebody was actually looking for.
        //
        // Filtered here rather than at each endpoint because the trap is not
        // obvious: `audit` is declared once per function, and a function
        // serving GET, PUT and DELETE on one route — which is how the agreed
        // prices are served, to stay under the CloudFormation resource limit —
        // audits all three or none.
        const isRead = method === 'GET' || method === 'HEAD';

        if (options.audit && !isRead && result.statusCode < 400) {
          const responseData = extractDataFromBody(result.body);
          const entityId =
            (event.pathParameters as Record<string, string> | null)?.id ??
            (typeof responseData?.id === 'string' ? responseData.id : undefined);

          // Readable facts for the journal: the order number, the client, the
          // amount. The sentence itself is composed in the dashboard so it can
          // be read in either language.
          const { meta, searchKey } = describeAudit(
            options.audit.action,
            responseData,
            typeof event.body === 'object' ? event.body : undefined,
            event.pathParameters as Record<string, string> | null
          );

          await recordAudit({
            action: options.audit.action,
            entityType: options.audit.entityType,
            entityId,
            summary: options.audit.action,
            actor: event.user,
            method,
            path: (event.requestContext as any)?.http?.path ?? event.path,
            statusCode: result.statusCode,
            details: typeof event.body === 'object' ? event.body : undefined,
            meta,
            searchKey: `${searchKey} ${event.user?.name ?? ''}`.toLowerCase(),
          });
        }

        return {
          ...result,
          headers: { ...baseHeaders, ...(result.headers || {}) },
        };
      } catch (error: any) {
        logger.error('Handler error', error);

        const { stage } = getConfig();
        const exposeMessage = stage === 'dev';

        if (error instanceof ZodError) {
          return {
            statusCode: 400,
            headers: baseHeaders,
            body: JSON.stringify({
              message: 'Validation failed',
              errors: error.errors,
            }),
          };
        }

        if (error instanceof ValidationError) {
          return {
            statusCode: 400,
            headers: baseHeaders,
            body: JSON.stringify({ message: error.message }),
          };
        }

        if (error instanceof AuthenticationError) {
          return {
            statusCode: 401,
            headers: baseHeaders,
            body: JSON.stringify({ message: error.message }),
          };
        }

        if (error instanceof AuthorizationError) {
          return {
            statusCode: 403,
            headers: baseHeaders,
            body: JSON.stringify({ message: error.message }),
          };
        }

        if (error instanceof NotFoundError) {
          return {
            statusCode: 404,
            headers: baseHeaders,
            body: JSON.stringify({ message: error.message }),
          };
        }

        return {
          statusCode: 500,
          headers: baseHeaders,
          body: JSON.stringify({
            message: exposeMessage ? error.message : 'Internal server error',
          }),
        };
      }
    };
  };
}
