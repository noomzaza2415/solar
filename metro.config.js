// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Gradle สร้างและลบไฟล์ใน .gradle/ .cxx/ build/ ตลอดเวลาที่ build อยู่
// บน Windows ไม่มี Watchman เลยตกไปใช้ FallbackWatcher ซึ่งเรียก fs.watch()
// กับทุกโฟลเดอร์ใหม่ที่เห็น ถ้า Gradle ลบโฟลเดอร์นั้นทิ้งก่อน watch จะได้
// ENOENT แบบ synchronous ที่ไม่มีใครดัก แล้ว dev server ตายทั้งตัว
//
// ค่า default ของ Expo มี android/.gradle กับ android/app/build อยู่แล้ว
// แต่ pattern ปิดท้ายด้วย $ จึง match แค่ตัวโฟลเดอร์เอง ไม่รวมข้างใน
// ซึ่งข้างในคือที่ที่ churn จริง — สองบรรทัดล่างจึง match แบบรวม subtree
// และครอบ node_modules/<lib>/android/build ที่ Gradle เขียนลงไปด้วย
config.resolver.blockList = [
  ...config.resolver.blockList,
  /(^|[\\/])(android|ios)[\\/](\.gradle|\.cxx|\.kotlin|build)([\\/]|$)/,
  /(^|[\\/])android[\\/]app[\\/](build|\.cxx)([\\/]|$)/,
];

module.exports = config;
