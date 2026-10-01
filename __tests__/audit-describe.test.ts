import { describeAudit } from '@libs/audit-describe';

/**
 * What the journal keeps, so a shop owner can read what happened.
 *
 * The dashboard writes the sentence from these facts. An entry that holds none
 * of them came out as "Amine a fixé le prix de pour à DT" — a row that names
 * neither the article, nor the client, nor the figure, and that nobody can act
 * on. So the facts are chased through the response, then the request, then the
 * address the request came in on, and an entry is never left anonymous.
 */

const priceResponse = {
  id: 'CLIENT_PRICE',
  sk: 'CLIENT_PRICE#c#p',
  dataType: 'CLIENT_PRICE',
  clientId: '97d0d0a9-5bf5-4c92-b59a-c7aba0ada547',
  productId: '7d1c5a90-4f2b-4c8e-9a31-6b0e2d7f4c15',
  price: 95,
  listPrice: 100,
  note: 'Convenu au comptoir',
  clientName: 'Abd Elkhalk Salhi',
  productName: 'Ciment gris',
  productCode: 'CGST1',
};

const pathParams = {
  id: '97d0d0a9-5bf5-4c92-b59a-c7aba0ada547',
  productId: '7d1c5a90-4f2b-4c8e-9a31-6b0e2d7f4c15',
};

describe('a price agreed with one client', () => {
  it('names the article, the client and the figure', () => {
    const { meta } = describeAudit('client.price', priceResponse, { price: 95 }, pathParams);

    expect(meta.clientName).toBe('Abd Elkhalk Salhi');
    expect(meta.productName).toBe('Ciment gris');
    expect(meta.productCode).toBe('CGST1');
    expect(meta.price).toBe(95);
  });

  it('keeps what the catalogue asked, so the deal can be judged', () => {
    // 95 is generous or miserly depending on what it replaced.
    const { meta } = describeAudit('client.price', priceResponse, {}, pathParams);

    expect(meta.listPrice).toBe(100);
    expect(meta.note).toBe('Convenu au comptoir');
  });

  it('still names the article when only the request carried the figure', () => {
    const thin = { clientId: pathParams.id, productId: pathParams.productId };
    const { meta } = describeAudit('client.price', thin, { price: 95 }, pathParams);

    expect(meta.price).toBe(95);
    // The client is the entry's own reference; the article is not, so without
    // this the row could not say which product the price was for.
    expect(meta.productId).toBe(pathParams.productId);
  });

  it('marks a price that was dropped rather than written', () => {
    const { meta } = describeAudit(
      'client.price',
      { ...priceResponse, cleared: true },
      {},
      pathParams,
    );

    expect(meta.cleared).toBe(true);
  });

  it('can be found by searching for any of it', () => {
    const { searchKey } = describeAudit('client.price', priceResponse, {}, pathParams);

    expect(searchKey).toContain('salhi');
    expect(searchKey).toContain('ciment gris');
    expect(searchKey).toContain('cgst1');
  });
});

describe('an entry whose response said nothing', () => {
  it('falls back to the address, rather than being stored anonymous', () => {
    const { meta } = describeAudit('product.image_delete', {}, {}, {
      id: '7d1c5a90-4f2b-4c8e-9a31-6b0e2d7f4c15',
    });

    expect(meta.id).toBe('7d1c5a90-4f2b-4c8e-9a31-6b0e2d7f4c15');
  });

  it('is left empty when there is genuinely nothing to say', () => {
    // Settings has no path parameters and no named record. An empty meta is
    // honest here; the action alone tells the whole story.
    expect(describeAudit('settings.update', {}, {}, {}).meta).toEqual({});
  });

  it('does not bury the real facts under the address when it has them', () => {
    const { meta } = describeAudit(
      'order.update',
      { orderNumber: 88, clientName: 'Slim Ben Ali', total: 1320, status: 'confirmed' },
      {},
      { id: 'some-order-uuid' },
    );

    expect(meta.orderNumber).toBe(88);
    expect(meta).not.toHaveProperty('id');
  });
});

describe('the facts an order entry keeps', () => {
  it('holds what was in it, so the row answers "what did he change"', () => {
    const { meta } = describeAudit(
      'order.create',
      {
        orderNumber: 88,
        clientName: 'Slim Ben Ali',
        total: 1320,
        items: [
          { quantity: 40, name: 'Ciment gris' },
          { quantity: 12, name: 'Fil galvanisé' },
        ],
      },
      {},
      null,
    );

    expect(meta.itemCount).toBe(2);
    expect(meta.items).toBe('40× Ciment gris, 12× Fil galvanisé');
  });
});
