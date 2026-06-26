import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { initialsOf } from "@/lib/format";
import { ArrowLeft, Loader2, Save, User as UserIcon, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({ meta: [{ title: "Profile — Splitit" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const profileQ = useQuery({
    queryKey: ["my-profile-full"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, email")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!profileQ.data) return;
    setDisplayName(profileQ.data.display_name ?? "");
    setAvatarUrl(profileQ.data.avatar_url ?? "");
  }, [profileQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName || null,
          avatar_url: avatarUrl || null,
        })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Profile updated"),
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  if (loading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const name = displayName || user?.email?.split("@")[0] || "You";

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
      <button
        onClick={() => navigate({ to: "/dashboard" })}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-4" /> Back
      </button>

      <h1 className="font-display text-3xl font-semibold tracking-tight mb-1">Profile</h1>
      <p className="text-sm text-muted-foreground mb-8">
        How you appear to friends and group members.
      </p>

      <div className="glass-card rounded-2xl p-5 mb-5">
        <div className="flex items-center gap-4 mb-6">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={name}
              className="size-16 rounded-full object-cover bg-muted"
            />
          ) : (
            <div className="size-16 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 grid place-items-center text-xl font-semibold">
              {initialsOf(name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold truncate">{name}</p>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Mail className="size-3" /> {user?.email}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
              <UserIcon className="size-3" /> Display name
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Avatar URL
            </label>
            <input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
              className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Paste a link to an image. Leave blank to use your initials.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-6 py-2.5 font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save profile
        </button>
      </div>
    </div>
  );
}
