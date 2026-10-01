import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  InvalidPasswordException,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { Context } from 'aws-lambda';
import { ExtendedEvent } from '@libs/middleware';
import { AuthenticationError, ValidationError } from '@libs/errors';
import type { ClientConfirmInput } from '@/schemas/auth.schema';
import { renderWelcomeEmail } from '@libs/email';
import { resolveEmailLocale } from '@libs/email/locale';
import { getDefaultEmailBranding, sendEmail } from '@libs/email/sender';
import { deletePendingSignUp, getPendingSignUp, hashOtpCode } from '@libs/auth/pendingSignUpStore';
import { ClientRepository } from '@/repositories/ClientRepository';
import { ClientEntity } from '@/entities/ClientEntity';
import { DataType } from '@libs/enums';

const cognitoClient = new CognitoIdentityProviderClient({});
const clientRepository = new ClientRepository();

export async function clientConfirmHandler(event: ExtendedEvent, _context: Context) {
  const { email, code } = event.body as ClientConfirmInput;
  const normalizedEmail = email.trim().toLowerCase();

  const pending = await getPendingSignUp(normalizedEmail);
  if (!pending) {
    throw new ValidationError('Verification code has expired — request a new one');
  }

  if (new Date(pending.expiresAt).getTime() < Date.now()) {
    await deletePendingSignUp(normalizedEmail);
    throw new ValidationError('Verification code has expired — request a new one');
  }

  const submittedCodeHash = hashOtpCode(code.trim());
  if (submittedCodeHash !== pending.codeHash) {
    throw new ValidationError('Invalid verification code');
  }

  let sub = '';

  try {
    await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: process.env.CLIENTS_USER_POOL_ID!,
        Username: normalizedEmail,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: normalizedEmail },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'given_name', Value: pending.firstName },
          { Name: 'family_name', Value: pending.lastName },
          ...(pending.phone ? [{ Name: 'phone_number', Value: pending.phone }] : []),
        ],
      }),
    );

    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: process.env.CLIENTS_USER_POOL_ID!,
        Username: normalizedEmail,
        Password: pending.password,
        Permanent: true,
      }),
    );

    const user = await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: process.env.CLIENTS_USER_POOL_ID!,
        Username: normalizedEmail,
      }),
    );

    sub = user.UserAttributes?.find((attr) => attr.Name === 'sub')?.Value ?? '';
  } catch (err) {
    if (err instanceof UsernameExistsException) {
      await deletePendingSignUp(normalizedEmail);
      throw new AuthenticationError('An account with this email already exists');
    }
    if (err instanceof InvalidPasswordException) {
      throw new ValidationError('Password does not meet requirements');
    }
    throw err;
  }

  if (!sub) {
    throw new AuthenticationError('Account verification failed');
  }

  const existing = await clientRepository.findBySub(sub);
  if (!existing) {
    const now = new Date().toISOString();
    const client = new ClientEntity({
      id: DataType.CLIENT,
      sk: `${DataType.CLIENT}#${sub}`,
      dataType: DataType.CLIENT,
      fullName: [pending.firstName, pending.lastName].filter(Boolean).join(' ').trim(),
      email: normalizedEmail,
      phone: pending.phone ?? '',
      addresses: [],
      createdAt: now,
      updatedAt: now,
    });
    await clientRepository.create(client);
  }

  await deletePendingSignUp(normalizedEmail);

  try {
    const locale = resolveEmailLocale(event.headers);
    const branding = await getDefaultEmailBranding();
    const emailContent = renderWelcomeEmail({
      locale,
      customerName: pending.firstName,
      branding,
      accountUrl: branding.websiteUrl,
    });

    await sendEmail({ to: normalizedEmail, email: emailContent });
  } catch (err) {
    event.logger?.warn('Failed to send welcome email after confirmation', {
      email: normalizedEmail,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Account verified successfully' }),
  };
}
