import { useCallback, useEffect, useState } from "react";
import type { DailyPhoto, DogProfile, DogRecord, SupplyItem } from "@/types";
import type { PetBackup } from "@contracts/backup";
import {
  addNativeRecord,
  addNativeSupply,
  getNativeHomeCards,
  getNativeProfile,
  listNativePhotos,
  listNativeRecords,
  listNativeSupplies,
  removeNativePhoto,
  removeNativeRecord,
  removeNativeSupply,
  saveNativeHomeCards,
  saveNativeProfile,
  setNativePhoto,
  updateNativeSupply,
  exportNativeBackup,
  importNativeBackup,
  type NativeHomeCardType,
} from "@/native/dog-data";

const DEFAULT_PROFILE: DogProfile = {
  name: "", breed: "", birthday: "", homeDate: "", gender: "boy", neutered: "",
};

export function useNativeDogData() {
  const [isLoading, setIsLoading] = useState(true);
  const [records, setRecords] = useState<DogRecord[]>([]);
  const [profile, setProfileState] = useState<DogProfile>(DEFAULT_PROFILE);
  const [photos, setPhotos] = useState<DailyPhoto[]>([]);
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [homeCardTypes, setHomeCardTypes] = useState<NativeHomeCardType[]>([]);

  const refresh = useCallback(async () => {
    const [nextRecords, nextProfile, nextPhotos, nextSupplies, nextHomeCards] = await Promise.all([
      listNativeRecords(),
      getNativeProfile(),
      listNativePhotos(),
      listNativeSupplies(),
      getNativeHomeCards(),
    ]);
    setRecords(nextRecords);
    setProfileState(nextProfile ?? DEFAULT_PROFILE);
    setPhotos(nextPhotos);
    setSupplies(nextSupplies);
    setHomeCardTypes(nextHomeCards);
  }, []);

  useEffect(() => {
    let active = true;
    const initialLoad = window.setTimeout(() => {
      void refresh().finally(() => { if (active) setIsLoading(false); });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(initialLoad);
    };
  }, [refresh]);

  const mutate = useCallback(async (operation: () => Promise<unknown>) => {
    await operation();
    await refresh();
  }, [refresh]);

  return {
    isLoading,
    records,
    profile,
    photos,
    supplies,
    homeCardTypes,
    setProfile: (value: DogProfile) => { void mutate(() => saveNativeProfile(value)); },
    addRecord: (value: Omit<DogRecord, "id">) => { void mutate(() => addNativeRecord(value)); },
    removeRecord: (id: string) => { void mutate(() => removeNativeRecord(id)); },
    setDailyPhoto: (date: string, photo: string, caption: string) =>
      mutate(() => setNativePhoto(date, photo, caption)).then(() => undefined),
    removeDailyPhoto: (id: string) => { void mutate(() => removeNativePhoto(id)); },
    addSupply: (value: Omit<SupplyItem, "id" | "updatedAt">) => { void mutate(() => addNativeSupply(value)); },
    updateSupply: (id: string, patch: Partial<SupplyItem>) => { void mutate(() => updateNativeSupply(id, patch)); },
    removeSupply: (id: string) => { void mutate(() => removeNativeSupply(id)); },
    setHomeCards: (types: NativeHomeCardType[]) =>
      mutate(() => saveNativeHomeCards(types)).then(() => undefined),
    createBackup: exportNativeBackup,
    restoreBackup: (backup: PetBackup) => mutate(() => importNativeBackup(backup)),
  };
}
