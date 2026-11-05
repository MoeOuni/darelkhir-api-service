import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { byRoute } from '@libs/route';
import { DataType } from '@libs/enums';
import { NotFoundError, ValidationError } from '@libs/errors';
import { getSettings } from '@libs/settings';
import { IdGenerator } from '@/utils/IdGenerator';
import { ChargeEntity } from '@/entities/ChargeEntity';
import { SupplierDebtEntity } from '@/entities/SupplierDebtEntity';
import { ChargeRepository, SupplierDebtRepository } from '@/repositories/FinanceRepositories';
import { computeInvestorReport } from '@libs/investor-report/compute';
import { loadReportSource, tunisNow } from '@libs/investor-report/load';
import {
  CreateChargeSchema,
  UpdateChargeSchema,
  CreateSupplierDebtSchema,
  UpdateSupplierDebtSchema,
  DebtPaymentSchema,
  FinanceIdSchema,
  DebtPaymentParamsSchema,
} from '@/schemas/finance.schema';

/**
 * Money going out: charges, and what is still owed to suppliers.
 *
 * Eleven routes in one Lambda because the stack is close to CloudFormation's
 * limit of 500 resources. See libs/route.ts.
 */

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const ok = (message: string, data: unknown, statusCode = 200) => ({ statusCode, body: JSON.stringify({ message, data }) });
const pathId = (event: ExtendedEvent) => (event.pathParameters as { id: string }).id;
const conflict = (err: unknown) => (err as { name?: string })?.name === 'ConditionalCheckFailedException';

// ── Charges ──────────────────────────────────────────────────────────────
const charges = () => new ChargeRepository();

const listCharges = async () => {
  const items = await charges().listEvery();
  return ok('Charges retrieved', { items: items.map((e) => e.toPublicDTO()) });
};

const createCharge = async (event: ExtendedEvent) => {
  const uuid = IdGenerator.generate();
  const now = new Date().toISOString();
  const entity = new ChargeEntity({
    ...event.body,
    id: DataType.CHARGE,
    sk: `${DataType.CHARGE}#${uuid}`,
    dataType: DataType.CHARGE,
    amount: r3(event.body.amount),
    createdBy: event.user?.name,
    createdAt: now,
    updatedAt: now,
  });
  await charges().create(entity);
  return ok('Charge recorded', entity.toPublicDTO(), 201);
};

const updateCharge = async (event: ExtendedEvent) => {
  const repository = charges();
  const entity = await repository.findByUuid(pathId(event));
  if (!entity) throw new NotFoundError('Charge introuvable');
  entity.set({ ...event.body, ...(event.body.amount !== undefined ? { amount: r3(event.body.amount) } : {}) });
  await repository.update(entity);
  return ok('Charge updated', entity.toPublicDTO());
};

const deleteCharge = async (event: ExtendedEvent) => {
  const repository = charges();
  const entity = await repository.findByUuid(pathId(event));
  if (!entity) throw new NotFoundError('Charge introuvable');
  await repository.deleteByUuid(pathId(event));
  return ok('Charge deleted', { id: pathId(event), amount: entity.amount, beneficiary: entity.beneficiary });
};

// ── Supplier debts ───────────────────────────────────────────────────────
const debts = () => new SupplierDebtRepository();

const listDebts = async () => {
  const items = await debts().listEvery();
  return ok('Supplier debts retrieved', { items: items.map((e) => e.toPublicDTO()) });
};

const createDebt = async (event: ExtendedEvent) => {
  const { paidNow, method, ...fields } = event.body;
  const uuid = IdGenerator.generate();
  const now = new Date().toISOString();
  const paid = r3(paidNow ?? 0);
  const entity = new SupplierDebtEntity({
    ...fields,
    id: DataType.SUPPLIER_DEBT,
    sk: `${DataType.SUPPLIER_DEBT}#${uuid}`,
    dataType: DataType.SUPPLIER_DEBT,
    total: r3(fields.total),
    paid,
    // What was handed over on the day is a payment like any other, so the
    // history of a debt reads from its first dinar.
    payments: paid > 0 ? [{ id: IdGenerator.generate(), date: fields.date, amount: paid, method, note: 'Payé à l’achat' }] : [],
    createdBy: event.user?.name,
    createdAt: now,
    updatedAt: now,
  });
  await debts().create(entity);
  return ok('Supplier debt recorded', entity.toPublicDTO(), 201);
};

const updateDebt = async (event: ExtendedEvent) => {
  const repository = debts();
  const entity = await repository.findByUuid(pathId(event));
  if (!entity) throw new NotFoundError('Dette introuvable');
  if (event.body.total !== undefined && event.body.total < entity.paid - 0.0005) {
    throw new ValidationError(`Le total ne peut pas être inférieur à ce qui est déjà payé (${entity.paid} DT).`);
  }
  entity.set({ ...event.body, ...(event.body.total !== undefined ? { total: r3(event.body.total) } : {}) });
  await repository.update(entity);
  return ok('Supplier debt updated', entity.toPublicDTO());
};

const deleteDebt = async (event: ExtendedEvent) => {
  const repository = debts();
  const entity = await repository.findByUuid(pathId(event));
  if (!entity) throw new NotFoundError('Dette introuvable');
  await repository.deleteByUuid(pathId(event));
  return ok('Supplier debt deleted', { id: pathId(event), supplierName: entity.supplierName, total: entity.total, paid: entity.paid });
};

const addDebtPayment = async (event: ExtendedEvent) => {
  const repository = debts();
  const entity = await repository.findByUuid(pathId(event));
  if (!entity) throw new NotFoundError('Dette introuvable');

  const amount = r3(event.body.amount);
  const remaining = r3(entity.total - entity.paid);
  if (amount > remaining + 0.0005) {
    throw new ValidationError(`Le paiement dépasse ce qui reste dû (${remaining} DT).`);
  }

  try {
    const saved = await repository.savePayments(
      entity,
      [...entity.payments, { ...event.body, amount, id: IdGenerator.generate() }],
      r3(entity.paid + amount),
    );
    return ok('Payment recorded', saved.toPublicDTO(), 201);
  } catch (err) {
    if (conflict(err)) return { statusCode: 409, body: JSON.stringify({ message: 'Un autre paiement vient d’être enregistré sur cette dette. Vérifiez et réessayez.' }) };
    throw err;
  }
};

const deleteDebtPayment = async (event: ExtendedEvent) => {
  const { paymentId } = event.pathParameters as { paymentId: string };
  const repository = debts();
  const entity = await repository.findByUuid(pathId(event));
  if (!entity) throw new NotFoundError('Dette introuvable');
  const payment = entity.payments.find((p) => p.id === paymentId);
  if (!payment) throw new NotFoundError('Paiement introuvable');

  try {
    const saved = await repository.savePayments(entity, entity.payments.filter((p) => p.id !== paymentId), r3(entity.paid - payment.amount));
    return ok('Payment removed', saved.toPublicDTO());
  } catch (err) {
    if (conflict(err)) return { statusCode: 409, body: JSON.stringify({ message: 'Cette dette vient d’être modifiée. Vérifiez et réessayez.' }) };
    throw err;
  }
};

// ── Money in hand ────────────────────────────────────────────────────────
/**
 * Where the money stands, worked out exactly as the investor report does it,
 * so the screen and the report can never disagree.
 */
const summary = async () => {
  const settings = await getSettings();
  const { totals: t } = computeInvestorReport(await loadReportSource(settings.investorCapital ?? 0, tunisNow()));
  return ok('Finance summary', {
    investment: t.investment,
    purchases: t.spent,
    supplierDebt: t.supplierDebt,
    paidToSuppliers: t.paidToSuppliers,
    collected: t.expectedIn,
    charges: t.charges,
    cash: t.cashEstimate,
    receivable: t.receivable,
    stockCost: t.stockCost,
    margin: t.margin,
    netResult: t.gain,
  });
};

const id = { pathParameters: FinanceIdSchema };
const staff = { auth: true, cors: true } as const;

export const handler = byRoute({
  'GET /charges': middleware({ ...staff, requires: 'finance.view' })(listCharges),
  'POST /charges': middleware({ ...staff, requires: 'finance.record', audit: { action: 'charge.create', entityType: 'charge' }, validation: { body: CreateChargeSchema } })(createCharge),
  'PATCH /charges/{id}': middleware({ ...staff, requires: 'finance.edit', audit: { action: 'charge.update', entityType: 'charge' }, validation: { ...id, body: UpdateChargeSchema } })(updateCharge),
  'DELETE /charges/{id}': middleware({ ...staff, requires: 'finance.edit', audit: { action: 'charge.delete', entityType: 'charge' }, validation: id })(deleteCharge),

  'GET /supplier-debts': middleware({ ...staff, requires: 'finance.view' })(listDebts),
  'POST /supplier-debts': middleware({ ...staff, requires: 'finance.record', audit: { action: 'supplier_debt.create', entityType: 'supplier_debt' }, validation: { body: CreateSupplierDebtSchema } })(createDebt),
  'PATCH /supplier-debts/{id}': middleware({ ...staff, requires: 'finance.edit', audit: { action: 'supplier_debt.update', entityType: 'supplier_debt' }, validation: { ...id, body: UpdateSupplierDebtSchema } })(updateDebt),
  'DELETE /supplier-debts/{id}': middleware({ ...staff, requires: 'finance.edit', audit: { action: 'supplier_debt.delete', entityType: 'supplier_debt' }, validation: id })(deleteDebt),
  'POST /supplier-debts/{id}/payments': middleware({ ...staff, requires: 'finance.record', audit: { action: 'supplier_debt.payment', entityType: 'supplier_debt' }, validation: { ...id, body: DebtPaymentSchema } })(addDebtPayment),
  'DELETE /supplier-debts/{id}/payments/{paymentId}': middleware({ ...staff, requires: 'finance.edit', audit: { action: 'supplier_debt.payment_delete', entityType: 'supplier_debt' }, validation: { pathParameters: DebtPaymentParamsSchema } })(deleteDebtPayment),

  // Purchases and margins are in this figure, so it is held to the same
  // permission as the margins in the reports screen.
  'GET /finance/summary': middleware({ ...staff, requires: 'reports.view_margin' })(summary),
});
