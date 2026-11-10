const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs/promises');
const path = require('path');

/**
 * ตรึง JDK ที่ Gradle daemon ใช้ ผ่าน android/gradle/gradle-daemon-jvm.properties
 *
 * ทำไมต้องมี: AGP สั่ง prefab CLI ด้วย JVM ตัวเดียวกับ daemon และ prefab 2.1.0
 * เรียก System.load ผ่าน JNA พอรันบน JDK 24 ขึ้นไปจะโดน JEP 472 พ่นข้อความ
 * "WARNING: A restricted method in java.lang.System has been called" ลง stderr
 * แล้ว GeneratePrefabPackages.reportErrors ของ AGP ถือว่าทุกบรรทัดใน stderr
 * คือ error จึง throw ทิ้ง — task configureCMake* พังหมด Gradle sync ใน
 * Android Studio ล้มตาม และปุ่ม Run กลายเป็นสีเทาเพราะไม่มี module :app
 *
 * JDK 17 ไม่มีกลไก restricted method นี้ prefab จึงเงียบและ build ผ่าน
 *
 * ไฟล์นี้อยู่ใน android/ ซึ่ง expo prebuild ลบทิ้งทุกครั้ง plugin จึงเขียนคืนให้
 * อัตโนมัติ แทนที่จะต้องจำไปแก้มือ
 */
const withGradleDaemonJvm = (config, { toolchainVersion = 17 } = {}) =>
  withDangerousMod(config, [
    'android',
    async (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, 'gradle');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'gradle-daemon-jvm.properties'),
        `# เขียนโดย plugins/with-gradle-daemon-jvm.js ทุกครั้งที่ prebuild\n` +
          `# ห้ามเป็น 24 ขึ้นไป ไม่งั้น prefab จะทำ Gradle sync พัง\n` +
          `toolchainVersion=${toolchainVersion}\n`,
        'utf8'
      );
      return config;
    },
  ]);

module.exports = withGradleDaemonJvm;
