import { useCallback, useEffect, useState } from 'react'
import type { DogProfile, DogRecord } from '@/types'

const RECORDS_KEY = 'paw-diary.records'
const PROFILE_KEY = 'paw-diary.profile'

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

  useEffect(() => {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records))
  }, [records])

  useEffect(() => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  }, [profile])

  const addRecord = useCallback((r: Omit<DogRecord, 'id'>) => {
    setRecords(prev => {
      const next = [{ ...r, id: crypto.randomUUID() }, ...prev]
      return next.sort((a, b) => +new Date(b.time) - +new Date(a.time))
    })
  }, [])

  const removeRecord = useCallback((id: string) => {
    setRecords(prev => prev.filter(r => r.id !== id))
  }, [])

  return { records, profile, setProfile, addRecord, removeRecord }
}
