import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { DeclaredNumberParamSchema, UpdateDeclaredInvoiceSchema } from '@/schemas/declared.schema';
import { DeclaredInvoiceRepository } from '@/repositories/DeclaredInvoiceRepository';
import { roundLines, totalDeclared } from '@libs/declared-total';
import { getSettings } from '@libs/settings';
import { requirePermission } from '@libs/auth/authorize';

/**
 * Corrects a draft, or marks it final.
 *
 * Final is a one-way door. By then the paper is in someone else's hands — an
 * accountant's, or the government's — and a system that lets the record drift
 * from the paper is worse than one that refuses: at least a refusal is visible.
 * A mistake found afterwards is fixed by deleting it and raising another, which
 * leaves both acts in the journal.
 */
const updateHandler = async (event: ExtendedEvent, _context: Context) => {
  const { number } = event.pathParameters as { number: string };
  const repository = new DeclaredInvoiceRepository();
  const found = await repository.findByNumber(decodeURIComponent(number));

  if (!found) return { statusCode: 404, body: JSON.stringify({ message: 'Not found' }) };
  if (found.isFinal) {
    return {
      statusCode: 409,
      body: JSON.stringify({ message: 'Cette facture est finalisée et ne peut plus changer.' }),
    };
  }

  const data = event.body;
  const now = new Date().toISOString();

  if (data.lines) {
    const lines = roundLines(data.lines.map((l: any) => ({ ...l, taxRate: l.taxRate ?? 19 })));
    const { stampTax } = await getSettings();
    found.set({ lines, ...totalDeclared(lines, stampTax) });
  }

  for (const field of ['issuedAt', 'fiscalName', 'fiscalAddress', 'taxId', 'cin', 'phone', 'paymentMethod', 'notes']) {
    if (data[field] !== undefined) found.set({ [field]: data[field] });
  }

  if (data.status === 'final') {
    // Closing the document is its own right. Whoever types the shop's fiscal
    // paperwork is not automatically the person who decides it is done and
    // may never be corrected again.
    await requirePermission(event.user, 'declared.finalise');
    found.set({ status: 'final', finalisedAt: now });
  }

  found.set({ updatedAt: now });
  await repository.update(found);

  return { statusCode: 200, body: JSON.stringify({ message: 'Updated', data: found.toPublicDTO() }) };
};

export const handler = middleware({
  audit: { action: 'declared.update', entityType: 'declared_invoice' },
  auth: true,
  cors: true,
  requires: 'declared.create',
  validation: { pathParameters: DeclaredNumberParamSchema, body: UpdateDeclaredInvoiceSchema },
})(updateHandler);
