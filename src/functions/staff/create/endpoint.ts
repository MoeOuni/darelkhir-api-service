import { Context } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  UsernameExistsException,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { CreateStaffSchema, type CreateStaffInput } from '@/schemas/staff.schema';
import { StaffRepository } from '@/repositories/StaffRepository';
import { RoleRepository } from '@/repositories/RoleRepository';
import { StaffEntity } from '@/entities/StaffEntity';
import { DataType } from '@libs/enums';
import { ValidationError } from '@libs/errors';
import { normalizePhone } from '@libs/phone';
import { isOwnerRole } from '@libs/permissions';
import { invalidateGrantCache } from '@libs/auth/authorize';

const cognitoClient = new CognitoIdentityProviderClient({});

/**
 * Creates a staff account: the Cognito login and the staff record together.
 *
 * Both halves are needed. A Cognito user with no staff record cannot do
 * anything, and a staff record with no Cognito user cannot sign in.
 */
const createStaffHandler = async (event: ExtendedEvent, _context: Context) => {
  const { name, phone, password, roleId, email } = event.body as CreateStaffInput;
  const userPoolId = process.env.COGNITO_USER_POOL_ID!;

  const username = normalizePhone(phone);
  if (!username) {
    throw new ValidationError('Invalid phone number');
  }

  // The role has to exist, or the account would be created unusable.
  if (!isOwnerRole(roleId)) {
    const role = await new RoleRepository().findByRoleId(roleId);
    if (!role) throw new ValidationError(`Role not found: ${roleId}`);
  }

  try {
    await cognitoClient.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: username }));
    throw new ValidationError('An account with this phone number already exists');
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    if (!(err instanceof UserNotFoundException)) throw err;
  }

  let sub = '';
  try {
    const created = await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: username,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'phone_number', Value: username },
          { Name: 'phone_number_verified', Value: 'true' },
          { Name: 'name', Value: name },
          ...(email ? [{ Name: 'email', Value: email }] : []),
        ],
      })
    );

    // Without a permanent password the account sits in FORCE_CHANGE_PASSWORD
    // and the worker cannot sign in.
    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: username,
        Password: password,
        Permanent: true,
      })
    );

    sub = created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value ?? '';
  } catch (err) {
    if (err instanceof UsernameExistsException) {
      throw new ValidationError('An account with this phone number already exists');
    }
    throw err;
  }

  if (!sub) throw new ValidationError('Could not create the account');

  const now = new Date().toISOString();
  await new StaffRepository().create(
    new StaffEntity({
      id: DataType.STAFF,
      sk: `${DataType.STAFF}#${sub}`,
      dataType: DataType.STAFF,
      sub,
      name,
      phone: username,
      email,
      roleId,
      active: true,
      createdAt: now,
      updatedAt: now,
    })
  );

  invalidateGrantCache(sub);

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: 'Staff account created',
      data: { id: sub, sub, name, phone: username, roleId, active: true },
    }),
  };
};

export const handler = middleware({
  auth: true,
  requires: 'staff.manage',
  audit: { action: 'staff.create', entityType: 'staff' },
  cors: true,
  validation: { body: CreateStaffSchema },
})(createStaffHandler);
