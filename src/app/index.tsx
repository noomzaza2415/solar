import { MaterialCommunityIcons } from "@expo/vector-icons";
import axios from "axios";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { requireOptionalNativeModule } from "expo";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import {
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  loadLanguagePreference,
  loadThemePreference,
  saveLanguagePreference,
  saveThemePreference,
  type ThemePreference,
} from "@/lib/preferences";

import {
  MONTH_KEYS,
  NOTIFICATION_CHANNEL_ID,
  PUSH_TOKEN_API_URL,
  SHIFT_TARGETS,
  getTargetStatus,
  toNumber,
  type SolarApiData,
} from "@/lib/solar-alerts";

import { fetchSolarSnapshotAsync } from "@/lib/firebase";

import DailyTotalChart, { type ChartView } from "@/components/daily-total-chart";
import YearlyTotalChart from "@/components/yearly-total-chart";
import { SolarMark } from "@/components/solar-mark";

import { parseShiftWeather, type ShiftWeather } from "@/lib/solar-weather";

import {
  MAX_NOTE_LENGTH,
  loadDayNoteAsync,
  reconcileRemoteRemark,
  saveDayNoteAsync,
  syncPendingNoteAsync,
  toDayNoteKey,
  toRemarkDataKey,
  type DayNote,
} from "@/lib/solar-notes";

// --- Multi-language Translations ---
const translations = {
  TH: {
    // ไอคอนแผงโซล่าวาดเป็นไอคอนจริงข้างหัวข้อแล้ว ไม่ใช้อีโมจิ ☀️ ซึ่งหน้าตาต่างกันไปตามยี่ห้อเครื่อง
    title: "SOLAR CELL TOWER",
    subtitle: "Daily Electricity Generation Control Tower & Analytics",
    live: "LIVE SYNC",
    location: "แม่น้ำคู้, ปลวกแดง, ระยอง",
    morning: "ช่วงเช้า (10:00 AM)",
    afternoon: "ช่วงบ่าย (15:00 PM)",
    total: "รวม (21:00 PM)",
    target: "เป้าหมาย",
    generated: "ผลิตได้",
    pass: "ตามเป้า (Pass)",
    warning: "เฝ้าระวัง (Warning)",
    critical: "ต่ำกว่าเกณฑ์ (Critical)",
    // ใช้บนจอเล็ก เพื่อให้ legend อยู่ครบในแถวเดียวโดยไม่ต้องตัดคำ
    passShort: "ตามเป้า",
    warningShort: "เฝ้าระวัง",
    criticalShort: "ต่ำกว่าเกณฑ์",
    remark: "หมายเหตุ",
    clickAdd: "คลิกเพื่อพิมพ์หมายเหตุ",
    noteHint: "เช่น ล้างแผงช่วง 21:00, ฝนตกทั้งวัน, หยุดซ่อมบำรุง",
    noteSaving: "กำลังบันทึก...",
    noteLocalOnly: "ยังไม่ได้ส่ง · ต้องใช้ Wi-Fi โรงงาน",
    noteSaved: "บันทึกแล้ว",
    noteDone: "เสร็จ",
    pickDate: "เลือกวันที่",
    noDataDay: "ไม่มีข้อมูล",
    loading: "กำลังโหลดข้อมูล...",
    offline: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ข้อมูลอาจไม่เป็นปัจจุบัน",
    lastSynced: "อัปเดตล่าสุด",
    today: "วันนี้",
    retry: "แตะเพื่อลองใหม่",
    stale: "ข้อมูลค้าง",
    staleDetail: "เซิร์ฟเวอร์ไม่ได้อ่านข้อมูลจากระบบโซล่าตั้งแต่",
    language: "ภาษา",
    themeToLight: "เปลี่ยนเป็นโหมดสว่าง",
    themeToDark: "เปลี่ยนเป็นโหมดมืด",
    daysUnit: "วัน",
    dailyTitle: "ยอดรวมรายวัน",
    tapBarHint: "แตะแท่งเพื่อดูยอดของวันนั้น · ถ่างสองนิ้วเพื่อซูม",
    zoomIn: "ซูมเข้า",
    zoomOut: "ซูมออก",
    zoomReset: "ดูทั้งเดือน",
    missedTarget: "ไม่ถึงเป้า",
    viewDaily: "รายวัน",
    viewYearly: "รายปี",
    yearlyTitle: "ยอดรวมรายเดือน",
    tapMonthHint: "แตะแท่งเพื่อดูยอดของเดือนนั้น",
    monthsUnit: "เดือน",
    yearTotal: "รวมทั้งปี",
    avgPerDay: "เฉลี่ย/วัน",
    openDaily: "ดูรายวัน",
    monthTargetNote: "เป้าเดือน = 7,000 KWh × วันที่มีข้อมูล",
    back: "กลับ",
  },
  EN: {
    title: "SOLAR CELL TOWER",
    subtitle: "Daily Electricity Generation Control Tower & Analytics",
    live: "LIVE SYNC",
    location: "Maenam Khu, Pluak Daeng, Rayong",
    morning: "Morning (10:00 AM)",
    afternoon: "Afternoon (15:00 PM)",
    total: "Total (21:00 PM)",
    target: "Target",
    generated: "Generated",
    pass: "Pass Target",
    warning: "Warning Target",
    critical: "Critical Below",
    passShort: "Pass",
    warningShort: "Warning",
    criticalShort: "Critical",
    remark: "Remark",
    clickAdd: "Click to add remark",
    noteHint: "e.g. panels washed at 21:00, rain all day, maintenance shutdown",
    noteSaving: "Saving...",
    noteLocalOnly: "Not sent · needs factory Wi-Fi",
    noteSaved: "Saved",
    noteDone: "Done",
    pickDate: "Select date",
    noDataDay: "No data",
    loading: "Loading data...",
    offline: "Cannot reach the server. Data may be out of date.",
    lastSynced: "Last updated",
    today: "Today",
    retry: "Tap to retry",
    stale: "STALE",
    staleDetail: "The server has not read the solar system since",
    language: "Language",
    themeToLight: "Switch to light mode",
    themeToDark: "Switch to dark mode",
    daysUnit: "days",
    dailyTitle: "Daily total",
    tapBarHint: "Tap a bar to see that day · pinch to zoom",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    zoomReset: "Show whole month",
    missedTarget: "Missed target",
    viewDaily: "Day",
    viewYearly: "Year",
    yearlyTitle: "Monthly total",
    tapMonthHint: "Tap a bar to see that month",
    monthsUnit: "months",
    yearTotal: "Year total",
    avgPerDay: "Avg/day",
    openDaily: "Daily view",
    monthTargetNote: "Month target = 7,000 KWh × days with data",
    back: "Back",
  },
  KR: {
    title: "태양광 제어 타워",
    subtitle: "일일 전력 생산 제어 타워 및 분석",
    live: "실시간 동기화",
    location: "라용, 플루악댕, 매남쿠",
    morning: "오전 (10:00 AM)",
    afternoon: "오후 (15:00 PM)",
    total: "합계 (21:00 PM)",
    target: "목표",
    generated: "발전량",
    pass: "목표 달성",
    warning: "주의 요망",
    critical: "목표 미달 (위험)",
    passShort: "달성",
    warningShort: "주의",
    criticalShort: "미달",
    remark: "비고",
    clickAdd: "비고를 입력하려면 클릭하세요",
    noteHint: "예: 21:00 패널 세척, 종일 우천, 정비 중단",
    noteSaving: "저장 중...",
    noteLocalOnly: "전송 안 됨 · 공장 Wi-Fi 필요",
    noteSaved: "저장됨",
    noteDone: "완료",
    pickDate: "날짜 선택",
    noDataDay: "데이터 없음",
    loading: "데이터 불러오는 중...",
    offline: "서버에 연결할 수 없습니다. 데이터가 최신이 아닐 수 있습니다.",
    lastSynced: "마지막 업데이트",
    today: "오늘",
    retry: "다시 시도하려면 탭하세요",
    stale: "지연됨",
    staleDetail: "서버가 태양광 시스템을 마지막으로 읽은 시각:",
    language: "언어",
    themeToLight: "라이트 모드로 전환",
    themeToDark: "다크 모드로 전환",
    daysUnit: "일",
    dailyTitle: "일별 합계",
    tapBarHint: "막대를 탭하면 해당 일 확인 · 두 손가락으로 확대",
    zoomIn: "확대",
    zoomOut: "축소",
    zoomReset: "한 달 전체 보기",
    missedTarget: "목표 미달",
    viewDaily: "일별",
    viewYearly: "연간",
    yearlyTitle: "월별 합계",
    tapMonthHint: "막대를 탭하면 해당 월 확인",
    monthsUnit: "개월",
    yearTotal: "연간 합계",
    avgPerDay: "일평균",
    openDaily: "일별 보기",
    monthTargetNote: "월 목표 = 7,000 KWh × 데이터가 있는 일수",
    back: "뒤로",
  },
};

type Language = "TH" | "EN" | "KR";

// ชื่อภาษาเขียนด้วยภาษานั้นเอง คนที่อ่านภาษาที่เลือกอยู่ไม่ออกจะได้หาภาษาของตัวเองเจอ
const LANGUAGE_NAMES: Record<Language, string> = {
  TH: "ไทย",
  EN: "English",
  KR: "한국어",
};

// เซิร์ฟเวอร์คัดลอกข้อมูลขึ้น Firestore ทุก 2 นาที แอปจึงดึงตามรอบเดียวกัน
const SYNC_INTERVAL_MS = 120000;
// เซิร์ฟเวอร์เขียน checkedAt ทุก ~10 นาทีแม้ข้อมูลไม่เปลี่ยน (Firestore:HeartbeatIntervalSeconds)
// บวกรอบ mirror 2 นาที + รอบ poll ของแอป 2 นาที + เผื่อนาฬิกาเครื่องเหลื่อม
// เกิน 25 นาทีจึงถือว่าเซิร์ฟเวอร์ในวงค้างจริง ไม่ใช่แค่ช่วงที่ยอดไม่ขยับ
const STALE_AFTER_MS = 25 * 60 * 1000;
const PUSH_TOKEN_TIMEOUT_MS = 10000;

const SHIFT_API_NAMES = ["Morning", "Afternoon", "Total"] as const;

// ชื่อวันกับเดือนบนหน้าจอเป็นภาษาอังกฤษเสมอ ไม่เปลี่ยนตามภาษาที่เลือก
// (เหมือน MONTH_KEYS) เพราะเป็นตัวย่อสั้น ๆ ที่อ่านออกทุกภาษาและกว้างคงที่
// ช่องในปฏิทินจึงไม่ขยับตอนสลับภาษา
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CONTENT_WIDTH = 560;
interface ShiftData {
  time: string;
  label: string;
  /** null = API ยังไม่มีข้อมูลของกะนี้ (ต่างจาก 0 ที่แปลว่าผลิตไม่ได้เลยจริง ๆ) */
  generated: number | null;
  target: number;
  /** สภาพอากาศตอนปิดยอดกะนี้จากระบบต้นทาง (null = ไม่มี/ไม่ระบุ) */
  weather: ShiftWeather | null;
}

type NotificationsModule = typeof import("expo-notifications");
type ExpoProjectConfig = {
  eas?: {
    projectId?: string;
  };
};

let notificationsModulePromise: Promise<NotificationsModule | null> | null =
  null;

// Expo Go เท่านั้นที่ appOwnership เป็น "expo" (dev build / standalone จะเป็น null)
// ใช้เช็คเฉพาะ push notification เพราะ SDK 53+ ตัด remote push ออกจาก Expo Go บน Android
// ส่วน local notification (scheduleNotificationAsync) ยังใช้ได้ปกติใน Expo Go
const isExpoGoAndroid = () =>
  Platform.OS === "android" && Constants.appOwnership === "expo";

// โหลดแบบ import() ไม่ใช่ import ด้านบนไฟล์ เพราะเป็น native module ที่เพิ่งเพิ่มเข้ามา
// เครื่องที่ยังเป็น build เก่า (หรือได้โค้ดนี้ผ่าน OTA) ไม่มี module นี้
// ถ้า import ตรง ๆ ทั้งหน้าจอจะพังตั้งแต่โหลดไฟล์ แบบนี้แค่หมุนจอไม่ได้ ที่เหลือใช้งานได้ปกติ
let screenOrientationModulePromise: Promise<
  typeof import("expo-screen-orientation") | null
> | null = null;

const getScreenOrientationModuleAsync = () => {
  // ต้องเช็คก่อนว่าใน build มี native module จริง ห้ามพึ่ง .catch ของ import()
  // ตอน dev Metro จับ error ตอนโหลด module ไปแสดงจอแดงเอง แล้ว import() ยัง resolve
  // เป็น module ครึ่ง ๆ กลาง ๆ (OrientationLock เป็น undefined) แทนที่จะ reject
  if (!requireOptionalNativeModule("ExpoScreenOrientation")) {
    return Promise.resolve(null);
  }

  screenOrientationModulePromise ??= import("expo-screen-orientation").catch(
    (error) => {
      console.log("expo-screen-orientation load failed", error);
      return null;
    },
  );

  return screenOrientationModulePromise;
};

const getNotificationsModuleAsync = async () => {
  if (Platform.OS === "web") return null;

  notificationsModulePromise ??= import("expo-notifications")
    .then((notificationsModule) => {
      notificationsModule.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      return notificationsModule;
    })
    .catch((error) => {
      console.log("expo-notifications load failed", error);
      return null;
    });

  return notificationsModulePromise;
};

const ensureNotificationChannelAsync = async (
  notificationsModule: NotificationsModule,
) => {
  if (Platform.OS !== "android") return;

  await notificationsModule.setNotificationChannelAsync(
    NOTIFICATION_CHANNEL_ID,
    {
      name: "Solar alerts",
      description: "Solar generation warnings and critical alerts",
      importance: notificationsModule.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0ea5e9",
    },
  );
};

const requestNotificationPermissionAsync = async () => {
  if (Platform.OS === "web") return false;

  const notificationsModule = await getNotificationsModuleAsync();

  if (!notificationsModule) return false;

  await ensureNotificationChannelAsync(notificationsModule);

  const { status: existingStatus } =
    await notificationsModule.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await notificationsModule.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
};

const getExpoProjectId = () => {
  const expoExtra = Constants.expoConfig?.extra as
    | ExpoProjectConfig
    | undefined;
  return expoExtra?.eas?.projectId ?? Constants.easConfig?.projectId;
};

const registerForPushNotificationsAsync = async () => {
  if (Platform.OS === "web" || isExpoGoAndroid() || !Device.isDevice)
    return null;

  const notificationsModule = await getNotificationsModuleAsync();

  if (!notificationsModule) return null;

  const isGranted = await requestNotificationPermissionAsync();

  if (!isGranted) return null;

  const projectId = getExpoProjectId();

  if (!projectId) {
    throw new Error("EAS projectId not found for Expo push notifications.");
  }

  const { data } = await notificationsModule.getExpoPushTokenAsync({
    projectId,
  });

  return data;
};

// ส่งภาษาไปด้วย เพื่อให้ push ที่เซิร์ฟเวอร์ยิงมาตอนปิดแอปเป็นภาษาที่ผู้ใช้เลือกไว้
const savePushTokenToBackendAsync = async (
  expoPushToken: string,
  language: Language,
) => {
  // service นี้อยู่ในวง LAN เครื่องนอกวงจะต่อไม่ติด ต้องมี timeout
  // ไม่งั้น axios รอไปเรื่อย ๆ และคำขอค้างสะสมทุกครั้งที่สลับภาษา
  await axios.post(
    PUSH_TOKEN_API_URL,
    {
      token: expoPushToken,
      platform: Platform.OS,
      language,
    },
    { timeout: PUSH_TOKEN_TIMEOUT_MS },
  );
};

// --- ชุดสีสำหรับโหมดสว่าง/มืด ---
// ตั้งชื่อตามหน้าที่ ไม่ใช่ตามสี เพื่อให้สลับธีมได้โดยไม่ต้องไล่แก้ทีละจุด
type Palette = {
  background: string;
  surface: string;
  surfaceSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentBorder: string;
  accentSoft: string;
  border: string;
  borderStrong: string;
  track: string;
  today: string;
  pass: string;
  warning: string;
  critical: string;
  // สีสถานะสำหรับ "ตัวหนังสือ" แยกจากสีที่ใช้ระบายพื้น/แถบ
  // เพราะเหลือง #eab308 บนพื้นขาวคอนทราสต์แค่ราว 2:1 ตัวเลขช่วงเฝ้าระวังแทบอ่านไม่ออก
  passInk: string;
  warningInk: string;
  criticalInk: string;
  dayEmpty: string;
  dayEmptyText: string;
  onStatus: string;
  shadow: string;
};

const lightPalette: Palette = {
  background: "#eceff4",
  surface: "#ffffff",
  surfaceSubtle: "#f4f6f9",
  textPrimary: "#0b1220",
  textSecondary: "#334155",
  textMuted: "#64748b",
  accent: "#0369a1",
  // ขอบปุ่มเดิม (#7dd3fc) เข้มจนแย่งสายตาไปจากตัวเลข จึงเบาลงเป็นเส้นบาง ๆ
  accentBorder: "#bae6fd",
  accentSoft: "#e0f2fe",
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  track: "#e5e9f0",
  today: "#15803d",
  pass: "#16a34a",
  // อำพันแบบไฟเตือนในโรงงาน อ่านเป็น "เตือน" ได้ชัดกว่าเหลืองมะนาว
  warning: "#f59e0b",
  critical: "#dc2626",
  passInk: "#15803d",
  warningInk: "#b45309",
  criticalInk: "#b91c1c",
  // วันที่ยังไม่มีข้อมูลเป็นช่องโปร่ง ๆ ไม่ใช่บล็อกเทาทึบ วันที่มีข้อมูลจริงจะเด่นขึ้นทันที
  dayEmpty: "#f1f5f9",
  dayEmptyText: "#94a3b8",
  onStatus: "#ffffff",
  shadow: "#0f172a",
};

const darkPalette: Palette = {
  // กราไฟต์อมน้ำเงินแบบจอควบคุม ไม่ใช่ดำสนิท ตาไม่ล้าเวลาเฝ้าจอนาน ๆ
  background: "#070b12",
  surface: "#0f1621",
  surfaceSubtle: "#0b111a",
  textPrimary: "#f1f5f9",
  textSecondary: "#cbd5e1",
  textMuted: "#8b98ab",
  // สีสถานะในโหมดมืดต้องสว่างขึ้น ไม่งั้นจะจมไปกับพื้นหลังเข้ม
  accent: "#38bdf8",
  accentBorder: "#1d4561",
  accentSoft: "#0c2233",
  border: "#1c2635",
  borderStrong: "#2d3a4f",
  track: "#1a2433",
  today: "#4ade80",
  pass: "#22c55e",
  warning: "#fbbf24",
  critical: "#f87171",
  // พื้นเข้มแล้วสีสถานะสว่างพออ่านเป็นตัวหนังสือได้เลย
  passInk: "#4ade80",
  warningInk: "#fbbf24",
  criticalInk: "#f87171",
  dayEmpty: "#131c29",
  dayEmptyText: "#64748b",
  onStatus: "#ffffff",
  shadow: "#000000",
};

// ไอคอนช่วยแยกสถานะโดยไม่ต้องพึ่งสีอย่างเดียว (ตาบอดสี/แดดจ้าก็ยังอ่านออก)
const STATUS_ICONS: Record<
  string,
  React.ComponentProps<typeof MaterialCommunityIcons>["name"]
> = {
  pass: "check-circle",
  warning: "alert-circle",
  critical: "close-circle",
  pending: "clock-outline",
};

const SHIFT_ICONS: Record<
  string,
  React.ComponentProps<typeof MaterialCommunityIcons>["name"]
> = {
  morning: "weather-sunset-up",
  afternoon: "weather-sunny",
  total: "chart-line",
};

type StatusInfo = {
  /** สีสำหรับระบายพื้น แถบ และจุด */
  color: string;
  /** สีสำหรับตัวหนังสือ/ตัวเลข ที่คอนทราสต์พอบนพื้นของการ์ด */
  ink: string;
  status: "pass" | "warning" | "critical" | "pending";
};

/** ผสมสี overlay ทับ base ด้วยความทึบ alpha ออกมาเป็นสีทึบสีเดียว (รับ/คืน hex 6 หลัก) */
const blendHex = (base: string, overlay: string, alpha: number) => {
  const channels = (hex: string) =>
    [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const baseChannels = channels(base);
  const overlayChannels = channels(overlay);

  return `#${baseChannels
    .map((value, index) =>
      Math.round(value + (overlayChannels[index] - value) * alpha)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

const getStatusColor = (
  generated: number,
  target: number,
  c: Palette,
): StatusInfo => {
  const status = getTargetStatus(generated, target);
  if (status === "pass") return { color: c.pass, ink: c.passInk, status };
  if (status === "warning")
    return { color: c.warning, ink: c.warningInk, status };
  return { color: c.critical, ink: c.criticalInk, status };
};

/** ร้อยละของเป้า ใช้ทั้งตัวเลขบนป้ายและความยาวแถบ ให้สองอย่างนี้ตรงกันเสมอ */
const getPercentOfTarget = (generated: number, target: number) =>
  target > 0 ? (generated / target) * 100 : 100;

// เครื่องหมายลบใช้ U+2212 ไม่ใช่ขีดกลาง "-" เพื่อให้กว้างเท่าเครื่องหมายบวก
// ตัวเลขในการ์ดสามใบจึงเรียงตรงกันไม่เหลื่อม
const formatDelta = (delta: number) => {
  const rounded = Math.round(delta);
  if (rounded === 0) return "±0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toLocaleString()}`;
};

// เดือนที่มียอดรวม (Total) อย่างน้อยหนึ่งวัน ตั้งแต่ม.ค.จนถึงเดือนปัจจุบัน
//
// คีย์ข้อมูลไม่มีปีกำกับ (เช่น Oct-Total-5) เดือนที่ยังมาไม่ถึงจึงอาจเป็นตัวเลขของปีที่แล้ว
// ต้องตัดทิ้งทั้งเดือนและวันที่เลยวันนี้ไป ไม่งั้นกราฟจะเอายอดเก่ามาแสดง
const getMonthsWithData = (data: SolarApiData | null, today: Date) =>
  Array.from({ length: today.getMonth() + 1 }, (_, monthIndex) => monthIndex)
    .filter((monthIndex) => {
      const lastDay =
        monthIndex === today.getMonth()
          ? today.getDate()
          : new Date(today.getFullYear(), monthIndex + 1, 0).getDate();

      return Array.from({ length: lastDay }, (_, index) => index + 1).some(
        (day) =>
          toNumber(data?.[`${MONTH_KEYS[monthIndex]}-Total-${day}`]) !==
          undefined,
      );
    });

// หมายเหตุในระบบกลาง คีย์ "{เดือน}-Remark-{วัน}" (ไม่แยกกะ) ตัวเดียวกับช่องหมายเหตุบนหน้าเว็บ D-IT
const getSystemRemark = (data: SolarApiData | null, date: Date) => {
  const raw = data?.[toRemarkDataKey(date)];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
};

const getLatestSolarDataDate = (data: SolarApiData, fallbackDate: Date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let latestDate: Date | null = null;

  MONTH_KEYS.forEach((monthKey, monthIndex) => {
    Array.from({ length: 31 }, (_, index) => index + 1).forEach((day) => {
      const date = new Date(today.getFullYear(), monthIndex, day);

      if (
        date.getMonth() !== monthIndex ||
        date.getDate() !== day ||
        date > today
      ) {
        return;
      }

      const hasShiftData = SHIFT_API_NAMES.some((shift) => {
        return toNumber(data[`${monthKey}-${shift}-${day}`]) !== undefined;
      });

      if (hasShiftData && (!latestDate || date > latestDate)) {
        latestDate = date;
      }
    });
  });

  return latestDate ?? fallbackDate;
};

const SolarDashboard: React.FC = () => {
  const [lang, setLang] = useState<Language>(DEFAULT_LANGUAGE);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [solarData, setSolarData] = useState<SolarApiData | null>(null);
  const solarDataRef = useRef<SolarApiData | null>(null);
  const [isSolarDataLoading, setIsSolarDataLoading] = useState(true);
  // สถานะการเชื่อมต่อ ใช้เตือนผู้ใช้เมื่อดึงข้อมูลจากเซิร์ฟเวอร์ไม่ได้
  const [hasConnectionError, setHasConnectionError] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  // คำนวณตอนได้ข้อมูลแต่ละรอบ ไม่เรียก Date.now() ตอน render
  // poll ทุกรอบ setState ใหม่อยู่แล้ว ค่านี้จึงสดเท่ากับที่เคยคำนวณตอน render
  const [isCheckStale, setIsCheckStale] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  // เดือนที่เปิดดูกราฟรายวันอยู่ (จอแนวนอน) null = ปิดกราฟ
  const [chartMonthIndex, setChartMonthIndex] = useState<number | null>(null);
  // กราฟที่เปิดอยู่ในหน้าเดียวกัน (รายวัน/รายปี) ปิดแล้วเปิดใหม่จะกลับมาที่มุมมองเดิม
  const [chartView, setChartView] = useState<ChartView>("daily");
  // ปฏิทินเลือกวัน: เก็บเดือนที่กำลังเปิดดูแยกจากวันที่เลือกจริง
  // ผู้ใช้จะได้พลิกดูเดือนอื่นโดยที่หน้าหลักยังไม่เปลี่ยนจนกว่าจะกดวัน
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState<Date>(new Date());

  const [isRefreshing, setIsRefreshing] = useState(false);

  const shiftScrollerRef = useRef<ScrollView>(null);
  const dateStripRef = useRef<ScrollView>(null);
  const pushTokenRef = useRef<string | null>(null);
  const isPagerSwipeRef = useRef(false);
  const langRef = useRef<Language>(lang);
  // เว็บไม่มี onMomentumScrollEnd จึงต้องจับ "หยุดเลื่อน" เองด้วยการหน่วงเวลา
  const webPagerSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isMountedRef = useRef(true);
  // คำขอที่กำลังวิ่งอยู่ ใช้กันไม่ให้ poll / ดึงลงรีเฟรช / กลับเข้าแอป ยิงซ้อนกัน
  const inFlightSyncRef = useRef<Promise<void> | null>(null);

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  // ความสูงที่วางเนื้อหาได้จริง หักแถบสถานะด้านบนและแถบปุ่มนำทางด้านล่างออกแล้ว
  // Android แสดงผลแบบ edge-to-edge windowHeight จึงรวมสองแถบนี้ไว้ด้วย
  const usableHeight =
    windowHeight - safeAreaInsets.top - safeAreaInsets.bottom;
  // ธีมที่ผู้ใช้กดเลือกเอง ถ้ายังไม่เคยเลือก (null) ให้ใช้ค่าเริ่มต้น (โหมดมืด)
  const [themePreference, setThemePreference] = useState<ThemePreference>(null);
  const isDarkMode = themePreference
    ? themePreference === "dark"
    : DEFAULT_THEME === "dark";
  const palette = isDarkMode ? darkPalette : lightPalette;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const t = translations[lang];
  const isCompact = windowWidth < 380;
  // การ์ด 3 ใบต้องพอดีในหน้าเดียว จอเตี้ยจึงต้องบีบระยะและตัวเลขลง
  // ไม่งั้นการ์ดใบล่างสุดจะถูกตัดขอบ (เนื้อหาในการ์ดหดต่ำกว่าความสูงของข้อความไม่ได้)
  //
  // วัดจาก usableHeight ไม่ใช่ windowHeight: มือถือที่ใช้แถบปุ่มนำทาง 3 ปุ่ม (เช่น Samsung)
  // แถบกินที่ 48dp ของเดิมคิดจากความสูงทั้งจอ เลยไม่ย่อการ์ด การ์ดหมายเหตุจึงจมอยู่ใต้แถบปุ่ม
  // กดไม่ได้จนกว่าจะรู้ว่าต้องปัดหน้าขึ้น เนื้อหาแบบไม่ย่อต้องใช้ความสูงราว 835dp
  const isShortScreen = usableHeight < 840;
  const isVeryShortScreen = usableHeight < 720;
  // จอแคบมาก (เช่น 320px) ต้องย่อ legend เป็นพิเศษ ไม่งั้นจะตกไปแถวที่สอง
  const isNarrow = windowWidth < 340;
  const contentWidth = Math.min(windowWidth, MAX_CONTENT_WIDTH);
  // บนเว็บ adjustsFontSizeToFit ไม่ทำงาน หัวข้อจึงถูกตัดเป็น "SOLAR CELL T…"
  // ต้องย่อขนาดเองตามความกว้างจอ และเก็บไอคอนไว้เฉพาะจอที่มีที่พอ
  // หัวมีปุ่มสามปุ่ม (สรุปรายเดือน/ธีม/ภาษา) จึงต้องเผื่อที่ให้ชื่อมากกว่าตอนมีสองปุ่ม
  const showBrandTile = windowWidth >= 520;
  const titleFontSize = windowWidth < 360 ? 14 : windowWidth < 440 ? 16 : 21;
  // จอแคบบีบปุ่มไอคอนลงจาก 44 เหลือ 40 ยังกดง่ายอยู่ แต่คืนที่ให้ชื่อหัวข้อได้อีก 8dp
  const headerIconSize = windowWidth < 440 ? 40 : 44;
  const screenPadding = isCompact ? 10 : 16;

  // legend ต้องอยู่แถวเดียวเสมอ จึงย่อขนาดตัวอักษรตามความกว้างจอ
  // ช่วง 380-420 ต้องมีขั้นของตัวเอง (จอ 390 อย่าง iPhone 12/13/14 ล้นถ้ากระโดดไป 13 เลย)
  const legendFontSize = isNarrow
    ? 10
    : isCompact
      ? 11.5
      : windowWidth < 420
        ? 12
        : 13;
  const legendDotSize = isNarrow ? 9 : isCompact ? 10 : 12;
  const legendGap = isNarrow ? 4 : isCompact ? 6 : 8;
  const legendPadding = isNarrow ? 9 : isCompact ? 11 : 14;
  // ใช้ข้อความสั้นเสมอ เพราะเนื้อหาถูกจำกัดที่ MAX_CONTENT_WIDTH (560)
  // ต่อให้เป็นแท็บเล็ต ข้อความเต็มอย่าง "ต่ำกว่าเกณฑ์ (Critical)" ก็ยังกว้างเกินส่วนแบ่งของตัวเอง
  //
  // จอกว้าง (แท็บเล็ต/เว็บ) มีที่พอจะบอกเกณฑ์เป็นตัวเลขด้วย คนหน้างานจะได้ไม่ต้องเดาว่า
  // "เฝ้าระวัง" เริ่มที่กี่เปอร์เซ็นต์ ตัวเลขต้องตรงกับ getStatusColor
  const showLegendThresholds = contentWidth >= 480;
  const legendItems = [
    { color: palette.pass, label: t.passShort, threshold: "≥100%" },
    { color: palette.warning, label: t.warningShort, threshold: "90–99%" },
    { color: palette.critical, label: t.criticalShort, threshold: "<90%" },
  ];
  const dateSelectorPadding = isCompact ? 10 : 14;
  // ขยายให้นิ้วกดง่ายและรองรับตัวเลขที่ใหญ่ขึ้น
  const dateButtonSize = isCompact ? 46 : 52;
  const dateCellWidth = isCompact ? 42 : 46;
  const dateCellGap = isCompact ? 6 : 7;
  const dayCellHeight = isVeryShortScreen ? 50 : isShortScreen ? 54 : 58;
  const cardPadding = isVeryShortScreen ? 8 : isShortScreen ? 10 : 12;
  const cardHeaderSpacing = isVeryShortScreen ? 6 : isShortScreen ? 7 : 9;
  const cardContentSpacing = isShortScreen ? 8 : 10;
  const valueFontSize = isVeryShortScreen ? 20 : isShortScreen ? 23 : 26;
  // ตัวเลขที่ผลิตได้คือพระเอกของการ์ด เป้าหมายเป็นข้อมูลอ้างอิงจึงเล็กกว่าหนึ่งขั้น
  const generatedFontSize = isCompact ? valueFontSize - 3 : valueFontSize;
  const targetFontSize = generatedFontSize - 3;
  const dateStripStep = dateCellWidth + dateCellGap;
  const shiftPageWidth = Math.max(contentWidth - screenPadding * 2, 0);
  const dateStripViewportWidth = Math.max(
    shiftPageWidth - dateSelectorPadding * 2,
    0,
  );
  const [latestDataDate, setLatestDataDate] = useState<Date>(new Date());

  // หมายเหตุประจำวันของวันที่กำลังดูอยู่
  const [dayNote, setDayNote] = useState<DayNote | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteStatus, setNoteStatus] = useState<
    "idle" | "saving" | "saved" | "localOnly"
  >("idle");
  // ใช้เช็คว่าผลบันทึกที่เพิ่งเสร็จยังเป็นของวันที่ผู้ใช้ดูอยู่หรือเปล่า
  // เพราะระหว่างรอบันทึก ผู้ใช้อาจปัดเปลี่ยนวันไปแล้ว
  const noteDateRef = useRef<Date>(selectedDate);
  const noteSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ข้อความที่พิมพ์ค้างอยู่ผูกกับ "วันที่ของมันเอง" ไม่ใช่วันที่ที่หน้าจอแสดงอยู่
  // ตอนกดเปลี่ยนวันขณะคีย์บอร์ดยังเปิด TextInput จะ blur หลัง selectedDate เปลี่ยนไปแล้ว
  // ถ้าอ่านวันจาก selectedDate จะเอาข้อความของเมื่อวานไปเขียนทับหมายเหตุของวันใหม่
  const noteDraftRef = useRef("");
  const noteDraftDateRef = useRef<Date | null>(null);
  const isEditingNoteRef = useRef(false);

  const updateNoteDraft = (text: string) => {
    noteDraftRef.current = text;
    setNoteDraft(text);
  };

  const setNoteEditing = (editing: boolean) => {
    isEditingNoteRef.current = editing;
    setIsEditingNote(editing);
  };

  // ขอสิทธิ์แจ้งเตือนและลงทะเบียน push token ตั้งแต่เปิดแอป
  useEffect(() => {
    if (Platform.OS === "web") return;

    const setupNotifications = async () => {
      try {
        const notificationsModule = await getNotificationsModuleAsync();

        if (!notificationsModule) {
          console.log("Notifications module unavailable on this build");
          return;
        }

        await ensureNotificationChannelAsync(notificationsModule);

        const { status: existingStatus } =
          await notificationsModule.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          const { status } =
            await notificationsModule.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== "granted") {
          console.log("Notification permission not granted");
          return;
        }

        try {
          const expoPushToken = await registerForPushNotificationsAsync();

          if (expoPushToken) {
            pushTokenRef.current = expoPushToken;
            await savePushTokenToBackendAsync(expoPushToken, langRef.current);
          }
        } catch (error) {
          console.log("Push token registration failed", error);
        }
      } catch (error) {
        console.log("Notification setup failed", error);
      }
    };

    setupNotifications();
  }, []);

  // แปลง "2026-09-02" เป็นวันที่แบบเวลาท้องถิ่น
  // ห้ามใช้ new Date("2026-09-02") ตรง ๆ เพราะ JS ตีความเป็น UTC เที่ยงคืน
  // ซึ่งบางโซนเวลาจะเพี้ยนไปเป็นวันก่อนหน้า
  const parseNotificationDate = (value: unknown): Date | null => {
    if (typeof value !== "string") return null;

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;

    const parsed = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  // กดแจ้งเตือนแล้วให้เปิดไปที่วันที่ของแจ้งเตือนนั้น
  useEffect(() => {
    if (Platform.OS === "web") return;

    let isMounted = true;
    let responseListener: { remove: () => void } | null = null;

    const openDateFromNotification = (data: unknown) => {
      const payload = data as { date?: unknown } | undefined;
      const targetDate = parseNotificationDate(payload?.date);

      if (targetDate && isMounted) {
        setSelectedDate(targetDate);
      }
    };

    const setupResponseListener = async () => {
      const notificationsModule = await getNotificationsModuleAsync();

      if (!notificationsModule || !isMounted) return;

      // กรณีแอปเปิดอยู่แล้วผู้ใช้กดแจ้งเตือน
      responseListener =
        notificationsModule.addNotificationResponseReceivedListener(
          (response) => {
            openDateFromNotification(
              response.notification.request.content.data,
            );
          },
        );

      // กรณีแอปปิดอยู่ แล้วผู้ใช้เปิดแอปด้วยการกดแจ้งเตือน
      const lastResponse = notificationsModule.getLastNotificationResponse();

      if (lastResponse?.notification) {
        openDateFromNotification(
          lastResponse.notification.request.content.data,
        );
      }
    };

    setupResponseListener();

    return () => {
      isMounted = false;
      responseListener?.remove();
    };
  }, []);

  // อ่านค่าที่เคยเลือกไว้ตอนเปิดแอป
  // ถ้ายังไม่เคยเลือกภาษา จะคงค่าเริ่มต้น (อังกฤษ) ไว้
  useEffect(() => {
    loadThemePreference().then(setThemePreference);
    loadLanguagePreference().then((stored) => {
      if (stored) setLang(stored);
    });
  }, []);

  const handleSelectLanguage = (nextLanguage: Language) => {
    setLang(nextLanguage);
    saveLanguagePreference(nextLanguage);
    setShowLanguageMenu(false);
  };

  const handleToggleTheme = () => {
    const nextPreference: ThemePreference = isDarkMode ? "light" : "dark";
    setThemePreference(nextPreference);
    saveThemePreference(nextPreference);
  };

  // โหลดหมายเหตุใหม่ทุกครั้งที่เปลี่ยนวันที่ที่ดูอยู่
  useEffect(() => {
    let isActive = true;
    const date = selectedDate;

    // มีข้อความที่ยังรอบันทึกอัตโนมัติอยู่ ให้บันทึกลงวันเดิมของมันทันทีก่อนสลับวัน
    // ผลลัพธ์เป็นของวันที่ไม่ได้แสดงแล้ว จึงไม่ต้องเอามาอัปเดตหน้าจอ
    if (noteSaveTimerRef.current) {
      clearTimeout(noteSaveTimerRef.current);
      noteSaveTimerRef.current = null;

      if (noteDraftDateRef.current) {
        void saveDayNoteAsync(noteDraftDateRef.current, noteDraftRef.current);
      }
    }

    noteDateRef.current = date;
    noteDraftDateRef.current = null;
    // ล้างสถานะหมายเหตุตอนเปลี่ยนวันต้องอยู่ใน effect เดียวกับการบันทึกข้อความค้าง (ด้านบน)
    // และการเขียน ref ถ้าแยกไปทำตอน render ลำดับ "บันทึกของวันเก่า → ล้าง" จะเพี้ยน
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNoteEditing(false);
    setNoteStatus("idle");
    // ล้างของวันก่อนออก ไม่งั้นระหว่างรอโหลดจะเห็นหมายเหตุของอีกวันใต้วันที่ใหม่
    setDayNote(null);
    updateNoteDraft("");

    // อ่านข้อมูลล่าสุดจาก ref ไม่ใส่ solarData ใน deps เพราะข้อมูลรอบใหม่ (ทุก 2 นาที)
    // ต้องไม่ทำให้โหลดหมายเหตุใหม่ทับที่กำลังพิมพ์ effect ด้านล่างคอยตามข้อความจากระบบกลางแทน
    loadDayNoteAsync(date, getSystemRemark(solarDataRef.current, date)).then((note) => {
      if (!isActive) return;

      noteDraftDateRef.current = date;
      setDayNote(note);
      updateNoteDraft(note.text);
      if (!note.isLocalOnly) return;

      // มีข้อความที่เคยส่งไม่สำเร็จค้างอยู่ บอกผู้ใช้ แล้วลองส่งใหม่เงียบ ๆ (อาจกลับมาอยู่ใน Wi-Fi โรงงานแล้ว)
      setNoteStatus("localOnly");
      syncPendingNoteAsync(date).then((synced) => {
        // ระหว่างรอส่ง ผู้ใช้อาจเริ่มพิมพ์ต่อแล้ว ห้ามเอาข้อความเก่ามาทับ
        if (!isActive || !synced || isEditingNoteRef.current) return;

        setDayNote(synced);
        setNoteStatus("saved");
      });
    });

    return () => {
      isActive = false;
    };
  }, [selectedDate]);

  // ตอน unmount ยกเลิกตัวตั้งเวลา (จะได้ไม่ setState ใส่หน้าที่ไม่มีแล้ว)
  // แต่ข้อความที่ยังไม่ได้บันทึกต้องเขียนลงเครื่องก่อน ไม่งั้นหายเงียบ ๆ
  useEffect(() => {
    return () => {
      if (noteSaveTimerRef.current) {
        clearTimeout(noteSaveTimerRef.current);
        noteSaveTimerRef.current = null;

        if (noteDraftDateRef.current) {
          void saveDayNoteAsync(noteDraftDateRef.current, noteDraftRef.current);
        }
      }

      if (webPagerSettleTimerRef.current) {
        clearTimeout(webPagerSettleTimerRef.current);
      }
    };
  }, []);

  // รับ date เข้ามาเป็นพารามิเตอร์ ไม่อ่านจาก selectedDate ตรง ๆ
  // เพื่อให้การบันทึกที่ถูกตั้งเวลาไว้ยังลงวันเดิมเสมอ แม้ผู้ใช้ปัดเปลี่ยนวันไปแล้ว
  const persistNoteAsync = async (
    date: Date,
    text: string,
    syncDraft: boolean,
  ) => {
    setNoteStatus("saving");

    const saved = await saveDayNoteAsync(date, text);

    // ผลของวันอื่นไม่ควรมาเปลี่ยนสิ่งที่แสดงอยู่ตรงหน้า
    if (toDayNoteKey(noteDateRef.current) !== saved.date) return;

    setDayNote(saved);
    // ตอนกำลังพิมพ์อยู่ห้ามเขียนทับสิ่งที่พิมพ์ ไม่งั้นช่องว่างท้ายบรรทัดจะหายกลางคัน
    if (syncDraft) updateNoteDraft(saved.text);
    setNoteStatus(saved.isLocalOnly ? "localOnly" : "saved");
  };

  // เปิดแก้ได้ก็ต่อเมื่อโหลดหมายเหตุของวันที่แสดงอยู่เสร็จแล้ว
  // ไม่งั้นพิมพ์ทับก่อนโหลดเสร็จ แล้วผลโหลดจะมาเขียนทับสิ่งที่พิมพ์ไป
  const isNoteReady =
    dayNote !== null && dayNote.date === toDayNoteKey(selectedDate);

  const handleStartEditingNote = () => {
    if (!isNoteReady) return;
    setNoteEditing(true);
  };

  const handleNoteChange = (text: string) => {
    const date = noteDraftDateRef.current;
    if (!date) return;

    updateNoteDraft(text);
    setNoteStatus("saving");

    // บันทึกอัตโนมัติหลังหยุดพิมพ์ ผู้ใช้จะได้ไม่ต้องกดปุ่มบันทึกทุกครั้ง
    if (noteSaveTimerRef.current) clearTimeout(noteSaveTimerRef.current);

    noteSaveTimerRef.current = setTimeout(() => {
      noteSaveTimerRef.current = null;
      persistNoteAsync(date, text, false);
    }, 700);
  };

  // ถูกเรียกได้ทั้งจากปุ่ม "เสร็จ" และจาก onBlur ซึ่งตามมาติด ๆ กัน
  // เช็ค ref แทน state เพราะ onBlur ตัวที่สองยังถือ state ของรอบ render ก่อนอยู่
  const handleNoteDone = () => {
    if (!isEditingNoteRef.current) return;
    setNoteEditing(false);

    const date = noteDraftDateRef.current;
    const hasPendingSave = noteSaveTimerRef.current !== null;

    if (noteSaveTimerRef.current) {
      clearTimeout(noteSaveTimerRef.current);
      noteSaveTimerRef.current = null;
    }

    if (date && hasPendingSave) {
      persistNoteAsync(date, noteDraftRef.current, true);
      return;
    }

    // ไม่มีอะไรเปลี่ยน ก็ไม่ต้องเขียนซ้ำ (ไม่งั้นเวลา "อัปเดตล่าสุด" จะขยับทั้งที่ไม่ได้แก้)
    // แค่ตัดช่องว่างท้ายข้อความให้ตรงกับที่บันทึกไว้จริง
    updateNoteDraft(noteDraftRef.current.trim());
  };

  // แจ้งภาษาที่เลือกให้เซิร์ฟเวอร์ทราบ เพราะ push ทั้งหมดถูกยิงมาจากฝั่งเซิร์ฟเวอร์
  // ไม่บันทึกภาษาลงเครื่องตรงนี้ เพราะ effect นี้วิ่งตั้งแต่ mount ด้วยค่าเริ่มต้น "EN"
  // ก่อนที่ค่าที่เคยเลือกไว้จะโหลดเสร็จ แล้วเขียนทับภาษาที่ผู้ใช้เลือกไว้ทิ้ง
  // (เจอจริงบนเว็บ) จึงย้ายไปบันทึกตอนผู้ใช้กดเลือกภาษาใน handleSelectLanguage แทน
  useEffect(() => {
    langRef.current = lang;

    // ไม่งั้น push ตอนปิดแอปจะยังเป็นภาษาเดิม
    if (pushTokenRef.current) {
      savePushTokenToBackendAsync(pushTokenRef.current, lang).catch((error) =>
        console.log("Push token language update failed", error),
      );
    }
  }, [lang]);

  // อ่านจาก Firestore ไม่ใช่ API ในวง เพื่อให้เครื่องนอกวงเห็นข้อมูลเหมือนกัน
  // (เซิร์ฟเวอร์ในวงเป็นคนคัดลอกข้อมูลขึ้นไปให้ทุก 2 นาที)
  //
  // ถ้ามีคำขอวิ่งอยู่แล้วให้คืนตัวเดิม ไม่ยิงซ้อน เพราะ timeout รวมการต่อ token ใหม่
  // ยาวได้เกิน 2 นาที ถ้าปล่อยซ้อน ผลของคำขอเก่าอาจมาทับผลของคำขอใหม่ได้
  const loadSolarData = useCallback(() => {
    if (inFlightSyncRef.current) return inFlightSyncRef.current;

    const request = (async () => {
      try {
        const snapshot = await fetchSolarSnapshotAsync();
        if (!isMountedRef.current) return;

        const latestDate = getLatestSolarDataDate(snapshot.data, new Date());
        solarDataRef.current = snapshot.data;
        setSolarData(snapshot.data);
        setLatestDataDate(latestDate);
        // ใช้เวลาที่เซิร์ฟเวอร์อ่านข้อมูลมาจาก API จริง ไม่ใช่เวลาที่แอปเพิ่งโหลดสำเร็จ
        // ไม่งั้นถ้าฝั่งเซิร์ฟเวอร์ค้าง ผู้ใช้จะเห็นว่า "เพิ่งซิงก์" ทั้งที่ข้อมูลค้างมาหลายชั่วโมง
        setLastSyncedAt(snapshot.updatedAt ?? new Date());
        setLastCheckedAt(snapshot.checkedAt);
        setIsCheckStale(
          snapshot.checkedAt !== null &&
            Date.now() - snapshot.checkedAt.getTime() > STALE_AFTER_MS,
        );
        setHasConnectionError(false);
      } catch (error) {
        console.log("Sync error", error);
        // ต้องบอกผู้ใช้ด้วย ไม่ใช่ log เงียบ ๆ ไม่งั้นจะดูข้อมูลเก่าโดยไม่รู้ตัว
        if (isMountedRef.current) setHasConnectionError(true);
      } finally {
        inFlightSyncRef.current = null;
        if (isMountedRef.current) setIsSolarDataLoading(false);
      }
    })();

    inFlightSyncRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadSolarData();

    const intervalId = setInterval(loadSolarData, SYNC_INTERVAL_MS);

    // ตอนแอปอยู่เบื้องหลัง timer ถูกพักไว้ พอกลับเข้ามาจะเห็นตัวเลขเก่าได้นานถึง 2 นาที
    // จึงดึงใหม่ทันทีที่แอปกลับมาอยู่หน้าจอ
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        if (state === "active") loadSolarData();
      },
    );

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [loadSolarData]);

  // แอปล็อกแนวตั้งเสมอ ยกเว้นตอนเปิดกราฟรายวันที่ต้องใช้ความกว้างของจอแนวนอน
  //
  // app.json ต้องตั้ง orientation เป็น "default" (ไม่งั้น iOS ไม่ยอมหมุนเป็นแนวนอนเลย)
  // Android จึงไม่มีอะไรล็อกแนวตั้งให้ตั้งแต่ต้น ต้องล็อกเองตรงนี้ตอนเปิดแอปด้วย
  // เว็บล็อกได้เฉพาะตอนเต็มจอ ปล่อยให้ผู้ใช้หมุน/ขยายหน้าต่างเอง
  const isDailyChartOpen = chartMonthIndex !== null;
  useEffect(() => {
    if (Platform.OS === "web") return;

    getScreenOrientationModuleAsync()
      .then((ScreenOrientation) =>
        ScreenOrientation?.lockAsync(
          isDailyChartOpen
            ? ScreenOrientation.OrientationLock.LANDSCAPE
            : ScreenOrientation.OrientationLock.PORTRAIT_UP,
        ),
      )
      .catch((error) => console.log("Orientation lock failed", error));
  }, [isDailyChartOpen]);

  // เปิดที่เดือนล่าสุดที่มีข้อมูล (ต้นเดือนที่ยังไม่มียอดจะได้ไม่เจอกราฟว่าง)
  const openDailyChart = () => {
    const today = new Date();
    const months = getMonthsWithData(solarData, today);
    setChartMonthIndex(months[months.length - 1] ?? today.getMonth());
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadSolarData();
    if (isMountedRef.current) setIsRefreshing(false);
  };

  const getSolarApiKeyForDate = (
    date: Date,
    shift: "Morning" | "Afternoon" | "Total",
    prefix = "",
  ) => {
    return `${MONTH_KEYS[date.getMonth()]}-${prefix}${shift}-${date.getDate()}`;
  };

  const getSolarApiValueForDate = (
    date: Date,
    shift: "Morning" | "Afternoon" | "Total",
  ) => {
    return toNumber(solarData?.[getSolarApiKeyForDate(date, shift)]);
  };

  // คืน null เมื่อ API ยังไม่มีข้อมูลของกะนั้น เพื่อให้หน้าจอแสดง "—" ตามจริง
  //
  // ของเดิมถ้าต่อ API ไม่ได้จะสร้างตัวเลขปลอมขึ้นมาแสดง (80-96% ของเป้า ตามวันที่ % 5)
  // ซึ่งดูสมจริงจนแยกไม่ออก เซิร์ฟเวอร์ล่มทั้งวันผู้ใช้ก็ยังเห็นตัวเลขสวย ๆ
  // สำหรับระบบเฝ้าระวังการผลิตไฟ การโชว์ตัวเลขที่ไม่จริงอันตรายกว่าการไม่โชว์อะไรเลย
  // สภาพอากาศอยู่ที่คีย์ "{เดือน}-W-{กะ}-{วัน}" เช่น Sep-W-Morning-24
  const getShiftWeather = (
    date: Date,
    shift: "Morning" | "Afternoon" | "Total",
  ) =>
    parseShiftWeather(
      solarData?.[getSolarApiKeyForDate(date, shift, "W-")],
      lang,
    );

  const getShiftData = (date = selectedDate): ShiftData[] => {
    return [
      {
        time: "morning",
        label: t.morning,
        generated: getSolarApiValueForDate(date, "Morning") ?? null,
        target: SHIFT_TARGETS.morning,
        weather: getShiftWeather(date, "Morning"),
      },
      {
        time: "afternoon",
        label: t.afternoon,
        generated: getSolarApiValueForDate(date, "Afternoon") ?? null,
        target: SHIFT_TARGETS.afternoon,
        weather: getShiftWeather(date, "Afternoon"),
      },
      {
        time: "total",
        label: t.total,
        generated: getSolarApiValueForDate(date, "Total") ?? null,
        target: SHIFT_TARGETS.total,
        weather: getShiftWeather(date, "Total"),
      },
    ];
  };

  const systemRemark = getSystemRemark(solarData, selectedDate);

  // หมายเหตุเป็นข้อมูลกลาง มีคนแก้จากหน้าเว็บหรือเครื่องอื่นได้ ข้อมูลรอบใหม่มาถึงก็อัปเดตตาม
  // ยกเว้นกำลังพิมพ์/กำลังบันทึกอยู่ หรือข้อความในเครื่องยังส่งไม่สำเร็จ (ของผู้ใช้ใหม่กว่า)
  // ครั้งแรกที่เปิดแอป หมายเหตุโหลดเสร็จก่อนข้อมูลโซล่า ก็ได้ข้อความจริงผ่าน effect นี้
  useEffect(() => {
    if (!dayNote || dayNote.date !== toDayNoteKey(selectedDate)) return;
    if (
      dayNote.isLocalOnly ||
      isEditingNoteRef.current ||
      noteSaveTimerRef.current ||
      noteStatus === "saving"
    ) {
      return;
    }

    const remote = reconcileRemoteRemark(dayNote.date, systemRemark ?? "");
    if (remote === dayNote.text) return;

    // ตามข้อความจากระบบกลาง (ข้อมูลภายนอกที่มาทาง poll) และต้องเขียน noteDraftRef ด้วย จึงอยู่ใน effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDayNote({ ...dayNote, text: remote, updatedAt: null });
    updateNoteDraft(remote);
  }, [systemRemark, dayNote, noteStatus, selectedDate]);

  const languages: Language[] = ["TH", "EN", "KR"];
  const visibleRangeStart = new Date(latestDataDate);
  visibleRangeStart.setDate(latestDataDate.getDate() - 30);
  const dateOptions = Array.from({ length: 31 }, (_, index) => {
    const date = new Date(visibleRangeStart);
    date.setDate(visibleRangeStart.getDate() + index);
    return date;
  });
  const selectedDayIndexRaw = dateOptions.findIndex(
    (date) => date.toDateString() === selectedDate.toDateString(),
  );
  // findIndex คืน -1 เมื่อวันที่เลือกหลุดออกนอกช่วง 31 วันที่แสดงอยู่
  // ของเดิมใช้ Math.max(..., 0) ทำให้ตกไปที่ index 0 ซึ่งคือวันเก่าสุด (ย้อนหลัง 30 วัน)
  // จึงเห็นอาการ "ข้อมูลย้อนกลับ" เวลาที่ latestDataDate ขยับจากการ poll ทุก 2 นาที
  const selectedDayIndex =
    selectedDayIndexRaw >= 0 ? selectedDayIndexRaw : dateOptions.length - 1;

  // ถ้าวันที่เลือกหลุดออกนอกช่วงที่แสดงได้ (เช่น latestDataDate ขยับหลัง poll)
  // ให้ดึงกลับมาที่วันล่าสุดที่มีข้อมูล ไม่ปล่อยให้ state กับหน้าจอไม่ตรงกัน
  // ทำระหว่าง render (ไม่ใช่ใน effect) React จะ render ใหม่ทันทีก่อนวาดจอ ไม่เห็นวันผิดแวบหนึ่ง
  // รอบถัดไปวันที่เลือกอยู่ในช่วงแล้ว เงื่อนไขนี้จึงไม่วนซ้ำ
  if (selectedDayIndexRaw === -1 && dateOptions.length > 0) {
    setSelectedDate(dateOptions[dateOptions.length - 1]);
  }

  const handlePrevDay = () => {
    const previousDate = dateOptions[selectedDayIndex - 1];
    if (previousDate) {
      setSelectedDate(previousDate);
    }
  };

  const handleNextDay = () => {
    const nextDate = dateOptions[selectedDayIndex + 1];
    if (nextDate) {
      setSelectedDate(nextDate);
    }
  };

  // --- ปฏิทินเลือกวัน ---
  //
  // เลือกได้เฉพาะ 31 วันเดียวกับที่แถบด้านล่างแสดง ไม่ใช่ทุกวันในปฏิทิน
  // เพราะคีย์ข้อมูลจาก API เป็นแค่ "เดือน-กะ-วันที่" (เช่น Sep-Total-16) ไม่มีปีกำกับ
  // ถ้าปล่อยให้เลือกย้อนไปไกลกว่านี้ จะไปหยิบข้อมูลของเดือนเดียวกันคนละปีมาแสดง
  // วันที่อยู่นอกช่วงจึงถูกหรี่และกดไม่ได้ แทนที่จะซ่อนจนผู้ใช้งงว่าปฏิทินขาดไปครึ่งเดือน
  const rangeFirstDate = dateOptions[0];
  const rangeLastDate = dateOptions[dateOptions.length - 1];

  const isDateInRange = (date: Date) => {
    const target = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ).getTime();
    const first = new Date(
      rangeFirstDate.getFullYear(),
      rangeFirstDate.getMonth(),
      rangeFirstDate.getDate(),
    ).getTime();
    const last = new Date(
      rangeLastDate.getFullYear(),
      rangeLastDate.getMonth(),
      rangeLastDate.getDate(),
    ).getTime();

    return target >= first && target <= last;
  };

  /** ช่องทั้งหมดของเดือนนั้น เติม null ด้านหน้า/ท้ายให้ครบแถวละ 7 ช่อง */
  const buildMonthCells = (month: Date) => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const leadingBlanks = new Date(year, monthIndex, 1).getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cells: (Date | null)[] = Array.from(
      { length: leadingBlanks },
      () => null,
    );

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(new Date(year, monthIndex, day));
    }

    while (cells.length % 7 !== 0) cells.push(null);

    return cells;
  };

  const shiftPickerMonth = (step: number) =>
    setPickerMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + step, 1),
    );

  // ปิดปุ่มพลิกเดือนเมื่อเดือนถัดไปไม่มีวันที่เลือกได้เลย จะได้ไม่พลิกไปเจอหน้าว่าง ๆ
  const hasSelectableDayInMonth = (month: Date) =>
    buildMonthCells(month).some((date) => date && isDateInRange(date));

  const handleOpenDatePicker = () => {
    setPickerMonth(
      new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
    );
    setShowDatePicker(true);
  };

  const handlePickDate = (date: Date) => {
    setSelectedDate(date);
    setShowDatePicker(false);
  };

  const formatDate = (date: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${days[date.getDay()]} ${date.getDate()} ${MONTH_KEYS[date.getMonth()]}`;
  };

  // คืนทั้งสไตล์ช่อง สีตัวอักษร และสีแถบสถานะใต้ช่อง
  //
  // ใช้เกณฑ์สามระดับเดียวกับการ์ดและ legend (ของเดิมมีแค่ผ่าน/ไม่ผ่าน
  // วันที่ได้ 95% จึงขึ้นแดงในแถบวันที่ แต่การ์ดข้างล่างขึ้นเหลือง ขัดกันเอง)
  // พื้นเป็นสีจาง ๆ แทนบล็อกสีทึบ 31 ช่องที่ฉูดฉาดจนหาช่องที่เลือกไม่เจอ
  // แล้วใช้แถบสีเต็มด้านล่างช่องบอกสถานะแทน กวาดตาดูทั้งเดือนก็ยังเห็นชัด
  const getDayTone = (date: Date) => {
    const total = getSolarApiValueForDate(date, "Total");

    if (total === undefined) {
      return {
        cell: styles.dayCellEmpty,
        text: palette.dayEmptyText,
        bar: null as string | null,
      };
    }

    const status = getStatusColor(total, SHIFT_TARGETS.total, palette);

    return {
      cell: {
        // พื้นต้องเป็นสีทึบ ไม่ใช่สีสถานะโปร่งแสง (status.color + "1c")
        // ช่องที่ถูกเลือกมีเงา (elevation) ซึ่ง Android วาดไว้ใต้ช่อง ถ้าพื้นโปร่ง เงาจะทะลุขึ้นมา
        // เป็นก้อนสีเทาทั้งช่อง (เห็นชัดในโหมดสว่าง) จึงผสมสีกับพื้นการ์ดไว้ก่อน หน้าตาเท่าเดิม
        backgroundColor: blendHex(
          palette.surface,
          status.color,
          isDarkMode ? 0x24 / 255 : 0x1c / 255,
        ),
        borderColor: status.color + (isDarkMode ? "4d" : "59"),
      },
      text: status.ink,
      bar: status.color as string | null,
    };
  };

  const formatWeekRange = () => {
    const rangeEnd = latestDataDate;

    if (visibleRangeStart.getMonth() === rangeEnd.getMonth()) {
      return `${visibleRangeStart.getDate()}-${rangeEnd.getDate()} ${MONTH_KEYS[visibleRangeStart.getMonth()]}`;
    }

    return `${visibleRangeStart.getDate()} ${MONTH_KEYS[visibleRangeStart.getMonth()]} - ${rangeEnd.getDate()} ${MONTH_KEYS[rangeEnd.getMonth()]}`;
  };

  const formatSyncTime = (date: Date) =>
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // เวลาอย่างเดียวชวนเข้าใจผิด "09:02 PM" ของเมื่อวานดูเหมือนเพิ่งอัปเดตเมื่อคืนนี้
  // ถ้าไม่ใช่วันนี้จึงเติมวันที่นำหน้า
  const formatSyncStamp = (date: Date) =>
    isDateToday(date)
      ? formatSyncTime(date)
      : `${date.getDate()} ${MONTH_KEYS[date.getMonth()]} ${formatSyncTime(date)}`;

  const noteStatusText =
    noteStatus === "saving"
      ? t.noteSaving
      : noteStatus === "localOnly"
        ? t.noteLocalOnly
        : noteStatus === "saved"
          ? t.noteSaved
          : dayNote?.updatedAt
            ? `${t.lastSynced} ${formatSyncTime(dayNote.updatedAt)}`
            : "";

  // ต่อ Firestore ได้ แต่เซิร์ฟเวอร์ในวงไม่ได้อ่านข้อมูลจาก API จริงมานานแล้ว
  // ใช้ checkedAt ไม่ใช่ updatedAt เพราะ updatedAt นิ่งทั้งคืนเป็นปกติ
  // ถ้าเซิร์ฟเวอร์ยังเป็นรุ่นเก่าที่ไม่มี checkedAt จะไม่เตือน (ไม่รู้ ≠ ค้าง)
  const isDataStale = !hasConnectionError && isCheckStale;

  // ไล่ไม่เกิน 365 คีย์และคำนวณเฉพาะตอนเปิดกราฟ จึงไม่ต้อง memo
  const chartMonths =
    chartMonthIndex !== null ? getMonthsWithData(solarData, new Date()) : [];

  const isToday = selectedDate.toDateString() === new Date().toDateString();
  const isDateToday = (date: Date) =>
    date.toDateString() === new Date().toDateString();
  const isSameCalendarDate = (firstDate: Date, secondDate: Date) => {
    return firstDate.toDateString() === secondDate.toDateString();
  };

  const getStripOffsetForIndex = useCallback(
    (index: number) =>
      Math.max(
        // จัดให้ช่องวันที่เลือกอยู่กลางแถบ อ่านง่ายกว่าดันไปชิดขวาแบบเดิม
        index * dateStripStep - dateStripViewportWidth / 2 + dateCellWidth / 2,
        0,
      ),
    [dateCellWidth, dateStripStep, dateStripViewportWidth],
  );

  useEffect(() => {
    // ถ้าการเปลี่ยนวันมาจากการปัดการ์ดเอง ไม่ต้องสั่งเลื่อน pager ซ้ำ
    // ไม่งั้นจะกระตุกเพราะไปทับกับ momentum ที่เพิ่งจบ
    if (!isPagerSwipeRef.current) {
      shiftScrollerRef.current?.scrollTo({
        x: selectedDayIndex * shiftPageWidth,
        animated: false,
      });
    }
    isPagerSwipeRef.current = false;

    dateStripRef.current?.scrollTo({
      x: getStripOffsetForIndex(selectedDayIndex),
      animated: true,
    });
  }, [getStripOffsetForIndex, selectedDayIndex, shiftPageWidth]);

  // scrollTo ใน useEffect ครั้งแรกอาจวิ่งก่อน ScrollView วัดขนาดเนื้อหาเสร็จ (เจอบ่อยบน Android)
  // แล้วถูกเมินไปเงียบ ๆ pager จึงค้างอยู่หน้าแรกสุด (ย้อนหลัง 30 วัน) ทั้งที่หัววันที่บอกว่าวันนี้
  // พอเนื้อหามีขนาดแล้วจึงสั่งเลื่อนซ้ำอีกครั้ง
  const handleShiftPagerContentSizeChange = () => {
    shiftScrollerRef.current?.scrollTo({
      x: selectedDayIndex * shiftPageWidth,
      animated: false,
    });
  };

  const handleDateStripContentSizeChange = () => {
    dateStripRef.current?.scrollTo({
      x: getStripOffsetForIndex(selectedDayIndex),
      animated: false,
    });
  };

  const settleShiftPagerAt = (offsetX: number) => {
    // ตอนยังวัดความกว้างไม่ได้ (0) การหารจะได้ NaN/Infinity
    if (shiftPageWidth <= 0) return;

    const pageIndex = Math.round(offsetX / shiftPageWidth);
    const nextDate = dateOptions[pageIndex];

    if (nextDate && !isSameCalendarDate(nextDate, selectedDate)) {
      isPagerSwipeRef.current = true;
      setSelectedDate(nextDate);
    }
  };

  const handleShiftPagerMomentumEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    settleShiftPagerAt(event.nativeEvent.contentOffset.x);
  };

  // react-native-web ไม่ยิง onMomentumScrollEnd เลย (มีแต่ onScroll)
  // ของเดิมบนเว็บจึงปัดการ์ดไปวันอื่นได้ แต่หัววันที่กับแถบวันที่ไม่ขยับตาม
  // ถือว่า "หยุดเลื่อนแล้ว" เมื่อไม่มี scroll event มาอีก 150ms (scroll-snap จบพอดี)
  const handleShiftPagerScrollWeb = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const offsetX = event.nativeEvent.contentOffset.x;

    if (webPagerSettleTimerRef.current) {
      clearTimeout(webPagerSettleTimerRef.current);
    }

    webPagerSettleTimerRef.current = setTimeout(() => {
      webPagerSettleTimerRef.current = null;
      settleShiftPagerAt(offsetX);
    }, 150);
  };

  // คำนวณครั้งเดียวต่อรอบ render ของเดิมเรียก buildMonthCells ซ้ำทุกแถวและทุกปุ่ม
  const pickerCells = buildMonthCells(pickerMonth);
  const canPickPrevMonth = hasSelectableDayInMonth(
    new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1),
  );
  const canPickNextMonth = hasSelectableDayInMonth(
    new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1),
  );

  return (
    // flexGrow: 1 ทำให้ปกติทุกอย่างพอดีหน้าจอเดียวและ "เลื่อนไม่ได้" เหมือนใช้ View ธรรมดา
    // แต่ถ้าจอเตี้ยจนเนื้อหาไม่พอจริง ๆ จะเลื่อนได้แทนที่จะถูกตัดขอบหายไปเฉย ๆ
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        styles.pageContent,
        {
          maxWidth: MAX_CONTENT_WIDTH,
          paddingHorizontal: screenPadding,
          // เว้นความสูงของแถบสถานะ/รอยบากไว้ด้วย ไม่งั้นหัวข้อจะชนขอบบนจอ
          paddingTop: safeAreaInsets.top + screenPadding,
          // ปุ่มนำทางแบบ gesture ด้านล่างก็กินพื้นที่เหมือนกัน
          paddingBottom: Math.max(safeAreaInsets.bottom, screenPadding),
        },
      ]}
      showsVerticalScrollIndicator={false}
      // ไม่งั้นการแตะปุ่ม "เสร็จ" ตอนคีย์บอร์ดเปิดอยู่จะโดนกินไปกับการปิดคีย์บอร์ด
      keyboardShouldPersistTaps="handled"
      // ดึงลงเพื่อดึงข้อมูลใหม่ทันที ไม่ต้องรอรอบ 2 นาที
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={palette.accent}
          colors={[palette.accent]}
          progressBackgroundColor={palette.surface}
          // เลื่อนวงหมุนลงมาใต้รอยบาก ไม่งั้นถูกแถบสถานะบังไปครึ่งหนึ่ง
          progressViewOffset={safeAreaInsets.top}
        />
      }
    >
      {/* ให้ไอคอนบนแถบสถานะสลับสีตามธีมที่ผู้ใช้เลือก ไม่ใช่ตามธีมของเครื่อง */}
      <StatusBar style={isDarkMode ? "light" : "dark"} />

      {/* Header */}
      <View style={styles.header}>
        {/* จอแคบเอาที่ให้ชื่อหัวข้อก่อน ไอคอนเป็นแค่ของตกแต่ง */}
        {showBrandTile && (
          <View style={styles.brandTile}>
            <SolarMark
              size={30}
              color={palette.accent}
              backgroundColor={palette.accentSoft}
            />
          </View>
        )}
        <View style={styles.headerTitleBlock}>
          {/* บังคับบรรทัดเดียว ของเดิมตัดเป็น 2 บรรทัดกินความสูงไป 29dp
              ซึ่งเป็นสาเหตุหลักที่การ์ดใบล่างสุดถูกตัดขอบ */}
          <Text
            style={[
              styles.title,
              { fontSize: titleFontSize, lineHeight: titleFontSize + 6 },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {t.title}
          </Text>
          {/* เวลาซิงก์ล่าสุดเคยโผล่เฉพาะตอนต่อเซิร์ฟเวอร์ไม่ได้
              ทั้งที่ตอนปกติผู้ใช้ก็อยากรู้ว่าข้อมูลสดแค่ไหน
              วางไว้ในช่องว่างใต้หัวข้อ จึงไม่กินความสูงเพิ่มจากแถวปุ่ม (44dp) */}
          {!hasConnectionError && lastSyncedAt && (
            <View style={[styles.livePill, isDataStale && styles.livePillStale]}>
              <View
                style={[styles.liveDot, isDataStale && styles.liveDotStale]}
              />
              <Text
                style={[styles.liveText, isDataStale && styles.liveTextStale]}
                numberOfLines={1}
              >
                {isDataStale ? t.stale : t.live} · {formatSyncStamp(lastSyncedAt)}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[
              styles.iconButton,
              { width: headerIconSize, height: headerIconSize },
            ]}
            onPress={openDailyChart}
            accessibilityRole="button"
            accessibilityLabel={t.dailyTitle}
          >
            <MaterialCommunityIcons
              name="chart-bar"
              size={22}
              color={palette.accent}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.iconButton,
              { width: headerIconSize, height: headerIconSize },
            ]}
            onPress={handleToggleTheme}
            accessibilityRole="button"
            accessibilityLabel={isDarkMode ? t.themeToLight : t.themeToDark}
          >
            <MaterialCommunityIcons
              name={isDarkMode ? "weather-sunny" : "weather-night"}
              size={22}
              color={palette.accent}
            />
          </TouchableOpacity>

          {/* เปิดเป็น Modal แทน dropdown ลอย เหตุผลเดียวกับปฏิทินด้านล่าง:
              บน Android แถบเลือกวันที่มี elevation จะวาดทับ dropdown จนกดภาษาล่าง ๆ ไม่ได้
              และแบบเดิมแตะที่ว่างแล้วเมนูไม่ปิด */}
          <TouchableOpacity
            style={[styles.languageIconButton, { height: headerIconSize }]}
            onPress={() => setShowLanguageMenu(true)}
            accessibilityRole="button"
            accessibilityLabel={t.language}
          >
            <MaterialCommunityIcons name="web" size={20} color={palette.accent} />
            <Text style={styles.languageIconText}>{lang}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* แถบบอกสถานะการเชื่อมต่อ โผล่เฉพาะตอนโหลดครั้งแรกหรือต่อเซิร์ฟเวอร์ไม่ได้
          ตอนต่อไม่ได้แตะเพื่อลองใหม่ได้ทันที ไม่ต้องรอรอบ 2 นาที */}
      {(isSolarDataLoading || hasConnectionError) && (
        <TouchableOpacity
          activeOpacity={0.7}
          disabled={!hasConnectionError || isRefreshing}
          onPress={handleRefresh}
          accessibilityRole={hasConnectionError ? "button" : undefined}
          accessibilityHint={hasConnectionError ? t.retry : undefined}
          style={[
            styles.statusBanner,
            hasConnectionError && styles.statusBannerError,
          ]}
        >
          <MaterialCommunityIcons
            name={
              hasConnectionError && !isRefreshing
                ? "cloud-off-outline"
                : "cloud-sync-outline"
            }
            size={20}
            color={hasConnectionError ? palette.criticalInk : palette.accent}
          />
          <Text
            style={[
              styles.statusBannerText,
              hasConnectionError && styles.statusBannerTextError,
            ]}
            numberOfLines={2}
          >
            {hasConnectionError
              ? lastSyncedAt
                ? `${t.offline} (${t.lastSynced} ${formatSyncStamp(lastSyncedAt)})`
                : t.offline
              : t.loading}
          </Text>
          {hasConnectionError && (
            <MaterialCommunityIcons
              name="refresh"
              size={20}
              color={palette.criticalInk}
            />
          )}
        </TouchableOpacity>
      )}

      {/* เซิร์ฟเวอร์ในวงค้าง: แอปต่อได้ปกติแต่ตัวเลขที่เห็นอาจไม่ใช่ของล่าสุด
          ต้องบอกให้ชัด ไม่งั้นคนหน้างานจะตัดสินใจจากยอดที่หยุดนิ่งไปแล้ว */}
      {isDataStale && lastCheckedAt && (
        <View style={[styles.statusBanner, styles.statusBannerStale]}>
          <MaterialCommunityIcons
            name="clock-alert-outline"
            size={20}
            color={palette.warningInk}
          />
          <Text
            style={[styles.statusBannerText, styles.statusBannerTextStale]}
            numberOfLines={2}
          >
            {t.staleDetail} {formatSyncStamp(lastCheckedAt)}
          </Text>
        </View>
      )}

      {/* Date Selector */}
      <View style={[styles.dateSelector, { padding: dateSelectorPadding }]}>
        <View
          style={[
            styles.dateSelectorHeader,
            isCompact && styles.dateSelectorHeaderCompact,
          ]}
        >
          <TouchableOpacity
            onPress={handlePrevDay}
            disabled={selectedDayIndex <= 0}
            accessibilityRole="button"
            style={[
              styles.dateButton,
              { width: dateButtonSize, height: dateButtonSize },
              selectedDayIndex <= 0 && styles.buttonDisabled,
            ]}
          >
            <MaterialCommunityIcons
              name="chevron-left"
              size={28}
              color={palette.accent}
            />
          </TouchableOpacity>
          <View style={styles.dateDisplay}>
            {/* วางวันที่กับ "Today" ไว้แถวเดียวกัน ประหยัดความสูงให้การ์ดด้านล่าง */}
            {/* กดที่วันที่เพื่อเปิดปฏิทิน เร็วกว่าไล่กดลูกศรทีละวันเวลาย้อนไปหลายวัน */}
            <TouchableOpacity
              style={styles.dateHeadingRow}
              onPress={handleOpenDatePicker}
              accessibilityRole="button"
              accessibilityLabel={t.pickDate}
            >
              <Text
                style={[styles.dateText, isCompact && styles.dateTextCompact]}
                numberOfLines={1}
              >
                {formatDate(selectedDate)}
              </Text>
              <MaterialCommunityIcons
                name="calendar-month-outline"
                size={18}
                color={palette.accent}
              />
              {isToday && <Text style={styles.todayLabel}>{t.today}</Text>}
            </TouchableOpacity>
            {/* ช่วงวันที่เป็นข้อมูลรอง จอเตี้ยตัดออกเพื่อเอาที่ไปให้การ์ด */}
            {!isShortScreen && (
              <Text style={styles.weekRangeText}>{formatWeekRange()}</Text>
            )}
          </View>
          <TouchableOpacity
            onPress={handleNextDay}
            disabled={selectedDayIndex >= dateOptions.length - 1}
            accessibilityRole="button"
            style={[
              styles.dateButton,
              { width: dateButtonSize, height: dateButtonSize },
              selectedDayIndex >= dateOptions.length - 1 &&
                styles.buttonDisabled,
            ]}
          >
            <MaterialCommunityIcons
              name="chevron-right"
              size={28}
              color={palette.accent}
            />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={dateStripRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={handleDateStripContentSizeChange}
          contentContainerStyle={[styles.weekStrip, { columnGap: dateCellGap }]}
        >
          {dateOptions.map((date) => {
            const tone = getDayTone(date);
            const isSelected = isSameCalendarDate(date, selectedDate);

            return (
              <TouchableOpacity
                key={date.toDateString()}
                style={[
                  styles.dayCell,
                  { width: dateCellWidth, height: dayCellHeight },
                  tone.cell,
                  isSelected && styles.dayCellSelected,
                ]}
                onPress={() => setSelectedDate(date)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <Text
                  style={[
                    styles.dayNameText,
                    isCompact && styles.dayNameTextCompact,
                    { color: tone.text },
                  ]}
                >
                  {WEEKDAY_LABELS[date.getDay()]}
                </Text>
                <Text style={[styles.dayCellText, { color: tone.text }]}>
                  {date.getDate()}
                </Text>
                {tone.bar && (
                  <View
                    style={[styles.dayStatusBar, { backgroundColor: tone.bar }]}
                  />
                )}
                {isDateToday(date) && (
                  <View
                    style={[styles.todayDot, { backgroundColor: palette.today }]}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ข้อความ legend เดิมฮาร์ดโค้ดภาษาไทยไว้ ไม่เปลี่ยนตามภาษาที่เลือก */}
      <View style={[styles.legendRow, { columnGap: legendGap }]}>
        {legendItems.map((item) => (
          <View
            key={item.threshold}
            style={[
              styles.legendPill,
              {
                gap: legendGap,
                paddingHorizontal: Math.max(legendPadding - 4, 6),
                backgroundColor: item.color + "14",
                borderColor: item.color + "33",
              },
            ]}
          >
            <View
              style={[
                styles.legendDot,
                {
                  width: legendDotSize,
                  height: legendDotSize,
                  borderRadius: legendDotSize / 2,
                  backgroundColor: item.color,
                },
              ]}
            />
            {/* บีบให้พอดีช่องของตัวเอง ไม่ดันให้แถวล้น */}
            <Text
              style={[styles.legendText, { fontSize: legendFontSize }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {item.label}
              {showLegendThresholds && (
                <Text style={styles.legendThreshold}> {item.threshold}</Text>
              )}
            </Text>
          </View>
        ))}
      </View>

      {/* Daily Shift Cards */}
      <ScrollView
        ref={shiftScrollerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onMomentumScrollEnd={handleShiftPagerMomentumEnd}
        onScroll={Platform.OS === "web" ? handleShiftPagerScrollWeb : undefined}
        scrollEventThrottle={Platform.OS === "web" ? 32 : undefined}
        onContentSizeChange={handleShiftPagerContentSizeChange}
        style={styles.shiftArea}
        contentContainerStyle={styles.shiftScrollerContent}
      >
        {dateOptions.map((date) => (
          <View
            key={date.toDateString()}
            style={[
              styles.shiftPage,
              {
                width: shiftPageWidth,
              },
            ]}
          >
            {getShiftData(date).map((shift) => {
              const generated = shift.generated;
              // ยังไม่มีข้อมูล = แสดงเป็นสีกลางและขีด ไม่ใช่ 0% สีแดงซึ่งสื่อว่าผลิตไม่ได้
              const statusInfo: StatusInfo =
                generated !== null
                  ? getStatusColor(generated, shift.target, palette)
                  : {
                      color: palette.textMuted,
                      ink: palette.textMuted,
                      status: "pending",
                    };
              const percentValue =
                generated !== null
                  ? getPercentOfTarget(generated, shift.target)
                  : null;
              const percentage =
                percentValue !== null ? percentValue.toFixed(1) + "%" : "—";
              // ค่าติดลบ (มิเตอร์รีเซ็ต/ข้อมูลเพี้ยน) ต้องไม่ทำให้ความกว้างแถบติดลบ
              const fillPercent = Math.min(Math.max(percentValue ?? 0, 0), 100);
              const statusIcon = STATUS_ICONS[statusInfo.status];
              const shiftIcon = SHIFT_ICONS[shift.time];

              return (
                <View
                  key={shift.time}
                  style={[styles.shiftCard, { paddingVertical: cardPadding }]}
                >
                  {/* แถบสีด้านซ้ายบอกสถานะของการ์ดได้ตั้งแต่ชายตามอง */}
                  <View
                    style={[
                      styles.cardAccent,
                      { backgroundColor: statusInfo.color },
                    ]}
                  />
                  <View
                    style={[
                      styles.shiftHeader,
                      {
                        marginBottom: cardHeaderSpacing,
                        paddingBottom: cardHeaderSpacing,
                      },
                    ]}
                  >
                    <View style={styles.shiftLabelRow}>
                      <View
                        style={[
                          styles.shiftIconTile,
                          {
                            backgroundColor: statusInfo.color + "1a",
                            borderColor: statusInfo.color + "33",
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={shiftIcon}
                          size={16}
                          color={statusInfo.ink}
                        />
                      </View>
                      <View style={styles.shiftTitleBlock}>
                        <Text style={styles.shiftLabel} numberOfLines={1}>
                          {shift.label}
                        </Text>
                        {/* สภาพอากาศจริงตอนปิดยอดกะ อธิบายได้ทันทีว่ายอดต่ำเพราะฟ้าฝนหรือเพราะเครื่อง
                            วางไว้ใต้ชื่อกะข้างไอคอน (สูง 28) จึงเพิ่มความสูงการ์ดแค่ราว 8dp */}
                        {shift.weather && (
                          <View
                            style={styles.weatherRow}
                            accessible
                            accessibilityLabel={
                              shift.weather.temperature !== null
                                ? `${shift.weather.temperature}°C ${shift.weather.condition}`
                                : shift.weather.condition
                            }
                          >
                            <MaterialCommunityIcons
                              name={shift.weather.icon}
                              size={13}
                              color={palette.textMuted}
                            />
                            <Text style={styles.weatherText} numberOfLines={1}>
                              {shift.weather.temperature !== null && (
                                <Text style={styles.weatherTemp}>
                                  {shift.weather.temperature.toFixed(1)}°C{" "}
                                </Text>
                              )}
                              {shift.weather.condition}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: statusInfo.color + "1a",
                          borderColor: statusInfo.color + "4d",
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={statusIcon}
                        size={14}
                        color={statusInfo.ink}
                      />
                      <Text
                        style={[styles.statusBadgeText, { color: statusInfo.ink }]}
                      >
                        {percentage}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.shiftContent,
                      isCompact && styles.shiftContentCompact,
                      { marginBottom: cardContentSpacing },
                    ]}
                  >
                    <View style={styles.valueBox}>
                      <Text style={styles.valueLabel}>{t.generated}</Text>
                      {/* หน่วยย้ายมาต่อท้ายตัวเลขบรรทัดเดียวกัน
                          ประหยัดความสูงไปการ์ดละบรรทัด และอ่านเป็นก้อนเดียว */}
                      <View style={styles.valueRow}>
                        <Text
                          style={[
                            styles.value,
                            {
                              fontSize: generatedFontSize,
                              lineHeight: generatedFontSize + 5,
                              color: statusInfo.ink,
                            },
                          ]}
                        >
                          {generated !== null ? generated.toLocaleString() : "—"}
                        </Text>
                        <Text style={styles.unit}>KWh</Text>
                      </View>
                    </View>

                    <View style={[styles.valueBox, styles.valueBoxRight]}>
                      <Text style={styles.valueLabel}>{t.target}</Text>
                      <View style={styles.valueRow}>
                        <Text
                          style={[
                            styles.value,
                            styles.valueTarget,
                            {
                              fontSize: targetFontSize,
                              lineHeight: targetFontSize + 5,
                            },
                          ]}
                        >
                          {shift.target.toLocaleString()}
                        </Text>
                        <Text style={styles.unit}>KWh</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.progressRow}>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${fillPercent}%`,
                            backgroundColor: statusInfo.color,
                          },
                        ]}
                      />
                      {/* ขีดที่ 90% คือเส้นแบ่ง "เฝ้าระวัง" ตามเกณฑ์ใน getStatusColor
                          ทำให้เห็นว่าเหลืออีกนิดเดียวจะหลุดเกณฑ์ */}
                      <View style={styles.progressThreshold} />
                    </View>
                    {/* ขาด/เกินเป้ากี่ KWh — คนหน้างานใช้ตัวนี้ตัดสินใจมากกว่าเปอร์เซ็นต์ */}
                    {generated !== null && (
                      <Text
                        style={[styles.deltaText, { color: statusInfo.ink }]}
                        numberOfLines={1}
                      >
                        {formatDelta(generated - shift.target)}
                        <Text style={styles.deltaUnit}> KWh</Text>
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* หมายเหตุประจำวัน — อธิบายว่าทำไมยอดของวันนี้ถึงผิดไปจากปกติ
          ยุบเหลือบรรทัดเดียว เพราะการ์ดสามใบด้านบนต้องพอดีหน้าจอเดียว
          กดได้ทั้งการ์ด (ไม่ใช่แค่บรรทัดข้อความ) มือถือที่แถบปุ่มบังขอบล่างอยู่บ้างก็ยังกดโดน */}
      <TouchableOpacity
        style={[styles.noteCard, isEditingNote && styles.noteCardEditing]}
        onPress={handleStartEditingNote}
        disabled={!isNoteReady}
        accessibilityRole="button"
        accessibilityLabel={t.remark}
      >
        <View style={styles.noteHeader}>
          <MaterialCommunityIcons
            name="note-edit-outline"
            size={14}
            color={isEditingNote ? palette.accent : palette.textMuted}
          />
          <Text style={styles.noteLabel}>{t.remark}</Text>
          {noteStatusText ? (
            <Text style={styles.noteStatus} numberOfLines={1}>
              {noteStatusText}
            </Text>
          ) : null}
        </View>

        {/* ระหว่างโหลดหมายเหตุของวันใหม่ เว้นบรรทัดว่างไว้ให้ความสูงคงที่ การ์ดด้านบนจะไม่กระตุก */}
        <Text
          style={[
            styles.noteText,
            (!noteDraft || !isNoteReady) && styles.notePlaceholderText,
          ]}
          numberOfLines={2}
        >
          {isNoteReady ? noteDraft || t.clickAdd : " "}
        </Text>
      </TouchableOpacity>

      {/* ช่องพิมพ์หมายเหตุ เปิดเป็นกล่องลอยชิดด้านบนของจอ
          ของเดิมพิมพ์ในการ์ดล่างสุดของหน้า ซึ่งคีย์บอร์ดและแถบปุ่มนำทางบังพอดี
          วางไว้ด้านบนจึงอยู่เหนือคีย์บอร์ดเสมอ ไม่ต้องพึ่งการย่อหน้าจอของแต่ละยี่ห้อ
          บันทึกอัตโนมัติระหว่างพิมพ์เหมือนเดิม ปิดกล่องด้วยปุ่มเสร็จ/แตะพื้นหลัง/ปุ่มย้อนกลับ */}
      <Modal
        visible={isEditingNote}
        transparent
        animationType="fade"
        onRequestClose={handleNoteDone}
      >
        <TouchableOpacity
          style={[
            styles.noteEditorBackdrop,
            { paddingTop: safeAreaInsets.top + 16 },
          ]}
          activeOpacity={1}
          onPress={handleNoteDone}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.modalCard, styles.noteEditorCard]}
          >
            <View style={styles.noteHeader}>
              <MaterialCommunityIcons
                name="note-edit-outline"
                size={14}
                color={palette.accent}
              />
              <Text style={styles.noteLabel}>
                {t.remark} · {formatDate(selectedDate)}
              </Text>
              <Text style={styles.noteStatus} numberOfLines={1}>
                {noteStatusText}
              </Text>
              <TouchableOpacity
                style={styles.noteDoneButton}
                onPress={handleNoteDone}
                accessibilityRole="button"
              >
                <Text style={styles.noteDoneText}>{t.noteDone}</Text>
              </TouchableOpacity>
            </View>

            {/* ห้ามปิดกล่องตอน onBlur: ช่องพิมพ์หลุด focus ตั้งแต่นิ้วแตะปุ่ม "เสร็จ"
                กล่องจะหายก่อนนิ้วยก แล้วการแตะทะลุไปโดนปุ่มภาษาที่อยู่ข้างใต้พอดี */}
            <TextInput
              style={styles.noteInput}
              value={noteDraft}
              onChangeText={handleNoteChange}
              placeholder={t.noteHint}
              placeholderTextColor={palette.textMuted}
              multiline
              autoFocus
              maxLength={MAX_NOTE_LENGTH}
              textAlignVertical="top"
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* เลือกภาษา */}
      <Modal
        visible={showLanguageMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLanguageMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowLanguageMenu(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.modalCard, styles.languageCard]}
          >
            <View style={styles.modalHeading}>
              <MaterialCommunityIcons
                name="translate"
                size={16}
                color={palette.accent}
              />
              <Text style={styles.modalHeadingText}>{t.language}</Text>
            </View>
            {languages.map((code) => {
              const isActive = code === lang;

              return (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.languageOption,
                    isActive && styles.languageOptionActive,
                  ]}
                  onPress={() => handleSelectLanguage(code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    style={[
                      styles.languageCode,
                      isActive && styles.languageCodeActive,
                    ]}
                  >
                    {code}
                  </Text>
                  <Text style={styles.languageName} numberOfLines={1}>
                    {LANGUAGE_NAMES[code]}
                  </Text>
                  {isActive && (
                    <MaterialCommunityIcons
                      name="check"
                      size={20}
                      color={palette.accent}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* กราฟยอดรวมรายวัน (จอแนวนอน) ของแต่ละเดือน
          แยกเป็น Modal เพราะหน้าหลักต้องพอดีจอเดียว วางต่อท้ายจะดันการ์ดกะให้ต้องเลื่อน */}
      <Modal
        visible={chartMonthIndex !== null}
        animationType="fade"
        // ค่าเริ่มต้นของ iOS คือแนวตั้งอย่างเดียว Modal จะไม่หมุนตามตอนล็อกเป็นแนวนอน
        supportedOrientations={["portrait", "landscape"]}
        onRequestClose={() => setChartMonthIndex(null)}
      >
        {chartMonthIndex !== null && chartView === "yearly" && (
          <YearlyTotalChart
            data={solarData}
            year={new Date().getFullYear()}
            onOpenMonth={(monthIndex) => {
              setChartMonthIndex(monthIndex);
              setChartView("daily");
            }}
            onBack={() => setChartMonthIndex(null)}
            onChangeView={setChartView}
            colors={palette}
            labels={t}
            insets={safeAreaInsets}
          />
        )}
        {chartMonthIndex !== null && chartView === "daily" && (
          <DailyTotalChart
            key={chartMonthIndex}
            data={solarData}
            year={new Date().getFullYear()}
            monthIndex={chartMonthIndex}
            availableMonths={
              chartMonths.includes(chartMonthIndex)
                ? chartMonths
                : [...chartMonths, chartMonthIndex].sort((a, b) => a - b)
            }
            onChangeMonth={setChartMonthIndex}
            onBack={() => setChartMonthIndex(null)}
            onChangeView={setChartView}
            colors={palette}
            labels={t}
            lang={lang}
            insets={safeAreaInsets}
          />
        )}
      </Modal>

      {/* ปฏิทินเลือกวัน ใช้ Modal แทน dropdown ลอย เพราะการ์ดกะด้านล่างมี elevation
          ซึ่งบน Android จะวาดทับ View ที่ position absolute ถึงจะตั้ง zIndex ไว้ก็ตาม */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
        >
          {/* ครอบเนื้อหาไว้อีกชั้น ไม่งั้นการกดในปฏิทินจะทะลุไปโดน backdrop แล้วปิดทิ้ง */}
          <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
            <View style={styles.pickerHeader}>
              <TouchableOpacity
                style={[
                  styles.pickerNavButton,
                  !canPickPrevMonth && styles.buttonDisabled,
                ]}
                disabled={!canPickPrevMonth}
                onPress={() => shiftPickerMonth(-1)}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons
                  name="chevron-left"
                  size={24}
                  color={palette.accent}
                />
              </TouchableOpacity>

              <Text style={styles.pickerTitle}>
                {MONTH_KEYS[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}
              </Text>

              <TouchableOpacity
                style={[
                  styles.pickerNavButton,
                  !canPickNextMonth && styles.buttonDisabled,
                ]}
                disabled={!canPickNextMonth}
                onPress={() => shiftPickerMonth(1)}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={24}
                  color={palette.accent}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.pickerWeekRow}>
              {WEEKDAY_LABELS.map((label) => (
                <Text key={label} style={styles.pickerWeekLabel}>
                  {label.slice(0, 2)}
                </Text>
              ))}
            </View>

            {Array.from({ length: pickerCells.length / 7 }, (_, rowIndex) => (
              <View key={rowIndex} style={styles.pickerWeekRow}>
                {pickerCells
                  .slice(rowIndex * 7, rowIndex * 7 + 7)
                  .map((date, columnIndex) => {
                    if (!date) {
                      return (
                        <View
                          key={`blank-${columnIndex}`}
                          style={styles.pickerDayCell}
                        />
                      );
                    }

                    const isSelectable = isDateInRange(date);
                    // นอกช่วงยังโชว์เลขวันอยู่ แต่ไม่ให้สีสถานะ เพราะไม่มีข้อมูลจริงรองรับ
                    const tone = isSelectable ? getDayTone(date) : null;
                    const isSelected = isSameCalendarDate(date, selectedDate);

                    return (
                      <TouchableOpacity
                        key={date.toDateString()}
                        style={[
                          styles.pickerDayCell,
                          tone?.cell,
                          isSelected && styles.pickerDayCellSelected,
                        ]}
                        disabled={!isSelectable}
                        onPress={() => handlePickDate(date)}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: isSelected,
                          disabled: !isSelectable,
                        }}
                        accessibilityLabel={
                          isSelectable
                            ? `${date.getDate()} ${MONTH_KEYS[date.getMonth()]}`
                            : `${date.getDate()} ${MONTH_KEYS[date.getMonth()]} — ${t.noDataDay}`
                        }
                      >
                        <Text
                          style={[
                            styles.pickerDayText,
                            tone
                              ? { color: tone.text }
                              : styles.pickerDayTextDisabled,
                          ]}
                        >
                          {date.getDate()}
                        </Text>
                        {isDateToday(date) && isSelectable && (
                          <View
                            style={[
                              styles.todayDot,
                              { backgroundColor: palette.today },
                            ]}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
              </View>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
};

export default SolarDashboard;

// ภาษาภาพแบบจอควบคุมในโรงงาน (HMI):
// มุมโค้งน้อยลง ป้ายสถานะเป็นสี่เหลี่ยมแทนแคปซูล หัวข้อย่อยตัวพิมพ์ใหญ่เว้นช่องไฟกว้าง
// และตัวเลขทุกตัวใช้ tabular-nums ให้หลักตรงกันเวลาค่าอัปเดต
const RADIUS_CARD = 16;
const RADIUS_CONTROL = 12;
const RADIUS_CHIP = 8;

const createStyles = (c: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  content: {
    width: "100%",
    alignSelf: "center",
  },
  // เนื้อหาสูงอย่างน้อยเท่าหน้าจอ ทำให้ flex: 1 ข้างในแบ่งพื้นที่ได้
  // และจะเลื่อนก็ต่อเมื่อเนื้อหาสูงเกินจอจริง ๆ เท่านั้น
  pageContent: {
    flexGrow: 1,
  },
  // ครองพื้นที่ที่เหลือทั้งหมดหลังหักส่วนหัว/ตัวเลือกวัน/legend
  shiftArea: {
    flex: 1,
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  brandTile: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS_CONTROL,
    borderWidth: 1,
    borderColor: c.accentBorder,
    backgroundColor: c.accentSoft,
  },
  headerTitleBlock: {
    flex: 1,
    minWidth: 0,
    // ตอนยังไม่มีป้าย LIVE ให้หัวข้ออยู่กึ่งกลางแนวตั้งเท่ากับปุ่มข้าง ๆ
    minHeight: 44,
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: c.textPrimary,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.pass + "40",
    backgroundColor: c.pass + "14",
  },
  livePillStale: {
    borderColor: c.warning + "59",
    backgroundColor: c.warning + "1a",
  },
  liveDotStale: {
    backgroundColor: c.warning,
  },
  liveTextStale: {
    color: c.warningInk,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.pass,
  },
  liveText: {
    flexShrink: 1,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: c.passInk,
    fontVariant: ["tabular-nums"],
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS_CONTROL,
    marginBottom: 10,
    backgroundColor: c.accentSoft,
    borderWidth: 1,
    borderColor: c.accentBorder,
  },
  statusBannerError: {
    backgroundColor: c.critical + "14",
    borderColor: c.critical + "66",
  },
  statusBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: c.accent,
  },
  statusBannerStale: {
    backgroundColor: c.warning + "14",
    borderColor: c.warning + "66",
  },
  statusBannerTextStale: {
    color: c.warningInk,
  },
  statusBannerTextError: {
    color: c.criticalInk,
  },
  // ขนาดเท่าปุ่มภาษาให้ดูเป็นชุดเดียวกัน และกดง่ายด้วยนิ้ว (44 ตามขนาดขั้นต่ำที่นิ้วกดได้แม่นยำ)
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS_CONTROL,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  languageIconButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 44,
    paddingHorizontal: 11,
    borderRadius: RADIUS_CONTROL,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  languageIconText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: c.accent,
  },
  dateSelector: {
    backgroundColor: c.surface,
    borderRadius: RADIUS_CARD,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 12,
    gap: 12,
    elevation: 2,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  dateSelectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dateSelectorHeaderCompact: {
    gap: 8,
  },
  dateButton: {
    borderRadius: RADIUS_CONTROL,
    backgroundColor: c.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.accentBorder,
  },
  dateDisplay: {
    flex: 1,
    alignItems: "center",
  },
  dateText: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: 0.2,
    color: c.textPrimary,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  dateTextCompact: {
    fontSize: 18,
    lineHeight: 24,
  },
  dateHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  // ทำเป็นป้ายเล็ก ๆ แทนข้อความลอย ๆ ให้แยกออกจากวันที่ชัดเจน
  todayLabel: {
    fontSize: 11,
    lineHeight: 15,
    color: c.today,
    fontWeight: "800",
    letterSpacing: 0.6,
    backgroundColor: c.today + "1f",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  weekRangeText: {
    fontSize: 12,
    color: c.textMuted,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginTop: 3,
    fontVariant: ["tabular-nums"],
  },
  weekStrip: {
    flexDirection: "row",
    paddingRight: 2,
    // เผื่อที่ให้ช่องที่ถูกเลือกขยาย 1.06 เท่าโดยไม่โดนขอบ ScrollView ตัด
    paddingVertical: 2,
  },
  dayCell: {
    alignItems: "center",
    justifyContent: "center",
    // ดันตัวเลขขึ้นเล็กน้อย เว้นที่ให้แถบสถานะด้านล่างช่อง
    paddingBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  dayCellEmpty: {
    backgroundColor: c.dayEmpty,
    borderColor: c.border,
  },
  // ขอบสีดำ/ขาวแบบเดิมแข็งเกินไปบนช่องสีเขียว-แดง
  // เปลี่ยนเป็นขอบสี accent + ยกช่องขึ้นเล็กน้อย ให้อ่านว่า "ช่องนี้ถูกเลือก"
  dayCellSelected: {
    borderWidth: 2,
    borderColor: c.accent,
    transform: [{ scale: 1.06 }],
    zIndex: 1,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 7,
    elevation: 6,
  },
  // สีตัวอักษรส่งมาจาก getDayTone เพราะช่องที่ยังไม่มีข้อมูลเป็นพื้นอ่อน
  dayNameText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    opacity: 0.85,
    marginBottom: 2,
  },
  dayNameTextCompact: {
    fontSize: 9,
  },
  dayCellText: {
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  dayStatusBar: {
    position: "absolute",
    left: 9,
    right: 9,
    bottom: 5,
    height: 3,
    borderRadius: 2,
  },
  // จุดบอก "วันนี้" ย้ายไปมุมขวาบน เพราะด้านล่างช่องเป็นที่ของแถบสถานะแล้ว
  todayDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  shiftScrollerContent: {
    alignItems: "stretch",
  },
  // การ์ด 3 ใบแบ่งความสูงที่มีกันเอง ไม่ว่าจอจะสูงเท่าไร
  shiftPage: {
    justifyContent: "space-between",
    gap: 10,
    paddingBottom: 2,
  },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(2, 6, 23, 0.62)",
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    gap: 6,
    padding: 14,
    borderRadius: RADIUS_CARD,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    elevation: 12,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
  },
  modalHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  modalHeadingText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: c.textMuted,
  },
  languageCard: {
    maxWidth: 300,
    gap: 8,
  },
  languageOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: RADIUS_CONTROL,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceSubtle,
  },
  languageOptionActive: {
    borderColor: c.accent,
    backgroundColor: c.accentSoft,
  },
  languageCode: {
    width: 28,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: c.textMuted,
  },
  languageCodeActive: {
    color: c.accent,
  },
  languageName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: c.textPrimary,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: c.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  pickerNavButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS_CONTROL,
    borderWidth: 1,
    borderColor: c.accentBorder,
    backgroundColor: c.accentSoft,
  },
  pickerWeekRow: {
    flexDirection: "row",
  },
  pickerWeekLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: c.textMuted,
  },
  // flex: 1 ทำให้เจ็ดช่องแบ่งความกว้างเท่ากันเองทุกขนาดจอ ไม่ต้องคำนวณเป็นพิกเซล
  pickerDayCell: {
    flex: 1,
    aspectRatio: 1,
    margin: 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS_CHIP,
    // มีขอบใส ๆ ไว้ก่อน ช่องที่มีสีสถานะ (ซึ่งมีขอบ) จะได้ขนาดเท่าช่องอื่น
    borderWidth: 1,
    borderColor: "transparent",
  },
  pickerDayCellSelected: {
    borderWidth: 2,
    borderColor: c.accent,
  },
  pickerDayText: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  pickerDayTextDisabled: {
    color: c.textMuted,
    opacity: 0.45,
  },
  noteCard: {
    marginTop: 10,
    backgroundColor: c.surface,
    borderRadius: RADIUS_CONTROL + 2,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noteCardEditing: {
    borderColor: c.accent,
  },
  noteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  noteLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: c.textMuted,
  },
  // ดันสถานะไปชิดขวา และหดได้เมื่อจอแคบ แทนที่จะดันปุ่มตกขอบ
  noteStatus: {
    flex: 1,
    textAlign: "right",
    fontSize: 11,
    color: c.textMuted,
    fontVariant: ["tabular-nums"],
  },
  noteDoneButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: RADIUS_CHIP,
    backgroundColor: c.accent,
  },
  noteDoneText: {
    fontSize: 12,
    fontWeight: "800",
    color: c.onStatus,
  },
  noteText: {
    fontSize: 13,
    lineHeight: 18,
    color: c.textPrimary,
  },
  notePlaceholderText: {
    color: c.textMuted,
    fontStyle: "italic",
  },
  noteEditorBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 16,
    backgroundColor: "rgba(2, 6, 23, 0.62)",
  },
  noteEditorCard: {
    maxWidth: MAX_CONTENT_WIDTH,
    gap: 10,
    padding: 16,
  },
  noteInput: {
    // สูงคงที่ ไม่ยืดตามเนื้อหา กล่องจะได้ไม่ยาวลงไปจนคีย์บอร์ดบัง ข้อความยาวเลื่อนในช่องได้
    minHeight: 110,
    maxHeight: 180,
    padding: 10,
    fontSize: 15,
    lineHeight: 21,
    color: c.textPrimary,
    borderRadius: RADIUS_CONTROL,
    borderWidth: 1,
    borderColor: c.accentBorder,
    backgroundColor: c.surfaceSubtle,
  },
  shiftCard: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: c.surface,
    borderRadius: RADIUS_CARD,
    borderWidth: 1,
    borderColor: c.border,
    paddingLeft: 20,
    paddingRight: 16,
    paddingVertical: 14,
    // ต้องมี ไม่งั้นแถบสีด้านซ้ายจะทับมุมโค้งของการ์ด
    overflow: "hidden",
    elevation: 3,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  cardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  shiftHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  shiftLabelRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  shiftIconTile: {
    width: 28,
    height: 28,
    borderRadius: RADIUS_CHIP,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  shiftTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  weatherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  weatherText: {
    flexShrink: 1,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "600",
    color: c.textMuted,
  },
  weatherTemp: {
    fontWeight: "800",
    color: c.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  // อยู่ในคอลัมน์ (shiftTitleBlock) แล้ว ถ้าใช้ flex: 1 จะกลายเป็นยืดแนวตั้ง
  // ตัวหนังสืออาจถูกบีบจนสูงเป็นศูนย์ จึงให้หดได้อย่างเดียว
  shiftLabel: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
    letterSpacing: 0.1,
    color: c.textPrimary,
  },
  // ป้ายสี่เหลี่ยมมุมมนน้อย ๆ ดูเป็นไฟสถานะบนแผงควบคุมมากกว่าแคปซูล
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS_CHIP,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  shiftContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  shiftContentCompact: {
    gap: 8,
  },
  valueBox: {
    alignItems: "flex-start",
    minWidth: 54,
  },
  valueBoxRight: {
    alignItems: "flex-end",
  },
  valueLabel: {
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: c.textMuted,
    marginBottom: 2,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
  },
  value: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: c.textPrimary,
    // ตัวเลขความกว้างเท่ากันทุกหลัก ค่าจึงไม่กระตุกเวลาอัปเดตทุก 2 นาที
    fontVariant: ["tabular-nums"],
  },
  valueTarget: {
    fontWeight: "700",
    color: c.textSecondary,
  },
  unit: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    // เดิมเป็น #cbd5e1 ซึ่งจางเกินไปจนแทบมองไม่เห็นบนพื้นขาว
    color: c.textMuted,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: c.track,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressThreshold: {
    position: "absolute",
    left: "90%",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: c.surface,
    opacity: 0.9,
  },
  deltaText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  deltaUnit: {
    fontSize: 10,
    fontWeight: "700",
    color: c.textMuted,
  },
  // เดิมเป็นการ์ดใบใหญ่ใบหนึ่งซึ่งกินความสูงพอ ๆ กับข้อมูลจริง
  // เปลี่ยนเป็นชิป 3 อันเรียงแถวเดียว เบากว่าและคืนพื้นที่ให้การ์ดกะ
  legendRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    marginBottom: 10,
  },
  legendPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: RADIUS_CHIP,
    borderWidth: 1,
    // ถ้าไม่ใส่ minWidth: 0 ข้อความยาวจะดันช่องให้กว้างเกินส่วนแบ่งของตัวเอง
    minWidth: 0,
  },
  legendDot: {
    flexShrink: 0,
  },
  legendText: {
    flexShrink: 1,
    fontWeight: "700",
    color: c.textSecondary,
  },
  legendThreshold: {
    fontWeight: "600",
    color: c.textMuted,
    fontVariant: ["tabular-nums"],
  },
});
