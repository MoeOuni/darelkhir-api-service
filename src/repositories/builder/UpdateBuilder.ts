import { DynamoDBDocumentClient, UpdateCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import { AttributeNames } from './AttributeNames';
import { AttributeValues } from './AttributeValues';
import { RetryHandler } from './RetryHandler';

export class UpdateBuilder {
  private names = new AttributeNames();
  private vals = new AttributeValues();
  private setClauses: string[] = [];
  private removeClauses: string[] = [];
  private conditionExpressions: string[] = [];

  constructor(
    private client: DynamoDBDocumentClient,
    private tableName: string,
    private key: Record<string, any>
  ) {}

  set(attribute: string, value: any): this {
    // DynamoDB has no undefined. A field set to undefined means "this has no
    // value any more", which is a REMOVE. Written as a SET it produced an
    // expression referencing a value the document client then dropped, and the
    // whole update failed with "expression attribute value :valN is not
    // defined" — taking the rest of the update down with it.
    if (value === undefined) return this.remove(attribute);

    const namePh = this.names.add(attribute);
    const valPh = this.vals.add(value);
    this.setClauses.push(`${namePh} = ${valPh}`);
    return this;
  }

  /** Atomic numeric increment (use negative delta to decrement). */
  increment(attribute: string, delta: number): this {
    const namePh = this.names.add(attribute);
    const valPh = this.vals.add(delta);
    this.setClauses.push(`${namePh} = ${namePh} + ${valPh}`);
    return this;
  }

  setMany(attributes: Record<string, any>): this {
    Object.entries(attributes).forEach(([k, v]) => this.set(k, v));
    return this;
  }

  remove(attribute: string): this {
    const namePh = this.names.add(attribute);
    this.removeClauses.push(namePh);
    return this;
  }

  condition(expression: string): this {
    this.conditionExpressions.push(expression);
    return this;
  }

  async execute(): Promise<Record<string, any>> {
    if (this.setClauses.length === 0 && this.removeClauses.length === 0) {
      throw new Error('UpdateBuilder: no fields to update');
    }

    const parts: string[] = [];
    if (this.setClauses.length > 0) parts.push(`SET ${this.setClauses.join(', ')}`);
    if (this.removeClauses.length > 0) parts.push(`REMOVE ${this.removeClauses.join(', ')}`);

    const input: UpdateCommandInput = {
      TableName: this.tableName,
      Key: this.key,
      UpdateExpression: parts.join(' '),
      ExpressionAttributeNames: this.names.toObject(),
      ExpressionAttributeValues: this.vals.toObject(),
      ReturnValues: 'ALL_NEW',
    };

    if (this.conditionExpressions.length > 0) {
      input.ConditionExpression = this.conditionExpressions.join(' AND ');
    }

    const result = await RetryHandler.withRetry(() =>
      this.client.send(new UpdateCommand(input))
    );
    return result.Attributes || {};
  }
}
