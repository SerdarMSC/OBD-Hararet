const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * By default, a plain `./gradlew assembleRelease` produces one "fat"
 * universal APK containing native libraries for ALL supported CPU
 * architectures (arm64-v8a, armeabi-v7a, x86, x86_64) — even though a real
 * phone only ever uses one. This is the single biggest contributor to a
 * ~90MB APK for an app with several native modules (Reanimated, Worklets,
 * Hermes, etc.), since each architecture ships its own full copy of every
 * native .so library.
 *
 * Virtually all real Android phones sold since ~2017 are arm64-v8a. x86/
 * x86_64 only matter for emulators, and armeabi-v7a only matters for very
 * old 32-bit devices. Restricting to arm64-v8a cuts the APK down to
 * roughly a quarter of its previous size with no functional risk (unlike
 * minification, which can break reflection-based native modules if not
 * configured carefully).
 */
module.exports = function withAbiFilters(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language === "groovy") {
      const marker = "ndk {\n        abiFilters";
      if (!config.modResults.contents.includes(marker)) {
        config.modResults.contents = config.modResults.contents.replace(
          /defaultConfig\s*{/,
          'defaultConfig {\n        ndk {\n            abiFilters "arm64-v8a"\n        }',
        );
      }
    }
    return config;
  });
};
