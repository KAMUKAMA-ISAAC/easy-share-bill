import { useState } from "react";
import { computeSplit, type MemberInput, type SplitMode, type ItemInput } from "@/lib/split-engine";
import { formatMoney } from "@/lib/format";
import { initialsOf } from "@/lib/format";
import { Check, Equal, Percent, DollarSign, ListChecks } from "lucide-react";

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

export function SplitEditor({ members, total, currency, value, onChange, onResultChange }: Props) {
  const result = (() => {
    if (value.mode === "equal") return computeSplit({ mode: "equal", total, members });
    if (value.mode === "percentage")
      return computeSplit({ mode: "percentage", total, members, percentages: value.percentages });
    if (value.mode === "custom")
      return computeSplit({ mode: "custom", total, members, amounts: value.amounts });
    return computeSplit({ mode: "itemized", total, members, items: value.items });
  })();

  // emit result lazily
  useState(() => {
    onResultChange?.(result.perMember, result.valid, result.error);
  });

  const update = (patch: Partial<Props["value"]>) => {
    const next = { ...value, ...patch };
    onChange(next);
    let r;
    if (next.mode === "equal") r = computeSplit({ mode: "equal", total, members });
    else if (next.mode === "percentage")
      r = computeSplit({ mode: "percentage", total, members, percentages: next.percentages });
    else if (next.mode === "custom")
      r = computeSplit({ mode: "custom", total, members, amounts: next.amounts });
    else r = computeSplit({ mode: "itemized", total, members, items: next.items });
    onResultChange?.(r.perMember, r.valid, r.error);
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

      {/* per-mode controls */}
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
          {members.map((m) => (
            <MemberRow key={m.id} member={m}>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={value.percentages[m.id] ?? 0}
                  onChange={(e) =>
                    update({
                      percentages: { ...value.percentages, [m.id]: Number(e.target.value) },
                    })
                  }
                  className="w-20 rounded-lg bg-input border border-border px-2 py-1 text-sm text-right outline-none focus:border-primary"
                />
                <span className="text-xs text-muted-foreground">%</span>
                <span className="font-numeric text-xs w-16 text-right text-muted-foreground">
                  {formatMoney(result.perMember[m.id] ?? 0, currency)}
                </span>
              </div>
            </MemberRow>
          ))}
        </div>
      )}

      {value.mode === "custom" && (
        <div className="space-y-2">
          {members.map((m) => (
            <MemberRow key={m.id} member={m}>
              <input
                type="number"
                step="0.01"
                value={value.amounts[m.id] ?? 0}
                onChange={(e) =>
                  update({ amounts: { ...value.amounts, [m.id]: Number(e.target.value) } })
                }
                className="w-28 rounded-lg bg-input border border-border px-2 py-1 text-sm text-right font-numeric outline-none focus:border-primary"
              />
            </MemberRow>
          ))}
        </div>
      )}

      {value.mode === "itemized" && (
        <div className="space-y-3">
          {value.items.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              No items. Scan a receipt or add items below.
            </div>
          )}
          {value.items.map((item, i) => (
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
                  value={item.price}
                  onChange={(e) =>
                    update({
                      items: value.items.map((it, j) =>
                        i === j ? { ...it, price: Number(e.target.value) } : it,
                      ),
                    })
                  }
                  className="w-20 rounded-lg bg-input border border-border px-2 py-1 text-sm text-right font-numeric outline-none focus:border-primary"
                />
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
                {item.assignedMemberIds.length === 0 && (
                  <span className="text-[10px] text-muted-foreground self-center ml-1">
                    everyone
                  </span>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              update({
                items: [...value.items, { name: "Item", price: 0, quantity: 1, assignedMemberIds: [] }],
              })
            }
            className="w-full rounded-xl border border-dashed border-border py-2 text-sm text-muted-foreground hover:text-foreground hover:border-primary transition"
          >
            + Add item
          </button>
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
        <div className="rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-2">
          {result.error}
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
