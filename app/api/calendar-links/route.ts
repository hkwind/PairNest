import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_WORKSPACE_SLUG } from "@/lib/defaults";
import { connectCalendar, disconnectCalendar, refreshCalendar } from "@/lib/repository";
import type { Role } from "@/types/pairnest";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const coupleId = String(body.coupleId || DEFAULT_WORKSPACE_SLUG);
  const role = body.role === "b" ? "b" : "a";
  return NextResponse.json(await connectCalendar(coupleId, role, String(body.calendarId || "primary")));
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const coupleId = String(body.coupleId || DEFAULT_WORKSPACE_SLUG);
  return NextResponse.json(await refreshCalendar(coupleId));
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const coupleId = String(body.coupleId || DEFAULT_WORKSPACE_SLUG);
  const role: Role = body.role === "b" ? "b" : "a";
  return NextResponse.json(await disconnectCalendar(coupleId, role));
}
