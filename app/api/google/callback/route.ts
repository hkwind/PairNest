import { NextRequest, NextResponse } from "next/server";
import { createGoogleCalendarSession } from "@/lib/repository";
import { exchangeCodeForTokens, parseGoogleState } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const appUrl = new URL("/", request.nextUrl.origin);
  appUrl.searchParams.set("screen", "settings");

  try {
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw new Error(request.nextUrl.searchParams.get("error") || "Missing Google OAuth code.");

    const state = parseGoogleState(request.nextUrl.searchParams.get("state"));
    if (request.cookies.get("pairnest_google_oauth")?.value !== state.nonce) {
      throw new Error("Google Calendar sign-in session expired. Please try again.");
    }
    const tokens = await exchangeCodeForTokens(request.nextUrl.origin, code);

    const sessionId = await createGoogleCalendarSession(state.coupleId, state.role, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || "",
      tokenType: tokens.token_type || "Bearer",
      scope: tokens.scope || "",
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000)
    });

    appUrl.searchParams.set("coupleId", state.coupleId);
    appUrl.searchParams.set("calendarSelect", "1");
    const response = NextResponse.redirect(appUrl);
    response.cookies.set("pairnest_google_oauth", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0, path: "/" });
    response.cookies.set("pairnest_google_calendar_session", sessionId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar connection failed.";
    appUrl.searchParams.set("calendarError", message);
  }

  return NextResponse.redirect(appUrl);
}
