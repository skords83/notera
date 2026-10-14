import { SortHandle, type Move } from "./Ordering";
import { useRef, useState, useId } from "react";
import { DotsThreeIcon } from "@phosphor-icons/react";

export function TaskActions({
  title,
  id,
  onAdd,
  ordering,
  grip,
  onRemove,
}: {
  title: string;
  id: string;
  onAdd?: () => void;
  ordering?: { up?: () => void; down?: () => void };
  grip?: { id: string; scope: string; onMove: Move };
  onRemove?: () => void;
}) {
  const popupId = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div
      className="task-actions"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      {grip ? (
        <SortHandle
          {...grip}
          title={title}
          buttonId={`task-actions-${id}`}
          buttonRef={trigger}
          expanded={open}
          controls={`task-actions-content-${popupId}`}
          onActivate={() => setOpen(!open)}
        />
      ) : (
        <button
          id={`task-actions-${id}`}
          ref={trigger}
          aria-label={`Aktionen für „${title}“`}
          aria-expanded={open}
          aria-controls={`task-actions-content-${popupId}`}
          onClick={() => setOpen(!open)}
        >
          <DotsThreeIcon aria-hidden="true" />
        </button>
      )}
      {open && (
        <div
          id={`task-actions-content-${popupId}`}
          className="task-actions-popup"
        >
          {onAdd && (
            <button
              autoFocus
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                onAdd();
              }}
            >
              Unteraufgabe hinzufügen
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              aria-label={`${title} entfernen`}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                onRemove();
              }}
            >
              Unteraufgabe entfernen
            </button>
          )}
          {ordering &&
            (["up", "down"] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                disabled={!ordering[direction]}
                aria-label={`${title}: ${direction === "up" ? "Nach oben" : "Nach unten"}`}
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                  ordering[direction]?.();
                }}
              >
                {direction === "up" ? "Nach oben" : "Nach unten"}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
