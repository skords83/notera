import { ordered } from "../shared/order";
import { moveAction, OrderAnnouncement, type Move } from "./Ordering";
import { TaskActions } from "./TaskActions";
import { useState, useRef, useEffect, useId, type FormEvent } from "react";
import { CheckIcon } from "@phosphor-icons/react";
import { TITLE_MAX, type Task, type Subtask } from "../shared/model";
import * as store from "./store";

function SubtaskRow({
  child,
  disabled,
  report,
  onRemoved,
  compact = false,
  siblings,
  move,
  onTransfer,
}: {
  child: Subtask;
  disabled: boolean;
  report: (error: string) => void;
  onRemoved: () => void;
  compact?: boolean;
  siblings: Subtask[];
  move: Move;
  onTransfer: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(child.title);
  const original = useRef(child.version);
  const editButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!editing && returnFocus.current) {
      editButton.current?.focus();
      returnFocus.current = false;
    }
  }, [editing]);
  function finishEdit() {
    returnFocus.current = true;
    setEditing(false);
  }
  async function change(patch: Record<string, unknown>, version?: number) {
    try {
      report("");
      await store.enqueue("subtask", child.id, patch, version);
      if (patch.deleted) onRemoved();
      else if (editing) finishEdit();
    } catch (e) {
      report((e as Error).message);
    }
  }
  return (
    <li
      className="subtask-row"
      data-order-id={child.id}
      data-order-scope={child.taskId}
    >
      <button
        className="check-hit"
        disabled={disabled}
        aria-label={`${child.title} ${child.done ? "wieder öffnen" : "erledigen"}`}
        aria-pressed={child.done}
        onClick={() => void change({ done: !child.done })}
      >
        <span className="check-circle">
          {child.done && <CheckIcon weight="bold" />}
        </span>
      </button>
      {compact ? (
        <span className={"subtask-title " + (child.done ? "completed" : "")}>
          {child.title}
        </span>
      ) : editing ? (
        <form
          className="subtask-edit"
          onSubmit={(e) => {
            e.preventDefault();
            void change({ title }, original.current);
          }}
        >
          <input
            autoFocus
            aria-label="Unteraufgabentitel bearbeiten"
            maxLength={TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                e.preventDefault();
                finishEdit();
              }
            }}
          />
          <div className="actions">
            <button type="submit">Übernehmen</button>
            <button type="button" onClick={finishEdit}>
              Abbrechen
            </button>
          </div>
        </form>
      ) : (
        <button
          ref={editButton}
          className={"subtask-title " + (child.done ? "completed" : "")}
          disabled={disabled}
          aria-label={`${child.title} bearbeiten`}
          onClick={() => {
            setTitle(child.title);
            original.current = child.version;
            setEditing(true);
          }}
        >
          {child.title}
        </button>
      )}
      {!disabled && (
        <TaskActions
          id={`sub-${child.id}-${compact ? "inline" : "detail"}`}
          title={child.title}
          grip={{ id: child.id, scope: child.taskId, onMove: move }}
          onTransfer={onTransfer}
          onRemove={!compact ? () => void change({ deleted: true }) : undefined}
          ordering={{
            up: siblings[siblings.indexOf(child) - 1]
              ? () => move(siblings[siblings.indexOf(child) - 1].id, "before")
              : undefined,
            down: siblings[siblings.indexOf(child) + 1]
              ? () => move(siblings[siblings.indexOf(child) + 1].id, "after")
              : undefined,
          }}
        />
      )}
    </li>
  );
}
export function subtaskProgress(done: number, total: number) {
  return done === total
    ? `Alle ${total} erledigt`
    : `${done} von ${total} erledigt`;
}

export function Subtasks({
  task,
  inline = false,
  addRequest = 0,
  onAddStarted,
  onCancelEmpty,
}: {
  task: Task;
  inline?: boolean;
  addRequest?: number;
  onAddStarted?: () => void;
  onCancelEmpty?: () => void;
}) {
  const children = ordered(
    (store.projected().subtasks || []).filter(
      (c) => c.taskId === task.id && !c.deleted,
    ),
  );
  const id = useId();
  const [transfer, setTransfer] = useState<Subtask | null>(null);
  const [adding, setAdding] = useState(!inline);
  const addButton = useRef<HTMLButtonElement>(null);
  const focusAddButton = useRef(false);
  useEffect(() => {
    if (!adding && focusAddButton.current) {
      addButton.current?.focus();
      focusAddButton.current = false;
    }
  }, [adding]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (addRequest) {
      setAdding(true);
      input.current?.focus();
      onAddStarted?.();
    }
  }, [addRequest, onAddStarted]);
  async function add(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      setError("");
      await store.enqueue("subtask", crypto.randomUUID(), {
        taskId: task.id,
        title,
      });
      setTitle("");
      input.current?.focus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={inline ? "subtasks inline-subtasks" : "subtasks"}
      aria-label={inline ? `Unteraufgaben von ${task.title}` : undefined}
      aria-labelledby={inline ? undefined : `${id}-heading`}
    >
      {!inline && <OrderAnnouncement />}
      {!inline && (
        <>
          <h3 id={`${id}-heading`}>
            Unteraufgaben{" "}
            {children.length > 0 && (
              <small>
                {subtaskProgress(
                  children.filter((c) => c.done).length,
                  children.length,
                )}
              </small>
            )}
          </h3>
          {children.length > 0 && (
            <div
              className="subtask-progress-bar"
              role="progressbar"
              aria-label="Erledigte Unteraufgaben"
              aria-valuemin={0}
              aria-valuemax={children.length}
              aria-valuenow={children.filter((c) => c.done).length}
              aria-valuetext={subtaskProgress(
                children.filter((c) => c.done).length,
                children.length,
              )}
            >
              <span
                style={{
                  width: `${(children.filter((c) => c.done).length / children.length) * 100}%`,
                }}
              />
            </div>
          )}
        </>
      )}
      <ul>
        {children.map((child) => (
          <SubtaskRow
            key={child.id}
            child={child}
            siblings={children}
            onTransfer={() => setTransfer(child)}
            move={moveAction("subtask", child.id, children, setError)}
            compact={inline}
            disabled={task.deleted}
            report={setError}
            onRemoved={() => input.current?.focus()}
          />
        ))}
      </ul>
      {adding ? (
        <form onSubmit={add} className="subtask-add">
          <label htmlFor={`${id}-new`}>Neue Unteraufgabe</label>
          <div>
            <input
              id={`${id}-new`}
              autoFocus={inline}
              ref={input}
              readOnly={busy}
              disabled={task.deleted}
              maxLength={TITLE_MAX}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-describedby={error ? `${id}-error` : undefined}
              aria-invalid={!!error}
              onKeyDown={(e) => {
                if (e.key === "Escape" && inline && !busy) {
                  e.preventDefault();
                  e.stopPropagation();
                  setTitle("");
                  setError("");
                  if (children.length === 0 && onCancelEmpty) {
                    onCancelEmpty();
                    return;
                  }
                  focusAddButton.current = true;
                  setAdding(false);
                }
              }}
              placeholder="Nächster Schritt …"
            />
            <button disabled={busy || task.deleted} type="submit">
              Hinzufügen
            </button>
          </div>
        </form>
      ) : (
        !task.deleted && (
          <button
            className="subtask-add-trigger"
            ref={addButton}
            onClick={() => setAdding(true)}
          >
            + Unteraufgabe
          </button>
        )
      )}
      {transfer && (
        <TransferDialog child={transfer} onClose={() => setTransfer(null)} />
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

function TransferDialog({
  child,
  onClose,
}: {
  child: Subtask;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const snapshot = store.projected();
  const source = snapshot.tasks.find((t) => t.id === child.taskId);
  const targets = snapshot.tasks.filter(
    (t) =>
      !t.deleted &&
      t.id !== child.taskId &&
      t.listId === source?.listId &&
      t.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  function close() {
    ref.current?.close();
    onClose();
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const target = targets.find((t) => t.id === selected);
    if (!target || busy) return;
    setBusy(true);
    try {
      await store.enqueue("subtaskMove", child.id, {
        sourceId: child.taskId,
        targetId: target.id,
        targetVersion: target.version,
      });
      close();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="transfer-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
      }}
    >
      <h2 id={`${id}-title`}>Zu anderer Aufgabe verschieben</h2>
      <p>
        „{child.title}“ wird am Ende der gewählten Aufgabe angehängt. Die
        Änderung wird beim nächsten Abgleich gespeichert.
      </p>
      <form onSubmit={submit}>
        <label>
          Aufgabe suchen
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <fieldset>
          <legend>Ziel in derselben Liste</legend>
          {targets.map((t) => (
            <label className="transfer-target" key={t.id}>
              <input
                type="radio"
                name={`${id}-target`}
                value={t.id}
                checked={selected === t.id}
                onChange={() => setSelected(t.id)}
              />{" "}
              <span>{t.title}</span>
            </label>
          ))}
          {!targets.length && <p>Keine passende Aufgabe gefunden.</p>}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <div className="actions">
          <button
            type="submit"
            disabled={busy || !targets.some((t) => t.id === selected)}
          >
            Verschieben
          </button>
          <button type="button" onClick={close}>
            Abbrechen
          </button>
        </div>
      </form>
    </dialog>
  );
}
