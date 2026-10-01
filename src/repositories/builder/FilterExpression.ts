import { Operator } from './types';
import { AttributeNames } from './AttributeNames';
import { AttributeValues } from './AttributeValues';

interface Condition {
  expr: string;
  connector: 'AND' | 'OR';
}

export class FilterExpression {
  private conditions: Condition[] = [];

  add(
    attribute: string,
    operator: Operator,
    value: any,
    names: AttributeNames,
    values: AttributeValues,
    connector: 'AND' | 'OR' = 'AND'
  ): void {
    const namePh = names.add(attribute);
    let expr: string;

    switch (operator) {
      case 'contains':
        expr = `contains(${namePh}, ${values.add(value)})`;
        break;
      case 'begins_with':
        expr = `begins_with(${namePh}, ${values.add(value)})`;
        break;
      case 'between':
        if (!Array.isArray(value) || value.length !== 2) {
          throw new Error('between operator requires an array of exactly 2 values');
        }
        expr = `${namePh} BETWEEN ${values.add(value[0])} AND ${values.add(value[1])}`;
        break;
      case 'attribute_not_exists':
        expr = `attribute_not_exists(${namePh})`;
        break;
      default:
        expr = `${namePh} ${operator} ${values.add(value)}`;
    }

    this.conditions.push({ expr, connector });
  }

  addRaw(expr: string, connector: 'AND' | 'OR' = 'AND'): void {
    this.conditions.push({ expr, connector });
  }

  build(): string | undefined {
    if (this.conditions.length === 0) return undefined;
    return this.conditions
      .map((c, i) => (i === 0 ? c.expr : `${c.connector} ${c.expr}`))
      .join(' ');
  }
}
