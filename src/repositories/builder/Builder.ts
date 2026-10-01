import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { FindBuilder } from './FindBuilder';
import { CreateBuilder } from './CreateBuilder';
import { UpdateBuilder } from './UpdateBuilder';
import { DeleteBuilder } from './DeleteBuilder';
import { QueryBuilder } from './QueryBuilder';
import { BatchFindBuilder } from './BatchFindBuilder';

export class Builder {
  constructor(
    private client: DynamoDBDocumentClient,
    private tableName: string
  ) {}

  find(key: Record<string, any>): FindBuilder {
    return new FindBuilder(this.client, this.tableName, key);
  }

  create(attributes: Record<string, any>): CreateBuilder {
    return new CreateBuilder(this.client, this.tableName, attributes);
  }

  update(key: Record<string, any>): UpdateBuilder {
    return new UpdateBuilder(this.client, this.tableName, key);
  }

  delete(key: Record<string, any>): DeleteBuilder {
    return new DeleteBuilder(this.client, this.tableName, key);
  }

  query(): QueryBuilder {
    return new QueryBuilder(this.client, this.tableName);
  }

  batchFind(): BatchFindBuilder {
    return new BatchFindBuilder(this.client, this.tableName);
  }
}
