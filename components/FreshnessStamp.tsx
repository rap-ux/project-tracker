"use client";

import { useEffect, useState } from "react";

function rel(ts: string): string {
  const dt = new Date(ts.replace(" ", "T") + "Z");
  const m = Math.floor((Date.now() - dt.getTime()) / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1)  return "just now";
  if (h < 1)  return `${m} min ago`;
  if (h < 24) return `${h} hr ago`;
  if (d < 7)  return `${d} day${d === 1 ? "" : "s"} ago`;
  return dt.toLocaleDateString();
}

// "Data as of …" stamp. Computes after mount to avoid SSR/client time mismatch.
export default function FreshnessStamp({ ts, className = "text-xs text-subtle" }: { ts: string | null; className?: string }) {
  const [label, setLabel] = useState<string>(ts ? "" : "No sync yet");
  useEffect(() => {
    if (ts) setLabel(`Data as of ${rel(ts)}`);
  }, [ts]);
  return (
    <span className={className} title={ts ? new Date(ts.replace(" ", "T") + "Z").toLocaleString() : undefined}>
      {label}
    </span>
  );
}
