import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "PairNest backend is running.",
    version: "next-prisma-0.1.0"
  });
}
