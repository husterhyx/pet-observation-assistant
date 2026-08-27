export type RecordType =
  | 'feed'       // 喂食
  | 'walk'       // 遛狗
  | 'bath'       // 洗澡
  | 'weight'     // 体重
  | 'vaccine'    // 疫苗
  | 'deworm'     // 驱虫
  | 'checkup'    // 体检
  | 'vet'        // 就医
  | 'mood'       // 心情
  | 'note'       // 随手记
  | 'milestone'  // 大事件

export interface DogRecord {
  id: string
  type: RecordType
  title: string
  note: string
  time: string // ISO string
  value?: number // 体重 kg / 遛狗时长 min 等
  photo?: string // dataURL
}

export interface DogProfile {
  name: string
  breed: string
  birthday: string // YYYY-MM-DD
  gender: 'boy' | 'girl'
  avatar?: string // dataURL
}

export interface DailyPhoto {
  id: string
  date: string // YYYY-MM-DD
  photo: string // dataURL
  caption: string
}

export type StockLevel = 'plenty' | 'low' | 'empty'

export interface SupplyItem {
  id: string
  name: string
  category: string
  stock: StockLevel
  note: string
  updatedAt: string
}

export const RECORD_TYPE_META: Record<
  RecordType,
  { label: string; unit?: string; placeholder: string }
> = {
  feed:      { label: '喂食', placeholder: '吃了什么？比如：狗粮 80g + 鸡胸肉' },
  walk:      { label: '遛狗', unit: '分钟', placeholder: '去了哪里？玩了多久？' },
  bath:      { label: '洗澡', placeholder: '洗澡 / 美容 / 剪指甲…' },
  weight:    { label: '体重', unit: 'kg', placeholder: '今天称了体重' },
  vaccine:   { label: '疫苗', placeholder: '接种了什么疫苗？下次时间？' },
  deworm:    { label: '驱虫', placeholder: '体内 / 体外驱虫？用的什么药？下次时间？' },
  checkup:   { label: '体检', placeholder: '体检项目、结果、医生建议…' },
  vet:       { label: '就医', placeholder: '症状、诊断、用药…' },
  mood:      { label: '心情', placeholder: '今天心情怎么样？' },
  note:      { label: '随手记', placeholder: '此时此刻，想记什么就记什么' },
  milestone: { label: '大事件', placeholder: '值得纪念的大事！第一次握手、搬家、过生日…' },
}

export const SUPPLY_CATEGORIES = ['主粮', '零食', '玩具', '清洁', '药品', '其他']

export const STOCK_META: Record<StockLevel, { label: string; cls: string }> = {
  plenty: { label: '充足', cls: 'bg-[#A8DADC]/40 text-[#2A7F83]' },
  low:    { label: '不多了', cls: 'bg-[#E9C46A]/30 text-[#9A7B1E]' },
  empty:  { label: '要补货', cls: 'bg-[#E76F51]/15 text-[#C0452B]' },
}
