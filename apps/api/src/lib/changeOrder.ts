/**
 * 設計変更・変更契約差額の計算（純粋関数）
 */

export type ChangeLineInput = {
  tree_code: string;
  tree_name: string;
  unit: string;
  before_quantity: number;
  after_quantity: number;
  before_unit_price: number;
  after_unit_price: number;
};

export type ChangeLineResult = ChangeLineInput & {
  quantity_diff: number;
  amount_before: number;
  amount_after: number;
  amount_diff: number;
};

export function computeChangeLine(input: ChangeLineInput): ChangeLineResult {
  const amountBefore = input.before_quantity * input.before_unit_price;
  const amountAfter = input.after_quantity * input.after_unit_price;
  return {
    ...input,
    quantity_diff: input.after_quantity - input.before_quantity,
    amount_before: amountBefore,
    amount_after: amountAfter,
    amount_diff: amountAfter - amountBefore,
  };
}

export function summarizeChangeLines(lines: ChangeLineResult[]) {
  const increase = lines
    .filter((l) => l.amount_diff > 0)
    .reduce((a, l) => a + l.amount_diff, 0);
  const decrease = lines
    .filter((l) => l.amount_diff < 0)
    .reduce((a, l) => a + l.amount_diff, 0);
  return {
    increase,
    decrease,
    net: increase + decrease,
  };
}
