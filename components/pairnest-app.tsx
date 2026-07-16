"use client";

import type { CSSProperties, ChangeEvent, FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import { parseAnniversaryConfig, parseColors } from "@/lib/defaults";
import type {
  BootstrapPayload,
  CustomEventItem,
  GoalItem,
  MemoryEntry,
  MergedEvent,
  Role,
  Source,
  WishlistItem
} from "@/types/pairnest";
import { Icons } from "@/components/icons";

type Screen = "home" | "wishlist" | "goals" | "calendar" | "memories" | "settings";
type Modal = "wishlist" | "goal" | "event" | null;
type CalendarView = "month" | "week" | "agenda";
type SortMode = "newest" | "oldest" | "priority" | "progress";

const navItems: { screen: Screen; label: string; Icon: typeof Icons.Home }[] = [
  { screen: "home", label: "Main", Icon: Icons.Home },
  { screen: "wishlist", label: "Wishlist", Icon: Icons.Gift },
  { screen: "goals", label: "Goals", Icon: Icons.ListTodo },
  { screen: "calendar", label: "Calendar", Icon: Icons.CalendarDays },
  { screen: "memories", label: "Memories", Icon: Icons.Camera },
  { screen: "settings", label: "Settings", Icon: Icons.Settings }
];

export function PairNestApp({ initialCoupleId }: { initialCoupleId: string }) {
  const [coupleId] = useState(initialCoupleId);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [modal, setModal] = useState<Modal>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [wishlistFilter, setWishlistFilter] = useState("All");
  const [goalFilter, setGoalFilter] = useState("All");
  const [wishlistSort, setWishlistSort] = useState<SortMode>("newest");
  const [goalSort, setGoalSort] = useState<SortMode>("newest");
  const [busy, setBusy] = useState("Loading workspace...");
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");

  const loadAll = useCallback(async (quiet = false) => {
    if (!quiet) setBusy("Loading workspace...");
    try {
      setLoadError("");
      setData(await api.bootstrap(coupleId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Load failed";
      setLoadError(message);
      showToast(message);
    } finally {
      if (!quiet) setBusy("");
    }
  }, [coupleId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetScreen = params.get("screen");
    const connectedRole = params.get("calendarConnected");
    const calendarError = params.get("calendarError");
    if (targetScreen && navItems.some((item) => item.screen === targetScreen)) {
      setScreen(targetScreen as Screen);
    }
    if (connectedRole) {
      showToast("Google Calendar connected");
      void loadAll(true);
    }
    if (calendarError) showToast(calendarError);
  }, [loadAll]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 680) setCalendarView("agenda");
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const settings = data?.settings;
  const colors = parseColors(settings?.colors);
  const partnerAName = settings?.partnerAName || "Alex";
  const partnerBName = settings?.partnerBName || "Jamie";
  const upcoming = useMemo(() => getUpcoming(data?.mergedEvents || []), [data]);
  const avgProgress = data?.bucket.length
    ? Math.round(data.bucket.reduce((sum, item) => sum + item.progress, 0) / data.bucket.length)
    : 0;

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  async function mutate(action: () => Promise<unknown>, onError?: () => void) {
    try {
      await action();
    } catch (error) {
      onError?.();
      showToast(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  function updateData(updater: (current: BootstrapPayload) => BootstrapPayload) {
    setData((current) => (current ? updater(current) : current));
  }

  function connectGoogle(role: Role) {
    window.location.href = `/api/google/start?coupleId=${encodeURIComponent(coupleId)}&role=${role}`;
  }

  const cssVars = {
    "--source-a": colors.userA,
    "--source-b": colors.userB,
    "--source-shared": colors.shared
  } as CSSProperties;

  return (
    <div className="app-shell" style={cssVars}>
      <aside className="side-nav" aria-label="Primary navigation">
        <Brand title={settings?.workspaceName || "PairNest"} subtitle={subtitle(screen)} />
        <nav>
          {navItems.map(({ screen: itemScreen, label, Icon }) => (
            <button
              className={itemScreen === screen ? "nav-item active" : "nav-item"}
              key={itemScreen}
              onClick={() => setScreen(itemScreen)}
              type="button"
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <Brand title={settings?.workspaceName || "PairNest"} subtitle={subtitle(screen)} />
          <button className="icon-btn" onClick={() => loadAll()} type="button" aria-label="Refresh">
            <Icons.RefreshCw size={20} />
          </button>
        </header>

        <main className="content">
          {!data && loadError ? (
            <section className="app-error-panel">
              <div>
                <span className="eyebrow">Connection issue</span>
                <h2>PairNest could not load.</h2>
                <p>{loadError}</p>
              </div>
              <button className="primary-btn" onClick={() => void loadAll()} type="button">
                Try again
              </button>
            </section>
          ) : !data ? (
            <div className="empty-state">Loading PairNest...</div>
          ) : (
            <>
              {screen === "home" && (
                <HomeScreen
                  data={data}
                  upcoming={upcoming}
                  avgProgress={avgProgress}
                  onGo={setScreen}
                />
              )}
              {screen === "wishlist" && (
                <WishlistScreen
                  items={data.wishlist}
                  filter={wishlistFilter}
                  sort={wishlistSort}
                  onFilter={setWishlistFilter}
                  onSort={setWishlistSort}
                  onAdd={() => setModal("wishlist")}
                  onSave={(id, payload) =>
                    mutate(async () => {
                      const item = await api.updateWishlist(coupleId, id, payload);
                      updateData((current) => ({
                        ...current,
                        wishlist: current.wishlist.map((entry) => (entry.id === id ? item : entry))
                      }));
                      showToast("Wishlist updated");
                    })
                  }
                  onDelete={(id) => {
                    const previous = data;
                    updateData((current) => ({
                      ...current,
                      wishlist: current.wishlist.filter((item) => item.id !== id)
                    }));
                    void mutate(() => api.removeWishlist(coupleId, id), () => setData(previous));
                  }}
                />
              )}
              {screen === "goals" && (
                <GoalsScreen
                  items={data.bucket}
                  filter={goalFilter}
                  sort={goalSort}
                  onFilter={setGoalFilter}
                  onSort={setGoalSort}
                  onAdd={() => setModal("goal")}
                  onSave={(id, payload) =>
                    mutate(async () => {
                      const item = await api.updateGoal(coupleId, id, payload);
                      updateData((current) => ({
                        ...current,
                        bucket: current.bucket.map((entry) => (entry.id === id ? item : entry))
                      }));
                      showToast("Goal updated");
                    })
                  }
                  onDelete={(id) => {
                    const previous = data;
                    updateData((current) => ({
                      ...current,
                      bucket: current.bucket.filter((item) => item.id !== id)
                    }));
                    void mutate(() => api.removeGoal(coupleId, id), () => setData(previous));
                  }}
                />
              )}
              {screen === "calendar" && (
                <CalendarScreen
                  events={data.mergedEvents}
                  view={calendarView}
                  onView={setCalendarView}
                  onAdd={() => setModal("event")}
                  onDelete={(id) => {
                    const previous = data;
                    updateData((current) => ({
                      ...current,
                      customEvents: current.customEvents.filter((item) => item.id !== id),
                      mergedEvents: current.mergedEvents.filter((event) => event.id !== id)
                    }));
                    void mutate(() => api.removeEvent(coupleId, id), () => setData(previous));
                  }}
                  onRefresh={() =>
                    mutate(async () => {
                      showToast("Refreshing Google Calendar...");
                      const result = await api.refreshCalendar(coupleId);
                      if (result.message) showToast(result.message);
                      await loadAll(true);
                    })
                  }
                />
              )}
              {screen === "memories" && (
                <MemoriesScreen
                  events={data.mergedEvents}
                  memories={data.memories}
                  onSave={(payload) =>
                    mutate(async () => {
                      const memory = await api.saveMemory(coupleId, payload);
                      updateData((current) => ({
                        ...current,
                        memories: upsertMemory(current.memories, memory)
                      }));
                      showToast("Memory saved");
                    })
                  }
                />
              )}
              {screen === "settings" && (
                <SettingsScreen
                  data={data}
                  onSave={(payload) =>
                    mutate(async () => {
                      const result = await api.saveSettings(coupleId, payload);
                      updateData((current) => ({ ...current, settings: result.settings }));
                      showToast("Settings saved");
                      await loadAll(true);
                    })
                  }
                  onConnect={connectGoogle}
                  onDisconnect={(role) =>
                    mutate(async () => {
                      await api.disconnectCalendar(coupleId, role);
                      updateData((current) => {
                        const googleStatus = { ...current.googleStatus };
                        if (role === "a") {
                          googleStatus.aConnected = false;
                          googleStatus.a = { ...googleStatus.a, calendarId: "", calendarName: "" };
                        } else {
                          googleStatus.bConnected = false;
                          googleStatus.b = { ...googleStatus.b, calendarId: "", calendarName: "" };
                        }
                        return { ...current, googleStatus };
                      });
                    })
                  }
                  onRefresh={() =>
                    mutate(async () => {
                      showToast("Refreshing Google Calendar...");
                      const result = await api.refreshCalendar(coupleId);
                      if (result.message) showToast(result.message);
                      await loadAll(true);
                    })
                  }
                />
              )}
            </>
          )}
        </main>

        <button
          className="fab"
          hidden={screen === "home" || screen === "memories" || screen === "settings"}
          onClick={() => setModal(screen === "wishlist" ? "wishlist" : screen === "goals" ? "goal" : "event")}
          type="button"
        >
          <Icons.Plus size={20} />
          <span>{screen === "wishlist" ? "Add wishlist" : screen === "goals" ? "Add goal" : "Add event"}</span>
        </button>

        <nav className="bottom-nav" aria-label="Bottom navigation">
          {navItems.map(({ screen: itemScreen, label, Icon }) => (
            <button
              className={itemScreen === screen ? "bottom-nav-btn active" : "bottom-nav-btn"}
              key={itemScreen}
              onClick={() => setScreen(itemScreen)}
              type="button"
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {data && modal === "wishlist" && (
        <WishlistModal
          partnerAName={partnerAName}
          partnerBName={partnerBName}
          onClose={() => setModal(null)}
          onSubmit={(payload) =>
            mutate(async () => {
              setModal(null);
              const item = await api.addWishlist(coupleId, payload);
              updateData((current) => ({ ...current, wishlist: [item, ...current.wishlist] }));
              setModal(null);
              showToast("Wishlist item added");
            })
          }
        />
      )}
      {data && modal === "goal" && (
        <GoalModal
          partnerAName={partnerAName}
          partnerBName={partnerBName}
          onClose={() => setModal(null)}
          onSubmit={(payload) =>
            mutate(async () => {
              setModal(null);
              const item = await api.addGoal(coupleId, payload);
              updateData((current) => ({ ...current, bucket: [item, ...current.bucket] }));
              setModal(null);
              showToast("Future goal added");
            })
          }
        />
      )}
      {data && modal === "event" && (
        <EventModal
          onClose={() => setModal(null)}
          onSubmit={(payload) =>
            mutate(async () => {
              setModal(null);
              const item = await api.addEvent(coupleId, payload);
              updateData((current) => ({
                ...current,
                customEvents: [item, ...current.customEvents],
                mergedEvents: [...current.mergedEvents, toMergedEvent(item, current)].sort(
                  (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
                )
              }));
              setModal(null);
              setScreen("calendar");
              showToast("Shared event added");
            })
          }
        />
      )}

      {busy && (
        <div className="loading-mask">
          <div className="loading-pill">{busy}</div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Brand({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="brand">
      <div className="brand-mark" aria-hidden="true" />
      <div className="title-wrap">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function HomeScreen({
  data,
  upcoming,
  avgProgress,
  onGo
}: {
  data: BootstrapPayload;
  upcoming: MergedEvent[];
  avgProgress: number;
  onGo: (screen: Screen) => void;
}) {
  return (
    <section className="screen screen-home">
      <ScreenHeader title="Main page" description="A quick doorway into the shared workspace." />
      <section className="overview-grid">
        <OverviewTile label="Wishlist" value={data.wishlist.length} detail="Ideas, places, gifts" tone="accent-peach" onClick={() => onGo("wishlist")} />
        <OverviewTile label="Future goals" value={data.bucket.length} detail={`${avgProgress}% average progress`} tone="accent-mint" onClick={() => onGo("goals")} />
        <OverviewTile label="Upcoming events" value={upcoming.length} detail={upcoming[0]?.title || "No upcoming event"} tone="accent-coral" onClick={() => onGo("calendar")} />
        <OverviewTile label="Past memories" value={data.memories.length} detail="Photos and thoughts" tone="accent-lilac" onClick={() => onGo("memories")} />
      </section>
      <section className="panel panel-coral">
        <PanelTitle title="Next up" action="Open calendar" onAction={() => onGo("calendar")} />
        <EventList events={upcoming.slice(0, 4)} compact />
      </section>
    </section>
  );
}

function OverviewTile({
  label,
  value,
  detail,
  tone,
  onClick
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button className={`overview-tile ${tone}`} onClick={onClick} type="button">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </button>
  );
}

function WishlistScreen({
  items,
  filter,
  sort,
  onFilter,
  onSort,
  onAdd,
  onSave,
  onDelete
}: {
  items: WishlistItem[];
  filter: string;
  sort: SortMode;
  onFilter: (value: string) => void;
  onSort: (value: SortMode) => void;
  onAdd: () => void;
  onSave: (id: string, payload: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const categories = uniqueOptions(items.map((item) => item.category));
  const visible = sortWishlist(filterCollection(items, filter, (item) => item.category), sort);
  return (
    <section className="screen">
      <ScreenHeader title="Wishlist" description="Shared ideas, easy to add and review." action="Add" onAction={onAdd} />
      <ListControls
        filter={filter}
        sort={sort}
        filterOptions={categories}
        sortOptions={[
          { value: "newest", label: "Newest" },
          { value: "oldest", label: "Oldest" },
          { value: "priority", label: "Priority" }
        ]}
        onFilter={onFilter}
        onSort={onSort}
      />
      <div className="responsive-list">
        {visible.length ? visible.map((item) => <WishlistCard key={item.id} item={item} onSave={onSave} onDelete={onDelete} />) : <Empty text="No wishlist items match this view." />}
      </div>
    </section>
  );
}

function GoalsScreen({
  items,
  filter,
  sort,
  onFilter,
  onSort,
  onAdd,
  onSave,
  onDelete
}: {
  items: GoalItem[];
  filter: string;
  sort: SortMode;
  onFilter: (value: string) => void;
  onSort: (value: SortMode) => void;
  onAdd: () => void;
  onSave: (id: string, payload: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const types = uniqueOptions(items.map((item) => item.type));
  const visible = sortGoals(filterCollection(items, filter, (item) => item.type), sort);
  return (
    <section className="screen">
      <ScreenHeader title="Future goals" description="Longer-term plans with progress tracking." action="Add" onAction={onAdd} />
      <ListControls
        filter={filter}
        sort={sort}
        filterOptions={types}
        sortOptions={[
          { value: "newest", label: "Newest" },
          { value: "oldest", label: "Oldest" },
          { value: "progress", label: "Progress" }
        ]}
        onFilter={onFilter}
        onSort={onSort}
      />
      <div className="responsive-list">
        {visible.length ? visible.map((item) => <GoalCard key={item.id} item={item} onSave={onSave} onDelete={onDelete} />) : <Empty text="No future goals match this view." />}
      </div>
    </section>
  );
}

function CalendarScreen({
  events,
  view,
  onView,
  onAdd,
  onDelete,
  onRefresh
}: {
  events: MergedEvent[];
  view: CalendarView;
  onView: (view: CalendarView) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const upcoming = getUpcoming(events);
  return (
    <section className="screen">
      <ScreenHeader title="Calendar" description="Provider and app events merged together." action="Add" onAction={onAdd} />
      <section className="calendar-shell">
        <div className="calendar-actions">
          <div className="segmented">
            {(["month", "week", "agenda"] as CalendarView[]).map((item) => (
              <button className={view === item ? "active" : ""} key={item} onClick={() => onView(item)} type="button">
                {item === "month" ? "Month" : item === "week" ? "Week" : "Agenda"}
              </button>
            ))}
          </div>
          <div className="meta-row">
            <span className="pill source-a">Partner A</span>
            <span className="pill source-b">Partner B</span>
            <span className="pill source-shared">Shared</span>
          </div>
        </div>
        {view === "month" && <MonthCalendar events={events} />}
        {view === "week" && <WeekCalendar events={events} />}
        {view === "agenda" && <EventList events={upcoming} onDelete={onDelete} />}
      </section>
      <section className="panel calendar-upcoming-panel">
        <PanelTitle title="Upcoming calendar items" action="Refresh my calendar" onAction={onRefresh} />
        <EventList events={upcoming} onDelete={onDelete} />
      </section>
    </section>
  );
}

function MemoriesScreen({
  events,
  memories,
  onSave
}: {
  events: MergedEvent[];
  memories: MemoryEntry[];
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const memoryMap = new Map(memories.map((memory) => [memory.eventKey, memory]));
  const pastEvents = events
    .filter((event) => new Date(event.start).getTime() < Date.now())
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());

  return (
    <section className="screen">
      <ScreenHeader title="往事回顧" description="Add photos and thoughts to past moments, then revisit them together." />
      {pastEvents.length ? (
        <div className="memory-review-list">
          {pastEvents.map((event) => (
            <MemoryComposer
              event={event}
              key={eventKey(event)}
              memory={memoryMap.get(eventKey(event))}
              onSave={onSave}
            />
          ))}
        </div>
      ) : (
        <Empty text="Past events will appear here after their date has passed." />
      )}
    </section>
  );
}

function MemoryComposer({
  event,
  memory,
  onSave
}: {
  event: MergedEvent;
  memory?: MemoryEntry;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const [thoughts, setThoughts] = useState(memory?.thoughts || "");
  const [photoDataUrls, setPhotoDataUrls] = useState<string[]>(memory?.photoDataUrls || []);

  useEffect(() => {
    setThoughts(memory?.thoughts || "");
    setPhotoDataUrls(memory?.photoDataUrls || []);
  }, [memory?.thoughts, memory?.photoDataUrls]);

  async function addPhotos(eventChange: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(eventChange.target.files || []).slice(0, 6 - photoDataUrls.length);
    const dataUrls = await Promise.all(files.map(readFileAsDataUrl));
    setPhotoDataUrls((current) => [...current, ...dataUrls].slice(0, 6));
    eventChange.target.value = "";
  }

  function save() {
    onSave({
      eventKey: eventKey(event),
      eventTitle: event.title,
      eventStart: event.start,
      thoughts,
      photoDataUrls
    });
  }

  return (
    <article className="memory-review-card">
      <div className="memory-review-head">
        <div>
          <span className={`event-kind-badge kind-${event.kind}`}>{event.kind === "anniversary" ? "Milestone" : event.kind === "google" ? "Calendar" : "Shared"}</span>
          <h3>{event.title}</h3>
          <p>{formatSmartDate(event.start)}</p>
        </div>
        {event.mapUrl && <a className="icon-btn" href={event.mapUrl} target="_blank" rel="noreferrer" aria-label="Open map"><Icons.MapPin size={18} /></a>}
      </div>
      {photoDataUrls.length > 0 && (
        <div className="memory-photo-grid">
          {photoDataUrls.map((src, index) => (
            <figure key={`${src.slice(0, 32)}-${index}`}>
              <img src={src} alt={`Memory ${index + 1}`} />
              <button className="danger-icon photo-remove" onClick={() => setPhotoDataUrls((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button" aria-label="Remove photo">
                <Icons.X size={14} />
              </button>
            </figure>
          ))}
        </div>
      )}
      <Textarea label="Thoughts" name="thoughts" value={thoughts} onChange={setThoughts} placeholder="What do you want to remember?" />
      <div className="button-row">
        <label className="secondary-btn file-btn">
          <Icons.Image size={16} />
          Add photos
          <input accept="image/*" multiple onChange={addPhotos} type="file" />
        </label>
        <button className="primary-btn" onClick={save} type="button"><Icons.Save size={16} />Save memory</button>
      </div>
    </article>
  );
}

function SettingsScreen({
  data,
  onSave,
  onConnect,
  onDisconnect,
  onRefresh
}: {
  data: BootstrapPayload;
  onSave: (payload: Record<string, unknown>) => void;
  onConnect: (role: Role) => void;
  onDisconnect: (role: Role) => void;
  onRefresh: () => void;
}) {
  const settings = data.settings;
  const colors = parseColors(settings.colors);
  const config = parseAnniversaryConfig(settings.anniversaryConfig);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      workspaceName: form.get("workspaceName"),
      anniversary: form.get("anniversary"),
      partnerAName: form.get("partnerAName"),
      partnerBName: form.get("partnerBName"),
      colors: JSON.stringify({
        userA: form.get("colorUserA"),
        userB: form.get("colorUserB"),
        shared: form.get("colorShared")
      }),
      anniversaryConfig: JSON.stringify({
        showInApp: form.get("showAnniversaryInApp") === "on",
        syncToGoogle: form.get("syncAnniversaryToGoogle") === "on",
        mode: form.get("anniversaryMode"),
        monthlyCount: 24,
        hundredDaysCount: 10
      })
    });
  }

  return (
    <section className="screen">
      <ScreenHeader title="Settings" description="Workspace details, names, colors, and calendar links." />
      <section className="panel">
        <h3>Workspace</h3>
        <form className="form two-col" onSubmit={submit}>
          <Field label="Workspace name" name="workspaceName" defaultValue={settings.workspaceName} />
          <Field label="Anniversary" name="anniversary" type="date" defaultValue={settings.anniversary} />
          <Field label="Partner A name" name="partnerAName" defaultValue={settings.partnerAName} />
          <Field label="Partner B name" name="partnerBName" defaultValue={settings.partnerBName} />
          <Field label="Partner A color" name="colorUserA" type="color" defaultValue={colors.userA} />
          <Field label="Partner B color" name="colorUserB" type="color" defaultValue={colors.userB} />
          <Field label="Shared event color" name="colorShared" type="color" defaultValue={colors.shared} />
          <div className="field">
            <label htmlFor="anniversaryMode">Anniversary mode</label>
            <select id="anniversaryMode" name="anniversaryMode" defaultValue={config.mode}>
              <option value="monthly">Every month</option>
              <option value="100days">Every 100 days</option>
              <option value="both">Both</option>
              <option value="none">Hide all</option>
            </select>
          </div>
          <label className="check-row">
            <input name="showAnniversaryInApp" type="checkbox" defaultChecked={config.showInApp} />
            Show anniversary milestones in app
          </label>
          <label className="check-row">
            <input name="syncAnniversaryToGoogle" type="checkbox" defaultChecked={config.syncToGoogle} />
            Sync anniversary milestones to provider calendar
          </label>
          <div className="button-row">
            <button className="primary-btn" type="submit">Save settings</button>
            <button className="secondary-btn" onClick={onRefresh} type="button">Manual refresh</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="split">
          <h3>Calendar connection</h3>
          <span className="pill primary">{data.googleStatus.currentRole || "Not linked"}</span>
        </div>
        <p className="muted-copy">Connect Google Calendar for each person. PairNest stores the connection securely in Postgres and merges upcoming Google events with shared app events.</p>
        <div className="form">
          <div className="button-row">
            <button className="secondary-btn" onClick={() => onConnect("a")} type="button">Connect {settings.partnerAName}</button>
            <button className="secondary-btn" onClick={() => onConnect("b")} type="button">Connect {settings.partnerBName}</button>
          </div>
          <div className="button-row">
            <button className="secondary-btn" onClick={() => onDisconnect("a")} type="button">Disconnect A</button>
            <button className="secondary-btn" onClick={() => onDisconnect("b")} type="button">Disconnect B</button>
          </div>
          <button className="primary-btn fit" onClick={onRefresh} type="button">Refresh my calendar link</button>
          <div className="status-pill-row">
            <span className="pill">{settings.partnerAName} {data.googleStatus.aConnected ? `linked: ${data.googleStatus.a.calendarName || "Google Calendar"}` : "not linked"}</span>
            <span className="pill">{settings.partnerBName} {data.googleStatus.bConnected ? `linked: ${data.googleStatus.b.calendarName || "Google Calendar"}` : "not linked"}</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>Workspace status</h3>
        <div className="list">
          <StatusRow label="Couple ID" value={settings.coupleId} />
          <StatusRow label="Current status" value="Ready" />
          <StatusRow label="Current role" value={data.googleStatus.currentRole || "Not linked"} />
        </div>
      </section>
    </section>
  );
}

function WishlistModal(props: {
  partnerAName: string;
  partnerBName: string;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  return (
    <ModalShell title="Add wishlist item" description="Quick capture for restaurants, trips, gifts, and ideas." onClose={props.onClose}>
      <form className="form" onSubmit={(event) => handleForm(event, props.onSubmit, { status: "Saved" })}>
        <Field label="Title" name="title" required placeholder="Kyoto autumn trip" />
        <Select label="Category" name="category" options={["Travel", "Restaurant", "Gift", "Experience", "General"]} />
        <Select label="Priority" name="priority" options={["Low", "Medium", "High"]} defaultValue="Medium" />
        <Select label="Added by" name="addedBy" options={[props.partnerAName, props.partnerBName, "Both"]} />
        <Field label="Link" name="link" type="url" placeholder="https://example.com" />
        <Field label="Google Maps URL" name="mapUrl" type="url" placeholder="https://maps.google.com/..." />
        <Textarea label="Note" name="note" placeholder="Anything worth remembering" />
        <ModalActions onClose={props.onClose} submitLabel="Add item" />
      </form>
    </ModalShell>
  );
}

function GoalModal(props: {
  partnerAName: string;
  partnerBName: string;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  return (
    <ModalShell title="Add future goal" description="Use this for longer-term plans and milestones." onClose={props.onClose}>
      <form className="form" onSubmit={(event) => handleForm(event, props.onSubmit)}>
        <Field label="Goal title" name="title" required placeholder="See cherry blossoms in Japan" />
        <Select label="Type" name="type" options={["Travel", "Learning", "Experience", "Finance", "Home", "General"]} />
        <Field label="Target date" name="targetDate" type="date" />
        <Select label="Status" name="status" options={["Planned", "In progress", "Done", "Paused"]} />
        <Select label="Owner" name="owner" options={["Both", props.partnerAName, props.partnerBName]} />
        <Field label="Progress %" name="progress" type="number" min={0} max={100} defaultValue="0" />
        <Field label="Google Maps URL" name="mapUrl" type="url" placeholder="https://maps.google.com/..." />
        <Textarea label="Note" name="note" placeholder="Budget, milestone, or next step" />
        <ModalActions onClose={props.onClose} submitLabel="Add goal" />
      </form>
    </ModalShell>
  );
}

function EventModal(props: {
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  return (
    <ModalShell title="Add shared event" description="This saves an app event and marks sync status for linked calendars." onClose={props.onClose}>
      <form className="form" onSubmit={(event) => handleForm(event, props.onSubmit)}>
        <Field label="Event title" name="title" required placeholder="Friday dinner hold" />
        <Field label="Start" name="start" type="datetime-local" required />
        <Field label="End" name="end" type="datetime-local" />
        <Select label="Scope" name="source" options={["shared", "a", "b"]} labels={["Shared", "Partner A side", "Partner B side"]} />
        <Field label="Google Maps URL" name="mapUrl" type="url" placeholder="https://maps.google.com/..." />
        <Textarea label="Note" name="note" placeholder="Reservation, location, or reminder" />
        <ModalActions onClose={props.onClose} submitLabel="Add event" />
      </form>
    </ModalShell>
  );
}

function handleForm(
  event: FormEvent<HTMLFormElement>,
  onSubmit: (payload: Record<string, unknown>) => void,
  extra: Record<string, unknown> = {}
) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  onSubmit({ ...Object.fromEntries(form.entries()), ...extra });
}

function ModalShell(props: { title: string; description: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <section className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div>
            <h3>{props.title}</h3>
            <p>{props.description}</p>
          </div>
          <button className="icon-btn" onClick={props.onClose} type="button" aria-label="Close">
            <Icons.X size={18} />
          </button>
        </div>
        {props.children}
      </section>
    </div>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={props.name}>{props.label}</label>
      <input
        id={props.name}
        name={props.name}
        type={props.type || "text"}
        defaultValue={props.value === undefined ? props.defaultValue : undefined}
        value={props.value}
        placeholder={props.placeholder}
        required={props.required}
        min={props.min}
        max={props.max}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
    </div>
  );
}

function Select(props: { label: string; name: string; options: string[]; labels?: string[]; defaultValue?: string }) {
  return (
    <div className="field">
      <label htmlFor={props.name}>{props.label}</label>
      <select id={props.name} name={props.name} defaultValue={props.defaultValue}>
        {props.options.map((option, index) => (
          <option key={option} value={option}>
            {props.labels?.[index] || option}
          </option>
        ))}
      </select>
    </div>
  );
}

function Textarea(props: {
  label: string;
  name: string;
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={props.name}>{props.label}</label>
      <textarea
        id={props.name}
        name={props.name}
        placeholder={props.placeholder}
        defaultValue={props.value === undefined ? props.defaultValue : undefined}
        value={props.value}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
    </div>
  );
}

function ModalActions({ submitLabel, onClose }: { submitLabel: string; onClose: () => void }) {
  return (
    <div className="button-row">
      <button className="primary-btn" type="submit">{submitLabel}</button>
      <button className="secondary-btn" onClick={onClose} type="button">Cancel</button>
    </div>
  );
}

function ScreenHeader(props: { title: string; description: string; action?: string; onAction?: () => void }) {
  return (
    <div className="screen-header">
      <div>
        <h2>{props.title}</h2>
        <p>{props.description}</p>
      </div>
      {props.action && <button className="secondary-btn" onClick={props.onAction} type="button">{props.action}</button>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PanelTitle({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return (
    <div className="split">
      <h3>{title}</h3>
      <button className="ghost-btn" onClick={onAction} type="button">{action}</button>
    </div>
  );
}

function ListControls({
  filter,
  sort,
  filterOptions,
  sortOptions,
  onFilter,
  onSort
}: {
  filter: string;
  sort: SortMode;
  filterOptions: string[];
  sortOptions: { value: SortMode; label: string }[];
  onFilter: (value: string) => void;
  onSort: (value: SortMode) => void;
}) {
  return (
    <section className="list-controls">
      <div className="field compact-field">
        <label htmlFor="filter">Filter</label>
        <select id="filter" value={filter} onChange={(event) => onFilter(event.target.value)}>
          <option value="All">All</option>
          {filterOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>
      <div className="field compact-field">
        <label htmlFor="sort">Sort</label>
        <select id="sort" value={sort} onChange={(event) => onSort(event.target.value as SortMode)}>
          {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    </section>
  );
}

function WishlistCard({
  item,
  onSave,
  onDelete
}: {
  item: WishlistItem;
  onSave: (id: string, payload: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className={`list-card expandable-card ${wishlistAccentClass(item.category)}`}>
      <button className="tile-button" onClick={() => setExpanded((value) => !value)} type="button">
        <div>
          <h3>{item.title}</h3>
          <div className="meta-row">
            <span className={`pill category-pill ${wishlistAccentClass(item.category)}`}>{item.category}</span>
            <span className={`pill status-pill ${priorityClass(item.priority)}`}>{item.priority}</span>
            <span className="pill person-pill">{item.addedBy}</span>
          </div>
        </div>
        <span className="expand-hint">{expanded ? "Close" : "Edit"}</span>
      </button>
      {item.note && <p>{item.note}</p>}
      <div className="link-row">
        {item.link && <a className="inline-link" href={item.link} target="_blank" rel="noreferrer">Open link</a>}
        {item.mapUrl && <a className="inline-link map-link" href={item.mapUrl} target="_blank" rel="noreferrer"><Icons.MapPin size={15} /> Map</a>}
      </div>
      {expanded && (
        <form className="form edit-form" onSubmit={(event) => handleForm(event, (payload) => onSave(item.id, payload), { status: item.status })}>
          <Field label="Title" name="title" required defaultValue={item.title} />
          <Select label="Category" name="category" options={["Travel", "Restaurant", "Gift", "Experience", "General"]} defaultValue={item.category} />
          <Select label="Priority" name="priority" options={["Low", "Medium", "High"]} defaultValue={item.priority} />
          <Field label="Added by" name="addedBy" defaultValue={item.addedBy} />
          <Field label="Link" name="link" type="url" defaultValue={item.link} />
          <Field label="Google Maps URL" name="mapUrl" type="url" defaultValue={item.mapUrl} />
          <Textarea label="Note" name="note" defaultValue={item.note} />
          <div className="button-row">
            <button className="primary-btn" type="submit"><Icons.Save size={16} />Save</button>
            <button className="secondary-btn" onClick={() => onDelete(item.id)} type="button"><Icons.Trash2 size={16} />Delete</button>
          </div>
        </form>
      )}
    </article>
  );
}

function GoalCard({
  item,
  onSave,
  onDelete
}: {
  item: GoalItem;
  onSave: (id: string, payload: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className={`list-card expandable-card ${goalAccentClass(item.type)}`}>
      <button className="tile-button" onClick={() => setExpanded((value) => !value)} type="button">
        <div>
          <h3>{item.title}</h3>
          <div className="meta-row">
            <span className={`pill category-pill ${goalAccentClass(item.type)}`}>{item.type}</span>
            <span className={`pill status-pill ${goalStatusClass(item.status)}`}>{item.status}</span>
            <span className="pill person-pill">{item.owner}</span>
          </div>
        </div>
        <span className="expand-hint">{expanded ? "Close" : "Edit"}</span>
      </button>
      <div className="progress-track"><span style={{ width: `${item.progress}%` }} /></div>
      <div className="split small"><span>{item.targetDate || "No target date"}</span><strong>{item.progress}%</strong></div>
      {item.note && <p>{item.note}</p>}
      {item.mapUrl && <a className="inline-link map-link" href={item.mapUrl} target="_blank" rel="noreferrer"><Icons.MapPin size={15} /> Map</a>}
      {expanded && (
        <form className="form edit-form" onSubmit={(event) => handleForm(event, (payload) => onSave(item.id, payload))}>
          <Field label="Goal title" name="title" required defaultValue={item.title} />
          <Select label="Type" name="type" options={["Travel", "Learning", "Experience", "Finance", "Home", "General"]} defaultValue={item.type} />
          <Field label="Target date" name="targetDate" type="date" defaultValue={item.targetDate} />
          <Select label="Status" name="status" options={["Planned", "In progress", "Done", "Paused"]} defaultValue={item.status} />
          <Field label="Owner" name="owner" defaultValue={item.owner} />
          <Field label="Progress %" name="progress" type="number" min={0} max={100} defaultValue={String(item.progress)} />
          <Field label="Google Maps URL" name="mapUrl" type="url" defaultValue={item.mapUrl} />
          <Textarea label="Note" name="note" defaultValue={item.note} />
          <div className="button-row">
            <button className="primary-btn" type="submit"><Icons.Save size={16} />Save</button>
            <button className="secondary-btn" onClick={() => onDelete(item.id)} type="button"><Icons.Trash2 size={16} />Delete</button>
          </div>
        </form>
      )}
    </article>
  );
}

function MonthCalendar({ events }: { events: MergedEvent[] }) {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  return (
    <div className="month-grid">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span className="weekday" key={day}>{day}</span>)}
      {days.map((day) => {
        const dayEvents = events.filter((event) => sameDate(event.start, day)).slice(0, 3);
        return (
          <div className={day.getMonth() === today.getMonth() ? "day-cell" : "day-cell muted"} key={day.toISOString()}>
            <strong>{day.getDate()}</strong>
            {dayEvents.map((event) => <span className={`event-dot source-${event.source}`} key={event.id}>{event.title}</span>)}
          </div>
        );
      })}
    </div>
  );
}

function WeekCalendar({ events }: { events: MergedEvent[] }) {
  return (
    <div className="week-list">
      {Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() + index);
        const dayEvents = events.filter((event) => sameDate(event.start, date));
        return (
          <div className="week-row" key={date.toISOString()}>
            <div className="week-date"><strong>{date.toLocaleDateString([], { weekday: "short" })}</strong><span>{date.getDate()}</span></div>
            <div className="list compact">
              {dayEvents.length ? dayEvents.map((event) => <EventRow event={event} key={event.id} />) : <span className="muted-copy">No events</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventList({ events, compact, onDelete }: { events: MergedEvent[]; compact?: boolean; onDelete?: (id: string) => void }) {
  if (!events.length) return <Empty text="No upcoming calendar items yet." />;
  return (
    <div className={compact ? "list compact" : "list"}>
      {events.map((event) => <EventRow event={event} key={event.id} onDelete={onDelete} />)}
    </div>
  );
}

function EventRow({ event, onDelete }: { event: MergedEvent; onDelete?: (id: string) => void }) {
  return (
    <article className="event-row">
      <span className={`source-line source-${event.source}`} />
      <div>
        <h4>{event.title}</h4>
        <p>{formatSmartDate(event.start)} {event.note ? `- ${event.note}` : ""}</p>
      </div>
      <span className={`event-kind-badge kind-${event.kind}`}>{event.kind === "app" ? "Shared" : event.kind === "anniversary" ? "Milestone" : "Calendar"}</span>
      {event.mapUrl && <a className="icon-btn" href={event.mapUrl} target="_blank" rel="noreferrer" aria-label="Open map"><Icons.MapPin size={16} /></a>}
      {onDelete && event.kind === "app" && <DeleteButton onClick={() => onDelete(event.id)} />}
    </article>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="danger-icon" onClick={onClick} type="button" aria-label="Delete">
      <Icons.Trash2 size={17} />
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function toMergedEvent(item: CustomEventItem, data: BootstrapPayload): MergedEvent {
  const colors = parseColors(data.settings.colors);
  const source = item.source as Source;
  return {
    id: item.id,
    title: item.title,
    start: item.start,
    end: item.end,
    allDay: item.start.length <= 10,
    source,
    sourceLabel:
      source === "a" ? data.settings.partnerAName : source === "b" ? data.settings.partnerBName : "Shared",
    color: source === "a" ? colors.userA : source === "b" ? colors.userB : colors.shared,
    note: item.note,
    mapUrl: item.mapUrl,
    kind: "app",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function getUpcoming(events: MergedEvent[]) {
  const now = new Date();
  return events
    .filter((event) => new Date(event.start).getTime() >= now.getTime() - 86400000)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

function filterCollection<T>(items: T[], filter: string, getter: (item: T) => string) {
  if (filter === "All") return items;
  return items.filter((item) => getter(item) === filter);
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function sortWishlist(items: WishlistItem[], sort: SortMode) {
  const priorities: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
  return [...items].sort((a, b) => {
    if (sort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sort === "priority") return (priorities[b.priority] || 0) - (priorities[a.priority] || 0);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function sortGoals(items: GoalItem[], sort: SortMode) {
  return [...items].sort((a, b) => {
    if (sort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sort === "progress") return b.progress - a.progress;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function upsertMemory(items: MemoryEntry[], item: MemoryEntry) {
  const exists = items.some((entry) => entry.eventKey === item.eventKey);
  if (!exists) return [item, ...items];
  return items.map((entry) => (entry.eventKey === item.eventKey ? item : entry));
}

function eventKey(event: MergedEvent) {
  return `${event.kind}:${event.id}:${event.start}`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getMemoryMoments(events: MergedEvent[]) {
  return [...events]
    .filter((event) => event.kind === "anniversary" || event.kind === "app")
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 4);
}

function wishlistAccentClass(category: string) {
  const value = category.toLowerCase();
  if (value.includes("travel")) return "accent-coral";
  if (value.includes("restaurant") || value.includes("gift")) return "accent-peach";
  if (value.includes("experience")) return "accent-mint";
  return "accent-cream";
}

function goalAccentClass(type: string) {
  const value = type.toLowerCase();
  if (value.includes("travel")) return "accent-coral";
  if (value.includes("finance") || value.includes("home")) return "accent-forest";
  if (value.includes("learning")) return "accent-lilac";
  return "accent-cream";
}

function priorityClass(priority: string) {
  const value = priority.toLowerCase();
  if (value === "high") return "status-coral";
  if (value === "medium") return "status-gold";
  return "status-mint";
}

function goalStatusClass(status: string) {
  const value = status.toLowerCase();
  if (value.includes("done")) return "status-mint";
  if (value.includes("progress")) return "status-coral";
  if (value.includes("pause")) return "status-soft";
  return "status-lilac";
}

function getAnniversaryText(data: BootstrapPayload) {
  if (!data.settings.anniversary) return "No anniversary set";
  const next = data.mergedEvents.find((event) => event.kind === "anniversary" && new Date(event.start) >= new Date());
  if (!next) return "Anniversary saved";
  const days = Math.max(0, Math.round((new Date(next.start).getTime() - Date.now()) / 86400000));
  return `${next.title} in ${days} days`;
}

function sameDate(value: string, date: Date) {
  const next = new Date(value);
  return next.getFullYear() === date.getFullYear() && next.getMonth() === date.getMonth() && next.getDate() === date.getDate();
}

function formatSmartDate(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: value.includes("T") ? "numeric" : undefined,
    minute: value.includes("T") ? "2-digit" : undefined
  });
}

function subtitle(screen: Screen) {
  return {
    home: "Overview and status",
    wishlist: "Shared wishlist",
    goals: "Future plans",
    calendar: "Merged calendar",
    memories: "Past memories",
    settings: "Workspace and calendar settings"
  }[screen];
}
