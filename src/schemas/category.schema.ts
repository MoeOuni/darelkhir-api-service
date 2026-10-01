import { z } from 'zod';
import { CategoryStatus } from '@libs/enums';

export const CreateCategorySchema = z.object({
  name: z.object({
    fr: z.string().min(1).max(100),
    ar: z.string().min(1).max(100),
  }),
  description: z.object({
    fr: z.string().max(500).optional(),
    ar: z.string().max(500).optional(),
  }).optional(),
  parentCategoryId: z.string().uuid().optional(),
  status: z.nativeEnum(CategoryStatus).optional(),
  imageUrl: z.string().url().optional(),
});

export const UpdateCategorySchema = z.object({
  name: z.object({
    fr: z.string().min(1).max(100),
    ar: z.string().min(1).max(100),
  }).optional(),
  description: z.object({
    fr: z.string().max(500).optional(),
    ar: z.string().max(500).optional(),
  }).optional(),
  parentCategoryId: z.string().uuid().optional(),
  status: z.nativeEnum(CategoryStatus).optional(),
  imageUrl: z.string().url().optional(),
});

export const CategoryIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const ListCategoriesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  parentId: z.string().uuid().optional(),
});

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
