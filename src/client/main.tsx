import {
  listColors,
  normalizeListColor,
  listColorStyle,
} from "../shared/listColors";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import {
  CaretRightIcon,
  CaretDownIcon,
  TrayIcon,
  SunIcon,
  CalendarDotsIcon,
  StackIcon,
  StarIcon,
  CheckCircleIcon,
  TrashIcon,
  PlusIcon,
  ArrowUpIcon,
  MagnifyingGlassIcon,
  ListIcon,
  XIcon,
  UsersIcon,
  ArrowClockwiseIcon,
  SignOutIcon,
  GearSixIcon,
  CheckIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import {
  TITLE_MAX,
  taskPatch,
  listName,
  LIST_NAME_MAX,
  today,
  todaySection,
  type Task,
  type List as TaskList,
} from "../shared/model";
import * as store from "./store";
import {
  formatDue,
  formatCalendarDate,
  taskCount,
} from "../shared/presentation";
import { Subtasks, subtaskProgress } from "./Subtasks";
import { TaskActions } from "./TaskActions";
import { UndoToast } from "./UndoToast";
import "./style.css";
const views = [
  ["Eingang", TrayIcon],
  ["Heute", SunIcon],
  ["Geplant", CalendarDotsIcon],
  ["Alle", StackIcon],
  ["Markiert", StarIcon],
  ["Erledigt", CheckCircleIcon],
  ["Papierkorb", TrashIcon],
] as const;
function Modal({
  title,
  onClose,
  children,
  panel = false,
}: {
  panel?: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      className={panel ? "detail-panel" : undefined}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <header>
        <h2 id="dialog-title">{title}</h2>
        <button onClick={onClose} aria-label="Schließen">
          <XIcon />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Login({ onClose }: { onClose?: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await store.login(
        String(form.get("username")),
        String(form.get("password")),
      );
      onClose?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <div className="brand">
        <span className="logo">n.</span>Notera
      </div>
      <h1>Platz für deine Gedanken.</h1>
      <p>Melde dich an, um deine Aufgaben zu öffnen.</p>
      <form onSubmit={submit}>
        <label>
          Benutzername
          <input name="username" autoComplete="username" required autoFocus />
        </label>
        <label>
          Passwort
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Anmelden …" : "Anmelden"}
        </button>
      </form>
      <small>
        Konten werden auf deinem Server eingerichtet.
        <br />
        Keine öffentliche Registrierung.
      </small>
    </div>
  );
}
function App() {
  const [, render] = useState(0);
  useEffect(() => store.subscribe(() => render((v) => v + 1)), []);
  useEffect(() => {
    void store.init();
    if ("serviceWorker" in navigator && import.meta.env.PROD)
      void navigator.serviceWorker.register("/sw.js");
  }, []);
  const state = store.getState();
  const data = store.projected();
  const user = state.user;
  const [view, setView] = useState("Eingang");
  const [nav, setNav] = useState(false);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<Task | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(
    () => new Set(),
  );
  const [addRequests, setAddRequests] = useState<Record<string, number>>({});
  function toggleSubtasks(id: string) {
    setExpandedTasks((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const [showDone, setShowDone] = useState(false);
  const [modal, setModal] = useState<
    "list" | "settings" | "conflicts" | "login" | null
  >(null);
  const [manage, setManage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [undo, setUndo] = useState<{
    id: string;
    done: boolean;
    completionKey?: string;
  } | null>(null);
  const [complete, setComplete] = useState<Task | null>(null);
  const dismissUndo = useCallback(() => setUndo(null), []);
  const [theme, setTheme] = useState(
    localStorage.getItem("notera-theme") || "dark",
  );
  const currentSelection = data.tasks.find((t) => t.id === selected);
  const chosen = currentSelection || selectedSnapshot;
  useEffect(() => {
    if (currentSelection) setSelectedSnapshot(currentSelection);
  }, [currentSelection?.id, currentSelection?.version]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("notera-theme", theme);
  }, [theme]);
  async function act(fn: () => Promise<unknown>) {
    try {
      setError("");
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!user) return <Login />;
  const date = today(user.timezone);
  const inbox = data.lists.find((l) => l.inbox && l.ownerId === user.id);
  const list = data.lists.find((l) => l.id === view);
  const target = list || inbox;
  const heading = list?.name || view;
  const managed =
    data.lists.find((l) => l.id === manage) ||
    (() => {
      const rejected = store
        .getState()
        .queue.find(
          (q) =>
            q.entity === "list" &&
            q.id === manage &&
            q.version === 0 &&
            q.error,
        );
      if (!rejected) return undefined;
      return {
        id: rejected.id,
        name:
          typeof rejected.patch.name === "string" ? rejected.patch.name : "",
        color: normalizeListColor(rejected.patch.color),
        ownerId: user.id,
        inbox: false,
        version: 0,
        members: Array.isArray(rejected.patch.members)
          ? rejected.patch.members.filter(
              (id): id is string => typeof id === "string",
            )
          : [user.id],
      } as TaskList;
    })();
  const syncStatus = store.status();
  const tasks = data.tasks
    .filter((t) => {
      if (view === "Papierkorb") return t.deleted;
      if (t.deleted) return false;
      if (view === "Erledigt") return t.done;
      if (!showDone && t.done) return false;
      if (query) return true;
      if (list) return t.listId === list.id;
      if (view === "Eingang") return t.listId === inbox?.id;
      if (view === "Heute")
        return !!todaySection(t, data.preferences[t.id], date, user.timezone);
      if (view === "Geplant") return !!t.due;
      if (view === "Markiert") return data.preferences[t.id]?.starred;
      return true;
    })
    .filter(
      (t) =>
        !query ||
        `${t.title} ${t.notes} ${t.links.join(" ")}`
          .toLocaleLowerCase("de")
          .includes(query.toLocaleLowerCase("de")),
    )
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const sections =
    view === "Heute" && !query
      ? ["Überfällig", "Heute", "Nicht geschafft"]
      : [""];
  async function add(e: FormEvent) {
    e.preventDefault();
    const parsed = taskPatch.safeParse({ title });
    if (!parsed.success) {
      setError("Bitte einen Titel mit 1–240 Zeichen eingeben.");
      return;
    }
    if (!target) return;
    await act(async () => {
      const id = crypto.randomUUID();
      await store.enqueue("task", id, {
        title: parsed.data.title,
        listId: target.id,
      });
      if (view === "Heute")
        await store.enqueue("preference", id, { today: date });
      setTitle("");
      input.current?.focus();
    });
  }
  function navigate(v: string) {
    setView(v);
    setNav(false);
    setSelected(null);
    setSelectedSnapshot(null);
    setQuery("");
    setShowDone(false);
  }
  return (
    <div className="shell">
      <aside className={"sidebar " + (nav ? "visible" : "")}>
        <div className="brand">
          <span className="logo">n.</span>Notera
          <button
            className="mobile close-nav"
            onClick={() => setNav(false)}
            aria-label="Navigation schließen"
          >
            <XIcon />
          </button>
        </div>
        <div className="account">
          <span>{user.name}</span>
          <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
        </div>
        <nav aria-label="Ansichten">
          {views.map(([name, Icon]) => (
            <button
              key={name}
              className={"nav-item " + (view === name ? "active" : "")}
              onClick={() => navigate(name)}
            >
              <Icon />
              {name}
              {name === "Eingang" && (
                <small>
                  {
                    data.tasks.filter(
                      (t) => t.listId === inbox?.id && !t.done && !t.deleted,
                    ).length
                  }
                </small>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label">
          MEINE LISTEN
          <button onClick={() => setModal("list")} aria-label="Liste anlegen">
            <PlusIcon />
          </button>
        </div>
        <nav aria-label="Listen">
          {data.lists
            .filter((l) => !l.inbox)
            .map((l) => (
              <button
                key={l.id}
                className={"nav-item " + (view === l.id ? "active" : "")}
                onClick={() => navigate(l.id)}
              >
                <span
                  className="dot list-color"
                  style={
                    listColorStyle(
                      l.color,
                      l.members.length > 1,
                    ) as React.CSSProperties
                  }
                  aria-hidden="true"
                />
                <span className="list-name">{l.name}</span>
                {l.members.length > 1 && (
                  <UsersIcon aria-label="Geteilte Liste" />
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setModal("settings")}>
            <GearSixIcon />
            Einstellungen
          </button>
        </div>
      </aside>
      <main inert={nav}>
        <header className="topbar">
          <button
            className="mobile"
            onClick={() => setNav(true)}
            aria-label="Listen öffnen"
          >
            <ListIcon />
          </button>
          <button
            className={"sync " + (syncStatus === "Konflikt" ? "error" : "")}
            onClick={() =>
              syncStatus === "Anmeldung erforderlich"
                ? setModal("login")
                : state.queue.some((q) => q.error)
                  ? setModal("conflicts")
                  : void store.sync()
            }
          >
            <span
              className={
                "status-dot " + (syncStatus === "Synchronisiert" ? "green" : "")
              }
            />
            {syncStatus}
          </button>
          <div className="search">
            <MagnifyingGlassIcon />
            <input
              aria-label="Aufgaben suchen"
              placeholder="Suchen"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Suche leeren">
                <XIcon />
              </button>
            )}
          </div>
        </header>
        <div className="main-content">
          <div className="heading">
            <div>
              <h1>
                {!query && list && !list.inbox && (
                  <span
                    aria-hidden="true"
                    className="heading-color list-color"
                    style={
                      listColorStyle(
                        list.color,
                        list.members.length > 1,
                      ) as React.CSSProperties
                    }
                  />
                )}
                {query ? "Suche" : heading}
              </h1>
              <p>
                {query
                  ? `Ergebnisse für „${query}“`
                  : view === "Eingang"
                    ? "Erst festhalten. Später einordnen."
                    : view === "Heute"
                      ? new Intl.DateTimeFormat("de-DE", {
                          dateStyle: "full",
                          timeZone: user.timezone,
                        }).format(new Date())
                      : list && list.members.length > 1
                        ? "Gemeinsam mit " +
                          list.members
                            .filter((id) => id !== user.id)
                            .map(
                              (id) => data.users.find((u) => u.id === id)?.name,
                            )
                            .join(", ")
                        : view === "Papierkorb"
                          ? "Gelöschte Aufgaben wiederherstellen."
                          : "Ideen und Aufgaben an einem Ort."}
              </p>
            </div>
            {list && list.ownerId === user.id && (
              <button
                aria-label="Liste verwalten"
                onClick={() => setManage(list.id)}
              >
                <GearSixIcon />
              </button>
            )}
          </div>
          {view !== "Papierkorb" && view !== "Erledigt" && (
            <>
              <form className="compose" onSubmit={add}>
                <PlusIcon />
                <input
                  ref={input}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={TITLE_MAX}
                  aria-label="Neue Aufgabe"
                  placeholder="Was möchtest du festhalten?"
                  autoComplete="off"
                />
                <button
                  className="primary"
                  aria-label="Aufgabe hinzufügen"
                  disabled={!target}
                >
                  <ArrowUpIcon />
                </button>
              </form>
              {!list && view !== "Eingang" && (
                <small className="target">
                  Ziel: persönlicher Eingang
                  {view === "Heute" ? " · für heute auswählen" : ""}
                </small>
              )}
            </>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button
                aria-label="Fehler schließen"
                onClick={() => setError("")}
              >
                <XIcon />
              </button>
            </div>
          )}
          {state.queue.some((q) => q.error) && (
            <button className="notice" onClick={() => setModal("conflicts")}>
              <WarningCircleIcon />
              Änderungen prüfen · {
                state.queue.filter((q) => q.error).length
              }{" "}
              offen
            </button>
          )}
          <div className="section-title">
            <span>{taskCount(tasks.length, view)}</span>
            {!["Erledigt", "Papierkorb"].includes(view) && (
              <label className="inline">
                <input
                  type="checkbox"
                  checked={showDone}
                  onChange={(e) => setShowDone(e.target.checked)}
                />
                Erledigte zeigen
              </label>
            )}
          </div>
          {sections.map((section) => {
            const rows = section
              ? tasks.filter(
                  (t) =>
                    todaySection(
                      t,
                      data.preferences[t.id],
                      date,
                      user.timezone,
                    ) === section,
                )
              : tasks;
            return (
              <section key={section}>
                {section && rows.length > 0 && (
                  <h2 className="group-title">{section}</h2>
                )}
                {rows.map((t) => {
                  const children = (data.subtasks || []).filter(
                    (c) => c.taskId === t.id && !c.deleted,
                  );
                  const expanded = expandedTasks.has(t.id);
                  const regionId = `task-subtasks-${t.id}`;
                  const toggleLabel = `Unteraufgaben von „${t.title}“ ${expanded ? "zuklappen" : "aufklappen"}`;
                  return (
                    <div className="task-item" key={t.id}>
                      <div className={"task-row " + (t.done ? "done" : "")}>
                        <button
                          className="check-hit"
                          aria-label={
                            t.done
                              ? `${t.title} wieder öffnen`
                              : `${t.title} erledigen`
                          }
                          aria-pressed={t.done}
                          disabled={t.deleted}
                          onClick={() =>
                            void act(async () => {
                              if (
                                !t.done &&
                                data.subtasks?.some(
                                  (c) =>
                                    c.taskId === t.id && !c.deleted && !c.done,
                                )
                              ) {
                                setComplete(t);
                                return;
                              }
                              const completionKey = await store.enqueue(
                                "completion",
                                t.id,
                                t.done
                                  ? { action: "reopen" }
                                  : { action: "complete", openIds: [] },
                              );
                              setUndo({
                                id: t.id,
                                done: t.done,
                                completionKey,
                              });
                            })
                          }
                        >
                          <span className="check-circle">
                            {t.done && <CheckIcon weight="bold" />}
                          </span>
                        </button>
                        {(children.length > 0 || expanded) && (
                          <button
                            className="subtask-toggle"
                            aria-label={toggleLabel}
                            aria-expanded={expanded}
                            aria-controls={regionId}
                            onClick={() => toggleSubtasks(t.id)}
                          >
                            {expanded ? (
                              <CaretDownIcon aria-hidden="true" />
                            ) : (
                              <CaretRightIcon aria-hidden="true" />
                            )}
                          </button>
                        )}
                        <div className="task-summary">
                          <button
                            className="task-content"
                            onClick={() => {
                              setSelectedSnapshot(t);
                              setSelected(t.id);
                            }}
                          >
                            <span>{t.title}</span>
                            <small>
                              {[
                                query || (!list && view !== "Eingang")
                                  ? data.lists.find((l) => l.id === t.listId)
                                      ?.name
                                  : null,
                                formatDue(t.due),
                                t.assignee
                                  ? data.users.find((u) => u.id === t.assignee)
                                      ?.name
                                  : null,
                                state.queue.some(
                                  (q) =>
                                    q.id === t.id ||
                                    (q.entity === "subtask" &&
                                      (q.base?.taskId === t.id ||
                                        q.patch.taskId === t.id)),
                                )
                                  ? "Ausstehend"
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                          </button>
                          {children.length > 0 && !expanded && (
                            <button
                              className="task-progress"
                              aria-expanded={expanded}
                              aria-controls={regionId}
                              aria-label={`${subtaskProgress(children.filter((c) => c.done).length, children.length)}. ${toggleLabel}`}
                              onClick={() => toggleSubtasks(t.id)}
                            >
                              {subtaskProgress(
                                children.filter((c) => c.done).length,
                                children.length,
                              )}
                            </button>
                          )}
                        </div>
                        {data.preferences[t.id]?.starred && (
                          <StarIcon
                            className="star"
                            weight="fill"
                            aria-label="Markiert"
                          />
                        )}
                        {t.deleted && (
                          <button
                            aria-label={`${t.title} wiederherstellen`}
                            onClick={() =>
                              void act(() =>
                                store.enqueue("task", t.id, { deleted: false }),
                              )
                            }
                          >
                            <ArrowClockwiseIcon />
                          </button>
                        )}
                        {section === "Überfällig" && (
                          <button
                            title="Für heute ausblenden"
                            aria-label={`${t.title} heute ausblenden`}
                            onClick={() =>
                              void act(() =>
                                store.enqueue("preference", t.id, {
                                  hideOverdue: date,
                                }),
                              )
                            }
                          >
                            <XIcon />
                          </button>
                        )}

                        {!t.deleted && (
                          <TaskActions
                            title={t.title}
                            id={t.id}
                            onAdd={() => {
                              setExpandedTasks((previous) =>
                                new Set(previous).add(t.id),
                              );
                              setAddRequests((previous) => ({
                                ...previous,
                                [t.id]: (previous[t.id] || 0) + 1,
                              }));
                            }}
                          />
                        )}
                      </div>
                      {(children.length > 0 || expanded) && (
                        <div id={regionId} hidden={!expanded}>
                          <Subtasks
                            task={t}
                            inline
                            addRequest={addRequests[t.id]}
                            onCancelEmpty={() => {
                              setExpandedTasks((previous) => {
                                const next = new Set(previous);
                                next.delete(t.id);
                                return next;
                              });
                              document
                                .getElementById(`task-actions-${t.id}`)
                                ?.focus();
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
          {!tasks.length && (
            <div className="empty">
              <TrayIcon />
              <h2>
                {query
                  ? "Nichts gefunden"
                  : view === "Eingang"
                    ? "Dein Eingang ist frei."
                    : "Hier ist noch Platz."}
              </h2>
              <p>
                {query
                  ? "Versuche einen anderen Suchbegriff."
                  : view === "Papierkorb"
                    ? "Keine gelöschten Aufgaben."
                    : "Neue Gedanken kannst du oben festhalten."}
              </p>
            </div>
          )}
        </div>
      </main>
      {complete && (
        <Modal
          title="Alle Schritte erledigen?"
          onClose={() => setComplete(null)}
        >
          <p>
            „{complete.title}“ enthält{" "}
            {data.subtasks?.filter(
              (c) => c.taskId === complete.id && !c.deleted && !c.done,
            ).length || 0}{" "}
            offene Schritte. Hauptaufgabe und offene Unteraufgaben gemeinsam
            erledigen?
          </p>
          <div className="actions">
            <button onClick={() => setComplete(null)}>Abbrechen</button>
            <button
              className="primary"
              onClick={() =>
                void act(async () => {
                  const completionKey = await store.enqueue(
                    "completion",
                    complete.id,
                    {
                      action: "complete",
                      openIds: (data.subtasks || [])
                        .filter(
                          (c) =>
                            c.taskId === complete.id && !c.deleted && !c.done,
                        )
                        .map((c) => c.id),
                    },
                  );
                  setUndo({
                    id: complete.id,
                    done: complete.done,
                    completionKey,
                  });
                  setComplete(null);
                })
              }
            >
              Alles erledigen
            </button>
          </div>
        </Modal>
      )}
      {undo && (
        <UndoToast
          undo={undo}
          onDismiss={dismissUndo}
          onUndo={() =>
            void act(async () => {
              if (undo.completionKey)
                await store.enqueue("completion", undo.id, {
                  action: "undo",
                  key: undo.completionKey,
                });
              else await store.enqueue("task", undo.id, { done: undo.done });
              setUndo(null);
            })
          }
        />
      )}
      {chosen && (
        <Details
          key={chosen.id}
          task={chosen}
          onClose={() => {
            setSelected(null);
            setSelectedSnapshot(null);
          }}
        />
      )}
      {modal === "login" && (
        <Modal title="Erneut anmelden" onClose={() => setModal(null)}>
          <Login onClose={() => setModal(null)} />
        </Modal>
      )}
      {(modal === "list" || managed) && (
        <ListForm
          list={managed}
          onClose={() => {
            setModal(null);
            setManage(null);
          }}
        />
      )}
      {modal === "settings" && (
        <Modal title="Einstellungen" onClose={() => setModal(null)}>
          <label>
            Darstellung
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="dark">Dunkel</option>
              <option value="light">Hell</option>
              <option value="system">System</option>
            </select>
          </label>
          <p>Zeitzone: {user.timezone}</p>
          <p className="muted">
            Notera lässt sich über das Browsermenü als App installieren. Bereits
            geladene Aufgaben bleiben offline verfügbar.
          </p>
          <button
            className="wide"
            onClick={() =>
              void act(async () => {
                await store.logout();
                setModal(null);
              })
            }
          >
            <SignOutIcon />
            Abmelden und lokalen Cache leeren
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </Modal>
      )}
      {modal === "conflicts" && (
        <Modal title="Änderungen prüfen" onClose={() => setModal(null)}>
          <p>
            Deine lokale Änderung bleibt erhalten. Prüfe beide Fassungen, bevor
            du entscheidest.
          </p>
          {state.queue
            .filter((q) => q.error)
            .map((q) => (
              <div className="conflict" key={q.key}>
                <strong>{q.error}</strong>
                <h3>Deine Änderung</h3>
                <ConflictValues value={q.patch} />
                <h3>Serverfassung</h3>
                <ConflictValues
                  value={
                    q.detail?.current ??
                    (q.entity === "preference"
                      ? state.snapshot.preferences[q.id]
                      : q.entity === "list"
                        ? state.snapshot.lists.find((l) => l.id === q.id)
                        : q.entity === "subtask"
                          ? state.snapshot.subtasks?.find((c) => c.id === q.id)
                          : state.snapshot.tasks.find((t) => t.id === q.id))
                  }
                />
                <div className="actions">
                  <button
                    onClick={() =>
                      void act(async () => {
                        if (
                          q.entity === "list" &&
                          q.version === 0 &&
                          !confirm(
                            "Diese neue Liste und ihre noch ausstehenden Aufgabenänderungen verwerfen?",
                          )
                        )
                          return;
                        await store.discard(q.key);
                      })
                    }
                  >
                    {q.entity === "list" && q.version === 0
                      ? "Neue Liste verwerfen"
                      : "Serverfassung behalten"}
                  </button>
                  {q.entity === "list" && q.version === 0 ? (
                    <button
                      onClick={() => {
                        setManage(q.id);
                        setModal(null);
                      }}
                    >
                      Liste korrigieren
                    </button>
                  ) : q.entity === "completion" ? (
                    <p>
                      Serverfassung behalten und die Aktion anschließend an der
                      Hauptaufgabe erneut bestätigen. Bei einem
                      Rückgängig-Konflikt die gewünschten Zustände einzeln
                      prüfen.
                    </p>
                  ) : (
                    <button
                      onClick={() =>
                        void act(async () => {
                          const deleted = state.snapshot.tasks.find(
                            (t) => t.id === q.id,
                          )?.deleted;
                          if (
                            deleted &&
                            !confirm(
                              "Diese Aufgabe wurde gelöscht. Mit deiner Änderung ausdrücklich wiederherstellen?",
                            )
                          )
                            return;
                          await store.resolveConflict(q.key, !!deleted);
                        })
                      }
                    >
                      {state.snapshot.tasks.find((t) => t.id === q.id)?.deleted
                        ? "Wiederherstellen und Änderung anwenden"
                        : "Meine Änderung anwenden"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
function ConflictValues({
  value,
}: {
  value: Record<string, unknown> | undefined;
}) {
  const data = store.getState().snapshot;
  if (!value) return <p>Auf dem Server nicht mehr vorhanden.</p>;
  const labels: Record<string, string> = {
    title: "Titel",
    notes: "Notizen",
    links: "Links",
    listId: "Liste",
    assignee: "Zuweisung",
    due: "Fälligkeit",
    done: "Erledigt",
    taskId: "Hauptaufgabe",
    action: "Aktion",
    openIds: "Offene Schritte",
    deleted: "Im Papierkorb",
    today: "Für heute ausgewählt",
    starred: "Markiert",
    hideOverdue: "Überfällige ausgeblendet am",
    name: "Listenname",
    color: "Listenfarbe",
    members: "Mitglieder",
  };
  function display(key: string, v: unknown): string {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "Ja" : "Nein";
    if (key === "taskId")
      return (
        data.tasks.find((t) => t.id === v)?.title || "Nicht mehr verfügbar"
      );
    if (key === "action")
      return v === "complete"
        ? "Alles erledigen"
        : v === "undo"
          ? "Rückgängig"
          : "Wieder öffnen";
    if (key === "openIds" && Array.isArray(v)) return String(v.length);
    if (key === "color")
      return listColors.find((c) => c.id === normalizeListColor(v))!.name;
    if (key === "listId")
      return data.lists.find((l) => l.id === v)?.name || "Nicht mehr verfügbar";
    if (key === "assignee")
      return (
        data.users.find((u) => u.id === v)?.name || "Nicht mehr zugewiesen"
      );
    if (key === "members" && Array.isArray(v))
      return v
        .map((id) => data.users.find((u) => u.id === id)?.name || "Unbekannt")
        .join(", ");
    if (key === "due" && typeof v === "object")
      return formatDue(v as Task["due"]) || "—";
    if (["today", "hideOverdue"].includes(key) && typeof v === "string")
      return formatCalendarDate(v);
    return Array.isArray(v) ? v.join("\n") : String(v);
  }
  return (
    <dl className="conflict-values">
      {Object.entries(labels)
        .filter(([key]) => key in value)
        .map(([key, label]) => (
          <React.Fragment key={key}>
            <dt>{label}</dt>
            <dd>{display(key, value[key])}</dd>
          </React.Fragment>
        ))}
    </dl>
  );
}
function ListForm({ list, onClose }: { list?: TaskList; onClose: () => void }) {
  const data = store.projected();
  const user = store.getState().user!;
  const [original] = useState(list);
  const [color, setColor] = useState(normalizeListColor(list?.color));
  const [name, setName] = useState(list?.name || "");
  const [members, setMembers] = useState<string[]>(list?.members || [user.id]);
  const rejected = store
    .getState()
    .queue.find(
      (q) =>
        q.entity === "list" && q.id === list?.id && q.version === 0 && q.error,
    );
  const [error, setError] = useState(rejected?.error || "");
  const [nameInvalid, setNameInvalid] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const parsed = listName.safeParse(name);
      if (!parsed.success) {
        setNameInvalid(true);
        setError(parsed.error.issues[0].message);
        return;
      }
      setNameInvalid(false);
      const patch: Record<string, unknown> = {};
      if (!original || rejected || parsed.data !== original.name)
        patch.name = parsed.data;
      if (
        !original ||
        rejected ||
        JSON.stringify([...members].sort()) !==
          JSON.stringify([...original.members].sort())
      )
        patch.members = members;
      if (!original || rejected || color !== normalizeListColor(original.color))
        patch.color = color;
      if (!Object.keys(patch).length) {
        onClose();
        return;
      }
      if (rejected) await store.correctNewList(rejected.key, patch);
      else
        await store.enqueue(
          "list",
          list?.id || crypto.randomUUID(),
          patch,
          original?.version,
        );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title={list ? "Liste verwalten" : "Neue Liste"} onClose={onClose}>
      <form onSubmit={submit}>
        <label>
          Name
          <input
            autoFocus
            required
            maxLength={LIST_NAME_MAX}
            aria-invalid={nameInvalid || undefined}
            aria-describedby={error ? "list-error" : undefined}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <fieldset className="color-picker">
          <legend>Listenfarbe</legend>
          <div className="color-options">
            {listColors.map((c) => (
              <label className="color-option" key={c.id} title={c.name}>
                <input
                  type="radio"
                  name="list-color"
                  value={c.id}
                  checked={color === c.id}
                  onChange={() => setColor(c.id)}
                  aria-label={c.name}
                />
                <span
                  className="color-swatch list-color"
                  style={
                    listColorStyle(
                      c.id,
                      members.length > 1,
                    ) as React.CSSProperties
                  }
                  aria-hidden="true"
                >
                  {color === c.id ? "✓" : ""}
                </span>
              </label>
            ))}
          </div>
          <span className="muted">
            {listColors.find((c) => c.id === color)!.name}
          </span>
        </fieldset>
        <fieldset>
          <legend>Mit bestehenden Benutzern teilen</legend>
          {data.users
            .filter((u) => u.id !== user.id)
            .map((u) => (
              <label className="inline" key={u.id}>
                <input
                  type="checkbox"
                  checked={members.includes(u.id)}
                  onChange={(e) =>
                    setMembers(
                      e.target.checked
                        ? [...members, u.id]
                        : members.filter((id) => id !== u.id),
                    )
                  }
                />
                {u.name}
              </label>
            ))}
        </fieldset>
        <p className="muted">
          Ausgewählte Personen können alle Aufgaben dieser Liste sehen und
          bearbeiten. Dein Eingang bleibt privat.
        </p>
        {error && (
          <p id="list-error" role="alert" className="error">
            {error}
          </p>
        )}
        <div className="actions">
          <button className="primary">
            {list ? "Änderungen speichern" : "Liste anlegen"}
          </button>
          <button type="button" onClick={onClose}>
            Abbrechen
          </button>
          {list && !rejected && (
            <button
              type="button"
              className="danger"
              onClick={async () => {
                if (confirm("Leere Liste löschen?")) {
                  await store.enqueue("list", list.id, { deleted: true });
                  onClose();
                }
              }}
            >
              Liste löschen
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
function Details({ task: t, onClose }: { task: Task; onClose: () => void }) {
  const data = store.projected();
  const user = store.getState().user!;
  const pref = data.preferences[t.id];
  const [draft, setDraft] = useState({ ...t });
  const [links, setLinks] = useState(t.links.join("\n"));
  const [error, setError] = useState("");
  const [dueKind, setDueKind] = useState(t.due?.kind || "none");
  const [dueDate, setDueDate] = useState(
    t.due?.kind === "date" ? t.due.date : t.due?.local || "",
  );
  const [zone, setZone] = useState(
    t.due?.kind === "time" ? t.due.timezone : user.timezone,
  );
  const original = useRef(t);
  const target = data.lists.find((l) => l.id === draft.listId);
  const [dirty, setDirty] = useState(false);
  function close() {
    if (!dirty || confirm("Ungespeicherte Änderungen verwerfen?")) onClose();
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const next = {
        title: draft.title,
        notes: draft.notes,
        links: links
          .split("\n")
          .map((v) => v.trim())
          .filter(Boolean),
        listId: draft.listId,
        assignee: draft.assignee,
        due:
          dueKind === "none"
            ? null
            : dueKind === "date"
              ? { kind: "date", date: dueDate }
              : { kind: "time", local: dueDate, timezone: zone },
      };
      const parsed = taskPatch.parse(next);
      const patch = Object.fromEntries(
        Object.entries(parsed).filter(
          ([k, v]) =>
            JSON.stringify(v) !== JSON.stringify((original.current as any)[k]),
        ),
      );
      if (patch.listId) {
        const before = data.lists.find((l) => l.id === original.current.listId);
        if (
          JSON.stringify([...(before?.members || [])].sort()) !==
            JSON.stringify([...(target?.members || [])].sort()) &&
          !confirm(
            "Die Sichtbarkeit ändert sich: Nach dem Verschieben sehen alle Mitglieder der Zielliste diese Aufgabe. Fortfahren?",
          )
        )
          return;
      }
      if (Object.keys(patch).length)
        await store.enqueue("task", t.id, patch, original.current.version);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title="Aufgabe" panel onClose={close}>
      <label>
        Titel
        <textarea
          autoFocus
          rows={2}
          maxLength={TITLE_MAX}
          required
          form="task-details-form"
          value={draft.title}
          onChange={(e) => {
            setDirty(true);
            setDraft({ ...draft, title: e.target.value });
          }}
        />
      </label>
      <Subtasks task={t} />
      <form
        id="task-details-form"
        onSubmit={save}
        onChange={() => setDirty(true)}
      >
        <label>
          Notizen
          <textarea
            rows={5}
            maxLength={20000}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </label>
        <label>
          Links <small>Ein HTTP-/HTTPS-Link pro Zeile</small>
          <textarea
            rows={2}
            value={links}
            onChange={(e) => setLinks(e.target.value)}
          />
        </label>
        {t.links.map((link) => (
          <a key={link} href={link} target="_blank" rel="noopener noreferrer">
            {link}
          </a>
        ))}
        <div className="form-grid">
          <label>
            Liste
            <select
              value={draft.listId}
              onChange={(e) =>
                setDraft({ ...draft, listId: e.target.value, assignee: null })
              }
            >
              {data.lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.inbox ? "Persönlicher Eingang" : l.name}
                  {l.members.length > 1 ? " · geteilt" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Zuweisung
            <select
              value={draft.assignee || ""}
              onChange={(e) =>
                setDraft({ ...draft, assignee: e.target.value || null })
              }
            >
              <option value="">Niemand</option>
              {target?.members.map((id) => (
                <option key={id} value={id}>
                  {data.users.find((u) => u.id === id)?.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Fälligkeit
          <select
            value={dueKind}
            onChange={(e) => {
              setDueKind(e.target.value);
              setDueDate("");
            }}
          >
            <option value="none">Ohne Termin</option>
            <option value="date">Datum</option>
            <option value="time">Datum und Uhrzeit</option>
          </select>
        </label>
        {dueKind !== "none" && (
          <label>
            {dueKind === "date" ? "Datum" : "Lokale Uhrzeit"}
            <input
              type={dueKind === "date" ? "date" : "datetime-local"}
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
        )}
        {dueKind === "time" && (
          <label>
            Zeitzone
            <input
              required
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary wide" disabled={t.deleted}>
          Speichern
        </button>
      </form>
      <div className="personal-actions">
        <button
          onClick={() =>
            void store.enqueue("preference", t.id, {
              today:
                pref?.today === today(user.timezone)
                  ? null
                  : today(user.timezone),
            })
          }
        >
          <SunIcon />
          {pref?.today === today(user.timezone)
            ? "Heute abwählen"
            : "Für heute auswählen"}
        </button>
        <button
          onClick={() =>
            void store.enqueue("preference", t.id, { starred: !pref?.starred })
          }
        >
          <StarIcon weight={pref?.starred ? "fill" : "regular"} />
          {pref?.starred ? "Markierung entfernen" : "Markieren"}
        </button>
        <button
          className="danger"
          onClick={async () => {
            await store.enqueue("task", t.id, { deleted: !t.deleted });
            onClose();
          }}
        >
          <TrashIcon />
          {t.deleted ? "Wiederherstellen" : "In den Papierkorb"}
        </button>
      </div>
    </Modal>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
