import { useMemo, useRef, useState } from 'react'
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Bone, Droplets, Footprints, Bath, Scissors, Bean, Scale, Syringe, Bug,
  HeartPulse, Stethoscope, Pill, Smile, NotebookPen, Flag, Plus, Trash2,
  Camera, X, Dog, Cake, Pencil, PawPrint, Package, ShoppingCart, AlarmClock, Zap,
  Cloud, RefreshCw, Server, CheckCircle2, AlertCircle, ImagePlus, SlidersHorizontal,
  GripVertical,
} from 'lucide-react'
import { useDogData } from '@/hooks/useDogData'
import { useSync } from '@/hooks/useSync'
import {
  RECORD_TYPE_META, RECORD_GROUPS, SUPPLY_CATEGORIES, STOCK_META, expiryInfo,
  type DailyPhoto, type DogProfile, type DogRecord, type RecordType,
  type StockLevel, type SupplyItem,
} from '@/types'

const TYPE_ICON: Record<RecordType, typeof Bone> = {
  feed: Bone,
  water: Droplets,
  walk: Footprints,
  weight: Scale,
  bath: Bath,
  groom: Scissors,
  poop: Bean,
  vaccine: Syringe,
  deworm: Bug,
  checkup: HeartPulse,
  vet: Stethoscope,
  meds: Pill,
  mood: Smile,
  note: NotebookPen,
  milestone: Flag,
}

const TYPE_COLOR: Record<RecordType, string> = {
  feed: 'bg-[#F4A261]/15 text-[#C76E2B]',
  water: 'bg-[#A8DADC]/40 text-[#2A7F83]',
  walk: 'bg-[#A8DADC]/40 text-[#2A7F83]',
  weight: 'bg-[#E9C46A]/25 text-[#9A7B1E]',
  bath: 'bg-[#A8DADC]/40 text-[#2A7F83]',
  groom: 'bg-[#A8DADC]/40 text-[#2A7F83]',
  poop: 'bg-[#F4A261]/15 text-[#C76E2B]',
  vaccine: 'bg-[#F4A261]/15 text-[#C76E2B]',
  deworm: 'bg-[#A8DADC]/40 text-[#2A7F83]',
  checkup: 'bg-[#A8DADC]/40 text-[#2A7F83]',
  vet: 'bg-[#E76F51]/15 text-[#C0452B]',
  meds: 'bg-[#E76F51]/15 text-[#C0452B]',
  mood: 'bg-[#E9C46A]/25 text-[#9A7B1E]',
  note: 'bg-[#264653]/10 text-[#264653]',
  milestone: 'bg-[#E9C46A]/30 text-[#9A7B1E]',
}

/** 一键打卡：点一下立刻记一条 */
const QUICK_TYPES: RecordType[] = ['feed', 'water', 'walk', 'poop']
type HomeCardType = Exclude<RecordType, 'feed' | 'water' | 'poop'>

/** 需要填写详情才能形成有效统计的记录入口 */
const HOME_CARD_OPTIONS: { type: HomeCardType; label: string }[] = [
  { type: 'walk', label: '遛弯时长' },
  { type: 'weight', label: '体重趋势' },
  { type: 'bath', label: '洗澡' },
  { type: 'groom', label: '美容' },
  { type: 'deworm', label: '驱虫' },
  { type: 'vaccine', label: '疫苗' },
  { type: 'checkup', label: '体检' },
  { type: 'vet', label: '就医' },
  { type: 'meds', label: '用药' },
  { type: 'mood', label: '心情' },
  { type: 'note', label: '随手记' },
  { type: 'milestone', label: '大事件' },
]

function homeCardOption(type: HomeCardType) {
  return HOME_CARD_OPTIONS.find(option => option.type === type)!
}

type Tab = 'diary' | 'photos' | 'supplies' | 'me'

function fmtDate(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date(today)
  yest.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (sameDay(d, today)) return { label: '今天', time }
  if (sameDay(d, yest)) return { label: '昨天', time }
  return { label: `${d.getMonth() + 1}月${d.getDate()}日`, time }
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function calcAge(birthday: string) {
  if (!birthday) return ''
  const b = new Date(birthday)
  const now = new Date()
  let months = (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth()
  if (now.getDate() < b.getDate()) months -= 1
  if (months < 0) return ''
  if (months < 12) return `${months} 个月大`
  return `${Math.floor(months / 12)} 岁${months % 12 ? ` ${months % 12} 个月` : ''}`
}

function daysTogether(homeDate: string) {
  if (!homeDate) return ''
  const days = Math.floor((+new Date(new Date().toDateString()) - +new Date(homeDate)) / 86400000)
  return days >= 0 ? `相伴第 ${days + 1} 天` : ''
}

function readImage(f: File | undefined, cb: (dataUrl: string) => void, onError?: () => void) {
  if (!f) return
  const image = new Image()
  const objectUrl = URL.createObjectURL(f)
  image.onload = () => {
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(objectUrl)
    cb(canvas.toDataURL('image/jpeg', 0.82))
  }
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl)
    onError?.()
  }
  image.src = objectUrl
}

export default function Home() {
  return <MainApp />
}

function Splash({ text }: { text: string }) {
  return (
    <div className="min-h-dvh bg-[#F5F0E1] flex flex-col items-center justify-center gap-3 text-[#264653]/60">
      <PawPrint size={40} className="text-[#F4A261] animate-pulse" />
      <p className="text-sm">{text}</p>
    </div>
  )
}

function MainApp() {
  const data = useDogData()
  const sync = useSync()
  const [tab, setTab] = useState<Tab>('diary')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetType, setSheetType] = useState<RecordType>('feed')
  const [cardsEditorOpen, setCardsEditorOpen] = useState(false)

  const openRecordSheet = (type: RecordType = 'feed') => {
    setSheetType(type)
    setSheetOpen(true)
  }

  if (data.isLoading) return <Splash text="正在打开本地数据…" />

  return (
    <div className="min-h-dvh bg-[#F5F0E1] text-[#264653] flex justify-center">
      <div className="w-full max-w-md relative pb-28">
        <Header profile={data.profile} recordCount={data.records.length} />

        {tab === 'diary' && (
          <>
            <QuickRecord
              onQuick={t => data.addRecord({
                type: t,
                title: RECORD_TYPE_META[t].label,
                note: '',
                time: new Date().toISOString(),
              })}
              onDetailed={openRecordSheet}
              cards={data.homeCardTypes}
              onEditCards={() => setCardsEditorOpen(true)}
            />
            <Timeline records={data.records} onDelete={data.removeRecord} />
          </>
        )}
        {tab === 'photos' && (
          <DailyPhotos
            photos={data.photos}
            dogName={data.profile.name}
            onSave={data.setDailyPhoto}
            onDelete={data.removeDailyPhoto}
          />
        )}
        {tab === 'supplies' && (
          <Supplies
            supplies={data.supplies}
            onAdd={data.addSupply}
            onUpdate={data.updateSupply}
            onDelete={data.removeSupply}
          />
        )}
        {tab === 'me' && (
          <>
            <ProfilePage profile={data.profile} onSave={data.setProfile} />
            <div className="px-5 mt-8 mb-2 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#264653]/10" />
              <span className="text-xs text-[#264653]/40">统计</span>
              <div className="h-px flex-1 bg-[#264653]/10" />
            </div>
            <Stats records={data.records} onAddRecord={openRecordSheet} />
            <SyncSettings sync={sync} />
          </>
        )}

        {/* 底部导航：日记 · 每日一萌 · ➕ · 物品 · 我的 */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-[#FFFDF6]/95 backdrop-blur border-t border-[#264653]/10 z-20">
          <div className="grid grid-cols-5 items-center h-16">
            <NavItem active={tab === 'diary'} onClick={() => setTab('diary')} label="日记" icon={NotebookPen} />
            <NavItem active={tab === 'photos'} onClick={() => setTab('photos')} label="每日一萌" icon={PawPrint} />
            <button
              onClick={() => openRecordSheet()}
              className="justify-self-center -mt-8 w-14 h-14 rounded-full bg-[#F4A261] text-white shadow-lg shadow-[#F4A261]/40 flex items-center justify-center active:scale-95 transition"
              aria-label="记一笔"
            >
              <Plus size={28} strokeWidth={2.5} />
            </button>
            <NavItem active={tab === 'supplies'} onClick={() => setTab('supplies')} label="物品" icon={Package} />
            <NavItem active={tab === 'me'} onClick={() => setTab('me')} label="我的" icon={Dog} />
          </div>
        </nav>

        {sheetOpen && (
          <AddSheet
            initialType={sheetType}
            defaultName={data.profile.name}
            onClose={() => setSheetOpen(false)}
            onSubmit={r => { data.addRecord(r); setSheetOpen(false); setTab('diary') }}
          />
        )}
        {cardsEditorOpen && (
          <HomeCardsEditor
            selected={data.homeCardTypes}
            onClose={() => setCardsEditorOpen(false)}
            onSave={async types => {
              await data.setHomeCards(types)
              setCardsEditorOpen(false)
            }}
          />
        )}
      </div>
    </div>
  )
}

function NavItem({ active, onClick, label, icon: Icon }: {
  active: boolean; onClick: () => void; label: string; icon: typeof Bone
}) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-0.5 py-2 ${active ? 'text-[#F4A261]' : 'text-[#264653]/50'}`}>
      <Icon size={20} />
      <span className="text-[11px]">{label}</span>
    </button>
  )
}

function Header({ profile, recordCount }: { profile: DogProfile; recordCount: number }) {
  return (
    <header className="px-5 pt-8 pb-4 flex items-center gap-4">
      <div className="w-14 h-14 rounded-full bg-[#E8DCC4] flex items-center justify-center overflow-hidden shrink-0">
        {profile.avatar
          ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
          : <Dog size={26} className="text-[#264653]/60" />}
      </div>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-wide truncate">
          {profile.name ? `${profile.name}的小日子` : '小狗的小日子'}
        </h1>
        <p className="text-sm text-[#264653]/60 mt-0.5">
          {[
            profile.birthday && calcAge(profile.birthday),
            profile.breed || null,
            profile.homeDate ? daysTogether(profile.homeDate) : null,
            recordCount ? `已记录 ${recordCount} 条` : null,
          ].filter(Boolean).join(' · ') || '开始记录它的每一天吧'}
        </p>
      </div>
    </header>
  )
}

/* ---------------- 一键打卡 ---------------- */

function QuickRecord({ onQuick, onDetailed, cards, onEditCards }: {
  onQuick: (t: RecordType) => void
  onDetailed: (t: RecordType) => void
  cards: HomeCardType[]
  onEditCards: () => void
}) {
  const [done, setDone] = useState<RecordType | null>(null)
  return (
    <section className="px-5 mb-5">
      <div className="bg-[#FFFDF6] rounded-3xl p-4 shadow-sm shadow-[#264653]/5">
        <h2 className="text-xs font-semibold text-[#264653]/50 flex items-center gap-1 mb-2.5">
          <Zap size={12} className="text-[#F4A261]" /> 一键打卡
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_TYPES.map(t => {
            const Icon = TYPE_ICON[t]
            const justDone = done === t
            return (
              <button
                key={t}
                onClick={() => {
                  onQuick(t)
                  setDone(t)
                  setTimeout(() => setDone(d => (d === t ? null : d)), 1200)
                }}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-2xl text-xs transition active:scale-95 ${
                  justDone ? 'bg-[#F4A261] text-white font-semibold' : `${TYPE_COLOR[t]}`
                }`}
              >
                <Icon size={20} />
                {justDone ? '已记下✓' : RECORD_TYPE_META[t].label}
              </button>
            )
          })}
        </div>
        <div className="h-px bg-[#264653]/8 my-3" />
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-semibold text-[#264653]/50">健康与成长</h3>
          <button
            type="button"
            onClick={onEditCards}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#C76E2B] px-2 py-1 rounded-full bg-[#F4A261]/12"
          >
            <SlidersHorizontal size={12} /> 编辑
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {cards.map(type => {
            const { label } = homeCardOption(type)
            const Icon = TYPE_ICON[type]
            return (
              <button
                key={label}
                onClick={() => onDetailed(type)}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-xs bg-[#F5F0E1] text-[#264653]/75 transition active:scale-95"
              >
                <Icon size={16} className={TYPE_COLOR[type].split(' ')[1]} />
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ---------------- 日记时间线 ---------------- */

function Timeline({ records, onDelete }: { records: DogRecord[]; onDelete: (id: string) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, DogRecord[]>()
    for (const r of records) {
      const { label } = fmtDate(r.time)
      const arr = map.get(label) ?? []
      arr.push(r)
      map.set(label, arr)
    }
    return [...map.entries()]
  }, [records])

  if (records.length === 0) {
    return (
      <div className="px-5 pt-16 text-center text-[#264653]/50">
        <Dog size={48} className="mx-auto mb-4 opacity-40" />
        <p className="font-medium">还没有记录</p>
        <p className="text-sm mt-1">点击下方橙色按钮，记下它的第一件事吧</p>
      </div>
    )
  }

  return (
    <div className="px-5 space-y-6">
      {groups.map(([label, list]) => (
        <section key={label}>
          <h2 className="text-sm font-semibold text-[#264653]/50 mb-2">{label}</h2>
          <div className="space-y-3">
            {list.map(r => <RecordCard key={r.id} record={r} onDelete={() => onDelete(r.id)} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

function RecordCard({ record, onDelete }: { record: DogRecord; onDelete: () => void }) {
  const Icon = TYPE_ICON[record.type]
  const meta = RECORD_TYPE_META[record.type]
  const { time } = fmtDate(record.time)
  const isMilestone = record.type === 'milestone'
  return (
    <article className={`rounded-3xl p-4 shadow-sm shadow-[#264653]/5 ${
      isMilestone ? 'bg-[#E9C46A]/20 border border-[#E9C46A]/60' : 'bg-[#FFFDF6]'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${TYPE_COLOR[record.type]}`}>
          <Icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold">
              {meta.label}
              {record.value != null && (
                <span className="ml-2 text-[#F4A261] font-bold">{record.value}{meta.unit ?? ''}</span>
              )}
            </h3>
            <span className="text-xs text-[#264653]/40 shrink-0">{time}</span>
          </div>
          {record.note && <p className="text-sm text-[#264653]/75 mt-1 whitespace-pre-wrap break-words">{record.note}</p>}
          {record.photo && (
            <img src={record.photo} alt="" className="mt-2 rounded-2xl max-h-56 object-cover w-full" />
          )}
        </div>
        <button onClick={onDelete} className="text-[#264653]/25 hover:text-[#E76F51] transition shrink-0 mt-1" aria-label="删除">
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  )
}

/* ---------------- 记一笔（底部弹层，分类分组） ---------------- */

function AddSheet({ initialType, defaultName, onClose, onSubmit }: {
  initialType?: RecordType
  defaultName: string
  onClose: () => void
  onSubmit: (r: Omit<DogRecord, 'id'>) => void
}) {
  const [type, setType] = useState<RecordType>(initialType ?? 'feed')
  const [note, setNote] = useState('')
  const [value, setValue] = useState('')
  const [time, setTime] = useState(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  })
  const [photo, setPhoto] = useState<string | undefined>()
  const fileRef = useRef<HTMLInputElement>(null)
  const meta = RECORD_TYPE_META[type]

  const submit = () => {
    onSubmit({
      type,
      title: meta.label,
      note: note.trim(),
      time: new Date(time).toISOString(),
      value: meta.unit && value ? Number(value) : undefined,
      photo,
    })
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-[#264653]/40" />
      <div
        className="relative w-full max-w-md bg-[#FFFDF6] rounded-t-[2rem] p-5 pb-8 max-h-[88dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">记一笔{defaultName ? ` · ${defaultName}` : ''}</h2>
          <button onClick={onClose} className="text-[#264653]/40" aria-label="关闭"><X size={22} /></button>
        </div>

        {/* 分组选择记录类型 */}
        <div className="space-y-3 mb-4">
          {RECORD_GROUPS.map(g => (
            <div key={g.name}>
              <p className="text-xs text-[#264653]/45 mb-1.5">{g.name}</p>
              <div className="grid grid-cols-4 gap-2">
                {g.types.map(t => {
                  const Icon = TYPE_ICON[t]
                  const active = t === type
                  return (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-2xl text-xs transition ${
                        active ? 'bg-[#F4A261] text-white font-semibold' : 'bg-[#F5F0E1] text-[#264653]/70'
                      }`}
                    >
                      <Icon size={20} />
                      {RECORD_TYPE_META[t].label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-[#264653]/50">时间</span>
            <input
              type="datetime-local"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="mt-1 w-full bg-[#F5F0E1] rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-[#F4A261]/40"
            />
          </label>

          {meta.unit && (
            <label className="block">
              <span className="text-xs text-[#264653]/50">数值（{meta.unit}）</span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={`多少 ${meta.unit}？`}
                className="mt-1 w-full bg-[#F5F0E1] rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-[#F4A261]/40"
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs text-[#264653]/50">备注</span>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={meta.placeholder}
              rows={3}
              className="mt-1 w-full bg-[#F5F0E1] rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-[#F4A261]/40 resize-none"
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-sm text-[#264653]/60 bg-[#F5F0E1] rounded-2xl px-4 py-2.5"
            >
              <Camera size={16} /> {photo ? '换一张' : '加照片'}
            </button>
            {photo && <img src={photo} alt="" className="h-12 w-12 rounded-xl object-cover" />}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => readImage(e.target.files?.[0], setPhoto)} />
          </div>

          <button
            onClick={submit}
            className="w-full bg-[#F4A261] text-white font-bold rounded-2xl py-3.5 active:scale-[0.98] transition"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 每日一萌 ---------------- */

function DailyPhotos({ photos, dogName, onSave, onDelete }: {
  photos: DailyPhoto[]
  dogName: string
  onSave: (date: string, photo: string, caption: string) => Promise<void>
  onDelete: (id: string) => void
}) {
  const today = todayKey()
  const todayPhoto = photos.find(p => p.date === today)
  const past = photos.filter(p => p.date !== today)
  const [draft, setDraft] = useState<string | undefined>()
  const [caption, setCaption] = useState('')
  const [editing, setEditing] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const busy = preparing || saving

  const startEdit = () => {
    setDraft(todayPhoto?.photo)
    setCaption(todayPhoto?.caption ?? '')
    setEditing(true)
  }

  const savePhoto = async () => {
    if (!draft || busy) return
    setSaving(true)
    setSaveError('')
    try {
      await Promise.all([
        onSave(today, draft, caption.trim()),
        new Promise(resolve => window.setTimeout(resolve, 500)),
      ])
      setEditing(false)
      setDraft(undefined)
      setCaption('')
    } catch {
      setSaveError('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const preparePhoto = (file: File | undefined) => {
    if (!file || busy) return
    const startedAt = Date.now()
    setPreparing(true)
    setSaveError('')
    readImage(file, photo => {
      window.setTimeout(() => {
        setDraft(photo)
        setPreparing(false)
      }, Math.max(0, 500 - (Date.now() - startedAt)))
    }, () => {
      setPreparing(false)
      setSaveError('无法读取这张照片，请重新选择')
    })
  }

  return (
    <div className="px-5 space-y-6">
      <div>
        <h2 className="text-lg font-bold">每日一萌</h2>
        <p className="text-xs text-[#264653]/50 mt-0.5">每天一张，攒下{dogName ? `「${dogName}」的` : '它的'}可爱</p>
      </div>

      {todayPhoto && !editing ? (
        <figure className="bg-[#FFFDF6] rounded-3xl p-3 shadow-sm shadow-[#264653]/5">
          <img src={todayPhoto.photo} alt="" className="rounded-2xl w-full max-h-80 object-cover" />
          <figcaption className="flex items-center justify-between px-2 pt-2.5 pb-1">
            <span className="text-sm text-[#264653]/70">{todayPhoto.caption || '今天的它'}</span>
            <div className="flex gap-3 text-[#264653]/40">
              <button onClick={startEdit} aria-label="更换"><Pencil size={16} /></button>
              <button onClick={() => onDelete(todayPhoto.id)} aria-label="删除"><Trash2 size={16} /></button>
            </div>
          </figcaption>
        </figure>
      ) : (
        <div className="bg-[#FFFDF6] rounded-3xl p-5 shadow-sm shadow-[#264653]/5">
          <div className="relative w-full aspect-[4/3] rounded-2xl border-2 border-dashed border-[#F4A261]/40 bg-[#F5F0E1]/60 flex flex-col items-center justify-center gap-2 text-[#264653]/50 overflow-hidden">
            {draft ? (
              <img src={draft} alt="" className={`w-full h-full object-cover transition ${saving ? 'scale-[1.02]' : ''}`} />
            ) : (
              <>
                <Camera size={32} className="text-[#F4A261]" />
                <span className="text-sm font-medium">拍下或选一张今天的它</span>
              </>
            )}
            {busy && (
              <span className="absolute inset-0 bg-[#264653]/45 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 text-white" aria-live="polite">
                <RefreshCw size={30} className="animate-spin" />
                <span className="text-sm font-semibold animate-pulse">{preparing ? '正在处理照片…' : '正在保存照片…'}</span>
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-sm font-semibold bg-[#F4A261]/15 text-[#C76E2B] disabled:opacity-50"
            >
              <Camera size={16} /> 拍照
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-sm font-semibold bg-[#A8DADC]/35 text-[#2A7F83] disabled:opacity-50"
            >
              <ImagePlus size={16} /> 从相册选择
            </button>
          </div>
          {draft && (
            <div className="mt-3 space-y-2.5">
              <input
                value={caption}
                onChange={e => setCaption(e.target.value)}
                disabled={busy}
                placeholder="给今天配一句话…"
                className="w-full bg-[#F5F0E1] rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-[#F4A261]/40 disabled:opacity-60"
              />
              <button
                onClick={savePhoto}
                disabled={busy}
                className="w-full bg-[#F4A261] text-white font-bold rounded-2xl py-3 active:enabled:scale-[0.98] transition disabled:opacity-80 flex items-center justify-center gap-2"
              >
                {saving && <RefreshCw size={17} className="animate-spin" />}
                {saving ? '正在保存照片…' : '收下今日份的可爱'}
              </button>
              {saveError && <p className="text-xs text-center text-[#C0452B]" role="alert">{saveError}</p>}
            </div>
          )}
          {!draft && saveError && <p className="text-xs text-center text-[#C0452B] mt-3" role="alert">{saveError}</p>}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { preparePhoto(e.target.files?.[0]); e.currentTarget.value = '' }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { preparePhoto(e.target.files?.[0]); e.currentTarget.value = '' }}
          />
        </div>
      )}

      {past.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-[#264653]/50 mb-2">这些天的它</h3>
          <div className="grid grid-cols-2 gap-3">
            {past.map(p => (
              <figure key={p.id} className="bg-[#FFFDF6] rounded-3xl p-2 shadow-sm shadow-[#264653]/5 group relative">
                <img src={p.photo} alt="" className="rounded-2xl w-full aspect-square object-cover" />
                <figcaption className="px-1.5 pt-1.5 pb-0.5">
                  <p className="text-[11px] text-[#264653]/45">{Number(p.date.slice(5, 7))}月{Number(p.date.slice(8))}日</p>
                  {p.caption && <p className="text-xs text-[#264653]/70 truncate">{p.caption}</p>}
                </figcaption>
                <button
                  onClick={() => onDelete(p.id)}
                  className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#264653]/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  aria-label="删除"
                >
                  <Trash2 size={12} />
                </button>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/* ---------------- 物品清单 ---------------- */

function Supplies({ supplies, onAdd, onUpdate, onDelete }: {
  supplies: SupplyItem[]
  onAdd: (s: Omit<SupplyItem, 'id' | 'updatedAt'>) => void
  onUpdate: (id: string, patch: Partial<SupplyItem>) => void
  onDelete: (id: string) => void
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const restock = supplies.filter(s => s.stock !== 'plenty')
  const expiring = supplies.filter(s => {
    const e = expiryInfo(s)
    return e && e.state !== 'ok'
  })
  const groups = useMemo(() => {
    const map = new Map<string, SupplyItem[]>()
    for (const cat of SUPPLY_CATEGORIES) map.set(cat, [])
    for (const s of supplies) {
      const arr = map.get(s.category) ?? []
      arr.push(s)
      map.set(s.category, arr)
    }
    return [...map.entries()].filter(([, list]) => list.length > 0)
  }, [supplies])

  return (
    <div className="px-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">物品清单</h2>
          <p className="text-xs text-[#264653]/50 mt-0.5">余量随手更新，补货不再忘</p>
        </div>
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-1 bg-[#F4A261] text-white text-sm font-semibold rounded-2xl px-4 py-2.5 active:scale-95 transition"
        >
          <Plus size={16} /> 添加
        </button>
      </div>

      {/* 补货提醒 */}
      {restock.length > 0 && (
        <section className="bg-[#E76F51]/10 border border-[#E76F51]/25 rounded-3xl p-4">
          <h3 className="font-semibold text-[#C0452B] flex items-center gap-1.5 mb-2">
            <ShoppingCart size={16} /> 该补货啦
          </h3>
          <ul className="space-y-1.5">
            {restock.map(s => (
              <li key={s.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{s.brand ? `${s.brand} · ` : ''}{s.name}</span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${STOCK_META[s.stock].cls}`}>
                  {STOCK_META[s.stock].label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 临期 / 过期提醒 */}
      {expiring.length > 0 && (
        <section className="bg-[#E9C46A]/15 border border-[#E9C46A]/50 rounded-3xl p-4">
          <h3 className="font-semibold text-[#9A7B1E] flex items-center gap-1.5 mb-2">
            <AlarmClock size={16} /> 保质期提醒
          </h3>
          <ul className="space-y-1.5">
            {expiring.map(s => {
              const e = expiryInfo(s)!
              return (
                <li key={s.id} className="flex items-center justify-between text-sm gap-2">
                  <span className="truncate">{s.brand ? `${s.brand} · ` : ''}{s.name}</span>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${
                    e.state === 'expired' ? 'bg-[#E76F51]/15 text-[#C0452B]' : 'bg-[#E9C46A]/30 text-[#9A7B1E]'
                  }`}>
                    {e.state === 'expired' ? `已过期 ${e.days} 天` : `${e.days} 天后到期`}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {supplies.length === 0 && (
        <div className="pt-12 text-center text-[#264653]/50">
          <Package size={44} className="mx-auto mb-4 opacity-40" />
          <p className="font-medium">还没有物品</p>
          <p className="text-sm mt-1">把狗粮、零食、玩具加进来，随时看看余量</p>
        </div>
      )}

      {groups.map(([cat, list]) => (
        <section key={cat}>
          <h3 className="text-sm font-semibold text-[#264653]/50 mb-2">{cat}</h3>
          <div className="space-y-3">
            {list.map(s => (
              <SupplyCard key={s.id} item={s} onUpdate={p => onUpdate(s.id, p)} onDelete={() => onDelete(s.id)} />
            ))}
          </div>
        </section>
      ))}

      {sheetOpen && <AddSupplySheet onClose={() => setSheetOpen(false)} onSubmit={s => { onAdd(s); setSheetOpen(false) }} />}
    </div>
  )
}

function SupplyCard({ item: s, onUpdate, onDelete }: {
  item: SupplyItem
  onUpdate: (p: Partial<SupplyItem>) => void
  onDelete: () => void
}) {
  const e = expiryInfo(s)
  return (
    <article className="bg-[#FFFDF6] rounded-3xl p-4 shadow-sm shadow-[#264653]/5">
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-2xl bg-[#F5F0E1] overflow-hidden flex items-center justify-center shrink-0">
          {s.photo
            ? <img src={s.photo} alt="" className="w-full h-full object-cover" />
            : <Package size={22} className="text-[#264653]/30" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-semibold truncate">
              {s.brand && <span className="text-[#264653]/55 font-normal text-sm mr-1">{s.brand}</span>}
              {s.name}
            </h4>
            <button onClick={onDelete} className="text-[#264653]/25 hover:text-[#E76F51] transition shrink-0" aria-label="删除">
              <Trash2 size={16} />
            </button>
          </div>
          {s.variant && <p className="text-xs text-[#264653]/55 mt-0.5">{s.variant}</p>}
          {e && (
            <p className={`text-xs mt-1 font-medium ${
              e.state === 'expired' ? 'text-[#C0452B]' : e.state === 'soon' ? 'text-[#9A7B1E]' : 'text-[#264653]/45'
            }`}>
              {e.state === 'expired'
                ? `已于 ${e.date} 过期（${e.days} 天前）`
                : `${e.date} 到期${e.state === 'soon' ? `，还剩 ${e.days} 天` : ''}`}
            </p>
          )}
          {s.note && <p className="text-xs text-[#264653]/55 mt-1">{s.note}</p>}
        </div>
      </div>
      <div className="flex gap-1.5 mt-2.5">
        {(Object.keys(STOCK_META) as StockLevel[]).map(lv => (
          <button
            key={lv}
            onClick={() => onUpdate({ stock: lv })}
            className={`text-xs px-3 py-1.5 rounded-full transition ${
              s.stock === lv ? `${STOCK_META[lv].cls} font-semibold` : 'bg-[#F5F0E1] text-[#264653]/45'
            }`}
          >
            {STOCK_META[lv].label}
          </button>
        ))}
      </div>
    </article>
  )
}

function AddSupplySheet({ onClose, onSubmit }: {
  onClose: () => void
  onSubmit: (s: Omit<SupplyItem, 'id' | 'updatedAt'>) => void
}) {
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [variant, setVariant] = useState('')
  const [category, setCategory] = useState(SUPPLY_CATEGORIES[0])
  const [stock, setStock] = useState<StockLevel>('plenty')
  const [photo, setPhoto] = useState<string | undefined>()
  const [produceDate, setProduceDate] = useState('')
  const [shelfMonths, setShelfMonths] = useState('')
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const field = 'mt-1 w-full bg-[#F5F0E1] rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-[#F4A261]/40'

  const expiryPreview = (() => {
    if (!produceDate || !shelfMonths) return ''
    const exp = new Date(produceDate)
    exp.setMonth(exp.getMonth() + Number(shelfMonths))
    return `预计 ${exp.getFullYear()} 年 ${exp.getMonth() + 1} 月 ${exp.getDate()} 日到期`
  })()

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-[#264653]/40" />
      <div
        className="relative w-full max-w-md bg-[#FFFDF6] rounded-t-[2rem] p-5 pb-8 max-h-[88dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">添加物品</h2>
          <button onClick={onClose} className="text-[#264653]/40" aria-label="关闭"><X size={22} /></button>
        </div>
        <div className="space-y-3">
          {/* 照片 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="w-16 h-16 rounded-2xl border-2 border-dashed border-[#F4A261]/40 bg-[#F5F0E1]/60 flex items-center justify-center overflow-hidden shrink-0"
            >
              {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <Camera size={22} className="text-[#F4A261]" />}
            </button>
            <p className="text-xs text-[#264653]/50">拍一张物品照片，<br />一眼认出是哪一款</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => readImage(e.target.files?.[0], setPhoto)} />
          </div>

          <label className="block">
            <span className="text-xs text-[#264653]/50">名称 *</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="比如：全价冻干狗粮" className={field} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-[#264653]/50">品牌</span>
              <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="比如：渴望" className={field} />
            </label>
            <label className="block">
              <span className="text-xs text-[#264653]/50">款式 / 规格</span>
              <input value={variant} onChange={e => setVariant(e.target.value)} placeholder="比如：鸡肉味 2kg" className={field} />
            </label>
          </div>
          <div>
            <span className="text-xs text-[#264653]/50">分类</span>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {SUPPLY_CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-2xl py-2 text-sm transition ${category === c ? 'bg-[#F4A261] text-white font-semibold' : 'bg-[#F5F0E1] text-[#264653]/70'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-[#264653]/50">生产日期</span>
              <input type="date" value={produceDate} onChange={e => setProduceDate(e.target.value)} className={field} />
            </label>
            <label className="block">
              <span className="text-xs text-[#264653]/50">保质期（月）</span>
              <input type="number" inputMode="numeric" min="1" value={shelfMonths} onChange={e => setShelfMonths(e.target.value)} placeholder="比如：18" className={field} />
            </label>
          </div>
          {expiryPreview && <p className="text-xs text-[#9A7B1E] flex items-center gap-1"><AlarmClock size={12} /> {expiryPreview}</p>}
          <div>
            <span className="text-xs text-[#264653]/50">当前余量</span>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {(Object.keys(STOCK_META) as StockLevel[]).map(lv => (
                <button
                  key={lv}
                  onClick={() => setStock(lv)}
                  className={`rounded-2xl py-2 text-sm transition ${stock === lv ? 'bg-[#F4A261] text-white font-semibold' : 'bg-[#F5F0E1] text-[#264653]/70'}`}
                >
                  {STOCK_META[lv].label}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-xs text-[#264653]/50">备注</span>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="常买的店、大概能吃多久…" className={field} />
          </label>
          <button
            onClick={() => name.trim() && onSubmit({
              name: name.trim(), brand: brand.trim(), variant: variant.trim(),
              category, stock, photo,
              produceDate: produceDate || undefined,
              shelfMonths: shelfMonths ? Number(shelfMonths) : undefined,
              note: note.trim(),
            })}
            className="w-full bg-[#F4A261] text-white font-bold rounded-2xl py-3.5 active:scale-[0.98] transition disabled:opacity-40"
            disabled={!name.trim()}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- 统计 ---------------- */

function SyncSettings({ sync }: { sync: ReturnType<typeof useSync> }) {
  const urlRef = useRef<HTMLInputElement>(null)
  const keyRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const status = sync.status

  const save = async () => {
    setNotice(null)
    try {
      await sync.configure({
        serverUrl: urlRef.current?.value.trim() ?? '',
        apiKey: keyRef.current?.value.trim() || undefined,
      })
      if (keyRef.current) keyRef.current.value = ''
      setNotice({ kind: 'ok', text: '连接设置已保存' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      setNotice({ kind: 'error', text: `保存失败：${message}` })
    }
  }

  const run = async () => {
    setNotice(null)
    try {
      await sync.run()
      setNotice({ kind: 'ok', text: '同步完成' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      setNotice({ kind: 'error', text: `同步失败：${message}` })
    }
  }

  return (
    <section className="px-5 mt-8 mb-2">
      <div className="bg-[#FFFDF6] rounded-3xl p-4 shadow-sm shadow-[#264653]/5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Server size={18} className="text-[#F4A261]" />
            <div>
              <h2 className="font-semibold text-sm">个人服务器同步</h2>
              <p className="text-[11px] text-[#264653]/45">本地优先，联网后自动同步</p>
            </div>
          </div>
          <span className={`text-[11px] px-2.5 py-1 rounded-full ${
            status?.configured ? 'bg-[#A8DADC]/40 text-[#2A7F83]' : 'bg-[#264653]/8 text-[#264653]/45'
          }`}>
            {status?.configured ? '已配置' : '仅本地'}
          </span>
        </div>

        <label className="block">
          <span className="text-xs text-[#264653]/50">服务器地址</span>
          <input
            key={status?.serverUrl ?? ''}
            ref={urlRef}
            defaultValue={status?.serverUrl ?? ''}
            placeholder="https://你的域名"
            inputMode="url"
            className="mt-1 w-full bg-[#F5F0E1] rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-[#F4A261]/40"
          />
        </label>
        <label className="block">
          <span className="text-xs text-[#264653]/50">固定设备密钥</span>
          <input
            ref={keyRef}
            type="password"
            placeholder={status?.hasApiKey ? '已保存；留空表示不修改' : '输入服务器设备密钥'}
            autoComplete="off"
            className="mt-1 w-full bg-[#F5F0E1] rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-[#F4A261]/40"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={save} className="rounded-2xl py-2.5 text-sm font-semibold bg-[#F4A261] text-white">
            保存设置
          </button>
          <button
            onClick={run}
            disabled={!status?.configured || sync.isSyncing}
            className="rounded-2xl py-2.5 text-sm font-semibold bg-[#F5F0E1] text-[#264653] disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <RefreshCw size={14} className={sync.isSyncing ? 'animate-spin' : ''} />
            {sync.isSyncing ? '同步中' : '立即同步'}
          </button>
        </div>

        <div className="text-[11px] text-[#264653]/45 space-y-1">
          <p className="flex items-center gap-1.5">
            <Cloud size={12} /> 待同步变更：{status?.pendingChanges ?? 0}
          </p>
          <p>上次同步：{status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : '尚未同步'}</p>
          {(notice || sync.syncError) && (
            <p className={`flex items-center gap-1.5 ${sync.syncError || notice?.kind === 'error' ? 'text-[#C0452B]' : 'text-[#2A7F83]'}`}>
              {sync.syncError || notice?.kind === 'error' ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
              {sync.syncError || notice?.text}
            </p>
          )}
        </div>
      </div>
      <p className="text-center text-[11px] text-[#264653]/35 mt-3">
        数据保存在本机 SQLite；远程连接只接受 HTTPS
      </p>
    </section>
  )
}

function HomeCardsEditor({ selected, onClose, onSave }: {
  selected: HomeCardType[]
  onClose: () => void
  onSave: (types: HomeCardType[]) => Promise<unknown>
}) {
  const [draft, setDraft] = useState<HomeCardType[]>(selected)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const toggle = (type: HomeCardType) => {
    setError('')
    setDraft(current => current.includes(type)
      ? current.filter(item => item !== type)
      : [...current, type])
  }

  const submit = async () => {
    if (draft.length === 0) {
      setError('请至少保留一个主页卡片')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(draft)
    } catch {
      setError('保存失败，请重试')
      setSaving(false)
    }
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setDraft(current => {
      const from = current.indexOf(active.id as HomeCardType)
      const to = current.indexOf(over.id as HomeCardType)
      return from >= 0 && to >= 0 ? arrayMove(current, from, to) : current
    })
  }

  const available = HOME_CARD_OPTIONS.filter(option => !draft.includes(option.type))

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={saving ? undefined : onClose}>
      <div className="absolute inset-0 bg-[#264653]/40" />
      <section
        className="relative w-full max-w-md bg-[#FFFDF6] rounded-t-[2rem] p-5 pb-8 max-h-[85dvh] overflow-y-auto"
        onClick={event => event.stopPropagation()}
        aria-labelledby="home-cards-title"
      >
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 id="home-cards-title" className="text-lg font-bold">编辑主页卡片</h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="关闭" className="text-[#264653]/40 disabled:opacity-40">
            <X size={22} />
          </button>
        </div>
        <p className="text-xs text-[#264653]/50 mb-4">拖动已选卡片调整主页顺序，也可以添加或移除项目</p>

        <h3 className="text-xs font-semibold text-[#264653]/55 mb-2">主页显示 · {draft.length} 项</h3>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={draft} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {draft.map(type => (
                <SortableHomeCard
                  key={type}
                  type={type}
                  disabled={saving}
                  onRemove={() => toggle(type)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {available.length > 0 && (
          <div className="mt-5">
            <h3 className="text-xs font-semibold text-[#264653]/55 mb-2">添加其他卡片</h3>
            <div className="grid grid-cols-2 gap-2">
              {available.map(({ type, label }) => {
                const Icon = TYPE_ICON[type]
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggle(type)}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-left bg-[#F5F0E1] text-[#264653]/65 disabled:opacity-50"
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${TYPE_COLOR[type]}`}>
                      <Icon size={15} />
                    </span>
                    <span className="flex-1 font-medium">{label}</span>
                    <Plus size={14} />
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {error && <p className="text-xs text-[#C0452B] mt-2" role="alert">{error}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="w-full mt-4 bg-[#F4A261] text-white font-bold rounded-2xl py-3.5 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving && <RefreshCw size={17} className="animate-spin" />}
          {saving ? '正在保存…' : '保存主页设置'}
        </button>
      </section>
    </div>
  )
}

function SortableHomeCard({ type, disabled, onRemove }: {
  type: HomeCardType
  disabled: boolean
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: type, disabled })
  const { label } = homeCardOption(type)
  const Icon = TYPE_ICON[type]

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={`flex items-center gap-2 rounded-2xl px-2.5 py-2 bg-[#F4A261]/12 border border-[#F4A261]/45 ${isDragging ? 'shadow-lg opacity-95' : ''}`}
    >
      <button
        type="button"
        aria-label={`拖动${label}`}
        disabled={disabled}
        className="p-1.5 text-[#264653]/35 cursor-grab active:cursor-grabbing touch-none disabled:opacity-40"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>
      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${TYPE_COLOR[type]}`}>
        <Icon size={17} />
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <button
        type="button"
        aria-label={`移除${label}`}
        onClick={onRemove}
        disabled={disabled}
        className="p-2 text-[#264653]/35 hover:text-[#C0452B] disabled:opacity-40"
      >
        <X size={16} />
      </button>
    </div>
  )
}

function Stats({ records, onAddRecord }: {
  records: DogRecord[]
  onAddRecord: (type: RecordType) => void
}) {
  const [weekAgo] = useState(() => Date.now() - 7 * 86400000)
  const week = records.filter(r => +new Date(r.time) >= weekAgo)
  const count = (t: RecordType, list = records) => list.filter(r => r.type === t).length
  const walkMins = week.filter(r => r.type === 'walk').reduce((s, r) => s + (r.value ?? 0), 0)
  const weights = records.filter(r => r.type === 'weight' && r.value != null).slice(0, 20).reverse()

  const items: { label: string; value: string; icon: typeof Bone; cls: string; type?: RecordType }[] = [
    { label: '本周遛狗', value: `${count('walk', week)} 次`, icon: Footprints, cls: TYPE_COLOR.walk, type: 'walk' },
    { label: '本周遛弯时长', value: walkMins ? `${walkMins} 分钟` : '—', icon: Footprints, cls: TYPE_COLOR.walk, type: 'walk' },
    { label: '本周喂食', value: `${count('feed', week)} 次`, icon: Bone, cls: TYPE_COLOR.feed, type: 'feed' },
    { label: '驱虫累计', value: `${count('deworm')} 次`, icon: Bug, cls: TYPE_COLOR.deworm, type: 'deworm' },
    { label: '体检累计', value: `${count('checkup')} 次`, icon: HeartPulse, cls: TYPE_COLOR.checkup, type: 'checkup' },
    { label: '疫苗记录', value: `${count('vaccine')} 条`, icon: Syringe, cls: TYPE_COLOR.vaccine, type: 'vaccine' },
    { label: '大事件', value: `${count('milestone')} 件`, icon: Flag, cls: TYPE_COLOR.milestone, type: 'milestone' },
    { label: '全部记录', value: `${records.length} 条`, icon: NotebookPen, cls: TYPE_COLOR.note },
  ]

  return (
    <div className="px-5 space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {items.map(it => (
          <button
            key={it.label}
            type="button"
            onClick={() => it.type && onAddRecord(it.type)}
            disabled={!it.type}
            className="bg-[#FFFDF6] rounded-3xl p-4 shadow-sm shadow-[#264653]/5 text-left disabled:cursor-default active:enabled:scale-[0.98] transition"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${it.cls}`}>
              <it.icon size={18} />
            </div>
            <p className="text-xl font-bold">{it.value}</p>
            <p className="text-xs text-[#264653]/50 mt-0.5">{it.label}</p>
          </button>
        ))}
      </div>

      <section className="bg-[#FFFDF6] rounded-3xl p-4 shadow-sm shadow-[#264653]/5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold">体重趋势</h2>
          <button
            type="button"
            onClick={() => onAddRecord('weight')}
            className="text-xs font-semibold text-[#C76E2B] bg-[#F4A261]/15 rounded-full px-3 py-1.5"
          >
            记录体重
          </button>
        </div>
        {weights.length >= 2 ? <WeightChart data={weights} /> : (
          <p className="text-sm text-[#264653]/50 py-6 text-center">
            记录两次以上体重后，这里会出现趋势曲线
          </p>
        )}
      </section>
    </div>
  )
}

function WeightChart({ data }: { data: DogRecord[] }) {
  const W = 320, H = 120, P = 24
  const vals = data.map(d => d.value!)
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || 1
  const x = (i: number) => P + (i / Math.max(data.length - 1, 1)) * (W - P * 2)
  const y = (v: number) => H - P - ((v - min) / span) * (H - P * 2)
  const pts = data.map((d, i) => `${x(i)},${y(d.value!)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <polyline points={pts} fill="none" stroke="#F4A261" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <g key={d.id}>
          <circle cx={x(i)} cy={y(d.value!)} r="4" fill="#F4A261" />
          <text x={x(i)} y={y(d.value!) - 9} textAnchor="middle" fontSize="10" fill="#264653" opacity="0.75">
            {d.value}
          </text>
        </g>
      ))}
      <text x={P} y={H - 6} fontSize="9" fill="#264653" opacity="0.4">{fmtDate(data[0].time).label}</text>
      <text x={W - P} y={H - 6} fontSize="9" fill="#264653" opacity="0.4" textAnchor="end">{fmtDate(data[data.length - 1].time).label}</text>
    </svg>
  )
}

/* ---------------- 我的（狗狗档案） ---------------- */

function ProfilePage({ profile, onSave }: { profile: DogProfile; onSave: (p: DogProfile) => void }) {
  const [draft, setDraft] = useState(profile)
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const field = 'mt-1 w-full bg-[#F5F0E1] rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-[#F4A261]/40'
  const genderLabel = profile.gender === 'girl' ? '妹妹' : '弟弟'
  const neuteredLabel = profile.neutered === 'yes' ? '已绝育' : '未绝育'

  const startEditing = () => {
    setDraft(profile)
    setSaved(false)
    setEditing(true)
  }

  const cancelEditing = () => {
    setDraft(profile)
    setEditing(false)
  }

  const saveProfile = () => {
    onSave(draft)
    setEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="px-5 space-y-3">
      <article className="relative overflow-hidden rounded-[2rem] bg-[#FFFDF6] p-4 shadow-sm shadow-[#264653]/5">
        <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[#A8DADC]/20" />
        <div className="relative flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-3xl bg-[#E8DCC4] flex items-center justify-center">
            {profile.avatar
              ? <img src={profile.avatar} alt={profile.name || '狗狗头像'} className="h-full w-full object-cover" />
              : <Dog size={34} className="text-[#264653]/50" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold">{profile.name || '给它起个名字吧'}</h2>
                <p className="mt-0.5 truncate text-sm text-[#264653]/50">{profile.breed || '等待填写品种'}</p>
              </div>
              <button
                type="button"
                onClick={startEditing}
                className="flex shrink-0 items-center gap-1 rounded-full bg-[#F4A261]/15 px-3 py-1.5 text-xs font-semibold text-[#C76E2B] active:scale-95 transition"
              >
                <Pencil size={12} /> {saved ? '已保存' : '编辑'}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-[#264653]/65">
              <span className="rounded-full bg-[#F5F0E1] px-2.5 py-1">{genderLabel}</span>
              <span className="rounded-full bg-[#F5F0E1] px-2.5 py-1">{neuteredLabel}</span>
            </div>
          </div>
        </div>
        {(profile.birthday || profile.homeDate) && (
          <div className="relative mt-4 grid grid-cols-2 gap-2 border-t border-[#264653]/8 pt-3 text-xs text-[#264653]/60">
            <span className="flex items-center gap-1.5">
              <Cake size={13} className="text-[#F4A261]" />
              {profile.birthday ? calcAge(profile.birthday) : '生日待填写'}
            </span>
            <span className="flex items-center gap-1.5">
              <PawPrint size={13} className="text-[#2A7F83]" />
              {profile.homeDate ? daysTogether(profile.homeDate) : '到家日待填写'}
            </span>
          </div>
        )}
      </article>

      {editing && (
        <section className="rounded-[2rem] bg-[#FFFDF6] p-4 shadow-sm shadow-[#264653]/5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold">编辑名片</h3>
              <p className="text-[11px] text-[#264653]/45">完善一次，平时保持清爽</p>
            </div>
            <button type="button" onClick={cancelEditing} className="rounded-full p-2 text-[#264653]/40" aria-label="取消编辑">
              <X size={18} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => fileRef.current?.click()} className="relative shrink-0">
              <div className="h-16 w-16 overflow-hidden rounded-2xl bg-[#E8DCC4] flex items-center justify-center">
                {draft.avatar
                  ? <img src={draft.avatar} alt="" className="h-full w-full object-cover" />
                  : <Dog size={28} className="text-[#264653]/50" />}
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#F4A261] text-white">
                <Camera size={12} />
              </span>
            </button>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
              <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="名字" aria-label="名字" className={field} />
              <input value={draft.breed} onChange={e => setDraft(d => ({ ...d, breed: e.target.value }))} placeholder="品种" aria-label="品种" className={field} />
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => readImage(e.target.files?.[0], url => setDraft(d => ({ ...d, avatar: url })))} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] text-[#264653]/50">生日</span>
              <input type="date" value={draft.birthday} onChange={e => setDraft(d => ({ ...d, birthday: e.target.value }))} className={field} />
            </label>
            <label className="block">
              <span className="text-[11px] text-[#264653]/50">到家日</span>
              <input type="date" value={draft.homeDate} onChange={e => setDraft(d => ({ ...d, homeDate: e.target.value }))} className={field} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="grid grid-cols-2 gap-1.5">
              {(['boy', 'girl'] as const).map(g => (
                <button type="button" key={g} onClick={() => setDraft(d => ({ ...d, gender: g }))}
                  className={`rounded-2xl py-2 text-xs transition ${draft.gender === g ? 'bg-[#F4A261] text-white font-semibold' : 'bg-[#F5F0E1] text-[#264653]/65'}`}>
                  {g === 'boy' ? '弟弟' : '妹妹'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {([['yes', '已绝育'], ['no', '未绝育']] as const).map(([v, label]) => (
                <button type="button" key={v} onClick={() => setDraft(d => ({ ...d, neutered: v }))}
                  className={`rounded-2xl py-2 text-xs transition ${draft.neutered === v ? 'bg-[#F4A261] text-white font-semibold' : 'bg-[#F5F0E1] text-[#264653]/65'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" onClick={cancelEditing} className="rounded-2xl bg-[#F5F0E1] py-2.5 text-sm font-semibold text-[#264653]/65">取消</button>
            <button type="button" onClick={saveProfile} className="rounded-2xl bg-[#F4A261] py-2.5 text-sm font-bold text-white active:scale-[0.98] transition">保存名片</button>
          </div>
        </section>
      )}
    </div>
  )
}
