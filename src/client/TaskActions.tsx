import { useRef, useState } from "react";
import { DotsThreeIcon } from "@phosphor-icons/react";

export function TaskActions({
  title,
  id,
  onAdd,
}: {
  title: string;
  id: string;
  onAdd: () => void;
}) {
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
      <button
        id={`task-actions-${id}`}
        ref={trigger}
        aria-label={`Aktionen für „${title}“`}
        aria-expanded={open}
        aria-controls={`task-actions-content-${id}`}
        onClick={() => setOpen(!open)}
      >
        <DotsThreeIcon aria-hidden="true" />
      </button>
      {open && (
        <div id={`task-actions-content-${id}`} className="task-actions-popup">
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
        </div>
      )}
    </div>
  );
}
