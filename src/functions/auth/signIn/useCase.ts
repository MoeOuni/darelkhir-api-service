import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  NotAuthorizedException,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { Context } from 'aws-lambda';
import { ExtendedEvent } from '@libs/middleware';
import { AuthenticationError } from '@libs/errors';
import { normalizePhone } from '@libs/phone';
import type { SignInInput } from '@/schemas/auth.schema';

const cognitoClient = new CognitoIdentityProviderClient({});

/**
 * Staff sign-in with a phone number and a password.
 *
 * The pool stores the email as the username, so the phone is resolved to that
 * username first. See `libs/auth/resolveUsername.ts`.
 */
export async function signInHandler(event: ExtendedEvent, _context: Context) {
  const { phone, password } = event.body as SignInInput;
  const userPoolId = process.env.COGNITO_USER_POOL_ID!;

  // The pool uses phone_number as its username attribute, so the normalized
  // number is the username. Nothing has to be looked up.
  const username = normalizePhone(phone);
  if (!username) {
    throw new AuthenticationError('Invalid phone number or password');
  }

  let result;
  try {
    const response = await cognitoClient.send(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: process.env.COGNITO_CLIENT_ID!,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        },
      }),
    );
    result = response.AuthenticationResult;
  } catch (err) {
    if (err instanceof NotAuthorizedException || err instanceof UserNotFoundException) {
      throw new AuthenticationError('Invalid phone number or password');
    }
    throw err;
  }

  if (!result) {
    throw new AuthenticationError('Authentication failed');
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      accessToken: result.AccessToken,
      idToken: result.IdToken,
      refreshToken: result.RefreshToken,
      expiresIn: result.ExpiresIn,
    }),
  };
}
