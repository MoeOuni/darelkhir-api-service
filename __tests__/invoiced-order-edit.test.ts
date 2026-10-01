import { UpdateOrderUseCase } from '@/functions/orders/update/useCase';
import { OrderEntity } from '@/entities/OrderEntity';
import { OrderStatus, PaymentMethod } from '@libs/enums';

/**
 * An invoiced order is frozen against anything that changes what the client
 * was billed. The dashboard sends the whole form on every save, so the rule
 * has to look at what actually moved — otherwise editing the delivery round
 * or the loading charges is refused because the form also carried the
 * transport figure it already had.
 */
const invoicedOrder = () =>
  new OrderEntity({
    id: 'o1',
    sk: 'ORDER',
    orderNumber: 12,
    invoiceNumber: 4,
    clientId: 'c1',
    clientName: 'Trabelsi',
    status: OrderStatus.CONFIRMED,
    paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
    transport: 50,
    transporterId: '11111111-1111-1111-1111-111111111111',
    subtotal: 100,
    tax: 19,
    timber: 1,
    total: 170,
    items: [
      {
        productId: 'p1',
        code: 'A',
        name: 'Grillage',
        quantity: 10,
        priceHT: 10,
        priceTTC: 11.9,
        taxRate: 19,
        purchasePrice: 8,
      },
    ],
  } as never);

function useCaseFor(entity: OrderEntity) {
  const updated: OrderEntity[] = [];
  const repository = {
    findByUuid: async () => entity,
    update: async (e: OrderEntity) => {
      updated.push(e);
    },
  };
  const stub = { findByUuid: async () => null, updateStock: async () => undefined };

  const useCase = new UpdateOrderUseCase(
    repository as never,
    stub as never,
    stub as never,
    stub as never,
  );
  return { useCase, updated };
}

const stops = [
  {
    id: 's1',
    label: 'Chantier',
    address: {
      street: 'Rue A',
      city: 'Foussana',
      state: 'Kasserine',
      country: 'TN',
      postalCode: '1220',
    },
    items: [{ productId: 'p1', quantity: 10 }],
  },
];

describe('editing an invoiced order', () => {
  it('saves the delivery round even though the form resends the transport it already had', async () => {
    const entity = invoicedOrder();
    const { useCase, updated } = useCaseFor(entity);

    await useCase.execute(
      'o1',
      {
        status: OrderStatus.CONFIRMED,
        transport: 50,
        transporterId: entity.transporterId,
        stops,
      } as never,
      'u1',
    );

    expect(updated).toHaveLength(1);
    expect(updated[0].stops).toHaveLength(1);
  });

  it('saves the charges the same way', async () => {
    const entity = invoicedOrder();
    const { useCase, updated } = useCaseFor(entity);

    await useCase.execute(
      'o1',
      { transport: 50, charges: [{ label: 'Chargement', amount: 20, payer: 'client' }] } as never,
      'u1',
    );

    expect(updated[0].charges).toEqual([{ label: 'Chargement', amount: 20, payer: 'client' }]);
  });

  it('still refuses a transport figure that is actually different', async () => {
    const { useCase } = useCaseFor(invoicedOrder());

    await expect(useCase.execute('o1', { transport: 80 } as never, 'u1')).rejects.toThrow(
      /credit note/i,
    );
  });

  it('still refuses different articles', async () => {
    const { useCase } = useCaseFor(invoicedOrder());

    await expect(
      useCase.execute(
        'o1',
        { items: [{ productId: '33333333-3333-4333-8333-333333333333', quantity: 1 }] } as never,
        'u1',
      ),
    ).rejects.toThrow(/credit note/i);
  });

  /**
   * The driver and the address are printed on the invoice but appear in no
   * figure on it. A lorry breaks down and another goes out; a client says
   * "leave it at the depot instead". Neither is a reason to cancel an invoice
   * and issue a credit note, so both are allowed to move afterwards.
   */
  it('takes a different transporter, which changes no amount', async () => {
    const { useCase } = useCaseFor(invoicedOrder());

    await expect(
      useCase.execute(
        'o1',
        { transporterId: '22222222-2222-2222-2222-222222222222' } as never,
        'u1',
      ),
    ).resolves.toMatchObject({ success: true });
  });

  it('takes a different delivery address', async () => {
    const { useCase } = useCaseFor(invoicedOrder());

    await expect(
      useCase.execute('o1', { shippingAddress: { street: 'Dépôt Foussana' } } as never, 'u1'),
    ).resolves.toMatchObject({ success: true });
  });
});
