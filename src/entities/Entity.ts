import { BaseEntity } from './BaseEntity';

const GSI_KEYS = ['tk', 'fk', 'fhk', 'sihk', 'sehk'] as const;
type GsiKey = (typeof GSI_KEYS)[number];

export abstract class Entity<T> extends BaseEntity<T> {
  /**
   * Declares which domain fields compose each GSI placeholder key.
   * Example: { tk: ['status', 'name'], fk: ['categoryId'] }
   * Stored as "value1#value2".
   */
  protected abstract getIndexMap(): Partial<Record<GsiKey, string[]>>;

  /** Recomputes GSI composite keys from a source object. */
  private computeIndexes(source: Record<string, any>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [gsiKey, fields] of Object.entries(this.getIndexMap())) {
      if (!fields) continue;
      const values = fields.map((f) => source[f]);
      if (values.every((v) => v !== undefined && v !== null && v !== '')) {
        result[gsiKey] = values.join('#');
      }
    }
    return result;
  }

  getDirty(): Partial<T> {
    const base = super.getDirty() as Record<string, any>;

    // Only recompute a GSI key if at least one of its component fields changed
    const gsiUpdates: Record<string, string> = {};
    for (const [gsiKey, fields] of Object.entries(this.getIndexMap())) {
      if (!fields) continue;
      if (fields.some((f) => this.dirty[f])) {
        const values = fields.map((f) => (this as any)[f]);
        if (values.every((v) => v !== undefined && v !== null && v !== '')) {
          gsiUpdates[gsiKey] = values.join('#');
        }
      }
    }

    return { ...base, ...gsiUpdates } as Partial<T>;
  }

  valueOf(): Partial<T> {
    const base = super.valueOf() as Record<string, any>;
    const gsi = this.computeIndexes(base);
    return { ...base, ...gsi } as Partial<T>;
  }

  getKey(): Record<string, string> {
    return { id: (this as any).id, sk: (this as any).sk };
  }

  /** Returns a public-safe DTO — NEVER includes GSI placeholder keys. */
  abstract toPublicDTO(): Record<string, any>;
}
