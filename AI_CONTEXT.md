# AI_CONTEXT — Dongjin Solar

> อ่านไฟล์นี้ก่อนทุกครั้ง · แผนที่ไฟล์อยู่ใน `AI_INDEX.md` · ประวัติการตัดสินใจอยู่ใน `AI_CHANGELOG.md`
> ถ้าเนื้อหาที่นี่ขัดกับโค้ดจริง ให้เชื่อโค้ด แล้วแจ้งผู้ใช้

## Project Purpose
- แอป "Dongjin Solar" (`app.json` → `expo.name`) แสดงยอดผลิตไฟโซล่ารายวันแยก 3 กะ: Morning (10:00), Afternoon (15:00), Total (21:00) เทียบกับเป้า KWh
- มีกราฟรายวัน/รายปี, หมายเหตุประจำวัน, สภาพอากาศรายกะ, เลือกภาษา TH/EN/KR และธีมสว่าง/มืด
- รันบน Android / iOS / Web; แจ้งเตือน push มาจาก service ฝั่งเซิร์ฟเวอร์ใน `backend/`
- ข้อมูลต้นทางอยู่ใน LAN โรงงาน แอปอ่านผ่าน Cloud Firestore ที่ backend คัดลอกขึ้นไปให้

## Tech Stack
- TypeScript strict — `tsconfig.json` (`strict: true`, alias `@/*` → `src/*`, `@/assets/*` → `assets/*`)
- React 19.2.3 / React Native 0.86.3 / Expo SDK 57 + expo-router (file-based routing, entry `expo-router/entry`) — `package.json`
- HTTP: axios — `src/lib/firebase.ts`, `src/lib/solar-notes.ts`
- Local storage: `@react-native-async-storage/async-storage` — `src/lib/preferences.ts`, `src/lib/solar-notes.ts`, `src/lib/firebase.ts`
- กราฟ: `react-native-svg` — `src/components/daily-total-chart.tsx`
- Push client: `expo-notifications` (โหลดแบบ dynamic) — `src/app/index.tsx`
- Firestore ผ่าน REST + Anonymous Auth (ไม่ใช้ Firebase SDK) — `src/lib/firebase.ts`, `backend/firestore.rules`
- Lint: ESLint 9 + `eslint-config-expo/flat` — `eslint.config.js`
- Build/Release: EAS (profiles development / preview(apk) / production) — `eas.json`; Expo config plugins — `plugins/`
- Backend: C# ASP.NET Core minimal API, `net10.0` — `backend/SolarPushNotifications/SolarPushNotifications.csproj`
- Deploy: Docker — `backend/Dockerfile`, `backend/docker-compose*.yml`, `Dockerfile.web` + `nginx-web.conf`, `docker-compose.web*.yml`

## Commands
| งาน | คำสั่ง | ที่มา |
|---|---|---|
| install | `npm install` | `README.md` (ไม่มี script) |
| dev | `npm start` (`expo start`), `npm run web`, `npm run android` (`expo run:android`), `npm run ios` | `package.json` scripts |
| lint | `npm run lint` (`expo lint`) | `package.json` scripts |
| typecheck | ไม่มี script — ใช้ `npx tsc --noEmit` ได้ (รันผ่าน, 2026-10-22) | devDependency `typescript` |
| test | ไม่มี (ไม่มี test runner และไม่มีไฟล์ test) | — |
| build web | `npx expo export --platform web --output-dir dist-web` | `Dockerfile.web` |
| build mobile | ใช้ EAS profile ใน `eas.json` (ไม่มี npm script) | `eas.json` |
| backend | `dotnet publish` (ใน Dockerfile) / `docker compose up` ใน `backend/` | `backend/Dockerfile`, `backend/docker-compose.yml` |

- ⚠️ `npm run reset-project` เป็นสคริปต์ template ที่ย้าย `src`/`scripts` ไปโฟลเดอร์ `example` — ห้ามรันโดยไม่ได้รับคำสั่ง (`scripts/reset-project.js`)

## Project Structure
- `src/app/` — Route/หน้าจอ (file-based routing) และ root layout
- `src/components/` — UI component: กราฟของแอป + component จาก template
- `src/components/ui/` — UI primitive จาก template (`collapsible`)
- `src/lib/` — Data access, business rule, ค่าคงที่, persistence (ไม่มี JSX)
- `src/constants/` — theme ของ template (Colors / Fonts / Spacing)
- `src/hooks/` — hook ธีม/สีของระบบ (มีไฟล์ `.web.ts` แยก)
- `plugins/` — Expo config plugin ปรับ native Android build
- `backend/` — service .NET (push notification + Firestore mirror) และเอกสาร/rules ของ Firestore
- `assets/` — รูปไอคอน, splash, tab icon
- `scripts/` — สคริปต์ template (`reset-project.js`)
- `dist/`, `dist-qr/` — ผลลัพธ์ build (ไม่ใช่ source, `dist/` อยู่ใน `.gitignore`)

## Architecture
- **Route / Screen** (`src/app/`) — `index.tsx` คือหน้าหลักทั้งหมด (`SolarDashboard`) รวม state, การซิงก์, i18n, palette, UI, style ไว้ไฟล์เดียว
- **Presentational Component** (`src/components/`) — กราฟรับข้อมูล/สี/ข้อความผ่าน props ไม่ดึงข้อมูลเอง
- **Data Access** (`src/lib/firebase.ts`, `src/lib/solar-notes.ts`) — เรียก HTTP, จัดการ token, cache ในเครื่อง
- **Business Rule / Constant** (`src/lib/solar-alerts.ts`, `src/lib/solar-weather.ts`) — เป้า KWh, เกณฑ์สถานะ, แปลงค่า, parse สภาพอากาศ
- **Persistence (local)** (`src/lib/preferences.ts`) — ค่าที่ผู้ใช้เลือก
- **Auth** — Firebase Anonymous Auth ผ่าน REST ใน `src/lib/firebase.ts` (ไม่มีระบบ login ผู้ใช้)
- **Native Build Config** (`app.json`, `plugins/`, `eas.json`)
- **Backend Service** (`backend/SolarPushNotifications/`) — HTTP endpoint + BackgroundService 2 ตัว (ReminderWorker, FirestoreMirrorWorker)
- ไม่มี global state library, ไม่มี API client layer กลาง, ไม่มี test layer

## Core Data Flow
- อ่านยอด: LAN API `192.168.2.222:5154/api/get-solar-data` → `FirestoreMirrorWorker` (ทุก 120 วิ, heartbeat 600 วิ) → Firestore `solar/snapshot` → `fetchSolarSnapshotAsync()` → `loadSolarData` ใน `index.tsx` (ทุก 120 วิ + ตอนแอปกลับมา active) → state `solarData` → การ์ด/กราฟ
- แจ้งเตือน: แอปขอ Expo push token → `POST :5155/api/push-tokens` (พร้อมภาษา) → `SolarReminderWorker` อ่าน LAN API ตามรอบเวลา → `ExpoPushService` ส่ง push · เว็บข้ามส่วน push ทั้งหมด
- หมายเหตุ: `saveDayNoteAsync` → เขียน AsyncStorage (pending) → `POST :5154/api/save-solar-remark` → กลับมาทาง Firestore mirror คีย์ `{Mon}-Remark-{day}` · `reconcileRemoteRemark` กันข้อความเก่าเขียนทับ 10 นาที

## Conventions
- **ชื่อไฟล์**: kebab-case (`daily-total-chart.tsx`, `solar-notes.ts`); ไฟล์เฉพาะเว็บใช้ suffix `.web.tsx` / `.web.ts`
- **ชื่อ**: component PascalCase; ฟังก์ชัน async ลงท้าย `Async` (`fetchSolarSnapshotAsync`, `saveDayNoteAsync`); ค่าคงที่ UPPER_SNAKE (`SYNC_INTERVAL_MS`, `SHIFT_TARGETS`); ใช้ `type` alias เป็นหลัก
- **คีย์ข้อมูลโซล่า** (ใช้ร่วมกับ backend และหน้าเว็บ D-IT): `{Mon}-{Morning|Afternoon|Total}-{day}`, สภาพอากาศ `{Mon}-W-{Shift}-{day}`, หมายเหตุ `{Mon}-Remark-{day}` — ไม่มีปีในคีย์, `Mon` มาจาก `MONTH_KEYS`
- **Import**: package ภายนอกก่อน เว้นบรรทัด แล้วตามด้วย `@/...`; ภายใน `src/lib/` ใช้ relative `./`
- **Style โค้ด**: ไฟล์ของแอป (`index.tsx`, `src/lib/*`, กราฟ) ใช้ double quote + semicolon; ไฟล์ template (`_layout.tsx`, `explore.tsx`, `themed-*`, `app-tabs*`) ใช้ single quote — ทำตามไฟล์ที่แก้
- **Comment**: เขียนภาษาไทย อธิบาย "ทำไม" เหนือโค้ด
- **Error**: ฟังก์ชันเก็บค่าในเครื่องกลืน error ด้วย try/catch + comment เหตุผล; ฟังก์ชันดึงข้อมูลเครือข่าย throw ให้ผู้เรียก (`fetchSolarSnapshotAsync`); หน้าจอ catch แล้วตั้ง flag (`hasConnectionError`, `isCheckStale`) + `console.log`
- **State**: `useState` / `useRef` ภายใน `SolarDashboard`; ค่าที่ต้องจำข้ามการเปิดแอปเก็บ AsyncStorage คีย์ขึ้นต้น `solar-`
- **API**: axios พร้อม timeout เป็นค่าคงที่ต่อไฟล์ (`AUTH_TIMEOUT_MS`, `REQUEST_TIMEOUT_MS`, `PUSH_TOKEN_TIMEOUT_MS`)
- **Native module เสริม**: โหลดแบบ dynamic/optional (`getNotificationsModuleAsync`, `getScreenOrientationModuleAsync`, `requireOptionalNativeModule`) และเช็ค `Platform.OS === "web"`
- **Style UI**: `createStyles(palette)` / `createChartStyles(colors)` + `StyleSheet.create`; palette อยู่ใน `index.tsx` (`lightPalette`, `darkPalette`) ส่งต่อให้กราฟผ่าน props
- **i18n**: object `translations` (TH/EN/KR) ใน `index.tsx`; ข้อความใน lib ใช้ `Record<AlertLanguage, string>`
- **Test**: ไม่มี

## File Responsibilities
| ประเภท | รับผิดชอบ | ไม่ควรทำ |
|---|---|---|
| `src/app/*.tsx` | หน้าจอ, state, ผูก lib เข้ากับ UI | ไม่ควรเขียน HTTP call/parse Firestore ตรง ๆ — ใช้ `src/lib/` |
| `src/components/*-chart.tsx` | วาดกราฟจาก props | ไม่ควรดึงข้อมูล หรือเก็บ AsyncStorage |
| `src/lib/*.ts` | HTTP, auth, cache, กฎธุรกิจ, ค่าคงที่ | ไม่ควร import จาก `src/app/` หรือ `src/components/`, ไม่มี JSX |
| `src/constants/`, `src/hooks/`, `themed-*` | theme ของ template | หน้า dashboard ไม่ได้ใช้ — อย่าคิดว่าแก้ที่นี่แล้วหน้าหลักจะเปลี่ยน |
| `plugins/*.js` | แก้ไฟล์ native Android ตอน prebuild | ไม่ควรมี logic ของแอป |
| `backend/...*.cs` | push, ตารางแจ้งเตือน, mirror ขึ้น Firestore | — |

## Dependency Rules
- ทิศทาง: `src/app` → `src/components` → `src/lib` ; `src/app` → `src/lib` (ห้ามย้อนทาง)
- `src/lib/*` import กันเองได้ (เช่น `firebase.ts`, `solar-notes.ts`, `solar-weather.ts` → `solar-alerts.ts`)
- `yearly-total-chart.tsx` ใช้ส่วนประกอบที่ export จาก `daily-total-chart.tsx` (`Bar3D`, `ChartViewToggle`, `createChartStyles` ฯลฯ) — แก้ export เหล่านั้นต้องเช็คทั้งสองไฟล์
- แอปห้ามเขียน Firestore (rules ตั้ง `allow write: if false`) — การเขียนมีแต่ backend ด้วย service account
- แอปไม่เรียก LAN API อ่านข้อมูลตรง (`SOLAR_DATA_API_URL` เก็บไว้อ้างอิงเท่านั้น) — ยกเว้น `POST` หมายเหตุและลงทะเบียน push token

## Rules
1. แก้เฉพาะไฟล์ที่เกี่ยวข้อง
2. ห้ามเปลี่ยน API contract โดยไม่จำเป็น
3. ห้ามสร้างโค้ดซ้ำ ถ้ามี implementation อยู่แล้ว
4. ใช้ Type / Interface ที่มีอยู่ก่อนสร้างใหม่
5. แยก UI, Business Logic, API ตามโครงสร้างเดิม
6. รักษา Behavior เดิมของส่วนที่ไม่เกี่ยวข้อง
7. ก่อนสร้างไฟล์ใหม่ ตรวจใน `AI_INDEX.md` ว่ามีไฟล์เดิมที่ใช้ได้หรือไม่
8. ห้าม Refactor โค้ดที่ไม่เกี่ยวกับปัญหา
9. ห้ามเปลี่ยนชื่อไฟล์หรือโครงสร้างโดยไม่มีเหตุผล
10. ห้ามแก้หลายไฟล์ ถ้าแก้ได้ด้วยไฟล์เดียว
11. ห้ามเพิ่ม Dependency / Library ใหม่โดยไม่ได้รับอนุญาต
12. ทำตาม Conventions ของโปรเจกต์ แม้จะไม่ใช่วิธีที่ AI ชอบ
13. ถ้าข้อมูลใน Context ขัดกับโค้ดจริง ให้เชื่อโค้ด แล้วแจ้งผู้ใช้

กฎเฉพาะโปรเจกต์นี้:
14. ก่อนเขียนโค้ดที่ใช้ Expo API ให้อ่าน docs เวอร์ชัน v57: https://docs.expo.dev/versions/v57.0.0/ (`AGENTS.md`)
15. เป้า KWh มีสองที่: `SHIFT_TARGETS` ใน `src/lib/solar-alerts.ts` (แสดงผล) กับ `SolarAlerts__*TargetKwh` ใน `backend/docker-compose*.yml` / `appsettings.json` (แจ้งเตือน) — เปลี่ยนเป้าต้องเปลี่ยนทั้งคู่
16. รูปแบบคีย์ข้อมูลโซล่าต้องตรงกับ backend (`SolarShiftReader.BuildKey`) และหน้าเว็บ D-IT — ห้ามเปลี่ยน
17. `toNumber` (แอป) ต้องถือว่าสตริงว่าง = ไม่มีข้อมูล ให้ตรงกับ `double.TryParse` ฝั่ง backend
18. คีย์วันที่ในเครื่องใช้เวลาท้องถิ่น ห้ามใช้ `toISOString()` (`toDayNoteKey`); backend ต้องรันด้วย `TZ=Asia/Bangkok`
19. ปุ่มทดสอบ/ดีบักต้องใช้ข้อมูลจริงจาก API ห้ามสร้างข้อมูลปลอม (ความต้องการของผู้ใช้)
20. ห้ามอ่าน/commit ไฟล์ลับ: `credentials.json`, `credentials/`, `*.jks`, `firebase-service-account.json`
21. ห้ามแก้ไฟล์ใน `dist/` (ผลลัพธ์ build)
22. ฟีเจอร์ push ต้องข้ามบนเว็บ (`Platform.OS === "web"`)
23. comment ใหม่เขียนภาษาไทย อธิบายเหตุผล ตามสไตล์เดิม

## Modification Strategy
| ปัญหา | ไปที่ |
|---|---|
| ข้อความ/คำแปล | `translations` ใน `src/app/index.tsx` |
| สี/ธีมหน้าหลัก | `lightPalette` / `darkPalette` / `createStyles` ใน `src/app/index.tsx` |
| layout การ์ด/ส่วนหัว/แถบวันที่ | `src/app/index.tsx` (ค้น comment `{/* Header */}`, `{/* Date Selector */}`, `{/* Daily Shift Cards */}`) |
| กราฟรายวัน / รายปี | `src/components/daily-total-chart.tsx` / `src/components/yearly-total-chart.tsx` |
| เกณฑ์ pass/warning/critical, เป้า KWh | `src/lib/solar-alerts.ts` (+ backend ตามกฎข้อ 15) |
| ข้อมูลไม่ขึ้น / ต่อไม่ได้ / token | `src/lib/firebase.ts` → `loadSolarData` ใน `index.tsx` → `backend/SolarPushNotifications/FirestoreMirror.cs` |
| หมายเหตุประจำวัน | `src/lib/solar-notes.ts` + handler `handleNote*` ใน `index.tsx` |
| สภาพอากาศ | `src/lib/solar-weather.ts` |
| จำธีม/ภาษา | `src/lib/preferences.ts` |
| แจ้งเตือนไม่มา / เนื้อหาแจ้งเตือน | ฝั่งแอป: `registerForPushNotificationsAsync` ใน `index.tsx`; ฝั่ง server: `backend/SolarPushNotifications/*.cs` |
| build Android พัง | `plugins/`, `app.json`, `eas.json` |
| เว็บ deploy | `Dockerfile.web`, `nginx-web.conf`, `docker-compose.web*.yml` |
| splash | `src/components/animated-icon*.tsx`, `app.json` (`expo-splash-screen`) |

## AI Reading Strategy
1. อ่าน `AI_CONTEXT.md` ทุกครั้ง
2. วิเคราะห์ปัญหา และระบุ Layer
3. ค้นหาใน `AI_INDEX.md` เฉพาะ Feature ที่เกี่ยวข้อง (ค้นด้วย Keyword ไม่อ่านทั้งไฟล์)
4. ค้นหาใน `AI_CHANGELOG.md` เฉพาะ entry ของ Feature/ไฟล์ที่จะแก้ (ไม่อ่านทั้งไฟล์)
5. เปิดเฉพาะไฟล์ที่ INDEX ชี้ไป
6. อ่าน Dependency เฉพาะที่จำเป็น
7. ห้ามอ่านทั้ง Project หากไม่จำเป็น
8. ถ้าแก้ได้ไฟล์เดียว ให้แก้ไฟล์เดียว
9. ถ้าต้องแก้หลายไฟล์ ให้ระบุเหตุผลรายไฟล์
- เฉพาะโปรเจกต์: `src/app/index.tsx` ยาว ~3,200 บรรทัด — ห้ามอ่านทั้งไฟล์ ให้ grep ชื่อฟังก์ชัน/คีย์ comment ที่ระบุใน `AI_INDEX.md` แล้วอ่านเฉพาะช่วงนั้น

## Change Boundary
ก่อนแก้ให้ระบุ:
- Problem
- Root Cause
- Files Required
- Files Not Required
- Expected Change
- Risk / Side Effect
- Index/Changelog Update: ต้องอัปเดตหรือไม่ เพราะอะไร

ถ้าต้องแก้เกิน 3 ไฟล์ หรือกระทบ API contract / Data structure (คีย์ข้อมูลโซล่า, shape ของ `solar/snapshot`, body ของ endpoint backend) ให้เสนอแผนและรอการยืนยันก่อนแก้

## Expected AI Behavior
1. อ่าน `AI_CONTEXT.md`
2. วิเคราะห์ Root Cause (ไม่แก้แค่อาการ)
3. ระบุไฟล์ที่เกี่ยวข้อง
4. อ่านเฉพาะไฟล์ที่จำเป็น
5. แก้เฉพาะจุด (Minimal diff)
6. ไม่ Refactor ส่วนที่ไม่เกี่ยวข้อง
7. ตรวจผลกระทบต่อไฟล์ที่เรียกใช้ส่วนที่แก้
8. รัน Verification ที่มี
9. อัปเดต `AI_INDEX.md` / `AI_CHANGELOG.md` ตาม Maintenance Rules
10. สรุปไฟล์ที่แก้ และอธิบายสั้น ๆ ว่าแก้อะไร เพราะอะไร

## Verification
- แก้ TS/TSX: `npx tsc --noEmit` และ `npm run lint` (ทั้งคู่ผ่านสะอาด ณ 2026-10-22)
- แก้ backend: `dotnet build backend/SolarPushNotifications` (SDK 10.0.301 ในเครื่องนี้ build ผ่าน, 2026-10-22)
- ไม่มี automated test → AI ต้องบอกวิธีตรวจด้วยมือ เช่น
  - `npm run web` แล้วเปิดหน้าหลัก ดูการ์ด 3 กะ / แถบสถานะการเชื่อมต่อ / กราฟ
  - เปลี่ยนภาษา TH/EN/KR และธีม แล้วเช็คว่าข้อความ/สีเปลี่ยนครบ
  - push: `POST :5155/api/reminders/send-now?shift=Morning` (endpoint ทดสอบใน `Program.cs`) — ต้องอยู่ในวง LAN
  - mirror: `POST :5155/api/mirror/run-now`, สถานะ: `GET :5155/api/status`

## Maintenance Rules
- สร้าง / ย้าย / ลบ / เปลี่ยนชื่อไฟล์ → อัปเดต `AI_INDEX.md`
- เปลี่ยน Behavior, API contract, Data structure หรือตัดสินใจเชิงออกแบบ → เพิ่ม entry ใน `AI_CHANGELOG.md`
- แก้ typo / style / bug เล็กที่ไม่เปลี่ยน Behavior → ไม่ต้องบันทึก
- แก้ `AI_CONTEXT.md` เฉพาะเมื่อ Architecture เปลี่ยนจริง หรือผู้ใช้สั่ง

## Known Risks
- ไม่มี test เลยทั้งแอปและ backend
- `src/app/index.tsx` (~3,183 บรรทัด) รวมทุกอย่างของหน้าหลัก — เสี่ยงแก้ผิดจุด/กระทบส่วนอื่น
- `src/components/daily-total-chart.tsx` (~1,141 บรรทัด) export ส่วนที่ `yearly-total-chart.tsx` ใช้ร่วม
- เป้า KWh ซ้ำสองที่ (แอป/backend) — ไม่มีอะไรบังคับให้ตรงกัน
- URL LAN ฮาร์ดโค้ด `192.168.2.222` ใน `src/lib/solar-alerts.ts`, `src/lib/solar-notes.ts`; `usesCleartextTraffic: true` ใน `app.json`
- คีย์ข้อมูลไม่มีปี — โค้ดสมมติว่าเป็นปีปัจจุบัน (`getLatestSolarDataDate` ใช้ `today.getFullYear()`)
- dependency ที่ไม่ถูก import ใน `src/`: `@notifee/react-native` (แต่มี `plugins/with-notifee-maven-repo.js`), `expo-camera`, `expo-background-fetch`, `expo-task-manager`, `expo-glass-effect`, `@expo/ui` — ห้ามลบเองโดยไม่ถาม
- ไฟล์ template ที่ไม่มีใครใช้: `src/components/app-tabs.tsx`, `app-tabs.web.tsx`, `hint-row.tsx`; `src/app/explore.tsx` ยังเป็น route ได้ทาง URL `/explore` (layout ใช้ `Slot` ไม่มี tab bar)
- ไม่พบ TODO / FIXME / HACK ในโค้ด

## File-Level Context Standard
หัวไฟล์ TS/TSX ใช้ block comment (C# ใช้ `//` ต่อบรรทัด) เขียนภาษาไทย:

```
/**
 * @purpose        หน้าที่หลักของไฟล์
 * @input          ข้อมูลที่รับเข้า
 * @output         สิ่งที่ส่งออกหรือแสดงผล
 * @behavior       พฤติกรรมสำคัญ
 * @dependency     Dependency สำคัญ
 * @edit           จุดที่ควรแก้เมื่อเกิดปัญหา
 * @do-not-change  สิ่งที่ห้ามเปลี่ยน
 */
```
