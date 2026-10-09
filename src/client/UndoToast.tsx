import { useEffect, useState } from "react";
import { XIcon } from "@phosphor-icons/react";
export type UndoAction = { id: string; done: boolean };
export function UndoToast({
  undo,
  onUndo,
  onDismiss,
}: {
  undo: UndoAction;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    // Give a full reading interval after each action or interaction; never remove a focused control.
    if (hovered || focused || hidden) return;
    const timer = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(timer);
  }, [undo, hovered, focused, hidden, onDismiss]);
  return (
    <div
      className="toast"
      role="status"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      <span>{undo.done ? "Wieder geöffnet" : "Erledigt"}</span>
      <button onClick={onUndo}>Rückgängig</button>
      <button aria-label="Rückmeldung schließen" onClick={onDismiss}>
        <XIcon />
      </button>
    </div>
  );
}
