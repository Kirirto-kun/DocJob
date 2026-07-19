// Learn more https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const { createRouteTestPattern } = require('./metro-route-blocklist');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole pnpm monorepo so Metro picks up changes in workspace
//    packages (@docjob/types, and transitively whatever else gets symlinked).
config.watchFolders = [workspaceRoot];

// 2. Resolve node_modules from both this project's own node_modules AND the
//    workspace root's, since pnpm hoists/symlinks shared deps up to the root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Expo Router's route context accepts every .ts/.tsx file below app/, including
// co-located Jest tests. Exclude those files from Metro's production file map
// so test-only Node modules can never be pulled into an Android bundle.
const routeTestPattern = createRouteTestPattern(projectRoot);
const defaultBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : [config.resolver.blockList].filter(Boolean);
config.resolver.blockList = [...defaultBlockList, routeTestPattern];

module.exports = config;
