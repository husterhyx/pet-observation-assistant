import { useCallback, useEffect, useRef, useState } from "react";
import {
  configureNativeSync,
  getNativeSyncStatus,
  runNativeSync,
  type NativeSyncStatus,
} from "@/native/sync";

export function useNativeSync() {
  const [status, setStatus] = useState<NativeSyncStatus>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [configureError, setConfigureError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const active = useRef(false);
  const debounceTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const next = await getNativeSyncStatus();
    setStatus(next);
    return next;
  }, []);

  const run = useCallback(async () => {
    if (active.current) return getNativeSyncStatus();
    active.current = true;
    setIsSyncing(true);
    setMutationError(null);
    try {
      const next = await runNativeSync();
      setStatus(next);
      window.dispatchEvent(new Event("pet-native-synced"));
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步失败";
      setMutationError(message);
      await refresh();
      throw error;
    } finally {
      active.current = false;
      setIsSyncing(false);
    }
  }, [refresh]);

  useEffect(() => {
    let mounted = true;
    void refresh().then(next => {
      if (mounted && next.configured && navigator.onLine) void run().catch(() => undefined);
    }).finally(() => { if (mounted) setIsLoading(false); });

    const onOnline = () => { if (status?.configured) void run().catch(() => undefined); };
    const onVisible = () => {
      if (document.visibilityState === "visible" && status?.configured && navigator.onLine) {
        void run().catch(() => undefined);
      }
    };
    const onDataChanged = () => {
      if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current);
      debounceTimer.current = window.setTimeout(() => {
        if (navigator.onLine) void run().catch(() => undefined);
      }, 750);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("pet-native-data-changed", onDataChanged);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => {
      if (status?.configured && navigator.onLine) void run().catch(() => undefined);
    }, 60_000);
    return () => {
      mounted = false;
      if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current);
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pet-native-data-changed", onDataChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, run, status?.configured]);

  const configure = useCallback(async (input: { serverUrl: string; apiKey?: string }) => {
    setConfigureError(null);
    try {
      const next = await configureNativeSync(input.serverUrl, input.apiKey);
      setStatus(next);
      return next;
    } catch (error) {
      setConfigureError(error instanceof Error ? error.message : "保存失败");
      throw error;
    }
  }, []);

  return {
    status,
    isLoading,
    isSyncing,
    configure,
    run,
    configureError,
    syncError: mutationError ?? status?.lastError ?? null,
  };
}

