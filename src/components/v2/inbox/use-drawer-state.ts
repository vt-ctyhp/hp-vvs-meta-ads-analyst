"use client";

import { useCallback, useState } from "react";

export type DrawerKey = "details" | "audit" | "notes" | "qa" | null;
export type OpenDrawerKey = Exclude<DrawerKey, null>;
export type DispositionPreset = "close" | null;

export type UseDrawerStateReturn = {
  drawer: DrawerKey;
  preset: DispositionPreset;
  dispositionPreset: DispositionPreset;
  open: (drawer: OpenDrawerKey, preset?: DispositionPreset) => void;
  close: () => void;
};

export function useDrawerState(): UseDrawerStateReturn {
  const [drawer, setDrawer] = useState<DrawerKey>(null);
  const [preset, setPreset] = useState<DispositionPreset>(null);

  const open = useCallback((nextDrawer: OpenDrawerKey, nextPreset: DispositionPreset = null) => {
    setDrawer(nextDrawer);
    setPreset(nextPreset);
  }, []);

  const close = useCallback(() => {
    setDrawer(null);
    setPreset(null);
  }, []);

  return {
    drawer,
    preset,
    dispositionPreset: preset,
    open,
    close,
  };
}
