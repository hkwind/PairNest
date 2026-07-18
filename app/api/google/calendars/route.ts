import { NextRequest, NextResponse } from "next/server";
import { completeGoogleCalendarSession, getGoogleCalendarSession } from "@/lib/repository";
import { fetchGoogleCalendars } from "@/lib/google-calendar";

const SESSION_COOKIE = "pairnest_google_calendar_session";

export async function GET(request: NextRequest) {
  try {
    const session = await getGoogleCalendarSession(request.cookies.get(SESSION_COOKIE)?.value || "");
    const calendars = await fetchGoogleCalendars(session.accessToken);
    return NextResponse.json({ calendars });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not load Google Calendars." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionId = request.cookies.get(SESSION_COOKIE)?.value || "";
    const session = await getGoogleCalendarSession(sessionId);
    const body = await request.json();
    const calendarId = String(body.calendarId || "");
    const calendars = await fetchGoogleCalendars(session.accessToken);
    const selected = calendars.find((calendar) => calendar.id === calendarId);
    if (!selected) throw new Error("Choose one of the calendars from your Google account.");
    await completeGoogleCalendarSession(sessionId, selected.id, selected.name);
    const response = NextResponse.json({ ok: true, calendarName: selected.name });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0, path: "/" });
    return response;
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not connect Google Calendar." }, { status: 400 });
  }
}
