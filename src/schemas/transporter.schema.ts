import { z } from 'zod';

export const CreateTransporterSchema = z.object({
  name: z.string().min(1).max(100),
  // Optional: a driver is often known by name and lorry alone, and refusing
  // the record over a missing number stopped orders being written.
  phone: z.string().max(20).optional(),
  secondaryPhone: z.string().min(8).max(20).optional(),
  vehiclePlateNumber: z.string().max(20).optional(),
  cin: z.string().max(20).optional(),
});

export const UpdateTransporterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().min(8).max(20).optional(),
  secondaryPhone: z.string().min(8).max(20).optional(),
  vehiclePlateNumber: z.string().max(20).optional(),
  cin: z.string().max(20).optional(),
});

export const TransporterIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const ListTransportersQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  /** Name, number, plate or card — searched on the server, not in the screen. */
  search: z.string().max(100).optional(),
});

export type CreateTransporterInput = z.infer<typeof CreateTransporterSchema>;
export type UpdateTransporterInput = z.infer<typeof UpdateTransporterSchema>;
