import { DataType, OrderStatus } from '@libs/enums';
import { getConfig } from '@libs/config';
import { GSI_PARENT_RESOURCE, GSI_RESOURCE_CREATED, GSI_STATUS_CREATED } from '@libs/constants';
import { Repository } from './Repository';
import { OrderEntity } from '@/entities/OrderEntity';
import { PaginatedResult } from './builder/types';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const dynamo = new DynamoDBClient({});

export class OrderRepository extends Repository<OrderEntity> {
  protected dataType = DataType.ORDER;
  protected tableName = getConfig().ordersTableName;

  protected getEntity(attr: Record<string, any>): OrderEntity {
    return new OrderEntity(attr);
  }

  /** Atomically increments the order counter and returns the new sequential number. */
  async incrementCounter(): Promise<number> {
    const result = await dynamo.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: { id: { S: 'COUNTER' }, sk: { S: 'ORDER' } },
        UpdateExpression: 'ADD orderCount :inc',
        ExpressionAttributeValues: { ':inc': { N: '1' } },
        ReturnValues: 'UPDATED_NEW',
      })
    );
    return parseInt(result.Attributes!.orderCount.N!);
  }

  /**
   * Takes the next fiscal invoice number.
   *
   * Separate from the order number on purpose. The order number is taken when
   * an order is created, so abandoned and cancelled orders burn one. A tax book
   * cannot have holes, so this only moves when an invoice is actually issued.
   *
   * The counter starts at zero, so the first invoice is 1. To begin a sequence
   * partway through — continuing from a paper book, say — set the counter once
   * with `scripts/set-invoice-counter.js`.
   *
   * It deliberately does NOT derive a starting point from the order counter.
   * That was tried and it was wrong: the order counter moves, so after the
   * database was cleared the first invoice came out as 2 rather than 1.
   */
  async incrementInvoiceCounter(): Promise<number> {
    const result = await dynamo.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: { id: { S: 'COUNTER' }, sk: { S: 'INVOICE' } },
        UpdateExpression: 'ADD invoiceCount :inc',
        ExpressionAttributeValues: { ':inc': { N: '1' } },
        ReturnValues: 'UPDATED_NEW',
      })
    );
    return parseInt(result.Attributes!.invoiceCount.N!);
  }

  /** Credit notes have their own gapless sequence, printed as AV-001. */
  async incrementCreditNoteCounter(): Promise<number> {
    const result = await dynamo.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: { id: { S: 'COUNTER' }, sk: { S: 'CREDIT_NOTE' } },
        UpdateExpression: 'ADD creditNoteCount :inc',
        ExpressionAttributeValues: { ':inc': { N: '1' } },
        ReturnValues: 'UPDATED_NEW',
      })
    );
    return parseInt(result.Attributes!.creditNoteCount.N!);
  }

  async findByUuid(uuid: string): Promise<OrderEntity | null> {
    return this.findById(DataType.ORDER, `${DataType.ORDER}#${uuid}`);
  }

  async deleteByUuid(uuid: string): Promise<void> {
    return this.delete(DataType.ORDER, `${DataType.ORDER}#${uuid}`);
  }

  async listAll(
    cursor?: string,
    limit = 20,
    status?: OrderStatus,
    search?: string,
    sort?: 'date_asc' | 'date_desc'
  ): Promise<PaginatedResult<OrderEntity>> {
    const asc = sort === 'date_asc';

    // Text search: contains() can't use any index — use main table
    if (search) {
      const q = this.builder().query().query('id', '=', DataType.ORDER).setCursor(cursor).setLimit(limit);
      if (!asc) q.orderReverse();
      if (status) q.filter('status', '=', status);
      q.filter('searchKey', 'contains', search.toLowerCase());
      const result = await q.execute();
      return { ...result, items: result.items.map((i) => this.getEntity(i)) };
    }

    // Status filter: use gsi-status-created (sehk = "status#createdAt")
    if (status) {
      const q = this.builder().query().setIndex(GSI_STATUS_CREATED)
        .query('dataType', '=', DataType.ORDER)
        .query('sehk', 'begins_with', `${status}#`)
        .setCursor(cursor).setLimit(limit);
      if (!asc) q.orderReverse();
      const result = await q.execute();
      return { ...result, items: result.items.map((i) => this.getEntity(i)) };
    }

    // No filters: use gsi-resource-created for true chronological order
    const q = this.builder().query().setIndex(GSI_RESOURCE_CREATED)
      .query('dataType', '=', DataType.ORDER)
      .setCursor(cursor).setLimit(limit);
    if (!asc) q.orderReverse();
    const result = await q.execute();
    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }

  async listByCustomer(
    customerId: string,
    cursor?: string,
    limit = 20
  ): Promise<PaginatedResult<OrderEntity>> {
    const result = await this.builder()
      .query()
      .setIndex(GSI_PARENT_RESOURCE)
      .query('fk', '=', customerId)
      .setCursor(cursor)
      .setLimit(limit)
      .orderReverse()
      .execute();

    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }

  /**
   * Every order, all pages.
   *
   * Reports need the whole set, not one page. Fine at this scale — revisit if
   * the shop ever passes a few thousand orders.
   */
  async listEveryOrder(): Promise<OrderEntity[]> {
    const items: OrderEntity[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.listAll(cursor, 100);
      items.push(...page.items);
      cursor = page.cursor;
    } while (cursor);

    return items;
  }

  /**
   * Every order of one client, across all pages.
   *
   * The client balance is recomputed from these, so a single page is not
   * enough — a long-standing client would otherwise show the wrong debt.
   */
  async listAllByCustomer(customerId: string): Promise<OrderEntity[]> {
    const items: OrderEntity[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.listByCustomer(customerId, cursor, 100);
      items.push(...page.items);
      cursor = page.cursor;
    } while (cursor);

    return items;
  }

  async listByCreatedDate(
    cursor?: string,
    limit = 20
  ): Promise<PaginatedResult<OrderEntity>> {
    const result = await this.builder()
      .query()
      .setIndex(GSI_RESOURCE_CREATED)
      .query('dataType', '=', DataType.ORDER)
      .setCursor(cursor)
      .setLimit(limit)
      .orderReverse()
      .execute();

    return { ...result, items: result.items.map((i) => this.getEntity(i)) };
  }
}
