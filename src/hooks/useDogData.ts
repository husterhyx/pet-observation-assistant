import { useEffect, useRef } from 'react'
import { trpc } from '@/providers/trpc'
import { useLocalDogData } from './useLocalDogData'

export const STANDALONE = import.meta.env.VITE_STANDALONE === '1'

/** 独立版用本地存储，云端版用云数据库（构建时常量，二选一） */
export const useDogData: () => ReturnType<typeof useLocalDogData> = STANDALONE
  ? useLocalDogData
  : (useCloudDogData as unknown as typeof useLocalDogData)

import type {
  DailyPhoto, DogProfile, DogRecord, RecordType, StockLevel, SupplyItem,
} from '@/types'

const DEFAULT_PROFILE: DogProfile = {
  name: '',
  breed: '',
  birthday: '',
  homeDate: '',
  gender: 'boy',
  neutered: '',
}

const LEGACY_KEYS = {
  records: 'paw-diary.records',
  profile: 'paw-diary.profile',
  photos: 'paw-diary.daily-photos',
  supplies: 'paw-diary.supplies',
  migrated: 'paw-diary.migrated',
}

function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** 云端数据层：登录后所有数据存到云数据库，多端同步 */
export function useCloudDogData() {
  const utils = trpc.useUtils()

  const recordsQ = trpc.pet.listRecords.useQuery()
  const profileQ = trpc.pet.getProfile.useQuery()
  const photosQ = trpc.pet.listPhotos.useQuery()
  const suppliesQ = trpc.pet.listSupplies.useQuery()

  const allLoaded =
    recordsQ.isSuccess && profileQ.isSuccess && photosQ.isSuccess && suppliesQ.isSuccess

  const invalidate = {
    records: () => utils.pet.listRecords.invalidate(),
    profile: () => utils.pet.getProfile.invalidate(),
    photos: () => utils.pet.listPhotos.invalidate(),
    supplies: () => utils.pet.listSupplies.invalidate(),
  }

  const addRecordM = trpc.pet.addRecord.useMutation({ onSuccess: invalidate.records })
  const removeRecordM = trpc.pet.removeRecord.useMutation({ onSuccess: invalidate.records })
  const saveProfileM = trpc.pet.saveProfile.useMutation({ onSuccess: invalidate.profile })
  const setPhotoM = trpc.pet.setPhoto.useMutation({ onSuccess: invalidate.photos })
  const removePhotoM = trpc.pet.removePhoto.useMutation({ onSuccess: invalidate.photos })
  const addSupplyM = trpc.pet.addSupply.useMutation({ onSuccess: invalidate.supplies })
  const updateSupplyM = trpc.pet.updateSupply.useMutation({ onSuccess: invalidate.supplies })
  const removeSupplyM = trpc.pet.removeSupply.useMutation({ onSuccess: invalidate.supplies })

  /* ---------- 旧版本地数据一键迁移到云端（只执行一次） ---------- */
  const migrating = useRef(false)
  useEffect(() => {
    if (!allLoaded || migrating.current) return
    if (localStorage.getItem(LEGACY_KEYS.migrated)) return
    migrating.current = true
    localStorage.setItem(LEGACY_KEYS.migrated, '1')

    const localRecords = loadLocal<DogRecord[]>(LEGACY_KEYS.records, [])
    const localPhotos = loadLocal<DailyPhoto[]>(LEGACY_KEYS.photos, [])
    const localSupplies = loadLocal<SupplyItem[]>(LEGACY_KEYS.supplies, [])
    const localProfile = loadLocal<DogProfile | null>(LEGACY_KEYS.profile, null)

    const serverEmpty =
      (recordsQ.data?.length ?? 0) === 0 &&
      (photosQ.data?.length ?? 0) === 0 &&
      (suppliesQ.data?.length ?? 0) === 0 &&
      !profileQ.data

    const hasLocal =
      localRecords.length > 0 || localPhotos.length > 0 || localSupplies.length > 0 ||
      (localProfile && (localProfile.name || localProfile.birthday))

    if (!serverEmpty || !hasLocal) return

    ;(async () => {
      try {
        if (localProfile && (localProfile.name || localProfile.birthday)) {
          await saveProfileM.mutateAsync({
            name: localProfile.name ?? '',
            breed: localProfile.breed ?? '',
            birthday: localProfile.birthday ?? '',
            homeDate: localProfile.homeDate ?? '',
            gender: localProfile.gender ?? 'boy',
            neutered: localProfile.neutered ?? '',
            avatar: localProfile.avatar,
          })
        }
        for (const r of [...localRecords].reverse()) {
          await addRecordM.mutateAsync({
            type: r.type, title: r.title, note: r.note, time: r.time,
            value: r.value, photo: r.photo,
          })
        }
        for (const p of localPhotos) {
          await setPhotoM.mutateAsync({ date: p.date, photo: p.photo, caption: p.caption })
        }
        for (const s of localSupplies) {
          await addSupplyM.mutateAsync({
            name: s.name, brand: s.brand ?? '', variant: s.variant ?? '',
            category: s.category, stock: s.stock, photo: s.photo,
            produceDate: s.produceDate, shelfMonths: s.shelfMonths, note: s.note ?? '',
          })
        }
        Object.values(LEGACY_KEYS).forEach(k => localStorage.removeItem(k))
        localStorage.setItem(LEGACY_KEYS.migrated, '1')
        utils.pet.invalidate()
      } catch {
        localStorage.removeItem(LEGACY_KEYS.migrated)
      }
    })()
  }, [allLoaded, recordsQ.data, photosQ.data, suppliesQ.data, profileQ.data, utils, saveProfileM, addRecordM, setPhotoM, addSupplyM])

  /* ---------- 对外暴露与原来一致的接口 ---------- */
  const records: DogRecord[] = (recordsQ.data ?? []).map(r => ({
    ...r,
    type: r.type as RecordType,
  }))

  const profile: DogProfile = profileQ.data ?? DEFAULT_PROFILE

  const photos: DailyPhoto[] = photosQ.data ?? []

  const supplies: SupplyItem[] = (suppliesQ.data ?? []).map(s => ({
    ...s,
    stock: s.stock as StockLevel,
  }))

  return {
    isLoading: !allLoaded,
    records, profile, photos, supplies,
    setProfile: (p: DogProfile) => saveProfileM.mutate(p),
    addRecord: (r: Omit<DogRecord, 'id'>) => addRecordM.mutate(r),
    removeRecord: (id: string) => removeRecordM.mutate({ id }),
    setDailyPhoto: (date: string, photo: string, caption: string) =>
      setPhotoM.mutate({ date, photo, caption }),
    removeDailyPhoto: (id: string) => removePhotoM.mutate({ id }),
    addSupply: (s: Omit<SupplyItem, 'id' | 'updatedAt'>) => addSupplyM.mutate(s),
    updateSupply: (id: string, patch: Partial<SupplyItem>) =>
      updateSupplyM.mutate({ id, stock: patch.stock, note: patch.note }),
    removeSupply: (id: string) => removeSupplyM.mutate({ id }),
  }
}
