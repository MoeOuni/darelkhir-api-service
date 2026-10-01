import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { StaffRepository } from '@/repositories/StaffRepository';
import { RoleRepository } from '@/repositories/RoleRepository';
import { AuthorizationError } from '@libs/errors';
import {
  ALL_PERMISSIONS,
  OWNER_ROLE_ID,
  isOwnerRole,
  type Permission,
} from '@libs/permissions';
import type { AuthUser } from '@libs/interfaces';

export type Grant = {
  roleId: string;
  roleName: string;
  /** Real name from the staff record, for the audit trail and the top bar. */
  displayName: string;
  permissions: string[];
  /** True for the owner role, which holds everything including future names. */
  isOwner: boolean;
};

/** Roles change rarely. A short cache keeps this off the hot path. */
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: Grant; expiresAt: number }>();

export function invalidateGrantCache(sub?: string): void {
  if (sub) cache.delete(sub);
  else cache.clear();
}

const cognitoClient = new CognitoIdentityProviderClient({});

/**
 * Reads the real name and phone number from Cognito.
 *
 * The access token cannot supply these: on a phone-username pool the username
 * claim is a UUID and there is no name claim at all. Called once at bootstrap
 * and once more if a stored record is found to be wrong, never on the hot path.
 */
async function fetchCognitoProfile(
  username: string
): Promise<{ name?: string; phone?: string; email?: string }> {
  try {
    const res = await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID!,
        Username: username,
      })
    );
    const attr = (n: string) => res.UserAttributes?.find((a) => a.Name === n)?.Value;
    return { name: attr('name'), phone: attr('phone_number'), email: attr('email') };
  } catch {
    return {};
  }
}

/** A stored value is suspect when it is empty or looks like the Cognito UUID. */
function looksWrong(value: string | undefined, sub: string): boolean {
  return !value || value === sub || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value);
}

const OWNER_GRANT: Grant = {
  roleId: OWNER_ROLE_ID,
  roleName: 'Owner',
  displayName: '',
  permissions: ALL_PERMISSIONS,
  isOwner: true,
};

/**
 * Works out what a signed-in staff member is allowed to do.
 *
 * First run: when no staff record exists at all, the caller is treated as the
 * owner and a record is written for them. Without this the first administrator
 * — created in Cognito by hand — could never reach the screen that creates
 * staff records, and the shop would be locked out of itself.
 *
 * After that, a staff-pool token with no staff record gets nothing. Accounts
 * are meant to be created through the staff screen, which writes both halves.
 */
export async function resolveGrant(user: AuthUser): Promise<Grant> {
  const cached = cache.get(user.sub);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const staffRepository = new StaffRepository();
  const staff = await staffRepository.findBySub(user.sub);

  let grant: Grant;

  if (!staff) {
    if (await staffRepository.isEmpty()) {
      grant = OWNER_GRANT;
      await bootstrapOwner(user).catch(() => {
        /* the grant still stands for this request */
      });
    } else {
      grant = { roleId: '', roleName: '', displayName: '', permissions: [], isOwner: false };
    }
  } else if (looksWrong(staff.phone, user.sub) || looksWrong(staff.name, user.sub)) {
    // Repair a record written before the name and phone were read properly.
    const profile = await fetchCognitoProfile(user.username || user.sub);
    if (profile.name || profile.phone) {
      staff.set({
        name: profile.name || staff.name,
        phone: profile.phone || staff.phone,
        email: profile.email ?? staff.email,
      });
      await staffRepository.update(staff).catch(() => {
        /* display only — never fail a request over it */
      });
    }
    grant = isOwnerRole(staff.roleId)
      ? { ...OWNER_GRANT, displayName: staff.name }
      : await grantFromRole(staff.roleId, staff.name);
  } else if (!staff.active) {
    // A switched-off account keeps its record but loses every permission.
    grant = { roleId: staff.roleId, roleName: '', displayName: staff.name, permissions: [], isOwner: false };
  } else if (isOwnerRole(staff.roleId)) {
    grant = { ...OWNER_GRANT, displayName: staff.name };
  } else {
    grant = await grantFromRole(staff.roleId, staff.name);
  }

  cache.set(user.sub, { value: grant, expiresAt: Date.now() + CACHE_TTL_MS });
  return grant;
}

/** Loads a role's permissions. */
async function grantFromRole(roleId: string, displayName = ''): Promise<Grant> {
  const role = await new RoleRepository().findByRoleId(roleId);
  return {
    roleId,
    roleName: role?.name ?? '',
    displayName,
    permissions: role?.permissions ?? [],
    isOwner: false,
  };
}

/** Writes the owner record for the very first administrator. */
async function bootstrapOwner(user: AuthUser): Promise<void> {
  const { StaffEntity } = await import('@/entities/StaffEntity');
  const { DataType } = await import('@libs/enums');
  const now = new Date().toISOString();

  // Read the real name and phone from Cognito. The token carries neither.
  const profile = await fetchCognitoProfile(user.username || user.sub);

  await new StaffRepository().create(
    new StaffEntity({
      id: DataType.STAFF,
      sk: `${DataType.STAFF}#${user.sub}`,
      dataType: DataType.STAFF,
      sub: user.sub,
      name: profile.name || 'Propriétaire',
      phone: profile.phone || '',
      email: profile.email,
      roleId: OWNER_ROLE_ID,
      active: true,
      createdAt: now,
      updatedAt: now,
    })
  );
}

/** Throws unless the caller holds the permission. */
export async function requirePermission(
  user: AuthUser | undefined,
  required: Permission
): Promise<Grant> {
  if (!user) throw new AuthorizationError('Not allowed');

  const grant = await resolveGrant(user);
  if (grant.isOwner || grant.permissions.includes(required)) return grant;

  throw new AuthorizationError(`Not allowed: ${required}`);
}
