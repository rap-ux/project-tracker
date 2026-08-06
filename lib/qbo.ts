// QuickBooks Online (accounting) API client — OAuth2 tokens live in the
// single-row qbo_connection table. Distinct from QuickBooks Time (Current app);
// this talks to the QBO company file itself (estimates, invoices, bills).
import db from "@/lib/db";
import { appUrl } from "@/lib/slack";

const TOKEN_URL     = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const AUTH_URL      = "https://appcenter.intuit.com/connect/oauth2";
const MINOR_VERSION = "75";

export function qboConfigured(): boolean {
  return !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
}

export function redirectUri(): string {
  return process.env.QBO_REDIRECT_URI ?? appUrl("/api/qbo/callback");
}

function apiBase(realmId: string): string {
  const host = process.env.QBO_ENV === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
  return `${host}/v3/company/${realmId}`;
}

function basicAuth(): string {
  return "Basic " + Buffer.from(
    `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`
  ).toString("base64");
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id:     process.env.QBO_CLIENT_ID ?? "",
    response_type: "code",
    scope:         "com.intuit.quickbooks.accounting",
    redirect_uri:  redirectUri(),
    state,
  });
  return `${AUTH_URL}?${params}`;
}

type Connection = {
  realm_id:           string;
  access_token:       string;
  refresh_token:      string;
  expires_at:         string;
  refresh_expires_at: string | null;
};

export function getConnection(): Connection | null {
  return (db.prepare("SELECT * FROM qbo_connection WHERE id = 1").get() as Connection | undefined) ?? null;
}

function saveTokens(realmId: string, tok: {
  access_token: string; refresh_token: string;
  expires_in: number; x_refresh_token_expires_in?: number;
}) {
  const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString();
  const refreshExpiresAt = tok.x_refresh_token_expires_in
    ? new Date(Date.now() + tok.x_refresh_token_expires_in * 1000).toISOString()
    : null;
  db.prepare(`
    INSERT INTO qbo_connection (id, realm_id, access_token, refresh_token, expires_at, refresh_expires_at, updated_at)
    VALUES (1, @realm_id, @access_token, @refresh_token, @expires_at, @refresh_expires_at, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      realm_id = @realm_id, access_token = @access_token, refresh_token = @refresh_token,
      expires_at = @expires_at, refresh_expires_at = @refresh_expires_at, updated_at = datetime('now')
  `).run({
    realm_id: realmId,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: expiresAt,
    refresh_expires_at: refreshExpiresAt,
  });
}

export async function exchangeCode(code: string, realmId: string): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: {
      Authorization:  basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept:         "application/json",
    },
    body: new URLSearchParams({
      grant_type:   "authorization_code",
      code,
      redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) throw new Error(`QBO token exchange failed: ${res.status} ${await res.text()}`);
  saveTokens(realmId, await res.json());
}

async function refresh(conn: Connection): Promise<Connection> {
  const res = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: {
      Authorization:  basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept:         "application/json",
    },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`QBO token refresh failed: ${res.status} ${await res.text()}`);
  saveTokens(conn.realm_id, await res.json());
  return getConnection()!;
}

// Returns a live access token, refreshing when within 2 minutes of expiry.
export async function getAccessToken(): Promise<{ token: string; realmId: string }> {
  let conn = getConnection();
  if (!conn) throw new Error("QBO not connected — visit /api/qbo/connect first");
  if (new Date(conn.expires_at).getTime() - Date.now() < 2 * 60 * 1000) {
    conn = await refresh(conn);
  }
  return { token: conn.access_token, realmId: conn.realm_id };
}

// Paginated QBO query API: SELECT * FROM <entity> [WHERE ...] in pages of 1000.
export async function qboQueryAll<T = any>(entity: string, where = ""): Promise<T[]> {
  const { token, realmId } = await getAccessToken();
  const out: T[] = [];
  const pageSize = 1000;
  for (let start = 1; ; start += pageSize) {
    const q = `SELECT * FROM ${entity} ${where} STARTPOSITION ${start} MAXRESULTS ${pageSize}`;
    const url = `${apiBase(realmId)}/query?query=${encodeURIComponent(q)}&minorversion=${MINOR_VERSION}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      // intuit_tid identifies the request in Intuit's logs — kept in our sync
      // error log so support can trace failures.
      const tid = res.headers.get("intuit_tid");
      throw new Error(`QBO query ${entity} failed: ${res.status}${tid ? ` (intuit_tid ${tid})` : ""} ${await res.text()}`);
    }
    const data = await res.json();
    const rows: T[] = data?.QueryResponse?.[entity] ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}
