import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_WORKSPACE_SLUG } from "@/lib/defaults";
import { createGoogleAuthUrl } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  try {
    const coupleId = request.nextUrl.searchParams.get("coupleId") || DEFAULT_WORKSPACE_SLUG;
    const role = request.nextUrl.searchParams.get("role") === "b" ? "b" : "a";
    return NextResponse.redirect(createGoogleAuthUrl(request.nextUrl.origin, { coupleId, role }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar setup failed.";
    return NextResponse.redirect(new URL(`/?calendarError=${encodeURIComponent(message)}`, request.nextUrl.origin));
  }
}
