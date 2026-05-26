"use client";

import type { ReactNode } from "react";

import type { MetaInboxQueueDisplayItem } from "../../../lib/meta-inbox-queue-view.ts";
import type { DispositionPreset, DrawerKey } from "./use-drawer-state.ts";

export function DrawerOverlay({
  item,
  drawer,
  preset = null,
  onClose,
  children,
}: {
  item: MetaInboxQueueDisplayItem | null;
  drawer: DrawerKey;
  preset?: DispositionPreset;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!item || !drawer) return null;

  const title = drawerTitle(drawer, preset);
  const titleId = `inbox-drawer-${drawer}-title`;

  return (
    <div
      data-component="drawer-overlay"
      data-drawer={drawer}
      className="fixed inset-0 z-50"
    >
      <button
        type="button"
        aria-label="Close drawer backdrop"
        className="absolute inset-0 cursor-default bg-hp-ink/30"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        className="absolute right-0 top-0 flex h-dvh w-full max-w-[480px] translate-x-0 flex-col overflow-hidden border-l border-hp-rule bg-hp-card shadow-[0_8px_24px_rgba(42,39,37,0.18)] transition-transform"
      >
        <header className="border-b border-hp-rule bg-hp-card px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="break-words text-[11px] uppercase tracking-[0.14em] text-hp-muted">
                {item.sender} · {item.brand}
              </p>
              <h2 id={titleId} className="mt-1 font-title text-2xl leading-tight text-hp-ink">
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 border border-hp-rule bg-hp-card px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:border-hp-ink hover:bg-hp-inset"
            >
              Close ×
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}

export function drawerTitle(drawer: Exclude<DrawerKey, null>, preset: DispositionPreset = null) {
  if (drawer === "details" && preset === "close") return "Close conversation";
  if (drawer === "details") return "Details · Customer + Status";
  if (drawer === "audit") return "Audit trail";
  if (drawer === "notes") return "Notes & coaching";
  return "QA scorecards";
}
