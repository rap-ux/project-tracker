import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 text-text">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-surface-2 text-muted flex items-center justify-center mb-5">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
        </div>
        <h1 className="text-xl font-medium tracking-tight">Page not found</h1>
        <p className="text-sm text-muted mt-2">
          That page doesn&apos;t exist or may have moved.
        </p>
        <Link href="/"
          className="inline-block mt-6 px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-accent-foreground hover:opacity-90 transition-opacity">
          Go home
        </Link>
      </div>
    </div>
  );
}
