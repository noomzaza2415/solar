import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

import { MONTH_KEYS } from "./solar-alerts";

// หมายเหตุประจำวัน — หนึ่งวันมีได้หนึ่งรายการ
//
// ใช้บันทึกเหตุการณ์ที่อธิบายว่าทำไมยอดผลิตไฟของวันนั้นผิดไปจากปกติ
// เช่น ล้างแผงตอนช่วง 21:00, ฝนตกทั้งวัน, หรือหยุดซ่อมบำรุงอินเวอร์เตอร์
// ถ้าไม่จดไว้ ยอดที่ต่ำกว่าเกณฑ์จะดูเหมือนระบบมีปัญหาทั้งที่เป็นงานตามแผน
//
// ใช้ข้อมูลชุดเดียวกับช่องหมายเหตุบนหน้าเว็บ D-IT (http://192.168.2.188:8080/solar)
// - อ่าน: คีย์ "{เดือน}-Remark-{วัน}" (เช่น Sep-Remark-24) ที่มากับข้อมูลโซล่าผ่าน Firestore
// - เขียน: POST ไปที่ API ข้อมูลโซล่าในวง แบบเดียวกับที่หน้าเว็บทำ
//
// API อยู่ในวง LAN เท่านั้น นอก Wi-Fi โรงงานจึงบันทึกขึ้นระบบไม่ได้
// ข้อความจะเก็บไว้ในเครื่องก่อน (isLocalOnly) แล้วลองส่งใหม่ตอนเปิดดูวันนั้นอีกครั้ง

/** ตัวเดียวกับที่หน้าเว็บ D-IT ใช้ รับ { month: "Sep", day: 24, remark: "..." } */
export const SOLAR_REMARK_SAVE_URL =
  "http://192.168.2.222:5154/api/save-solar-remark";

// นอกวงจะต่อไม่ติดจนหมดเวลา ถ้านานเกินผู้ใช้จะเห็น "กำลังบันทึก..." ค้างนาน
const REQUEST_TIMEOUT_MS = 8000;
const STORAGE_KEY_PREFIX = "solar-day-note:";
// เซิร์ฟเวอร์ในวงคัดลอกข้อมูลขึ้น Firestore ทุก 2 นาที + แอปดึงทุก 2 นาที
// ระหว่างนี้ข้อมูลที่ดึงมายังเป็นหมายเหตุเก่า ต้องไม่เอามาเขียนทับสิ่งที่เพิ่งบันทึก
const MIRROR_DELAY_MS = 10 * 60 * 1000;

/** จำนวนตัวอักษรสูงสุดต่อหนึ่งหมายเหตุ กันคนวางข้อความยาวจนกินพื้นที่เก็บ */
export const MAX_NOTE_LENGTH = 500;

export type DayNote = {
  /** วันที่รูปแบบ YYYY-MM-DD ตามเวลาของเครื่อง */
  date: string;
  text: string;
  /** เวลาที่เครื่องนี้บันทึกล่าสุด — null = มาจากระบบกลาง (ระบบไม่ได้เก็บเวลาไว้) */
  updatedAt: Date | null;
  /** true = ยังอยู่แค่ในเครื่องนี้ ส่งขึ้นระบบไม่สำเร็จ เครื่องอื่นและหน้าเว็บยังไม่เห็น */
  isLocalOnly: boolean;
};

/**
 * แปลง Date เป็นคีย์ YYYY-MM-DD ตามเวลาเครื่อง
 *
 * ไม่ใช้ toISOString() เพราะมันแปลงเป็น UTC ก่อน ทำให้หมายเหตุที่จดตอนดึก
 * (เช่น 21:00 ที่ไทย = 14:00 UTC ยังวันเดิม แต่ถ้าจดหลังเที่ยงคืนจะเด้งไปอีกวัน)
 * ไปตกอยู่ผิดวันบนเครื่องที่ตั้ง timezone ต่างกัน
 */
export const toDayNoteKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
};

/** คีย์หมายเหตุในข้อมูลโซล่า ไม่มีปีกำกับเหมือนคีย์อื่นของระบบ */
export const toRemarkDataKey = (date: Date) =>
  `${MONTH_KEYS[date.getMonth()]}-Remark-${date.getDate()}`;

// --- สิ่งที่เครื่องนี้เพิ่งบันทึกสำเร็จ ---
//
// เก็บในหน่วยความจำพอ ปิดแอปนานเกิน MIRROR_DELAY_MS ข้อมูลใน Firestore ก็ตามทันแล้ว

const recentSaves = new Map<string, { text: string; savedAt: number }>();

/**
 * หมายเหตุจากระบบกลาง ปรับด้วยสิ่งที่เครื่องนี้เพิ่งบันทึกไป
 *
 * หลังบันทึกไม่กี่นาที ข้อมูลที่ดึงจาก Firestore ยังเป็นข้อความเก่า
 * ถ้าเชื่อตามนั้นเลย หมายเหตุที่เพิ่งพิมพ์จะเด้งกลับเป็นของเดิมต่อหน้าผู้ใช้
 */
export const reconcileRemoteRemark = (dateKey: string, remote: string) => {
  const recent = recentSaves.get(dateKey);
  if (!recent) return remote;

  if (recent.text === remote || Date.now() - recent.savedAt > MIRROR_DELAY_MS) {
    recentSaves.delete(dateKey);
    return remote;
  }

  return recent.text;
};

// --- ที่เก็บในเครื่อง ---
//
// เก็บเฉพาะข้อความที่ยังส่งขึ้นระบบไม่สำเร็จ ส่งได้แล้วจะลบทิ้ง
// ของที่ไม่มี pending คือหมายเหตุรุ่นเก่า (ก่อนแอปบันทึกขึ้นระบบได้) ซึ่งเคยอยู่แค่ในเครื่อง

type StoredNote = {
  text: string;
  /** ISO string เพราะ AsyncStorage เก็บได้แต่ข้อความ */
  updatedAt: string | null;
  pending?: boolean;
};

type LocalNote = DayNote & { kind: "pending" | "legacy" };

const readLocalNoteAsync = async (dateKey: string): Promise<LocalNote | null> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY_PREFIX + dateKey);

    if (!stored) return null;

    const parsed = JSON.parse(stored) as StoredNote;
    const updatedAt = parsed.updatedAt ? new Date(parsed.updatedAt) : null;

    return {
      date: dateKey,
      text: typeof parsed.text === "string" ? parsed.text : "",
      updatedAt:
        updatedAt && Number.isFinite(updatedAt.getTime()) ? updatedAt : null,
      isLocalOnly: true,
      kind: parsed.pending ? "pending" : "legacy",
    };
  } catch {
    // อ่านไม่ได้หรือข้อมูลเสีย = ถือว่าไม่มีของค้างในเครื่อง ไม่ควรทำให้หน้าจอพัง
    return null;
  }
};

const writePendingNoteAsync = async (note: DayNote) => {
  try {
    const stored: StoredNote = {
      text: note.text,
      updatedAt: note.updatedAt?.toISOString() ?? null,
      pending: true,
    };

    await AsyncStorage.setItem(
      STORAGE_KEY_PREFIX + note.date,
      JSON.stringify(stored),
    );
  } catch {
    // เขียนไม่ลงก็แค่ลองส่งใหม่ไม่ได้ ยังดีกว่าทำให้ผู้ใช้พิมพ์ต่อไม่ได้
  }
};

// ลบเฉพาะเมื่อข้อความในเครื่องยังเป็นตัวที่เพิ่งส่งสำเร็จ
// ระหว่างรอส่ง ผู้ใช้อาจพิมพ์ต่อแล้วมีข้อความใหม่ค้างอยู่ ถ้าลบทิ้งจะไม่ได้ส่งซ้ำอีก
const removeSentNoteAsync = async (dateKey: string, sentText: string) => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY_PREFIX + dateKey);
    if (!stored || (JSON.parse(stored) as StoredNote).text !== sentText) return;

    await AsyncStorage.removeItem(STORAGE_KEY_PREFIX + dateKey);
  } catch {
    // ลบไม่ได้ รอบหน้าก็แค่ส่งข้อความเดิมซ้ำ ไม่เสียหาย
  }
};

// --- ระบบกลาง ---

const pushRemarkAsync = async (date: Date, text: string) => {
  await axios.post(
    SOLAR_REMARK_SAVE_URL,
    {
      month: MONTH_KEYS[date.getMonth()],
      day: date.getDate(),
      remark: text,
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );
};

// --- ตัวที่หน้าจอเรียกใช้ ---

/**
 * อ่านหมายเหตุของวันที่กำหนด
 *
 * @param remoteRemark ค่าของคีย์ {เดือน}-Remark-{วัน} จากข้อมูลโซล่าที่โหลดไว้แล้ว
 *
 * ถ้ามีข้อความที่ยังส่งไม่สำเร็จค้างในเครื่อง ให้แสดงอันนั้น (ผู้ใช้พิมพ์ทีหลังสุด)
 * ไม่ยิงเน็ตในนี้ หน้าจอจึงแก้ไขได้ทันที ส่วนการส่งซ้ำอยู่ที่ syncPendingNoteAsync
 */
export const loadDayNoteAsync = async (
  date: Date,
  remoteRemark: string | null,
): Promise<DayNote> => {
  const dateKey = toDayNoteKey(date);
  const local = await readLocalNoteAsync(dateKey);

  if (local?.kind === "pending") return local;

  const remote = reconcileRemoteRemark(dateKey, remoteRemark ?? "");

  // หมายเหตุรุ่นเก่าที่เคยจดไว้แค่ในเครื่อง ยังแสดงให้เห็นถ้าระบบกลางไม่มีของวันนั้น
  // ไม่ส่งขึ้นระบบเองโดยพลการ ต้องให้ผู้ใช้แก้แล้วบันทึกเอง
  if (!remote && local?.kind === "legacy" && local.text) return local;

  return { date: dateKey, text: remote, updatedAt: null, isLocalOnly: false };
};

/**
 * ลองส่งข้อความที่ค้างในเครื่องขึ้นระบบอีกครั้ง
 *
 * คืนหมายเหตุที่ส่งสำเร็จแล้ว หรือ null ถ้าไม่มีของค้าง/ยังส่งไม่ได้
 */
export const syncPendingNoteAsync = async (
  date: Date,
): Promise<DayNote | null> => {
  const dateKey = toDayNoteKey(date);
  const local = await readLocalNoteAsync(dateKey);

  if (local?.kind !== "pending") return null;

  try {
    await pushRemarkAsync(date, local.text);
  } catch {
    return null;
  }

  recentSaves.set(dateKey, { text: local.text, savedAt: Date.now() });
  await removeSentNoteAsync(dateKey, local.text);

  return { ...local, isLocalOnly: false };
};

/**
 * บันทึกหมายเหตุของวันที่กำหนดขึ้นระบบกลาง
 *
 * เขียนลงเครื่องก่อนเสมอ แล้วค่อยส่งขึ้นระบบ ถ้าส่งไม่สำเร็จ (อยู่นอก Wi-Fi โรงงาน)
 * จะคืน isLocalOnly เป็น true เพื่อให้หน้าจอบอกผู้ใช้ได้ว่าหมายเหตุนี้ยังไม่ถูกส่ง
 * แทนที่จะขึ้นว่า "บันทึกแล้ว" ทั้งที่ของยังไปไม่ถึงไหน
 */
export const saveDayNoteAsync = async (
  date: Date,
  text: string,
): Promise<DayNote> => {
  const dateKey = toDayNoteKey(date);
  const trimmed = text.trim().slice(0, MAX_NOTE_LENGTH);
  const note: DayNote = {
    date: dateKey,
    text: trimmed,
    updatedAt: new Date(),
    isLocalOnly: true,
  };

  await writePendingNoteAsync(note);

  try {
    await pushRemarkAsync(date, trimmed);
  } catch {
    return note;
  }

  recentSaves.set(dateKey, { text: trimmed, savedAt: Date.now() });
  await removeSentNoteAsync(dateKey, trimmed);

  return { ...note, isLocalOnly: false };
};
