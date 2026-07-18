import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_WORKSPACE_SLUG } from "@/lib/defaults";
import { bootstrapWorkspace } from "@/lib/repository";

export async function GET(request: NextRequest) {
  const coupleId = request.nextUrl.searchParams.get("coupleId") || DEFAULT_WORKSPACE_SLUG;

  try {
    return NextResponse.json(await bootstrapWorkspace(coupleId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown bootstrap error";
    const errorCode = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
    console.error("PairNest bootstrap failed", { coupleId, message });

    return NextResponse.json(
      {
        ok: false,
        code: "BOOTSTRAP_FAILED",
        message:
          "PairNest could not load the workspace. Check /api/health for the database schema and migration status.",
        errorCode,
        detail: process.env.NODE_ENV === "production" ? undefined : message
      },
      { status: 500 }
    );
  }
}
