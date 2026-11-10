// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // ไฟล์ yml (docker-compose) ถูกจับไปแปลงเป็น JS แล้วขึ้น Parsing error
    ignores: ["dist/*", "**/*.yml"],
  }
]);
