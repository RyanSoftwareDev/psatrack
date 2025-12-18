// lib/openskyAuth.ts
type TokenResp = { access_token: string; expires_in?: number };

let cached: { token: string; exp: number } | null = null;

function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing`);
  return v;
}

export async function getOpenSkyToken(): Promise<string> {
  const now = Date.now();
  if (cached && now < cached.exp) return cached.token;

  const client_id = need("gavin.ryan.amtsec@gmail.com-api-client");
  const client_secret = need("GeAOKyoYkC4bwgaI74Z6fSKk1pxbiId6");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id,
    client_secret,
  });

  const res = await fetch(
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenSky token failed: ${res.status} ${t.slice(0, 200)}`);
  }

  const json = (await res.json()) as TokenResp;

  // expire a bit early to avoid edge-of-expiry 401s
  const ttlMs = Math.max(60, (json.expires_in ?? 1800) - 60) * 1000;
  cached = { token: json.access_token, exp: now + ttlMs };
  return cached.token;
}