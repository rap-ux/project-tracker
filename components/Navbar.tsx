"use client";

import { signOut }     from "next-auth/react";
import Link            from "next/link";
import { usePathname } from "next/navigation";

interface NavbarProps { userName: string; role: string; }

const OWNER_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/inputs",    label: "Inputs"    },
  { href: "/forecast",  label: "Forecast"  },
  { href: "/timeline",  label: "Timeline"  },
  { href: "/clients",   label: "Clients"   },
  { href: "/uploads",   label: "Uploads"   },
  { href: "/report",    label: "Report"    },
];

export default function Navbar({ userName, role }: NavbarProps) {
  const path    = usePathname();
  const isOwner = role === "owner" || role === "admin";

  return (
    <nav style={{ backgroundColor: "#101010" }} className="text-white px-5 py-0 flex items-center justify-between shadow-lg border-b border-white/10">

      {/* ── Logo + brand ── */}
      <div className="flex items-center gap-6">
        <Link href={isOwner ? "/dashboard" : "/foreman"} className="flex items-center gap-2.5 py-3 shrink-0">
          {/* TWE icon — wifi/signal rings in cyan */}
          <svg width="28" height="28" viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="500" height="500" rx="250" fill="#00BAD6"/>
            <path d="M305.437 296.859H285.991V250H269.446V296.859H230.552V250H214.008V296.859H194.563C189.993 296.859 186.291 300.537 186.291 305.077V360.151C186.291 392.265 210.496 418.848 241.73 422.893V500.293C241.73 504.832 245.432 508.511 250.002 508.511C254.571 508.511 258.275 504.832 258.275 500.293V422.893C289.506 418.85 313.71 392.265 313.71 360.151V305.077C313.709 300.537 310.006 296.859 305.437 296.859Z" fill="#EBF1F5"/>
            <path d="M375.318 134.431C306.297 65.409 193.985 65.4086 124.964 134.43C122.06 137.333 117.353 137.333 114.45 134.431C111.548 131.528 111.547 126.82 114.45 123.917C189.272 49.0951 311.009 49.0948 385.832 123.917C388.734 126.819 388.735 131.526 385.832 134.43C382.928 137.333 378.221 137.333 375.318 134.431Z" fill="#EBF1F5"/>
            <path d="M340.04 169.708C290.47 120.139 209.81 120.139 160.242 169.707C157.338 172.611 152.631 172.61 149.728 169.708C146.826 166.806 146.825 162.098 149.728 159.194C205.097 103.825 295.184 103.826 350.553 159.195C353.455 162.097 353.457 166.804 350.553 169.708C347.65 172.611 342.942 172.611 340.04 169.708Z" fill="#EBF1F5"/>
            <path d="M304.762 204.988C274.646 174.871 225.637 174.872 195.521 204.987C192.618 207.891 187.91 207.89 185.008 204.988C182.105 202.085 182.104 197.377 185.008 194.474C220.924 158.557 279.358 158.557 315.275 194.474C318.177 197.376 318.179 202.084 315.275 204.987C312.372 207.891 307.664 207.89 304.762 204.988Z" fill="#EBF1F5"/>
          </svg>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight" style={{ color: "#EBF1F5" }}>Totally Wired Electric</p>
            <p className="text-xs font-normal" style={{ color: "#00BAD6" }}>Project Tracker</p>
          </div>
        </Link>

        {/* ── Nav links ── */}
        {isOwner && (
          <div className="flex items-center">
            {OWNER_LINKS.map(l => {
              const active = path === l.href;
              return (
                <Link key={l.href} href={l.href}
                  className="relative text-sm px-4 py-4 transition-colors"
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

      {/* ── User + sign out ── */}
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium leading-tight" style={{ color: "#EBF1F5" }}>{userName}</p>
          <p className="text-xs leading-tight capitalize" style={{ color: "#00BAD6" }}>{role}</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-xs px-3 py-1.5 rounded-md transition-colors border border-white/10 hover:border-white/25"
          style={{ color: "rgba(235,241,245,0.7)" }}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
