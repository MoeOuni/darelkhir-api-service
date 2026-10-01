import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  UsernameExistsException,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { Context } from 'aws-lambda';
import { ExtendedEvent } from '@libs/middleware';
import { AuthenticationError, ValidationError } from '@libs/errors';
import { ClientRepository } from '@/repositories/ClientRepository';
import { ClientEntity } from '@/entities/ClientEntity';
import { DataType } from '@libs/enums';
import { normalizePhone } from '@libs/phone';
import type { ClientSignUpInput } from '@/schemas/auth.schema';

const cognitoClient = new CognitoIdentityProviderClient({});
const clientRepository = new ClientRepository();

/**
 * Registers a shop customer with a phone number and a password.
 *
 * There is no verification code. The pool uses phone_number as its username,
 * and verifying a phone number means sending an SMS, which needs a paid
 * origination identity. The number is marked verified at creation so the
 * customer can sign in straight away.
 */
export async function clientSignUpHandler(event: ExtendedEvent, _context: Context) {
  const { phone, password, firstName, lastName, email } = event.body as ClientSignUpInput;

  const username = normalizePhone(phone);
  if (!username) {
    throw new ValidationError('Invalid phone number');
  }

  const userPoolId = process.env.CLIENTS_USER_POOL_ID!;

  // Reject an existing account early.
  try {
    await cognitoClient.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: username })
    );
    throw new AuthenticationError('An account with this phone number already exists');
  } catch (err) {
    if (err instanceof AuthenticationError) throw err;
    if (!(err instanceof UserNotFoundException)) throw err;
  }

  let sub = '';
  try {
    const created = await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: username,
        // SUPPRESS stops Cognito sending an invitation message.
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'phone_number', Value: username },
          { Name: 'phone_number_verified', Value: 'true' },
          { Name: 'given_name', Value: firstName },
          { Name: 'family_name', Value: lastName },
          ...(email ? [{ Name: 'email', Value: email }] : []),
        ],
      })
    );

    // A created user sits in FORCE_CHANGE_PASSWORD until the password is set as
    // permanent. Without this the customer cannot sign in.
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
      throw new AuthenticationError('An account with this phone number already exists');
    }
    throw err;
  }

  if (!sub) {
    throw new ValidationError('Could not create the account');
  }

  // The client record is keyed by the Cognito sub, which is what every order
  // references.
  const existing = await clientRepository.findBySub(sub);
  if (!existing) {
    const now = new Date().toISOString();
    await clientRepository.create(
      new ClientEntity({
        id: DataType.CLIENT,
        sk: `${DataType.CLIENT}#${sub}`,
        dataType: DataType.CLIENT,
        fullName: [firstName, lastName].filter(Boolean).join(' ').trim(),
        email: email ?? '',
        phone: username,
        addresses: [],
        createdAt: now,
        updatedAt: now,
      })
    );
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Account created', id: sub }),
  };
}
