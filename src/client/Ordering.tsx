import { useEffect, useRef, useState, type RefObject } from "react";
import { DotsSixVerticalIcon } from "@phosphor-icons/react";
import { relocate } from "../shared/order";
import * as store from "./store";
export type Move = (anchor: string, side: "before" | "after") => void;
export function moveAction(
  kind: "task" | "subtask",
  id: string,
  rows: { id: string; title: string }[],
  report: (message: string) => void,
): Move {
  return (anchor, side) => {
    void store
      .move(kind, id, anchor, side)
      .then(() => {
        const index = relocate(rows, id, anchor, side).findIndex(
          (r) => r.id === id,
        );
        window.dispatchEvent(
          new CustomEvent("notera-order", {
            detail: `${rows.find((r) => r.id === id)?.title}: Position ${index + 1} von ${rows.length}. Lokal gespeichert; Synchronisationsstatus beachten.`,
          }),
        );
      })
      .catch((e) => report(e.message));
  };
}
export function OrderAnnouncement() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const receive = (event: Event) =>
      setMessage((event as CustomEvent<string>).detail);
    window.addEventListener("notera-order", receive);
    return () => window.removeEventListener("notera-order", receive);
  }, []);
  return (
    <span
      className="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {message}
    </span>
  );
}
export function SortHandle({
  id,
  title,
  scope,
  onMove,
  onActivate,
  buttonId,
  buttonRef,
  expanded,
  controls,
}: {
  id: string;
  title: string;
  scope: string;
  onMove: Move;
  onActivate: () => void;
  buttonId: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  expanded: boolean;
  controls: string;
}) {
  const suppressClick = useRef(false);
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);
  return (
    <button
      type="button"
      className="sort-handle"
      ref={buttonRef}
      id={buttonId}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={`Aktionen für „${title}“`}
      aria-description="Ziehen zum Sortieren oder aktivieren für Nach oben und Nach unten."
      title="Ziehen zum Sortieren · Tippen für Aktionen"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.detail && suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onActivate();
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        cleanup.current();
        suppressClick.current = false;
        const button = e.currentTarget,
          row = button.closest<HTMLElement>("[data-order-id]");
        if (!row) return;
        const root = row.parentElement!,
          startX = e.clientX,
          startY = e.clientY;
        let x = startX,
          y = startY,
          dragging = false,
          ghost: HTMLElement | null = null,
          target: HTMLElement | null = null,
          side: "before" | "after" = "before",
          frame = 0;
        const clearTarget = () => {
          target?.classList.remove("insert-before", "insert-after");
          target = null;
        };
        const locate = () => {
          clearTarget();
          const bounds = root.getBoundingClientRect();
          if (
            x < bounds.left ||
            x > bounds.right ||
            y < Math.max(0, bounds.top) ||
            y > Math.min(innerHeight, bounds.bottom)
          )
            return;
          const candidates = [...root.children].filter(
            (el): el is HTMLElement =>
              el instanceof HTMLElement &&
              el.dataset.orderScope === scope &&
              el.dataset.orderId !== id,
          );
          target =
            candidates.find((el) => {
              const b = el.getBoundingClientRect();
              return y >= b.top && y <= b.bottom;
            }) || null;
          if (!target && candidates.length) {
            const first = candidates[0],
              last = candidates[candidates.length - 1];
            if (y < first.getBoundingClientRect().top) target = first;
            else if (y > last.getBoundingClientRect().bottom) target = last;
          }
          if (target) {
            const b = target.getBoundingClientRect();
            side = y < b.top + b.height / 2 ? "before" : "after";
            target.classList.add("insert-" + side);
          }
        };
        const scroll = () => {
          if (dragging) {
            let node: HTMLElement | null = row.parentElement;
            while (node) {
              if (
                node.scrollHeight > node.clientHeight &&
                /auto|scroll/.test(getComputedStyle(node).overflowY)
              )
                break;
              node = node.parentElement;
            }
            const viewport = node?.getBoundingClientRect(),
              top = viewport?.top || 0,
              bottom = viewport?.bottom || innerHeight;
            const delta =
              y < top + 64
                ? -Math.min(18, (top + 64 - y) / 3)
                : y > bottom - 64
                  ? Math.min(18, (y - bottom + 64) / 3)
                  : 0;
            if (delta) {
              if (node) node.scrollTop += delta;
              else window.scrollBy(0, delta);
              locate();
            }
          }
          frame = requestAnimationFrame(scroll);
        };
        const pointerId = e.pointerId;
        const move = (event: PointerEvent) => {
          if (event.pointerId !== pointerId) return;
          x = event.clientX;
          y = event.clientY;
          if (!dragging && Math.hypot(event.clientX - startX, y - startY) > 6) {
            dragging = true;
            suppressClick.current = true;
            row.classList.add("order-dragging");
            ghost = row.cloneNode(true) as HTMLElement;
            ghost.removeAttribute("id");
            ghost
              .querySelectorAll("[id]")
              .forEach((el) => el.removeAttribute("id"));
            ghost.setAttribute("aria-hidden", "true");
            ghost.inert = true;
            ghost.classList.add("order-ghost");
            const b = row.getBoundingClientRect();
            ghost.style.width = b.width + "px";
            ghost.style.left = b.left + "px";
            (row.closest("dialog") || document.body).appendChild(ghost);
          }
          if (dragging) {
            event.preventDefault();
            if (ghost) ghost.style.top = y - 20 + "px";
            locate();
          }
        };
        const finish = (commit: boolean) => {
          const anchor = target?.dataset.orderId;
          cleanup.current();
          button.focus({ preventScroll: true });
          if (commit && dragging && anchor) onMove(anchor, side);
        };
        const up = (event: PointerEvent) => {
            if (event.pointerId === pointerId) finish(true);
          },
          cancel = () => {
            suppressClick.current = true;
            finish(false);
          };
        const key = (event: KeyboardEvent) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopImmediatePropagation();
            cancel();
          }
        };
        cleanup.current = () => {
          cancelAnimationFrame(frame);
          clearTarget();
          ghost?.remove();
          row.classList.remove("order-dragging");
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", cancel);
          window.removeEventListener("blur", cancel);
          window.removeEventListener("keydown", key, true);
          cleanup.current = () => {};
        };
        window.addEventListener("pointermove", move, { passive: false });
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", cancel);
        window.addEventListener("blur", cancel);
        window.addEventListener("keydown", key, true);
        button.setPointerCapture(e.pointerId);
        frame = requestAnimationFrame(scroll);
      }}
    >
      <DotsSixVerticalIcon aria-hidden="true" />
    </button>
  );
}
