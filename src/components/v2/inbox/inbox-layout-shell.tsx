import type { ReactNode } from "react";

export function InboxLayoutShell({
  queue,
  conversation,
  drawer = null,
}: {
  queue: ReactNode;
  conversation: ReactNode;
  drawer?: ReactNode;
}) {
  return (
    <section
      data-component="inbox-layout-shell"
      className="mx-auto mt-6 grid max-w-7xl min-w-0 gap-0 border border-hp-rule bg-hp-card xl:grid-cols-[400px_minmax(0,1fr)]"
    >
      <div
        data-slot="queue"
        className="min-w-0 xl:h-[125vh] xl:overflow-hidden xl:border-r xl:border-hp-rule"
      >
        {queue}
      </div>
      <div data-slot="conversation" className="min-w-0 xl:h-[125vh] xl:overflow-hidden">
        {conversation}
      </div>
      {drawer}
    </section>
  );
}
