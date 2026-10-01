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
