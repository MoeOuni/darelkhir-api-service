import { SettingsRepository } from '@/repositories/SettingsRepository';
import type { ISettings } from '@libs/interfaces';

export type BusinessSettings = Omit<ISettings, 'id' | 'sk' | 'dataType' | 'createdAt' | 'updatedAt'>;

/**
 * Values used until the settings record is filled in.
 *
 * These are the exact values that were hardcoded in `invoice.ts` before, so a
 * deploy changes nothing on its own. The first save from the settings screen
 * takes over.
 */
export const DEFAULT_SETTINGS: BusinessSettings = {
  businessName: 'DAR EL KHIR',
  /** Printed on the right-hand side of the invoice header. */
  businessNameAr: 'دار الخير',
  // Left empty on purpose until the settings screen is filled in. These were
  // copied from another shop, and a default is what prints when nobody has
  // saved anything — so a blank line is the safe failure, where somebody
  // else's phone number and tax id on a fiscal document is not.
  phone: '',
  email: '',
  addressLine: '',
  addressLineAr: '',
  country: 'TN',
  taxId: '',
  taxIdAr: '',
  stampTax: 1,
  defaultTaxRate: 19,
};

let cache: { value: BusinessSettings; expiresAt: number } | null = null;

/** Settings change a couple of times a year, so a short cache is plenty. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Reads the business settings, falling back to the defaults above.
 *
 * Never throws: an invoice must still render if the settings table is briefly
 * unreachable. A failure logs and returns the last known value or the defaults.
 */
export async function getSettings(): Promise<BusinessSettings> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.value;
  }

  try {
    const entity = await new SettingsRepository().get();
    const value: BusinessSettings = entity
      ? { ...DEFAULT_SETTINGS, ...stripEmpty(entity.toPublicDTO()) }
      : DEFAULT_SETTINGS;

    cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: 'WARN',
        message: 'Could not read business settings, using the previous value',
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return cache?.value ?? DEFAULT_SETTINGS;
  }
}

/** Drops empty strings so a blank field falls back to its default. */
/**
 * Zero-width characters ride along invisibly when a value is pasted out of a
 * web page or a document. They print as nothing but break comparisons and
 * searches, so they are taken out on the way in.
 */
function clean(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(/[\u200b-\u200f\ufeff]/g, '').trim() : value;
}

function stripEmpty(dto: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(dto)
      .map(([k, v]) => [k, clean(v)])
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
}

/** Clears the cache after a write so the next read sees the new values. */
export function invalidateSettingsCache(): void {
  cache = null;
}

/** One-line Arabic address, falling back to the French one. */
export function formatSettingsAddressAr(s: BusinessSettings): string {
  return s.addressLineAr?.trim() || formatSettingsAddress(s);
}

/** One-line address for the invoice header. */
export function formatSettingsAddress(s: BusinessSettings): string {
  return [s.addressLine, s.city, s.postalCode].filter(Boolean).join(', ');
}
