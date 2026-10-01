import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { ClientRepository } from '@/repositories/ClientRepository';
import { ClientEntity } from '@/entities/ClientEntity';
import { DataType } from '@libs/enums';
import { CreateClientInput } from '@/schemas/client.schema';
import { getConfig } from '@libs/config';
import { IdGenerator } from '@/utils/IdGenerator';

interface CreateClientResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

const cognito = new CognitoIdentityProviderClient({});

/**
 * Cognito insists on a given name and a family name; we keep one whole name.
 *
 * The last word is the family name and the rest is the given name, which is
 * how these read here. Only Cognito ever sees the split — everything of ours
 * uses `fullName`.
 */
function given(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(0, -1).join(' ') : fullName.trim();
}

function family(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : fullName.trim();
}

/** Cognito only accepts a phone_number in E.164 form, for example +21620000000. */
function isE164(phone?: string): boolean {
  return !!phone && /^\+[1-9]\d{7,14}$/.test(phone.replace(/\s/g, ''));
}

/** Generates a secure random password that always satisfies the pool policy */
function generatePassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const all = upper + lower + digits;
  const rand = (set: string) => set[Math.floor(Math.random() * set.length)];
  const base = Array.from({ length: 6 }, () => rand(all)).join('');
  // Guarantee at least one of each required class
  return rand(upper) + rand(lower) + rand(digits) + base;
}

export class CreateClientUseCase {
  constructor(private repository: ClientRepository) {}

  async execute(data: CreateClientInput): Promise<CreateClientResult> {
    const config = getConfig();
    const now = new Date().toISOString();

    // A Cognito account only exists so the client can sign in to the shop
    // website, and that needs an email address. A walk-in client recorded at
    // the counter gets a profile with no account and no invite email.
    let clientId: string;
    let temporaryPassword: string | undefined;

    if (data.email) {
      const password = generatePassword();

      // Cognito sends the invite email with the temporary password.
      const createResp = await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: config.clientsUserPoolId,
          Username: data.email,
          TemporaryPassword: password,
          DesiredDeliveryMediums: ['EMAIL'],
          UserAttributes: [
            { Name: 'email',          Value: data.email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'given_name',     Value: given(data.fullName ?? '') },
            { Name: 'family_name',    Value: family(data.fullName ?? '') },
            // Cognito rejects a phone_number that is not E.164, which would
            // fail the whole creation. Send it only when it looks right.
            ...(isE164(data.phone) ? [{ Name: 'phone_number', Value: data.phone }] : []),
          ],
        })
      );

      const sub = createResp.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
      if (!sub) throw new Error('Cognito did not return user sub');

      // Make the password permanent so the client is immediately active
      // (no FORCE_CHANGE_PASSWORD challenge)
      await cognito.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: config.clientsUserPoolId,
          Username: data.email,
          Password: password,
          Permanent: true,
        })
      );

      clientId = sub;
      temporaryPassword = password;
    } else {
      clientId = IdGenerator.generate();
    }

    // Persist the profile in DynamoDB, keyed by the Cognito sub when there is
    // one, and by a generated id otherwise.
    const entity = new ClientEntity({
      id: DataType.CLIENT,
      sk: `${DataType.CLIENT}#${clientId}`,
      dataType: DataType.CLIENT,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      cin: data.cin,
      taxId: data.taxId,
      addresses: data.addresses ?? [],
      createdAt: now,
      updatedAt: now,
    });

    await this.repository.create(entity);

    return {
      success: true,
      message: 'Client created successfully',
      data: { ...entity.toPublicDTO(), id: clientId, temporaryPassword },
    };
  }
}
