import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_WORKSPACE_SLUG } from "@/lib/defaults";
import { addGoal, removeGoal, setGoalStatus, updateGoal } from "@/lib/repository";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const coupleId = String(body.coupleId || DEFAULT_WORKSPACE_SLUG);
  return NextResponse.json(await addGoal(coupleId, body));
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const coupleId = String(body.coupleId || DEFAULT_WORKSPACE_SLUG);
    return NextResponse.json(await updateGoal(coupleId, String(body.id || ""), body));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not save goal." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const coupleId = String(body.coupleId || DEFAULT_WORKSPACE_SLUG);
  return NextResponse.json(await removeGoal(coupleId, String(body.id || "")));
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const coupleId = String(body.coupleId || DEFAULT_WORKSPACE_SLUG);
    const status = body.status === "Done" ? "Done" : "Planned";
    return NextResponse.json(await setGoalStatus(coupleId, String(body.id || ""), status));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not update goal status." }, { status: 400 });
  }
}
