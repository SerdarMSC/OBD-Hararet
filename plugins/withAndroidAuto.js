const { withAppBuildGradle, withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

function withCarAppGradle(config) {
  return withAppBuildGradle(config, (config) => {
    const content = config.modResults.contents;
    if (!content.includes("androidx.car.app")) {
      config.modResults.contents = content.replace(
        /dependencies\s*\{/,
        `dependencies {\n    implementation("androidx.car.app:app:1.4.0")\n`
      );
    }
    return config;
  });
}

function withCarAppManifest(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];

    const metaDataList = app["meta-data"] || [];
    if (!metaDataList.some((m) => m.$?.["android:name"] === "com.google.android.gms.car.application")) {
      app["meta-data"] = [
        ...metaDataList,
        {
          $: {
            "android:name": "com.google.android.gms.car.application",
            "android:resource": "@xml/automotive_app_desc",
          },
        },
      ];
    }

    const services = app.service || [];
    if (!services.some((s) => s.$?.["android:name"]?.includes("ObdCarAppService"))) {
      app.service = [
        ...services,
        {
          $: {
            "android:name": ".auto.ObdCarAppService",
            "android:exported": "true",
          },
          "intent-filter": [
            {
              action: [{ $: { "android:name": "androidx.car.app.CarAppService" } }],
              category: [{ $: { "android:name": "androidx.car.app.category.POI" } }],
            },
          ],
          "meta-data": [
            {
              $: {
                "android:name": "androidx.car.app.minCarApiLevel",
                "android:value": "2",
              },
            },
          ],
        },
      ];
    }

    return config;
  });
}

function withCarAppResources(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const xmlDir = path.join(config.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(xmlDir, { recursive: true });
      const desc = `<?xml version="1.0" encoding="utf-8"?>
<automotiveApp>
    <uses name="template"/>
</automotiveApp>`;
      fs.writeFileSync(path.join(xmlDir, "automotive_app_desc.xml"), desc, "utf8");
      return config;
    },
  ]);
}

function withCarAppSources(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const destDir = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/java/com/obdsicaklik/izleyici/auto"
      );
      fs.mkdirSync(destDir, { recursive: true });

      const srcDir = path.join(config.modRequest.projectRoot, "android-auto-src");
      for (const file of ["ObdCarAppService.kt", "ObdCarSession.kt", "ObdCarScreen.kt"]) {
        fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
      }

      return config;
    },
  ]);
}

module.exports = (config) => {
  config = withCarAppGradle(config);
  config = withCarAppManifest(config);
  config = withCarAppResources(config);
  config = withCarAppSources(config);
  return config;
};
