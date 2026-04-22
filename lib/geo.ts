import db from "@/lib/db";

// Private / local ranges we never bother looking up
function isLocalIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith("fc00:") || ip.startsWith("fd")) return true;  // private IPv6
  return false;
}

export function extractClientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

export interface GeoInfo {
  city:         string | null;
  region:       string | null;
  country:      string | null;
  country_code: string | null;
}

// Check cache first, else call ipapi.co (free tier, 1K/day — plenty for us).
// Returns cached or freshly-looked-up info, or null if IP is local / lookup failed.
export async function resolveIpGeo(ip: string | null): Promise<GeoInfo | null> {
  if (!ip || isLocalIp(ip)) return null;

  const cached = db.prepare("SELECT city, region, country, country_code FROM ip_geo_cache WHERE ip = ?")
    .get(ip) as GeoInfo | undefined;
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { "User-Agent": "Switchboard/1.0" },
      signal:  controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    // ipapi.co sometimes returns { error: true, reason: "..." }
    if (data.error) return null;

    const geo: GeoInfo = {
      city:         data.city         ?? null,
      region:       data.region       ?? null,
      country:      data.country_name ?? null,
      country_code: data.country_code ?? null,
    };
    db.prepare(`
      INSERT OR REPLACE INTO ip_geo_cache (ip, city, region, country, country_code)
      VALUES (?, ?, ?, ?, ?)
    `).run(ip, geo.city, geo.region, geo.country, geo.country_code);
    return geo;
  } catch {
    return null;
  }
}
