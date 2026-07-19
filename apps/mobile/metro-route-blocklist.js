const path = require('path');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createRouteTestPattern(projectRoot) {
  return new RegExp(
    `${escapeRegExp(path.resolve(projectRoot, 'app'))}${escapeRegExp(path.sep)}.*\\.(?:test|spec)\\.[jt]sx?$`,
  );
}

module.exports = { createRouteTestPattern };
