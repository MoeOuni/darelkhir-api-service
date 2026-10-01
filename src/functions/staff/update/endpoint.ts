import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { UpdateStaffSchema, StaffIdParamSchema, type UpdateStaffInput } from '@/schemas/staff.schema';
import { StaffRepository } from '@/repositories/StaffRepository';
import { RoleRepository } from '@/repositories/RoleRepository';
import { NotFoundError, ValidationError } from '@libs/errors';
import { isOwnerRole } from '@libs/permissions';
import { invalidateGrantCache } from '@libs/auth/authorize';

const updateStaffHandler = async (event: ExtendedEvent, _context: Context) => {
  const { id } = event.pathParameters as { id: string };
  const data = event.body as UpdateStaffInput;

  const repository = new StaffRepository();
  const staff = await repository.findBySub(id);
  if (!staff) throw new NotFoundError('Staff member not found');

  // You cannot switch yourself off or demote yourself. That is the mistake that
  // leaves a shop with nobody able to manage staff.
  if (staff.sub === event.user!.sub) {
    if (data.active === false) throw new ValidationError('You cannot switch off your own account');
    if (data.roleId && data.roleId !== staff.roleId) {
      throw new ValidationError('You cannot change your own role');
    }
  }

  if (data.roleId && !isOwnerRole(data.roleId)) {
    const role = await new RoleRepository().findByRoleId(data.roleId);
    if (!role) throw new ValidationError(`Role not found: ${data.roleId}`);
  }

  staff.set(data);
  await repository.update(staff);
  invalidateGrantCache(staff.sub);

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Staff updated', data: staff.toPublicDTO() }),
  };
};

export const handler = middleware({
  auth: true,
  requires: 'staff.manage',
  audit: { action: 'staff.update', entityType: 'staff' },
  cors: true,
  validation: { body: UpdateStaffSchema, pathParameters: StaffIdParamSchema },
})(updateStaffHandler);
