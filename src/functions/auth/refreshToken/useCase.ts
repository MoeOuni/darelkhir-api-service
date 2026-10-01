import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  NotAuthorizedException,
} from '@aws-sdk/client-cognito-identity-provider';
import { Context } from 'aws-lambda';
import { ExtendedEvent } from '@libs/middleware';
import { AuthenticationError } from '@libs/errors';
import type { RefreshTokenInput } from '@/schemas/auth.schema';

const cognitoClient = new CognitoIdentityProviderClient({});

export async function refreshTokenHandler(event: ExtendedEvent, _context: Context) {
  const { refreshToken } = event.body as RefreshTokenInput;

  let result;
  try {
    const response = await cognitoClient.send(
      new AdminInitiateAuthCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID!,
        ClientId: process.env.COGNITO_CLIENT_ID!,
        AuthFlow: 'REFRESH_TOKEN_AUTH',
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
