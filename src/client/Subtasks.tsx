import { useState, useRef, useEffect, type FormEvent } from "react";
import { CheckIcon, TrashIcon } from "@phosphor-icons/react";
import { TITLE_MAX, type Task, type Subtask } from "../shared/model";
import * as store from "./store";

function SubtaskRow({
  child,
  disabled,
  report,
  onRemoved,
}: {
  child: Subtask;
  disabled: boolean;
  report: (error: string) => void;
  onRemoved: () => void;
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
      {editing ? (
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
      <button
        disabled={disabled}
        aria-label={`${child.title} entfernen`}
        onClick={() => void change({ deleted: true })}
      >
        <TrashIcon />
      </button>
    </li>
  );
}
export function Subtasks({ task }: { task: Task }) {
  const children = (store.projected().subtasks || []).filter(
    (c) => c.taskId === task.id && !c.deleted,
  );
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
    <section className="subtasks" aria-labelledby="subtasks-heading">
      <h3 id="subtasks-heading">
        Unteraufgaben{" "}
        {children.length > 0 && (
          <small>
            {children.filter((c) => c.done).length} von {children.length}
          </small>
        )}
      </h3>
      <ul>
        {children.map((child) => (
          <SubtaskRow
            key={child.id}
            child={child}
            disabled={task.deleted}
            report={setError}
            onRemoved={() => input.current?.focus()}
          />
        ))}
      </ul>
      <form onSubmit={add} className="subtask-add">
        <label htmlFor="subtask-new">Neue Unteraufgabe</label>
        <div>
          <input
            id="subtask-new"
            ref={input}
            readOnly={busy}
            disabled={task.deleted}
            maxLength={TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-describedby={error ? "subtask-error" : undefined}
            placeholder="Nächster Schritt …"
          />
          <button disabled={busy || task.deleted} type="submit">
            Hinzufügen
          </button>
        </div>
      </form>
      {error && (
        <p id="subtask-error" role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
