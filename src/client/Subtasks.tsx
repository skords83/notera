import { useState, useRef, useEffect, useId, type FormEvent } from "react";
import { CheckIcon, TrashIcon } from "@phosphor-icons/react";
import { TITLE_MAX, type Task, type Subtask } from "../shared/model";
import * as store from "./store";

function SubtaskRow({
  child,
  disabled,
  report,
  onRemoved,
  compact = false,
}: {
  child: Subtask;
  disabled: boolean;
  report: (error: string) => void;
  onRemoved: () => void;
  compact?: boolean;
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
    <li className="subtask-row">
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
      {!compact && (
        <button
          disabled={disabled}
          aria-label={`${child.title} entfernen`}
          onClick={() => void change({ deleted: true })}
        >
          <TrashIcon />
        </button>
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
}: {
  task: Task;
  inline?: boolean;
}) {
  const children = (store.projected().subtasks || []).filter(
    (c) => c.taskId === task.id && !c.deleted,
  );
  const id = useId();
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
      {error && (
        <p id={`${id}-error`} role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
