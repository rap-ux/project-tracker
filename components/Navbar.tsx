"use client";

import { signOut }     from "next-auth/react";
import Link            from "next/link";
import { usePathname } from "next/navigation";
import { useState }    from "react";
import GlobalActivityButton from "./GlobalActivityButton";
import AlertsBell            from "./AlertsBell";
import GlobalSearch          from "./GlobalSearch";
import UserMenu              from "./UserMenu";

interface NavbarProps { userName: string; role: string; userEmail?: string; userTitle?: string; }

const OWNER_LINKS: Array<{ href: string; label: string; superOnly?: boolean }> = [
  { href: "/",          label: "Home"      },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/inputs",    label: "Inputs"    },
  { href: "/forecast",  label: "Forecast"  },
  { href: "/timeline",  label: "Timeline"  },
  { href: "/analytics", label: "Analytics" },
  { href: "/bonuses",   label: "Bonuses"   },
  { href: "/clients",   label: "Clients"   },
  { href: "/uploads",   label: "Uploads"   },
  { href: "/report",    label: "Report",    superOnly: true },
];

// Super-admin emails — links flagged superOnly only appear for these users
const SUPER_ADMIN_EMAILS = ["rap@totallywiredelectric.com"];

export default function Navbar({ userName, role, userEmail, userTitle }: NavbarProps) {
  const path    = usePathname();
  const isOwner = role === "owner" || role === "admin";
  const [mobileOpen, setMobileOpen] = useState(false);
  const displayRole = userTitle && userTitle.trim() ? userTitle : role;
  const isSuperAdmin = !!userEmail && SUPER_ADMIN_EMAILS.includes(userEmail);
  const visibleLinks = OWNER_LINKS.filter(l => !l.superOnly || isSuperAdmin);

  return (
    <nav
      style={{ backgroundColor: "#101010" }}
      className="text-white px-4 sm:px-5 flex items-center justify-between shadow-lg border-b border-white/10 sticky top-0 z-40">

      {/* ── Left: Logo + brand ── */}
      <div className="flex items-center gap-3 sm:gap-6 min-w-0">
        <Link href={isOwner ? "/" : "/foreman"} className="flex items-center gap-3 py-3 shrink-0">
          <img
            src="/twe-logo.png"
            alt="Totally Wired Electric"
            className="h-8 sm:h-9 w-auto"
          />
          <div className="hidden md:flex items-center gap-2 border-l border-white/15 pl-3">
            <img src="/switchboard-icon.svg" alt="" className="h-7 w-7" />
            <span className="text-sm font-bold tracking-tight" style={{ color: "#EBF1F5", letterSpacing: "-0.01em" }}>
              Switchboard
            </span>
          </div>
        </Link>

        {/* ── Desktop Nav links ── */}
        {isOwner && (
          <div className="hidden lg:flex items-center">
            {visibleLinks.map(l => {
              const active = path === l.href;
              return (
                <Link key={l.href} href={l.href}
                  className="relative text-sm px-3 xl:px-4 py-4 transition-colors whitespace-nowrap"
                  style={{ color: active ? "#00BAD6" : "rgba(235,241,245,0.55)" }}>
                  {l.label}
                  {active && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full" style={{ backgroundColor: "#00BAD6" }} />
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Right: Search + Alerts + Activity + user + sign out ── */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <GlobalSearch />
        <AlertsBell />
        <GlobalActivityButton />

        {/* Desktop user menu (avatar + dropdown) */}
        <div className="hidden sm:block">
          <UserMenu userName={userName} role={displayRole} userEmail={userEmail} />
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(v => !v)}
          className="lg:hidden p-2 rounded-md hover:bg-white/10 transition-colors"
          aria-label="Open menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#EBF1F5" }}>
            {mobileOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* ── Mobile menu drawer ── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            style={{ top: "52px" }}
            onClick={() => setMobileOpen(false)} />
          {/* Drawer */}
          <div
            className="fixed left-0 right-0 z-50 lg:hidden shadow-xl border-t border-white/10"
            style={{ top: "52px", backgroundColor: "#101010" }}>
            <div className="flex flex-col px-4 py-3 gap-0.5">
              {/* User info row on mobile */}
              <div className="sm:hidden flex flex-col gap-2 pb-3 mb-2 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: "#00BAD6" }}>
                    {userName.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" style={{ color: "#EBF1F5" }}>{userName}</p>
                    {userEmail && <p className="text-[11px] truncate" style={{ color: "rgba(235,241,245,0.5)" }}>{userEmail}</p>}
                    <p className="text-[10px] capitalize" style={{ color: "#00BAD6" }}>{displayRole}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setMobileOpen(false); signOut({ callbackUrl: "/login?switch=1" }); }}
                    className="flex-1 text-xs px-3 py-1.5 rounded-md border border-white/20 transition-colors hover:bg-white/5"
                    style={{ color: "rgba(235,241,245,0.85)" }}>
                    ↔ Switch account
                  </button>
                  <button
                    onClick={() => { setMobileOpen(false); signOut({ callbackUrl: "/signed-out" }); }}
                    className="flex-1 text-xs px-3 py-1.5 rounded-md border border-red-400/40 transition-colors hover:bg-red-500/10"
                    style={{ color: "#fca5a5" }}>
                    Sign out
                  </button>
                </div>
              </div>

              {/* Nav links */}
              {isOwner && visibleLinks.map(l => {
                const active = path === l.href;
                return (
                  <Link key={l.href} href={l.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between px-3 py-3 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: active ? "rgba(0,186,214,0.15)" : "transparent",
                      color: active ? "#00BAD6" : "rgba(235,241,245,0.85)",
                    }}>
                    <span>{l.label}</span>
                    {active && <span className="text-xs">●</span>}
                  </Link>
                );
              })}
              {!isOwner && (
                <Link href="/foreman"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center px-3 py-3 rounded-lg text-sm font-medium"
                  style={{ color: "#00BAD6" }}>
                  My Projects
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
