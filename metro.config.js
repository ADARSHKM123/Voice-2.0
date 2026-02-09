const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  resolver: {
    assetExts: getDefaultConfig(__dirname).resolver.assetExts.filter(
      ext => ext !== 'svg',
    ),
    sourceExts: [...getDefaultConfig(__dirname).resolver.sourceExts, 'svg'],
  },
  server: {
    enhanceMiddleware: (middleware) => {
      return (req, res, next) => {
        // Enable better hot reload support
        res.setHeader('Access-Control-Allow-Origin', '*');
        return middleware(req, res, next);
      };
    },
  },
  resetCache: true,
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
