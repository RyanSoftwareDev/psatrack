import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ base: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { base } = await params;
  const key = (base || "").toUpperCase().trim();

  const url = new URL(req.url);
  const minutes = Math.max(5, Math.min(240, Number(url.searchParams.get("minutes") ?? 60)));
  const includeOffline = url.searchParams.get("includeOffline") === "1";

  const sinceIso = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const supabaseAdmin = getSupabaseAdmin();

  // get current aircraft list to optionally hide offline trails by default
  let allowedIcao24: string[] | null = null;
  if (!includeOffline) {
    const { data: latest } = await supabaseAdmin
      .from("aircraft_latest")
      .select("icao24,status")
      .eq("base_code", key);

    allowedIcao24 = (latest ?? [])
      .filter((x: any) => x?.status !== "offline")
      .map((x: any) => String(x.icao24));
  }

  let q = supabaseAdmin
    .from("aircraft_track_points")
    .select("icao24,callsign,ts,lat,lon,track,ground_speed_kt,on_ground")
    .eq("base_code", key)
    .gte("ts", sinceIso)
    .order("ts", { ascending: true })
    .limit(25_000); // big enough for 60min of points; tune later

  if (allowedIcao24 && allowedIcao24.length > 0) {
    q = q.in("icao24", allowedIcao24);
  }

  const { data } = await q;

  return NextResponse.json({
    base: key,
    minutes,
    points: data ?? [],
  });
}