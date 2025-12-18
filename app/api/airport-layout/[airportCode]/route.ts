import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseClient";

type Ctx = { params: Promise<{ airportCode: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { airportCode } = await ctx.params; // ✅ unwrap the promise
  const code = (airportCode || "").toUpperCase().trim();

  if (!code) {
    return NextResponse.json({ error: "MISSING_AIRPORT_CODE" }, { status: 400 });
  }

  const supabase = createClient();

  const { data, error } = await supabase
    .from("airport_layouts")
    .select("*")
    .eq("airport_code", code)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ airport: data }, { status: 200 });
}