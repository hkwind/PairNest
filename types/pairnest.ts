export type Source = "a" | "b" | "shared";
export type Role = "a" | "b";

export type WorkspaceSettings = {
  coupleId: string;
  workspaceName: string;
  anniversary: string;
  partnerAName: string;
  partnerBName: string;
  colors: string;
  anniversaryConfig: string;
  createdAt: string;
  updatedAt: string;
};

export type WishlistItem = {
  id: string;
  coupleId: string;
  title: string;
  category: string;
  link: string;
  mapUrl: string;
  note: string;
  addedBy: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type GoalItem = {
  id: string;
  coupleId: string;
  title: string;
  type: string;
  targetDate: string;
  status: string;
  owner: string;
  progress: number;
  mapUrl: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomEventItem = {
  id: string;
  coupleId: string;
  title: string;
  start: string;
  end: string;
  source: Source;
  note: string;
  mapUrl: string;
  aCalendarEventId: string;
  bCalendarEventId: string;
  aSyncStatus: string;
  bSyncStatus: string;
  deletedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type MergedEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  source: Source;
  sourceLabel: string;
  color: string;
  note: string;
  mapUrl: string;
  kind: "app" | "google" | "anniversary";
  createdAt: string;
  updatedAt: string;
};

export type MemoryEntry = {
  id: string;
  eventKey: string;
  eventTitle: string;
  eventStart: string;
  thoughts: string;
  photoDataUrls: string[];
  createdAt: string;
  updatedAt: string;
};

export type GoogleStatus = {
  aConnected: boolean;
  bConnected: boolean;
  a: { label: string; calendarName: string; calendarId: string };
  b: { label: string; calendarName: string; calendarId: string };
  currentRole: Role | "";
};

export type BootstrapPayload = {
  ok: true;
  appVersion: string;
  wishlist: WishlistItem[];
  bucket: GoalItem[];
  customEvents: CustomEventItem[];
  settings: WorkspaceSettings;
  googleStatus: GoogleStatus;
  mergedEvents: MergedEvent[];
  memories: MemoryEntry[];
  recordedMemoryEventKeys: string[];
  homeSummary: { activeWishlistCount: number; activeGoalCount: number; pastMemoryCount: number };
  syncResult: null;
  refreshResult: null;
  syncError: string;
  calendarSync: { refreshing: boolean; lastError: string; lastCompletedAt: string };
};

export type ParsedColors = {
  userA: string;
  userB: string;
  shared: string;
};

export type AnniversaryConfig = {
  showInApp: boolean;
  syncToGoogle: boolean;
  mode: "monthly" | "100days" | "both" | "none";
  monthlyCount: number;
  hundredDaysCount: number;
};
