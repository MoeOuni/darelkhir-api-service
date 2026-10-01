import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
  NotAuthorizedException,
  UserNotFoundException,
  UserNotConfirmedException,
} from '@aws-sdk/client-cognito-identity-provider';
import { Context } from 'aws-lambda';
import { ExtendedEvent } from '@libs/middleware';
import { AuthenticationError } from '@libs/errors';
import { normalizePhone } from '@libs/phone';
import type { SignInInput } from '@/schemas/auth.schema';

const cognitoClient = new CognitoIdentityProviderClient({});

/** Shop customer sign-in with a phone number and a password. */
export async function clientSignInHandler(event: ExtendedEvent, _context: Context) {
  const { phone, password } = event.body as SignInInput;
  const userPoolId = process.env.CLIENTS_USER_POOL_ID!;

  // The pool uses phone_number as its username attribute, so the normalized
  // number is the username. Nothing has to be looked up.
  const username = normalizePhone(phone);
  if (!username) {
    throw new AuthenticationError('Invalid phone number or password');
  }

  let result;
  try {
    const response = await cognitoClient.send(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: process.env.CLIENTS_USER_POOL_CLIENT_ID!,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
        },
      }),
    );
    result = response.AuthenticationResult;
  } catch (err) {
    if (err instanceof NotAuthorizedException || err instanceof UserNotFoundException) {
      throw new AuthenticationError('Invalid phone number or password');
    }
    if (err instanceof UserNotConfirmedException) {
      throw new AuthenticationError('Please verify your account before signing in');
    }
    throw err;
  }

  if (!result) {
    throw new AuthenticationError('Authentication failed');
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      accessToken: result.AccessToken,
      idToken: result.IdToken,
      refreshToken: result.RefreshToken,
      expiresIn: result.ExpiresIn,
    }),
  };
}
