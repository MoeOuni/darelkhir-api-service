import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getConfig } from '@libs/config';
import { DataType } from '@libs/enums';
import type { ReportSource, Row } from './compute';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Every row of a table, all pages.
 *
 * A full read on purpose: the report is about everything the shop has ever
 * recorded, and a page cut off at the first megabyte would leave out sales or
 * stock movements without saying so.
 */
async function scanAll(TableName: string, dataType?: string): Promise<Row[]> {
  const rows: Row[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const page = await doc.send(new ScanCommand({
      TableName, ExclusiveStartKey,
      ...(dataType ? { FilterExpression: '#t = :t', ExpressionAttributeNames: { '#t': 'dataType' }, ExpressionAttributeValues: { ':t': dataType } } : {}),
    }));
    rows.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return rows;
}

export async function loadReportSource(investment: number, generatedAt: string): Promise<ReportSource> {
  const c = getConfig();
  const [products, categories, orders, payments, movements, clients] = await Promise.all([
    scanAll(c.productsTableName, DataType.PRODUCT),
    scanAll(c.categoriesTableName, DataType.CATEGORY),
    scanAll(c.ordersTableName, DataType.ORDER),
    scanAll(c.paymentsTableName, DataType.PAYMENT),
    scanAll(c.journalTableName, DataType.STOCK_MOVEMENT),
    scanAll(c.clientsTableName),
  ]);
  return {
    generatedAt, investment, products, categories, orders, payments, movements,
    clients: clients.filter((r) => r.dataType === DataType.CLIENT),
    agreedPrices: clients.filter((r) => r.dataType === DataType.CLIENT_PRICE).length,
  };
}

/** The time in Tunisia, as a local ISO string — the date the report is "as of". */
export function tunisNow(now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
