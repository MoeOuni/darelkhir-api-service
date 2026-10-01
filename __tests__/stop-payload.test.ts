import { UpdateOrderSchema } from '../src/schemas/order.schema';

/**
 * What a client may send as a delivery round.
 *
 * These exist because the mobile app sent a stop the moment the button was
 * pressed — before anyone had typed an address into it — and the only thing
 * that came back was "Validation failed". The app now keeps the round local
 * until it is complete, and these pin the two ends of that: what the server
 * refuses, and what it takes.
 */
describe('UpdateOrderSchema — delivery stops', () => {
  /**
   * A drop is a place on a round, not a postal address, so the line a driver
   * would be told is the whole of it.
   */
  const address = { street: 'Chantier route de Gafsa, après le pont' };

  const item = { productId: '11111111-1111-4111-8111-111111111111', quantity: 3 };

  it('refuses a stop that was only just added', () => {
    const blank = { id: 'a-stop', label: '', address: { street: '' }, items: [] };

    expect(UpdateOrderSchema.safeParse({ stops: [blank] }).success).toBe(false);
  });

  it('refuses a stop with an address but nothing loaded on it', () => {
    const empty = { id: 'a-stop', address, items: [] };

    expect(UpdateOrderSchema.safeParse({ stops: [empty] }).success).toBe(false);
  });

  it('takes a stop with nothing but the written line and its goods', () => {
    const stop = { id: 'a-stop', label: 'Chantier', address, items: [item] };

    expect(UpdateOrderSchema.safeParse({ stops: [stop] }).success).toBe(true);
  });

  /**
   * Stops saved before the address was reduced to one line still carry a town
   * and a postcode, and have to keep validating whenever one is edited.
   */
  it('still takes a stop saved under the old full address', () => {
    const stop = {
      id: 'a-stop',
      address: {
        street: 'Route de Gafsa',
        city: 'Foussana',
        state: 'Kasserine',
        country: 'TN',
        postalCode: '1200',
      },
      items: [item],
    };

    expect(UpdateOrderSchema.safeParse({ stops: [stop] }).success).toBe(true);
  });

  it('names the field it tripped over, so the app can say which one', () => {
    const result = UpdateOrderSchema.safeParse({
      stops: [{ id: 'a-stop', address: { street: '' }, items: [item] }],
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.errors[0].path).toEqual(['stops', 0, 'address', 'street']);
  });
});
