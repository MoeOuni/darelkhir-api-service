import { z } from 'zod';

/** Both pools use phone_number as the username, so sign-in takes a phone. */
export const SignInSchema = z.object({
  phone: z.string().min(6).max(30),
  password: z.string().min(1),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type SignInInput = z.infer<typeof SignInSchema>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

/** Registration is by phone number. An email address is optional extra data. */
export const ClientSignUpSchema = z.object({
  phone: z.string().min(6).max(30),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
});

export const ClientConfirmSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
});

export type ClientSignUpInput = z.infer<typeof ClientSignUpSchema>;
export type ClientConfirmInput = z.infer<typeof ClientConfirmSchema>;
