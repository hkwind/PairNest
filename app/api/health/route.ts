import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const workspaceCount = await prisma.workspace.count();
    const schemaRows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `;

    const hasColumn = (tableName: string, columnName: string) =>
      schemaRows.some((row) => row.table_name === tableName && row.column_name === columnName);
    const tableNames = new Set(schemaRows.map((row) => row.table_name));
    const columnNames = schemaRows.filter((row) => row.table_name === "CalendarConnection").map((row) => row.column_name);
    const requiredGoogleColumns = ["accessToken", "refreshToken", "tokenType", "scope", "expiresAt"];
    const missingGoogleColumns = requiredGoogleColumns.filter((column) => !columnNames.includes(column));
    const requiredMapColumns = ["WishlistItem.mapUrl", "Goal.mapUrl", "Event.mapUrl"];
    const missingMapColumns = requiredMapColumns.filter((entry) => {
      const [tableName, columnName] = entry.split(".");
      return !hasColumn(tableName, columnName);
    });
    const requiredTables = ["MemoryEntry", "CalendarOAuthSession", "CalendarSyncState"];
    const missingTables = requiredTables.filter((tableName) => !tableNames.has(tableName));
    const recentMigrations = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
      SELECT migration_name, finished_at
      FROM "_prisma_migrations"
      ORDER BY started_at DESC
      LIMIT 10
    `.catch(() => []);

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
        missingGoogleColumns,
        missingMapColumns,
        missingTables,
        recentMigrations
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
