const { withProjectBuildGradle } = require('expo/config-plugins');

/**
 * เติม maven repo ของ notifee เข้า android/build.gradle
 *
 * ทำไมต้องมี: @notifee/react-native ไม่ได้อยู่บน mavenCentral — artifact
 * `app.notifee:core` ถูกแพ็กมากับแพ็กเกจที่
 * node_modules/@notifee/react-native/android/libs แล้ว build.gradle ของ notifee
 * เองค่อยเติม repo นี้ให้ตอนมันถูก configure ผ่าน rootProject.allprojects {}
 *
 * ปัญหาคือ `expo run:android` สั่ง gradle ด้วย --configure-on-demand ทำให้
 * :app ถูก resolve dependency ก่อนที่ :notifee_react-native จะถูก configure
 * repo จึงยังไม่มีในลิสต์ gradle เลยหา app.notifee:core:+ ไม่เจอ แล้วพัง
 * "Could not find any matches for app.notifee:core:+" ที่ task
 * :app:processDebugResources
 *
 * เติม repo ตรง ๆ ใน allprojects ของ root build.gradle จึงชัวร์กว่า เพราะ
 * root build.gradle ถูกอ่านก่อนทุก project เสมอ ไม่ขึ้นกับลำดับ configure
 *
 * ไฟล์ android/ ถูก prebuild ลบทิ้งทุกครั้ง plugin นี้จึงเขียนคืนให้อัตโนมัติ
 */
const NOTIFEE_REPO_URL = '$rootDir/../node_modules/@notifee/react-native/android/libs';
const REPO_BLOCK = `    maven { url "${NOTIFEE_REPO_URL}" } // เขียนโดย plugins/with-notifee-maven-repo.js\n`;

const withNotifeeMavenRepo = (config) =>
  withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error(
        'with-notifee-maven-repo รองรับเฉพาะ android/build.gradle แบบ groovy เท่านั้น'
      );
    }

    if (config.modResults.contents.includes(NOTIFEE_REPO_URL)) {
      return config;
    }

    const anchor = /(allprojects\s*\{[^\n]*\n\s*repositories\s*\{[^\n]*\n)/;
    if (!anchor.test(config.modResults.contents)) {
      throw new Error(
        'with-notifee-maven-repo: หา block allprojects { repositories { ใน android/build.gradle ไม่เจอ'
      );
    }

    config.modResults.contents = config.modResults.contents.replace(
      anchor,
      `$1${REPO_BLOCK}`
    );

    return config;
  });

module.exports = withNotifeeMavenRepo;
