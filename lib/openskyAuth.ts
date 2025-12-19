// lib/openskyAuth.ts
type TokenResp = { access_token: string; expires_in?: number };

let cached: { token: string; exp: number } | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is missing`);
  return v;
}

const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

/**
 * OAuth2 Client Credentials (recommended by OpenSky).
 * Requires:
 *  - OPENSKY_CLIENT_ID (e.g. "...-api-client")
 *  - OPENSKY_CLIENT_SECRET
 */
export async function getOpenSkyToken(opts?: { forceRefresh?: boolean }): Promise<string> {
  const now = Date.now();

  if (!opts?.forceRefresh && cached && now < cached.exp) {
    return cached.token;
  }

  const client_id = requireEnv("OPENSKY_CLIENT_ID").trim();
  const client_secret = requireEnv("OPENSKY_CLIENT_SECRET");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id,
    client_secret,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenSky token failed: ${res.status} ${t.slice(0, 200)}`);
  }

  const json = (await res.json()) as TokenResp;

  // expire early to avoid edge-of-expiry 401s
  const ttlMs = Math.max(60, (json.expires_in ?? 1800) - 60) * 1000;
  cached = { token: json.access_token, exp: now + ttlMs };

  return cached.token;
}