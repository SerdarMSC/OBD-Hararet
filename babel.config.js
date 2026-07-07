module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          unstable_transformImportMeta: true,
          native: {
            unstable_transformProfile: "default",
          },
        },
      ],
    ],
  };
};
