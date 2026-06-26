// Minimal Google Sheets reader using a service-account JWT.
// No external deps — signs the OAuth assertion with Node's crypto.
// Env vars required:
//   GOOGLE_SA_EMAIL        service-account email (…@….iam.gserviceaccount.com)
//   GOOGLE_SA_PRIVATE_KEY  the PEM private key (literal \n escapes are handled)
//   GSHEET_ID              spreadsheet id from the sheet URL
//   GSHEET_RANGE           tab/range to read, e.g. "SUMMARY_Project KPIs"
import crypto from "crypto";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SA_EMAIL;
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error("Google service account not configured");

  // Railway stores the key with literal \n — restore real newlines.
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const now    = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim  = b64url(JSON.stringify({
    iss:   email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud:   "https://oauth2.googleapis.com/token",
    exp:   now + 3600,
    iat:   now,
  }));
  const signingInput = `${header}.${claim}`;
  const signature = b64url(crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey));
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

// Returns the sheet as a 2D string grid (rows of cells), same shape the importer expects.
export async function fetchSheetGrid(): Promise<string[][]> {
  const id    = process.env.GSHEET_ID;
  const range = process.env.GSHEET_RANGE;
  if (!id || !range) throw new Error("GSHEET_ID / GSHEET_RANGE not configured");

  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`
            + `/values/${encodeURIComponent(range)}`
            + `?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets read failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const rows: any[][] = data.values ?? [];
  return rows.map(r => r.map(cell => (cell == null ? "" : String(cell))));
}

export function gsheetConfigured(): boolean {
  return !!(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY
         && process.env.GSHEET_ID && process.env.GSHEET_RANGE);
}
