/**
 * The sites allowed to call this API.
 *
 * Dar El Khir's dashboard and site live under their own subdomain of
 * ounitek.com, following the other shops on the same platform.
 */
export const ALLOWED_ORIGINS = [
  'https://darelkhir.ounitek.com',
  'https://www.darelkhir.ounitek.com',
  'https://admin.darelkhir.ounitek.com',
  // Amplify's own address for the dashboard, until a custom domain is attached.
  'https://master.d2iwkw4rs3znl.amplifyapp.com',
  'http://localhost:5173',
];

export function getCorsHeaders(origin?: string): Record<string, string> {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key',
    'Access-Control-Allow-Credentials': 'true',
  };
}
