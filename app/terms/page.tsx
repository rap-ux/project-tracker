// Public end-user license agreement page — required by Intuit's production-app
// checklist. Switchboard is internal-only, so the terms are correspondingly simple.
export const dynamic = "force-static";

export default function TermsPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold mb-6">End-User License Agreement — Switchboard</h1>
      <p className="mb-4">Last updated: August 7, 2026</p>
      <p className="mb-4">
        Switchboard is a proprietary internal business application owned and operated by Totally
        Wired Electric &amp; AV Systems, Inc. (&quot;TWE&quot;), 31360 Via Colinas Ste 105, Westlake
        Village, CA 91362.
      </p>
      <h2 className="text-lg font-semibold mt-6 mb-2">Use</h2>
      <p className="mb-4">
        Use of Switchboard is limited to authorized TWE staff with an account issued by TWE. Access
        may be revoked at any time. Users must keep their login credentials confidential and use the
        application only for TWE business purposes.
      </p>
      <h2 className="text-lg font-semibold mt-6 mb-2">Data</h2>
      <p className="mb-4">
        All data in Switchboard, including data synchronized from TWE&apos;s QuickBooks Online
        account, is the property of TWE. See our{" "}
        <a href="/privacy" className="underline">Privacy Policy</a> for how data is handled.
      </p>
      <h2 className="text-lg font-semibold mt-6 mb-2">Warranty and liability</h2>
      <p className="mb-4">
        The application is provided &quot;as is&quot; for internal use, without warranty of any kind.
        TWE is not liable for decisions made based on the reports it produces; financial records in
        QuickBooks Online remain the system of record.
      </p>
      <h2 className="text-lg font-semibold mt-6 mb-2">Contact</h2>
      <p className="mb-4">
        Questions about these terms: info@totallywiredelectric.com or (818) 889-1229.
      </p>
    </main>
  );
}
