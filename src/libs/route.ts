import type { Context } from 'aws-lambda';

type RouteHandler = (event: any, context: Context) => Promise<any>;

/**
 * One Lambda answering several routes.
 *
 * Each deployed function costs about six CloudFormation resources and this
 * stack sits close to the 500 allowed, so a group of small endpoints shares one
 * function. Each route keeps its own handler, permission, validation and audit
 * through its own `middleware(...)` wrapper; this only picks which one runs,
 * using the route the API gateway matched.
 */
export function byRoute(routes: Record<string, RouteHandler>) {
  return async (event: any, context: Context) => {
    const route = routes[event?.routeKey];
    if (!route) {
      return { statusCode: 404, body: JSON.stringify({ message: `No such route: ${event?.routeKey}` }) };
    }
    return route(event, context);
  };
}
