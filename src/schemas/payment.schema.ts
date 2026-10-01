import { z } from 'zod';
import { PaymentType, CheckStatus } from '@libs/enums';

export const CreatePaymentSchema = z
  .object({
    clientId: z.string().uuid(),
    /** Positive. A reversal is created through its own endpoint. */
    amount: z.number().positive(),
    method: z.nativeEnum(PaymentType),
    paidAt: z.string().min(10).optional(),
    reference: z.string().max(100).optional(),
    /** Prints on the receipt. Never used to compute a per-order balance. */
    orderId: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
    checkNumber: z.string().max(50).optional(),
    bankName: z.string().max(120).optional(),
    dueDate: z.string().min(10).optional(),
  })
  .refine((d) => d.method !== PaymentType.CHECK || !!d.checkNumber, {
    message: 'A check payment needs the check number',
    path: ['checkNumber'],
  });

export const ReversePaymentSchema = z.object({
  /** Why the money came back. Required: the book has to say what happened. */
  reason: z.string().min(1).max(300),
});

export const UpdateCheckStatusSchema = z.object({
  checkStatus: z.nativeEnum(CheckStatus),
});

export const PaymentIdParamSchema = z.object({ id: z.string().uuid() });

export const ListPaymentsQuerySchema = z.object({
  clientId: z.string().uuid().optional(),
  checkStatus: z.nativeEnum(CheckStatus).optional(),
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;
