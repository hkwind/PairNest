import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_WORKSPACE_SLUG } from "@/lib/defaults";
import { addWishlist, removeWishlist, updateWishlist } from "@/lib/repository";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const coupleId = String(body.coupleId || DEFAULT_WORKSPACE_SLUG);
  return NextResponse.json(await addWishlist(coupleId, body));
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const coupleId = String(body.coupleId || DEFAULT_WORKSPACE_SLUG);
    return NextResponse.json(await updateWishlist(coupleId, String(body.id || ""), body));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Could not save wishlist item." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const coupleId = String(body.coupleId || DEFAULT_WORKSPACE_SLUG);
  return NextResponse.json(await removeWishlist(coupleId, String(body.id || "")));
}
