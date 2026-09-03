import { MaterialCommunityIcons } from "@expo/vector-icons";
import axios from "axios";
import Constants from "expo-constants";
import * as Device from "expo-device";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
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
  SOLAR_DATA_API_URL,
  toNumber,
  type SolarApiData,
} from "@/lib/solar-alerts";

// --- Multi-language Translations ---
const translations = {
  TH: {
    title: "☀️ SOLAR CELL TOWER",
    subtitle: "Daily Electricity Generation Control Tower & Analytics",
    live: "LIVE SYNC",
    location: "แม่น้ำคู้, ปลวกแดง, ระยอง",
    weather: "มีเมฆฝนกระจายตัว",
    impact: "Impact: แนวโน้มผลิตไฟลดลง 20-30% วันนี้",
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
    loading: "กำลังโหลดข้อมูล...",
    offline: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ข้อมูลอาจไม่เป็นปัจจุบัน",
    lastSynced: "อัปเดตล่าสุด",
    today: "วันนี้",
  },
  EN: {
    title: "☀️ SOLAR CELL TOWER",
    subtitle: "Daily Electricity Generation Control Tower & Analytics",
    live: "LIVE SYNC",
    location: "Maenam Khu, Pluak Daeng, Rayong",
    weather: "Scattered Rain Clouds",
    impact: "Impact: Generation expected to drop 20-30% today",
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
    loading: "Loading data...",
    offline: "Cannot reach the server. Data may be out of date.",
    lastSynced: "Last updated",
    today: "Today",
  },
  KR: {
    title: "☀️ 태양광 제어 타워",
    subtitle: "일일 전력 생산 제어 타워 및 분석",
    live: "실시간 동기화",
    location: "라용, 플루악댕, 매남쿠",
    weather: "흐리고 비",
    impact: "영향: 오늘 전력 생산 20-30% 감소 예상",
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
    loading: "데이터 불러오는 중...",
    offline: "서버에 연결할 수 없습니다. 데이터가 최신이 아닐 수 있습니다.",
    lastSynced: "마지막 업데이트",
    today: "오늘",
  },
};

type Language = "TH" | "EN" | "KR";

const SHIFT_API_NAMES = ["Morning", "Afternoon", "Total"] as const;
const MAX_CONTENT_WIDTH = 560;
interface ShiftData {
  time: string;
  label: string;
  /** null = API ยังไม่มีข้อมูลของกะนี้ (ต่างจาก 0 ที่แปลว่าผลิตไม่ได้เลยจริง ๆ) */
  generated: number | null;
  target: number;
}

type NotificationsModule = typeof import("expo-notifications");
type ExpoProjectConfig = {
  eas?: {
    projectId?: string;
  };
};

let notificationsModulePromise: Promise<NotificationsModule | null> | null =
  null;
// เก็บสาเหตุที่โหลดโมดูลไม่ได้ไว้ log ออกมา แทนที่จะกลืน error ทิ้งเงียบ ๆ
let notificationsModuleError: string | null = null;

// Expo Go เท่านั้นที่ appOwnership เป็น "expo" (dev build / standalone จะเป็น null)
// ใช้เช็คเฉพาะ push notification เพราะ SDK 53+ ตัด remote push ออกจาก Expo Go บน Android
// ส่วน local notification (scheduleNotificationAsync) ยังใช้ได้ปกติใน Expo Go
const isExpoGoAndroid = () =>
  Platform.OS === "android" && Constants.appOwnership === "expo";

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
      notificationsModuleError = String(error);
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
  await axios.post(PUSH_TOKEN_API_URL, {
    token: expoPushToken,
    platform: Platform.OS,
    language,
  });
};

// --- ชุดสีสำหรับโหมดสว่าง/มืด ---
// ตั้งชื่อตามหน้าที่ ไม่ใช่ตามสี เพื่อให้สลับธีมได้โดยไม่ต้องไล่แก้ทีละจุด
type Palette = {
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentBorder: string;
  accentSoft: string;
  border: string;
  borderStrong: string;
  today: string;
  pass: string;
  warning: string;
  critical: string;
  dayEmpty: string;
  onStatus: string;
  shadow: string;
};

const lightPalette: Palette = {
  background: "#f0f4f8",
  surface: "#ffffff",
  textPrimary: "#0f172a",
  textSecondary: "#334155",
  textMuted: "#64748b",
  accent: "#0284c7",
  accentBorder: "#7dd3fc",
  accentSoft: "#e0f2fe",
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  today: "#15803d",
  pass: "#16a34a",
  warning: "#eab308",
  critical: "#dc2626",
  dayEmpty: "#cbd5e1",
  onStatus: "#ffffff",
  shadow: "#0f172a",
};

const darkPalette: Palette = {
  background: "#0b1220",
  surface: "#16202f",
  textPrimary: "#f1f5f9",
  textSecondary: "#cbd5e1",
  textMuted: "#94a3b8",
  // สีสถานะในโหมดมืดต้องสว่างขึ้น ไม่งั้นจะจมไปกับพื้นหลังเข้ม
  accent: "#38bdf8",
  accentBorder: "#0e5a86",
  accentSoft: "#0d2a41",
  border: "#26344a",
  borderStrong: "#3b4a63",
  today: "#4ade80",
  pass: "#22c55e",
  warning: "#facc15",
  critical: "#f87171",
  dayEmpty: "#3b4a63",
  onStatus: "#ffffff",
  shadow: "#000000",
};

const getStatusColor = (generated: number, target: number, c: Palette) => {
  const percentage = (generated / target) * 100;
  if (percentage >= 100) return { color: c.pass, status: "pass" };
  if (percentage >= 90) return { color: c.warning, status: "warning" };
  return { color: c.critical, status: "critical" };
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
  const [isSolarDataLoading, setIsSolarDataLoading] = useState(true);
  // สถานะการเชื่อมต่อ ใช้เตือนผู้ใช้เมื่อดึงข้อมูลจากเซิร์ฟเวอร์ไม่ได้
  const [hasConnectionError, setHasConnectionError] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const shiftScrollerRef = useRef<ScrollView>(null);
  const dateStripRef = useRef<ScrollView>(null);
  const pushTokenRef = useRef<string | null>(null);
  const isPagerSwipeRef = useRef(false);
  const langRef = useRef<Language>(lang);

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
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
  const isShortScreen = windowHeight < 820;
  const isVeryShortScreen = windowHeight < 700;
  // จอแคบมาก (เช่น 320px) ต้องย่อ legend เป็นพิเศษ ไม่งั้นจะตกไปแถวที่สอง
  const isNarrow = windowWidth < 340;
  const contentWidth = Math.min(windowWidth, MAX_CONTENT_WIDTH);
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
  const legendItems = [
    { color: palette.pass, label: t.passShort },
    { color: palette.warning, label: t.warningShort },
    { color: palette.critical, label: t.criticalShort },
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
  const valueLineHeight = valueFontSize + 5;
  const dateStripStep = dateCellWidth + dateCellGap;
  const shiftPageWidth = Math.max(contentWidth - screenPadding * 2, 0);
  const dateStripViewportWidth = Math.max(
    shiftPageWidth - dateSelectorPadding * 2,
    0,
  );
  const [latestDataDate, setLatestDataDate] = useState<Date>(new Date());

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

  const handleToggleTheme = () => {
    const nextPreference: ThemePreference = isDarkMode ? "light" : "dark";
    setThemePreference(nextPreference);
    saveThemePreference(nextPreference);
  };

  // แจ้งภาษาที่เลือกให้เซิร์ฟเวอร์ทราบ เพราะ push ทั้งหมดถูกยิงมาจากฝั่งเซิร์ฟเวอร์
  useEffect(() => {
    langRef.current = lang;
    saveLanguagePreference(lang);

    // ไม่งั้น push ตอนปิดแอปจะยังเป็นภาษาเดิม
    if (pushTokenRef.current) {
      savePushTokenToBackendAsync(pushTokenRef.current, lang).catch((error) =>
        console.log("Push token language update failed", error),
      );
    }
  }, [lang]);

  useEffect(() => {
    let isMounted = true;
    // 🛠️ เปลี่ยนมาใช้ ReturnType<typeof setInterval> แทน NodeJS.Timeout
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const loadSolarData = async () => {
      try {
        const response = await axios.get<SolarApiData>(SOLAR_DATA_API_URL);
        if (isMounted) {
          const latestDate = getLatestSolarDataDate(response.data, new Date());
          setSolarData(response.data);
          setLatestDataDate(latestDate);
          setLastSyncedAt(new Date());
          setHasConnectionError(false);
        }
      } catch (error) {
        console.log("Sync error", error);
        // ต้องบอกผู้ใช้ด้วย ไม่ใช่ log เงียบ ๆ ไม่งั้นจะดูข้อมูลเก่าโดยไม่รู้ตัว
        if (isMounted) {
          setHasConnectionError(true);
        }
      } finally {
        if (isMounted) {
          setIsSolarDataLoading(false);
        }
      }
    };

    loadSolarData();

    intervalId = setInterval(() => {
      loadSolarData();
    }, 120000);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const getSolarApiKeyForDate = (
    date: Date,
    shift: "Morning" | "Afternoon" | "Total",
    prefix = "",
  ) => {
    return `${MONTH_KEYS[date.getMonth()]}-${prefix}${shift}-${date.getDate()}`;
  };

  const getSolarApiKey = (
    shift: "Morning" | "Afternoon" | "Total",
    prefix = "",
  ) => {
    return getSolarApiKeyForDate(selectedDate, shift, prefix);
  };

  const getSolarApiValue = (shift: "Morning" | "Afternoon" | "Total") => {
    return toNumber(solarData?.[getSolarApiKey(shift)]);
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
  const getShiftData = (date = selectedDate): ShiftData[] => {
    return [
      {
        time: "morning",
        label: t.morning,
        generated: getSolarApiValueForDate(date, "Morning") ?? null,
        target: SHIFT_TARGETS.morning,
      },
      {
        time: "afternoon",
        label: t.afternoon,
        generated: getSolarApiValueForDate(date, "Afternoon") ?? null,
        target: SHIFT_TARGETS.afternoon,
      },
      {
        time: "total",
        label: t.total,
        generated: getSolarApiValueForDate(date, "Total") ?? null,
        target: SHIFT_TARGETS.total,
      },
    ];
  };

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

  const formatDate = (date: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${days[date.getDay()]} ${date.getDate()} ${MONTH_KEYS[date.getMonth()]}`;
  };

  const getDayCellStyle = (date: Date) => {
    const total = getSolarApiValueForDate(date, "Total");

    if (total === undefined) {
      return styles.dayCellEmpty;
    }

    return total >= SHIFT_TARGETS.total
      ? styles.dayCellPass
      : styles.dayCellFail;
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

  const isToday = selectedDate.toDateString() === new Date().toDateString();
  const isDateToday = (date: Date) =>
    date.toDateString() === new Date().toDateString();
  const isSameCalendarDate = (firstDate: Date, secondDate: Date) => {
    return firstDate.toDateString() === secondDate.toDateString();
  };

  // ถ้าวันที่เลือกหลุดออกนอกช่วงที่แสดงได้ (เช่น latestDataDate ขยับหลัง poll)
  // ให้ดึงกลับมาที่วันล่าสุดที่มีข้อมูล ไม่ปล่อยให้ state กับหน้าจอไม่ตรงกัน
  useEffect(() => {
    if (selectedDayIndexRaw === -1 && dateOptions.length > 0) {
      setSelectedDate(dateOptions[dateOptions.length - 1]);
    }
  }, [selectedDayIndexRaw]);

  const getStripOffsetForIndex = (index: number) =>
    Math.max(
      // จัดให้ช่องวันที่เลือกอยู่กลางแถบ อ่านง่ายกว่าดันไปชิดขวาแบบเดิม
      index * dateStripStep - dateStripViewportWidth / 2 + dateCellWidth / 2,
      0,
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
  }, [
    dateCellWidth,
    dateStripStep,
    dateStripViewportWidth,
    selectedDayIndex,
    shiftPageWidth,
  ]);

  const handleShiftPagerMomentumEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const pageIndex = Math.round(
      event.nativeEvent.contentOffset.x / shiftPageWidth,
    );
    const nextDate = dateOptions[pageIndex];

    if (nextDate && !isSameCalendarDate(nextDate, selectedDate)) {
      isPagerSwipeRef.current = true;
      setSelectedDate(nextDate);
    }
  };

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
    >
      {/* ให้ไอคอนบนแถบสถานะสลับสีตามธีมที่ผู้ใช้เลือก ไม่ใช่ตามธีมของเครื่อง */}
      <StatusBar style={isDarkMode ? "light" : "dark"} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleBlock}>
          {/* บังคับบรรทัดเดียว ของเดิมตัดเป็น 2 บรรทัดกินความสูงไป 29dp
              ซึ่งเป็นสาเหตุหลักที่การ์ดใบล่างสุดถูกตัดขอบ */}
          <Text
            style={[styles.title, isCompact && styles.titleCompact]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {t.title}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.themeToggleButton}
            onPress={handleToggleTheme}
            accessibilityRole="button"
            accessibilityLabel={isDarkMode ? "โหมดสว่าง" : "โหมดมืด"}
          >
            <MaterialCommunityIcons
              name={isDarkMode ? "weather-sunny" : "weather-night"}
              size={24}
              color={palette.accent}
            />
          </TouchableOpacity>

          <View style={styles.languageMenuWrapper}>
            <TouchableOpacity
              style={styles.languageIconButton}
              onPress={() => setShowLanguageMenu((current) => !current)}
            >
              <MaterialCommunityIcons name="web" size={22} color={palette.accent} />
              <Text style={styles.languageIconText}>{lang}</Text>
            </TouchableOpacity>

            {showLanguageMenu && (
              <View style={styles.languageDropdown}>
                {languages.map((lang_code) => (
                  <TouchableOpacity
                    key={lang_code}
                    style={[
                      styles.langButton,
                      lang === lang_code && styles.langButtonActive,
                    ]}
                    onPress={() => {
                      setLang(lang_code);
                      setShowLanguageMenu(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.langButtonText,
                        lang === lang_code && styles.langButtonTextActive,
                      ]}
                    >
                      {lang_code}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>

      {/* แถบบอกสถานะการเชื่อมต่อ โผล่เฉพาะตอนโหลดครั้งแรกหรือต่อเซิร์ฟเวอร์ไม่ได้ */}
      {(isSolarDataLoading || hasConnectionError) && (
        <View
          style={[
            styles.statusBanner,
            hasConnectionError && styles.statusBannerError,
          ]}
        >
          <MaterialCommunityIcons
            name={hasConnectionError ? "cloud-off-outline" : "cloud-sync-outline"}
            size={20}
            color={hasConnectionError ? palette.critical : palette.accent}
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
                ? `${t.offline} (${t.lastSynced} ${formatSyncTime(lastSyncedAt)})`
                : t.offline
              : t.loading}
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
            style={[
              styles.dateButton,
              { width: dateButtonSize, height: dateButtonSize },
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
            <View style={styles.dateHeadingRow}>
              <Text
                style={[styles.dateText, isCompact && styles.dateTextCompact]}
                numberOfLines={1}
              >
                {formatDate(selectedDate)}
              </Text>
              {isToday && <Text style={styles.todayLabel}>{t.today}</Text>}
            </View>
            {/* ช่วงวันที่เป็นข้อมูลรอง จอเตี้ยตัดออกเพื่อเอาที่ไปให้การ์ด */}
            {!isShortScreen && (
              <Text style={styles.weekRangeText}>{formatWeekRange()}</Text>
            )}
          </View>
          <TouchableOpacity
            onPress={handleNextDay}
            style={[
              styles.dateButton,
              { width: dateButtonSize, height: dateButtonSize },
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
          contentContainerStyle={[styles.weekStrip, { columnGap: dateCellGap }]}
        >
          {dateOptions.map((date) => (
            <TouchableOpacity
              key={date.toDateString()}
              style={[
                styles.dayCell,
                { width: dateCellWidth, height: dayCellHeight },
                getDayCellStyle(date),
                isSameCalendarDate(date, selectedDate) &&
                  styles.dayCellSelected,
              ]}
              onPress={() => setSelectedDate(date)}
            >
              <Text
                style={[
                  styles.dayNameText,
                  isCompact && styles.dayNameTextCompact,
                ]}
              >
                {
                  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                    date.getDay()
                  ]
                }
              </Text>
              <Text style={styles.dayCellText}>{date.getDate()}</Text>
              {isDateToday(date) && <View style={styles.todayDot} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ข้อความ legend เดิมฮาร์ดโค้ดภาษาไทยไว้ ไม่เปลี่ยนตามภาษาที่เลือก */}
      <View
        style={[
          styles.legend,
          { columnGap: legendGap, paddingHorizontal: legendPadding },
        ]}
      >
        {legendItems.map((item) => (
          <View
            key={item.color}
            style={[styles.legendItem, { gap: legendGap }]}
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
              // ยังไม่มีข้อมูล = แสดงเป็นสีกลางและขีด ไม่ใช่ 0% สีแดงซึ่งสื่อว่าผลิตไม่ได้
              const hasValue = shift.generated !== null;
              const statusInfo = hasValue
                ? getStatusColor(shift.generated!, shift.target, palette)
                : { color: palette.textMuted, status: "pending" };
              const percentage = hasValue
                ? ((shift.generated! / shift.target) * 100).toFixed(1) + "%"
                : "—";

              return (
                <View
                  key={shift.time}
                  style={[styles.shiftCard, { paddingVertical: cardPadding }]}
                >
                  <View
                    style={[
                      styles.shiftHeader,
                      {
                        marginBottom: cardHeaderSpacing,
                        paddingBottom: cardHeaderSpacing,
                      },
                    ]}
                  >
                    <Text style={styles.shiftLabel}>{shift.label}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: statusInfo.color + "20" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          { color: statusInfo.color },
                        ]}
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
                      <Text
                        style={[
                          styles.value,
                          isCompact && styles.valueCompact,
                          { color: statusInfo.color },
                        ]}
                      >
                        {hasValue ? shift.generated!.toLocaleString() : "—"}
                      </Text>
                      <Text style={styles.unit}>KWh</Text>
                    </View>

                    <View style={[styles.valueBox, styles.valueBoxRight]}>
                      <Text style={styles.valueLabel}>{t.target}</Text>
                      <Text
                        style={[
                          styles.value,
                          isCompact && styles.valueCompact,
                          { fontSize: valueFontSize, lineHeight: valueLineHeight },
                        ]}
                      >
                        {shift.target.toLocaleString()}
                      </Text>
                      <Text style={styles.unit}>KWh</Text>
                    </View>
                  </View>

                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: hasValue
                            ? `${Math.min(
                                (shift.generated! / shift.target) * 100,
                                100,
                              )}%`
                            : "0%",
                          backgroundColor: statusInfo.color,
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </ScrollView>
  );
};

export default SolarDashboard;

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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
    zIndex: 2,
  },
  headerTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontSize: 22,
    lineHeight: 29,
    fontWeight: "800",
    color: c.textPrimary,
    marginBottom: 4,
  },
  titleCompact: {
    fontSize: 19,
    lineHeight: 25,
  },
  languageMenuWrapper: {
    alignItems: "flex-end",
    position: "relative",
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: c.accentSoft,
    borderWidth: 1,
    borderColor: c.accentBorder,
  },
  statusBannerError: {
    backgroundColor: c.critical + "1f",
    borderColor: c.critical,
  },
  statusBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: c.accent,
  },
  statusBannerTextError: {
    color: c.critical,
  },
  themeToggleButton: {
    // ขนาดเท่าปุ่มภาษาให้ดูเป็นชุดเดียวกัน และกดง่ายด้วยนิ้ว
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.accentBorder,
    backgroundColor: c.surface,
  },
  languageIconButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    // ปุ่มสูง 44 ตามขนาดขั้นต่ำที่นิ้วกดได้แม่นยำ
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.accentBorder,
    backgroundColor: c.surface,
  },
  languageIconText: {
    fontSize: 14,
    fontWeight: "800",
    color: c.accent,
  },
  languageDropdown: {
    position: "absolute",
    top: 42,
    right: 0,
    gap: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: c.surface,
    elevation: 4,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  langButton: {
    minWidth: 66,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
  },
  langButtonActive: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  langButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: c.textSecondary,
  },
  langButtonTextActive: {
    color: "#fff",
  },
  dateSelector: {
    backgroundColor: c.surface,
    borderRadius: 16,
    marginBottom: 12,
    gap: 12,
    elevation: 2,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
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
    borderRadius: 16,
    backgroundColor: c.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
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
    color: c.textPrimary,
    textAlign: "center",
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
  todayLabel: {
    fontSize: 14,
    color: c.today,
    fontWeight: "800",
  },
  weekRangeText: {
    fontSize: 13,
    color: c.textSecondary,
    fontWeight: "600",
    marginTop: 3,
  },
  weekStrip: {
    flexDirection: "row",
    paddingRight: 2,
  },
  dayCell: {
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  dayCellPass: {
    backgroundColor: c.pass,
  },
  dayCellFail: {
    backgroundColor: c.critical,
  },
  dayCellEmpty: {
    backgroundColor: c.dayEmpty,
  },
  dayCellSelected: {
    borderColor: c.textPrimary,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  dayNameText: {
    fontSize: 11,
    fontWeight: "700",
    // ทึบขึ้นจากเดิม (0.82) เพื่อให้อ่านออกชัดบนพื้นสี
    color: "rgba(255, 255, 255, 0.95)",
    marginBottom: 3,
  },
  dayNameTextCompact: {
    fontSize: 10,
  },
  dayCellText: {
    fontSize: 20,
    fontWeight: "800",
    color: c.onStatus,
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.onStatus,
    marginTop: 3,
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
  shiftCard: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: c.surface,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    elevation: 3,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
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
  shiftLabel: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: c.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 9,
  },
  statusBadgeText: {
    fontSize: 15,
    fontWeight: "800",
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
    fontSize: 13,
    fontWeight: "600",
    color: c.textMuted,
    marginBottom: 2,
  },
  value: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    color: c.textPrimary,
  },
  valueCompact: {
    fontSize: 22,
    lineHeight: 28,
  },
  unit: {
    fontSize: 12,
    fontWeight: "600",
    // เดิมเป็น #cbd5e1 ซึ่งจางเกินไปจนแทบมองไม่เห็นบนพื้นขาว
    color: c.textMuted,
    marginTop: 1,
  },
  progressBar: {
    width: "100%",
    height: 12,
    backgroundColor: c.border,
    borderRadius: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 6,
  },
  // บังคับให้อยู่แถวเดียวเสมอ (nowrap) แล้วให้แต่ละอันแบ่งความกว้างเท่า ๆ กัน
  legend: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    backgroundColor: c.surface,
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  legendItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    // ถ้าไม่ใส่ minWidth: 0 ข้อความยาวจะดันช่องให้กว้างเกินส่วนแบ่งของตัวเอง
    minWidth: 0,
  },
  legendDot: {
    flexShrink: 0,
  },
  legendText: {
    flex: 1,
    fontWeight: "600",
    color: c.textSecondary,
  },
});
