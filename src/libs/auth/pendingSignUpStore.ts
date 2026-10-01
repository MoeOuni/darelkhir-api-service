import { randomInt, createHash } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getConfig } from '@libs/config';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const OTP_PARTITION = 'CLIENT_OTP';
const OTP_TTL_MINUTES = 15;

export type PendingSignUp = {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  password: string;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
  ttl: number;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function makeSortKey(email: string) {
  return `${OTP_PARTITION}#${normalizeEmail(email)}`;
}

export function hashOtpCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export function generateOtpCode() {
  return String(randomInt(100000, 1000000));
}

export async function savePendingSignUp(input: {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  password: string;
  code: string;
}) {
  const now = new Date();
  const expires = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

  const item: PendingSignUp & { id: string; sk: string; sihk: string } = {
    id: OTP_PARTITION,
    sk: makeSortKey(input.email),
    sihk: now.toISOString(),
    email: normalizeEmail(input.email),
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    password: input.password,
    codeHash: hashOtpCode(input.code),
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    ttl: Math.floor(expires.getTime() / 1000),
  };

  await docClient.send(
    new PutCommand({
      TableName: getConfig().clientsTableName,
      Item: item,
    }),
  );

  return {
    expiresInMinutes: OTP_TTL_MINUTES,
  };
}

export async function getPendingSignUp(email: string): Promise<PendingSignUp | null> {
  const response = await docClient.send(
    new GetCommand({
      TableName: getConfig().clientsTableName,
      Key: {
        id: OTP_PARTITION,
        sk: makeSortKey(email),
      },
    }),
  );

  if (!response.Item) return null;

  return response.Item as PendingSignUp;
}

export async function deletePendingSignUp(email: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: getConfig().clientsTableName,
      Key: {
        id: OTP_PARTITION,
        sk: makeSortKey(email),
      },
    }),
  );
}
