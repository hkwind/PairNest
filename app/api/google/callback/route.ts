import { NextRequest, NextResponse } from "next/server";
import { connectGoogleCalendar } from "@/lib/repository";
import { exchangeCodeForTokens, parseGoogleState } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const appUrl = new URL("/", request.nextUrl.origin);
  appUrl.searchParams.set("screen", "settings");

  try {
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw new Error(request.nextUrl.searchParams.get("error") || "Missing Google OAuth code.");

    const state = parseGoogleState(request.nextUrl.searchParams.get("state"));
    const tokens = await exchangeCodeForTokens(request.nextUrl.origin, code);

    await connectGoogleCalendar(state.coupleId, state.role, {
      calendarId: "primary",
      calendarName: "Primary Google Calendar",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || "",
      tokenType: tokens.token_type || "Bearer",
      scope: tokens.scope || "",
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000)
    });

    appUrl.searchParams.set("coupleId", state.coupleId);
    appUrl.searchParams.set("calendarConnected", state.role);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar connection failed.";
    appUrl.searchParams.set("calendarError", message);
  }

  return NextResponse.redirect(appUrl);
}
