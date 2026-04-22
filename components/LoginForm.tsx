"use client";

import { useEffect, useState, useTransition } from "react";
import { signIn }                              from "next-auth/react";
import { useRouter, useSearchParams }          from "next/navigation";

interface RecentUser { email: string; name: string; role: string; last: number; }

// Per-email display title overrides. Keep in sync with Navbar's SUPER_ADMIN_EMAILS list.
const EMAIL_TITLE_OVERRIDES: Record<string, string> = {
  "rap@totallywiredelectric.com": "Super Admin",
};

function displayRoleFor(user: RecentUser): string {
  return EMAIL_TITLE_OVERRIDES[user.email] ?? user.role;
}

export default function LoginForm() {
  const router     = useRouter();
  const params     = useSearchParams();
  const isSwitch   = params.get("switch") === "1";
  const [error,       setError]       = useState("");
  const [email,       setEmail]       = useState("");
  const [isPending,   start]          = useTransition();
  const [recent,      setRecent]      = useState<RecentUser[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tracker_recent_users");
      const list: RecentUser[] = raw ? JSON.parse(raw) : [];
      setRecent(list);
    } catch {}
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd   = new FormData(e.currentTarget);
    const em   = fd.get("email") as string;
    const pass = fd.get("password") as string;

    start(async () => {
      const res = await signIn("credentials", { email: em, password: pass, redirect: false });
      if (res?.error) {
        setError("Invalid email or password");
      } else {
        router.push("/");
        router.refresh();
      }
    });
  }

  function removeRecent(e: React.MouseEvent, target: string) {
    e.stopPropagation();
    const next = recent.filter(r => r.email !== target);
    setRecent(next);
    try { localStorage.setItem("tracker_recent_users", JSON.stringify(next)); } catch {}
  }

  const initials = (name: string) => name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="w-full max-w-sm mx-auto bg-white rounded-2xl shadow-2xl p-7">
      {/* Branding */}
      <div className="mb-5 text-center">
        <div className="flex justify-center mb-4 bg-slate-900 rounded-xl px-6 py-4">
          <img src="/twe-logo.png" alt="Totally Wired Electric" className="h-10 w-auto" />
        </div>
        <div className="flex items-center justify-center gap-2">
          <img src="/switchboard-icon.svg" alt="" className="h-7 w-7" />
          <h1 className="text-xl font-bold text-gray-900">Switchboard</h1>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {isSwitch ? "Pick an account to sign in with" : "Sign in to your account"}
        </p>
      </div>

      {/* Recent accounts quick-pick */}
      {recent.length > 0 && !email && (
        <div className="mb-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            {isSwitch ? "Recent accounts" : "Continue as"}
          </p>
          <div className="space-y-1.5">
            {recent.map(r => (
              <button
                key={r.email}
                type="button"
                onClick={() => setEmail(r.email)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 hover:border-cyan-400 hover:bg-cyan-50/40 transition-colors text-left group">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: "#00BAD6" }}>
                  {initials(r.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{r.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">{r.email}</p>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded capitalize font-medium shrink-0"
                  style={{ backgroundColor: "#f0fdfe", color: "#00BAD6" }}>
                  {displayRoleFor(r)}
                </span>
                <button
                  type="button"
                  onClick={(e) => removeRecent(e, r.email)}
                  title="Remove from list"
                  className="shrink-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-sm leading-none px-1">
                  ×
                </button>
              </button>
            ))}
          </div>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-2 text-[10px] text-gray-400 uppercase tracking-wider">or</span></div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
          <input
            name="email" type="email" required autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)}
            autoFocus={!!email}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2"
            style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties}
            placeholder="you@company.com"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
          <input
            name="password" type="password" required autoComplete="current-password"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2"
            style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties}
            placeholder="••••••••"
            autoFocus={!!email}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <button
          type="submit" disabled={isPending}
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50 hover:opacity-90"
          style={{ backgroundColor: "#00BAD6" }}
        >
          {isPending ? "Signing in…" : "Sign In"}
        </button>

        {email && recent.length > 0 && (
          <button
            type="button"
            onClick={() => setEmail("")}
            className="w-full text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
            ← Back to recent accounts
          </button>
        )}
      </form>

      <div className="mt-5 pt-4 border-t border-gray-100 text-center text-[10px] text-gray-400">
        <p className="font-semibold" style={{ color: "#00BAD6" }}>Totally Wired Electric</p>
      </div>
    </div>
  );
}
