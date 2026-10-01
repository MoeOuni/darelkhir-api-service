import { z } from 'zod';

export const ClientPriceParamsSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
});

export const ClientPriceListParamsSchema = z.object({
  id: z.string().uuid(),
});

export const SetClientPriceSchema = z.object({
  /** Unit price this client pays, tax included. */
  price: z.number().min(0).max(1_000_000),
  note: z.string().max(200).optional(),
});

export type SetClientPriceInput = z.infer<typeof SetClientPriceSchema>;
