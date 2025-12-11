// app/api/airport-layout/[airportCode]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseClient";

type RouteParams = {
  airportCode: string;
};

// In Next 16 route handlers, `params` is passed as a Promise
export async function GET(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  const { airportCode } = await context.params;
  const code = (airportCode || "").toUpperCase();

  if (!code) {
    return NextResponse.json(
      { error: "Missing airportCode in URL" },
      { status: 400 }
    );
  }

  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from("airport_layouts")
      .select("*")
      .eq("airport_code", code)
      .single();

    if (error || !data) {
      console.error("Supabase error fetching airport layout:", error);
      return NextResponse.json(
        { error: `No layout found for airport ${code}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ airport: data }, { status: 200 });
  } catch (e) {
    console.error("Unexpected error in airport-layout route:", e);
    return NextResponse.json(
      { error: "Internal server error loading airport layout" },
      { status: 500 }
    );
  }
}