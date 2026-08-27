export type RecordType =
  | 'feed'      // 喂食
  | 'walk'      // 遛狗
  | 'bath'      // 洗澡
  | 'weight'    // 体重
  | 'vaccine'   // 疫苗
  | 'vet'       // 就医
  | 'mood'      // 心情
  | 'note'      // 笔记

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

export const RECORD_TYPE_META: Record<
  RecordType,
  { label: string; unit?: string; placeholder: string }
> = {
  feed:    { label: '喂食', placeholder: '吃了什么？比如：狗粮 80g + 鸡胸肉' },
  walk:    { label: '遛狗', unit: '分钟', placeholder: '去了哪里？玩了多久？' },
  bath:    { label: '洗澡', placeholder: '洗澡 / 美容 / 剪指甲…' },
  weight:  { label: '体重', unit: 'kg', placeholder: '今天称了体重' },
  vaccine: { label: '疫苗', placeholder: '接种了什么疫苗？下次时间？' },
  vet:     { label: '就医', placeholder: '症状、诊断、用药…' },
  mood:    { label: '心情', placeholder: '今天心情怎么样？' },
  note:    { label: '笔记', placeholder: '想记录什么都可以' },
}
