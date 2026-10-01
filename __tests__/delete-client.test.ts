const send = jest.fn();

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({ send })),
  AdminDisableUserCommand: jest.fn((input) => ({ input })),
}));

import { DeleteClientUseCase } from '../src/functions/clients/delete/useCase';

/**
 * Deleting a client who never had a login.
 *
 * Most clients here are walk-in buyers, and everyone carried over from the
 * notebook is a name and an amount — no email, so no shop account. Asking
 * Cognito to disable an empty username failed the whole request with "Value at
 * 'username' failed to satisfy constraint: Member must not be null", and the
 * client stayed on screen undeleted.
 */
function repositoryFor(client: Record<string, unknown> | null) {
  return {
    findBySub: jest.fn(async () => client),
    deleteBySub: jest.fn(async () => undefined),
  } as any;
}

describe('DeleteClientUseCase', () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({});
    process.env.CLIENTS_USER_POOL_ID = 'us-east-1_test';
  });

  it('removes a client who has no shop account without calling Cognito', async () => {
    const repository = repositoryFor({ firstName: 'Mokhtar', lastName: 'jdid' });

    await new DeleteClientUseCase(repository).execute('sub-1');

    expect(send).not.toHaveBeenCalled();
    expect(repository.deleteBySub).toHaveBeenCalledWith('sub-1');
  });

  it('disables the account of a client who has one', async () => {
    const repository = repositoryFor({ email: 'client@exemple.com' });

    await new DeleteClientUseCase(repository).execute('sub-2');

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input.Username).toBe('client@exemple.com');
    expect(repository.deleteBySub).toHaveBeenCalledWith('sub-2');
  });

  it('still removes the profile when the login is already gone', async () => {
    const repository = repositoryFor({ email: 'client@exemple.com' });
    send.mockRejectedValue(Object.assign(new Error('no such user'), {
      name: 'UserNotFoundException',
    }));

    await new DeleteClientUseCase(repository).execute('sub-3');

    expect(repository.deleteBySub).toHaveBeenCalledWith('sub-3');
  });

  /** Anything else is a real failure and must not pass silently. */
  it('gives up when Cognito refuses for any other reason', async () => {
    const repository = repositoryFor({ email: 'client@exemple.com' });
    send.mockRejectedValue(Object.assign(new Error('denied'), {
      name: 'NotAuthorizedException',
    }));

    await expect(new DeleteClientUseCase(repository).execute('sub-4')).rejects.toThrow('denied');
    expect(repository.deleteBySub).not.toHaveBeenCalled();
  });
});
