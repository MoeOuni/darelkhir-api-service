import { z } from 'zod';
import { PaymentType } from '@libs/enums';

/**
 * One article on a declared invoice.
 *
 * Written down rather than pointed at: this may be reprinted years after a
 * product was renamed, and what the government holds must not change when the
 * catalogue does.
 */
const LineSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  quantity: z.number().positive(),
  priceHT: z.number().min(0),
  taxRate: z.number().min(0).max(100).default(19),
});

/**
 * The buyer as the government knows him.
 *
 * Its own identity rather than a client id: the whole reason this document
 * exists is that the name on it differs from the name on the counter invoice —
 * a man on the road, his company on paper.
 */
const FiscalFields = {
  fiscalName: z.string().min(1).max(200),
  fiscalAddress: z.string().max(200).optional(),
  taxId: z.string().max(30).optional(),
  cin: z.string().max(20).optional(),
  phone: z.string().max(20).optional(),
};

export const CreateDeclaredInvoiceSchema = z.object({
  /**
   * Typed by the shop and unique for all time.
   *
   * Free text because a fiscal sequence is not always a plain number —
   * "2026/014" is as common here as "14".
   */
  number: z.string().min(1).max(40),
  issuedAt: z.string().min(1).max(30),
  ...FiscalFields,
  /**
   * How the invoice was settled. Required: it is a line the fiscal paper
   * carries, and an invoice that does not say how it was paid is incomplete
   * on the government's side, not merely on ours.
   */
  paymentMethod: z.nativeEnum(PaymentType),
  lines: z.array(LineSchema).min(1),
  notes: z.string().max(500).optional(),
  /** The order it was raised from, when it was raised from one. */
  sourceOrderId: z.string().uuid().optional(),
});

/** Everything but the number, which is the identity and cannot move. */
export const UpdateDeclaredInvoiceSchema = z.object({
  issuedAt: z.string().min(1).max(30).optional(),
  fiscalName: z.string().min(1).max(200).optional(),
  fiscalAddress: z.string().max(200).optional(),
  taxId: z.string().max(30).optional(),
  cin: z.string().max(20).optional(),
  phone: z.string().max(20).optional(),
  paymentMethod: z.nativeEnum(PaymentType).optional(),
  lines: z.array(LineSchema).min(1).optional(),
  notes: z.string().max(500).optional(),
  /** Sent once, when the shop says the paper is done. */
  status: z.literal('final').optional(),
});

export const DeclaredNumberParamSchema = z.object({
  number: z.string().min(1).max(40),
});

export const CheckNumberQuerySchema = z.object({
  number: z.string().min(1).max(40),
});

export type CreateDeclaredInvoiceInput = z.infer<typeof CreateDeclaredInvoiceSchema>;
export type UpdateDeclaredInvoiceInput = z.infer<typeof UpdateDeclaredInvoiceSchema>;
