import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});
const secretCache = new Map<string, unknown>();

export async function getJsonSecret<T>(secretName: string): Promise<T> {
  if (secretCache.has(secretName)) {
    return secretCache.get(secretName) as T;
  }

  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretName }),
  );

  if (!response.SecretString) {
    throw new Error(`Secret ${secretName} does not contain a SecretString`);
  }

  const parsed = JSON.parse(response.SecretString) as T;
  secretCache.set(secretName, parsed);
  return parsed;
}