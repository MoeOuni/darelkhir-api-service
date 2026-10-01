import {
  CognitoIdentityProviderClient,
  AdminDisableUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { ClientRepository } from '@/repositories/ClientRepository';
import { NotFoundError } from '@libs/errors';
import { getConfig } from '@libs/config';

interface DeleteClientResult {
  success: boolean;
  message: string;
  /** Who was removed, so the journal entry can name him. */
  data?: Record<string, unknown>;
}

const cognito = new CognitoIdentityProviderClient({});

export class DeleteClientUseCase {
  constructor(private repository: ClientRepository) {}

  async execute(sub: string): Promise<DeleteClientResult> {
    const entity = await this.repository.findBySub(sub);

    if (!entity) {
      throw new NotFoundError('Client not found');
    }

    // Disable the shop account, when there is one to disable. A walk-in buyer
    // and a name carried over from the notebook never had a login: they have
    // no email, and asking Cognito to disable an empty username fails the
    // whole request — which left the client on screen, undeleted, with
    // "Member must not be null" as the only explanation.
    if (entity.email) {
      // Disabling rather than hard-deleting keeps the history.
      await cognito
        .send(
          new AdminDisableUserCommand({
            UserPoolId: getConfig().clientsUserPoolId,
            Username: entity.email,
          })
        )
        .catch((error: { name?: string }) => {
          // A login that is already gone must not keep the profile alive.
          if (error?.name !== 'UserNotFoundException') throw error;
        });
    }

    // Remove the DynamoDB profile
    await this.repository.deleteBySub(sub);

    // The name travels back so the journal reads "X a supprimé le client Y"
    // rather than an anonymous deletion nobody can trace afterwards.
    return {
      success: true,
      message: 'Client deleted successfully',
      data: {
        id: sub,
        fullName: entity.fullName,
        phone: entity.phone,
      },
    };
  }
}

