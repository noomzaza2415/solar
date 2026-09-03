# ให้เครื่องนอกวงดูข้อมูลได้ ผ่าน Cloud Firestore

API ข้อมูลโซล่าตัวจริง (`http://192.168.2.222:5154/api/get-solar-data`) อยู่ในวง LAN
เครื่องที่อยู่นอกวงจึงยิงไม่ถึง และเห็นแต่แถบ "เชื่อมต่อไม่ได้"

วิธีแก้ที่ใช้อยู่คือ **ไม่เปิดพอร์ตของ API ออกอินเทอร์เน็ต** แต่ให้ service แจ้งเตือน
(`SolarPushNotifications`) ซึ่งอยู่ในวงอยู่แล้ว คัดลอกข้อมูลขึ้น Firestore ทุก 2 นาที
แล้วแอปทุกเครื่องอ่านจาก Firestore ที่เดียว

```
API ในวง 5154  ──►  solar-push (ในวง)  ──►  Cloud Firestore  ──►  แอป (อยู่ที่ไหนก็ได้)
                     เขียนด้วย service account      อ่านด้วย Anonymous Auth (อ่านอย่างเดียว)
```

ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
| --- | --- |
| `SolarPushNotifications/FirestoreMirror.cs` | ขอ access token จาก service account, เขียน document, และ worker ที่คัดลอกข้อมูลทุกรอบ |
| `firestore.rules` | กติกา: ล็อกอินแล้วอ่านได้อย่างเดียว เขียนไม่ได้ |
| `../src/lib/firebase.ts` | ฝั่งแอป: ล็อกอิน anonymous แล้วอ่าน `solar/snapshot` |

---

## ขั้นตอนตั้งค่า (ทำครั้งเดียว)

### 1. เปิด Firestore

Firebase Console > Build > Firestore Database > Create database
เลือก **Native mode** และรีเจียนใกล้ไทย (แนะนำ `asia-southeast1`)

### 2. เปิด Anonymous Authentication

Firebase Console > Build > Authentication > Sign-in method > Anonymous > Enable

ถ้าไม่เปิด แอปจะขอ token ไม่ได้ และหน้าจอจะขึ้นว่าเชื่อมต่อไม่ได้ทั้งที่เน็ตปกติ

### 3. วาง Firestore rules

เอาเนื้อหาใน `firestore.rules` ไปวางที่ Firestore Database > Rules แล้วกด Publish

service account ที่ฝั่งเซิร์ฟเวอร์ใช้ ข้าม rules ไปโดยปริยาย จึงไม่ต้องเปิดสิทธิ์ write ให้ใคร

### 4. โหลด service account key

Firebase Console > Project settings > Service accounts > Generate new private key

เอาไฟล์ JSON ที่ได้ไปวางไว้ข้าง `docker-compose.yml` แล้วตั้งชื่อว่า

```
backend/firebase-service-account.json
```

ชื่อนี้ถูก ignore ไว้ใน `.gitignore` แล้ว **ห้าม commit เด็ดขาด** เพราะเขียน Firestore ได้เต็มสิทธิ์
compose ทั้งสองไฟล์ mount ไฟล์นี้เข้า container ที่ `/app/secrets/firebase-service-account.json`
แบบอ่านอย่างเดียว

### 5. ตรวจ Web API key ของฝั่งแอป

`src/lib/firebase.ts` ใช้คีย์ที่ติดมากับ `google-services.json` เป็นค่าเริ่มต้น
ถ้าเจอ error `api-key-not-valid` บน iOS หรือบนเว็บ ให้ไปเอา **Web API Key**
จาก Project settings > General มาใส่แทนที่ค่า `FIREBASE_API_KEY`

คีย์นี้เปิดเผยได้ตามการออกแบบของ Firebase — ตัวมันเองไม่ให้สิทธิ์อ่านข้อมูล
สิทธิ์จริงมาจาก rules ในข้อ 3

---

## deploy

เหมือนเดิมทุกอย่าง เพิ่มแค่ไฟล์ service account ที่ต้องอยู่บนเครื่องปลายทางด้วย

```bash
# เครื่องพัฒนา
cd backend
docker compose up -d --build

# เครื่อง 192.168.2.222 (โหลด image จาก tar)
docker load -i solar-push-notifications.tar
docker compose -f docker-compose.deploy.yml up -d
```

## ตรวจว่าทำงานจริงไหม

```bash
# บังคับให้ดึงข้อมูลจริงจาก API แล้วอัปโหลดเดี๋ยวนี้ ไม่ต้องรอครบ 2 นาที
curl -X POST http://192.168.2.222:5155/api/mirror/run-now

# ดูสถานะรวม จะมีส่วน firestoreMirror บอกว่าอัปโหลดล่าสุดเมื่อไรและได้ผลอะไร
curl http://192.168.2.222:5155/api/status
```

ถ้า `/api/mirror/run-now` ตอบ `ok: false` ข้อความ error จะบอกตรง ๆ ว่าติดที่ไหน
— หาไฟล์ service account ไม่เจอ, ขอ access token ไม่ผ่าน หรือ API ในวงไม่ตอบ

จากนั้นดูข้อมูลได้ที่ Firebase Console > Firestore Database > collection `solar` > document `snapshot`

## ค่าที่ปรับได้

ตั้งทับได้จาก environment ใน compose (รูปแบบ `Section__Key` ของ .NET)

| คีย์ | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `Firestore__Enabled` | `true` | ปิดการคัดลอกชั่วคราวได้ เช่น ตอนรันในเครื่องพัฒนาที่ไม่มี key |
| `Firestore__ProjectId` | `solar-869ec` | project id ของ Firebase |
| `Firestore__DocumentPath` | `solar/snapshot` | ต้องตรงกับที่แอปอ่านใน `src/lib/firebase.ts` |
| `Firestore__MirrorIntervalSeconds` | `120` | ต่ำกว่า 30 วินาทีจะถูกดันขึ้นเป็น 30 อัตโนมัติ |
| `Firestore__ServiceAccountPath` | `/app/secrets/firebase-service-account.json` | ตำแหน่งไฟล์ key ใน container |

worker เขียน Firestore เฉพาะตอนข้อมูลเปลี่ยนจริงเท่านั้น (เทียบลายเซ็นของข้อมูลก่อน)
ตอนกลางคืนที่ตัวเลขนิ่งแล้วจึงแทบไม่เสียโควตาเขียนเลย

## ข้อจำกัดที่ยังเหลืออยู่

การลงทะเบียน push token (`POST /api/push-tokens` ที่พอร์ต 5155) ยังเป็น LAN อยู่
เครื่องที่ไม่เคยเข้าวงเลยจึงจะ **เห็นข้อมูลได้ แต่ยังไม่ได้รับแจ้งเตือน**
ถ้าต้องการให้เครื่องนอกวงได้รับแจ้งเตือนด้วย ต้องให้แอปเขียน token ลง Firestore
แล้วให้ service ในวงมาอ่าน ซึ่งยังไม่ได้ทำในรอบนี้
