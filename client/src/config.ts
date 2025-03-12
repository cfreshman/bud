// Network configuration
export const API_URL = import.meta.env.DEV
  ? 'http://localhost:3001/api'  // Development
  : 'https://bud-ga.me/api';

export const WS_URL = import.meta.env.DEV
  ? 'ws://localhost:3001/ws'  // Development
  : 'wss://bud-ga.me/ws';