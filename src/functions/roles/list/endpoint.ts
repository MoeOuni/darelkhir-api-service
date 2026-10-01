import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { RoleRepository } from '@/repositories/RoleRepository';
import { PERMISSIONS, ALL_PERMISSIONS, OWNER_ROLE_ID } from '@libs/permissions';

const listRolesHandler = async (_event: ExtendedEvent, _context: Context) => {
  const result = await new RoleRepository().listAll();

  // The owner role is not stored: it is defined in code so it can never be
  // edited into something that locks the owner out.
  const owner = {
    roleId: OWNER_ROLE_ID,
    name: 'Propriétaire',
    description: 'Toutes les permissions. Non modifiable.',
    permissions: ALL_PERMISSIONS,
    locked: true,
  };

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Roles retrieved successfully',
      data: {
        items: [owner, ...result.items.map((e) => ({ ...e.toPublicDTO(), locked: false }))],
        catalogue: PERMISSIONS,
      },
    }),
  };
};

export const handler = middleware({
  auth: true,
  requires: 'roles.manage',
  cors: true,
})(listRolesHandler);
