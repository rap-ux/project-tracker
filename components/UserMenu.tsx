"use client";

import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

interface Props {
  userName:  string;
  role:      string;
  userEmail?: string;
}

export default function UserMenu({ userName, role, userEmail }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Track the current user in localStorage so the login page can show recent users.
  // `role` here is the already-resolved display label (title takes precedence over
  // raw role) — Navbar passes displayRole into the UserMenu `role` prop.
  useEffect(() => {
    if (!userEmail) return;
    try {
      const key = "tracker_recent_users";
      const raw = localStorage.getItem(key);
      const list: Array<{ email: string; name: string; role: string; last: number }> = raw ? JSON.parse(raw) : [];
      const filtered = list.filter(u => u.email !== userEmail);
      filtered.unshift({ email: userEmail, name: userName, role, last: Date.now() });
      localStorage.setItem(key, JSON.stringify(filtered.slice(0, 5)));
    } catch {}
  }, [userEmail, userName, role]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function switchAccount() {
    // Clear session without server redirect, then route client-side so we
    // always stay on the current origin (server env AUTH_URL may be stale).
    await signOut({ redirect: false });
    window.location.href = "/login?switch=1";
  }

  async function doSignOut() {
    await signOut({ redirect: false });
    window.location.href = "/signed-out";
  }

  const initials = userName.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        title={userEmail ?? userName}
        className="flex items-center gap-2 px-1.5 sm:px-2 py-1 rounded-md hover:bg-white/10 transition-colors">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
          style={{ backgroundColor: "#00BAD6" }}>
          {initials}
        </div>
        <div className="hidden sm:block text-right">
          <p className="text-xs sm:text-sm font-medium leading-tight truncate max-w-[140px]" style={{ color: "#EBF1F5" }}>{userName}</p>
          <p className="text-[10px] sm:text-xs leading-tight capitalize" style={{ color: "#00BAD6" }}>{role}</p>
        </div>
        <svg className="hidden sm:block" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "rgba(235,241,245,0.5)" }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50">
          {/* User info */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ backgroundColor: "#00BAD6" }}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{userName}</p>
                {userEmail && (
                  <p className="text-[11px] text-gray-500 truncate">{userEmail}</p>
                )}
                <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium capitalize"
                  style={{ backgroundColor: "#f0fdfe", color: "#00BAD6" }}>
                  {role}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="py-1">
            <button
              onClick={switchAccount}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 1l4 4-4 4"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <path d="M7 23l-4-4 4-4"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              <div className="text-left flex-1">
                <p className="font-medium">Switch account</p>
                <p className="text-[11px] text-gray-400">Sign in as a different user</p>
              </div>
            </button>

            <button
              onClick={doSignOut}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <div className="text-left flex-1">
                <p className="font-medium">Sign out</p>
                <p className="text-[11px] text-red-400">End your session</p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
