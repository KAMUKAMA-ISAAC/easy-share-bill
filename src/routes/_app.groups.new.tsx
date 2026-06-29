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
    mutationFn: (input: any) => createFn({ data: input }),
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
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-4 sm:py-8">
        {/* Back button */}
        <Link
          to="/groups"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 sm:mb-4 touch-manipulation"
        >
          <ArrowLeft className="size-4" /> Groups
        </Link>
        
        {/* Header */}
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mb-1">New group</h1>
        <p className="text-sm text-muted-foreground mb-6 sm:mb-8">Add a name and invite people.</p>

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
          className="space-y-4 sm:space-y-6"
        >
          {/* Group Details Card */}
          <div className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Name
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Weekend in Lisbon"
                className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 sm:py-3 text-sm sm:text-base outline-none focus:border-primary transition placeholder:text-muted-foreground/60"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 sm:py-3 text-sm sm:text-base outline-none focus:border-primary transition resize-none placeholder:text-muted-foreground/60"
              />
            </div>
            
            {/* Category & Color - Stacked on mobile, side-by-side on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 sm:py-3 text-sm sm:text-base outline-none focus:border-primary transition capitalize appearance-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Color
                </label>
                <div className="mt-1 flex gap-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`size-8 sm:size-9 rounded-lg transition touch-manipulation ${
                        color === c ? "ring-2 ring-offset-2 ring-offset-background ring-primary" : ""
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Members Card */}
          <div className="glass-card rounded-2xl p-4 sm:p-6">
            <h3 className="font-semibold text-base sm:text-lg mb-1">Members</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Add by name. Email is optional — guests don't need an account.
            </p>

            {/* Member List */}
            <div className="space-y-2 mb-4">
              {members.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 bg-muted/40 rounded-xl px-3 sm:px-4 py-2.5"
                >
                  <div className="size-8 rounded-full bg-primary/20 text-primary grid place-items-center text-sm font-medium shrink-0">
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
                    className="text-muted-foreground hover:text-destructive p-1 touch-manipulation"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Member Inputs - Stacked on mobile */}
            <div className="flex flex-col sm:grid sm:grid-cols-[1fr_1fr_auto] gap-2">
              <input
                value={mName}
                onChange={(e) => setMName(e.target.value)}
                placeholder="Name"
                className="w-full rounded-xl bg-input border border-border px-3 sm:px-4 py-2.5 sm:py-3 text-sm outline-none focus:border-primary transition placeholder:text-muted-foreground/60"
              />
              <input
                value={mEmail}
                onChange={(e) => setMEmail(e.target.value)}
                placeholder="email (optional)"
                type="email"
                className="w-full rounded-xl bg-input border border-border px-3 sm:px-4 py-2.5 sm:py-3 text-sm outline-none focus:border-primary transition placeholder:text-muted-foreground/60"
              />
              <button
                type="button"
                onClick={addMember}
                className="w-full sm:w-auto rounded-xl bg-muted hover:bg-secondary px-4 py-2.5 sm:py-3 inline-flex items-center justify-center gap-1.5 text-sm font-medium touch-manipulation"
              >
                <Plus className="size-4" /> Add
              </button>
            </div>
          </div>

          {/* Action Buttons - Stacked on mobile */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
            <Link
              to="/groups"
              className="w-full sm:w-auto rounded-xl border border-border px-5 py-3 sm:py-2.5 text-center hover:bg-muted transition touch-manipulation"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-3 sm:py-2.5 font-medium hover:opacity-90 transition disabled:opacity-50 touch-manipulation"
            >
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Create group
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
