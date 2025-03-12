import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Network configuration
const ENV = {
  development: {
    apiUrl: Platform.select({
      android: 'http://10.0.2.2:3001/api',
      default: 'http://localhost:3001/api'
    }),
    wsUrl: Platform.select({
      android: 'ws://10.0.2.2:3001/ws',
      default: 'ws://localhost:3001/ws'
    }),
  },
  production: {
    apiUrl: 'https://bud-ga.me/api',
    wsUrl: 'wss://bud-ga.me/ws',
  }
};

// Environment detection
export const isDev = __DEV__;
export const isExpo = Constants.appOwnership === 'expo';

// Get environment-specific config
const getEnvConfig = () => ({
  ...ENV[isDev ? 'development' : 'production'],
  debug: isDev,
});

// Export environment config
export const { apiUrl, wsUrl, debug } = getEnvConfig();

// App configuration
export const APP_VERSION = '1.0.0';

// Feature flags
export const ENABLE_LOGGING = isDev; 