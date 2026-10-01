/**
 * A product is found by what the shop calls it, not only by what the invoice
 * calls it. Nobody asks for a "clôture grillage double torsion (20m x 2m)".
 */
import { ProductEntity } from '@/entities/ProductEntity';

const make = (over: Record<string, any> = {}) =>
  new ProductEntity({
    id: 'PRODUCT',
    sk: 'PRODUCT#1',
    name: { fr: 'Clôture grillage double torsion (20m x 2m)', ar: 'شبك سياج مضاعف التلاف' },
    code: 'CGDT20',
    priceHT: 75,
    priceTTC: 90,
    ...over,
  } as any);

describe('a product answers to the shop’s own words', () => {
  it('puts the aliases in the same haystack as the name', () => {
    const key = (make({ aliases: ['chabka 20', 'شبكة 20', 'DT20'] }).valueOf() as any).searchKey;

    expect(key).toContain('chabka 20');
    expect(key).toContain('شبكة 20');
    expect(key).toContain('dt20');
    // The formal name still works — aliases are added, not substituted.
    expect(key).toContain('cgdt20');
  });

  it('leaves the key clean when there are none', () => {
    const key = (make().valueOf() as any).searchKey;

    expect(key).not.toMatch(/\s{2,}/);
    expect(key.trim()).toBe(key);
  });

  it('rebuilds the key when only the aliases change', () => {
    // Without this the word is saved and never findable, which looks exactly
    // like the alias feature not working at all.
    const p = make({ aliases: ['chabka 20'] });
    p.set({ aliases: ['chabka 20', 'grillage 20'] });

    expect((p.getDirty() as any).searchKey).toContain('grillage 20');
  });
});

/**
 * Creating a product keeps the names typed with it.
 *
 * The schema accepted `aliases` on create but the use case never passed them
 * to the entity, so the shortcut names entered in the new-product form were
 * dropped on save — the search and the voice assistant then could not find
 * the article by the words the shop actually uses, until someone edited it.
 */
import { CreateProductUseCase } from '../src/functions/products/create/useCase';

jest.mock('../src/libs/journal', () => ({ recordStockMovement: jest.fn() }));

describe('creating a product with its shortcut names', () => {
  it('saves the aliases it was given', async () => {
    const created: any[] = [];
    const repository = { create: async (e: any) => void created.push(e) } as any;

    await new CreateProductUseCase(repository).execute(
      {
        name: { fr: 'Climatiseur Condor 12000 BTU', ar: 'مكيف كوندور 12000' },
        priceHT: 1260,
        taxRate: 19,
        purchasePrice: 1050,
        code: 'CLIM-C12',
        aliases: ['clim 12', 'كليماتيزور 12'],
        stockAvailable: 0,
        categoryId: '6f1c5a90-4f2b-4c8e-9a31-6b0e2d7f4c15',
      },
      'u-1',
    );

    expect(created[0].aliases).toEqual(['clim 12', 'كليماتيزور 12']);
    // And they reach the search index, which is what makes them findable.
    expect(created[0].valueOf().searchKey).toContain('clim 12');
  });
});
