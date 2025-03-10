import { API_URL } from '../config';

export interface AuthResponse {
  token: string;
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'login failed');
  }

  return response.json();
}

export async function register(username: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'registration failed');
  }

  return response.json();
}

// Store token in localStorage
export function setToken(token: string) {
  localStorage.setItem('token', token);
}

// Get token from localStorage
export function getToken(): string | null {
  return localStorage.getItem('token');
}

// Remove token from localStorage
export function removeToken() {
  localStorage.removeItem('token');
}

// Check if user is logged in
export function isLoggedIn(): boolean {
  return !!getToken();
} 