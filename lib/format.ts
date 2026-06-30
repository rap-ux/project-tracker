// Shared currency/percent formatters. Previously redefined independently in
// 13+ component files with inconsistent precision (e.g. one page rounded
// percentages to whole numbers while others kept one decimal) — the same
// underlying number could render differently depending on which page you
// were looking at. Import from here instead of redefining locally.

export const fmt$ = (n: number | null | undefined): string =>
  "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

// Abbreviated form for tight spaces (Slack messages, compact KPI labels): $12k, $1,200
export const fmt$k = (n: number | null | undefined): string => {
  const v = n ?? 0;
  return Math.abs(v) >= 1000 ? "$" + Math.round(v / 1000) + "k" : "$" + Math.round(v);
};

// `n` is a 0..1 fraction (e.g. 0.5 -> "50.0%"), one decimal place everywhere.
export const fmtPct = (n: number | null | undefined): string =>
  ((n ?? 0) * 100).toFixed(1) + "%";
