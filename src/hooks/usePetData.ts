import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { trpc } from "@/providers/trpc";
import type {
  DailyPhoto,
  FamilyProfile,
  PetProfile,
  PetRecord,
  PetSpecies,
  RecordType,
  StockLevel,
  SupplyItem,
} from "@/types";
import { DEFAULT_FAMILY_PROFILE, type PetBackup } from "@contracts/backup";
import { useNativePetData } from "./useNativePetData";

export type HomeCardType = Exclude<RecordType, "feed" | "water" | "poop">;

function useWebPetData() {
  const [selectedPetId, setSelectedPetId] = useState<string>();
  const utils = trpc.useUtils();
  const petsQ = trpc.pet.listPets.useQuery({ includeArchived: true });
  const familyQ = trpc.pet.getFamilyProfile.useQuery();
  const recordsQ = trpc.pet.listRecords.useQuery(
    selectedPetId ? { petId: selectedPetId } : {},
    { placeholderData: previous => previous }
  );
  const photosQ = trpc.pet.listPhotos.useQuery(
    selectedPetId ? { petId: selectedPetId } : {},
    { placeholderData: previous => previous }
  );
  const suppliesQ = trpc.pet.listSupplies.useQuery(
    selectedPetId ? { petId: selectedPetId } : {},
    { placeholderData: previous => previous }
  );
  const activePets: PetProfile[] = (petsQ.data ?? []).filter(
    p => !p.archivedAt
  ) as PetProfile[];
  const selectedPet = activePets.find(p => p.id === selectedPetId);
  const cardSpecies: PetSpecies = selectedPet?.species ?? "dog";
  const cardsQ = trpc.pet.getHomeCards.useQuery(
    { species: cardSpecies },
    { placeholderData: previous => previous }
  );
  const invalidateAll = () => utils.pet.invalidate();
  const mutations = {
    createPet: trpc.pet.createPet.useMutation({ onSuccess: invalidateAll }),
    updatePet: trpc.pet.updatePet.useMutation({ onSuccess: invalidateAll }),
    archivePet: trpc.pet.archivePet.useMutation({ onSuccess: invalidateAll }),
    restorePet: trpc.pet.restorePet.useMutation({ onSuccess: invalidateAll }),
    deletePet: trpc.pet.deletePetPermanently.useMutation({
      onSuccess: invalidateAll,
    }),
    addRecord: trpc.pet.addRecord.useMutation({ onSuccess: invalidateAll }),
    removeRecord: trpc.pet.removeRecord.useMutation({
      onSuccess: invalidateAll,
    }),
    setPhoto: trpc.pet.setPhoto.useMutation({ onSuccess: invalidateAll }),
    removePhoto: trpc.pet.removePhoto.useMutation({ onSuccess: invalidateAll }),
    addSupply: trpc.pet.addSupply.useMutation({ onSuccess: invalidateAll }),
    updateSupply: trpc.pet.updateSupply.useMutation({
      onSuccess: invalidateAll,
    }),
    removeSupply: trpc.pet.removeSupply.useMutation({
      onSuccess: invalidateAll,
    }),
    saveCards: trpc.pet.saveHomeCards.useMutation({ onSuccess: invalidateAll }),
    saveFamilyProfile: trpc.pet.saveFamilyProfile.useMutation({
      onSuccess: profile =>
        utils.pet.getFamilyProfile.setData(undefined, profile),
    }),
    importBackup: trpc.pet.importBackup.useMutation({
      onSuccess: invalidateAll,
    }),
  };
  const records: PetRecord[] = (recordsQ.data ?? []).map(r => ({
    ...r,
    type: r.type as RecordType,
  }));
  const supplies: SupplyItem[] = (suppliesQ.data ?? []).map(s => ({
    ...s,
    stock: s.stock as StockLevel,
  }));
  return {
    isLoading:
      petsQ.isLoading ||
      familyQ.isLoading ||
      (!recordsQ.data && recordsQ.isLoading) ||
      (!photosQ.data && photosQ.isLoading) ||
      (!suppliesQ.data && suppliesQ.isLoading),
    isRefreshing:
      recordsQ.isFetching ||
      photosQ.isFetching ||
      suppliesQ.isFetching ||
      cardsQ.isFetching,
    pets: (petsQ.data ?? []) as PetProfile[],
    activePets,
    selectedPetId,
    selectedPet,
    setSelectedPetId,
    records,
    photos: (photosQ.data ?? []) as DailyPhoto[],
    supplies,
    homeCardTypes: (cardsQ.data ?? []) as HomeCardType[],
    familyProfile: (familyQ.data ?? DEFAULT_FAMILY_PROFILE) as FamilyProfile,
    cardSpecies,
    createPet: (p: Omit<PetProfile, "id" | "archivedAt">) =>
      mutations.createPet.mutateAsync(p),
    updatePet: (p: PetProfile) => mutations.updatePet.mutateAsync(p),
    archivePet: (id: string) =>
      mutations.archivePet
        .mutateAsync({ id })
        .then(() => setSelectedPetId(undefined)),
    restorePet: (id: string) => mutations.restorePet.mutateAsync({ id }),
    deletePet: (id: string) =>
      mutations.deletePet
        .mutateAsync({ id })
        .then(() => setSelectedPetId(undefined)),
    addRecord: (r: Omit<PetRecord, "id">) => mutations.addRecord.mutateAsync(r),
    removeRecord: (id: string) => mutations.removeRecord.mutateAsync({ id }),
    setDailyPhoto: (
      petId: string,
      date: string,
      photo: string,
      caption: string
    ) => mutations.setPhoto.mutateAsync({ petId, date, photo, caption }),
    removeDailyPhoto: (id: string) => mutations.removePhoto.mutateAsync({ id }),
    addSupply: (s: Omit<SupplyItem, "id" | "updatedAt">) =>
      mutations.addSupply.mutateAsync(s),
    updateSupply: (id: string, p: Partial<SupplyItem>) =>
      mutations.updateSupply.mutateAsync({
        id,
        petIds: p.petIds,
        stock: p.stock,
        note: p.note,
      }),
    removeSupply: (id: string) => mutations.removeSupply.mutateAsync({ id }),
    setHomeCards: (species: PetSpecies, types: HomeCardType[]) =>
      mutations.saveCards.mutateAsync({ species, types }),
    updateFamilyProfile: (profile: FamilyProfile) =>
      mutations.saveFamilyProfile.mutateAsync(profile),
    createBackup: () => utils.client.pet.exportBackup.query(),
    restoreBackup: (backup: PetBackup) =>
      mutations.importBackup.mutateAsync(backup),
  };
}

export const usePetData = isTauri() ? useNativePetData : useWebPetData;
