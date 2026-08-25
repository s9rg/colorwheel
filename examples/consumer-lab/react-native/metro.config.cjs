const path = require("node:path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

const projectRoot = __dirname;
const consumerRoot = path.resolve(projectRoot, "..");

module.exports = mergeConfig(getDefaultConfig(projectRoot), {
  projectRoot,
  watchFolders: [consumerRoot],
  resolver: {
    nodeModulesPaths: [path.join(consumerRoot, "node_modules")],
    unstable_enablePackageExports: true
  }
});
