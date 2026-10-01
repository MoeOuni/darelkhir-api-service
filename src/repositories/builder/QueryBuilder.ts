import {
  DynamoDBDocumentClient,
  QueryCommand,
  QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { AttributeNames } from './AttributeNames';
import { AttributeValues } from './AttributeValues';
import { FilterExpression } from './FilterExpression';
import { RetryHandler } from './RetryHandler';
import { Operator, PaginatedResult } from './types';

export class QueryBuilder {
  private names = new AttributeNames();
  private vals = new AttributeValues();
  private keyConditions: string[] = [];
  private filterExpr = new FilterExpression();
  private projectionAttributes: string[] = [];
  private input: Partial<QueryCommandInput> = {};

  constructor(
    private client: DynamoDBDocumentClient,
    private tableName: string
  ) {
    this.input.TableName = tableName;
  }

  setIndex(indexName: string): this {
    this.input.IndexName = indexName;
    return this;
  }

  query(attribute: string, operator: Operator, value: any): this {
    const namePh = this.names.add(attribute);
    switch (operator) {
      case 'begins_with':
        this.keyConditions.push(`begins_with(${namePh}, ${this.vals.add(value)})`);
        break;
      case 'between':
        this.keyConditions.push(
          `${namePh} BETWEEN ${this.vals.add(value[0])} AND ${this.vals.add(value[1])}`
        );
        break;
      default:
        this.keyConditions.push(`${namePh} ${operator} ${this.vals.add(value)}`);
    }
    return this;
  }

  filter(attribute: string, operator: Operator, value: any): this {
    this.filterExpr.add(attribute, operator, value, this.names, this.vals, 'AND');
    return this;
  }

  orFilter(attribute: string, operator: Operator, value: any): this {
    this.filterExpr.add(attribute, operator, value, this.names, this.vals, 'OR');
    return this;
  }

  /** Adds `(contains(attr1, val) OR contains(attr2, val) OR ...)` as a single AND condition.
   * Supports dot-notation for nested attributes: 'name.fr' → #name.#fr
   */
  filterContainsOr(attributes: string[], value: any): this {
    const valPh = this.vals.add(value);
    const parts = attributes.map((attr) => {
      const path = attr.split('.').map((segment) => this.names.add(segment)).join('.');
      return `contains(${path}, ${valPh})`;
    });
    const expr = parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`;
    this.filterExpr.addRaw(expr, 'AND');
    return this;
  }

  /** Combines multiple (attrs, value) groups into a single OR — useful for case-insensitive
   * search where you want: (contains(searchKey, lower) OR contains(name.fr, orig) OR ...)
   */
  filterContainsOrGroups(groups: Array<{ attrs: string[]; value: any }>): this {
    const allParts = groups.flatMap(({ attrs, value }) => {
      const valPh = this.vals.add(value);
      return attrs.map((attr) => {
        const path = attr.split('.').map((segment) => this.names.add(segment)).join('.');
        return `contains(${path}, ${valPh})`;
      });
    });
    const expr = allParts.length === 1 ? allParts[0] : `(${allParts.join(' OR ')})`;
    this.filterExpr.addRaw(expr, 'AND');
    return this;
  }

  setColumns(columns: string[]): this {
    this.projectionAttributes = columns;
    return this;
  }

  setLimit(limit: number): this {
    this.input.Limit = limit;
    return this;
  }

  setCursor(cursor: string | undefined): this {
    if (cursor) {
      try {
        this.input.ExclusiveStartKey = JSON.parse(
          Buffer.from(cursor, 'base64').toString('utf-8')
        );
      } catch {
        // Invalid cursor — ignore and start from beginning
      }
    }
    return this;
  }

  orderReverse(): this {
    this.input.ScanIndexForward = false;
    return this;
  }

  async execute(): Promise<PaginatedResult<Record<string, any>>> {
    const filterExpression = this.filterExpr.build();

    const commandInput: QueryCommandInput = {
      ...this.input,
      TableName: this.tableName,
      KeyConditionExpression: this.keyConditions.join(' AND '),
      ExpressionAttributeNames: this.names.toObject(),
      ExpressionAttributeValues: this.vals.toObject(),
      ...(filterExpression && { FilterExpression: filterExpression }),
    };

    if (this.projectionAttributes.length > 0) {
      commandInput.ProjectionExpression = this.projectionAttributes
        .map((c) => this.names.add(c))
        .join(', ');
    }

    const result = await RetryHandler.withRetry(() =>
      this.client.send(new QueryCommand(commandInput))
    );

    const cursor = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined;

    return {
      items: result.Items || [],
      cursor,
      count: result.Count || 0,
    };
  }
}
