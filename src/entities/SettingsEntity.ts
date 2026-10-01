import { Entity } from './Entity';
import { ISettings } from '@libs/interfaces';
import { DataType } from '@libs/enums';

/**
 * The business identity, held once.
 *
 * These values used to be written by hand in the invoice renderer, the email
 * templates and the storefront pages. The copies drifted apart — the site
 * displayed one phone number and dialled another. Everything reads this record
 * now.
 */
export class SettingsEntity extends Entity<ISettings> implements ISettings {
  readonly id: string;
  readonly sk: string;
  readonly dataType: DataType;

  businessName: string;
  legalName?: string;
  phone: string;
  secondaryPhone?: string;
  email: string;
  addressLine: string;
  city?: string;
  postalCode?: string;
  country: string;
  /** Matricule fiscal — printed on every invoice. */
  taxId: string;
  /** Stamp duty added to every order, in dinars. */
  stampTax: number;
  defaultTaxRate: number;
  bankName?: string;
  bankAccountNumber?: string;
  openingHours?: string;
  websiteUrl?: string;
  logoUrl?: string;
  /** Warn a worker when a client owes more than this. Empty means never warn. */
  balanceWarningThreshold?: number;
  createdAt: string;
  updatedAt: string;

  constructor(attr: Partial<ISettings>) {
    super(attr);
    this.id = DataType.SETTINGS;
    this.sk = `${DataType.SETTINGS}#business`;
    this.dataType = DataType.SETTINGS;

    this.businessName = attr.businessName ?? '';
    this.legalName = attr.legalName;
    this.phone = attr.phone ?? '';
    this.secondaryPhone = attr.secondaryPhone;
    this.email = attr.email ?? '';
    this.addressLine = attr.addressLine ?? '';
    this.city = attr.city;
    this.postalCode = attr.postalCode;
    this.country = attr.country ?? 'TN';
    this.taxId = attr.taxId ?? '';
    this.stampTax = attr.stampTax ?? 1;
    this.defaultTaxRate = attr.defaultTaxRate ?? 19;
    this.bankName = attr.bankName;
    this.bankAccountNumber = attr.bankAccountNumber;
    this.openingHours = attr.openingHours;
    this.websiteUrl = attr.websiteUrl;
    this.logoUrl = attr.logoUrl;
    this.balanceWarningThreshold = attr.balanceWarningThreshold;
    this.createdAt = attr.createdAt as string;
    this.updatedAt = attr.updatedAt as string;
  }

  protected getIndexMap() {
    return {};
  }

  toPublicDTO(): Record<string, any> {
    const { tk, fk, fhk, sihk, sehk, ...rest } = this.valueOf() as any;
    return rest;
  }

  /**
   * The subset the storefront may read without a token: how to contact the
   * business. Bank details and internal thresholds stay out of it.
   */
  toStorefrontDTO(): Record<string, any> {
    return {
      businessName: this.businessName,
      phone: this.phone,
      secondaryPhone: this.secondaryPhone,
      email: this.email,
      addressLine: this.addressLine,
      city: this.city,
      postalCode: this.postalCode,
      country: this.country,
      openingHours: this.openingHours,
      websiteUrl: this.websiteUrl,
      logoUrl: this.logoUrl,
    };
  }
}
