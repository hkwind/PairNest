import type { MergedEvent } from "@/types/pairnest";

export function isEligibleSharedEvent(event: MergedEvent, partnerNames: string[]) {
  if (event.kind === "app") return true;
  const title = normalize(event.title);
  return partnerNames.some((name) => {
    const candidate = normalize(name);
    return candidate.length > 1 && title.includes(candidate);
  });
}

export function isFutureUnfinishedEvent(event: MergedEvent, now = new Date()) {
  if (event.allDay) return localDateKey(event.start) >= localDateKey(now.toISOString());
  const end = event.end ? new Date(event.end) : new Date(event.start);
  return end.getTime() > now.getTime();
}

export function uniqueEvents(events: MergedEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${normalize(event.title)}|${event.start}|${event.end || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function validMemory(thoughts: string, photoDataUrls: string[]) {
  return Boolean(thoughts.trim() || photoDataUrls.length);
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function localDateKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
