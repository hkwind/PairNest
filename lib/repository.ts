import { EventSource, PartnerRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clampNumber, DEFAULT_COLORS, parseAnniversaryConfig, parseColors } from "@/lib/defaults";
import { parseDateInput, parseDateOnly, toIso } from "@/lib/dates";
import { generateAnniversaryEvents } from "@/lib/anniversary";
import { fetchGoogleEvents } from "@/lib/google-calendar";
import type {
  BootstrapPayload,
  CustomEventItem,
  GoalItem,
  GoogleStatus,
  MergedEvent,
  Role,
  Source,
  WishlistItem,
  WorkspaceSettings
} from "@/types/pairnest";

const APP_VERSION = "next-prisma-0.1.0";

export async function ensureWorkspace(slug: string) {
  const workspace = await prisma.workspace.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      name: "PairNest",
      colorUserA: DEFAULT_COLORS.userA,
      colorUserB: DEFAULT_COLORS.userB,
      colorShared: DEFAULT_COLORS.shared,
      partners: {
        create: [
          { role: "A", name: "Alex" },
          { role: "B", name: "Jamie" }
        ]
      }
    },
    include: { partners: true }
  });

  if (workspace.partners.length < 2) {
    await prisma.partner.upsert({
      where: { workspaceId_role: { workspaceId: workspace.id, role: "A" } },
      update: {},
      create: { workspaceId: workspace.id, role: "A", name: "Alex" }
    });
    await prisma.partner.upsert({
      where: { workspaceId_role: { workspaceId: workspace.id, role: "B" } },
      update: {},
      create: { workspaceId: workspace.id, role: "B", name: "Jamie" }
    });
  }

  return prisma.workspace.findUniqueOrThrow({
    where: { slug },
    include: { partners: true }
  });
}

export async function bootstrapWorkspace(slug: string): Promise<BootstrapPayload> {
  const workspace = await ensureWorkspace(slug);
  const [wishlist, goals, customEvents, calendarConnections, calendarCache] =
    await Promise.all([
      prisma.wishlistItem.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" }
      }),
      prisma.goal.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" }
      }),
      prisma.event.findMany({
        where: { workspaceId: workspace.id, deletedAt: null },
        orderBy: { start: "asc" }
      }),
      prisma.calendarConnection.findMany({
        where: { workspaceId: workspace.id, active: true },
        select: {
          role: true,
          calendarId: true,
          calendarName: true
        }
      }),
      prisma.calendarCache.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { start: "asc" }
      })
    ]);

  const settings = serializeSettings(workspace);
  const googleStatus = serializeGoogleStatus(settings, calendarConnections);
  const mergedEvents = mergeEvents(
    settings,
    customEvents.map(serializeCustomEvent),
    calendarCache.map((item) => ({
      id: item.id,
      title: item.title,
      start: item.start.toISOString(),
      end: toIso(item.end),
      allDay: item.allDay,
      source: item.role === "A" ? "a" : "b",
      sourceLabel: item.role === "A" ? settings.partnerAName : settings.partnerBName,
      color: item.role === "A" ? parseColors(settings.colors).userA : parseColors(settings.colors).userB,
      note: "",
      kind: "google",
      createdAt: item.fetchedAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    }))
  );

  return {
    ok: true,
    appVersion: APP_VERSION,
    wishlist: wishlist.map(serializeWishlist),
    bucket: goals.map(serializeGoal),
    customEvents: customEvents.map(serializeCustomEvent),
    settings,
    googleStatus,
    mergedEvents,
    syncResult: null,
    refreshResult: null,
    syncError: ""
  };
}

export async function saveSettings(slug: string, payload: Record<string, unknown>) {
  const workspace = await ensureWorkspace(slug);
  const colors = parseColors(String(payload.colors || ""));
  const anniversaryConfig = parseAnniversaryConfig(String(payload.anniversaryConfig || ""));
  const anniversary = parseDateOnly(String(payload.anniversary || ""));

  const updated = await prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      name: clean(payload.workspaceName, workspace.name),
      anniversary,
      colorUserA: colors.userA,
      colorUserB: colors.userB,
      colorShared: colors.shared,
      showAnniversary: anniversaryConfig.showInApp,
      syncAnniversary: anniversaryConfig.syncToGoogle,
      anniversaryMode: anniversaryConfig.mode,
      monthlyCount: anniversaryConfig.monthlyCount,
      hundredDaysCount: anniversaryConfig.hundredDaysCount,
      partners: {
        upsert: [
          {
            where: { workspaceId_role: { workspaceId: workspace.id, role: "A" } },
            update: { name: clean(payload.partnerAName, "Alex") },
            create: { role: "A", name: clean(payload.partnerAName, "Alex") }
          },
          {
            where: { workspaceId_role: { workspaceId: workspace.id, role: "B" } },
            update: { name: clean(payload.partnerBName, "Jamie") },
            create: { role: "B", name: clean(payload.partnerBName, "Jamie") }
          }
        ]
      }
    },
    include: { partners: true }
  });

  return { ok: true, settings: serializeSettings(updated), anniversarySync: null, refreshResult: null };
}

export async function addWishlist(slug: string, payload: Record<string, unknown>) {
  const workspace = await ensureWorkspace(slug);
  const item = await prisma.wishlistItem.create({
    data: {
      workspaceId: workspace.id,
      title: required(payload.title, "title"),
      category: clean(payload.category, "General"),
      link: optional(payload.link),
      note: optional(payload.note),
      addedBy: clean(payload.addedBy, "Someone"),
      priority: clean(payload.priority, "Medium"),
      status: clean(payload.status, "Saved")
    }
  });
  return serializeWishlist(item);
}

export async function removeWishlist(slug: string, id: string) {
  const workspace = await ensureWorkspace(slug);
  const result = await prisma.wishlistItem.deleteMany({ where: { id, workspaceId: workspace.id } });
  return { ok: result.count > 0 };
}

export async function addGoal(slug: string, payload: Record<string, unknown>) {
  const workspace = await ensureWorkspace(slug);
  const item = await prisma.goal.create({
    data: {
      workspaceId: workspace.id,
      title: required(payload.title, "title"),
      type: clean(payload.type, "General"),
      targetDate: parseDateOnly(String(payload.targetDate || "")),
      status: clean(payload.status, "Planned"),
      owner: clean(payload.owner, "Both"),
      progress: clampNumber(payload.progress, 0, 100, 0),
      note: optional(payload.note)
    }
  });
  return serializeGoal(item);
}

export async function removeGoal(slug: string, id: string) {
  const workspace = await ensureWorkspace(slug);
  const result = await prisma.goal.deleteMany({ where: { id, workspaceId: workspace.id } });
  return { ok: result.count > 0 };
}

export async function addEvent(slug: string, payload: Record<string, unknown>) {
  const workspace = await ensureWorkspace(slug);
  const connections = await prisma.calendarConnection.findMany({
    where: { workspaceId: workspace.id, active: true }
  });
  const start = parseDateInput(payload.start);
  if (!start) throw new Error("start is required");
  const item = await prisma.event.create({
    data: {
      workspaceId: workspace.id,
      title: required(payload.title, "title"),
      start,
      end: parseDateInput(payload.end),
      source: toPrismaSource(payload.source),
      note: optional(payload.note),
      aSyncStatus: connections.some((link) => link.role === "A") ? "pending" : "not_connected",
      bSyncStatus: connections.some((link) => link.role === "B") ? "pending" : "not_connected"
    }
  });
  return serializeCustomEvent(item);
}

export async function removeEvent(slug: string, id: string) {
  const workspace = await ensureWorkspace(slug);
  const result = await prisma.event.updateMany({
    where: { id, workspaceId: workspace.id, deletedAt: null },
    data: { deletedAt: new Date() }
  });
  return { ok: result.count > 0 };
}

export async function connectCalendar(slug: string, role: Role, calendarId: string) {
  const workspace = await ensureWorkspace(slug);
  const prismaRole = toPrismaRole(role);
  await prisma.calendarConnection.updateMany({
    where: { workspaceId: workspace.id, role: prismaRole, active: true },
    data: { active: false }
  });
  const connection = await prisma.calendarConnection.create({
    data: {
      workspaceId: workspace.id,
      role: prismaRole,
      principalId: `manual-${role}`,
      calendarId: calendarId || "primary",
      calendarName: calendarId || "primary",
      active: true
    }
  });
  return {
    ok: true,
    role,
    principalId: connection.principalId,
    calendarId: connection.calendarId,
    calendarName: connection.calendarName,
    syncResult: null,
    anniversarySync: null,
    refreshResult: null
  };
}

export async function connectGoogleCalendar(
  slug: string,
  role: Role,
  payload: {
    calendarId: string;
    calendarName: string;
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    scope: string;
    expiresAt: Date;
  }
) {
  const workspace = await ensureWorkspace(slug);
  const prismaRole = toPrismaRole(role);
  await prisma.calendarConnection.updateMany({
    where: { workspaceId: workspace.id, role: prismaRole, active: true, provider: "google" },
    data: { active: false }
  });

  const connection = await prisma.calendarConnection.create({
    data: {
      workspaceId: workspace.id,
      role: prismaRole,
      principalId: `google-${role}`,
      provider: "google",
      calendarId: payload.calendarId || "primary",
      calendarName: payload.calendarName || "Primary calendar",
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken || null,
      tokenType: payload.tokenType,
      scope: payload.scope,
      expiresAt: payload.expiresAt,
      active: true
    }
  });

  await refreshCalendar(slug);
  return connection;
}

export async function disconnectCalendar(slug: string, role: Role) {
  const workspace = await ensureWorkspace(slug);
  const result = await prisma.calendarConnection.updateMany({
    where: { workspaceId: workspace.id, role: toPrismaRole(role), active: true, provider: "google" },
    data: { active: false }
  });
  return { ok: result.count > 0 };
}

export async function refreshCalendar(slug: string) {
  const workspace = await ensureWorkspace(slug);
  const connections = await prisma.calendarConnection.findMany({
    where: { workspaceId: workspace.id, active: true, provider: "google" }
  });

  if (!connections.length) {
    return { ok: true, message: "Connect Google Calendar first, then refresh." };
  }

  let importedCount = 0;
  for (const connection of connections) {
    const events = await fetchGoogleEvents(connection);
    importedCount += events.length;
    const seenIds = events.map((event) => event.externalEventId);

    await prisma.$transaction([
      prisma.calendarCache.deleteMany({
        where: {
          workspaceId: workspace.id,
          role: connection.role,
          provider: "google",
          externalEventId: { notIn: seenIds.length ? seenIds : [""] }
        }
      }),
      ...events.map((event) =>
        prisma.calendarCache.upsert({
          where: {
            workspaceId_role_provider_externalEventId: {
              workspaceId: workspace.id,
              role: connection.role,
              provider: "google",
              externalEventId: event.externalEventId
            }
          },
          update: {
            title: event.title,
            start: event.start,
            end: event.end,
            allDay: event.allDay,
            calendarId: connection.calendarId,
            fetchedAt: new Date()
          },
          create: {
            workspaceId: workspace.id,
            role: connection.role,
            provider: "google",
            externalEventId: event.externalEventId,
            title: event.title,
            start: event.start,
            end: event.end,
            allDay: event.allDay,
            calendarId: connection.calendarId
          }
        })
      )
    ]);
  }

  return {
    ok: true,
    message: `Google Calendar refreshed (${importedCount} events).`
  };
}

function serializeSettings(
  workspace: Prisma.WorkspaceGetPayload<{ include: { partners: true } }>
): WorkspaceSettings {
  const partnerA = workspace.partners.find((partner) => partner.role === "A");
  const partnerB = workspace.partners.find((partner) => partner.role === "B");
  return {
    coupleId: workspace.slug,
    workspaceName: workspace.name,
    anniversary: workspace.anniversary ? workspace.anniversary.toISOString().slice(0, 10) : "",
    partnerAName: partnerA?.name || "Alex",
    partnerBName: partnerB?.name || "Jamie",
    colors: JSON.stringify({
      userA: workspace.colorUserA,
      userB: workspace.colorUserB,
      shared: workspace.colorShared
    }),
    anniversaryConfig: JSON.stringify({
      showInApp: workspace.showAnniversary,
      syncToGoogle: workspace.syncAnniversary,
      mode: workspace.anniversaryMode,
      monthlyCount: workspace.monthlyCount,
      hundredDaysCount: workspace.hundredDaysCount
    }),
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString()
  };
}

function serializeGoogleStatus(
  settings: WorkspaceSettings,
  connections: { role: PartnerRole; calendarId: string; calendarName: string }[]
): GoogleStatus {
  const a = connections.find((item) => item.role === "A");
  const b = connections.find((item) => item.role === "B");
  return {
    aConnected: Boolean(a),
    bConnected: Boolean(b),
    a: { label: settings.partnerAName, calendarId: a?.calendarId || "", calendarName: a?.calendarName || "" },
    b: { label: settings.partnerBName, calendarId: b?.calendarId || "", calendarName: b?.calendarName || "" },
    currentRole: ""
  };
}

function serializeWishlist(item: Prisma.WishlistItemGetPayload<object>): WishlistItem {
  return {
    id: item.id,
    coupleId: "",
    title: item.title,
    category: item.category,
    link: item.link || "",
    note: item.note || "",
    addedBy: item.addedBy,
    priority: item.priority,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function serializeGoal(item: Prisma.GoalGetPayload<object>): GoalItem {
  return {
    id: item.id,
    coupleId: "",
    title: item.title,
    type: item.type,
    targetDate: item.targetDate ? item.targetDate.toISOString().slice(0, 10) : "",
    status: item.status,
    owner: item.owner,
    progress: item.progress,
    note: item.note || "",
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function serializeCustomEvent(item: Prisma.EventGetPayload<object>): CustomEventItem {
  return {
    id: item.id,
    coupleId: "",
    title: item.title,
    start: item.start.toISOString(),
    end: toIso(item.end),
    source: fromPrismaSource(item.source),
    note: item.note || "",
    aCalendarEventId: item.aCalendarEventId || "",
    bCalendarEventId: item.bCalendarEventId || "",
    aSyncStatus: item.aSyncStatus,
    bSyncStatus: item.bSyncStatus,
    deletedAt: toIso(item.deletedAt),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function mergeEvents(
  settings: WorkspaceSettings,
  customEvents: CustomEventItem[],
  cachedEvents: MergedEvent[]
): MergedEvent[] {
  const colors = parseColors(settings.colors);
  const appEvents = customEvents.map((item): MergedEvent => {
    const source = item.source;
    return {
      id: item.id,
      title: item.title,
      start: item.start,
      end: item.end,
      allDay: item.start.length <= 10,
      source,
      sourceLabel:
        source === "a" ? settings.partnerAName : source === "b" ? settings.partnerBName : "Shared",
      color: source === "a" ? colors.userA : source === "b" ? colors.userB : colors.shared,
      note: item.note,
      kind: "app",
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    };
  });

  const anniversaryEvents = generateAnniversaryEvents(settings);
  const grouped = new Map<string, MergedEvent[]>();
  for (const event of [...appEvents, ...cachedEvents, ...anniversaryEvents]) {
    const key = `${event.title.toLowerCase().replace(/\s+/g, " ")}-${event.start}-${event.end}`;
    grouped.set(key, [...(grouped.get(key) || []), event]);
  }

  return Array.from(grouped.values())
    .map((group) => group.find((event) => event.source === "shared") || group[0])
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

function clean(value: unknown, fallback: string) {
  const text = String(value || "").trim();
  return text || fallback;
}

function optional(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function required(value: unknown, name: string) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}

function toPrismaRole(role: Role): PartnerRole {
  return role === "a" ? "A" : "B";
}

function toPrismaSource(source: unknown): EventSource {
  if (source === "a") return "A";
  if (source === "b") return "B";
  return "SHARED";
}

function fromPrismaSource(source: EventSource): Source {
  if (source === "A") return "a";
  if (source === "B") return "b";
  return "shared";
}
