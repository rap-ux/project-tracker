"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Sends a heartbeat every 60s so the server can track who's currently online.
// Fails silently for unauthenticated users (e.g. on /login).
export default function PresenceTracker() {
  const path = usePathname();

  useEffect(() => {
    function beat() {
      fetch("/api/heartbeat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ page: path }),
        keepalive: true,
      }).catch(() => {});
    }

    // Fire immediately, then every 60s
    beat();
    const interval = setInterval(beat, 60_000);

    // Also fire on page hide (tab close, navigate away) so last_seen is accurate
    const onVis = () => { if (document.visibilityState === "hidden") beat(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [path]);

  return null;
}
