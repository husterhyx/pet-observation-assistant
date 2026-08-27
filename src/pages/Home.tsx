import { useMemo, useRef, useState } from 'react'
import {
  Bone, Footprints, Bath, Scale, Syringe, Stethoscope, Smile, NotebookPen,
  Plus, Trash2, Camera, X, Dog, Cake, Pencil,
} from 'lucide-react'
import { useDogData } from '@/hooks/useDogData'
import { RECORD_TYPE_META, type DogProfile, type DogRecord, type RecordType } from '@/types'

const TYPE_ICON: Record<RecordType, typeof Bone> = {
  feed: Bone,
  walk: Footprints,
  bath: Bath,
  weight: Scale,
  vaccine: Syringe,
  vet: Stethoscope,
  mood: Smile,
  note: NotebookPen,
}

const TYPE_COLOR: Record<RecordType, string> = {
  feed: 'bg-[#F4A261]/15 text-[#C76E2B]',
  walk: 'bg-[#A8DADC]/40 text-[#2A7F83]',
  bath: 'bg-[#A8DADC]/40 text-[#2A7F83]',
  weight: 'bg-[#E9C46A]/25 text-[#9A7B1E]',
  vaccine: 'bg-[#F4A261]/15 text-[#C76E2B]',
  vet: 'bg-[#E76F51]/15 text-[#C0452B]',
  mood: 'bg-[#E9C46A]/25 text-[#9A7B1E]',
  note: 'bg-[#264653]/10 text-[#264653]',
}

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

export default function Home() {
  const { records, profile, setProfile, addRecord, removeRecord } = useDogData()
  const [tab, setTab] = useState<'diary' | 'stats' | 'me'>('diary')
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-[#F5F0E1] text-[#264653] flex justify-center">
      <div className="w-full max-w-md relative pb-28">
        <Header profile={profile} recordCount={records.length} />

        {tab === 'diary' && <Timeline records={records} onDelete={removeRecord} />}
        {tab === 'stats' && <Stats records={records} />}
        {tab === 'me' && <ProfilePage profile={profile} onSave={setProfile} />}

        {/* 底部导航 */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-[#FFFDF6]/95 backdrop-blur border-t border-[#264653]/10 z-20">
          <div className="grid grid-cols-3 items-center h-16 relative">
            <NavItem active={tab === 'diary'} onClick={() => setTab('diary')} label="日记" icon={NotebookPen} />
            <button
              onClick={() => setSheetOpen(true)}
              className="justify-self-center -mt-8 w-14 h-14 rounded-full bg-[#F4A261] text-white shadow-lg shadow-[#F4A261]/40 flex items-center justify-center active:scale-95 transition"
              aria-label="记一笔"
            >
              <Plus size={28} strokeWidth={2.5} />
            </button>
            <NavItem active={tab === 'stats'} onClick={() => setTab('stats')} label="统计" icon={Scale} />
          </div>
        </nav>

        {sheetOpen && (
          <AddSheet
            defaultName={profile.name}
            onClose={() => setSheetOpen(false)}
            onSubmit={r => { addRecord(r); setSheetOpen(false); setTab('diary') }}
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
      <span className="text-xs">{label}</span>
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
            recordCount ? `已记录 ${recordCount} 条` : null,
          ].filter(Boolean).join(' · ') || '开始记录它的每一天吧'}
        </p>
      </div>
    </header>
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
          <h2 className="text-sm font-semibold text-[#264653]/50 mb-2 sticky top-0">{label}</h2>
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
  return (
    <article className="bg-[#FFFDF6] rounded-3xl p-4 shadow-sm shadow-[#264653]/5">
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

/* ---------------- 记一笔（底部弹层） ---------------- */

function AddSheet({ defaultName, onClose, onSubmit }: {
  defaultName: string
  onClose: () => void
  onSubmit: (r: Omit<DogRecord, 'id'>) => void
}) {
  const [type, setType] = useState<RecordType>('feed')
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

  const pickPhoto = (f: File | undefined) => {
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(reader.result as string)
    reader.readAsDataURL(f)
  }

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

        <div className="grid grid-cols-4 gap-2 mb-4">
          {(Object.keys(RECORD_TYPE_META) as RecordType[]).map(t => {
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
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => pickPhoto(e.target.files?.[0])} />
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

/* ---------------- 统计 ---------------- */

function Stats({ records }: { records: DogRecord[] }) {
  const weekAgo = Date.now() - 7 * 86400000
  const week = records.filter(r => +new Date(r.time) >= weekAgo)
  const count = (t: RecordType, list = records) => list.filter(r => r.type === t).length
  const walkMins = week.filter(r => r.type === 'walk').reduce((s, r) => s + (r.value ?? 0), 0)
  const weights = records.filter(r => r.type === 'weight' && r.value != null).slice(0, 20).reverse()

  const items: { label: string; value: string; icon: typeof Bone; cls: string }[] = [
    { label: '本周遛狗', value: `${count('walk', week)} 次`, icon: Footprints, cls: TYPE_COLOR.walk },
    { label: '本周遛弯时长', value: walkMins ? `${walkMins} 分钟` : '—', icon: Footprints, cls: TYPE_COLOR.walk },
    { label: '本周喂食', value: `${count('feed', week)} 次`, icon: Bone, cls: TYPE_COLOR.feed },
    { label: '洗澡累计', value: `${count('bath')} 次`, icon: Bath, cls: TYPE_COLOR.bath },
    { label: '疫苗记录', value: `${count('vaccine')} 条`, icon: Syringe, cls: TYPE_COLOR.vaccine },
    { label: '全部记录', value: `${records.length} 条`, icon: NotebookPen, cls: TYPE_COLOR.note },
  ]

  return (
    <div className="px-5 space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {items.map(it => (
          <div key={it.label} className="bg-[#FFFDF6] rounded-3xl p-4 shadow-sm shadow-[#264653]/5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${it.cls}`}>
              <it.icon size={18} />
            </div>
            <p className="text-xl font-bold">{it.value}</p>
            <p className="text-xs text-[#264653]/50 mt-0.5">{it.label}</p>
          </div>
        ))}
      </div>

      <section className="bg-[#FFFDF6] rounded-3xl p-4 shadow-sm shadow-[#264653]/5">
        <h2 className="font-semibold mb-3">体重趋势</h2>
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
  const [saved, setSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const pickAvatar = (f: File | undefined) => {
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setDraft(d => ({ ...d, avatar: reader.result as string }))
    reader.readAsDataURL(f)
  }

  const field = 'mt-1 w-full bg-[#FFFDF6] border border-[#264653]/10 rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-[#F4A261]/40'

  return (
    <div className="px-5 space-y-5">
      <div className="flex flex-col items-center pt-2">
        <button onClick={() => fileRef.current?.click()} className="relative">
          <div className="w-24 h-24 rounded-full bg-[#E8DCC4] flex items-center justify-center overflow-hidden">
            {draft.avatar
              ? <img src={draft.avatar} alt="" className="w-full h-full object-cover" />
              : <Dog size={40} className="text-[#264653]/50" />}
          </div>
          <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#F4A261] text-white flex items-center justify-center">
            <Pencil size={14} />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => pickAvatar(e.target.files?.[0])} />
      </div>

      <label className="block">
        <span className="text-xs text-[#264653]/50">名字</span>
        <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="它叫什么？" className={field} />
      </label>
      <label className="block">
        <span className="text-xs text-[#264653]/50">品种</span>
        <input value={draft.breed} onChange={e => setDraft(d => ({ ...d, breed: e.target.value }))} placeholder="比如：柯基 / 金毛 / 小土狗" className={field} />
      </label>
      <label className="block">
        <span className="text-xs text-[#264653]/50">生日</span>
        <input type="date" value={draft.birthday} onChange={e => setDraft(d => ({ ...d, birthday: e.target.value }))} className={field} />
      </label>
      <div>
        <span className="text-xs text-[#264653]/50">性别</span>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {(['boy', 'girl'] as const).map(g => (
            <button
              key={g}
              onClick={() => setDraft(d => ({ ...d, gender: g }))}
              className={`rounded-2xl py-2.5 text-sm transition ${draft.gender === g ? 'bg-[#F4A261] text-white font-semibold' : 'bg-[#FFFDF6] border border-[#264653]/10'}`}
            >
              {g === 'boy' ? '弟弟' : '妹妹'}
            </button>
          ))}
        </div>
      </div>
      {draft.birthday && (
        <p className="text-sm text-[#264653]/60 flex items-center gap-1.5">
          <Cake size={14} /> 现在 {calcAge(draft.birthday)}啦
        </p>
      )}
      <button
        onClick={() => { onSave(draft); setSaved(true); setTimeout(() => setSaved(false), 1500) }}
        className="w-full bg-[#F4A261] text-white font-bold rounded-2xl py-3.5 active:scale-[0.98] transition"
      >
        {saved ? '已保存 ✓' : '保存档案'}
      </button>
    </div>
  )
}
