// app/api/airport-layout/[airportCode]/update/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "UPDATE_DISABLED", message: "Layout updates are disabled in production." },
    { status: 403 }
  );
}