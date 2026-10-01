import type { Context } from 'aws-lambda';

/**
 * The journal records changes, not readings.
 *
 * Opening a client fires several GETs, and every one of them used to land in
 * the journal as an entry — "Amine — client.price", holding nothing but a URL.
 * A page of those buries the one line somebody was actually looking for.
 *
 * The trap is not obvious from any single endpoint: `audit` is declared once
 * per Lambda, and the agreed prices are served by one Lambda answering GET,
 * PUT and DELETE on the same route — they share a function to stay under the
 * CloudFormation resource limit. So it audits all three methods or none, and
 * only the middleware can tell them apart.
 */

const recordAudit = jest.fn();

jest.mock('@libs/journal', () => ({
  recordAudit: (...args: unknown[]) => recordAudit(...args),
}));

// The journal is the only thing under test; everything the wrapper reaches for
// on the way is stubbed so the test needs no tokens and no tables.
jest.mock('@libs/auth/authorize', () => ({
  requirePermission: jest.fn(),
  resolveGrant: jest.fn().mockResolvedValue(null),
}));

jest.mock('@libs/corsConfig', () => ({ getCorsHeaders: () => ({}) }));

import { middleware, type ExtendedEvent } from '@libs/middleware';

const handler = middleware({
  cors: true,
  audit: { action: 'client.price', entityType: 'client' },
})(async () => ({ statusCode: 200, body: JSON.stringify({ data: { id: 'c1' } }) }));

const request = (method: string): ExtendedEvent =>
  ({
    httpMethod: method,
    requestContext: { http: { method, path: '/clients/c1/prices' } },
    pathParameters: { id: 'c1' },
    queryStringParameters: null,
    headers: {},
    body: method === 'GET' ? null : JSON.stringify({ price: 95 }),
  }) as unknown as ExtendedEvent;

const context = {} as Context;

describe('what reaches the journal', () => {
  beforeEach(() => recordAudit.mockClear());

  it('does not record a GET', async () => {
    const result = await handler(request('GET'), context);

    expect(result.statusCode).toBe(200);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('does not record a HEAD', async () => {
    await handler(request('HEAD'), context);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  /**
   * The same function, same audit declaration — only the method differs. This
   * is the half that has to keep working: setting a client's price is exactly
   * the kind of change the journal exists for.
   */
  it('still records the write on the very same route', async () => {
    await handler(request('PUT'), context);

    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit.mock.calls[0][0]).toMatchObject({
      action: 'client.price',
      method: 'PUT',
    });
  });

  it('still records a delete', async () => {
    await handler(request('DELETE'), context);
    expect(recordAudit).toHaveBeenCalledTimes(1);
  });
});
