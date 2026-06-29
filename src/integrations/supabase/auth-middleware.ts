import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { supabase } from './client'

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

/**
 * Build a per-request Supabase client whose queries carry the user's JWT
 * in the `Authorization` header so RLS policies see `auth.uid()` = the
 * validated user. Required because the shared `supabase` client persists
 * its session in localStorage (browser only) — on the server it would
 * otherwise run unauthenticated, making `auth.uid()` NULL and breaking
 * every RLS check on INSERT/UPDATE/DELETE.
 */
function createUserSupabase(userJWT: string) {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      'Missing Supabase env vars: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY',
    );
  }

  // Custom fetch: keep the user's bearer JWT and the apikey header.
  // For the new sb_publishable_ key format, the JS client may try to
  // attach `Bearer <apikey>` itself — strip that so our user JWT wins.
  const customFetch: typeof fetch = (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    }

    // Always overwrite with the user's JWT — this is what makes RLS work.
    headers.set('Authorization', `Bearer ${userJWT}`);
    headers.set('apikey', SUPABASE_PUBLISHABLE_KEY);

    // Some supabase-js paths set a default Bearer using the publishable key;
    // we just overwrote it above so this is mainly defensive.
    if (
      isNewSupabaseApiKey(SUPABASE_PUBLISHABLE_KEY) &&
      headers.get('Authorization') === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
    ) {
      headers.set('Authorization', `Bearer ${userJWT}`);
    }

    return fetch(input, { ...init, headers });
  };

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      headers: { Authorization: `Bearer ${userJWT}` },
      fetch: customFetch,
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const request = getRequest();

    if (!request?.headers) {
      throw new Error('Unauthorized: No request headers available');
    }

    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      throw new Error('Unauthorized: No authorization header provided');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new Error('Unauthorized: Only Bearer tokens are supported');
    }

    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      throw new Error('Unauthorized: No token provided');
    }

    if (token.split('.').length !== 3) {
      throw new Error('Unauthorized: Invalid token');
    }

    // Validate the JWT via the shared (anon-keyed) client.
    const { data, error } = await supabase.auth.getClaims(token);

    if (error || !data?.claims) {
      throw new Error('Unauthorized: Invalid token');
    }

    if (!data.claims.sub) {
      throw new Error('Unauthorized: No user ID found in token');
    }

    // Build a request-scoped client that carries the user's JWT so RLS
    // sees the right `auth.uid()` for inserts/updates/storage access.
    const userSupabase = createUserSupabase(token);

    return next({
      context: {
        supabase: userSupabase,
        userId: data.claims.sub,
        claims: data.claims,
      },
    });
  },
);
