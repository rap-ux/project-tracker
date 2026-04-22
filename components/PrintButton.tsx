"use client";

export default function PrintButton({ label = "🖨 Print / PDF", className }: { label?: string; className?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className={className ?? "text-sm px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-medium transition-colors"}>
      {label}
    </button>
  );
}
