import { z } from 'zod';

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


/**
 * What a client already owed before the system existed.
 *
 * An amount on its own: no articles, no invoice, and the date only when the
 * notebook happens to give one.
 */
const OpeningBalanceFields = {
  openingBalance: z.number().min(0).max(10_000_000).optional(),
  openingBalanceAt: z.string().max(30).optional().or(z.literal('')),
  openingBalanceNote: z.string().max(200).optional(),
};

/**
 * A name arriving as two fields is folded into one.
 *
 * The shop website still posts `firstName`/`lastName` from its sign-up form,
 * and there is no reason to break it over a change that is ours.
 */
const withFullName = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object({
      ...shape,
      fullName: z.string().min(1).max(200).optional(),
      firstName: z.string().max(100).optional(),
      lastName: z.string().max(100).optional(),
    })
    .transform(({ firstName, lastName, fullName, ...rest }) => {
      const joined = [firstName, lastName].filter(Boolean).join(' ').trim();
      const name = (fullName ?? joined).trim();

      const named: typeof rest & { fullName?: string } = rest;
      if (name) named.fullName = name;
      return named;
    });

export const CreateClientSchema = withFullName({
  // Optional on purpose. A walk-in buyer often has no email address, and
  // requiring one made staff invent fake ones. The phone number is the field
  // that identifies a client here.
  email: z.string().email().optional(),
  // Optional, like the email. A client carried over from the notebook is
  // often a name and an amount, with no number written next to it.
  phone: z.string().min(6).max(20).optional(),
  /** Identity card, and the tax number for a client who buys as a business. */
  cin: z.string().max(20).optional(),
  taxId: z.string().max(30).optional(),
  ...OpeningBalanceFields,
  addresses: z.array(AddressSchema).default([]),
}).refine((d) => !!d.fullName, {
  message: 'A name is required',
  path: ['fullName'],
});

export const UpdateClientSchema = withFullName({
  email: z.string().email().optional(),
  phone: z.string().min(6).max(20).optional(),
  cin: z.string().max(20).optional(),
  taxId: z.string().max(30).optional(),
  ...OpeningBalanceFields,
  addresses: z.array(AddressSchema).optional(),
});

export const ClientIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const ListClientsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  search: z.string().max(100).optional(),
  sort: z.enum(['date_asc', 'date_desc']).optional(),
});

export type CreateClientInput = z.infer<typeof CreateClientSchema>;
export type UpdateClientInput = z.infer<typeof UpdateClientSchema>;
