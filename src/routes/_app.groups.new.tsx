import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createGroup } from "@/lib/expenses.functions";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, X } from "lucide-react";

export const Route = createFileRoute("/_app/groups/new")({
  head: () => ({ meta: [{ title: "New group — Splitit" }] }),
  component: NewGroup,
});

const CATEGORIES = ["trip", "roommates", "friends", "couple", "campus", "work", "general"];
const COLORS = ["#7C5CFF", "#00D49F", "#FF6B5B", "#FFB547", "#3DBEFF", "#E879F9"];

function NewGroup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [color, setColor] = useState(COLORS[0]);
  const [members, setMembers] = useState<{ display_name: string; email: string }[]>([]);
  const [mName, setMName] = useState("");
  const [mEmail, setMEmail] = useState("");

  const createFn = useServerFn(createGroup);
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof createGroup>[0]["data"]) => createFn({ data: input }),
    onSuccess: (res) => {
      toast.success("Group created");
      navigate({ to: "/groups/$id", params: { id: res.id } });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create group"),
  });

  const addMember = () => {
    if (!mName.trim()) return;
    setMembers([...members, { display_name: mName.trim(), email: mEmail.trim() }]);
    setMName("");
    setMEmail("");
  };

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
      <Link
        to="/groups"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-4" /> Groups
      </Link>
      <h1 className="font-display text-3xl font-semibold tracking-tight mb-1">New group</h1>
      <p className="text-sm text-muted-foreground mb-8">Add a name and invite people.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          mutation.mutate({
            name: name.trim(),
            description,
            category,
            color,
            members,
          });
        }}
        className="space-y-6"
      >
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Weekend in Lisbon"
              className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary transition"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary transition resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary transition capitalize"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Color
              </label>
              <div className="mt-1 flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`size-9 rounded-lg transition ${
                      color === c ? "ring-2 ring-offset-2 ring-offset-background ring-primary" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h3 className="font-semibold mb-1">Members</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Add by name. Email is optional — guests don't need an account.
          </p>

          <div className="space-y-2 mb-4">
            {members.map((m, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-muted/40 rounded-xl px-4 py-2.5"
              >
                <div className="size-8 rounded-full bg-primary/20 text-primary grid place-items-center text-sm font-medium">
                  {m.display_name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{m.display_name}</div>
                  {m.email && (
                    <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setMembers(members.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              value={mName}
              onChange={(e) => setMName(e.target.value)}
              placeholder="Name"
              className="rounded-xl bg-input border border-border px-3 py-2 text-sm outline-none focus:border-primary transition"
            />
            <input
              value={mEmail}
              onChange={(e) => setMEmail(e.target.value)}
              placeholder="email (optional)"
              type="email"
              className="rounded-xl bg-input border border-border px-3 py-2 text-sm outline-none focus:border-primary transition"
            />
            <button
              type="button"
              onClick={addMember}
              className="rounded-xl bg-muted hover:bg-secondary px-3 inline-flex items-center justify-center"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link
            to="/groups"
            className="rounded-xl border border-border px-5 py-2.5 hover:bg-muted transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-2.5 font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Create group
          </button>
        </div>
      </form>
    </div>
  );
}
