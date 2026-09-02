import { useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bath,
  Bone,
  Bug,
  Camera,
  Cat,
  CheckCircle2,
  DatabaseBackup,
  Dog,
  Download,
  Droplets,
  Flag,
  Footprints,
  HeartPulse,
  ImagePlus,
  NotebookPen,
  Package,
  PawPrint,
  Pencil,
  Pill,
  Plus,
  RefreshCw,
  Scale,
  Scissors,
  Smile,
  Stethoscope,
  Syringe,
  Trash2,
  Upload,
  X,
  Zap,
  Bean,
  SlidersHorizontal,
  Archive,
  ArchiveRestore,
  Users,
  GripVertical,
  AlarmClock,
} from "lucide-react";
import { usePetData, type HomeCardType } from "@/hooks/usePetData";
import { parsePetBackupText } from "@contracts/backup";
import { pickBackupText, saveBackupText } from "@/lib/backup-file";
import {
  RECORD_GROUPS,
  RECORD_TYPE_META,
  STOCK_META,
  SUPPLY_CATEGORIES,
  expiryInfo,
  type PetProfile,
  type PetRecord,
  type PetSpecies,
  type RecordType,
  type StockLevel,
  type SupplyItem,
} from "@/types";

const ICONS: Record<RecordType, typeof Bone> = {
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
};
const COLORS: Record<RecordType, string> = {
  feed: "bg-[#F4A261]/15 text-[#C76E2B]",
  water: "bg-[#A8DADC]/40 text-[#2A7F83]",
  walk: "bg-[#A8DADC]/40 text-[#2A7F83]",
  weight: "bg-[#E9C46A]/25 text-[#9A7B1E]",
  bath: "bg-[#A8DADC]/40 text-[#2A7F83]",
  groom: "bg-[#A8DADC]/40 text-[#2A7F83]",
  poop: "bg-[#F4A261]/15 text-[#C76E2B]",
  vaccine: "bg-[#F4A261]/15 text-[#C76E2B]",
  deworm: "bg-[#A8DADC]/40 text-[#2A7F83]",
  checkup: "bg-[#A8DADC]/40 text-[#2A7F83]",
  vet: "bg-[#E76F51]/15 text-[#C0452B]",
  meds: "bg-[#E76F51]/15 text-[#C0452B]",
  mood: "bg-[#E9C46A]/25 text-[#9A7B1E]",
  note: "bg-[#264653]/10 text-[#264653]",
  milestone: "bg-[#E9C46A]/30 text-[#9A7B1E]",
};
const QUICK: RecordType[] = ["feed", "water", "walk", "poop"];
const HOME_OPTIONS: HomeCardType[] = [
  "walk",
  "weight",
  "bath",
  "groom",
  "deworm",
  "vaccine",
  "checkup",
  "vet",
  "meds",
  "mood",
  "note",
  "milestone",
];
type Tab = "diary" | "photos" | "supplies" | "me";
type Data = ReturnType<typeof usePetData>;

function speciesText(species: PetSpecies) {
  return species === "cat" ? "猫咪" : "狗狗";
}
function typeMeta(type: RecordType, species?: PetSpecies) {
  if (type === "walk" && species === "cat")
    return {
      ...RECORD_TYPE_META.walk,
      label: "玩耍",
      placeholder: "玩了什么？活动了多久？",
    };
  if (type === "groom" && species === "cat")
    return {
      ...RECORD_TYPE_META.groom,
      placeholder: "梳毛、剪指甲、清理耳朵……",
    };
  return RECORD_TYPE_META[type];
}
function petById(pets: PetProfile[], id: string) {
  return pets.find(p => p.id === id);
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatTime(value: string) {
  const d = new Date(value);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function imageFromFile(file: File | undefined) {
  return new Promise<string>((resolve, reject) => {
    if (!file) return reject(new Error("未选择图片"));
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(
        1,
        2048 / Math.max(image.naturalWidth, image.naturalHeight)
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas
        .getContext("2d")
        ?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    image.src = url;
  });
}

export default function Home() {
  return <MainApp />;
}
function MainApp() {
  const data = usePetData();
  const [tab, setTab] = useState<Tab>("diary");
  const [recordType, setRecordType] = useState<RecordType>();
  const [cardsOpen, setCardsOpen] = useState(false);
  if (data.isLoading)
    return (
      <div className="min-h-dvh bg-[#F5F0E1] grid place-items-center text-[#264653]/60">
        <PawPrint className="animate-pulse" size={40} />
      </div>
    );
  if (!data.activePets.length) return <EmptyPets data={data} />;
  const openRecord = (type: RecordType) => setRecordType(type);
  return (
    <div className="min-h-dvh bg-[#F5F0E1] text-[#264653] flex justify-center">
      <div className="w-full max-w-md pb-24">
        <Header data={data} />
        <PetFilter data={data} />
        {tab === "diary" && (
          <>
            <QuickPanel
              data={data}
              onDetailed={openRecord}
              onEditCards={() => setCardsOpen(true)}
            />
            <Timeline
              records={data.records}
              pets={data.activePets}
              onDelete={data.removeRecord}
            />
          </>
        )}
        {tab === "photos" && <Photos data={data} />}{" "}
        {tab === "supplies" && <Supplies data={data} />}{" "}
        {tab === "me" && <Me data={data} onRecord={openRecord} />}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md h-16 bg-[#FFFDF6]/95 border-t border-[#264653]/10 grid grid-cols-5 z-20">
          <Nav
            active={tab === "diary"}
            label="日记"
            icon={NotebookPen}
            onClick={() => setTab("diary")}
          />
          <Nav
            active={tab === "photos"}
            label="每日一萌"
            icon={PawPrint}
            onClick={() => setTab("photos")}
          />
          <button
            onClick={() => openRecord("feed")}
            className="justify-self-center self-center -mt-8 w-14 h-14 rounded-full bg-[#F4A261] text-white grid place-items-center shadow-lg"
          >
            <Plus />
          </button>
          <Nav
            active={tab === "supplies"}
            label="物品"
            icon={Package}
            onClick={() => setTab("supplies")}
          />
          <Nav
            active={tab === "me"}
            label="我的"
            icon={Users}
            onClick={() => setTab("me")}
          />
        </nav>
        {recordType && (
          <RecordSheet
            data={data}
            initialType={recordType}
            onClose={() => setRecordType(undefined)}
            onSaved={() => {
              setRecordType(undefined);
              setTab("diary");
            }}
          />
        )}
        {cardsOpen && data.selectedPet && (
          <CardsEditor data={data} onClose={() => setCardsOpen(false)} />
        )}
      </div>
    </div>
  );
}
function Nav({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: typeof Bone;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center text-[11px] ${active ? "text-[#F4A261]" : "text-[#264653]/50"}`}
    >
      <Icon size={20} />
      {label}
    </button>
  );
}
function Header({ data }: { data: Data }) {
  const p = data.selectedPet;
  return (
    <header className="px-5 pt-7 pb-2 flex items-center gap-3">
      <Avatar pet={p} size="lg" />
      <div className="min-w-0">
        <h1 className="text-2xl font-bold truncate">
          {p ? `${p.name}的小日子` : "我家的毛孩子"}
        </h1>
        <p className="text-sm text-[#264653]/55">
          {p
            ? `${speciesText(p.species)} · ${p.breed || "品种待填写"} · ${data.records.length} 条记录`
            : `${data.activePets.length} 位家庭成员 · ${data.records.length} 条记录`}
        </p>
      </div>
    </header>
  );
}
function Avatar({
  pet,
  size = "sm",
}: {
  pet?: PetProfile;
  size?: "sm" | "lg";
}) {
  const Icon = pet?.species === "cat" ? Cat : Dog;
  const cls = size === "lg" ? "w-14 h-14" : "w-9 h-9";
  return (
    <span
      className={`${cls} rounded-full bg-[#E8DCC4] shrink-0 overflow-hidden grid place-items-center`}
    >
      {pet?.avatar ? (
        <img src={pet.avatar} alt="" className="w-full h-full object-cover" />
      ) : (
        <Icon size={size === "lg" ? 27 : 19} className="text-[#264653]/55" />
      )}
    </span>
  );
}
function PetFilter({ data }: { data: Data }) {
  return (
    <div className="px-5 pb-4 flex gap-2 overflow-x-auto">
      <button
        onClick={() => data.setSelectedPetId(undefined)}
        className={`shrink-0 rounded-full px-3 py-2 text-xs ${!data.selectedPetId ? "bg-[#264653] text-white" : "bg-[#FFFDF6]"}`}
      >
        全部宠物
      </button>
      {data.activePets.map(p => (
        <button
          key={p.id}
          onClick={() => data.setSelectedPetId(p.id)}
          className={`shrink-0 flex items-center gap-1.5 rounded-full pr-3 pl-1 py-1 text-xs ${data.selectedPetId === p.id ? "bg-[#264653] text-white" : "bg-[#FFFDF6]"}`}
        >
          <Avatar pet={p} />
          {p.name}
        </button>
      ))}
    </div>
  );
}
function EmptyPets({ data }: { data: Data }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh bg-[#F5F0E1] text-[#264653] p-6 flex flex-col justify-center max-w-md mx-auto">
      <div className="text-center">
        <PawPrint size={52} className="mx-auto text-[#F4A261]" />
        <h1 className="text-2xl font-bold mt-4">欢迎来到宠物生活记录</h1>
        <p className="text-sm text-[#264653]/55 mt-2">
          先创建一位家庭成员，开始记录猫咪或狗狗的生活。
        </p>
        <button
          onClick={() => setOpen(true)}
          className="mt-6 bg-[#F4A261] text-white rounded-2xl px-8 py-3 font-bold"
        >
          创建宠物
        </button>
      </div>
      {data.pets.some(p => p.archivedAt) && (
        <div className="mt-10">
          <h2 className="font-bold mb-2">已归档宠物</h2>
          {data.pets
            .filter(p => p.archivedAt)
            .map(p => (
              <button
                key={p.id}
                onClick={() => data.restorePet(p.id)}
                className="w-full bg-white rounded-2xl p-3 mb-2 flex justify-between"
              >
                <span>{p.name}</span>
                <span>恢复</span>
              </button>
            ))}
        </div>
      )}
      <DataBackup data={data} />
      {open && (
        <PetForm
          onClose={() => setOpen(false)}
          onSave={async p => {
            await data.createPet(p);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function QuickPanel({
  data,
  onDetailed,
  onEditCards,
}: {
  data: Data;
  onDetailed: (t: RecordType) => void;
  onEditCards: () => void;
}) {
  const targetPet =
    data.selectedPet ??
    (data.activePets.length === 1 ? data.activePets[0] : undefined);
  const species = targetPet?.species;
  const [done, setDone] = useState<RecordType>();
  const [notice, setNotice] = useState("");
  const quickRecord = async (type: RecordType) => {
    if (!targetPet) {
      setNotice("请先在上方选择要记录的宠物");
      return;
    }
    const meta = typeMeta(type, targetPet.species);
    setNotice("");
    await data.addRecord({
      petId: targetPet.id,
      type,
      title: meta.label,
      note: "",
      time: new Date().toISOString(),
    });
    setDone(type);
    window.setTimeout(
      () => setDone(current => (current === type ? undefined : current)),
      1200
    );
  };
  return (
    <section className="px-5 mb-5">
      <div className="bg-[#FFFDF6] rounded-3xl p-4 shadow-sm">
        <h2 className="text-xs text-[#264653]/50 flex gap-1 mb-2">
          <Zap size={13} className="text-[#F4A261]" />
          一键打卡
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {QUICK.map(t => {
            const I = ICONS[t];
            return (
              <button
                key={t}
                onClick={() => void quickRecord(t)}
                className={`rounded-2xl py-2.5 flex flex-col items-center text-xs gap-1 ${done === t ? "bg-[#F4A261] text-white" : COLORS[t]}`}
              >
                <I size={20} />
                {done === t ? "已记下✓" : typeMeta(t, species).label}
              </button>
            );
          })}
        </div>
        {notice && (
          <p className="mt-2 text-center text-xs text-[#C0452B]">{notice}</p>
        )}
        <div className="border-t border-[#264653]/8 mt-3 pt-3">
          <div className="flex justify-between mb-2">
            <span className="text-xs text-[#264653]/50">健康与成长</span>
            {data.selectedPet && (
              <button
                onClick={onEditCards}
                className="text-[11px] text-[#C76E2B] flex gap-1"
              >
                <SlidersHorizontal size={12} />
                编辑同物种卡片
              </button>
            )}
          </div>
          {data.selectedPet ? (
            <div className="grid grid-cols-3 gap-2">
              {data.homeCardTypes.map(t => {
                const I = ICONS[t];
                return (
                  <button
                    key={t}
                    onClick={() => onDetailed(t)}
                    className="rounded-2xl bg-[#F5F0E1] py-2 text-xs flex justify-center gap-1"
                  >
                    <I size={15} />
                    {t === "walk" && species === "cat"
                      ? "活动时长"
                      : typeMeta(t, species).label}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-center text-[#264653]/40 py-2">
              选择一只宠物后显示它的专属卡片
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
function Timeline({
  records,
  pets,
  onDelete,
}: {
  records: PetRecord[];
  pets: PetProfile[];
  onDelete: (id: string) => unknown;
}) {
  if (!records.length)
    return (
      <div className="text-center py-20 text-[#264653]/40">
        <NotebookPen className="mx-auto mb-2" />
        还没有记录
      </div>
    );
  return (
    <div className="px-5 space-y-3">
      {records.map(r => {
        const p = petById(pets, r.petId);
        const I = ICONS[r.type];
        const meta = typeMeta(r.type, p?.species);
        return (
          <article
            key={r.id}
            className="bg-[#FFFDF6] rounded-3xl p-4 flex gap-3"
          >
            <span
              className={`w-10 h-10 rounded-2xl grid place-items-center shrink-0 ${COLORS[r.type]}`}
            >
              <I size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2">
                <h3 className="font-semibold">
                  {meta.label}
                  {r.value != null && (
                    <b className="text-[#F4A261] ml-2">
                      {r.value}
                      {meta.unit}
                    </b>
                  )}
                </h3>
                <span className="text-[11px] text-[#264653]/40">
                  {formatTime(r.time)}
                </span>
              </div>
              {p && (
                <p className="text-[11px] text-[#2A7F83] mt-0.5">{p.name}</p>
              )}
              {r.note && (
                <p className="text-sm mt-1 whitespace-pre-wrap">{r.note}</p>
              )}
              {r.photo && (
                <img
                  src={r.photo}
                  alt=""
                  className="mt-2 rounded-2xl max-h-52 w-full object-cover"
                />
              )}
            </div>
            <button
              onClick={() => onDelete(r.id)}
              className="text-[#264653]/25"
            >
              <Trash2 size={16} />
            </button>
          </article>
        );
      })}
    </div>
  );
}

function RecordSheet({
  data,
  initialType,
  onClose,
  onSaved,
}: {
  data: Data;
  initialType: RecordType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [petId, setPetId] = useState(data.selectedPetId ?? "");
  const [type, setType] = useState(initialType);
  const [note, setNote] = useState("");
  const [value, setValue] = useState("");
  const [time, setTime] = useState(() => localDateTimeValue());
  const [photo, setPhoto] = useState<string>();
  const [saving, setSaving] = useState(false);
  const p = petById(data.activePets, petId);
  const meta = typeMeta(type, p?.species);
  const submit = async () => {
    if (!petId) return;
    setSaving(true);
    await data.addRecord({
      petId,
      type,
      title: meta.label,
      note: note.trim(),
      time: new Date(time).toISOString(),
      value: meta.unit && value ? Number(value) : undefined,
      photo,
    });
    onSaved();
  };
  return (
    <Sheet onClose={onClose} title="记一笔">
      <PetSelect pets={data.activePets} value={petId} onChange={setPetId} />
      <div className="space-y-3 mt-4">
        {RECORD_GROUPS.map(g => (
          <div key={g.name}>
            <p className="text-xs text-[#264653]/45 mb-1">{g.name}</p>
            <div className="grid grid-cols-4 gap-2">
              {g.types.map(t => {
                const I = ICONS[t];
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`rounded-xl py-2 flex flex-col items-center text-[11px] ${type === t ? "bg-[#F4A261] text-white" : "bg-[#F5F0E1]"}`}
                  >
                    <I size={17} />
                    {typeMeta(t, p?.species).label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <label className="block text-xs text-[#264653]/55">
          时间
          <input
            type="datetime-local"
            step={60}
            value={time}
            onChange={event => setTime(event.target.value)}
            className="field mt-1"
          />
        </label>
        {meta.unit && (
          <input
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={`数值（${meta.unit}）`}
            className="field"
          />
        )}
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={meta.placeholder}
          rows={3}
          className="field"
        />
        <ImagePicker value={photo} onChange={setPhoto} />
        <button
          disabled={!petId || saving}
          onClick={() => void submit()}
          className="primary"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        {!petId && (
          <p className="text-xs text-[#C0452B] text-center">请先选择宠物</p>
        )}
      </div>
    </Sheet>
  );
}
function PetSelect({
  pets,
  value,
  onChange,
  allowShared = false,
}: {
  pets: PetProfile[];
  value: string;
  onChange: (v: string) => void;
  allowShared?: boolean;
}) {
  return (
    <label className="block text-xs text-[#264653]/55">
      归属
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="field mt-1"
      >
        <option value="">{allowShared ? "全家共用" : "请选择宠物"}</option>
        {pets.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}（{speciesText(p.species)}）
          </option>
        ))}
      </select>
    </label>
  );
}
function ImagePicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <button
        onClick={() => input.current?.click()}
        className="bg-[#F5F0E1] rounded-2xl px-4 py-2 text-sm flex gap-1"
      >
        <Camera size={16} />
        {busy ? "正在处理…" : value ? "更换照片" : "添加照片"}
      </button>
      {value && (
        <img src={value} className="mt-2 h-20 rounded-xl object-cover" />
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          setBusy(true);
          void imageFromFile(e.target.files?.[0])
            .then(onChange)
            .finally(() => setBusy(false));
        }}
      />
    </div>
  );
}
function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-[#264653]/40" />
      <section
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md bg-[#FFFDF6] rounded-t-[2rem] p-5 pb-8 max-h-[90dvh] overflow-y-auto"
      >
        <div className="flex justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Photos({ data }: { data: Data }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-5">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-bold">每日一萌</h2>
          <p className="text-xs text-[#264653]/50">每只宠物每天一张</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="bg-[#F4A261] text-white rounded-full px-4 py-2 text-sm flex gap-1"
        >
          <ImagePlus size={16} />
          添加
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {data.photos.map(p => {
          const pet = petById(data.activePets, p.petId);
          return (
            <figure key={p.id} className="bg-[#FFFDF6] rounded-3xl p-2">
              <img
                src={p.photo}
                className="w-full aspect-square rounded-2xl object-cover"
              />
              <figcaption className="p-2 text-xs">
                <b>{pet?.name ?? "已归档宠物"}</b>
                <span className="float-right text-[#264653]/40">{p.date}</span>
                <p className="mt-1 truncate">{p.caption || "今天也很可爱"}</p>
                <button
                  onClick={() => data.removeDailyPhoto(p.id)}
                  className="mt-2 text-[#C0452B]/60"
                >
                  删除
                </button>
              </figcaption>
            </figure>
          );
        })}
      </div>
      {!data.photos.length && (
        <p className="text-center py-20 text-[#264653]/40">还没有照片</p>
      )}
      {open && <PhotoSheet data={data} onClose={() => setOpen(false)} />}
    </div>
  );
}
function PhotoSheet({ data, onClose }: { data: Data; onClose: () => void }) {
  const [petId, setPetId] = useState(data.selectedPetId ?? "");
  const [photo, setPhoto] = useState<string>();
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const gallery = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  const load = (f?: File) => {
    if (!f) return;
    setReading(true);
    void imageFromFile(f)
      .then(setPhoto)
      .finally(() => setReading(false));
  };
  const save = async () => {
    if (!petId || !photo) return;
    setBusy(true);
    await data.setDailyPhoto(petId, today(), photo, caption.trim());
    onClose();
  };
  return (
    <Sheet title="添加今日照片" onClose={onClose}>
      <div className="space-y-3 mt-4">
        <PetSelect pets={data.activePets} value={petId} onChange={setPetId} />
        {reading ? (
          <div className="aspect-square bg-[#F5F0E1] rounded-3xl grid place-items-center">
            <RefreshCw className="animate-spin" />
            <span>正在处理照片…</span>
          </div>
        ) : photo ? (
          <img
            src={photo}
            className="w-full aspect-square object-cover rounded-3xl"
          />
        ) : (
          <div className="aspect-square bg-[#F5F0E1] rounded-3xl grid place-items-center text-[#264653]/40">
            <ImagePlus size={42} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => gallery.current?.click()}
            className="secondary"
          >
            从相册选择
          </button>
          <button onClick={() => camera.current?.click()} className="secondary">
            拍照
          </button>
        </div>
        <input
          ref={gallery}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => load(e.target.files?.[0])}
        />
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => load(e.target.files?.[0])}
        />
        <input
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="写一句话……"
          className="field"
        />
        <button
          onClick={() => void save()}
          disabled={!petId || !photo || busy || reading}
          className="primary"
        >
          {busy ? "正在保存…" : "保存今日照片"}
        </button>
      </div>
    </Sheet>
  );
}

function Supplies({ data }: { data: Data }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-5">
      <div className="flex justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">物品</h2>
          <p className="text-xs text-[#264653]/50">共用与专属用品统一管理</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="bg-[#F4A261] text-white rounded-full px-4 text-sm"
        >
          添加
        </button>
      </div>
      <div className="space-y-3">
        {data.supplies.map(item => (
          <SupplyCard
            key={item.id}
            item={item}
            pets={data.activePets}
            onStock={stock => data.updateSupply(item.id, { ...item, stock })}
            onDelete={() => data.removeSupply(item.id)}
          />
        ))}
      </div>
      {open && <SupplySheet data={data} onClose={() => setOpen(false)} />}
    </div>
  );
}
function SupplyCard({
  item: supply,
  pets,
  onStock,
  onDelete,
}: {
  item: SupplyItem;
  pets: PetProfile[];
  onStock: (stock: StockLevel) => unknown;
  onDelete: () => unknown;
}) {
  const owner = supply.petId ? petById(pets, supply.petId) : undefined;
  const expiry = expiryInfo(supply);
  return (
    <article className="bg-[#FFFDF6] rounded-3xl p-4 shadow-sm shadow-[#264653]/5">
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-2xl bg-[#F5F0E1] overflow-hidden flex items-center justify-center shrink-0">
          {supply.photo ? (
            <img
              src={supply.photo}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <Package size={22} className="text-[#264653]/30" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold truncate">
              {supply.brand && (
                <span className="text-[#264653]/55 font-normal text-sm mr-1">
                  {supply.brand}
                </span>
              )}
              {supply.name}
            </h3>
            <button
              onClick={onDelete}
              className="w-8 h-8 rounded-full bg-[#E76F51]/10 text-[#C0452B]/65 flex items-center justify-center shrink-0 active:scale-95 transition"
              aria-label={`删除${supply.name}`}
            >
              <Trash2 size={15} />
            </button>
          </div>
          {supply.variant && (
            <p className="text-xs text-[#264653]/55 mt-0.5">{supply.variant}</p>
          )}
          <p className="text-xs text-[#264653]/45 mt-1">
            {owner ? `${owner.name}专属` : "全家共用"} · {supply.category}
          </p>
          {expiry && (
            <p
              className={`text-xs mt-1 font-medium ${expiry.state === "expired" ? "text-[#C0452B]" : expiry.state === "soon" ? "text-[#9A7B1E]" : "text-[#264653]/45"}`}
            >
              {expiry.state === "expired"
                ? `已于 ${expiry.date} 过期（${expiry.days} 天前）`
                : `${expiry.date} 到期${expiry.state === "soon" ? `，还剩 ${expiry.days} 天` : ""}`}
            </p>
          )}
          {supply.note && (
            <p className="text-xs text-[#264653]/55 mt-1">{supply.note}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {(Object.keys(STOCK_META) as StockLevel[]).map(level => (
          <button
            key={level}
            onClick={() => onStock(level)}
            className={`text-xs px-3 py-2 rounded-full transition active:scale-95 ${supply.stock === level ? `${STOCK_META[level].cls} font-semibold ring-1 ring-current/15` : "bg-[#F5F0E1] text-[#264653]/45"}`}
          >
            {STOCK_META[level].label}
          </button>
        ))}
      </div>
    </article>
  );
}
function SupplySheet({ data, onClose }: { data: Data; onClose: () => void }) {
  const [petId, setPetId] = useState(data.selectedPetId ?? "");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [variant, setVariant] = useState("");
  const [category, setCategory] = useState(SUPPLY_CATEGORIES[0]);
  const [stock, setStock] = useState<StockLevel>("plenty");
  const [photo, setPhoto] = useState<string>();
  const [produceDate, setProduceDate] = useState("");
  const [shelfMonths, setShelfMonths] = useState("");
  const [note, setNote] = useState("");
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const expiryPreview = (() => {
    if (!produceDate || !shelfMonths) return "";
    const expiry = new Date(produceDate);
    expiry.setMonth(expiry.getMonth() + Number(shelfMonths));
    return `预计 ${expiry.getFullYear()} 年 ${expiry.getMonth() + 1} 月 ${expiry.getDate()} 日到期`;
  })();
  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    await data.addSupply({
      petId: petId || undefined,
      name: name.trim(),
      brand: brand.trim(),
      variant: variant.trim(),
      category,
      stock,
      photo,
      produceDate: produceDate || undefined,
      shelfMonths: shelfMonths ? Number(shelfMonths) : undefined,
      note: note.trim(),
    });
    onClose();
  };
  return (
    <Sheet title="添加物品" onClose={onClose}>
      <div className="space-y-3 mt-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-16 h-16 rounded-2xl border-2 border-dashed border-[#F4A261]/40 bg-[#F5F0E1]/60 flex items-center justify-center overflow-hidden shrink-0"
          >
            {readingPhoto ? (
              <RefreshCw size={20} className="animate-spin text-[#F4A261]" />
            ) : photo ? (
              <img src={photo} alt="" className="w-full h-full object-cover" />
            ) : (
              <Camera size={22} className="text-[#F4A261]" />
            )}
          </button>
          <p className="text-xs text-[#264653]/50">
            拍一张物品照片，
            <br />
            一眼认出是哪一款
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={event => {
              setReadingPhoto(true);
              void imageFromFile(event.target.files?.[0])
                .then(setPhoto)
                .finally(() => setReadingPhoto(false));
            }}
          />
        </div>
        <PetSelect
          pets={data.activePets}
          value={petId}
          onChange={setPetId}
          allowShared
        />
        <label className="block">
          <span className="text-xs text-[#264653]/50">名称 *</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="比如：全价冻干狗粮"
            className="field mt-1"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-[#264653]/50">品牌</span>
            <input
              value={brand}
              onChange={e => setBrand(e.target.value)}
              placeholder="比如：渴望"
              className="field mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs text-[#264653]/50">款式 / 规格</span>
            <input
              value={variant}
              onChange={e => setVariant(e.target.value)}
              placeholder="比如：鸡肉味 2kg"
              className="field mt-1"
            />
          </label>
        </div>
        <div>
          <span className="text-xs text-[#264653]/50">分类</span>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {SUPPLY_CATEGORIES.map(item => (
              <button
                type="button"
                key={item}
                onClick={() => setCategory(item)}
                className={`rounded-2xl py-2 text-sm transition ${category === item ? "bg-[#F4A261] text-white font-semibold" : "bg-[#F5F0E1] text-[#264653]/70"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-[#264653]/50">生产日期</span>
            <input
              type="date"
              value={produceDate}
              onChange={e => setProduceDate(e.target.value)}
              className="field mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs text-[#264653]/50">保质期（月）</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={shelfMonths}
              onChange={e => setShelfMonths(e.target.value)}
              placeholder="比如：18"
              className="field mt-1"
            />
          </label>
        </div>
        {expiryPreview && (
          <p className="text-xs text-[#9A7B1E] flex items-center gap-1">
            <AlarmClock size={12} />
            {expiryPreview}
          </p>
        )}
        <div>
          <span className="text-xs text-[#264653]/50">当前余量</span>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {(Object.keys(STOCK_META) as StockLevel[]).map(level => (
              <button
                type="button"
                key={level}
                onClick={() => setStock(level)}
                className={`rounded-2xl py-2 text-sm transition ${stock === level ? "bg-[#F4A261] text-white font-semibold" : "bg-[#F5F0E1] text-[#264653]/70"}`}
              >
                {STOCK_META[level].label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-xs text-[#264653]/50">备注</span>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="常买的店、大概能吃多久…"
            className="field mt-1"
          />
        </label>
        <button
          onClick={() => void save()}
          disabled={!name.trim() || saving || readingPhoto}
          className="primary"
        >
          {saving ? "正在保存…" : "保存物品"}
        </button>
      </div>
    </Sheet>
  );
}

function Me({
  data,
  onRecord,
}: {
  data: Data;
  onRecord: (t: RecordType) => void;
}) {
  return (
    <div className="space-y-6">
      <PetManager data={data} />
      <Stats
        records={data.records}
        pets={data.activePets}
        selectedPet={data.selectedPet}
        onRecord={onRecord}
      />
      <DataBackup data={data} />
    </div>
  );
}
function PetManager({ data }: { data: Data }) {
  const [editing, setEditing] = useState<PetProfile | "new">();
  const archived = data.pets.filter(p => p.archivedAt);
  return (
    <section className="px-5">
      <div className="flex justify-between mb-3">
        <h2 className="text-lg font-bold">宠物管理</h2>
        <button
          onClick={() => setEditing("new")}
          className="text-sm text-[#C76E2B] flex gap-1"
        >
          <Plus size={16} />
          添加宠物
        </button>
      </div>
      <div className="space-y-3">
        {data.activePets.map(p => (
          <article
            key={p.id}
            className="bg-[#FFFDF6] rounded-3xl p-4 flex gap-3 items-center"
          >
            <Avatar pet={p} size="lg" />
            <div className="flex-1">
              <h3 className="font-bold">{p.name}</h3>
              <p className="text-xs text-[#264653]/50">
                {speciesText(p.species)} · {p.breed || "品种待填写"}
              </p>
            </div>
            <button onClick={() => setEditing(p)}>
              <Pencil size={17} />
            </button>
            <button
              onClick={() => {
                if (confirm(`归档 ${p.name}？历史数据会保留。`))
                  void data.archivePet(p.id);
              }}
            >
              <Archive size={17} />
            </button>
          </article>
        ))}
        {archived.length > 0 && (
          <div>
            <p className="text-xs text-[#264653]/45 my-2">已归档</p>
            {archived.map(p => (
              <div
                key={p.id}
                className="bg-white/60 rounded-2xl p-3 flex justify-between mb-2"
              >
                <span>{p.name}</span>
                <span className="flex gap-3">
                  <button onClick={() => data.restorePet(p.id)}>
                    <ArchiveRestore size={17} />
                  </button>
                  <button
                    className="text-[#C0452B]"
                    onClick={() => {
                      if (
                        confirm(
                          `永久删除 ${p.name} 及其记录、照片和专属物品？此操作无法撤销。`
                        ) &&
                        prompt("请输入宠物名称确认") === p.name
                      )
                        void data.deletePet(p.id);
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {editing && (
        <PetForm
          initial={editing === "new" ? undefined : editing}
          onClose={() => setEditing(undefined)}
          onSave={async p => {
            if ("id" in p) await data.updatePet(p);
            else await data.createPet(p);
            setEditing(undefined);
          }}
        />
      )}
    </section>
  );
}
function PetForm({
  initial,
  onClose,
  onSave,
}: {
  initial?: PetProfile;
  onClose: () => void;
  onSave: (
    p: PetProfile | Omit<PetProfile, "id" | "archivedAt">
  ) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<Omit<PetProfile, "id" | "archivedAt">>({
    species: initial?.species ?? "dog",
    name: initial?.name ?? "",
    breed: initial?.breed ?? "",
    birthday: initial?.birthday ?? "",
    homeDate: initial?.homeDate ?? "",
    gender: initial?.gender ?? "boy",
    neutered: initial?.neutered ?? "",
    avatar: initial?.avatar,
  });
  const save = () =>
    onSave(
      initial
        ? { ...draft, id: initial.id, archivedAt: initial.archivedAt }
        : draft
    ).then(onClose);
  return (
    <Sheet title={initial ? "编辑宠物名片" : "添加宠物"} onClose={onClose}>
      <div className="space-y-3 mt-4">
        <div className="grid grid-cols-2 gap-2">
          {(["dog", "cat"] as const).map(s => (
            <button
              key={s}
              onClick={() => setDraft(d => ({ ...d, species: s }))}
              className={`secondary ${draft.species === s ? "!bg-[#F4A261] !text-white" : ""}`}
            >
              {s === "dog" ? "🐶 狗狗" : "🐱 猫咪"}
            </button>
          ))}
        </div>
        <input
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          placeholder="名字（必填）"
          className="field"
        />
        <input
          value={draft.breed}
          onChange={e => setDraft(d => ({ ...d, breed: e.target.value }))}
          placeholder="品种"
          className="field"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">
            生日
            <input
              type="date"
              value={draft.birthday}
              onChange={e =>
                setDraft(d => ({ ...d, birthday: e.target.value }))
              }
              className="field mt-1"
            />
          </label>
          <label className="text-xs">
            到家日
            <input
              type="date"
              value={draft.homeDate}
              onChange={e =>
                setDraft(d => ({ ...d, homeDate: e.target.value }))
              }
              className="field mt-1"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={draft.gender}
            onChange={e =>
              setDraft(d => ({
                ...d,
                gender: e.target.value as "boy" | "girl",
              }))
            }
            className="field"
          >
            <option value="boy">弟弟</option>
            <option value="girl">妹妹</option>
          </select>
          <select
            value={draft.neutered}
            onChange={e =>
              setDraft(d => ({
                ...d,
                neutered: e.target.value as "" | "yes" | "no",
              }))
            }
            className="field"
          >
            <option value="">绝育情况未知</option>
            <option value="yes">已绝育</option>
            <option value="no">未绝育</option>
          </select>
        </div>
        <ImagePicker
          value={draft.avatar}
          onChange={avatar => setDraft(d => ({ ...d, avatar }))}
        />
        <button
          disabled={!draft.name.trim()}
          onClick={() => void save()}
          className="primary"
        >
          保存名片
        </button>
      </div>
    </Sheet>
  );
}

function Stats({
  records,
  pets,
  selectedPet,
  onRecord,
}: {
  records: PetRecord[];
  pets: PetProfile[];
  selectedPet?: PetProfile;
  onRecord: (t: RecordType) => void;
}) {
  const [weekAgo] = useState(() => Date.now() - 7 * 86400000);
  const week = records.filter(r => +new Date(r.time) >= weekAgo);
  const count = (t: RecordType, a = records) =>
    a.filter(r => r.type === t).length;
  const cards: [string, string, RecordType][] = [
    ["本周活动", `${count("walk", week)} 次`, "walk"],
    ["本周喂食", `${count("feed", week)} 次`, "feed"],
    ["驱虫累计", `${count("deworm")} 次`, "deworm"],
    ["疫苗记录", `${count("vaccine")} 条`, "vaccine"],
    ["体检累计", `${count("checkup")} 次`, "checkup"],
    ["全部记录", `${records.length} 条`, "note"],
  ];
  const weightGroups = (selectedPet ? [selectedPet] : pets).map(p => ({
    pet: p,
    rows: records
      .filter(r => r.petId === p.id && r.type === "weight" && r.value != null)
      .slice(0, 20)
      .reverse(),
  }));
  return (
    <section className="px-5">
      <h2 className="font-bold mb-3">统计</h2>
      <div className="grid grid-cols-2 gap-3">
        {cards.map(([label, value, type]) => {
          const I = ICONS[type];
          return (
            <button
              key={label}
              onClick={() => onRecord(type)}
              className="bg-[#FFFDF6] rounded-3xl p-4 text-left"
            >
              <I size={18} />
              <b className="block text-xl mt-2">{value}</b>
              <span className="text-xs text-[#264653]/50">{label}</span>
            </button>
          );
        })}
      </div>
      <div className="bg-[#FFFDF6] rounded-3xl p-4 mt-3">
        <h3 className="font-bold">体重趋势</h3>
        {weightGroups.map(g => (
          <div key={g.pet.id} className="mt-3">
            <p className="text-xs font-semibold">{g.pet.name}</p>
            {g.rows.length >= 2 ? (
              <WeightChart data={g.rows} />
            ) : (
              <p className="text-xs text-[#264653]/40 py-4">
                至少记录两次体重后显示趋势
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
function WeightChart({ data }: { data: PetRecord[] }) {
  const W = 320,
    H = 110,
    P = 22,
    vals = data.map(d => d.value!),
    min = Math.min(...vals),
    max = Math.max(...vals),
    span = max - min || 1,
    x = (i: number) => P + (i / Math.max(data.length - 1, 1)) * (W - P * 2),
    y = (v: number) => H - P - ((v - min) / span) * (H - P * 2),
    pts = data.map((d, i) => `${x(i)},${y(d.value!)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <polyline points={pts} fill="none" stroke="#F4A261" strokeWidth="2.5" />
      {data.map((d, i) => (
        <circle key={d.id} cx={x(i)} cy={y(d.value!)} r="4" fill="#F4A261" />
      ))}
    </svg>
  );
}
function CardsEditor({ data, onClose }: { data: Data; onClose: () => void }) {
  const [draft, setDraft] = useState<HomeCardType[]>(data.homeCardTypes);
  const species = data.selectedPet!.species;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 6 },
    })
  );
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDraft(items =>
      arrayMove(
        items,
        items.indexOf(active.id as HomeCardType),
        items.indexOf(over.id as HomeCardType)
      )
    );
  };
  return (
    <Sheet title={`编辑${speciesText(species)}主页卡片`} onClose={onClose}>
      <p className="text-xs text-[#264653]/50 mt-2">
        此排序会应用到所有{speciesText(species)}。
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={draft} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 mt-4">
            {draft.map(type => (
              <SortableCard
                key={type}
                type={type}
                species={species}
                onRemove={() => setDraft(v => v.filter(item => item !== type))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <select
        value=""
        onChange={e => {
          if (e.target.value)
            setDraft(v => [...v, e.target.value as HomeCardType]);
        }}
        className="field mt-3"
      >
        <option value="">添加卡片……</option>
        {HOME_OPTIONS.filter(t => !draft.includes(t)).map(t => (
          <option key={t} value={t}>
            {typeMeta(t, species).label}
          </option>
        ))}
      </select>
      <button
        disabled={!draft.length}
        onClick={() => void data.setHomeCards(species, draft).then(onClose)}
        className="primary mt-3"
      >
        保存设置
      </button>
    </Sheet>
  );
}
function SortableCard({
  type,
  species,
  onRemove,
}: {
  type: HomeCardType;
  species: PetSpecies;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: type });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`secondary flex justify-between ${isDragging ? "shadow-lg opacity-90" : ""}`}
    >
      <button
        className="touch-none cursor-grab p-1"
        aria-label={`拖动${typeMeta(type, species).label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={17} />
      </button>
      <span className="flex-1 text-left">{typeMeta(type, species).label}</span>
      <button
        onClick={onRemove}
        aria-label={`移除${typeMeta(type, species).label}`}
      >
        <X size={16} />
      </button>
    </div>
  );
}
function DataBackup({ data }: { data: Data }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const exp = async () => {
    setBusy(true);
    try {
      const b = await data.createBackup();
      await saveBackupText(JSON.stringify(b));
      setNotice("备份已导出，包含全部宠物和照片");
    } catch {
      setNotice("导出失败");
    } finally {
      setBusy(false);
    }
  };
  const imp = async () => {
    setBusy(true);
    try {
      const text = await pickBackupText();
      if (!text) return;
      const b = parsePetBackupText(text);
      if (
        !confirm(
          `将用备份中的 ${b.pets.length} 只宠物整体替换当前数据，继续吗？`
        )
      )
        return;
      await data.restoreBackup(b);
      data.setSelectedPetId(undefined);
      setNotice("备份恢复完成");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="px-5 pb-6">
      <div className="bg-[#FFFDF6] rounded-3xl p-4">
        <h2 className="font-bold flex gap-2">
          <DatabaseBackup />
          本地备份
        </h2>
        <p className="text-xs text-[#264653]/50 mt-1">
          整库导出包含活动及归档宠物、记录、物品和照片。
        </p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            disabled={busy}
            onClick={() => void exp()}
            className="secondary"
          >
            <Download size={15} />
            导出备份
          </button>
          <button
            disabled={busy}
            onClick={() => void imp()}
            className="secondary"
          >
            <Upload size={15} />
            导入备份
          </button>
        </div>
        {notice && (
          <p className="text-xs mt-2 flex gap-1">
            <CheckCircle2 size={13} />
            {notice}
          </p>
        )}
      </div>
    </section>
  );
}
