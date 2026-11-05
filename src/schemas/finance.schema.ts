import { z } from 'zod';
import { ChargeCategory, PaymentType } from '@libs/enums';

const money = z.number().positive().max(100_000_000);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');
const text = (max: number) => z.string().trim().max(max);

export const CreateChargeSchema = z.object({
  date: day,
  amount: money,
  category: z.nativeEnum(ChargeCategory),
  beneficiary: text(120).optional(),
  description: text(300).optional(),
  method: z.nativeEnum(PaymentType).default(PaymentType.CASH),
});
export const UpdateChargeSchema = CreateChargeSchema.partial();

export const CreateSupplierDebtSchema = z
  .object({
    supplierName: text(120).min(1),
    reference: text(60).optional(),
    date: day,
    total: money,
    /** What was handed over the day of the purchase. */
    paidNow: z.number().min(0).max(100_000_000).default(0),
    method: z.nativeEnum(PaymentType).default(PaymentType.CASH),
    notes: text(300).optional(),
  })
  .refine((d) => d.paidNow <= d.total + 0.0005, {
    message: 'Le montant payé dépasse le total de la facture',
    path: ['paidNow'],
  });

export const UpdateSupplierDebtSchema = z.object({
  supplierName: text(120).min(1).optional(),
  reference: text(60).optional(),
  date: day.optional(),
  total: money.optional(),
  notes: text(300).optional(),
});

export const DebtPaymentSchema = z.object({
  date: day,
  amount: money,
  method: z.nativeEnum(PaymentType).default(PaymentType.CASH),
  note: text(200).optional(),
});

export const FinanceIdSchema = z.object({ id: z.string().uuid() });
export const DebtPaymentParamsSchema = z.object({ id: z.string().uuid(), paymentId: z.string().uuid() });

export type CreateChargeInput = z.infer<typeof CreateChargeSchema>;
export type CreateSupplierDebtInput = z.infer<typeof CreateSupplierDebtSchema>;
export type DebtPaymentInput = z.infer<typeof DebtPaymentSchema>;
