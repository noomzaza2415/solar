# AI_INDEX — แผนที่ Feature → ไฟล์

> ค้นด้วย keyword แล้วอ่านเฉพาะหัวข้อที่ตรง · `src/app/index.tsx` ยาวมาก ให้ grep "anchor" ที่ระบุ แล้วอ่านเฉพาะช่วงนั้น
> ไม่มีไฟล์ test ในโปรเจกต์ — ทุก Feature: Tests: ไม่มี

## Dashboard หน้าหลัก (การ์ด 3 กะ)
- Keywords: dashboard, หน้าหลัก, การ์ด, กะ, shift, morning, afternoon, total, ช่วงเช้า, ช่วงบ่าย, ยอดรวม, header, legend
- Entry: `src/app/index.tsx` (`SolarDashboard`)
- Files:
  - `src/app/index.tsx` → anchor: `{/* Header */}`, `{/* Daily Shift Cards */}`, `getStatusColor`, `getPercentOfTarget`, `formatDelta`, `STATUS_ICONS`, `SHIFT_ICONS`, `createStyles`
  - `src/components/solar-mark.tsx` → `SolarMark` ไอคอน SVG แผงโซล่า+พระอาทิตย์ แบบเรียบสีเดียว (palette.accent) ในกรอบหัวข้อ (`brandTile`, แสดงเมื่อจอกว้าง ≥ 520)
- Types: `ShiftData`, `StatusInfo`, `Palette` (ใน `index.tsx`), `SolarApiData`, `TargetStatus` (`src/lib/solar-alerts.ts`)
- Tests: ไม่มี

## ซิงก์ข้อมูลโซล่า (Firestore)
- Keywords: sync, ซิงก์, โหลดข้อมูล, firestore, firebase, snapshot, เชื่อมต่อไม่ได้, offline, stale, ข้อมูลค้าง, token, anonymous
- Entry: `src/lib/firebase.ts` (`fetchSolarSnapshotAsync`)
- Files:
  - `src/lib/firebase.ts` → anonymous auth (REST), refresh token, อ่าน document `solar/snapshot`, แปลง Firestore value
  - `src/app/index.tsx` → anchor: `loadSolarData`, `SYNC_INTERVAL_MS`, `STALE_AFTER_MS`, `getLatestSolarDataDate`, `hasConnectionError`, `isCheckStale`, `handleRefresh`
- Types: `SolarSnapshot` (`src/lib/firebase.ts`), `SolarApiData`
- Tests: ไม่มี

## เป้าหมายและเกณฑ์สถานะ
- Keywords: target, เป้า, KWh, pass, warning, critical, ตามเป้า, เฝ้าระวัง, ต่ำกว่าเกณฑ์, 90%
- Entry: `src/lib/solar-alerts.ts`
- Files:
  - `src/lib/solar-alerts.ts` → `SHIFT_TARGETS`, `getTargetStatus`, `toNumber`, `MONTH_KEYS`, URL ของ API ในวง
  - `backend/SolarPushNotifications/SolarAlerts.cs` → เป้าฝั่งแจ้งเตือน (`SolarAlertOptions`), `SolarShiftReader`
- Types: `TargetStatus`, `ShiftName`, `AlertLanguage`, `SolarApiData`
- Tests: ไม่มี

## กราฟรายวัน
- Keywords: daily chart, กราฟรายวัน, แท่ง, bar, zoom, ซูม, แนวนอน, landscape
- Entry: `src/components/daily-total-chart.tsx` (default `DailyTotalChart`)
- Files:
  - `src/components/daily-total-chart.tsx` → กราฟ SVG + export ใช้ร่วม `Bar3D`, `BarGradients`, `ChartViewToggle`, `BAR_STATUSES`, `createChartStyles`, `formatDelta`, `STATUS_ICONS`
  - `src/app/index.tsx` → anchor: `openDailyChart`, `chartMonthIndex`, `chartView`, `getMonthsWithData`, comment `กราฟยอดรวมรายวัน`
- Types: `ChartView`, `DailyChartColors`, `DailyChartLabels`
- Tests: ไม่มี

## กราฟรายปี
- Keywords: yearly chart, กราฟรายปี, รายเดือน, monthly, รวมทั้งปี
- Entry: `src/components/yearly-total-chart.tsx`
- Files: `src/components/yearly-total-chart.tsx` → กราฟยอดรายเดือน (import ส่วนประกอบจาก `daily-total-chart.tsx`)
- Types: `YearlyChartLabels`
- Tests: ไม่มี

## ล็อกการหมุนจอ
- Keywords: orientation, หมุนจอ, portrait, landscape, แนวตั้ง
- Entry: `src/app/index.tsx`
- Files:
  - `src/app/index.tsx` → anchor: `getScreenOrientationModuleAsync`, `isDailyChartOpen`
  - `app.json` → `orientation: "default"`, plugin `expo-screen-orientation`
- Types: —
- Tests: ไม่มี

## เลือกวันที่ / ปฏิทิน
- Keywords: date, วันที่, ปฏิทิน, calendar, date picker, วันนี้, today, เลื่อนวัน
- Entry: `src/app/index.tsx`
- Files: `src/app/index.tsx` → anchor: `{/* Date Selector */}`, `handlePrevDay`, `handleNextDay`, `handleOpenDatePicker`, `handlePickDate`, `pickerMonth`, comment `ปฏิทินเลือกวัน`
- Types: —
- Tests: ไม่มี

## หมายเหตุประจำวัน
- Keywords: note, remark, หมายเหตุ, บันทึก, pending, ยังไม่ได้ส่ง, D-IT
- Entry: `src/lib/solar-notes.ts`
- Files:
  - `src/lib/solar-notes.ts` → เก็บในเครื่อง + POST `save-solar-remark`, `reconcileRemoteRemark`, `syncPendingNoteAsync`, `toDayNoteKey`, `toRemarkDataKey`
  - `src/app/index.tsx` → anchor: `handleStartEditingNote`, `handleNoteChange`, `handleNoteDone`, `persistNoteAsync`, `getSystemRemark`, `noteStatus`, comment `หมายเหตุประจำวัน`
- Types: `DayNote`
- Tests: ไม่มี

## สภาพอากาศรายกะ
- Keywords: weather, สภาพอากาศ, อุณหภูมิ, ฝน, temperature
- Entry: `src/lib/solar-weather.ts` (`parseShiftWeather`)
- Files:
  - `src/lib/solar-weather.ts` → parse ข้อความไทยจากคีย์ `{Mon}-W-{Shift}-{day}` → อุณหภูมิ/ไอคอน/คำแปล
  - ใช้ใน `src/app/index.tsx` และ `src/components/daily-total-chart.tsx`
- Types: `ShiftWeather`
- Tests: ไม่มี

## ภาษาและธีม
- Keywords: language, ภาษา, TH, EN, KR, เกาหลี, แปล, i18n, translation, theme, ธีม, dark mode, โหมดมืด
- Entry: `src/lib/preferences.ts`
- Files:
  - `src/lib/preferences.ts` → load/save ภาษาและธีม (AsyncStorage), `DEFAULT_LANGUAGE`, `DEFAULT_THEME`
  - `src/app/index.tsx` → anchor: `translations`, `LANGUAGE_NAMES`, `lightPalette`, `darkPalette`, `handleSelectLanguage`, `handleToggleTheme`, comment `เลือกภาษา`
- Types: `ThemePreference`, `LanguagePreference` (`preferences.ts`), `Language` (`index.tsx`)
- Tests: ไม่มี

## Push Notification (ฝั่งแอป)
- Keywords: notification, แจ้งเตือน, push, expo push token, permission, channel
- Entry: `src/app/index.tsx`
- Files:
  - `src/app/index.tsx` → anchor: `getNotificationsModuleAsync`, `ensureNotificationChannelAsync`, `requestNotificationPermissionAsync`, `registerForPushNotificationsAsync`, `savePushTokenToBackendAsync`, `parseNotificationDate`, `openDateFromNotification`
  - `src/lib/solar-alerts.ts` → `PUSH_TOKEN_API_URL`, `NOTIFICATION_CHANNEL_ID`
  - `app.json` → plugin `expo-notifications`, permission `POST_NOTIFICATIONS`
- Types: `NotificationsModule`, `ExpoProjectConfig` (`index.tsx`)
- Tests: ไม่มี

## Push Notification (ฝั่ง backend)
- Keywords: backend, server, reminder, ตารางแจ้งเตือน, 5155, push-tokens, send-now
- Entry: `backend/SolarPushNotifications/Program.cs`
- Files:
  - `backend/SolarPushNotifications/Program.cs` → DI, endpoint `POST /api/push-tokens`, `POST /api/reminders/send-now`, `POST /api/mirror/run-now`, `GET /api/status`, `ExpoPushService`, `ExpoPushToken`
  - `backend/SolarPushNotifications/SolarReminderWorker.cs` → BackgroundService ยิงแจ้งเตือนตามรอบ
  - `backend/SolarPushNotifications/SolarAlerts.cs` → `SolarAlertOptions`, `ReminderSlot`, `AlertTexts` (ข้อความ 3 ภาษา), `SolarShiftReader`
  - `backend/SolarPushNotifications/PushTokenStore.cs` → `FilePushTokenStore`, `SentReminderStore` (เก็บเป็นไฟล์ใน StateDirectory)
  - `backend/SolarPushNotifications/appsettings.json` → ค่าตั้งต้น (SolarAlerts, Firestore)
- Types: `RegisterPushTokenRequest`, `PushTokenRecord`, `ExpoPushMessage`, `ShiftSummary`, `IPushTokenStore`
- Tests: ไม่มี

## Firestore Mirror (backend → Firestore)
- Keywords: mirror, คัดลอก, firestore, service account, นอกวง, heartbeat, rules
- Entry: `backend/SolarPushNotifications/FirestoreMirror.cs`
- Files:
  - `backend/SolarPushNotifications/FirestoreMirror.cs` → `FirestoreOptions`, `GoogleAccessTokenProvider`, `FirestoreWriter`, `FirestoreMirrorWorker`
  - `backend/firestore.rules` → อ่านได้เมื่อ login, เขียนไม่ได้
  - `backend/FIREBASE-MIRROR.md` → ขั้นตอนตั้งค่า Firebase
- Types: `FirestoreOptions`
- Tests: ไม่มี

## App Shell / Splash
- Keywords: layout, splash, หน้าเปิดแอป, safe area, root
- Entry: `src/app/_layout.tsx`
- Files:
  - `src/app/_layout.tsx` → `SafeAreaProvider` + `ThemeProvider` + `Slot`, ซ่อน splash
  - `src/components/animated-icon.tsx` / `animated-icon.web.tsx` / `animated-icon.module.css` → `AnimatedSplashOverlay`
- Types: —
- Tests: ไม่มี

## Android Build / Release
- Keywords: build, apk, gradle, signing, keystore, eas, notifee, jdk, android
- Entry: `app.json`
- Files:
  - `app.json` → config แอป, plugins, versionCode, updates
  - `eas.json` → build profiles + channels
  - `plugins/with-notifee-maven-repo.js` → เพิ่ม maven repo ของ notifee
  - `plugins/with-local-release-signing.js` → เซ็น APK ในเครื่องด้วยกุญแจเดียวกับ EAS
  - `plugins/with-gradle-daemon-jvm.js` → ตรึง JDK ของ Gradle daemon
  - `metro.config.js` → blockList โฟลเดอร์ build ของ Gradle (กัน watcher พังบน Windows)
  - `google-services.json` → config Firebase ฝั่ง Android
- Types: —
- Tests: ไม่มี

## Web Deploy
- Keywords: web, เว็บ, nginx, docker, 5156, export
- Entry: `Dockerfile.web`
- Files:
  - `Dockerfile.web` → `expo export --platform web` แล้วเสิร์ฟด้วย nginx
  - `nginx-web.conf` → routing `$uri.html`, cache
  - `docker-compose.web.yml`, `docker-compose.web.deploy.yml` → พอร์ต 5156
- Types: —
- Tests: ไม่มี

## Backend Deploy
- Keywords: docker, deploy, container, solar-push
- Entry: `backend/docker-compose.yml`
- Files: `backend/Dockerfile`, `backend/docker-compose.yml`, `backend/docker-compose.deploy.yml`
- Types: —
- Tests: ไม่มี

## Template ที่เหลือจาก create-expo-app (ไม่ได้ใช้ในหน้าหลัก)
- Keywords: explore, template, themed, collapsible, tabs
- Entry: `src/app/explore.tsx`
- Files:
  - `src/app/explore.tsx` → หน้า template (เข้าได้ทาง `/explore`)
  - `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`, `src/components/hint-row.tsx` → ไม่ถูก import ที่ใด
  - `src/components/themed-text.tsx`, `themed-view.tsx`, `external-link.tsx`, `web-badge.tsx`, `ui/collapsible.tsx` → ใช้โดย `explore.tsx` เท่านั้น
  - `scripts/reset-project.js` → สคริปต์ reset ของ template
- Types: `ThemeColor` (`src/constants/theme.ts`)
- Tests: ไม่มี

## Shared
- `src/lib/solar-alerts.ts` → ค่าคงที่/type/ฟังก์ชันกลาง (`MONTH_KEYS`, `SHIFT_TARGETS`, `getTargetStatus`, `toNumber`, `SolarApiData`, `AlertLanguage`) — ใช้โดย index, กราฟ, notes, weather, firebase
- `src/components/daily-total-chart.tsx` → ส่วนประกอบกราฟที่ yearly chart ใช้ร่วม
- `src/constants/theme.ts` → `Colors`, `Fonts`, `Spacing`, `MaxContentWidth`, `BottomTabInset` (ฝั่ง template)
- `src/hooks/use-theme.ts`, `use-color-scheme.ts`, `use-color-scheme.web.ts` → hook ธีมของ template
- `src/global.css` → CSS กลาง (import ใน `constants/theme.ts`)
- `tsconfig.json` → path alias `@/*`
- `eslint.config.js` → ignore `dist/*`, `**/*.yml`

## Where to Add New Code
| ถ้าจะเพิ่ม | ไปที่ |
|---|---|
| หน้าจอ/route ใหม่ | `src/app/<name>.tsx` |
| component แสดงผล (รับ props) | `src/components/<kebab-name>.tsx` (เฉพาะเว็บ: `.web.tsx`) |
| การเรียก HTTP / Firestore / cache | `src/lib/<kebab-name>.ts` หรือไฟล์เดิมใน `src/lib/` ที่ตรงเรื่อง |
| ค่าคงที่ / กฎธุรกิจโซล่า | `src/lib/solar-alerts.ts` |
| ค่าที่ผู้ใช้เลือกแล้วต้องจำ | `src/lib/preferences.ts` |
| ข้อความแปลใหม่ | `translations` ใน `src/app/index.tsx` (ครบ TH/EN/KR) |
| สีใหม่ของหน้าหลัก | type `Palette` + `lightPalette` + `darkPalette` ใน `src/app/index.tsx` |
| แก้ native Android ตอน prebuild | `plugins/with-<name>.js` แล้วลงทะเบียนใน `app.json` → `plugins` |
| endpoint backend | `backend/SolarPushNotifications/Program.cs` (`app.MapGet/MapPost`) |
| ค่าตั้งค่า backend | `appsettings.json` + env ใน `backend/docker-compose*.yml` |
