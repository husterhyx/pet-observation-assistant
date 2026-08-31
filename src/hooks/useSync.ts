import { useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";
import { isTauri } from "@tauri-apps/api/core";
import { useNativeSync } from "./useNativeSync";

function useWebSync() {
  const utils = trpc.useUtils();
  const statusQ = trpc.sync.status.useQuery(undefined, { refetchInterval: 30_000 });
  const runM = trpc.sync.run.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.sync.status.invalidate(),
        utils.pet.invalidate(),
      ]);
    },
    onError: () => utils.sync.status.invalidate(),
  });
  const configureM = trpc.sync.configure.useMutation({
    onSuccess: () => utils.sync.status.invalidate(),
  });
  const backgroundSyncing = useRef(false);
  const runMutation = runM.mutate;

  useEffect(() => {
    if (!statusQ.data?.configured) return;
    const run = () => {
      if (!navigator.onLine || backgroundSyncing.current) return;
      backgroundSyncing.current = true;
      runMutation(undefined, { onSettled: () => { backgroundSyncing.current = false; } });
    };
    const onVisible = () => document.visibilityState === "visible" && run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(run, 60_000);
    run();
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [statusQ.data?.configured, runMutation]);

  return {
    status: statusQ.data,
    isLoading: statusQ.isLoading,
    isSyncing: runM.isPending,
    configure: configureM.mutateAsync,
    run: runM.mutateAsync,
    configureError: configureM.error?.message ?? null,
    syncError: runM.error?.message ?? statusQ.data?.lastError ?? null,
  };
}

export const useSync = isTauri() ? useNativeSync : useWebSync;
