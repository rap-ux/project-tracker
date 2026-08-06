// Public privacy policy page — required by Intuit's production-app checklist.
// Kept deliberately plain: Switchboard is an internal tool for Totally Wired
// Electric staff only; it is not distributed to third parties.
export const dynamic = "force-static";

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-12 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold mb-6">Privacy Policy — Switchboard</h1>
      <p className="mb-4">Last updated: August 7, 2026</p>
      <p className="mb-4">
        Switchboard is an internal business application operated by Totally Wired Electric &amp; AV
        Systems, Inc. (&quot;TWE&quot;), 31360 Via Colinas Ste 105, Westlake Village, CA 91362. It is
        used exclusively by TWE staff to track project profitability and operations. It is not a
        consumer product and is not offered to the public.
      </p>
      <h2 className="text-lg font-semibold mt-6 mb-2">Information we process</h2>
      <p className="mb-4">
        Switchboard stores project and financial records belonging to TWE, including data retrieved
        from TWE&apos;s own QuickBooks Online company file (estimates, invoices, and bills) with
        TWE&apos;s authorization. It also stores the names and work email addresses of TWE staff
        accounts.
      </p>
      <h2 className="text-lg font-semibold mt-6 mb-2">How data is used and shared</h2>
      <p className="mb-4">
        Data is used solely for TWE&apos;s internal business operations (project tracking, reporting,
        and payroll-adjacent review). It is not sold, rented, or shared with third parties. Access
        requires an authenticated TWE staff login.
      </p>
      <h2 className="text-lg font-semibold mt-6 mb-2">Storage and security</h2>
      <p className="mb-4">
        Data is stored in a private database on TWE&apos;s cloud hosting infrastructure in the United
        States, encrypted in transit (HTTPS) and at rest by the hosting platform. QuickBooks access
        tokens are stored server-side and are never exposed to browsers.
      </p>
      <h2 className="text-lg font-semibold mt-6 mb-2">Contact</h2>
      <p className="mb-4">
        Questions about this policy: info@totallywiredelectric.com or (818) 889-1229.
      </p>
    </main>
  );
}
