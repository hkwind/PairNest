import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_WORKSPACE_SLUG } from "@/lib/defaults";
import { bootstrapWorkspace } from "@/lib/repository";

export async function GET(request: NextRequest) {
  const coupleId = request.nextUrl.searchParams.get("coupleId") || DEFAULT_WORKSPACE_SLUG;
  return NextResponse.json(await bootstrapWorkspace(coupleId));
}
