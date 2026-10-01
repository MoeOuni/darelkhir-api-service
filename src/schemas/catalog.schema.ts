import { z } from 'zod';
import { RequestStatus } from '@libs/enums';

export const CreateSupplierSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(6).max(30),
  secondaryPhone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(200).optional(),
  taxId: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
});

export const UpdateSupplierSchema = CreateSupplierSchema.partial();

export const CreateRequestSchema = z.object({
  clientId: z.string().uuid().optional(),
  clientName: z.string().min(1).max(120),
  clientPhone: z.string().min(6).max(30),
  description: z.string().min(1).max(300),
  productId: z.string().uuid().optional(),
  quantity: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
});

export const UpdateRequestSchema = z.object({
  status: z.nativeEnum(RequestStatus).optional(),
  notes: z.string().max(500).optional(),
  description: z.string().min(1).max(300).optional(),
  quantity: z.number().int().positive().optional(),
});

export const CatalogIdParamSchema = z.object({ id: z.string().uuid() });

export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;
export type CreateRequestInput = z.infer<typeof CreateRequestSchema>;
export type UpdateRequestInput = z.infer<typeof UpdateRequestSchema>;
