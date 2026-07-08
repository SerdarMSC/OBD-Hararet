const { withAppBuildGradle } = require("@expo/config-plugins");

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
