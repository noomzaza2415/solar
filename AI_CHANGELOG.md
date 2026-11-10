# AI_CHANGELOG

> Append-only · entry ใหม่อยู่บนสุด · ค้นด้วยชื่อ Feature/ไฟล์ ไม่ต้องอ่านทั้งไฟล์
> เมื่อเกิน 50 entry ให้ย้ายของเก่าไป `AI_CHANGELOG_ARCHIVE.md` และสรุปการตัดสินใจที่ยังมีผลไว้ในหัวข้อ "Active Decisions"

## Format
```
## YYYY-MM-DD — <Feature / Area>
- Change: <แก้อะไร>
- Files: <ไฟล์ที่แก้>
- Reason: <ทำไม>
- Do-not-revert: <สิ่งที่ห้ามย้อนกลับ ถ้ามี>
```

## Active Decisions
- (ยังไม่มี)

---

## 2026-10-22 — Backend workers (Firestore mirror / reminder)
- Change: `catch (OperationCanceledException)` ใน loop ของ worker เปลี่ยนเป็น `when (stoppingToken.IsCancellationRequested)`
- Files: `backend/SolarPushNotifications/FirestoreMirror.cs`, `backend/SolarPushNotifications/SolarReminderWorker.cs`
- Reason: HttpClient timeout โยน `TaskCanceledException` ทำให้ loop break เงียบ ๆ — mirror หยุดตั้งแต่ 2026-10-07 08:22 แอปขึ้นแบนเนอร์ "ข้อมูลค้าง" ขณะที่ `/api/status` ยังรายงานผลรอบสุดท้ายว่าปกติ
- Do-not-revert: ห้ามกลับไปจับ `OperationCanceledException` แบบไม่มีเงื่อนไขใน loop ของ BackgroundService

## 2026-10-22 — AI Context System
- Change: สร้างระบบ context สำหรับ AI coding assistant และเพิ่มบรรทัดชี้ไปที่ `AI_CONTEXT.md` ใน `AGENTS.md` (ซึ่ง `CLAUDE.md` import อยู่)
- Files: `AI_CONTEXT.md`, `AI_INDEX.md`, `AI_CHANGELOG.md`, `AGENTS.md`
- Reason: ลดการอ่านไฟล์ที่ไม่จำเป็น ลด token และลดการแก้ผิดไฟล์
- Do-not-revert: —
