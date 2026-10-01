export type Operator =
  | '='
  | '<>'
  | '<'
  | '>'
  | '<='
  | '>='
  | 'begins_with'
  | 'between'
  | 'attribute_not_exists'
  | 'contains';

export interface PaginatedResult<T> {
  items: T[];
  cursor?: string;
  count: number;
}
