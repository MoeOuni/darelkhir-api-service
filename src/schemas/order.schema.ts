import { z } from 'zod';
import { OrderStatus, PaymentMethod, PaymentType, ChargePayer } from '@libs/enums';

/**
 * Loading, craneage, a porter. `paidBy` decides whether it lands on the
 * client's invoice or comes out of the shop's own pocket.
 */
const ChargeSchema = z.object({
  label: z.string().min(1).max(80),
  amount: z.number().min(0).max(100000),
  paidBy: z.nativeEnum(ChargePayer),
});

/** Only productId + quantity come from the client — all prices are resolved server-side. */
const OrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

/**
 * An address as one written line.
 *
 * Only `street` is asked for; the rest is accepted so that addresses saved
 * before the change keep validating when they are edited.
 */
const AddressSchema = z.object({
  id: z.string().uuid().optional(),
  street: z.string().min(1).max(200),
  city: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  country: z.string().max(2).optional(),
  postalCode: z.string().max(20).optional(),
});

export const CreateOrderSchema = z
  .object({
    clientId: z.string().uuid(),
    items: z.array(OrderItemSchema).min(1),
    shippingAddressId: z.string().uuid().optional(),
    shippingAddress: AddressSchema.optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
    notes: z.string().max(500).optional(),
    // Delivery details are part of the order, not a follow-up PATCH. The
    // transporter name is resolved server-side from the id, so it is not
    // accepted here.
    transporterId: z.string().uuid().optional(),
    transport: z.number().min(0).optional(),
    charges: z.array(ChargeSchema).max(20).optional(),
  })
  .refine((d) => !!d.shippingAddressId || !!d.shippingAddress, {
    message: 'shippingAddressId or shippingAddress is required',
    path: ['shippingAddressId'],
  });

/**
 * Money taken at the counter when the order is confirmed.
 *
 * Sent on the same request as the confirmation so there is no gap between
 * issuing the invoice and recording what the client handed over.
 */
const ConfirmPaymentSchema = z
  .object({
    amount: z.number().min(0),
    method: z.nativeEnum(PaymentType),
    reference: z.string().max(100).optional(),
    checkNumber: z.string().max(50).optional(),
    bankName: z.string().max(120).optional(),
    dueDate: z.string().min(10).optional(),
  })
  .refine((d) => d.method !== PaymentType.CHECK || d.amount === 0 || !!d.checkNumber, {
    message: 'A check payment needs the check number',
    path: ['checkNumber'],
  });

/**
 * One drop on a delivery round. The quantities are checked against the order
 * itself in the use case, where the order is actually in hand.
 */
const StopSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().max(80).optional(),
  address: AddressSchema,
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().positive() }))
    .min(1),
});

export const UpdateOrderSchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  /**
   * Replaces the order lines. Only accepted while the order has no invoice —
   * once a number is spent the paper has to keep matching the record.
   */
  items: z.array(OrderItemSchema).min(1).optional(),
  payment: ConfirmPaymentSchema.optional(),
  deliveryDate: z.string().min(1).optional(),
  /** Overrides the date printed on the invoice. Empty clears it. */
  documentDate: z.string().max(30).optional().or(z.literal('')),
  notes: z.string().max(500).optional(),
  shippingAddress: AddressSchema.optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  transport: z.number().min(0).optional(),
  charges: z.array(ChargeSchema).max(20).optional(),
  /** An empty array clears the round and puts everything back on one delivery. */
  stops: z.array(StopSchema).max(12).optional(),
  transporterId: z.string().uuid().optional(),
  transporterName: z.string().max(100).optional(),
});

export const OrderIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const ListOrdersQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  customerId: z.string().optional(),
  status: z.nativeEnum(OrderStatus).optional(),
  search: z.string().max(100).optional(),
  sort: z.enum(['date_asc', 'date_desc']).optional(),
});

export const ListMyOrdersQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type UpdateOrderInput = z.infer<typeof UpdateOrderSchema>;

/** A credit note cancels an invoice that was already issued. */
export const CreateCreditNoteSchema = z.object({
  reason: z.string().max(300).optional(),
  /** Defaults to true: a refused delivery goes back on the shelf. */
  restock: z.boolean().optional(),
});

export type CreateCreditNoteInput = z.infer<typeof CreateCreditNoteSchema>;

/**
 * A sentence to read an order out of, in Tunisian Arabic.
 *
 * Capped well above anything anyone dictates at a counter: the limit is there
 * so a runaway client cannot post a novel to a paid endpoint.
 */
export const InterpretOrderSchema = z.object({
  text: z.string().min(2).max(2000),
  /**
   * What was said before, so the exchange holds together — "زيد زوز أخرى"
   * means two more of what was just discussed.
   *
   * Bounded because every turn is re-sent and re-read, so an unbounded thread
   * would grow the cost of each answer without making it any better.
   */
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string().min(1).max(2000),
      })
    )
    .max(20)
    .optional(),
  /**
   * Where the order stands on the phone right now.
   *
   * The screen is the truth: the shop corrects quantities, picks a buyer and
   * chooses an address between turns, and none of that reaches the model any
   * other way. Without it every answer is composed blind.
   */
  state: z
    .object({
      client: z.string().max(200).nullable(),
      clientIsNew: z.boolean().optional(),
      clientPhone: z.string().max(40).nullable().optional(),
      items: z
        .array(z.object({ code: z.string().max(50), quantity: z.number() }))
        .max(50),
      address: z.string().max(200).nullable(),
      driver: z.string().max(200).nullable(),
    })
    .optional(),
});

/**
 * A line to say out loud.
 *
 * Capped well above any reply Yahya writes: the limit is there so nobody can
 * post a book to a route that is billed per character.
 */
export const SpeakSchema = z.object({
  text: z.string().min(1).max(600),
  voice: z.string().max(40).optional(),
});

/**
 * A recording to be turned into words.
 *
 * Capped at four megabytes of base64, which is minutes of speech at the
 * bitrate a phone records at — and well under what the gateway will carry.
 */
export const TranscribeSchema = z.object({
  audio: z.string().min(100).max(4_000_000),
  mime: z.string().max(60).optional(),
});
