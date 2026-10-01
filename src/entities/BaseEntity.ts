export abstract class BaseEntity<T> {
  protected dirty: Record<string, boolean> = {};
  protected original: Partial<T> = {};
  protected attributes: string[] = [];

  constructor(entity: Partial<T>) {
    Object.keys(entity as object).forEach((key) => {
      (this as any)[key] = (entity as any)[key];
      (this.original as any)[key] = (entity as any)[key];
    });
    this.attributes = Object.keys(entity as object);
  }

  set(data: Partial<T>): void {
    Object.keys(data as object).forEach((key) => {
      (this as any)[key] = (data as any)[key];
      this.dirty[key] = true;
      if (!this.attributes.includes(key)) {
        this.attributes.push(key);
      }
    });
    (this as any)['updatedAt'] = new Date().toISOString();
    this.dirty['updatedAt'] = true;
  }

  getDirty(): Partial<T> {
    const result: Partial<T> = {};
    Object.keys(this.dirty).forEach((key) => {
      (result as any)[key] = (this as any)[key];
    });
    return result;
  }

  valueOf(): Partial<T> {
    const result: Partial<T> = {};
    this.attributes.forEach((key) => {
      (result as any)[key] = (this as any)[key];
    });
    return result;
  }

  abstract getKey(): Record<string, string>;
}
