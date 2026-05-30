"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Frontline sales land on the desktop inbox (/convert/inbox) by default, but on
 * phone-sized screens the phone-first /m/inbox shell is the better experience.
 * This guard bounces them there on mount. Mount-only (no resize listener) so
 * shrinking a desktop window mid-session never yanks an in-progress view.
 *
 * Rendered only for users whose home is the mobile shell (no view_dashboard);
 * dashboard roles keep the desktop inbox at any width.
 */
export function SmallScreenInboxRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (window.matchMedia("(max-width: 767px)").matches) {
      router.replace("/m/inbox");
    }
  }, [router]);
  return null;
}
