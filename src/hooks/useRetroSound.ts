"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { retroAudio } from "@/lib/audio";

const STORAGE_KEY = "rennam-torado:sound";

let cachedEnabled: boolean | null = null;
const listeners = new Set<() => void>();

function readEnabled() {
  if (cachedEnabled === null) {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    cachedEnabled = stored !== "off";
  }
  return cachedEnabled;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function writeEnabled(next: boolean) {
  cachedEnabled = next;
  retroAudio.setEnabled(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
  } catch {
    // Preferences are optional; ignore storage failures (private mode, etc.).
  }
  listeners.forEach((listener) => listener());
}

export function useRetroSound() {
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => true);

  useEffect(() => {
    retroAudio.setEnabled(enabled);
  }, [enabled]);

  const toggle = useCallback(() => {
    const next = !readEnabled();
    writeEnabled(next);
    if (next) {
      retroAudio.unlock();
      retroAudio.coin();
    }
  }, []);

  return { enabled, toggle, audio: retroAudio };
}
