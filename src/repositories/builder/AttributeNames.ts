export class AttributeNames {
  private names: Record<string, string> = {};
  private counter = 0;

  add(attribute: string): string {
    const existing = Object.entries(this.names).find(([, v]) => v === attribute);
    if (existing) return existing[0];
    const placeholder = `#attr${this.counter++}`;
    this.names[placeholder] = attribute;
    return placeholder;
  }

  toObject(): Record<string, string> | undefined {
    return Object.keys(this.names).length > 0 ? { ...this.names } : undefined;
  }
}
