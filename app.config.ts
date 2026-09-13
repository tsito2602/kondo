import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const preview = process.env.APP_VARIANT === 'preview';
  return {
    ...config,
    name: preview ? 'tabi Preview' : 'tabi',
    slug: 'tabi',
    scheme: preview ? 'tabi-preview' : 'tabi',
    ios: { ...config.ios, bundleIdentifier: preview ? 'com.tsito2602.tabi.preview' : 'com.tsito2602.tabi', supportsTablet: true },
    android: { ...config.android, package: preview ? 'com.tsito2602.tabi.preview' : 'com.tsito2602.tabi', softwareKeyboardLayoutMode: 'resize', predictiveBackGestureEnabled: true },
    extra: { ...config.extra, preview },
  };
};
