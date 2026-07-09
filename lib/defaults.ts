import type { AnniversaryConfig, ParsedColors } from "@/types/pairnest";

export const DEFAULT_WORKSPACE_SLUG =
  process.env.PAIRNEST_DEFAULT_WORKSPACE_ID || "demo-couple";

export const DEFAULT_COLORS: ParsedColors = {
  userA: "#01696f",
  userB: "#a13544",
  shared: "#6f5ef9"
};

export const DEFAULT_ANNIVERSARY_CONFIG: AnniversaryConfig = {
  showInApp: true,
  syncToGoogle: false,
  mode: "monthly",
  monthlyCount: 24,
  hundredDaysCount: 10
};

export function parseColors(value: string | null | undefined): ParsedColors {
  try {
    const parsed = value ? JSON.parse(value) : {};
    return {
      userA: normalizeHexColor(parsed.userA, DEFAULT_COLORS.userA),
      userB: normalizeHexColor(parsed.userB, DEFAULT_COLORS.userB),
      shared: normalizeHexColor(parsed.shared, DEFAULT_COLORS.shared)
    };
  } catch {
    return DEFAULT_COLORS;
  }
}

export function parseAnniversaryConfig(
  value: string | null | undefined
): AnniversaryConfig {
  try {
    const parsed = value ? JSON.parse(value) : {};
    const mode = ["monthly", "100days", "both", "none"].includes(parsed.mode)
      ? parsed.mode
      : DEFAULT_ANNIVERSARY_CONFIG.mode;
    return {
      showInApp:
        typeof parsed.showInApp === "boolean"
          ? parsed.showInApp
          : DEFAULT_ANNIVERSARY_CONFIG.showInApp,
      syncToGoogle:
        typeof parsed.syncToGoogle === "boolean"
          ? parsed.syncToGoogle
          : DEFAULT_ANNIVERSARY_CONFIG.syncToGoogle,
      mode,
      monthlyCount: clampNumber(parsed.monthlyCount, 1, 120, 24),
      hundredDaysCount: clampNumber(parsed.hundredDaysCount, 1, 100, 10)
    };
  } catch {
    return DEFAULT_ANNIVERSARY_CONFIG;
  }
}

export function normalizeHexColor(value: unknown, fallback: string) {
  const raw = String(value || "").trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : fallback;
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
