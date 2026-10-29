"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { compareDecimal, isDecimalString, makeClickId } from "@/lib/format";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export type ConnectionStatus =
  | "loading"
  | "live"
  | "syncing"
  | "offline"
  | "unconfigured";

export type Snapshot = { value: string; revision: string };

export type CountedClick = {
  id: number;
  value: string;
  revision: string;
  clickId: string;
};

type TorarResult = Snapshot & { counted: boolean };

function isSnapshot(input: unknown): input is Snapshot {
  if (!input || typeof input !== "object") return false;
  const record = input as Record<string, unknown>;
  return isDecimalString(record.value) && isDecimalString(record.revision);
}

function isTorarResult(input: unknown): input is TorarResult {
  return isSnapshot(input) && typeof (input as Record<string, unknown>).counted === "boolean";
}

const MAX_EVENTS = 60;
const POLL_INTERVAL_MS = 20_000;

export function useSharedCounter() {
  const [value, setValue] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>(
    supabaseConfigured ? "loading" : "unconfigured",
  );
  const [pending, setPending] = useState(0);
  const [failedClicks, setFailedClicks] = useState<string[]>([]);
  const [clicks, setClicks] = useState<CountedClick[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const lastRevision = useRef<string>("");
  const eventSeq = useRef(0);
  const pendingRef = useRef(0);
  const failedRef = useRef<string[]>([]);
  const retryingRef = useRef(false);
  const rpcFailures = useRef(0);
  const hasLoaded = useRef(false);

  const applySnapshot = useCallback((snapshot: Snapshot) => {
    if (lastRevision.current && compareDecimal(snapshot.revision, lastRevision.current) <= 0) {
      return false;
    }
    lastRevision.current = snapshot.revision;
    setValue(snapshot.value);
    return true;
  }, []);

  const noteSuccess = useCallback(() => {
    rpcFailures.current = 0;
    hasLoaded.current = true;
    setStatus((current) => (current === "live" ? "live" : "syncing"));
  }, []);

  const noteFailure = useCallback(() => {
    rpcFailures.current += 1;
    if (!hasLoaded.current || rpcFailures.current >= 2) {
      setStatus("offline");
    } else {
      setStatus((current) => (current === "live" ? "live" : "syncing"));
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc("rennam_contador");
      if (error || !isSnapshot(data)) {
        noteFailure();
        return;
      }
      applySnapshot(data);
      noteSuccess();
    } catch {
      noteFailure();
    }
  }, [applySnapshot, noteFailure, noteSuccess]);

  const markFailed = useCallback((clickId: string) => {
    if (failedRef.current.includes(clickId)) return;
    failedRef.current = [...failedRef.current, clickId];
    setFailedClicks(failedRef.current);
  }, []);

  const clearFailed = useCallback((clickId: string) => {
    if (!failedRef.current.includes(clickId)) return;
    failedRef.current = failedRef.current.filter((id) => id !== clickId);
    setFailedClicks(failedRef.current);
  }, []);

  const increment = useCallback(
    async (clickId: string) => {
      if (!supabase) {
        setNotice("O placar global não está disponível agora. Tente mais tarde.");
        return;
      }

      pendingRef.current += 1;
      setPending(pendingRef.current);

      try {
        const { data, error } = await supabase.rpc("rennam_torar", { p_click_id: clickId });
        if (error || !isTorarResult(data)) {
          throw error ?? new Error("Invalid counter response");
        }

        applySnapshot(data);
        noteSuccess();
        clearFailed(clickId);
        setNotice(null);

        if (data.counted) {
          eventSeq.current += 1;
          const event: CountedClick = {
            id: eventSeq.current,
            value: data.value,
            revision: data.revision,
            clickId,
          };
          setClicks((current) => [...current.slice(-(MAX_EVENTS - 1)), event]);
        }
      } catch {
        markFailed(clickId);
        noteFailure();
        setNotice(
          "O servidor não confirmou o clique. Ele está guardado: tente de novo sem contar duas vezes.",
        );
      } finally {
        pendingRef.current = Math.max(0, pendingRef.current - 1);
        setPending(pendingRef.current);
      }
    },
    [applySnapshot, clearFailed, markFailed, noteFailure, noteSuccess],
  );

  const torar = useCallback(() => {
    void increment(makeClickId());
  }, [increment]);

  const retryFailed = useCallback(async () => {
    if (retryingRef.current || failedRef.current.length === 0) return;
    retryingRef.current = true;
    setRetrying(true);
    setNotice(null);

    const ids = [...failedRef.current];
    for (const id of ids) {
      await increment(id);
    }

    retryingRef.current = false;
    setRetrying(false);
  }, [increment]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  useEffect(() => {
    const client = supabase;
    if (!client || !supabaseConfigured) return;

    let disposed = false;
    let debounceTimer: number | undefined;

    const initialFetch = window.setTimeout(() => {
      if (!disposed) void refresh();
    }, 0);

    const channel = client
      .channel("rennam-counter")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rennam_counter" },
        () => {
          if (debounceTimer) window.clearTimeout(debounceTimer);
          debounceTimer = window.setTimeout(() => {
            void refresh();
          }, 120);
        },
      )
      .subscribe((channelStatus) => {
        if (disposed) return;
        if (channelStatus === "SUBSCRIBED") {
          setStatus("live");
          void refresh();
        } else if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT") {
          setStatus((current) => (current === "unconfigured" ? current : "syncing"));
        }
      });

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const handleOnline = () => void refresh();

    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", handleOnline);
    const pollTimer = window.setInterval(refreshWhenVisible, POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearTimeout(initialFetch);
      if (debounceTimer) window.clearTimeout(debounceTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("online", handleOnline);
      window.clearInterval(pollTimer);
      void client.removeChannel(channel);
    };
  }, [refresh]);

  return {
    value,
    status,
    pending,
    failedClicks,
    clicks,
    notice,
    retrying,
    torar,
    retryFailed,
    dismissNotice,
    refresh,
  };
}
