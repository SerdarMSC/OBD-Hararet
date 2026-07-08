module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          unstable_transformImportMeta: true,
          // Force Babel to downcompile modern class syntax (private fields,
          // etc.) instead of assuming the target Hermes build supports it
          // natively. Some react-native core source (e.g. DOMRectReadOnly.js)
          // uses private class fields that this project's bundled Hermes
          // compiler fails to parse ("private properties are not supported").
          native: {
            unstable_transformProfile: "default",
          },
        },
      ],
    ],
  };
};
