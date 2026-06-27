import Link from "next/link";

export default function SignedOutPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#101010" }}>
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-2xl p-8 text-center">

        {/* TWE logo */}
        <div className="flex justify-center mb-5 bg-slate-900 rounded-xl px-6 py-4">
          <img src="/twe-logo.png" alt="Totally Wired Electric" className="h-10 w-auto" />
        </div>

        {/* Checkmark bubble */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--accent-soft)", border: "2px solid #a5f3fc" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00BAD6"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-text">You've been signed out</h1>
        <p className="text-sm text-muted mt-2">
          Your session has ended. Thanks for using the Switchboard.
        </p>

        <div className="mt-6 space-y-2">
          <Link
            href="/login"
            className="block w-full py-3 rounded-lg font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#00BAD6" }}>
            Sign in again
          </Link>
          <p className="text-[11px] text-subtle">
            Your data is safe · Close this tab if you're done
          </p>
        </div>

        <div className="mt-8 pt-5 border-t border-border text-[11px] text-subtle">
          <p className="font-semibold" style={{ color: "#00BAD6" }}>Totally Wired Electric</p>
          <div className="flex items-center justify-center gap-1.5 mt-1">
            <img src="/switchboard-icon.svg" alt="" className="h-4 w-4" />
            <p>Switchboard</p>
          </div>
        </div>
      </div>
    </div>
  );
}
