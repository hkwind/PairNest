"use client";

import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client-api";
import { parseAnniversaryConfig, parseColors } from "@/lib/defaults";
import type {
  BootstrapPayload,
  GoalItem,
  MergedEvent,
  Role,
  WishlistItem
} from "@/types/pairnest";
import { Icons } from "@/components/icons";

type Screen = "home" | "wishlist" | "goals" | "calendar" | "settings";
type Modal = "wishlist" | "goal" | "event" | null;
type CalendarView = "month" | "week" | "agenda";

const navItems: { screen: Screen; label: string; Icon: typeof Icons.Home }[] = [
  { screen: "home", label: "Main", Icon: Icons.Home },
  { screen: "wishlist", label: "Wishlist", Icon: Icons.Gift },
  { screen: "goals", label: "Goals", Icon: Icons.ListTodo },
  { screen: "calendar", label: "Calendar", Icon: Icons.CalendarDays },
  { screen: "settings", label: "Settings", Icon: Icons.Settings }
];

export function PairNestApp({ initialCoupleId }: { initialCoupleId: string }) {
  const [coupleId] = useState(initialCoupleId);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [modal, setModal] = useState<Modal>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [busy, setBusy] = useState("Loading workspace...");
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");

  const loadAll = useCallback(async () => {
    setBusy("Loading workspace...");
    try {
      setLoadError("");
      setData(await api.bootstrap(coupleId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Load failed";
      setLoadError(message);
      showToast(message);
    } finally {
      setBusy("");
    }
  }, [coupleId]);

  useEffect(() => {
    void loadAll();
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

  async function mutate(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    try {
      await action();
      await loadAll();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }

  const cssVars = {
    "--source-a": colors.userA,
    "--source-b": colors.userB,
    "--source-shared": colors.shared,
    "--primary": colors.userA,
    "--accent": colors.userB
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
          <button className="icon-btn" onClick={loadAll} type="button" aria-label="Refresh">
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
              <button className="primary-btn" onClick={loadAll} type="button">
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
                  onAdd={() => setModal("wishlist")}
                  onDelete={(id) =>
                    mutate("Deleting wishlist item...", () => api.removeWishlist(coupleId, id))
                  }
                />
              )}
              {screen === "goals" && (
                <GoalsScreen
                  items={data.bucket}
                  onAdd={() => setModal("goal")}
                  onDelete={(id) => mutate("Deleting future goal...", () => api.removeGoal(coupleId, id))}
                />
              )}
              {screen === "calendar" && (
                <CalendarScreen
                  events={data.mergedEvents}
                  view={calendarView}
                  onView={setCalendarView}
                  onAdd={() => setModal("event")}
                  onDelete={(id) => mutate("Deleting event...", () => api.removeEvent(coupleId, id))}
                  onRefresh={() =>
                    mutate("Refreshing calendar...", async () => {
                      const result = await api.refreshCalendar(coupleId);
                      if (result.message) showToast(result.message);
                    })
                  }
                />
              )}
              {screen === "settings" && (
                <SettingsScreen
                  data={data}
                  onSave={(payload) => mutate("Saving settings...", () => api.saveSettings(coupleId, payload))}
                  onConnect={(role, calendarId) =>
                    mutate("Linking calendar...", () => api.connectCalendar(coupleId, role, calendarId))
                  }
                  onDisconnect={(role) =>
                    mutate("Disconnecting calendar...", () => api.disconnectCalendar(coupleId, role))
                  }
                  onRefresh={() => mutate("Refreshing calendar...", () => api.refreshCalendar(coupleId))}
                />
              )}
            </>
          )}
        </main>

        <button
          className="fab"
          hidden={screen === "home" || screen === "settings"}
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
            mutate("Adding wishlist item...", async () => {
              await api.addWishlist(coupleId, payload);
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
            mutate("Adding future goal...", async () => {
              await api.addGoal(coupleId, payload);
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
            mutate("Adding event...", async () => {
              await api.addEvent(coupleId, payload);
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
      <ScreenHeader title="Main page" description="Overview of status and upcoming events." />
      <article className="hero-card">
        <div className="meta-row">
          <span className="pill primary">Shared status</span>
          <span className="pill source-shared">{getAnniversaryText(data)}</span>
        </div>
        <h2>Everything important, in one place.</h2>
        <p>Wishlist, future goals, and merged calendars for both people.</p>
      </article>
      <div className="stats-grid">
        <MiniStat label="Wishlist" value={data.wishlist.length} />
        <MiniStat label="Future goals" value={data.bucket.length} />
        <MiniStat label="Upcoming events" value={upcoming.length} />
        <MiniStat label="Avg goal progress" value={`${avgProgress}%`} />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <PanelTitle title="Upcoming events" action="Open calendar" onAction={() => onGo("calendar")} />
          <EventList events={upcoming.slice(0, 5)} compact />
        </section>
        <section className="panel">
          <PanelTitle title="Status overview" action="Open settings" onAction={() => onGo("settings")} />
          <div className="list">
            <StatusRow label={`${data.settings.partnerAName} calendar`} value={data.googleStatus.aConnected ? "Linked" : "Not linked"} />
            <StatusRow label={`${data.settings.partnerBName} calendar`} value={data.googleStatus.bConnected ? "Linked" : "Not linked"} />
            <StatusRow label="Workspace" value={data.settings.workspaceName} />
          </div>
        </section>
      </div>
    </section>
  );
}

function WishlistScreen({
  items,
  onAdd,
  onDelete
}: {
  items: WishlistItem[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="screen">
      <ScreenHeader title="Wishlist" description="Shared ideas, easy to add and review." action="Add" onAction={onAdd} />
      <div className="responsive-list">
        {items.length ? items.map((item) => <WishlistCard key={item.id} item={item} onDelete={onDelete} />) : <Empty text="No wishlist items yet." />}
      </div>
    </section>
  );
}

function GoalsScreen({
  items,
  onAdd,
  onDelete
}: {
  items: GoalItem[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="screen">
      <ScreenHeader title="Future goals" description="Longer-term plans with progress tracking." action="Add" onAction={onAdd} />
      <div className="responsive-list">
        {items.length ? items.map((item) => <GoalCard key={item.id} item={item} onDelete={onDelete} />) : <Empty text="No future goals yet." />}
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

function SettingsScreen({
  data,
  onSave,
  onConnect,
  onDisconnect,
  onRefresh
}: {
  data: BootstrapPayload;
  onSave: (payload: Record<string, unknown>) => void;
  onConnect: (role: Role, calendarId: string) => void;
  onDisconnect: (role: Role) => void;
  onRefresh: () => void;
}) {
  const settings = data.settings;
  const colors = parseColors(settings.colors);
  const config = parseAnniversaryConfig(settings.anniversaryConfig);
  const [calendarId, setCalendarId] = useState("primary");

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
        <p className="muted-copy">Each person can record their calendar connection. OAuth sync belongs in the provider integration layer, while PairNest keeps the app calendar and cache in Postgres.</p>
        <div className="form">
          <Field label="Calendar ID" name="calendarId" value={calendarId} onChange={setCalendarId} />
          <div className="button-row">
            <button className="secondary-btn" onClick={() => onConnect("a", calendarId)} type="button">Link as {settings.partnerAName}</button>
            <button className="secondary-btn" onClick={() => onConnect("b", calendarId)} type="button">Link as {settings.partnerBName}</button>
          </div>
          <div className="button-row">
            <button className="secondary-btn" onClick={() => onDisconnect("a")} type="button">Disconnect A</button>
            <button className="secondary-btn" onClick={() => onDisconnect("b")} type="button">Disconnect B</button>
          </div>
          <button className="primary-btn fit" onClick={onRefresh} type="button">Refresh my calendar link</button>
          <div className="status-pill-row">
            <span className="pill">{settings.partnerAName} {data.googleStatus.aConnected ? "linked" : "not linked"}</span>
            <span className="pill">{settings.partnerBName} {data.googleStatus.bConnected ? "linked" : "not linked"}</span>
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

function Textarea(props: { label: string; name: string; placeholder?: string }) {
  return (
    <div className="field">
      <label htmlFor={props.name}>{props.label}</label>
      <textarea id={props.name} name={props.name} placeholder={props.placeholder} />
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

function WishlistCard({ item, onDelete }: { item: WishlistItem; onDelete: (id: string) => void }) {
  return (
    <article className="list-card">
      <div className="item-top">
        <div>
          <h3>{item.title}</h3>
          <div className="meta-row">
            <span className="pill">{item.category}</span>
            <span className="pill">{item.priority}</span>
            <span className="pill primary">{item.addedBy}</span>
          </div>
        </div>
        <DeleteButton onClick={() => onDelete(item.id)} />
      </div>
      {item.note && <p>{item.note}</p>}
      {item.link && <a className="inline-link" href={item.link} target="_blank" rel="noreferrer">Open link</a>}
    </article>
  );
}

function GoalCard({ item, onDelete }: { item: GoalItem; onDelete: (id: string) => void }) {
  return (
    <article className="list-card">
      <div className="item-top">
        <div>
          <h3>{item.title}</h3>
          <div className="meta-row">
            <span className="pill">{item.type}</span>
            <span className="pill primary">{item.status}</span>
            <span className="pill">{item.owner}</span>
          </div>
        </div>
        <DeleteButton onClick={() => onDelete(item.id)} />
      </div>
      <div className="progress-track"><span style={{ width: `${item.progress}%` }} /></div>
      <div className="split small"><span>{item.targetDate || "No target date"}</span><strong>{item.progress}%</strong></div>
      {item.note && <p>{item.note}</p>}
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

function getUpcoming(events: MergedEvent[]) {
  const now = new Date();
  return events
    .filter((event) => new Date(event.start).getTime() >= now.getTime() - 86400000)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
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
    settings: "Workspace and calendar settings"
  }[screen];
}
