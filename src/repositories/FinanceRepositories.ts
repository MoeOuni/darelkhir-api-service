import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DataType } from '@libs/enums';
import { getConfig } from '@libs/config';
import type { ISupplierDebtPayment } from '@libs/interfaces';
import { Repository } from './Repository';
import { ChargeEntity } from '@/entities/ChargeEntity';
import { SupplierDebtEntity } from '@/entities/SupplierDebtEntity';

abstract class FinanceRepository<T extends { date: string; createdAt: string }> extends Repository<T> {
  protected tableName = getConfig().financeTableName;

  /**
   * Every row of this kind, newest first.
   *
   * Whole, on purpose. A shop writes a few charges a week, the screen totals
   * what it shows, and a list that stopped at a page limit would total the
   * wrong thing without saying so — which has already happened once in this
   * codebase.
   */
  async listEvery(): Promise<T[]> {
    const items: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.builder().query().query('id', '=', this.dataType).setCursor(cursor).setLimit(500).execute();
      items.push(...page.items.map((i) => this.getEntity(i)));
      cursor = page.cursor;
    } while (cursor);
    return items.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }
}

export class ChargeRepository extends FinanceRepository<ChargeEntity> {
  protected dataType = DataType.CHARGE;
  protected getEntity(attr: Record<string, any>) { return new ChargeEntity(attr); }

  findByUuid(uuid: string) { return this.findById(DataType.CHARGE, `${DataType.CHARGE}#${uuid}`); }
  deleteByUuid(uuid: string) { return this.delete(DataType.CHARGE, `${DataType.CHARGE}#${uuid}`); }
}

export class SupplierDebtRepository extends FinanceRepository<SupplierDebtEntity> {
  protected dataType = DataType.SUPPLIER_DEBT;
  protected getEntity(attr: Record<string, any>) { return new SupplierDebtEntity(attr); }

  findByUuid(uuid: string) { return this.findById(DataType.SUPPLIER_DEBT, `${DataType.SUPPLIER_DEBT}#${uuid}`); }
  deleteByUuid(uuid: string) { return this.delete(DataType.SUPPLIER_DEBT, `${DataType.SUPPLIER_DEBT}#${uuid}`); }

  /**
   * Replaces the payments, only if nobody else changed them first.
   *
   * Two people paying the same debt in the same minute both see room for their
   * payment. The condition lets one through and refuses the other, so the debt
   * can never end up overpaid.
   */
  async savePayments(debt: SupplierDebtEntity, payments: ISupplierDebtPayment[], paid: number): Promise<SupplierDebtEntity> {
    const result = await this.client.send(new UpdateCommand({
      TableName: this.tableName,
      Key: debt.getKey(),
      UpdateExpression: 'SET #payments = :payments, #paid = :paid, #updatedAt = :now',
      ConditionExpression: '#paid = :previous',
      ExpressionAttributeNames: { '#payments': 'payments', '#paid': 'paid', '#updatedAt': 'updatedAt' },
      ExpressionAttributeValues: { ':payments': payments, ':paid': paid, ':previous': debt.paid, ':now': new Date().toISOString() },
      ReturnValues: 'ALL_NEW',
    }));
    return this.getEntity(result.Attributes ?? {});
  }
}
