import { trpc } from "@/providers/trpc";
import { useRef } from "react";
import type { DailyPhoto, DogProfile, DogRecord, RecordType, StockLevel, SupplyItem } from "@/types";
import { isTauri } from "@tauri-apps/api/core";
import { useNativeDogData } from "./useNativeDogData";

const DEFAULT_PROFILE: DogProfile = {
  name: "", breed: "", birthday: "", homeDate: "", gender: "boy", neutered: "",
};

function useWebDogData() {
  const utils = trpc.useUtils();
  const syncTimer = useRef<number | null>(null);
  const recordsQ = trpc.pet.listRecords.useQuery();
  const profileQ = trpc.pet.getProfile.useQuery();
  const photosQ = trpc.pet.listPhotos.useQuery();
  const suppliesQ = trpc.pet.listSupplies.useQuery();
  const homeCardsQ = trpc.pet.getHomeCards.useQuery();

  const invalidate = {
    records: () => utils.pet.listRecords.invalidate(),
    profile: () => utils.pet.getProfile.invalidate(),
    photos: () => utils.pet.listPhotos.invalidate(),
    supplies: () => utils.pet.listSupplies.invalidate(),
  };

  const afterDataChanged = (refresh: () => Promise<unknown>) => async () => {
    await refresh();
    if (syncTimer.current !== null) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      void utils.client.sync.run.mutate().then(() => utils.pet.invalidate()).catch(() => undefined);
    }, 750);
  };

  const addRecordM = trpc.pet.addRecord.useMutation({ onSuccess: afterDataChanged(invalidate.records) });
  const removeRecordM = trpc.pet.removeRecord.useMutation({ onSuccess: afterDataChanged(invalidate.records) });
  const saveProfileM = trpc.pet.saveProfile.useMutation({ onSuccess: afterDataChanged(invalidate.profile) });
  const setPhotoM = trpc.pet.setPhoto.useMutation({ onSuccess: afterDataChanged(invalidate.photos) });
  const removePhotoM = trpc.pet.removePhoto.useMutation({ onSuccess: afterDataChanged(invalidate.photos) });
  const addSupplyM = trpc.pet.addSupply.useMutation({ onSuccess: afterDataChanged(invalidate.supplies) });
  const updateSupplyM = trpc.pet.updateSupply.useMutation({ onSuccess: afterDataChanged(invalidate.supplies) });
  const removeSupplyM = trpc.pet.removeSupply.useMutation({ onSuccess: afterDataChanged(invalidate.supplies) });
  const saveHomeCardsM = trpc.pet.saveHomeCards.useMutation({
    onSuccess: () => utils.pet.getHomeCards.invalidate(),
  });

  const records: DogRecord[] = (recordsQ.data ?? []).map((row) => ({
    ...row, type: row.type as RecordType,
  }));
  const profile: DogProfile = profileQ.data ?? DEFAULT_PROFILE;
  const photos: DailyPhoto[] = photosQ.data ?? [];
  const supplies: SupplyItem[] = (suppliesQ.data ?? []).map((row) => ({
    ...row, stock: row.stock as StockLevel,
  }));

  return {
    isLoading: recordsQ.isLoading || profileQ.isLoading || photosQ.isLoading || suppliesQ.isLoading || homeCardsQ.isLoading,
    records, profile, photos, supplies,
    homeCardTypes: homeCardsQ.data ?? [],
    setProfile: (value: DogProfile) => saveProfileM.mutate(value),
    addRecord: (value: Omit<DogRecord, "id">) => addRecordM.mutate(value),
    removeRecord: (id: string) => removeRecordM.mutate({ id }),
    setDailyPhoto: (date: string, photo: string, caption: string) =>
      setPhotoM.mutateAsync({ date, photo, caption }),
    removeDailyPhoto: (id: string) => removePhotoM.mutate({ id }),
    addSupply: (value: Omit<SupplyItem, "id" | "updatedAt">) => addSupplyM.mutate(value),
    updateSupply: (id: string, patch: Partial<SupplyItem>) =>
      updateSupplyM.mutate({ id, stock: patch.stock, note: patch.note }),
    removeSupply: (id: string) => removeSupplyM.mutate({ id }),
    setHomeCards: (types: Parameters<typeof saveHomeCardsM.mutateAsync>[0]) => saveHomeCardsM.mutateAsync(types),
  };
}

export const useDogData = isTauri() ? useNativeDogData : useWebDogData;
