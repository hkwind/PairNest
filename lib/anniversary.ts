import type { MergedEvent, WorkspaceSettings } from "@/types/pairnest";
import { addDays, addMonthsClamped, parseDateOnly, startOfDay } from "@/lib/dates";
import { parseAnniversaryConfig, parseColors } from "@/lib/defaults";

export function generateAnniversaryEvents(settings: WorkspaceSettings): MergedEvent[] {
  const config = parseAnniversaryConfig(settings.anniversaryConfig);
  if (!settings.anniversary || !config.showInApp || config.mode === "none") return [];

  const base = parseDateOnly(settings.anniversary);
  if (!base) return [];

  const colors = parseColors(settings.colors);
  const workspaceName = settings.workspaceName || "PairNest";
  const events: MergedEvent[] = [];

  if (config.mode === "monthly" || config.mode === "both") {
    for (let i = 1; i <= config.monthlyCount; i += 1) {
      const date = startOfDay(addMonthsClamped(base, i));
      events.push({
        id: `anniversary-${settings.coupleId}-m-${i}`,
        title: `${workspaceName} - ${i} month anniversary`,
        start: date.toISOString(),
        end: "",
        allDay: true,
        source: "shared",
        sourceLabel: "Shared",
        color: colors.shared,
        note: "Monthly anniversary",
        kind: "anniversary",
        createdAt: "",
        updatedAt: ""
      });
    }
  }

  if (config.mode === "100days" || config.mode === "both") {
    for (let i = 1; i <= config.hundredDaysCount; i += 1) {
      const days = i * 100;
      const date = startOfDay(addDays(base, days));
      events.push({
        id: `anniversary-${settings.coupleId}-d-${days}`,
        title: `${workspaceName} - ${days} days anniversary`,
        start: date.toISOString(),
        end: "",
        allDay: true,
        source: "shared",
        sourceLabel: "Shared",
        color: colors.shared,
        note: "100-day anniversary",
        kind: "anniversary",
        createdAt: "",
        updatedAt: ""
      });
    }
  }

  return events;
}
