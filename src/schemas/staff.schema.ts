import { z } from 'zod';

export const CreateStaffSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(6).max(30),
  password: z.string().min(8).max(100),
  roleId: z.string().min(1).max(60),
  email: z.string().email().optional(),
});

export const UpdateStaffSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  roleId: z.string().min(1).max(60).optional(),
  active: z.boolean().optional(),
});

export const StaffIdParamSchema = z.object({ id: z.string().min(1) });

export const UpsertRoleSchema = z.object({
  roleId: z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, - or _'),
  name: z.string().min(1).max(80),
  description: z.string().max(200).optional(),
  permissions: z.array(z.string()).default([]),
});

export const RoleIdParamSchema = z.object({ id: z.string().min(1) });

export type CreateStaffInput = z.infer<typeof CreateStaffSchema>;
export type UpdateStaffInput = z.infer<typeof UpdateStaffSchema>;
export type UpsertRoleInput = z.infer<typeof UpsertRoleSchema>;
