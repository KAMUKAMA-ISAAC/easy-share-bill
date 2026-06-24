/**
 * Splitit splitting engine.
 *
 * Computes per-member amounts given:
 *  - total amount of the expense
 *  - split mode: equal | percentage | custom | itemized
 *  - members participating
 *  - mode-specific inputs (percentages, custom amounts, items with assigned member ids)
 *
 * Always returns amounts that sum exactly to `total` (cents-precision, last
 * member absorbs rounding residual).
 */

export type SplitMode = "equal" | "percentage" | "custom" | "itemized";

export type MemberInput = { id: string; name: string };

export type ItemInput = {
  id?: string;
  name: string;
  price: number;
  quantity?: number;
  assignedMemberIds: string[]; // empty = split equally across all members
};

export type SplitInput =
  | { mode: "equal"; total: number; members: MemberInput[] }
  | {
      mode: "percentage";
      total: number;
      members: MemberInput[];
      percentages: Record<string, number>; // memberId -> 0..100
    }
  | {
      mode: "custom";
      total: number;
      members: MemberInput[];
      amounts: Record<string, number>; // memberId -> amount
    }
  | {
      mode: "itemized";
      total: number;
      members: MemberInput[];
      items: ItemInput[];
      // optional extra (tax/tip) split equally across all members
      extra?: number;
    };

export type SplitResult = {
  perMember: Record<string, number>;
  perMemberPercentage?: Record<string, number>;
  valid: boolean;
  error?: string;
};

const cents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;

function distributeRoundingResidual(
  amountsCents: Record<string, number>,
  targetCents: number,
  memberIds: string[],
): Record<string, number> {
  const sum = Object.values(amountsCents).reduce((a, b) => a + b, 0);
  const diff = targetCents - sum;
  if (diff === 0 || memberIds.length === 0) return amountsCents;
  // Distribute ±1 cent to first |diff| members
  const out = { ...amountsCents };
  const sign = diff > 0 ? 1 : -1;
  let remaining = Math.abs(diff);
  for (let i = 0; remaining > 0 && i < memberIds.length; i++) {
    out[memberIds[i]] = (out[memberIds[i]] ?? 0) + sign;
    remaining--;
  }
  return out;
}

export function computeSplit(input: SplitInput): SplitResult {
  const memberIds = input.members.map((m) => m.id);
  const totalCents = cents(input.total);

  if (input.total <= 0) {
    return { perMember: {}, valid: false, error: "Amount must be greater than 0" };
  }
  if (memberIds.length === 0) {
    return { perMember: {}, valid: false, error: "Add at least one member" };
  }

  if (input.mode === "equal") {
    const base = Math.floor(totalCents / memberIds.length);
    let amountsCents: Record<string, number> = {};
    for (const id of memberIds) amountsCents[id] = base;
    amountsCents = distributeRoundingResidual(amountsCents, totalCents, memberIds);
    const perMember: Record<string, number> = {};
    for (const id of memberIds) perMember[id] = fromCents(amountsCents[id]);
    return { perMember, valid: true };
  }

  if (input.mode === "percentage") {
    const sum = memberIds.reduce((a, id) => a + (input.percentages[id] ?? 0), 0);
    if (Math.abs(sum - 100) > 0.01) {
      return {
        perMember: {},
        valid: false,
        error: `Percentages must add to 100% (currently ${sum.toFixed(1)}%)`,
      };
    }
    let amountsCents: Record<string, number> = {};
    for (const id of memberIds) {
      amountsCents[id] = Math.round((totalCents * (input.percentages[id] ?? 0)) / 100);
    }
    amountsCents = distributeRoundingResidual(amountsCents, totalCents, memberIds);
    const perMember: Record<string, number> = {};
    for (const id of memberIds) perMember[id] = fromCents(amountsCents[id]);
    return { perMember, valid: true, perMemberPercentage: input.percentages };
  }

  if (input.mode === "custom") {
    const amountsCents: Record<string, number> = {};
    for (const id of memberIds) amountsCents[id] = cents(input.amounts[id] ?? 0);
    const sum = Object.values(amountsCents).reduce((a, b) => a + b, 0);
    if (sum !== totalCents) {
      return {
        perMember: {},
        valid: false,
        error: `Custom amounts must equal total (${fromCents(sum).toFixed(2)} vs ${input.total.toFixed(2)})`,
      };
    }
    const perMember: Record<string, number> = {};
    for (const id of memberIds) perMember[id] = fromCents(amountsCents[id]);
    return { perMember, valid: true };
  }

  // itemized
  if (!input.items.length) {
    return { perMember: {}, valid: false, error: "Add at least one item" };
  }
  for (const it of input.items) {
    if (it.price < 0) {
      return { perMember: {}, valid: false, error: `"${it.name || "Item"}" has a negative price` };
    }
    if ((it.quantity ?? 1) <= 0) {
      return { perMember: {}, valid: false, error: `"${it.name || "Item"}" needs a quantity > 0` };
    }
  }

  const amountsCents: Record<string, number> = {};
  for (const id of memberIds) amountsCents[id] = 0;

  let itemsTotalCents = 0;
  for (const item of input.items) {
    const itemCents = cents(item.price * (item.quantity ?? 1));
    itemsTotalCents += itemCents;
    const assignees = item.assignedMemberIds.length ? item.assignedMemberIds : memberIds;
    const base = Math.floor(itemCents / assignees.length);
    const per: Record<string, number> = {};
    for (const id of assignees) per[id] = base;
    const fixed = distributeRoundingResidual(per, itemCents, assignees);
    for (const id of assignees) amountsCents[id] += fixed[id];
  }

  // extras (tax/tip) split equally
  const extraCents = cents(input.extra ?? 0);
  if (extraCents > 0) {
    const base = Math.floor(extraCents / memberIds.length);
    const per: Record<string, number> = {};
    for (const id of memberIds) per[id] = base;
    const fixed = distributeRoundingResidual(per, extraCents, memberIds);
    for (const id of memberIds) amountsCents[id] += fixed[id];
  }

  // Strict validation: items + extras MUST equal expense total — no silent absorb.
  const grand = itemsTotalCents + extraCents;
  if (grand !== totalCents) {
    const diff = fromCents(grand - totalCents);
    const sign = diff > 0 ? "over" : "under";
    return {
      perMember: {},
      valid: false,
      error: `Items total ${fromCents(grand).toFixed(2)} is ${sign} expense by ${Math.abs(diff).toFixed(2)}`,
    };
  }

  const perMember: Record<string, number> = {};
  for (const id of memberIds) perMember[id] = fromCents(amountsCents[id]);
  return { perMember, valid: true };
}
