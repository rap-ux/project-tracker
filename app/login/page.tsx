"use client";

import { useEffect, useState, useTransition } from "react";
import { signIn }                              from "next-auth/react";
import { useRouter, useSearchParams }          from "next/navigation";

interface RecentUser { email: string; name: string; role: string; last: number; }

export default function LoginPage() {
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
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ backgroundColor: "#101010" }}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-7">
        {/* TWE logo */}
        <div className="mb-5 text-center">
          <div className="flex justify-center mb-4">
            <svg width="52" height="52" viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="500" height="500" rx="250" fill="#00BAD6"/>
              <path d="M305.437 296.859H285.991V250H269.446V296.859H230.552V250H214.008V296.859H194.563C189.993 296.859 186.291 300.537 186.291 305.077V360.151C186.291 392.265 210.496 418.848 241.73 422.893V500.293C241.73 504.832 245.432 508.511 250.002 508.511C254.571 508.511 258.275 504.832 258.275 500.293V422.893C289.506 418.85 313.71 392.265 313.71 360.151V305.077C313.709 300.537 310.006 296.859 305.437 296.859Z" fill="#EBF1F5"/>
              <path d="M375.318 134.431C306.297 65.409 193.985 65.4086 124.964 134.43C122.06 137.333 117.353 137.333 114.45 134.431C111.548 131.528 111.547 126.82 114.45 123.917C189.272 49.0951 311.009 49.0948 385.832 123.917C388.734 126.819 388.735 131.526 385.832 134.43C382.928 137.333 378.221 137.333 375.318 134.431Z" fill="#EBF1F5"/>
              <path d="M340.04 169.708C290.47 120.139 209.81 120.139 160.242 169.707C157.338 172.611 152.631 172.61 149.728 169.708C146.826 166.806 146.825 162.098 149.728 159.194C205.097 103.825 295.184 103.826 350.553 159.195C353.455 162.097 353.457 166.804 350.553 169.708C347.65 172.611 342.942 172.611 340.04 169.708Z" fill="#EBF1F5"/>
              <path d="M304.762 204.988C274.646 174.871 225.637 174.872 195.521 204.987C192.618 207.891 187.91 207.89 185.008 204.988C182.105 202.085 182.104 197.377 185.008 194.474C220.924 158.557 279.358 158.557 315.275 194.474C318.177 197.376 318.179 202.084 315.275 204.987C312.372 207.891 307.664 207.89 304.762 204.988Z" fill="#EBF1F5"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Project Tracker</h1>
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
                    {r.role}
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
    </div>
  );
}
