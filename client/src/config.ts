// Network configuration
export const API_URL = import.meta.env.DEV
  ? 'http://localhost:3001/api'  // Development
  : 'https://bud-companion.app/api'; // Production 