import type { CalendarConnection, PartnerRole } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export type GoogleOAuthState = {
  coupleId: string;
  role: "a" | "b";
  nonce: string;
};

export type GoogleCalendarOption = { id: string; name: string; primary: boolean };

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

type GoogleEvent = {
  id: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

type GoogleEventsResponse = {
  items?: GoogleEvent[];
};

type GoogleCalendarListResponse = {
  items?: Array<{ id?: string; summary?: string; primary?: boolean }>;
};

export function getGoogleConfig(origin: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Google Calendar needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }

  return { clientId, clientSecret, redirectUri };
}

export function createGoogleAuthUrl(origin: string, state: GoogleOAuthState) {
  const { clientId, clientSecret, redirectUri } = getGoogleConfig(origin);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: signState(state, clientSecret)
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function parseGoogleState(value: string | null): GoogleOAuthState {
  if (!value) throw new Error("Missing Google OAuth state.");
  const [payload, signature] = value.split(".");
  const { clientSecret } = getGoogleConfig(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  if (!payload || !signature || !isValidSignature(payload, signature, clientSecret)) {
    throw new Error("Invalid Google OAuth state signature.");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GoogleOAuthState;
  if (!parsed.coupleId || !parsed.nonce || (parsed.role !== "a" && parsed.role !== "b")) {
    throw new Error("Invalid Google OAuth state.");
  }
  return parsed;
}

export async function fetchGoogleCalendars(accessToken: string): Promise<GoogleCalendarOption[]> {
  const response = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList?minAccessRole=reader`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(await readGoogleError(response, "Could not fetch Google Calendars."));
  const data = (await response.json()) as GoogleCalendarListResponse;
  return (data.items || [])
    .filter((calendar): calendar is { id: string; summary?: string; primary?: boolean } => Boolean(calendar.id))
    .map((calendar) => ({ id: calendar.id, name: calendar.summary || "Untitled calendar", primary: Boolean(calendar.primary) }));
}

function signState(state: GoogleOAuthState, secret: string) {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${stateSignature(payload, secret)}`;
}

function isValidSignature(payload: string, signature: string, secret: string) {
  const expected = stateSignature(payload, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function stateSignature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export async function exchangeCodeForTokens(origin: string, code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getGoogleConfig(origin);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code
    })
  });

  if (!response.ok) throw new Error(await readGoogleError(response, "Google token exchange failed."));
  return response.json() as Promise<TokenResponse>;
}

export async function refreshAccessToken(connection: CalendarConnection) {
  if (connection.accessToken && connection.expiresAt && connection.expiresAt.getTime() > Date.now() + 60000) {
    return connection.accessToken;
  }

  if (!connection.refreshToken) {
    throw new Error("Google Calendar connection is missing a refresh token. Reconnect the calendar.");
  }

  const { clientId, clientSecret } = getGoogleConfig(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken
    })
  });

  if (!response.ok) throw new Error(await readGoogleError(response, "Google token refresh failed."));
  const tokens = (await response.json()) as TokenResponse;
  await prisma.calendarConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: tokens.access_token,
      tokenType: tokens.token_type || connection.tokenType,
      scope: tokens.scope || connection.scope,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000)
    }
  });

  return tokens.access_token;
}

export async function fetchGoogleEvents(connection: CalendarConnection) {
  const accessToken = await refreshAccessToken(connection);
  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - 30);
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 180);

  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: "250"
  });
  const calendarId = encodeURIComponent(connection.calendarId || "primary");
  const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) throw new Error(await readGoogleError(response, "Could not refresh Google Calendar events."));
  const data = (await response.json()) as GoogleEventsResponse;
  return (data.items || []).flatMap((event) => normalizeGoogleEvent(event, connection.role));
}

export async function upsertGoogleEvent(
  connection: CalendarConnection,
  event: { externalEventId?: string | null; title: string; start: Date; end: Date | null; note: string | null }
) {
  const accessToken = await refreshAccessToken(connection);
  const calendarId = encodeURIComponent(connection.calendarId || "primary");
  const body = {
    summary: event.title,
    description: event.note || "",
    start: { dateTime: event.start.toISOString() },
    end: { dateTime: (event.end || new Date(event.start.getTime() + 60 * 60 * 1000)).toISOString() }
  };
  const isUpdate = Boolean(event.externalEventId);
  const url = isUpdate
    ? `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${encodeURIComponent(event.externalEventId || "")}`
    : `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`;
  const response = await fetch(url, {
    method: isUpdate ? "PUT" : "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await readGoogleError(response, "Could not sync this PairNest event to Google Calendar."));
  return (await response.json() as { id?: string }).id || "";
}

export async function removeGoogleEvent(connection: CalendarConnection, externalEventId: string) {
  if (!externalEventId) return;
  const accessToken = await refreshAccessToken(connection);
  const calendarId = encodeURIComponent(connection.calendarId || "primary");
  const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${encodeURIComponent(externalEventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(await readGoogleError(response, "Could not remove this PairNest event from Google Calendar."));
  }
}

function normalizeGoogleEvent(event: GoogleEvent, role: PartnerRole) {
  const start = event.start?.dateTime || event.start?.date;
  if (!event.id || !start) return [];
  const end = event.end?.dateTime || event.end?.date || null;
  return [
    {
      role,
      externalEventId: event.id,
      title: event.summary || "Untitled event",
      start: new Date(start),
      end: end ? new Date(end) : null,
      allDay: Boolean(event.start?.date),
      note: event.description || ""
    }
  ];
}

async function readGoogleError(response: Response, fallback: string) {
  const text = await response.text();
  try {
    const data = JSON.parse(text) as { error?: { message?: string }; error_description?: string };
    return data.error?.message || data.error_description || fallback;
  } catch {
    return text || fallback;
  }
}
