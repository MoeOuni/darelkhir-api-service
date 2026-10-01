import { DeclaredInvoiceRepository } from '@/repositories/DeclaredInvoiceRepository';
import { DeclaredInvoiceEntity, declaredKey } from '@/entities/DeclaredInvoiceEntity';
import { CreateDeclaredInvoiceInput } from '@/schemas/declared.schema';
import { roundLines, totalDeclared } from '@libs/declared-total';
import { getSettings } from '@libs/settings';
import { DataType } from '@libs/enums';

interface Result {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

/**
 * Raises a declared invoice.
 *
 * It moves nothing: no stock leaves a shelf, no client's balance changes, no
 * counter advances. That is the point of it — the goods were already sold and
 * accounted for under the counter's own invoice, and this is a second piece of
 * paper describing the same goods to the government under a different name.
 */
export class CreateDeclaredInvoiceUseCase {
  constructor(private repository: DeclaredInvoiceRepository) {}

  async execute(data: CreateDeclaredInvoiceInput, actorId?: string): Promise<Result> {
    const now = new Date().toISOString();
    const { stampTax } = await getSettings();

    const lines = roundLines(data.lines.map((l) => ({ ...l, taxRate: l.taxRate ?? 19 })));
    // Worked out here, never taken from the caller: a total that arrives over
    // the wire is a total nobody checked, and the tax authority reads this one.
    const money = totalDeclared(lines, stampTax);

    const entity = new DeclaredInvoiceEntity({
      id: DataType.DECLARED_INVOICE,
      sk: declaredKey(data.number),
      dataType: DataType.DECLARED_INVOICE,
      number: data.number.trim().toUpperCase(),
      status: 'draft',
      issuedAt: data.issuedAt,
      fiscalName: data.fiscalName,
      fiscalAddress: data.fiscalAddress,
      taxId: data.taxId,
      cin: data.cin,
      phone: data.phone,
      paymentMethod: data.paymentMethod,
      lines,
      ...money,
      notes: data.notes,
      sourceOrderId: data.sourceOrderId,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await this.repository.create(entity);
    } catch (err) {
      // The number is the key, so the write itself refuses a duplicate. This is
      // what covers the gap between the availability check and this moment —
      // two people typing 2026/014 in the same minute both pass the check, and
      // only one of them gets the number.
      const name = (err as { name?: string })?.name;
      if (name === 'ConditionalCheckFailedException') {
        return { success: false, message: `La facture ${data.number} existe déjà` };
      }
      throw err;
    }

    return {
      success: true,
      message: 'Declared invoice created',
      data: entity.toPublicDTO(),
    };
  }
}
