// app/api/airport-layout/[airportCode]/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseClient";

type RouteParams = {
  airportCode: string;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<RouteParams> }
) {
  const { airportCode } = await context.params;
  const code = (airportCode || "").toUpperCase();

  // 🔐 Simple admin protection
  const adminToken = req.headers.get("x-admin-token");
  if (adminToken !== process.env.ADMIN_LAYOUT_TOKEN) {
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  if (!code) {
    return NextResponse.json(
      { error: "Missing airportCode" },
      { status: 400 }
    );
  }

  const supabase = createClient();

  try {
    const body = await req.json();
    const { layout } = body;

    if (!layout) {
      return NextResponse.json(
        { error: "Missing layout payload" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("airport_layouts")
      .update({
        layout,
        updated_at: new Date().toISOString(),
      })
      .eq("airport_code", code);

    if (error) {
      console.error("Supabase update error:", error);
      return NextResponse.json(
        { error: "SUPABASE_UPDATE_FAILED" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  } catch (err) {
    console.error("Unexpected update error:", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}