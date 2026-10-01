import { z } from 'zod';
import { ProductStatus } from '@libs/enums';

export const CreateProductSchema = z.object({
  name: z.object({
    fr: z.string().min(1).max(200),
    ar: z.string().min(1).max(200),
  }),
  description: z.object({
    fr: z.string().max(2000).optional(),
    ar: z.string().max(2000).optional(),
  }).optional(),
  purchasePrice: z.number().min(0).default(0),
  priceHT: z.number().positive(),
  taxRate: z.number().min(0).max(100).default(19),
  code: z.string().min(1).max(50),
  /** Shop shorthand — "chabka 20", "شبكة 20", "DT20". Searched like the name. */
  aliases: z.array(z.string().min(1).max(60)).max(20).optional(),
  discountedPrice: z.number().min(0).optional(),
  discountPercentage: z.number().min(0).max(100).optional(),
  stockAvailable: z.number().int().min(0).default(0),
  categoryId: z.string().uuid(),
  status: z.nativeEnum(ProductStatus).optional(),
  imageUrl: z.string().url().optional(),
});

export const UpdateProductSchema = z.object({
  name: z.object({
    fr: z.string().min(1).max(200),
    ar: z.string().min(1).max(200),
  }).optional(),
  description: z.object({
    fr: z.string().max(2000).optional(),
    ar: z.string().max(2000).optional(),
  }).optional(),
  purchasePrice: z.number().min(0).optional(),
  priceHT: z.number().positive().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  code: z.string().min(1).max(50).optional(),
  aliases: z.array(z.string().min(1).max(60)).max(20).optional(),
  discountedPrice: z.number().min(0).optional(),
  discountPercentage: z.number().min(0).max(100).optional(),
  stockAvailable: z.number().int().min(0).optional(),
  categoryId: z.string().uuid().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
  imageUrl: z.string().url().optional(),
});

export const ProductIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const ListProductsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  categoryId: z.string().uuid().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
  search: z.string().max(100).optional(),
  sort: z.enum(['date_asc', 'date_desc']).optional(),
  /**
   * Only the products whose settings are wrong.
   *
   * Sent as a string because it arrives in the query string. Anything other
   * than "true" reads as off, so a stray value cannot hide the catalogue.
   */
  flagged: z.string().max(5).optional(),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
