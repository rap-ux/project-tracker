"use client";

// Last-resort boundary if the root layout itself throws. Renders its own
// html/body, so it uses inline styles rather than the token utilities.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#0b0d10", color: "#e9edf2", fontFamily: "system-ui, sans-serif", padding: "1rem" }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#9aa4b0", marginTop: 8 }}>
            The app hit an unexpected error. Please reload.
          </p>
          <button onClick={() => reset()}
            style={{ marginTop: 20, padding: "8px 16px", borderRadius: 8, border: "none",
              background: "#00BAD6", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
