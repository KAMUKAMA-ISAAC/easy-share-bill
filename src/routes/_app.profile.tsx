import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { initialsOf } from "@/lib/format";
import {
  ArrowLeft,
  Loader2,
  Save,
  User as UserIcon,
  Mail,
  Phone,
  Camera,
  Trash2,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({ meta: [{ title: "Profile — Splitit" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const profileQ = useQuery({
    queryKey: ["my-profile-full"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, email, phone")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!profileQ.data) return;
    setDisplayName(profileQ.data.display_name ?? "");
    setPhone((profileQ.data as any).phone ?? "");
    setAvatarPath(profileQ.data.avatar_url ?? null);
  }, [profileQ.data]);

  // Resolve avatar URL: signed URL for storage paths, or use as-is for http URLs
  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (!avatarPath) {
        setAvatarPreview(null);
        return;
      }
      if (avatarPath.startsWith("http")) {
        setAvatarPreview(avatarPath);
        return;
      }
      const { data } = await supabase.storage
        .from("avatars")
        .createSignedUrl(avatarPath, 60 * 60);
      if (!cancelled) setAvatarPreview(data?.signedUrl ?? null);
    }
    resolve();
    return () => {
      cancelled = true;
    };
  }, [avatarPath]);

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: path })
        .eq("id", user.id);
      if (dbErr) throw dbErr;
      setAvatarPath(path);
      toast.success("Photo updated");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    if (!user) return;
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    setAvatarPath(null);
    toast.success("Photo removed");
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName || null,
          phone: phone || null,
        } as any)
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Profile saved"),
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
          <div className="relative">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt={name}
                className="size-20 rounded-full object-cover bg-muted"
              />
            ) : (
              <div className="size-20 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 grid place-items-center text-2xl font-semibold">
                {initialsOf(name)}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 size-8 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg hover:opacity-90 transition disabled:opacity-50"
              title="Change photo"
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
                e.target.value = "";
              }}
            />
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">{name}</p>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Mail className="size-3" /> {user?.email}
            </p>
            {avatarPath && (
              <button
                onClick={removeAvatar}
                className="text-xs text-destructive hover:underline inline-flex items-center gap-1 mt-1"
              >
                <Trash2 className="size-3" /> Remove photo
              </button>
            )}
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
            <label className="text-xs uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
              <Phone className="size-3" /> Phone number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+256 7XX XXX XXX"
              className="mt-1 w-full rounded-xl bg-input border border-border px-4 py-2.5 outline-none focus:border-primary font-numeric"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Shown to people you split bills with so they can reach you.
            </p>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
              <Mail className="size-3" /> Email
            </label>
            <input
              value={user?.email ?? ""}
              disabled
              className="mt-1 w-full rounded-xl bg-muted/40 border border-border px-4 py-2.5 outline-none text-muted-foreground"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center gap-3">
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/" });
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition"
        >
          <LogOut className="size-4" /> Sign out
        </button>
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
