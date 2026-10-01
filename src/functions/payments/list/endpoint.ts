import { Context } from 'aws-lambda';
import { middleware, ExtendedEvent } from '@libs/middleware';
import { PaymentRepository } from '@/repositories/PaymentRepository';
import { CheckStatus, PaymentType } from '@libs/enums';

/**
 * Payments, newest first.
 *
 * `checkStatus=held` gives the cheques screen: money promised but not yet in
 * the bank.
 */
const listPaymentsHandler = async (event: ExtendedEvent, _context: Context) => {
  const query = (event.queryStringParameters || {}) as Record<string, string>;
  const limit = query.limit ? Math.min(Number(query.limit), 200) : 100;

  const result = await new PaymentRepository().listAll(query.cursor, limit);

  let items = result.items;
  if (query.checkStatus) {
    items = items.filter(
      (p) => p.method === PaymentType.CHECK && p.checkStatus === query.checkStatus,
    );
  }
  if (query.clientId) {
    items = items.filter((p) => p.clientId === query.clientId);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Payments retrieved successfully',
      data: {
        items: items.map((e) => {
          const dto = e.toPublicDTO();
          return { ...dto, id: (dto.sk as string).split('#')[1] };
        }),
        cursor: result.cursor,
        count: items.length,
        checkStatuses: Object.values(CheckStatus),
      },
    }),
  };
};

export const handler = middleware({
  auth: true,
  requires: 'payments.view',
  cors: true,
})(listPaymentsHandler);
