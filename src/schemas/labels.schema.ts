import { z } from 'zod';

/** A hundred sheets. Past that it is a print run, not a label job. */
export const MAX_TICKETS = 800;

export const ProductLabelsSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.string().uuid(),
          /** How many tickets for this product — one per unit on the floor, usually. */
          copies: z.number().int().min(1).max(200),
        }),
      )
      .min(1)
      .max(200),
  })
  .refine((d) => d.items.reduce((n, i) => n + i.copies, 0) <= MAX_TICKETS, {
    message: `Au plus ${MAX_TICKETS} étiquettes par impression`,
    path: ['items'],
  });

export type ProductLabelsInput = z.infer<typeof ProductLabelsSchema>;
