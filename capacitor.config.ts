import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.casinoghost.app',
  appName: 'CasinoGhost',
  webDir: 'dist',
  backgroundColor: '#101412',
  ios: {
    // The page handles the notch and home indicator itself (env(safe-area-inset-*)).
    contentInset: 'never',
    backgroundColor: '#101412',
    scrollEnabled: true,
    allowsLinkPreview: false,
    preferredContentMode: 'mobile',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      launchFadeOutDuration: 250,
      backgroundColor: '#101412',
      showSpinner: false,
    },
    StatusBar: { style: 'DARK', overlaysWebView: true },
  },
};

export default config;
