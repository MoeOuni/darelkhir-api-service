import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { RetryHandler } from './RetryHandler';

export class BatchFindBuilder {
  private keys: Record<string, any>[] = [];

  constructor(
    private client: DynamoDBDocumentClient,
    private tableName: string
  ) {}

  addKey(key: Record<string, any>): this {
    this.keys.push(key);
    return this;
  }

  addKeys(keys: Record<string, any>[]): this {
    this.keys.push(...keys);
    return this;
  }

  async execute(): Promise<Record<string, any>[]> {
    if (this.keys.length === 0) return [];

    const result = await RetryHandler.withRetry(() =>
      this.client.send(
        new BatchGetCommand({
          RequestItems: {
            [this.tableName]: { Keys: this.keys },
          },
        })
      )
    );

    return result.Responses?.[this.tableName] || [];
  }
}
