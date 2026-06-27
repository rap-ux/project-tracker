"use client";

import Link from "next/link";

// Route-level error boundary — shown instead of a raw 500 when a page throws.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 text-text">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-danger-bg text-danger flex items-center justify-center mb-5">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>
          </svg>
        </div>
        <h1 className="text-xl font-medium tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted mt-2">
          An unexpected error stopped this page from loading. Try again, and if it keeps happening, let Rap know.
        </p>
        {error?.digest && <p className="text-xs text-subtle font-mono mt-3">Reference: {error.digest}</p>}
        <div className="flex items-center justify-center gap-2 mt-6">
          <button onClick={() => reset()}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-accent-foreground hover:opacity-90 transition-opacity">
            Try again
          </button>
          <Link href="/"
            className="px-4 py-2 rounded-lg text-sm font-medium border border-border text-muted hover:bg-surface-2 transition-colors">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
