// ค่าคงที่ที่หน้าจอแอปใช้ร่วมกัน
//
// หมายเหตุ: ตรรกะการแจ้งเตือนทั้งหมดย้ายไปอยู่ฝั่งเซิร์ฟเวอร์แล้ว
// (backend/SolarPushNotifications) เพราะเป็นทางเดียวที่แจ้งเตือนได้แม้ผู้ใช้ปิดแอปไปแล้ว
// แอปมีหน้าที่แค่ลงทะเบียน push token พร้อมภาษาที่เลือกไว้เท่านั้น
// เป้าหมาย KWh ตรงนี้ใช้แสดงผลบนหน้าจอ ส่วนเกณฑ์ที่ใช้แจ้งเตือนจริงตั้งอยู่ที่เซิร์ฟเวอร์

export const SOLAR_DATA_API_URL =
  "http://192.168.2.222:5154/api/get-solar-data";

// service แจ้งเตือน (backend/SolarPushNotifications) รันคนละพอร์ตกับ API ข้อมูลโซล่าเซลล์
export const PUSH_TOKEN_API_URL = "http://192.168.2.222:5155/api/push-tokens";

export const MONTH_KEYS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const SHIFT_TARGETS = {
  morning: 1556,
  afternoon: 5444,
  total: 7000,
};

export const NOTIFICATION_CHANNEL_ID = "solar-alerts";

export type SolarApiData = Record<string, string | number | null | undefined>;
export type ShiftName = "Morning" | "Afternoon" | "Total";
export type AlertLanguage = "TH" | "EN" | "KR";

export const toNumber = (value: string | number | null | undefined) => {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;

  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};
