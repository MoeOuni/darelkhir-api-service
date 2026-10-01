import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { resolveGrant } from '@libs/auth/authorize';
import { PERMISSIONS } from '@libs/permissions';

/**
 * What the signed-in worker is allowed to do.
 *
 * The dashboard calls this once to decide which buttons to show. It is not the
 * security boundary — every endpoint checks for itself.
 */
const meHandler = async (event: ExtendedEvent, _context: Context) => {
  const grant = await resolveGrant(event.user!);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Permissions retrieved successfully',
      data: {
        sub: event.user!.sub,
        roleId: grant.roleId,
        roleName: grant.roleName,
        isOwner: grant.isOwner,
        permissions: grant.permissions,
        catalogue: PERMISSIONS,
      },
    }),
  };
};

export const handler = middleware({ auth: true, cors: true })(meHandler);
