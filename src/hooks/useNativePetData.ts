import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_FAMILY_PROFILE, type PetBackup } from "@contracts/backup";
import type {
  FamilyProfile,
  PetProfile,
  PetRecord,
  PetSpecies,
  SupplyItem,
} from "@/types";
import {
  addNativeRecord,
  addNativeSupply,
  archiveNativePet,
  createNativePet,
  deleteNativePet,
  exportNativeBackup,
  getNativeFamilyProfile,
  getNativeHomeCards,
  importNativeBackup,
  listNativePets,
  listNativePhotos,
  listNativeRecords,
  listNativeSupplies,
  removeNativePhoto,
  removeNativeRecord,
  removeNativeSupply,
  restoreNativePet,
  saveNativeHomeCards,
  saveNativeFamilyProfile,
  setNativePhoto,
  updateNativePet,
  updateNativeSupply,
  type NativeHomeCardType,
} from "@/native/pet-data";

export function useNativePetData() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState<string>();
  const [pets, setPets] = useState<PetProfile[]>([]);
  const [records, setRecords] = useState<PetRecord[]>([]);
  const [photos, setPhotos] = useState<
    Awaited<ReturnType<typeof listNativePhotos>>
  >([]);
  const [supplies, setSupplies] = useState<SupplyItem[]>([]);
  const [homeCardTypes, setCards] = useState<NativeHomeCardType[]>([]);
  const [familyProfile, setFamilyProfile] = useState<FamilyProfile>(
    DEFAULT_FAMILY_PROFILE
  );
  const activePets = useMemo(() => pets.filter(p => !p.archivedAt), [pets]);
  const selectedPet = activePets.find(p => p.id === selectedPetId);
  const cardSpecies: PetSpecies = selectedPet?.species ?? "dog";
  const refreshRequest = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current;
    setIsRefreshing(true);
    try {
      const [p, r, ph, s, c, family] = await Promise.all([
        listNativePets(true),
        listNativeRecords(selectedPetId),
        listNativePhotos(selectedPetId),
        listNativeSupplies(selectedPetId),
        getNativeHomeCards(cardSpecies),
        getNativeFamilyProfile(),
      ]);
      if (request !== refreshRequest.current) return;
      setPets(p);
      setRecords(r);
      setPhotos(ph);
      setSupplies(s);
      setCards(c);
      setFamilyProfile(family);
    } finally {
      if (request === refreshRequest.current) setIsRefreshing(false);
    }
  }, [selectedPetId, cardSpecies]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void refresh().finally(() => {
        if (active) setIsLoading(false);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
      refreshRequest.current += 1;
    };
  }, [refresh]);
  const mutate = useCallback(
    async <T>(fn: () => Promise<T>) => {
      const result = await fn();
      await refresh();
      return result;
    },
    [refresh]
  );
  return {
    isLoading,
    isRefreshing,
    pets,
    activePets,
    selectedPetId,
    selectedPet,
    setSelectedPetId,
    records,
    photos,
    supplies,
    homeCardTypes,
    familyProfile,
    cardSpecies,
    createPet: (p: Omit<PetProfile, "id" | "archivedAt">) =>
      mutate(() => createNativePet(p)),
    updatePet: (p: PetProfile) => mutate(() => updateNativePet(p)),
    archivePet: (id: string) =>
      mutate(() => archiveNativePet(id)).then(() =>
        setSelectedPetId(undefined)
      ),
    restorePet: (id: string) => mutate(() => restoreNativePet(id)),
    deletePet: (id: string) =>
      mutate(() => deleteNativePet(id)).then(() => setSelectedPetId(undefined)),
    addRecord: (r: Omit<PetRecord, "id">) => mutate(() => addNativeRecord(r)),
    removeRecord: (id: string) => mutate(() => removeNativeRecord(id)),
    setDailyPhoto: (
      petId: string,
      date: string,
      photo: string,
      caption: string
    ) => mutate(() => setNativePhoto(petId, date, photo, caption)),
    removeDailyPhoto: (id: string) => mutate(() => removeNativePhoto(id)),
    addSupply: (s: Omit<SupplyItem, "id" | "updatedAt">) =>
      mutate(() => addNativeSupply(s)),
    updateSupply: (id: string, p: Partial<SupplyItem>) =>
      mutate(() => updateNativeSupply(id, p)),
    removeSupply: (id: string) => mutate(() => removeNativeSupply(id)),
    setHomeCards: (species: PetSpecies, types: NativeHomeCardType[]) =>
      mutate(() => saveNativeHomeCards(species, types)),
    updateFamilyProfile: async (profile: FamilyProfile) => {
      const saved = await saveNativeFamilyProfile(profile);
      setFamilyProfile(saved);
      return saved;
    },
    createBackup: exportNativeBackup,
    restoreBackup: (b: PetBackup) => mutate(() => importNativeBackup(b)),
  };
}
