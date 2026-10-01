import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DataType } from '@libs/enums';
import { Builder } from './builder/Builder';
import { PaginatedResult } from './builder/types';

export abstract class Repository<T> {
  /** Singleton DynamoDB client — shared across all Lambda invocations. */
  private static documentClient: DynamoDBDocumentClient;

  protected abstract dataType: DataType;
  protected abstract tableName: string;
  protected abstract getEntity(attr: Record<string, any>): T;

  protected get client(): DynamoDBDocumentClient {
    if (!Repository.documentClient) {
      const ddb = new DynamoDBClient({});
      Repository.documentClient = DynamoDBDocumentClient.from(ddb, {
        marshallOptions: { removeUndefinedValues: true },
      });
    }
    return Repository.documentClient;
  }

  protected builder(): Builder {
    return new Builder(this.client, this.tableName);
  }

  async find(key: Record<string, any>): Promise<T | null> {
    const item = await this.builder().find(key).execute();
    return item ? this.getEntity(item) : null;
  }

  async findById(id: string, sk: string): Promise<T | null> {
    return this.find({ id, sk });
  }

  async create(entity: {
    valueOf(): Partial<any>;
  }): Promise<void> {
    await this.builder()
      .create(entity.valueOf() as Record<string, any>)
      .execute();
  }

  async update(entity: {
    getKey(): Record<string, any>;
    getDirty(): Partial<any>;
  }): Promise<Record<string, any>> {
    const dirty = entity.getDirty() as Record<string, any>;
    return this.builder()
      .update(entity.getKey())
      .setMany(dirty)
      .execute();
  }

  async delete(id: string, sk: string): Promise<void> {
    await this.builder().delete({ id, sk }).execute();
  }

  async batchFindById(keys: Array<{ id: string; sk: string }>): Promise<T[]> {
    const items = await this.builder().batchFind().addKeys(keys).execute();
    return items.map((item) => this.getEntity(item));
  }
}
