"import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;       // storage path
  avatar_signed_url: string | null; // resolved signed URL ready to render
  email: string | null;
  phone: string | null;
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load the profile (incl. resolved avatar) whenever the user changes.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) {
        setProfile(null);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, email, phone')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled || !data) {
        if (!cancelled) setProfile(null);
        return;
      }
      const p = data as Profile;
      // Resolve avatar_url: signed URL if it's a storage path, otherwise as-is.
      let signed: string | null = null;
      if (p.avatar_url) {
        if (p.avatar_url.startsWith('http')) {
          signed = p.avatar_url;
        } else {
          const { data: sig } = await supabase.storage
            .from('avatars')
            .createSignedUrl(p.avatar_url, 60 * 60);
          signed = sig?.signedUrl ?? null;
        }
      }
      if (!cancelled) setProfile({ ...p, avatar_signed_url: signed });
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { user, profile, loading };
}
"
