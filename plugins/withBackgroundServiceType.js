const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * react-native-background-actions declares its foreground service
 * (RNBackgroundActionsTask) WITHOUT an android:foregroundServiceType.
 * On Android 14+ (API 34+), starting a foreground service without a
 * matching declared type throws a SecurityException / MissingType
 * exception and crashes the app. This plugin adds the missing
 * foregroundServiceType="connectedDevice" to our own AndroidManifest.xml,
 * which Android's manifest merger combines with the library's own
 * manifest entry for the same service at build time.
 */
module.exports = function withBackgroundServiceType(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure the "tools" namespace is declared on the root <manifest> tag,
    // needed for tools:node="merge" below.
    if (!manifest.$["xmlns:tools"]) {
      manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    }

    const application = manifest.application?.[0];
    if (!application) {
      return config;
    }

    if (!application.service) {
      application.service = [];
    }

    const serviceName = "com.asterinet.react.bgactions.RNBackgroundActionsTask";
    const already = application.service.find((s) => s.$?.["android:name"] === serviceName);

    if (already) {
      already.$["android:foregroundServiceType"] = "connectedDevice";
    } else {
      application.service.push({
        $: {
          "android:name": serviceName,
          "android:foregroundServiceType": "connectedDevice",
          "tools:node": "merge",
        },
      });
    }

    return config;
  });
};
