import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { RetryHandler } from './RetryHandler';

export class DeleteBuilder {
  constructor(
    private client: DynamoDBDocumentClient,
    private tableName: string,
    private key: Record<string, any>
  ) {}

  async execute(): Promise<void> {
    await RetryHandler.withRetry(() =>
      this.client.send(
        new DeleteCommand({ TableName: this.tableName, Key: this.key })
      )
    );
  }
}
