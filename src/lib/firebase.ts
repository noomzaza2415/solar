import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

import type { SolarApiData } from "./solar-alerts";

// อ่านข้อมูลโซล่าจาก Cloud Firestore
//
// API ตัวจริง (http://192.168.2.222:5154) อยู่ในวง LAN เท่านั้น เครื่องนอกวงจึงยิงไม่ถึง
// service ฝั่งเซิร์ฟเวอร์ (backend/SolarPushNotifications) ที่อยู่ในวงจะคัดลอกข้อมูล
// ขึ้น document นี้ทุก 2 นาที แอปทุกเครื่องจึงอ่านจาก Firestore ที่เดียว ไม่ว่าจะอยู่ในวงหรือไม่
//
// ใช้ REST ล้วน ๆ ไม่ลง SDK ของ Firebase เพราะ:
// - firebase JS SDK ต้องใช้ตัวจัดการ persistence ของ React Native เพิ่ม
// - @react-native-firebase เป็น native module ต้อง build ใหม่ทั้ง iOS/Android และใช้บนเว็บไม่ได้
// REST ทำงานได้เหมือนกันทั้ง Android, iOS และเว็บที่ export ไว้ โดยไม่ต้องแตะฝั่ง native

export const FIREBASE_PROJECT_ID = "solar-869ec";

/**
 * Web API key ของโปรเจกต์ (Firebase Console > Project settings > General)
 *
 * คีย์นี้เปิดเผยได้ตามการออกแบบของ Firebase ตัวมันเองไม่ให้สิทธิ์อ่านข้อมูล
 * สิทธิ์จริงมาจาก Firestore rules ที่ยอมให้เฉพาะผู้ที่ล็อกอินแล้วอ่านได้เท่านั้น
 *
 * ถ้าเจอ error "requests-from-referer/api-key-not-valid" ให้มาเปลี่ยนคีย์ตรงนี้
 * เป็น Web API key ในคอนโซล เพราะคีย์ที่ติดมากับ google-services.json เป็นคีย์ของฝั่ง Android
 * ซึ่งอาจถูกจำกัดให้ใช้ได้เฉพาะแอป Android
 */
export const FIREBASE_API_KEY = "AIzaSyD39rug3gqsbUMJd2xrhtDj6SXBGMib24s";

const FIRESTORE_DATABASE_ID = "(default)";

/** ต้องตรงกับ Firestore:DocumentPath ของฝั่งเซิร์ฟเวอร์ */
const SOLAR_SNAPSHOT_DOCUMENT = "solar/snapshot";

export const SOLAR_SNAPSHOT_URL =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
  `/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}` +
  `/documents/${SOLAR_SNAPSHOT_DOCUMENT}`;

// เก็บ refresh token ไว้ เพื่อให้เครื่องเดิมกลับมาเป็นผู้ใช้ anonymous คนเดิมทุกครั้งที่เปิดแอป
// ไม่งั้นทุกครั้งที่เปิดแอปจะได้บัญชี anonymous ใหม่ จนจำนวนผู้ใช้ในคอนโซลบวมโดยเปล่าประโยชน์
const REFRESH_TOKEN_STORAGE_KEY = "solar-firebase-refresh-token";

const AUTH_TIMEOUT_MS = 15000;
const READ_TIMEOUT_MS = 20000;

type FirestoreValue = {
  doubleValue?: number | string;
  integerValue?: string;
  stringValue?: string;
  booleanValue?: boolean;
  nullValue?: null;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

type FirestoreDocument = {
  fields?: Record<string, FirestoreValue>;
};

export type SolarSnapshot = {
  /** ข้อมูลรูปแบบเดียวกับที่ API ตัวจริงส่งมา เช่น { "Sep-Morning-1": 1234.5 } */
  data: SolarApiData;
  /** เวลาที่เซิร์ฟเวอร์อ่านข้อมูลชุดนี้มาจาก API จริง (null = document เก่าที่ยังไม่มีฟิลด์นี้) */
  updatedAt: Date | null;
};

type AuthSession = {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
};

let session: AuthSession | null = null;
// กันกรณีหลายที่เรียกพร้อมกันตอนเปิดแอป จะได้ไม่สร้างผู้ใช้ anonymous ซ้อนกันหลายคน
let pendingSignIn: Promise<AuthSession> | null = null;

const readStoredRefreshToken = async () => {
  try {
    return await AsyncStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    // อ่านที่เก็บไม่ได้ก็แค่เสียเวลาสมัคร anonymous ใหม่ ไม่ควรทำให้หน้าจอพัง
    return null;
  }
};

const storeRefreshToken = async (refreshToken: string) => {
  try {
    await AsyncStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
  } catch {
    // จำไม่ได้ก็แค่ได้บัญชี anonymous ใหม่ในครั้งถัดไป
  }
};

const toSession = (
  idToken: string,
  refreshToken: string,
  expiresInSeconds: number,
): AuthSession => ({
  idToken,
  refreshToken,
  // หักออก 60 วินาที เผื่อ token หมดอายุระหว่างที่ request กำลังเดินทาง
  expiresAt: Date.now() + Math.max(60, expiresInSeconds - 60) * 1000,
});

const signUpAnonymouslyAsync = async (): Promise<AuthSession> => {
  const { data } = await axios.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    { returnSecureToken: true },
    { timeout: AUTH_TIMEOUT_MS },
  );

  const next = toSession(
    data.idToken,
    data.refreshToken,
    Number(data.expiresIn) || 3600,
  );

  await storeRefreshToken(next.refreshToken);
  return next;
};

const refreshSessionAsync = async (
  refreshToken: string,
): Promise<AuthSession> => {
  // ปลายทางนี้รับเฉพาะ form-urlencoded ส่ง JSON ไปจะได้ 400 กลับมา
  // ต่อสตริงเองแทน URLSearchParams เพราะ polyfill ของ React Native ยังไม่ครบทุกเวอร์ชัน
  const body =
    "grant_type=refresh_token" +
    `&refresh_token=${encodeURIComponent(refreshToken)}`;

  const { data } = await axios.post(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
    body,
    {
      timeout: AUTH_TIMEOUT_MS,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );

  const next = toSession(
    data.id_token,
    data.refresh_token,
    Number(data.expires_in) || 3600,
  );

  await storeRefreshToken(next.refreshToken);
  return next;
};

const createSessionAsync = async (): Promise<AuthSession> => {
  const storedRefreshToken = await readStoredRefreshToken();

  if (storedRefreshToken) {
    try {
      return await refreshSessionAsync(storedRefreshToken);
    } catch (error) {
      // refresh token ถูกเพิกถอน (เช่น ลบผู้ใช้ทิ้งในคอนโซล) ก็สมัคร anonymous ใหม่แทน
      console.log("Firebase refresh failed, signing in again", error);
    }
  }

  return signUpAnonymouslyAsync();
};

/**
 * ขอ idToken ของผู้ใช้ anonymous ไว้แนบไปกับการอ่าน Firestore
 * ใช้ Anonymous Authentication เพื่อให้ rules ปิดข้อมูลจากคนที่ไม่ได้ใช้แอปได้
 * (ถ้าเปิด read สาธารณะ ใครรู้ URL ก็ดึงยอดผลิตไฟทั้งปีไปได้)
 */
export const getIdTokenAsync = async (forceRefresh = false) => {
  if (!forceRefresh && session && Date.now() < session.expiresAt) {
    return session.idToken;
  }

  if (!pendingSignIn) {
    pendingSignIn = createSessionAsync().finally(() => {
      pendingSignIn = null;
    });
  }

  session = await pendingSignIn;
  return session.idToken;
};

/** ลืม session ปัจจุบัน เรียกเมื่อ Firestore ตอบว่า token ใช้ไม่ได้ */
const clearSession = () => {
  session = null;
};

const readFirestoreValue = (
  value: FirestoreValue | undefined,
): string | number | null => {
  if (!value) return null;

  if (value.doubleValue !== undefined) {
    const parsed = Number(value.doubleValue);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value.integerValue !== undefined) {
    const parsed = Number(value.integerValue);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value.stringValue !== undefined) return value.stringValue;
  if (value.booleanValue !== undefined) return value.booleanValue ? 1 : 0;

  return null;
};

const readSnapshot = (document: FirestoreDocument): SolarSnapshot => {
  const fields = document.fields ?? {};
  const values = fields.values?.mapValue?.fields ?? {};

  const data: SolarApiData = {};

  Object.entries(values).forEach(([key, value]) => {
    data[key] = readFirestoreValue(value);
  });

  const updatedAtText = fields.updatedAt?.timestampValue;
  const updatedAt = updatedAtText ? new Date(updatedAtText) : null;

  return {
    data,
    updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null,
  };
};

const getSnapshotDocumentAsync = async (idToken: string) => {
  const { data } = await axios.get<FirestoreDocument>(SOLAR_SNAPSHOT_URL, {
    timeout: READ_TIMEOUT_MS,
    headers: { Authorization: `Bearer ${idToken}` },
  });

  return data;
};

/**
 * ดึงข้อมูลโซล่าล่าสุดที่เซิร์ฟเวอร์อัปโหลดไว้
 *
 * โยน error ออกไปให้ผู้เรียกจัดการเสมอ ไม่กลืนแล้วคืนข้อมูลว่าง ๆ
 * เพราะหน้าจอต้องแยกให้ออกระหว่าง "ต่อไม่ได้" กับ "ต่อได้แต่ยังไม่มีข้อมูลของกะนั้น"
 */
export const fetchSolarSnapshotAsync = async (): Promise<SolarSnapshot> => {
  const idToken = await getIdTokenAsync();

  try {
    return readSnapshot(await getSnapshotDocumentAsync(idToken));
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;

    // 401/403 มักแปลว่า token หมดอายุระหว่างแอปหลับอยู่ ลองใหม่อีกครั้งด้วย token สด
    if (status === 401 || status === 403) {
      clearSession();
      const freshToken = await getIdTokenAsync(true);
      return readSnapshot(await getSnapshotDocumentAsync(freshToken));
    }

    throw error;
  }
};
