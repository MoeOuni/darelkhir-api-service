export class AttributeValues {
  private values: Record<string, any> = {};
  private counter = 0;

  add(value: any): string {
    const placeholder = `:val${this.counter++}`;
    this.values[placeholder] = value;
    return placeholder;
  }

  toObject(): Record<string, any> | undefined {
    return Object.keys(this.values).length > 0 ? { ...this.values } : undefined;
  }
}
