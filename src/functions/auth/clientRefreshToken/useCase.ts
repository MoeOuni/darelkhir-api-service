import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  NotAuthorizedException,
} from '@aws-sdk/client-cognito-identity-provider';
import { Context } from 'aws-lambda';
import { ExtendedEvent } from '@libs/middleware';
import { AuthenticationError } from '@libs/errors';
import type { RefreshTokenInput } from '@/schemas/auth.schema';

const cognitoClient = new CognitoIdentityProviderClient({});

export async function clientRefreshTokenHandler(event: ExtendedEvent, _context: Context) {
  const { refreshToken } = event.body as RefreshTokenInput;

  let result;
  try {
    const response = await cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: process.env.CLIENTS_USER_POOL_CLIENT_ID!,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
        },
      }),
    );
    result = response.AuthenticationResult;
  } catch (err) {
    if (err instanceof NotAuthorizedException) {
      throw new AuthenticationError('Refresh token is invalid or expired');
    }
    throw err;
  }

  if (!result) {
    throw new AuthenticationError('Token refresh failed');
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      accessToken: result.AccessToken,
      idToken: result.IdToken,
      expiresIn: result.ExpiresIn,
    }),
  };
}
