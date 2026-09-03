import AsyncStorage from "@react-native-async-storage/async-storage";

// ค่าที่ผู้ใช้เลือกเอง เก็บไว้ให้จำได้แม้ปิดแอปไปแล้ว

// --- ธีม ---
// null = ยังไม่เคยเลือก ให้ใช้ค่าเริ่มต้นด้านล่าง
export type ThemePreference = "light" | "dark" | null;

/** ธีมสำหรับเครื่องที่ยังไม่เคยกดเลือกเอง */
export const DEFAULT_THEME: "light" | "dark" = "dark";

const THEME_STORAGE_KEY = "solar-theme-preference";

export const saveThemePreference = async (preference: ThemePreference) => {
  try {
    if (preference === null) {
      await AsyncStorage.removeItem(THEME_STORAGE_KEY);
      return;
    }

    await AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // จำไม่ได้ก็แค่กลับไปตามธีมเครื่อง ไม่ควรทำให้แอปพัง
  }
};

export const loadThemePreference = async (): Promise<ThemePreference> => {
  try {
    const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
};

// --- ภาษา ---
// ค่าเริ่มต้นสำหรับเครื่องที่ยังไม่เคยเลือกภาษา
export const DEFAULT_LANGUAGE = "EN" as const;

export type LanguagePreference = "TH" | "EN" | "KR";

const LANGUAGE_STORAGE_KEY = "solar-language-preference";

export const saveLanguagePreference = async (
  preference: LanguagePreference,
) => {
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
  } catch {
    // จำไม่ได้ก็แค่กลับไปใช้ค่าเริ่มต้น
  }
};

export const loadLanguagePreference =
  async (): Promise<LanguagePreference | null> => {
    try {
      const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);

      return stored === "TH" || stored === "EN" || stored === "KR"
        ? stored
        : null;
    } catch {
      return null;
    }
  };
