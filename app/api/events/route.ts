import { after, NextRequest, NextResponse } from "next/server";
import { DEFAULT_WORKSPACE_SLUG } from "@/lib/defaults";
import { addEvent, removeEvent, syncPairNestEventById, updateEvent } from "@/lib/repository";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const coupleId = String(body.coupleId || DEFAULT_WORKSPACE_SLUG);
  const item = await addEvent(coupleId, body);
  after(() => syncPairNestEventById(coupleId, item.id));
  return NextResponse.json(item);
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const coupleId = String(body.coupleId || DEFAULT_WORKSPACE_SLUG);
  return NextResponse.json(await removeEvent(coupleId, String(body.id || "")));
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const coupleId = String(body.coupleId || DEFAULT_WORKSPACE_SLUG);
    const item = await updateEvent(coupleId, String(body.id || ""), body);
    after(() => syncPairNestEventById(coupleId, item.id));
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not update event." }, { status: 400 });
  }
}
