import { useCallback, useEffect, useState } from 'react'
import type { DailyPhoto, DogProfile, DogRecord, SupplyItem } from '@/types'

const RECORDS_KEY = 'paw-diary.records'
const PROFILE_KEY = 'paw-diary.profile'
const PHOTOS_KEY = 'paw-diary.daily-photos'
const SUPPLIES_KEY = 'paw-diary.supplies'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

const DEFAULT_PROFILE: DogProfile = {
  name: '',
  breed: '',
  birthday: '',
  gender: 'boy',
}

export function useDogData() {
  const [records, setRecords] = useState<DogRecord[]>(() => load(RECORDS_KEY, []))
  const [profile, setProfile] = useState<DogProfile>(() => load(PROFILE_KEY, DEFAULT_PROFILE))
  const [photos, setPhotos] = useState<DailyPhoto[]>(() => load(PHOTOS_KEY, []))
  const [supplies, setSupplies] = useState<SupplyItem[]>(() => load(SUPPLIES_KEY, []))

  useEffect(() => { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)) }, [records])
  useEffect(() => { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)) }, [profile])
  useEffect(() => { localStorage.setItem(PHOTOS_KEY, JSON.stringify(photos)) }, [photos])
  useEffect(() => { localStorage.setItem(SUPPLIES_KEY, JSON.stringify(supplies)) }, [supplies])

  const addRecord = useCallback((r: Omit<DogRecord, 'id'>) => {
    setRecords(prev =>
      [{ ...r, id: crypto.randomUUID() }, ...prev].sort((a, b) => +new Date(b.time) - +new Date(a.time))
    )
  }, [])

  const removeRecord = useCallback((id: string) => {
    setRecords(prev => prev.filter(r => r.id !== id))
  }, [])

  // 每日一萌：同一天只保留一张，重复上传即替换
  const setDailyPhoto = useCallback((date: string, photo: string, caption: string) => {
    setPhotos(prev => {
      const rest = prev.filter(p => p.date !== date)
      return [{ id: crypto.randomUUID(), date, photo, caption }, ...rest]
        .sort((a, b) => b.date.localeCompare(a.date))
    })
  }, [])

  const removeDailyPhoto = useCallback((id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id))
  }, [])

  const addSupply = useCallback((s: Omit<SupplyItem, 'id' | 'updatedAt'>) => {
    setSupplies(prev => [{ ...s, id: crypto.randomUUID(), updatedAt: new Date().toISOString() }, ...prev])
  }, [])

  const updateSupply = useCallback((id: string, patch: Partial<SupplyItem>) => {
    setSupplies(prev =>
      prev.map(s => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s))
    )
  }, [])

  const removeSupply = useCallback((id: string) => {
    setSupplies(prev => prev.filter(s => s.id !== id))
  }, [])

  return {
    records, profile, photos, supplies,
    setProfile, addRecord, removeRecord,
    setDailyPhoto, removeDailyPhoto,
    addSupply, updateSupply, removeSupply,
  }
}
