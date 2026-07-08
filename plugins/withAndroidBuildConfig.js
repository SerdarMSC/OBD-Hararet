const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * Recent Android Gradle Plugin versions (8.x) disable BuildConfig class
 * generation by default. Expo's generated MainActivity.kt / MainApplication.kt
 * reference BuildConfig.IS_NEW_ARCHITECTURE_ENABLED / IS_HERMES_ENABLED, which
 * then fails with "Unresolved reference 'BuildConfig'" during release builds.
 * This plugin explicitly re-enables buildConfig generation in app/build.gradle.
 */
module.exports = function withAndroidBuildConfig(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language === "groovy") {
      if (!config.modResults.contents.includes("buildConfig true")) {
        config.modResults.contents = config.modResults.contents.replace(
          /buildFeatures\s*{/,
          "buildFeatures {\n        buildConfig true"
        );
        if (!config.modResults.contents.includes("buildConfig true")) {
          config.modResults.contents = config.modResults.contents.replace(
            /android\s*{/,
            "android {\n    buildFeatures {\n        buildConfig true\n    }"
          );
        }
      }
    }
    return config;
  });
};
