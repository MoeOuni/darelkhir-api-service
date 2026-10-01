import { CreateOrderSchema } from '../src/schemas/order.schema';
import { CreateClientSchema } from '../src/schemas/client.schema';

/**
 * An address is one written line.
 *
 * The shop writes these itself from what a client says at the counter — "route
 * de Gafsa, en face de la mosquée". Demanding a town, a governorate and a
 * postcode alongside it only produced invented values, so only the line is
 * required now. What was saved under the old shape has to keep validating.
 */
const line = { street: 'Route de Gafsa, en face de la mosquée' };

const full = {
  street: 'Route de Gafsa',
  city: 'Foussana',
  state: 'Kasserine',
  country: 'TN',
  postalCode: '1200',
};

const order = (shippingAddress: unknown) => ({
  clientId: '11111111-1111-4111-8111-111111111111',
  items: [{ productId: '22222222-2222-4222-8222-222222222222', quantity: 2 }],
  shippingAddress,
});

describe('an address on an order', () => {
  it('takes the written line on its own', () => {
    expect(CreateOrderSchema.safeParse(order(line)).success).toBe(true);
  });

  it('still takes one saved under the old full shape', () => {
    expect(CreateOrderSchema.safeParse(order(full)).success).toBe(true);
  });

  it('refuses an empty line, since there would be nowhere to deliver', () => {
    expect(CreateOrderSchema.safeParse(order({ street: '' })).success).toBe(false);
  });
});

describe('an address on a client', () => {
  const client = (addresses: unknown[]) => ({
    firstName: 'Mohamed',
    lastName: 'Trabelsi',
    addresses,
  });

  it('takes the written line on its own', () => {
    expect(CreateClientSchema.safeParse(client([line])).success).toBe(true);
  });

  it('still takes one saved under the old full shape', () => {
    expect(CreateClientSchema.safeParse(client([full])).success).toBe(true);
  });

  it('takes a client with no address at all', () => {
    expect(CreateClientSchema.safeParse(client([])).success).toBe(true);
  });
});
