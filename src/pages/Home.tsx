import { useEffect, useRef, useState } from "react";
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
  ChevronDown,
  Check,
  ChevronRight,
  Sparkles,
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
  supplyCategoryTracksStock,
  type FamilyProfile,
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
function petAgeText(birthday: string) {
  if (!birthday) return "年龄待填写";
  const born = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(born.getTime())) return "年龄待填写";
  const now = new Date();
  const months = Math.max(
    0,
    (now.getFullYear() - born.getFullYear()) * 12 +
      now.getMonth() -
      born.getMonth() -
      (now.getDate() < born.getDate() ? 1 : 0)
  );
  if (months < 12) return `${Math.max(1, months)} 个月大`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} 岁 ${rest} 个月` : `${years} 岁`;
}
function togetherText(homeDate: string) {
  if (!homeDate) return "到家日待填写";
  const arrived = new Date(`${homeDate}T00:00:00`);
  if (Number.isNaN(arrived.getTime())) return "到家日待填写";
  const days = Math.max(
    0,
    Math.floor((Date.now() - arrived.getTime()) / 86_400_000)
  );
  return `相伴第 ${days + 1} 天`;
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
        <div className="relative">
          <span
            className={`absolute left-5 right-5 top-0 z-10 h-0.5 overflow-hidden rounded-full transition-opacity duration-150 ${data.isRefreshing ? "opacity-100" : "opacity-0"}`}
          >
            <span className="block h-full w-1/3 animate-pulse rounded-full bg-[#F4A261]" />
          </span>
          <div
            aria-busy={data.isRefreshing}
            className={`transition-opacity duration-200 ease-out ${data.isRefreshing ? "pointer-events-none opacity-55" : "opacity-100"}`}
          >
            {tab === "diary" && (
              <>
                <QuickPanel
                  key={
                    data.selectedPetId ??
                    `all:${data.activePets.map(p => p.id).join("|")}`
                  }
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
          </div>
        </div>
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
      {p ? (
        <Avatar pet={p} size="lg" />
      ) : (
        <FamilyAvatar profile={data.familyProfile} />
      )}
      <div className="min-w-0">
        <h1 className="text-2xl font-bold truncate">
          {p ? `${p.name}的小日子` : data.familyProfile.name}
        </h1>
        <p className="text-sm text-[#264653]/55">
          {data.isRefreshing
            ? p
              ? `${speciesText(p.species)} · ${p.breed || "品种待填写"} · 正在切换…`
              : `${data.activePets.length} 位家庭成员 · 正在汇总…`
            : p
              ? `${speciesText(p.species)} · ${p.breed || "品种待填写"} · ${data.records.length} 条记录`
              : `${data.activePets.length} 位家庭成员 · ${data.records.length} 条记录`}
        </p>
      </div>
    </header>
  );
}
function FamilyAvatar({ profile }: { profile: FamilyProfile }) {
  return (
    <span className="w-14 h-14 rounded-full bg-[#E8DCC4] shrink-0 overflow-hidden grid place-items-center">
      {profile.avatar ? (
        <img
          src={profile.avatar}
          alt="家庭头像"
          className="w-full h-full object-cover"
        />
      ) : (
        <PawPrint size={27} className="text-[#264653]/55" />
      )}
    </span>
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
  const species = data.selectedPet?.species;
  const [quickPetIds, setQuickPetIds] = useState<string[]>(() =>
    data.selectedPet ? [data.selectedPet.id] : data.activePets.map(p => p.id)
  );
  const [done, setDone] = useState<RecordType>();
  const [notice, setNotice] = useState<{
    text: string;
    tone: "error" | "success";
  }>();
  const targetPets = data.selectedPet
    ? [data.selectedPet]
    : data.activePets.filter(p => quickPetIds.includes(p.id));
  const allPetsSelected = quickPetIds.length === data.activePets.length;
  const toggleQuickPet = (id: string) => {
    setQuickPetIds(current =>
      current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id]
    );
    setNotice(undefined);
  };
  const quickRecord = async (type: RecordType) => {
    if (!targetPets.length) {
      setNotice({ text: "请至少选择一只要打卡的宠物", tone: "error" });
      return;
    }
    setNotice(undefined);
    const time = new Date().toISOString();
    try {
      const petIds = targetPets.map(pet => pet.id);
      const species = new Set(targetPets.map(pet => pet.species));
      await data.addRecord({
        petId: petIds[0],
        petIds,
        type,
        title:
          type === "walk" && species.size > 1
            ? "玩耍/遛狗"
            : typeMeta(type, targetPets[0].species).label,
        note: "",
        time,
      });
      setDone(type);
      if (!data.selectedPet) {
        setNotice({
          text: `已为 ${targetPets.length} 只宠物完成打卡`,
          tone: "success",
        });
      }
      window.setTimeout(
        () => setDone(current => (current === type ? undefined : current)),
        1200
      );
    } catch {
      setNotice({ text: "打卡未完成，请稍后重试", tone: "error" });
    }
  };
  return (
    <section className="px-5 mb-5">
      <div className="bg-[#FFFDF6] rounded-3xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs text-[#264653]/50 flex gap-1">
            <Zap size={13} className="text-[#F4A261]" />
            一键打卡
          </h2>
          {!data.selectedPet && (
            <span className="text-[10px] text-[#2A7F83]">
              已选 {quickPetIds.length}/{data.activePets.length}
            </span>
          )}
        </div>
        {!data.selectedPet && (
          <div className="rounded-2xl bg-[#F5F0E1]/80 p-2.5 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-[#264653]/55">
                选择打卡对象
              </span>
              <button
                onClick={() => {
                  setQuickPetIds(
                    allPetsSelected ? [] : data.activePets.map(p => p.id)
                  );
                  setNotice(undefined);
                }}
                className="text-[10px] font-semibold text-[#C76E2B] px-1"
              >
                {allPetsSelected ? "取消全选" : "全部选择"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.activePets.map(p => {
                const chosen = quickPetIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    aria-pressed={chosen}
                    onClick={() => toggleQuickPet(p.id)}
                    className={`rounded-full pl-1 pr-2.5 py-1 flex items-center gap-1.5 text-[11px] font-medium border transition active:scale-95 ${
                      chosen
                        ? "bg-[#FFFDF6] border-[#F4A261]/55 text-[#264653] shadow-sm"
                        : "bg-transparent border-[#264653]/10 text-[#264653]/40"
                    }`}
                  >
                    <span className={chosen ? "opacity-100" : "opacity-45"}>
                      <Avatar pet={p} />
                    </span>
                    {p.name}
                    <span
                      className={`w-4 h-4 rounded-full grid place-items-center ${
                        chosen
                          ? "bg-[#F4A261] text-white"
                          : "border border-[#264653]/20"
                      }`}
                    >
                      {chosen && <Check size={10} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
                {done === t
                  ? "已记下✓"
                  : t === "walk" && !data.selectedPet
                    ? "玩耍/遛狗"
                    : typeMeta(t, species).label}
              </button>
            );
          })}
        </div>
        {notice && (
          <p
            className={`mt-2 text-center text-xs ${notice.tone === "success" ? "text-[#2A7F83]" : "text-[#C0452B]"}`}
          >
            {notice.text}
          </p>
        )}
        {data.selectedPet && (
          <div className="border-t border-[#264653]/8 mt-4 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="font-semibold text-sm flex items-center gap-1.5">
                  <Sparkles size={15} className="text-[#E9A23B]" />
                  健康与成长
                </span>
                <p className="text-[10px] text-[#264653]/40 mt-0.5">
                  常用健康记录，轻触即可添加
                </p>
              </div>
              <button
                onClick={onEditCards}
                className="rounded-full bg-[#F4A261]/12 px-2.5 py-1.5 text-[11px] font-semibold text-[#C76E2B] flex items-center gap-1 active:scale-95 transition"
              >
                <SlidersHorizontal size={12} />
                编辑
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {data.homeCardTypes.map(t => {
                const I = ICONS[t];
                const label = typeMeta(t, species).label;
                return (
                  <button
                    key={t}
                    onClick={() => onDetailed(t)}
                    className="min-w-0 rounded-2xl bg-[#F5F0E1]/90 px-2 py-2.5 flex items-center justify-center gap-1.5 border border-transparent active:border-[#F4A261]/45 active:scale-95 transition"
                  >
                    <span className={`shrink-0 !bg-transparent ${COLORS[t]}`}>
                      <I size={15} />
                    </span>
                    <span className="min-w-0 text-[11px] font-medium text-[#264653]/70 truncate">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
        const linkedPets = r.petIds
          .map(id => petById(pets, id))
          .filter((pet): pet is PetProfile => Boolean(pet));
        const p = linkedPets[0];
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
                  {r.title || meta.label}
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
              {linkedPets.length > 0 && (
                <p className="text-[11px] text-[#2A7F83] mt-0.5">
                  {linkedPets.map(pet => pet.name).join("、")}
                </p>
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
  const [petIds, setPetIds] = useState<string[]>(() =>
    data.selectedPetId ? [data.selectedPetId] : data.activePets.map(p => p.id)
  );
  const [type, setType] = useState(initialType);
  const [note, setNote] = useState("");
  const [value, setValue] = useState("");
  const [time, setTime] = useState(() => localDateTimeValue());
  const [photo, setPhoto] = useState<string>();
  const [saving, setSaving] = useState(false);
  const selectedPets = petIds
    .map(id => petById(data.activePets, id))
    .filter((pet): pet is PetProfile => Boolean(pet));
  const p = selectedPets[0];
  const meta = typeMeta(type, p?.species);
  const submit = async () => {
    if (!petIds.length) return;
    setSaving(true);
    await data.addRecord({
      petId: petIds[0],
      petIds,
      type,
      title:
        type === "walk" &&
        new Set(selectedPets.map(pet => pet.species)).size > 1
          ? "玩耍/遛狗"
          : meta.label,
      note: note.trim(),
      time: new Date(time).toISOString(),
      value: meta.unit && value ? Number(value) : undefined,
      photo,
    });
    onSaved();
  };
  return (
    <Sheet onClose={onClose} title="记一笔">
      <PetMultiSelect
        pets={data.activePets}
        value={petIds}
        onChange={setPetIds}
        label="记录对象"
      />
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
                    {t === "walk" &&
                    new Set(selectedPets.map(pet => pet.species)).size > 1
                      ? "玩耍/遛狗"
                      : typeMeta(t, p?.species).label}
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
          disabled={!petIds.length || saving}
          onClick={() => void submit()}
          className="primary"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        {!petIds.length && (
          <p className="text-xs text-[#C0452B] text-center">
            请至少选择一只宠物
          </p>
        )}
      </div>
    </Sheet>
  );
}
function PetMultiSelect({
  pets,
  value,
  onChange,
  label = "归属",
  allowShared = false,
}: {
  pets: PetProfile[];
  value: string[];
  onChange: (value: string[]) => void;
  label?: string;
  allowShared?: boolean;
}) {
  const toggle = (id: string) =>
    onChange(
      value.includes(id) ? value.filter(item => item !== id) : [...value, id]
    );
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-[#264653]/55">{label}</span>
        {!allowShared && (
          <button
            type="button"
            onClick={() =>
              onChange(value.length === pets.length ? [] : pets.map(p => p.id))
            }
            className="text-[10px] font-semibold text-[#C76E2B]"
          >
            {value.length === pets.length ? "取消全选" : "全部选择"}
          </button>
        )}
      </div>
      <div className="rounded-2xl bg-[#F5F0E1]/80 p-2 flex flex-wrap gap-2">
        {allowShared && (
          <button
            type="button"
            aria-pressed={!value.length}
            onClick={() => onChange([])}
            className={`rounded-full px-3 py-2 text-[11px] font-medium border transition ${
              !value.length
                ? "bg-[#264653] border-[#264653] text-white"
                : "bg-[#FFFDF6] border-transparent text-[#264653]/50"
            }`}
          >
            全家共用
          </button>
        )}
        {pets.map(pet => {
          const selected = value.includes(pet.id);
          return (
            <button
              type="button"
              key={pet.id}
              aria-pressed={selected}
              onClick={() => toggle(pet.id)}
              className={`rounded-full pl-1 pr-2.5 py-1 flex items-center gap-1.5 text-[11px] font-medium border transition active:scale-95 ${
                selected
                  ? "bg-[#FFFDF6] border-[#F4A261]/55 text-[#264653] shadow-sm"
                  : "bg-transparent border-[#264653]/10 text-[#264653]/40"
              }`}
            >
              <span className={selected ? "opacity-100" : "opacity-45"}>
                <Avatar pet={pet} />
              </span>
              {pet.name}
              <span
                className={`w-4 h-4 rounded-full grid place-items-center ${
                  selected
                    ? "bg-[#F4A261] text-white"
                    : "border border-[#264653]/20"
                }`}
              >
                {selected && <Check size={10} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
function StyledSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  className = "",
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find(option => option.value === value);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-expanded={open}
        className={`field flex items-center justify-between gap-3 text-left ${open ? "ring-2 ring-[#F4A261]/45" : ""}`}
      >
        <span className={selected ? "text-[#264653]" : "text-[#264653]/45"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={17}
          className={`shrink-0 text-[#264653]/45 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-2xl border border-[#264653]/10 bg-[#FFFDF6] p-1.5 shadow-xl shadow-[#264653]/15">
          {options.map(option => (
            <button
              type="button"
              key={option.value || "empty"}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${option.value === value ? "bg-[#F4A261] text-white font-semibold" : "text-[#264653]/75 hover:bg-[#F5F0E1]"}`}
            >
              <span className="truncate">{option.label}</span>
              {option.value === value && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
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
  useEffect(() => {
    const body = document.body;
    const root = document.documentElement;
    const scrollY = window.scrollY;
    const previousBody = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    const previousOverscroll = root.style.overscrollBehavior;
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    return () => {
      Object.assign(body.style, previousBody);
      root.style.overscrollBehavior = previousOverscroll;
      window.scrollTo({ top: scrollY, left: 0, behavior: "instant" });
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center overflow-hidden overscroll-none"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-[#264653]/40" />
      <section
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md bg-[#FFFDF6] rounded-t-[2rem] p-5 pb-8 max-h-[90dvh] overflow-y-auto overscroll-contain touch-pan-y"
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
  const [petIds, setPetIds] = useState<string[]>(() =>
    data.selectedPetId
      ? [data.selectedPetId]
      : data.activePets.map(pet => pet.id)
  );
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
    if (!petIds.length || !photo) return;
    setBusy(true);
    try {
      for (const petId of petIds) {
        await data.setDailyPhoto(petId, today(), photo, caption.trim());
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="添加今日照片" onClose={onClose}>
      <div className="space-y-3 mt-4">
        <PetMultiSelect
          pets={data.activePets}
          value={petIds}
          onChange={setPetIds}
          label="照片里的宠物"
        />
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
          disabled={!petIds.length || !photo || busy || reading}
          className="primary"
        >
          {busy ? `正在保存到 ${petIds.length} 只宠物…` : "保存今日照片"}
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
  const owners = supply.petIds
    .map(id => petById(pets, id))
    .filter((pet): pet is PetProfile => Boolean(pet));
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
            {owners.length
              ? `${owners.map(owner => owner.name).join("、")}使用`
              : "全家共用"}{" "}
            · {supply.category}
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
      {supplyCategoryTracksStock(supply.category) && (
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
      )}
    </article>
  );
}
function SupplySheet({ data, onClose }: { data: Data; onClose: () => void }) {
  const [petIds, setPetIds] = useState<string[]>(() =>
    data.selectedPetId ? [data.selectedPetId] : []
  );
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
      petId: petIds[0],
      petIds,
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
        <PetMultiSelect
          pets={data.activePets}
          value={petIds}
          onChange={setPetIds}
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
        {supplyCategoryTracksStock(category) && (
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
        )}
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
    <div className="space-y-7 pb-2">
      <PetManager data={data} />
      <Stats
        records={data.records}
        pets={data.activePets}
        selectedPet={data.selectedPet}
        onRecord={onRecord}
      />
      <SettingsSection data={data} />
    </div>
  );
}
function SettingsSection({ data }: { data: Data }) {
  return (
    <section className="space-y-3">
      <div className="px-5">
        <p className="text-[11px] font-semibold tracking-[.18em] text-[#9A7B1E]">
          SETTINGS
        </p>
        <h2 className="text-lg font-bold mt-0.5">设置</h2>
        <p className="text-xs text-[#264653]/45 mt-0.5">
          管理家庭信息与本地数据
        </p>
      </div>
      <FamilyProfileCard data={data} />
      <DataBackup data={data} />
    </section>
  );
}
function FamilyProfileCard({ data }: { data: Data }) {
  const [name, setName] = useState(data.familyProfile.name);
  const [avatar, setAvatar] = useState(data.familyProfile.avatar);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(data.familyProfile.name);
    setAvatar(data.familyProfile.avatar);
  }, [data.familyProfile]);

  const save = async (nextAvatar = avatar) => {
    const nextName = name.trim() || data.familyProfile.name;
    setSaving(true);
    setNotice("");
    try {
      await data.updateFamilyProfile({ name: nextName, avatar: nextAvatar });
      setName(nextName);
      setNotice("家庭名片已保存");
    } catch {
      setNotice("保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  const chooseAvatar = async (file?: File) => {
    if (!file) return;
    setReading(true);
    setNotice("");
    try {
      const nextAvatar = await imageFromFile(file);
      setAvatar(nextAvatar);
      await save(nextAvatar);
    } catch {
      setNotice("图片处理失败，请重新选择");
    } finally {
      setReading(false);
      if (picker.current) picker.current.value = "";
    }
  };

  return (
    <section className="px-5">
      <div className="relative overflow-hidden rounded-[2rem] bg-[#264653] p-4 text-white shadow-sm">
        <span className="absolute -right-8 -top-12 h-36 w-36 rounded-full bg-[#A8DADC]/15" />
        <span className="absolute -bottom-14 left-20 h-28 w-28 rounded-full bg-[#F4A261]/12" />
        <div className="relative flex items-center gap-4">
          <button
            type="button"
            onClick={() => picker.current?.click()}
            disabled={reading || saving}
            aria-label="更换家庭头像"
            className="relative shrink-0 rounded-full border-2 border-white/70 p-1 shadow-sm active:scale-95 transition"
          >
            <FamilyAvatar profile={{ name, avatar }} />
            <span className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-[#F4A261] text-white grid place-items-center border-2 border-[#264653]">
              {reading ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Camera size={13} />
              )}
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold tracking-[.18em] text-[#A8DADC]">
              FAMILY NAME
            </p>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              maxLength={100}
              aria-label="家庭名称"
              className="mt-1 w-full border-b border-white/25 bg-transparent pb-1 text-xl font-bold text-white outline-none placeholder:text-white/35 focus:border-[#F4A261]"
              placeholder="给这个家起个名字"
            />
            <p className="mt-1 text-[10px] text-white/45">点击头像更换照片</p>
          </div>
        </div>
        <div className="relative mt-3 flex items-center justify-between gap-3">
          <span
            className={`text-[10px] ${notice.includes("失败") ? "text-[#F4A261]" : "text-white/55"}`}
          >
            {notice || "名称将显示在首页顶部"}
          </span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!name.trim() || saving || reading}
            className="rounded-full bg-[#F4A261] px-4 py-2 text-xs font-bold text-white disabled:opacity-45"
          >
            {saving ? "保存中…" : "保存名称"}
          </button>
        </div>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={event => void chooseAvatar(event.target.files?.[0])}
        />
      </div>
    </section>
  );
}
function PetManager({ data }: { data: Data }) {
  const [editing, setEditing] = useState<PetProfile | "new">();
  const archived = data.pets.filter(p => p.archivedAt);
  return (
    <section className="px-5">
      <div className="flex justify-between items-end mb-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[.18em] text-[#F4A261]">
            FAMILY PROFILE
          </p>
          <h2 className="text-lg font-bold mt-0.5 truncate">
            {data.familyProfile.name}
          </h2>
          <p className="text-xs text-[#264653]/45 mt-0.5">
            {data.activePets.length} 位家庭成员
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="shrink-0 rounded-full bg-[#F4A261] text-white pl-3 pr-3.5 py-2 text-xs font-semibold flex items-center gap-1 shadow-sm active:scale-95 transition"
        >
          <Plus size={16} />
          添加
        </button>
      </div>
      <div className="space-y-3">
        {data.activePets.map(p => {
          const recordCount = data.records.filter(r =>
            r.petIds.includes(p.id)
          ).length;
          return (
            <article
              key={p.id}
              className="relative overflow-hidden bg-[#FFFDF6] rounded-[1.75rem] p-4 shadow-sm border border-white"
            >
              <span className="absolute -right-8 -top-10 w-28 h-28 rounded-full bg-[#A8DADC]/20" />
              <div className="relative flex gap-3 items-center">
                <span className="p-1 rounded-full bg-white shadow-sm">
                  <Avatar pet={p} size="lg" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg truncate">{p.name}</h3>
                    <span className="rounded-full bg-[#F5F0E1] px-2 py-0.5 text-[10px] text-[#264653]/55">
                      {speciesText(p.species)}
                    </span>
                  </div>
                  <p className="text-xs text-[#264653]/50 mt-0.5 truncate">
                    {p.breed || "品种待填写"} ·{" "}
                    {p.gender === "girl" ? "妹妹" : "弟弟"}
                  </p>
                </div>
                <button
                  onClick={() => setEditing(p)}
                  aria-label={`编辑${p.name}`}
                  className="rounded-full bg-[#F4A261]/12 text-[#C76E2B] px-2.5 py-1.5 text-xs font-semibold flex items-center gap-1"
                >
                  <Pencil size={13} />
                  编辑
                </button>
              </div>
              <div className="relative grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-[#264653]/8">
                <div>
                  <b className="block text-xs">{petAgeText(p.birthday)}</b>
                  <span className="text-[9px] text-[#264653]/40">成长时光</span>
                </div>
                <div>
                  <b className="block text-xs">{togetherText(p.homeDate)}</b>
                  <span className="text-[9px] text-[#264653]/40">陪伴日记</span>
                </div>
                <div className="text-right">
                  <b className="block text-xs">{recordCount} 条</b>
                  <span className="text-[9px] text-[#264653]/40">生活记录</span>
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm(`归档 ${p.name}？历史数据会保留。`))
                    void data.archivePet(p.id);
                }}
                className="relative mt-3 text-[10px] text-[#264653]/38 flex items-center gap-1 ml-auto"
              >
                <Archive size={12} />
                归档这位成员
              </button>
            </article>
          );
        })}
        {archived.length > 0 && (
          <div className="rounded-3xl bg-[#264653]/5 p-3">
            <p className="text-xs font-semibold text-[#264653]/55 mb-2 flex items-center gap-1.5">
              <Archive size={13} /> 已归档成员
            </p>
            {archived.map(p => (
              <div
                key={p.id}
                className="bg-[#FFFDF6]/80 rounded-2xl p-3 flex items-center justify-between mb-2 last:mb-0"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Avatar pet={p} /> {p.name}
                </span>
                <span className="flex gap-2">
                  <button
                    aria-label={`恢复${p.name}`}
                    className="w-8 h-8 rounded-full bg-[#A8DADC]/30 grid place-items-center text-[#2A7F83]"
                    onClick={() => data.restorePet(p.id)}
                  >
                    <ArchiveRestore size={17} />
                  </button>
                  <button
                    aria-label={`永久删除${p.name}`}
                    className="w-8 h-8 rounded-full bg-[#E76F51]/10 grid place-items-center text-[#C0452B]"
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
          <StyledSelect<"boy" | "girl">
            value={draft.gender}
            onChange={gender => setDraft(d => ({ ...d, gender }))}
            placeholder="选择性别"
            options={[
              { value: "boy", label: "弟弟" },
              { value: "girl", label: "妹妹" },
            ]}
          />
          <StyledSelect<"" | "yes" | "no">
            value={draft.neutered}
            onChange={neutered => setDraft(d => ({ ...d, neutered }))}
            placeholder="绝育情况"
            options={[
              { value: "", label: "绝育情况未知" },
              { value: "yes", label: "已绝育" },
              { value: "no", label: "未绝育" },
            ]}
          />
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
      .filter(
        r => r.petIds.includes(p.id) && r.type === "weight" && r.value != null
      )
      .slice(0, 20)
      .reverse(),
  }));
  return (
    <section className="px-5">
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[.18em] text-[#2A7F83]">
            LIFE OVERVIEW
          </p>
          <h2 className="text-lg font-bold mt-0.5">生活统计</h2>
        </div>
        <span className="text-[10px] rounded-full bg-[#A8DADC]/25 text-[#2A7F83] px-2.5 py-1">
          {selectedPet ? selectedPet.name : "全家汇总"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {cards.map(([label, value, type], index) => {
          const I = ICONS[type];
          return (
            <button
              key={label}
              onClick={() => onRecord(type)}
              className="relative overflow-hidden bg-[#FFFDF6] rounded-3xl p-4 text-left shadow-sm border border-white active:scale-[.98] transition"
            >
              <span
                className={`w-9 h-9 rounded-2xl grid place-items-center ${COLORS[type]}`}
              >
                <I size={18} />
              </span>
              <b className="block text-xl mt-3 tracking-tight">{value}</b>
              <span className="text-xs text-[#264653]/50 mt-0.5 block">
                {label}
              </span>
              <ChevronRight
                size={14}
                className={`absolute right-3 top-4 ${index % 2 ? "text-[#2A7F83]/30" : "text-[#F4A261]/35"}`}
              />
            </button>
          );
        })}
      </div>
      <div className="bg-[#FFFDF6] rounded-3xl p-4 mt-3 shadow-sm border border-white">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-bold flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-[#E9C46A]/20 text-[#9A7B1E] grid place-items-center">
                <Scale size={16} />
              </span>
              体重趋势
            </h3>
            <p className="text-[10px] text-[#264653]/40 mt-1 ml-10">
              每位宠物独立记录
            </p>
          </div>
          <button
            onClick={() => onRecord("weight")}
            className="rounded-full bg-[#F4A261]/12 text-[#C76E2B] px-2.5 py-1.5 text-[10px] font-semibold shrink-0"
          >
            记录体重
          </button>
        </div>
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
  const available = HOME_OPTIONS.filter(type => !draft.includes(type));
  return (
    <Sheet title={`编辑${speciesText(species)}主页卡片`} onClose={onClose}>
      <div className="relative overflow-hidden rounded-3xl bg-[#F5F0E1] p-4 mt-4">
        <span className="absolute -right-5 -top-8 w-24 h-24 rounded-full bg-[#A8DADC]/25" />
        <div className="relative flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-[#FFFDF6] grid place-items-center text-[#F4A261] shadow-sm">
            <SlidersHorizontal size={21} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm">定制常用健康入口</h3>
            <p className="text-[10px] text-[#264653]/45 mt-0.5">
              长按拖动排序，设置会同步到所有{speciesText(species)}
            </p>
          </div>
          <span className="rounded-full bg-[#FFFDF6] px-2.5 py-1 text-[10px] font-semibold text-[#2A7F83]">
            {draft.length} 项
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between mt-5 mb-2">
        <h3 className="text-sm font-bold">主页显示</h3>
        <span className="text-[10px] text-[#264653]/40">按住左侧手柄拖动</span>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={draft} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {draft.map((type, index) => (
              <SortableCard
                key={type}
                type={type}
                index={index}
                species={species}
                onRemove={() => setDraft(v => v.filter(item => item !== type))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold">添加其他卡片</h3>
          <span className="text-[10px] text-[#264653]/40">
            还可添加 {available.length} 项
          </span>
        </div>
        {available.length ? (
          <div className="grid grid-cols-2 gap-2">
            {available.map(type => {
              const I = ICONS[type];
              return (
                <button
                  key={type}
                  onClick={() => setDraft(current => [...current, type])}
                  className="rounded-2xl bg-[#F5F0E1]/85 p-2.5 flex items-center gap-2 text-left active:scale-[.98] transition"
                >
                  <span
                    className={`w-8 h-8 rounded-xl grid place-items-center shrink-0 ${COLORS[type]}`}
                  >
                    <I size={16} />
                  </span>
                  <span className="text-xs font-semibold flex-1 truncate">
                    {typeMeta(type, species).label}
                  </span>
                  <Plus size={14} className="text-[#264653]/40" />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl bg-[#A8DADC]/20 text-[#2A7F83] p-3 text-xs text-center">
            所有卡片都已添加到主页
          </div>
        )}
      </div>
      <button
        disabled={!draft.length}
        onClick={() => void data.setHomeCards(species, draft).then(onClose)}
        className="primary mt-5"
      >
        保存主页设置
      </button>
    </Sheet>
  );
}
function SortableCard({
  type,
  index,
  species,
  onRemove,
}: {
  type: HomeCardType;
  index: number;
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
      className={`rounded-2xl bg-[#FFFDF6] border border-[#264653]/8 p-2.5 flex items-center gap-2.5 ${isDragging ? "shadow-xl opacity-95 scale-[1.02] z-10" : "shadow-sm"}`}
    >
      <button
        className="touch-none cursor-grab w-8 h-10 rounded-xl bg-[#F5F0E1] grid place-items-center text-[#264653]/35 shrink-0"
        aria-label={`拖动${typeMeta(type, species).label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>
      <span
        className={`w-10 h-10 rounded-2xl grid place-items-center shrink-0 ${COLORS[type]}`}
      >
        {(() => {
          const I = ICONS[type];
          return <I size={19} />;
        })()}
      </span>
      <span className="flex-1 min-w-0 text-left">
        <b className="block text-sm truncate">
          {typeMeta(type, species).label}
        </b>
        <small className="block text-[9px] text-[#264653]/38 mt-0.5">
          主页第 {index + 1} 项
        </small>
      </span>
      <button
        onClick={onRemove}
        aria-label={`移除${typeMeta(type, species).label}`}
        className="w-8 h-8 rounded-full bg-[#E76F51]/8 text-[#C0452B]/65 grid place-items-center shrink-0"
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
      <div className="relative overflow-hidden bg-[#264653] text-[#FFFDF6] rounded-[1.75rem] p-4 shadow-sm">
        <span className="absolute -right-10 -bottom-16 w-36 h-36 rounded-full bg-[#A8DADC]/10" />
        <div className="relative flex items-start gap-3">
          <span className="w-10 h-10 rounded-2xl bg-white/10 grid place-items-center text-[#A8DADC] shrink-0">
            <DatabaseBackup size={20} />
          </span>
          <div>
            <h2 className="font-bold">本地数据保险箱</h2>
            <p className="text-[10px] text-white/55 mt-1 leading-relaxed">
              备份包含全部宠物、生活记录、物品和照片，数据只保存在你的设备中。
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            disabled={busy}
            onClick={() => void exp()}
            className="relative rounded-2xl bg-[#FFFDF6] text-[#264653] py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Download size={15} />
            导出备份
          </button>
          <button
            disabled={busy}
            onClick={() => void imp()}
            className="relative rounded-2xl bg-white/10 text-white py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Upload size={15} />
            导入备份
          </button>
        </div>
        {notice && (
          <p className="relative text-[10px] text-[#A8DADC] mt-2 flex gap-1">
            <CheckCircle2 size={13} />
            {notice}
          </p>
        )}
      </div>
    </section>
  );
}
