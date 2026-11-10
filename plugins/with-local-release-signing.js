const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * เซ็น APK release ที่ build ในเครื่องด้วยกุญแจตัวเดียวกับ EAS
 *
 * ทำไมต้องมี: APK ที่แจกไปแล้วเซ็นด้วยกุญแจที่เก็บบน EAS ถ้า build ในเครื่องแล้วเซ็นด้วย
 * กุญแจ debug ของ template Android จะไม่ยอมติดตั้งทับแอปเดิม ต้องลบแอปก่อนทุกเครื่อง
 *
 * กุญแจดาวน์โหลดจาก EAS ด้วย `npx eas-cli credentials -p android`
 * → credentials.json: Upload/Download → Download credentials from EAS to credentials.json
 * ได้ credentials.json + credentials/android/keystore.jks ที่รากโปรเจกต์ (อยู่ใน .gitignore)
 *
 * ไม่มี credentials.json (เช่นตอน build บน EAS ซึ่งใส่กุญแจให้เอง) = ใช้ค่าเดิมของ template
 * รหัสผ่านอ่านจากไฟล์ตอน build ไม่ถูกคัดลอกลง build.gradle
 *
 * ไฟล์ android/ ถูก prebuild ลบ/เขียนใหม่ plugin นี้จึงเขียนคืนให้อัตโนมัติ
 */
const MARKER = '// เขียนโดย plugins/with-local-release-signing.js';

const RELEASE_SIGNING_CONFIG = `
        ${MARKER}
        release {
            def credentialsFile = rootProject.file('../credentials.json')
            if (credentialsFile.exists()) {
                def keystore = new groovy.json.JsonSlurper().parse(credentialsFile).android.keystore
                storeFile rootProject.file("../\${keystore.keystorePath}")
                storePassword keystore.keystorePassword
                keyAlias keystore.keyAlias
                keyPassword keystore.keyPassword
            }
        }`;

const RELEASE_SIGNING_LINE =
  "signingConfig rootProject.file('../credentials.json').exists() ? signingConfigs.release : signingConfigs.debug";

const withLocalReleaseSigning = (config) =>
  withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error(
        'with-local-release-signing รองรับเฉพาะ android/app/build.gradle แบบ groovy เท่านั้น'
      );
    }

    let contents = config.modResults.contents;
    if (contents.includes(MARKER)) return config;

    // เติม signingConfigs.release ต่อจาก block debug
    const debugSigning = /(signingConfigs\s*\{\s*\n\s*debug\s*\{[^}]*\})/;
    if (!debugSigning.test(contents)) {
      throw new Error(
        'with-local-release-signing: หา signingConfigs { debug { ... } } ใน android/app/build.gradle ไม่เจอ'
      );
    }
    contents = contents.replace(debugSigning, `$1${RELEASE_SIGNING_CONFIG}`);

    // ให้ buildType release ใช้กุญแจนั้น (template เดิมใช้ signingConfigs.debug)
    const releaseBuildType =
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (!releaseBuildType.test(contents)) {
      throw new Error(
        'with-local-release-signing: หา signingConfig ของ buildTypes.release ใน android/app/build.gradle ไม่เจอ'
      );
    }
    contents = contents.replace(releaseBuildType, `$1${RELEASE_SIGNING_LINE}`);

    config.modResults.contents = contents;
    return config;
  });

module.exports = withLocalReleaseSigning;
