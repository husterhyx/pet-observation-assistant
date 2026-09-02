import { useCallback, useEffect, useMemo, useState } from "react";
import type { PetBackup } from "@contracts/backup";
import type { PetProfile, PetRecord, PetSpecies, SupplyItem } from "@/types";
import {
  addNativeRecord, addNativeSupply, archiveNativePet, createNativePet, deleteNativePet,
  exportNativeBackup, getNativeHomeCards, importNativeBackup, listNativePets, listNativePhotos,
  listNativeRecords, listNativeSupplies, removeNativePhoto, removeNativeRecord, removeNativeSupply,
  restoreNativePet, saveNativeHomeCards, setNativePhoto, updateNativePet, updateNativeSupply,
  type NativeHomeCardType,
} from "@/native/pet-data";

export function useNativePetData() {
  const [isLoading,setIsLoading]=useState(true); const [selectedPetId,setSelectedPetId]=useState<string>();
  const [pets,setPets]=useState<PetProfile[]>([]); const [records,setRecords]=useState<PetRecord[]>([]);
  const [photos,setPhotos]=useState<Awaited<ReturnType<typeof listNativePhotos>>>([]); const [supplies,setSupplies]=useState<SupplyItem[]>([]);
  const [homeCardTypes,setCards]=useState<NativeHomeCardType[]>([]);
  const activePets=useMemo(()=>pets.filter(p=>!p.archivedAt),[pets]); const selectedPet=activePets.find(p=>p.id===selectedPetId);
  const cardSpecies:PetSpecies=selectedPet?.species??"dog";
  const refresh=useCallback(async()=>{const [p,r,ph,s,c]=await Promise.all([listNativePets(true),listNativeRecords(selectedPetId),listNativePhotos(selectedPetId),listNativeSupplies(selectedPetId),getNativeHomeCards(cardSpecies)]);setPets(p);setRecords(r);setPhotos(ph);setSupplies(s);setCards(c);},[selectedPetId,cardSpecies]);
  useEffect(()=>{let active=true;const timer=window.setTimeout(()=>{void refresh().finally(()=>{if(active)setIsLoading(false)})},0);return()=>{active=false;window.clearTimeout(timer)}},[refresh]);
  const mutate=useCallback(async<T,>(fn:()=>Promise<T>)=>{const result=await fn();await refresh();return result},[refresh]);
  return {isLoading,pets,activePets,selectedPetId,selectedPet,setSelectedPetId,records,photos,supplies,homeCardTypes,cardSpecies,
    createPet:(p:Omit<PetProfile,"id"|"archivedAt">)=>mutate(()=>createNativePet(p)),updatePet:(p:PetProfile)=>mutate(()=>updateNativePet(p)),
    archivePet:(id:string)=>mutate(()=>archiveNativePet(id)).then(()=>setSelectedPetId(undefined)),restorePet:(id:string)=>mutate(()=>restoreNativePet(id)),deletePet:(id:string)=>mutate(()=>deleteNativePet(id)).then(()=>setSelectedPetId(undefined)),
    addRecord:(r:Omit<PetRecord,"id">)=>mutate(()=>addNativeRecord(r)),removeRecord:(id:string)=>mutate(()=>removeNativeRecord(id)),
    setDailyPhoto:(petId:string,date:string,photo:string,caption:string)=>mutate(()=>setNativePhoto(petId,date,photo,caption)),removeDailyPhoto:(id:string)=>mutate(()=>removeNativePhoto(id)),
    addSupply:(s:Omit<SupplyItem,"id"|"updatedAt">)=>mutate(()=>addNativeSupply(s)),updateSupply:(id:string,p:Partial<SupplyItem>)=>mutate(()=>updateNativeSupply(id,p)),removeSupply:(id:string)=>mutate(()=>removeNativeSupply(id)),
    setHomeCards:(species:PetSpecies,types:NativeHomeCardType[])=>mutate(()=>saveNativeHomeCards(species,types)),createBackup:exportNativeBackup,restoreBackup:(b:PetBackup)=>mutate(()=>importNativeBackup(b))};
}
