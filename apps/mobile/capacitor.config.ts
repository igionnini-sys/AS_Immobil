import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'it.immobiliare.calcolatore',
  appName: 'Immobiliare',
  webDir: '../web/dist',
  android: { allowMixedContent: false },
};
export default config;
