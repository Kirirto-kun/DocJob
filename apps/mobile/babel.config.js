// Learn more https://docs.expo.dev/guides/using-babel/
module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo strips TypeScript types (including `import type`
    // specifiers) at transform time — this is the mechanism that keeps
    // `@docjob/api`'s runtime module (which transitively pulls in
    // @docjob/core -> prisma/argon2/openai) out of the React Native bundle.
    // Every import of @docjob/api MUST be `import type` (see
    // src/lib/api-types.ts and the boundary test in src/__tests__).
    presets: ['babel-preset-expo'],
  };
};
