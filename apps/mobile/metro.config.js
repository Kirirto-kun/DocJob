// Learn more https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

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

module.exports = config;
