import { useEffect, useMemo, useRef } from "react";
import { computeSplit, type MemberInput, type SplitMode, type ItemInput } from "@/lib/split-engine";
import { formatMoney, initialsOf } from "@/lib/format";
import { AlertTriangle, Check, DollarSign, Equal, ListChecks, Percent } from "lucide-react";

interface Props {
  members: MemberInput[];
  total: number;
  currency: string;
  items?: ItemInput[];
  value: {
    mode: SplitMode;
    percentages: Record<string, number>;
    amounts: Record<string, number>;
    items: ItemInput[];
  };
  onChange: (v: Props["value"]) => void;
  onResultChange?: (perMember: Record<string, number>, valid: boolean, error?: string) => void;
}

const MODES: { id: SplitMode; label: string; icon: typeof Equal }[] = [
  { id: "equal", label: "Equal", icon: Equal },
  { id: "percentage", label: "Percent", icon: Percent },
  { id: "custom", label: "Custom", icon: DollarSign },
  { id: "itemized", label: "Items", icon: ListChecks },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function SplitEditor({ members, total, currency, value, onChange, onResultChange }: Props) {
  // Recompute on every render — cheap and ensures the view always matches inputs.
  const result = useMemo(() => {
    if (value.mode === "equal") return computeSplit({ mode: "equal", total, members });
    if (value.mode === "percentage")
      return computeSplit({ mode: "percentage", total, members, percentages: value.percentages });
    if (value.mode === "custom")
      return computeSplit({ mode: "custom", total, members, amounts: value.amounts });
    return computeSplit({ mode: "itemized", total, members, items: value.items });
  }, [value, total, members]);

  // Emit real-time validity to parent whenever it changes.
  const cbRef = useRef(onResultChange);
  cbRef.current = onResultChange;
  useEffect(() => {
    cbRef.current?.(result.perMember, result.valid, result.error);
  }, [result]);

  const update = (patch: Partial<Props["value"]>) => onChange({ ...value, ...patch });

  // Running totals used for live feedback per mode.
  const percentSum = useMemo(
    () => members.reduce((a, m) => a + (Number(value.percentages[m.id]) || 0), 0),
    [members, value.percentages],
  );
  const customSum = useMemo(
    () => members.reduce((a, m) => a + (Number(value.amounts[m.id]) || 0), 0),
    [members, value.amounts],
  );
  const itemsSum = useMemo(
    () =>
      value.items.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0),
    [value.items],
  );

  const distributeEqualPercent = () => {
    const each = round2(100 / Math.max(1, members.length));
    const next: Record<string, number> = {};
    members.forEach((m) => (next[m.id] = each));
    // absorb residual on the first member
    const diff = round2(100 - members.length * each);
    if (members.length) next[members[0].id] = round2(next[members[0].id] + diff);
    update({ percentages: next });
  };

  const distributeEqualCustom = () => {
    const each = round2(total / Math.max(1, members.length));
    const next: Record<string, number> = {};
    members.forEach((m) => (next[m.id] = each));
    const diff = round2(total - members.length * each);
    if (members.length) next[members[0].id] = round2(next[members[0].id] + diff);
    update({ amounts: next });
  };

  return (
    <div className="space-y-4">
      {/* mode tabs */}
      <div className="grid grid-cols-4 gap-1 bg-muted/40 p-1 rounded-xl">
        {MODES.map((m) => {
          const active = value.mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => update({ mode: m.id })}
              className={`rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1.5 transition ${
                active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <m.icon className="size-3.5" />
              {m.label}
            </button>
          );
        })}
      </div>

      {value.mode === "equal" && (
        <div className="space-y-2">
          {members.map((m) => (
            <MemberRow key={m.id} member={m}>
              <span className="font-numeric text-sm">
                {formatMoney(result.perMember[m.id] ?? 0, currency)}
              </span>
            </MemberRow>
          ))}
        </div>
      )}

      {value.mode === "percentage" && (
        <div className="space-y-2">
          {members.map((m) => {
            const pct = value.percentages[m.id] ?? 0;
            const invalid = pct < 0 || pct > 100;
            return (
              <MemberRow key={m.id} member={m}>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    value={pct}
                    onChange={(e) =>
                      update({
                        percentages: { ...value.percentages, [m.id]: Number(e.target.value) },
                      })
                    }
                    className={`w-20 rounded-lg bg-input border px-2 py-1 text-sm text-right outline-none focus:border-primary ${
                      invalid ? "border-destructive" : "border-border"
                    }`}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  <span className="font-numeric text-xs w-16 text-right text-muted-foreground">
                    {formatMoney(result.perMember[m.id] ?? 0, currency)}
                  </span>
                </div>
              </MemberRow>
            );
          })}
          <RunningTotal
            label="Total"
            currentLabel={`${percentSum.toFixed(1)}%`}
            targetLabel="100.0%"
            delta={percentSum - 100}
            formatDelta={(d) => `${d > 0 ? "+" : ""}${d.toFixed(1)}%`}
            onFix={distributeEqualPercent}
            fixLabel="Split equally"
          />
        </div>
      )}

      {value.mode === "custom" && (
        <div className="space-y-2">
          {members.map((m) => {
            const amt = value.amounts[m.id] ?? 0;
            const invalid = amt < 0;
            return (
              <MemberRow key={m.id} member={m}>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={amt}
                  onChange={(e) =>
                    update({ amounts: { ...value.amounts, [m.id]: Number(e.target.value) } })
                  }
                  className={`w-28 rounded-lg bg-input border px-2 py-1 text-sm text-right font-numeric outline-none focus:border-primary ${
                    invalid ? "border-destructive" : "border-border"
                  }`}
                />
              </MemberRow>
            );
          })}
          <RunningTotal
            label="Total"
            currentLabel={formatMoney(customSum, currency)}
            targetLabel={formatMoney(total, currency)}
            delta={customSum - total}
            formatDelta={(d) => `${d > 0 ? "+" : ""}${formatMoney(d, currency)}`}
            onFix={distributeEqualCustom}
            fixLabel="Split equally"
          />
        </div>
      )}

      {value.mode === "itemized" && (
        <div className="space-y-3">
          {value.items.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              No items. Scan a receipt or add items below.
            </div>
          )}
          {value.items.map((item, i) => {
            const priceInvalid = item.price < 0;
            const unassigned = item.assignedMemberIds.length === 0;
            return (
              <div key={i} className="glass-card rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={item.name}
                    onChange={(e) =>
                      update({
                        items: value.items.map((it, j) =>
                          i === j ? { ...it, name: e.target.value } : it,
                        ),
                      })
                    }
                    className="flex-1 bg-transparent text-sm font-medium outline-none"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={item.price}
                    onChange={(e) =>
                      update({
                        items: value.items.map((it, j) =>
                          i === j ? { ...it, price: Number(e.target.value) } : it,
                        ),
                      })
                    }
                    className={`w-20 rounded-lg bg-input border px-2 py-1 text-sm text-right font-numeric outline-none focus:border-primary ${
                      priceInvalid ? "border-destructive" : "border-border"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      update({ items: value.items.filter((_, j) => j !== i) })
                    }
                    className="text-xs text-muted-foreground hover:text-destructive px-1"
                    aria-label="Remove item"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {members.map((m) => {
                    const assigned = item.assignedMemberIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          const next = assigned
                            ? item.assignedMemberIds.filter((x) => x !== m.id)
                            : [...item.assignedMemberIds, m.id];
                          update({
                            items: value.items.map((it, j) =>
                              i === j ? { ...it, assignedMemberIds: next } : it,
                            ),
                          });
                        }}
                        className={`text-xs px-2 py-1 rounded-md transition ${
                          assigned
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-secondary"
                        }`}
                      >
                        {m.name}
                      </button>
                    );
                  })}
                  {unassigned && (
                    <span className="text-[10px] text-muted-foreground self-center ml-1 inline-flex items-center gap-1">
                      <AlertTriangle className="size-3" /> defaults to everyone
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() =>
              update({
                items: [
                  ...value.items,
                  { name: "Item", price: 0, quantity: 1, assignedMemberIds: [] },
                ],
              })
            }
            className="w-full rounded-xl border border-dashed border-border py-2 text-sm text-muted-foreground hover:text-foreground hover:border-primary transition"
          >
            + Add item
          </button>

          <RunningTotal
            label="Items total"
            currentLabel={formatMoney(itemsSum, currency)}
            targetLabel={formatMoney(total, currency)}
            delta={itemsSum - total}
            formatDelta={(d) => `${d > 0 ? "+" : ""}${formatMoney(d, currency)}`}
          />

          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
            {members.map((m) => (
              <div key={m.id} className="flex justify-between">
                <span>{m.name}</span>
                <span className="font-numeric">
                  {formatMoney(result.perMember[m.id] ?? 0, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!result.valid && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-2 flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" /> {result.error}
        </div>
      )}
      {result.valid && (
        <div className="rounded-xl bg-accent/10 border border-accent/30 text-accent text-sm px-4 py-2 flex items-center gap-2">
          <Check className="size-4" /> Splits balance to {formatMoney(total, currency)}
        </div>
      )}
    </div>
  );
}

function MemberRow({ member, children }: { member: MemberInput; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="size-8 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 grid place-items-center text-xs font-medium">
        {initialsOf(member.name)}
      </div>
      <div className="flex-1 text-sm">{member.name}</div>
      {children}
    </div>
  );
}

function RunningTotal({
  label,
  currentLabel,
  targetLabel,
  delta,
  formatDelta,
  onFix,
  fixLabel,
}: {
  label: string;
  currentLabel: string;
  targetLabel: string;
  delta: number;
  formatDelta: (d: number) => string;
  onFix?: () => void;
  fixLabel?: string;
}) {
  const off = Math.abs(delta) > 0.005;
  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
        off
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-border bg-muted/30 text-muted-foreground"
      }`}
    >
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-2 font-numeric">
        <span>{currentLabel}</span>
        <span className="opacity-50">/ {targetLabel}</span>
        {off && <span className="ml-1">({formatDelta(delta)})</span>}
        {off && onFix && (
          <button
            type="button"
            onClick={onFix}
            className="ml-2 rounded-md border border-current/40 px-2 py-0.5 hover:bg-current/10"
          >
            {fixLabel}
          </button>
        )}
      </div>
    </div>
  );
}
