import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { RetryHandler } from './RetryHandler';
import { ConditionalCheckFailedError } from './errors';

export class CreateBuilder {
  constructor(
    private client: DynamoDBDocumentClient,
    private tableName: string,
    private attributes: Record<string, any>
  ) {}

  async execute(): Promise<void> {
    try {
      await RetryHandler.withRetry(() =>
        this.client.send(
          new PutCommand({
            TableName: this.tableName,
            Item: this.attributes,
            // Prevent overwriting an existing item with the same sk
            ConditionExpression: 'attribute_not_exists(#sk)',
            ExpressionAttributeNames: { '#sk': 'sk' },
          })
        )
      );
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new ConditionalCheckFailedError('Item already exists');
      }
      throw error;
    }
  }
}
