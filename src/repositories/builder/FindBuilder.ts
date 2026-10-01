import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { RetryHandler } from './RetryHandler';
import { ResourceNotFoundError } from './errors';

export class FindBuilder {
  constructor(
    private client: DynamoDBDocumentClient,
    private tableName: string,
    private key: Record<string, any>
  ) {}

  async execute(): Promise<Record<string, any> | null> {
    const result = await RetryHandler.withRetry(() =>
      this.client.send(
        new GetCommand({ TableName: this.tableName, Key: this.key })
      )
    );
    return result.Item ?? null;
  }

  async executeOrThrow(): Promise<Record<string, any>> {
    const item = await this.execute();
    if (!item) throw new ResourceNotFoundError();
    return item;
  }
}
