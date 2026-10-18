export interface BuiltinSequence {
  /** Base name used with a subscript index: 'p' for p_n. */
  name: string;
  title: string;
  description: string;
  /** Smallest valid index. */
  firstIndex: number;
}
