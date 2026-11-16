import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.techstudio.jcbrental",
  appName: "JCB Rental",
  webDir: "out",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https"
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1600,
      launchAutoHide: true,
      backgroundColor: "#101114",
      showSpinner: false
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#101114",
      overlaysWebView: false
    },
    Keyboard: {
      resize: "native",
      style: "DARK",
      resizeOnFullScreen: true
    }
  }
};

export default config;
