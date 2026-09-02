export type RecordType =
  // 养育
  | "feed" // 喂食
  | "water" // 喂水
  | "walk" // 遛狗
  | "weight" // 体重
  // 清洁
  | "bath" // 洗澡
  | "groom" // 美容
  | "poop" // 尿便
  // 健康
  | "vaccine" // 疫苗
  | "deworm" // 驱虫
  | "checkup" // 体检
  | "vet" // 就医
  | "meds" // 用药
  // 日常
  | "mood" // 心情
  | "note" // 随手记
  | "milestone"; // 大事件

export type PetSpecies = "dog" | "cat";

export interface PetRecord {
  id: string;
  petId: string;
  petIds: string[];
  type: RecordType;
  title: string;
  note: string;
  time: string; // ISO string
  value?: number; // 体重 kg / 遛狗时长 min 等
  photo?: string; // dataURL
}

export interface PetProfile {
  id: string;
  species: PetSpecies;
  name: string;
  breed: string;
  birthday: string; // YYYY-MM-DD
  homeDate: string; // 到家日 YYYY-MM-DD
  gender: "boy" | "girl";
  neutered: "yes" | "no" | ""; // 是否绝育
  avatar?: string; // dataURL
  archivedAt?: string;
}

export interface DailyPhoto {
  id: string;
  petId: string;
  date: string; // YYYY-MM-DD
  photo: string; // dataURL
  caption: string;
}

export type StockLevel = "plenty" | "low" | "empty";

export interface SupplyItem {
  id: string;
  petId?: string;
  petIds: string[];
  name: string;
  brand: string; // 品牌
  variant: string; // 款式 / 口味 / 规格
  category: string;
  stock: StockLevel;
  photo?: string; // dataURL
  produceDate?: string; // 生产日期 YYYY-MM-DD
  shelfMonths?: number; // 保质期（月）
  note: string;
  updatedAt: string;
}

/** 保质期状态：根据生产日期 + 保质期月数推算 */
export function expiryInfo(
  s: SupplyItem
):
  | { state: "expired"; days: number; date: string }
  | { state: "soon"; days: number; date: string }
  | { state: "ok"; days: number; date: string }
  | null {
  if (!s.produceDate || !s.shelfMonths) return null;
  const exp = new Date(s.produceDate);
  exp.setMonth(exp.getMonth() + s.shelfMonths);
  const days = Math.round(
    (+exp - +new Date(new Date().toDateString())) / 86400000
  );
  const date = `${exp.getFullYear()}-${String(exp.getMonth() + 1).padStart(2, "0")}-${String(exp.getDate()).padStart(2, "0")}`;
  if (days < 0) return { state: "expired", days: -days, date };
  if (days <= 30) return { state: "soon", days, date };
  return { state: "ok", days, date };
}

export const RECORD_TYPE_META: Record<
  RecordType,
  { label: string; unit?: string; placeholder: string }
> = {
  feed: { label: "喂食", placeholder: "吃了什么？比如：狗粮 80g + 鸡胸肉" },
  water: { label: "喂水", placeholder: "喝水情况怎么样？" },
  walk: { label: "遛狗", unit: "分钟", placeholder: "去了哪里？玩了多久？" },
  weight: { label: "体重", unit: "kg", placeholder: "今天称了体重" },
  bath: { label: "洗澡", placeholder: "洗澡 / 吹毛 / 剪指甲…" },
  groom: { label: "美容", placeholder: "修毛造型、挤肛门腺、清理耳朵…" },
  poop: { label: "尿便", placeholder: "便便形态、颜色、次数，有异常吗？" },
  vaccine: { label: "疫苗", placeholder: "接种了什么疫苗？下次时间？" },
  deworm: {
    label: "驱虫",
    placeholder: "体内 / 体外驱虫？用的什么药？下次时间？",
  },
  checkup: { label: "体检", placeholder: "体检项目、结果、医生建议…" },
  vet: { label: "就医", placeholder: "症状、诊断、用药…" },
  meds: { label: "用药", placeholder: "药名、剂量、一天几次…" },
  mood: { label: "心情", placeholder: "今天心情怎么样？" },
  note: { label: "随手记", placeholder: "此时此刻，想记什么就记什么" },
  milestone: {
    label: "大事件",
    placeholder: "值得纪念的大事！第一次握手、搬家、过生日…",
  },
};

/** 记录类型分组（向宠本本看齐：养育 / 清洁 / 健康 / 日常） */
export const RECORD_GROUPS: { name: string; types: RecordType[] }[] = [
  { name: "养育", types: ["feed", "water", "walk", "weight"] },
  { name: "清洁", types: ["bath", "groom", "poop"] },
  { name: "健康", types: ["vaccine", "deworm", "checkup", "vet", "meds"] },
  { name: "日常", types: ["mood", "note", "milestone"] },
];

export const SUPPLY_CATEGORIES = [
  "主粮",
  "零食",
  "玩具",
  "清洁",
  "药品",
  "其他",
];

const STOCKED_SUPPLY_CATEGORIES = new Set(["主粮", "零食", "清洁", "药品"]);

export function supplyCategoryTracksStock(category: string) {
  return STOCKED_SUPPLY_CATEGORIES.has(category);
}

export const STOCK_META: Record<StockLevel, { label: string; cls: string }> = {
  plenty: { label: "充足", cls: "bg-[#A8DADC]/40 text-[#2A7F83]" },
  low: { label: "不多了", cls: "bg-[#E9C46A]/30 text-[#9A7B1E]" },
  empty: { label: "要补货", cls: "bg-[#E76F51]/15 text-[#C0452B]" },
};
