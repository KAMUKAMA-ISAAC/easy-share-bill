import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { initialsOf } from "@/lib/format";
import { ArrowUpRight, Plus, Users } from "lucide-react";

export const Route = createFileRoute("/_app/groups/")({
  head: () => ({ meta: [{ title: "Groups — Splitit" }] }),
  component: GroupsList,
});

function GroupsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["groups-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("groups")
        .select(
          "id, name, description, color, category, created_at, archived_at, group_members(id)",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
      <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Groups</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize expenses by trip, household, or crew.
          </p>
        </div>
        <Link
          to="/groups/new"
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 font-medium hover:opacity-90 transition shadow-lg shadow-primary/20"
        >
          <Plus className="size-4" /> New group
        </Link>
      </div>

      {isLoading && <div className="text-muted-foreground">Loading…</div>}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Users className="size-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="font-semibold mb-1">No groups yet</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Create one for your roommates, trip, or dinner crew.
          </p>
          <Link
            to="/groups/new"
            className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 font-medium hover:opacity-90 transition"
          >
            <Plus className="size-4" /> Create first group
          </Link>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data?.map((g) => (
          <Link
            key={g.id}
            to="/groups/$id"
            params={{ id: g.id }}
            className="glass-card rounded-2xl p-5 hover:border-border-strong transition group"
          >
            <div className="flex items-start justify-between">
              <div
                className="size-12 rounded-xl grid place-items-center font-display font-semibold text-lg"
                style={{
                  backgroundColor: (g.color ?? "#7C5CFF") + "22",
                  color: g.color ?? "#7C5CFF",
                }}
              >
                {initialsOf(g.name)}
              </div>
              <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground transition" />
            </div>
            <div className="mt-4 font-semibold">{g.name}</div>
            {g.description && (
              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {g.description}
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-2">
              {g.group_members?.length ?? 0} members · {g.category}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
