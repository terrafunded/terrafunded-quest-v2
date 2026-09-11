import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Landmark, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/data/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Login() {
  const { session, ready, configured, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (ready && session) return <Navigate to={from} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = await signIn(email.trim(), password);
    setBusy(false);
    if (message) setError(message);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="parchment-card w-full max-w-sm p-7"
      >
        <div className="mb-6 text-center">
          <Landmark className="mx-auto h-8 w-8 text-gold" />
          <h1 className="mt-3 font-display text-2xl uppercase tracking-[0.2em] text-gold">Exodus</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-muted-foreground">Enter the war room</p>
        </div>

        {!configured ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert">
            Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code> and set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code>.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" aria-label="Sign in">
            <div className="space-y-1.5">
              <label htmlFor="email" className="stat-label">
                Email
              </label>
              <Input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="stat-label">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-red-300" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Enter
            </Button>
            <p className="text-center text-xs text-muted-foreground">Read-only. Any Payments user may view; nothing here can write.</p>
          </form>
        )}
      </motion.div>
    </div>
  );
}
