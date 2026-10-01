import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { UpsertRoleSchema, type UpsertRoleInput } from '@/schemas/staff.schema';
import { RoleRepository } from '@/repositories/RoleRepository';
import { RoleEntity } from '@/entities/RoleEntity';
import { DataType } from '@libs/enums';
import { ValidationError } from '@libs/errors';
import { isOwnerRole, sanitizePermissions } from '@libs/permissions';
import { resolveGrant, invalidateGrantCache } from '@libs/auth/authorize';

/** Creates a role, or replaces the permissions of one that exists. */
const upsertRoleHandler = async (event: ExtendedEvent, _context: Context) => {
  const { roleId, name, description, permissions } = event.body as UpsertRoleInput;

  if (isOwnerRole(roleId)) {
    throw new ValidationError('The owner role cannot be changed');
  }

  // Unknown names are dropped rather than stored: a permission that matches no
  // check would be a promise the system does not keep.
  const clean = sanitizePermissions(permissions);

  // Nobody can hand out more than they hold themselves.
  const grant = await resolveGrant(event.user!);
  if (!grant.isOwner) {
    const beyond = clean.filter((p) => !grant.permissions.includes(p));
    if (beyond.length) {
      throw new ValidationError(
        `You cannot grant permissions you do not hold: ${beyond.join(', ')}`
      );
    }
  }

  const repository = new RoleRepository();
  const existing = await repository.findByRoleId(roleId);
  const now = new Date().toISOString();

  if (existing) {
    existing.set({ name, description, permissions: clean });
    await repository.update(existing);
  } else {
    await repository.create(
      new RoleEntity({
        id: DataType.ROLE,
        sk: `${DataType.ROLE}#${roleId}`,
        dataType: DataType.ROLE,
        roleId,
        name,
        description,
        permissions: clean,
        createdAt: now,
        updatedAt: now,
      })
    );
  }

  // Permissions changed, so every cached grant is suspect.
  invalidateGrantCache();

  return {
    statusCode: existing ? 200 : 201,
    body: JSON.stringify({
      message: existing ? 'Role updated' : 'Role created',
      data: { id: roleId, roleId, name, description, permissions: clean },
    }),
  };
};

export const handler = middleware({
  auth: true,
  requires: 'roles.manage',
  audit: { action: 'role.upsert', entityType: 'role' },
  cors: true,
  validation: { body: UpsertRoleSchema },
})(upsertRoleHandler);
