import { EventSource, PartnerRole, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { clampNumber, DEFAULT_COLORS, parseAnniversaryConfig, parseColors } from "@/lib/defaults";
import { parseDateInput, parseDateOnly, toIso } from "@/lib/dates";
import { generateAnniversaryEvents } from "@/lib/anniversary";
import { fetchGoogleEvents, removeGoogleEvent, upsertGoogleEvent } from "@/lib/google-calendar";
import type {
  BootstrapPayload,
  CustomEventItem,
  GoalItem,
  GoogleStatus,
  MemoryEntry,
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
  const [wishlist, goals, customEvents, calendarConnections, calendarCache, memories, calendarSyncState] =
    await Promise.all([
      prisma.wishlistItem.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, title: true, category: true, link: true, mapUrl: true, note: true,
          addedBy: true, priority: true, status: true, createdAt: true, updatedAt: true
        }
      }),
      prisma.goal.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, title: true, type: true, targetDate: true, status: true,
          owner: true, progress: true, mapUrl: true, note: true, createdAt: true, updatedAt: true
        }
      }),
      prisma.event.findMany({
        where: { workspaceId: workspace.id, deletedAt: null },
        orderBy: { start: "asc" },
        select: {
          id: true, title: true, start: true, end: true, source: true, note: true, mapUrl: true,
          aCalendarEventId: true, bCalendarEventId: true, aSyncStatus: true,
          bSyncStatus: true, deletedAt: true, createdAt: true, updatedAt: true
        }
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
      }),
      findMemoriesSafely(workspace.id),
      prisma.calendarSyncState.findUnique({ where: { workspaceId: workspace.id } }).catch(() => null)
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
      mapUrl: "",
      kind: "google",
      createdAt: item.fetchedAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    }))
  );

  const validMemories = memories.filter(hasMemoryContent);
  return {
    ok: true,
    appVersion: APP_VERSION,
    wishlist: wishlist.map(serializeWishlist),
    bucket: goals.map(serializeGoal),
    customEvents: customEvents.map(serializeCustomEvent),
    settings,
    googleStatus,
    mergedEvents,
    memories: validMemories.slice(0, 5).map(serializeMemory),
    recordedMemoryEventKeys: validMemories.map((memory) => memory.eventKey),
    syncResult: null,
    refreshResult: null,
    syncError: calendarSyncState?.lastError || "",
    calendarSync: {
      refreshing: Boolean(calendarSyncState?.runningUntil && calendarSyncState.runningUntil > new Date()),
      lastError: calendarSyncState?.lastError || "",
      lastCompletedAt: toIso(calendarSyncState?.lastCompletedAt)
    }
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
      mapUrl: optional(payload.mapUrl),
      note: optional(payload.note),
      addedBy: clean(payload.addedBy, "Someone"),
      priority: clean(payload.priority, "Medium"),
      status: clean(payload.status, "Saved")
    }
  });
  return serializeWishlist(item);
}

export async function updateWishlist(slug: string, id: string, payload: Record<string, unknown>) {
  const workspace = await ensureWorkspace(slug);
  if (!id) throw new Error("Wishlist item id is required.");
  const existing = await prisma.wishlistItem.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!existing) throw new Error("Wishlist item was not found in this workspace.");
  const item = await prisma.wishlistItem.update({
    where: { id: existing.id },
    data: {
      title: required(payload.title, "title"),
      category: clean(payload.category, "General"),
      link: optional(payload.link),
      mapUrl: optional(payload.mapUrl),
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

export async function setWishlistStatus(slug: string, id: string, status: string) {
  const workspace = await ensureWorkspace(slug);
  const existing = await prisma.wishlistItem.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!existing) throw new Error("Wishlist item was not found in this workspace.");
  return serializeWishlist(await prisma.wishlistItem.update({ where: { id: existing.id }, data: { status } }));
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
      mapUrl: optional(payload.mapUrl),
      note: optional(payload.note)
    }
  });
  return serializeGoal(item);
}

export async function updateGoal(slug: string, id: string, payload: Record<string, unknown>) {
  const workspace = await ensureWorkspace(slug);
  if (!id) throw new Error("Goal id is required.");
  const existing = await prisma.goal.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!existing) throw new Error("Goal was not found in this workspace.");
  const item = await prisma.goal.update({
    where: { id: existing.id },
    data: {
      title: required(payload.title, "title"),
      type: clean(payload.type, "General"),
      targetDate: parseDateOnly(String(payload.targetDate || "")),
      status: clean(payload.status, "Planned"),
      owner: clean(payload.owner, "Both"),
      progress: clampNumber(payload.progress, 0, 100, 0),
      mapUrl: optional(payload.mapUrl),
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

export async function setGoalStatus(slug: string, id: string, status: string) {
  const workspace = await ensureWorkspace(slug);
  const existing = await prisma.goal.findFirst({ where: { id, workspaceId: workspace.id } });
  if (!existing) throw new Error("Goal was not found in this workspace.");
  return serializeGoal(await prisma.goal.update({ where: { id: existing.id }, data: { status } }));
}

export async function addEvent(slug: string, payload: Record<string, unknown>) {
  const workspace = await ensureWorkspace(slug);
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
      mapUrl: optional(payload.mapUrl),
      aSyncStatus: "not_connected",
      bSyncStatus: "not_connected"
    }
  });
  return serializeCustomEvent(item);
}

export async function updateEvent(slug: string, id: string, payload: Record<string, unknown>) {
  const workspace = await ensureWorkspace(slug);
  const existing = await prisma.event.findFirst({ where: { id, workspaceId: workspace.id, deletedAt: null } });
  if (!existing) throw new Error("Event was not found in this workspace.");
  const start = parseDateInput(payload.start);
  if (!start) throw new Error("start is required");
  const item = await prisma.event.update({
    where: { id: existing.id },
    data: {
      title: required(payload.title, "title"),
      start,
      end: parseDateInput(payload.end),
      source: toPrismaSource(payload.source),
      note: optional(payload.note),
      mapUrl: optional(payload.mapUrl)
    }
  });
  return serializeCustomEvent(item);
}

export async function syncPairNestEventById(slug: string, id: string) {
  const workspace = await ensureWorkspace(slug);
  const event = await prisma.event.findFirst({ where: { id, workspaceId: workspace.id, deletedAt: null } });
  if (!event) return;
  await syncPairNestEvent(workspace.id, event);
}

export async function saveMemory(slug: string, payload: Record<string, unknown>) {
  const workspace = await ensureWorkspace(slug);
  const eventStart = parseDateInput(payload.eventStart);
  if (!eventStart) throw new Error("eventStart is required");
  const photoDataUrls = Array.isArray(payload.photoDataUrls)
    ? payload.photoDataUrls.map((item) => String(item)).filter(Boolean).slice(0, 6)
    : [];

  const item = await prisma.memoryEntry.upsert({
    where: {
      workspaceId_eventKey: {
        workspaceId: workspace.id,
        eventKey: required(payload.eventKey, "eventKey")
      }
    },
    update: {
      eventTitle: required(payload.eventTitle, "eventTitle"),
      eventStart,
      thoughts: optional(payload.thoughts),
      photoDataUrls
    },
    create: {
      workspaceId: workspace.id,
      eventKey: required(payload.eventKey, "eventKey"),
      eventTitle: required(payload.eventTitle, "eventTitle"),
      eventStart,
      thoughts: optional(payload.thoughts),
      photoDataUrls
    }
  });
  return serializeMemory(item);
}

export async function removeEvent(slug: string, id: string) {
  const workspace = await ensureWorkspace(slug);
  const existing = await prisma.event.findFirst({ where: { id, workspaceId: workspace.id, deletedAt: null } });
  if (!existing) return { ok: false };
  const connections = await prisma.calendarConnection.findMany({ where: { workspaceId: workspace.id, active: true, provider: "google" } });
  await Promise.allSettled(connections.map((connection) => {
    const externalEventId = connection.role === "A" ? existing.aCalendarEventId : existing.bCalendarEventId;
    return removeGoogleEvent(connection, externalEventId || "");
  }));
  const result = await prisma.event.updateMany({
    where: { id, workspaceId: workspace.id, deletedAt: null },
    data: { deletedAt: new Date() }
  });
  return { ok: result.count > 0 };
}

async function syncPairNestEvent(workspaceId: string, event: Prisma.EventGetPayload<object>) {
  const connections = await prisma.calendarConnection.findMany({ where: { workspaceId, active: true, provider: "google" } });
  let aCalendarEventId = event.aCalendarEventId;
  let bCalendarEventId = event.bCalendarEventId;
  let aSyncStatus = "not_connected";
  let bSyncStatus = "not_connected";

  for (const connection of connections) {
    const shouldSync = event.source === "SHARED" || event.source === connection.role;
    if (!shouldSync) continue;
    try {
      const externalEventId = await upsertGoogleEvent(connection, {
        externalEventId: connection.role === "A" ? aCalendarEventId : bCalendarEventId,
        title: event.title,
        start: event.start,
        end: event.end,
        note: event.note
      });
      if (connection.role === "A") {
        aCalendarEventId = externalEventId;
        aSyncStatus = "synced";
      } else {
        bCalendarEventId = externalEventId;
        bSyncStatus = "synced";
      }
    } catch {
      if (connection.role === "A") aSyncStatus = "reconnect_required";
      else bSyncStatus = "reconnect_required";
    }
  }

  return prisma.event.update({
    where: { id: event.id },
    data: { aCalendarEventId, bCalendarEventId, aSyncStatus, bSyncStatus }
  });
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

export async function createGoogleCalendarSession(
  slug: string,
  role: Role,
  payload: {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    scope: string;
    expiresAt: Date;
  }
) {
  const workspace = await ensureWorkspace(slug);
  const session = await prisma.calendarOAuthSession.create({
    data: {
      id: randomUUID(),
      workspaceId: workspace.id,
      role: toPrismaRole(role),
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken || null,
      tokenType: payload.tokenType,
      scope: payload.scope,
      expiresAt: payload.expiresAt,
      expiresOn: new Date(Date.now() + 10 * 60 * 1000)
    }
  });
  return session.id;
}

export async function getGoogleCalendarSession(sessionId: string) {
  if (!sessionId) throw new Error("Google Calendar selection session expired. Reconnect to continue.");
  const session = await prisma.calendarOAuthSession.findUnique({ where: { id: sessionId } });
  if (!session || session.expiresOn.getTime() < Date.now()) {
    if (session) await prisma.calendarOAuthSession.delete({ where: { id: session.id } });
    throw new Error("Google Calendar selection session expired. Reconnect to continue.");
  }
  return session;
}

export async function completeGoogleCalendarSession(sessionId: string, calendarId: string, calendarName: string) {
  const session = await getGoogleCalendarSession(sessionId);
  const connection = await connectGoogleCalendarByWorkspace(session.workspaceId, session.role, {
    calendarId,
    calendarName,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken || "",
    tokenType: session.tokenType || "Bearer",
    scope: session.scope || "",
    expiresAt: session.expiresAt || new Date()
  });
  await prisma.calendarOAuthSession.delete({ where: { id: session.id } });
  await refreshCalendarForWorkspace(session.workspaceId);
  return connection;
}

async function connectGoogleCalendarByWorkspace(
  workspaceId: string,
  role: PartnerRole,
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
  await prisma.calendarConnection.updateMany({
    where: { workspaceId, role, active: true, provider: "google" },
    data: { active: false }
  });
  return prisma.calendarConnection.create({
    data: { workspaceId, role, principalId: `google-${role.toLowerCase()}`, provider: "google", ...payload, refreshToken: payload.refreshToken || null, active: true }
  });
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
  return refreshCalendarForWorkspace(workspace.id);
}

async function refreshCalendarForWorkspace(workspaceId: string) {
  const now = new Date();
  await prisma.calendarSyncState.upsert({
    where: { workspaceId },
    update: {},
    create: { workspaceId }
  });
  const claimed = await prisma.calendarSyncState.updateMany({
    where: { workspaceId, OR: [{ runningUntil: null }, { runningUntil: { lt: now } }] },
    data: { runningUntil: new Date(now.getTime() + 2 * 60 * 1000), lastError: null }
  });
  if (!claimed.count) return { ok: true, message: "Calendar refresh already in progress." };

  try {
  const connections = await prisma.calendarConnection.findMany({
    where: { workspaceId, active: true, provider: "google" }
  });

  if (!connections.length) {
    await prisma.calendarSyncState.update({ where: { workspaceId }, data: { runningUntil: null, lastCompletedAt: new Date() } });
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
          workspaceId,
          role: connection.role,
          provider: "google",
          externalEventId: { notIn: seenIds.length ? seenIds : [""] }
        }
      }),
      ...events.map((event) =>
        prisma.calendarCache.upsert({
          where: {
            workspaceId_role_provider_externalEventId: {
              workspaceId,
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
            workspaceId,
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

  await prisma.calendarSyncState.update({ where: { workspaceId }, data: { runningUntil: null, lastCompletedAt: new Date(), lastError: null } });
  return {
    ok: true,
    message: `Google Calendar refreshed (${importedCount} events).`
  };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar refresh failed.";
    await prisma.calendarSyncState.update({ where: { workspaceId }, data: { runningUntil: null, lastError: message } });
    throw error;
  }
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

async function findMemoriesSafely(workspaceId: string) {
  try {
    return await prisma.memoryEntry.findMany({
      where: { workspaceId },
      orderBy: { eventStart: "desc" }
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code === "P2021" || code === "P2022") return [];
    throw error;
  }
}

function hasMemoryContent(item: { thoughts: string | null; photoDataUrls: string[] }) {
  return Boolean(item.thoughts?.trim() || item.photoDataUrls.length);
}

function serializeWishlist(item: Pick<Prisma.WishlistItemGetPayload<object>, "id" | "title" | "category" | "link" | "note" | "addedBy" | "priority" | "status" | "createdAt" | "updatedAt"> & { mapUrl?: string | null }): WishlistItem {
  return {
    id: item.id,
    coupleId: "",
    title: item.title,
    category: item.category,
    link: item.link || "",
    mapUrl: (item as { mapUrl?: string | null }).mapUrl || "",
    note: item.note || "",
    addedBy: item.addedBy,
    priority: item.priority,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function serializeGoal(item: Pick<Prisma.GoalGetPayload<object>, "id" | "title" | "type" | "targetDate" | "status" | "owner" | "progress" | "note" | "createdAt" | "updatedAt"> & { mapUrl?: string | null }): GoalItem {
  return {
    id: item.id,
    coupleId: "",
    title: item.title,
    type: item.type,
    targetDate: item.targetDate ? item.targetDate.toISOString().slice(0, 10) : "",
    status: item.status,
    owner: item.owner,
    progress: item.progress,
    mapUrl: (item as { mapUrl?: string | null }).mapUrl || "",
    note: item.note || "",
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function serializeCustomEvent(item: Pick<Prisma.EventGetPayload<object>, "id" | "title" | "start" | "end" | "source" | "note" | "aCalendarEventId" | "bCalendarEventId" | "aSyncStatus" | "bSyncStatus" | "deletedAt" | "createdAt" | "updatedAt"> & { mapUrl?: string | null }): CustomEventItem {
  return {
    id: item.id,
    coupleId: "",
    title: item.title,
    start: item.start.toISOString(),
    end: toIso(item.end),
    source: fromPrismaSource(item.source),
    note: item.note || "",
    mapUrl: (item as { mapUrl?: string | null }).mapUrl || "",
    aCalendarEventId: item.aCalendarEventId || "",
    bCalendarEventId: item.bCalendarEventId || "",
    aSyncStatus: item.aSyncStatus,
    bSyncStatus: item.bSyncStatus,
    deletedAt: toIso(item.deletedAt),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function serializeMemory(item: Prisma.MemoryEntryGetPayload<object>): MemoryEntry {
  return {
    id: item.id,
    eventKey: item.eventKey,
    eventTitle: item.eventTitle,
    eventStart: item.eventStart.toISOString(),
    thoughts: item.thoughts || "",
    photoDataUrls: item.photoDataUrls,
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
      mapUrl: item.mapUrl,
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
