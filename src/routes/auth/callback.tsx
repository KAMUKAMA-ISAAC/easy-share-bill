import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the session from the URL
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session error:', error);
          setError(error.message);
          return;
        }

        if (data.session) {
          // Successfully authenticated - redirect to dashboard
          window.location.href = "/dashboard";
        } else {
          setError("No session found");
        }
      } catch (err) {
        console.error('Callback error:', err);
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    handleCallback();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Signing you in...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-destructive">Authentication Error</h1>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <a href="/auth" className="mt-4 inline-block text-primary hover:underline">
            Back to Sign In
          </a>
        </div>
      </div>
    );
  }

  return null;
}
