import { useEffect, useRef, useState, type RefObject } from "react";
import { DotsThreeIcon } from "@phosphor-icons/react";
import { relocate } from "../shared/order";
import * as store from "./store";
import { conversionBlockers } from "../shared/conversion";
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
  onTransfer,
  onConvert,
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
  onConvert?: (target: string) => void;
  onTransfer?: (
    target: string,
    anchor?: string,
    side?: "before" | "after",
  ) => void;
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
      aria-description="Aktivieren für Aktionen, etwa Verschieben und Sortieren. Ziehen zum Sortieren oder Verschieben."
      title="Ziehen zum Sortieren oder Verschieben · Tippen für Aktionen"
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
        const sourceList = onTransfer
          ? store.projected().tasks.find((t) => t.id === scope && !t.deleted)
              ?.listId
          : undefined;
        let conversionTarget: HTMLElement | null = null;
        let conversionAllowed = false;
        let conversionHint: HTMLElement | null = null;
        let transferTarget: HTMLElement | null = null;
        let appendPreview: HTMLElement | null = null;
        let hoverId: string | null = null;
        let hoverTimer = 0;
        const expand = (id: string | null) =>
          window.dispatchEvent(
            new CustomEvent("notera-drag-expand", { detail: id }),
          );
        const clearConversion = () => {
          conversionTarget?.classList.remove(
            "conversion-hover",
            "conversion-blocked",
          );
          conversionTarget = null;
          conversionHint?.remove();
          conversionHint = null;
          conversionAllowed = false;
          ghost?.classList.remove("conversion-ghost");
        };
        const clearTarget = () => {
          transferTarget?.classList.remove("transfer-hover");
          appendPreview?.remove();
          appendPreview = null;
          transferTarget = null;
          target?.classList.remove("insert-before", "insert-after");
          target = null;
        };
        const locate = () => {
          clearTarget();
          if (onConvert) {
            const hit = document
              .elementFromPoint(x, y)
              ?.closest<HTMLElement>("[data-conversion-target]");
            const snapshot = store.projected();
            const source = snapshot.tasks.find(
              (t) => t.id === id && !t.deleted,
            );
            const destination = snapshot.tasks.find(
              (t) => t.id === hit?.dataset.conversionTarget && !t.deleted,
            );
            if (
              hit &&
              source &&
              destination &&
              source.id !== destination.id &&
              source.listId === destination.listId
            ) {
              if (conversionTarget !== hit) clearConversion();
              conversionTarget = hit;
              const blockers = conversionBlockers(source, snapshot);
              conversionAllowed = blockers.length === 0;
              hit.classList.toggle("conversion-hover", conversionAllowed);
              hit.classList.toggle("conversion-blocked", !conversionAllowed);
              if (!conversionHint) {
                conversionHint = document.createElement("div");
                conversionHint.className = "conversion-preview";
                conversionHint.setAttribute("role", "status");
                conversionHint.setAttribute("aria-live", "polite");
                const label = document.createElement("strong");
                const detail = document.createElement("span");
                conversionHint.append(label, detail);
                document.body.appendChild(conversionHint);
              }
              const label = conversionAllowed
                ? "↳ Als Unteraufgabe ablegen · Am Ende"
                : "Umwandlung gesperrt";
              const detail = conversionAllowed
                ? `${source.title} → ${destination.title}`
                : blockers.join(", ");
              if (conversionHint.firstChild!.textContent !== label)
                conversionHint.firstChild!.textContent = label;
              if (conversionHint.lastChild!.textContent !== detail)
                conversionHint.lastChild!.textContent = detail;
              conversionHint.title = detail;
              // Keep the active target grip/title clear at either viewport edge.
              conversionHint.dataset.edge =
                hit.getBoundingClientRect().top < 72 ? "bottom" : "top";
              conversionHint.dataset.blocked = String(!conversionAllowed);
              ghost?.classList.add("conversion-ghost");
              if (hoverId !== destination.id) {
                clearTimeout(hoverTimer);
                expand(null);
                hoverId = destination.id;
                hoverTimer = window.setTimeout(
                  () => expand(destination.id),
                  550,
                );
              }
              return;
            }
            clearConversion();
            if (hoverId) {
              clearTimeout(hoverTimer);
              hoverId = null;
              expand(null);
            }
          }
          if (onTransfer) {
            const hit = document
              .elementFromPoint(x, y)
              ?.closest<HTMLElement>("[data-transfer-target]");
            if (
              hit &&
              sourceList &&
              hit.dataset.transferList === sourceList &&
              hit.dataset.transferTarget !== scope
            ) {
              transferTarget = hit;
              hit.classList.add("transfer-hover");
              const targetId = hit.dataset.transferTarget!;
              if (hoverId !== targetId) {
                clearTimeout(hoverTimer);
                expand(null);
                hoverId = targetId;
                hoverTimer = window.setTimeout(() => expand(targetId), 550);
              }
              target =
                document
                  .elementFromPoint(x, y)
                  ?.closest<HTMLElement>(".subtask-row") || null;
              if (target && target.dataset.orderScope === targetId) {
                const b = target.getBoundingClientRect();
                side = y < b.top + b.height / 2 ? "before" : "after";
                target.classList.add("insert-" + side);
              } else {
                target = null;
                appendPreview = document.createElement("div");
                appendPreview.className = "transfer-append";
                appendPreview.textContent = "Am Ende einfügen";
                hit.appendChild(appendPreview);
              }
              return;
            }
            if (hoverId) {
              clearTimeout(hoverTimer);
              hoverId = null;
              expand(null);
            }
            // Foreign tasks and blank space never become an implicit source drop.
            if (
              !document
                .elementFromPoint(x, y)
                ?.closest(`[data-order-scope="${scope}"]`)
            )
              return;
          }
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
            // Dwell must not scroll its own 44px destination out from under
            // the pointer when opening a target near the viewport edge.
            const delta = conversionTarget
              ? 0
              : y < top + 64
                ? -Math.min(18, (top + 64 - y) / 3)
                : y > bottom - 64
                  ? Math.min(18, (y - bottom + 64) / 3)
                  : 0;
            if (delta) {
              if (node) node.scrollTop += delta;
              else window.scrollBy(0, delta);
            }
            // Keep the preview aligned when a dwelling target expands or rerenders.
            if (delta || onTransfer || onConvert) locate();
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
            if (onConvert)
              document.body.classList.add("conversion-drag-active");
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
            if (ghost) {
              if (onTransfer) {
                ghost.style.maxWidth = "calc(100vw - 32px)";
                ghost.style.left =
                  Math.max(
                    16,
                    Math.min(
                      x - ghost.offsetWidth / 2,
                      innerWidth - ghost.offsetWidth - 16,
                    ),
                  ) + "px";
                ghost.style.top =
                  Math.max(
                    8,
                    Math.min(y + 16, innerHeight - ghost.offsetHeight - 8),
                  ) + "px";
              } else ghost.style.top = y - 20 + "px";
            }
            locate();
          }
        };
        const finish = (commit: boolean) => {
          const anchor = target?.dataset.orderId;
          const destination = transferTarget?.dataset.transferTarget;
          const conversion = conversionAllowed
            ? conversionTarget?.dataset.conversionTarget
            : undefined;
          const placementSide = side;
          cleanup.current();
          button.focus({ preventScroll: true });
          if (commit && dragging && conversion) onConvert?.(conversion);
          else if (commit && dragging && destination)
            onTransfer?.(destination, anchor, placementSide);
          else if (commit && dragging && anchor) onMove(anchor, placementSide);
        };
        const up = (event: PointerEvent) => {
            if (event.pointerId === pointerId) {
              x = event.clientX;
              y = event.clientY;
              if (dragging) locate();
              finish(true);
            }
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
          clearTimeout(hoverTimer);
          expand(null);
          clearConversion();
          clearTarget();
          ghost?.remove();
          row.classList.remove("order-dragging");
          document.body.classList.remove("conversion-drag-active");
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
      <DotsThreeIcon aria-hidden="true" />
    </button>
  );
}
