import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { RoleIdParamSchema } from '@/schemas/staff.schema';
import { RoleRepository } from '@/repositories/RoleRepository';
import { StaffRepository } from '@/repositories/StaffRepository';
import { NotFoundError, ValidationError } from '@libs/errors';
import { isOwnerRole } from '@libs/permissions';
import { invalidateGrantCache } from '@libs/auth/authorize';

const removeRoleHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };

  if (isOwnerRole(id)) {
    throw new ValidationError('The owner role cannot be deleted');
  }

  const repository = new RoleRepository();
  const role = await repository.findByRoleId(id);
  if (!role) throw new NotFoundError('Role not found');

  // Deleting a role that people carry would leave them with no permissions and
  // no explanation. Move them first.
  const staff = await new StaffRepository().listAll();
  const inUse = staff.items.filter((s) => s.roleId === id);
  if (inUse.length) {
    throw new ValidationError(
      `${inUse.length} staff member(s) still carry this role. Move them first.`
    );
  }

  await repository.deleteByRoleId(id);
  invalidateGrantCache();

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Role deleted', data: { id } }),
  };
};

export const handler = middleware({
  auth: true,
  requires: 'roles.manage',
  audit: { action: 'role.delete', entityType: 'role' },
  cors: true,
  validation: { pathParameters: RoleIdParamSchema },
})(removeRoleHandler);
