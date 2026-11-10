import type { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import type { AlertLanguage } from "./solar-alerts";

// สภาพอากาศประจำกะ ที่ระบบต้นทาง (API ในวง) บันทึกไว้คู่กับยอดผลิต
//
// คีย์เป็นรูปแบบ "{เดือน}-W-{กะ}-{วัน}" เช่น "Sep-W-Morning-24"
// ค่าเป็นข้อความไทยรูปแบบ "26.3°C มีฝนตก" หรือ "ไม่ระบุสภาพอากาศ" เมื่อระบบต้นทางไม่ได้วัด
// เป็นข้อมูลจริงจากหน้างาน ช่วยอธิบายว่ายอดต่ำเพราะฟ้าฝนหรือเพราะเครื่องมีปัญหา

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export type ShiftWeather = {
  /** อุณหภูมิ °C — null เมื่อข้อความไม่มีตัวเลขอุณหภูมิ */
  temperature: number | null;
  /** สภาพอากาศแปลตามภาษาที่เลือก (ถ้ารู้จัก) ไม่งั้นเป็นข้อความเดิมจากระบบต้นทาง */
  condition: string;
  icon: IconName;
};

// เรียงจากเจาะจงไปกว้าง: "มีฝนตกมาก" ต้องเช็คก่อน "มีฝนตก" ไม่งั้นจะได้ฝนธรรมดา
const CONDITIONS: {
  match: RegExp;
  icon: IconName;
  label: Record<AlertLanguage, string>;
}[] = [
  {
    match: /พายุ|ฟ้าคะนอง|ฟ้าผ่า/,
    icon: "weather-lightning-rainy",
    label: { TH: "มีพายุฝนฟ้าคะนอง", EN: "Thunderstorm", KR: "뇌우" },
  },
  {
    match: /ฝนตกมาก|ฝนตกหนัก|ฝนหนัก/,
    icon: "weather-pouring",
    label: { TH: "มีฝนตกมาก", EN: "Heavy rain", KR: "폭우" },
  },
  {
    match: /ฝน/,
    icon: "weather-rainy",
    label: { TH: "มีฝนตก", EN: "Rain", KR: "비" },
  },
  {
    match: /หมอก/,
    icon: "weather-fog",
    label: { TH: "มีหมอก", EN: "Fog", KR: "안개" },
  },
  {
    match: /เมฆมาก|ครึ้ม/,
    icon: "weather-cloudy",
    label: { TH: "มีเมฆมาก", EN: "Cloudy", KR: "흐림" },
  },
  {
    match: /เมฆ/,
    icon: "weather-partly-cloudy",
    label: { TH: "มีเมฆบางส่วน", EN: "Partly cloudy", KR: "구름 조금" },
  },
  {
    match: /แจ่มใส|แดด/,
    icon: "weather-sunny",
    label: { TH: "ท้องฟ้าแจ่มใส", EN: "Clear", KR: "맑음" },
  },
];

const TEMPERATURE_PATTERN = /(-?\d+(?:\.\d+)?)\s*°\s*C/i;

/**
 * แปลงข้อความสภาพอากาศจากระบบต้นทางให้พร้อมแสดงผล
 *
 * คืน null เมื่อไม่มีข้อมูลที่ใช้ได้ ("ไม่ระบุสภาพอากาศ", ค่าว่าง, หรือไม่ใช่ข้อความ)
 * เพื่อให้การ์ดซ่อนบรรทัดนี้ไปเลย แทนที่จะโชว์คำว่า "ไม่ระบุ" ให้รกหน้าจอ
 */
export const parseShiftWeather = (
  raw: unknown,
  language: AlertLanguage,
): ShiftWeather | null => {
  if (typeof raw !== "string") return null;

  const text = raw.trim();
  if (!text || text.includes("ไม่ระบุ")) return null;

  const temperatureMatch = TEMPERATURE_PATTERN.exec(text);
  const temperature = temperatureMatch ? Number(temperatureMatch[1]) : null;
  const conditionText = text.replace(TEMPERATURE_PATTERN, "").trim();
  const known = CONDITIONS.find((condition) =>
    condition.match.test(conditionText),
  );

  return {
    temperature:
      temperature !== null && Number.isFinite(temperature) ? temperature : null,
    // สภาพอากาศแบบที่ไม่รู้จัก ยังแสดงข้อความเดิมไว้ ดีกว่าทิ้งข้อมูลจริงไป
    condition: known ? known.label[language] : conditionText,
    icon: known ? known.icon : "thermometer",
  };
};
