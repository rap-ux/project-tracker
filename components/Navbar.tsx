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

type IconKey =
  | "home" | "dashboard" | "inputs" | "forecast" | "timeline"
  | "analytics" | "bonuses" | "clients" | "uploads" | "report";

// Line-style icons matching the Switchboard aesthetic (2px stroke, rounded caps)
function NavIcon({ name, size = 16 }: { name: IconKey; size?: number }) {
  const common = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none" as const,
    stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (<svg {...common}><path d="M3 12L12 4l9 8"/><path d="M5 10v10h14V10"/></svg>);
    case "dashboard":
      return (<svg {...common}><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>);
    case "inputs":
      return (<svg {...common}><line x1="4" y1="7" x2="14" y2="7"/><circle cx="17" cy="7" r="2.5"/><line x1="10" y1="17" x2="20" y2="17"/><circle cx="7" cy="17" r="2.5"/></svg>);
    case "forecast":
      return (<svg {...common}><polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/></svg>);
    case "timeline":
      return (<svg {...common}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>);
    case "analytics":
      return (<svg {...common}><line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="11" width="3" height="9"/><rect x="11" y="6" width="3" height="14"/><rect x="16" y="13" width="3" height="7"/></svg>);
    case "bonuses":
      return (<svg {...common}><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>);
    case "clients":
      return (<svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15 18c0-2 2-4 4-4s2 1 2 1"/></svg>);
    case "uploads":
      return (<svg {...common}><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/><polyline points="8 9 12 5 16 9"/><line x1="12" y1="5" x2="12" y2="16"/></svg>);
    case "report":
      return (<svg {...common}><path d="M7 2h8l4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><polyline points="14 2 14 7 19 7"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>);
  }
}

const OWNER_LINKS: Array<{ href: string; label: string; icon: IconKey; superOnly?: boolean }> = [
  { href: "/",          label: "Home",      icon: "home"      },
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/inputs",    label: "Inputs",    icon: "inputs"    },
  { href: "/forecast",  label: "Forecast",  icon: "forecast"  },
  { href: "/timeline",  label: "Timeline",  icon: "timeline"  },
  { href: "/analytics", label: "Analytics", icon: "analytics" },
  { href: "/bonuses",   label: "Bonuses",   icon: "bonuses"   },
  { href: "/clients",   label: "Clients",   icon: "clients"   },
  { href: "/uploads",   label: "Uploads",   icon: "uploads"   },
  { href: "/report",    label: "Report",    icon: "report",    superOnly: true },
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
          <div className="hidden md:flex items-center border-l border-white/15 pl-3">
            <img src="/switchboard-icon.svg" alt="Switchboard" className="h-7 w-7" title="Switchboard" />
          </div>
        </Link>

        {/* ── Desktop Nav links ── */}
        {isOwner && (
          <div className="hidden lg:flex items-center">
            {visibleLinks.map(l => {
              const active = path === l.href;
              return (
                <Link key={l.href} href={l.href}
                  title={l.label}  // tooltip on lg-only icon mode
                  className={`group relative flex items-center gap-1.5 text-sm px-2.5 xl:px-3 2xl:px-4 py-4 transition-all duration-200 whitespace-nowrap ${
                    active
                      ? "text-[#00BAD6]"
                      : "text-white/55 hover:text-white/95 hover:bg-white/[0.06]"
                  }`}>
                  <span className="transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:scale-110">
                    <NavIcon name={l.icon} />
                  </span>
                  <span className="hidden min-[1800px]:inline transition-transform duration-200 ease-out group-hover:-translate-y-0.5">
                    {l.label}
                  </span>
                  {/* Active-page underline (solid cyan) */}
                  {active && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full" style={{ backgroundColor: "#00BAD6" }} />
                  )}
                  {/* Hover preview underline — grows from center on inactive links */}
                  {!active && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-0 rounded-t-full transition-all duration-200 ease-out group-hover:w-4/5"
                      style={{ backgroundColor: "rgba(0, 186, 214, 0.55)" }} />
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Right: Search + Alerts + Activity + user + sign out ── */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-shrink-0">
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
                    onClick={async () => {
                      setMobileOpen(false);
                      await signOut({ redirect: false });
                      window.location.href = "/login?switch=1";
                    }}
                    className="flex-1 text-xs px-3 py-1.5 rounded-md border border-white/20 transition-colors hover:bg-white/5"
                    style={{ color: "rgba(235,241,245,0.85)" }}>
                    ↔ Switch account
                  </button>
                  <button
                    onClick={async () => {
                      setMobileOpen(false);
                      await signOut({ redirect: false });
                      window.location.href = "/signed-out";
                    }}
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
                    className={`group flex items-center justify-between px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 ease-out active:scale-[0.98] ${
                      active
                        ? "text-[#00BAD6]"
                        : "text-white/85 hover:bg-white/10"
                    }`}
                    style={active ? { backgroundColor: "rgba(0,186,214,0.15)" } : undefined}>
                    <span className="flex items-center gap-3 transition-transform duration-200 ease-out group-hover:translate-x-1">
                      <span className="transition-transform duration-200 ease-out group-hover:scale-110">
                        <NavIcon name={l.icon} size={18} />
                      </span>
                      {l.label}
                    </span>
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
