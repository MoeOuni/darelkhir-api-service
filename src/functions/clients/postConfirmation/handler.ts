import {
  CognitoUserPoolTriggerEvent,
} from 'aws-lambda';
import { ClientRepository } from '@/repositories/ClientRepository';
import { ClientEntity } from '@/entities/ClientEntity';
import { DataType } from '@libs/enums';

const repository = new ClientRepository();

/**
 * Cognito PostConfirmation trigger — fires after a user confirms their
 * account via OTP (self-registration from the shop front office).
 * Creates the DynamoDB client profile and (TODO) sends a welcome email.
 */
export const handler = async (event: CognitoUserPoolTriggerEvent) => {
  // Only act on the ConfirmSignUp trigger source
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') {
    return event;
  }

  const { sub, email, given_name, family_name, phone_number } = event.request.userAttributes;
  const now = new Date().toISOString();

  // Upsert the profile (may already exist if admin pre-created it)
  const existing = await repository.findBySub(sub);
  if (!existing) {
    const entity = new ClientEntity({
      id: DataType.CLIENT,
      sk: `${DataType.CLIENT}#${sub}`,
      dataType: DataType.CLIENT,
      fullName: [given_name, family_name].filter(Boolean).join(' ').trim(),
      email: email ?? '',
      phone: phone_number ?? '',
      addresses: [],
      createdAt: now,
      updatedAt: now,
    });
    await repository.create(entity);
  }

  // TODO: Send welcome email via SES

  return event;
};
