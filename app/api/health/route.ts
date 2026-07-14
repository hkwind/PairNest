import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const workspaceCount = await prisma.workspace.count();
    const calendarConnectionColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'CalendarConnection'
      ORDER BY ordinal_position
    `;

    const columnNames = calendarConnectionColumns.map((column) => column.column_name);
    const requiredGoogleColumns = ["accessToken", "refreshToken", "tokenType", "scope", "expiresAt"];
    const missingGoogleColumns = requiredGoogleColumns.filter((column) => !columnNames.includes(column));

    return NextResponse.json({
      ok: true,
      message: "PairNest backend is running.",
      version: "next-prisma-0.1.0",
      db: {
        connected: true,
        workspaceCount
      },
      schema: {
        calendarConnectionColumns: columnNames,
        missingGoogleColumns
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown health check error";
    return NextResponse.json(
      {
        ok: false,
        message: "PairNest backend is running, but the database check failed.",
        detail: message
      },
      { status: 500 }
    );
  }
}
