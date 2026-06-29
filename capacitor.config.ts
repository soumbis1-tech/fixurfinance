import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the Android wrapper of Fix Ur Finance.
 *
 * Strategy (hybrid): the APK ships a thin bundled `dist/` shell, but at
 * runtime the WebView loads the published web app from `server.url` so
 * every web update appears in the Android app instantly — no Play Store
 * resubmission required for UI/content changes.
 *
 * Re-submit to Play only when you change native code, plugins, icons,
 * permissions, or this config.
 */
const config: CapacitorConfig = {
  appId: "app.fixurfinance.tracker",
  appName: "Fix Ur Finance",
  webDir: "dist",
  server: {
    // Live web content. Comment this block out to run a fully bundled build.
    url: "https://fixurfinance.lovable.app",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#0b1220",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0b1220",
    },
    Camera: {
      // Defaults are fine; permissions are declared in AndroidManifest.xml
      // and prompted on first use.
    },
  },
};

export default config;
