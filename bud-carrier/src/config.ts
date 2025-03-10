// Network configuration
export const API_URL = __DEV__
  ? 'http://localhost:3001/api'  // Development - your local network IP
  : 'https://bud-companion.app/api'; // Production

// App configuration
export const APP_VERSION = '1.0.0';

// Feature flags
export const ENABLE_LOGGING = __DEV__; 