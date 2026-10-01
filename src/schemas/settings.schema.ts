import { z } from 'zod';

/**
 * Every field is optional on write: the settings screen saves whole forms, and
 * a partial save must not wipe a field the form did not show.
 */
export const UpdateSettingsSchema = z.object({
  businessName: z.string().min(1).max(120).optional(),
  businessNameAr: z.string().max(120).optional(),
  legalName: z.string().max(120).optional(),
  phone: z.string().min(6).max(30).optional(),
  secondaryPhone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  addressLine: z.string().min(1).max(200).optional(),
  addressLineAr: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().min(2).max(2).optional(),
  taxId: z.string().max(50).optional(),
  taxIdAr: z.string().max(50).optional(),
  stampTax: z.number().min(0).max(1000).optional(),
  defaultTaxRate: z.number().min(0).max(100).optional(),
  bankName: z.string().max(120).optional(),
  bankAccountNumber: z.string().max(60).optional(),
  openingHours: z.string().max(200).optional(),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  logoUrl: z.string().url().optional().or(z.literal('')),
  balanceWarningThreshold: z.number().min(0).optional(),
});

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
