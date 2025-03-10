import * as SecureStore from 'expo-secure-store';
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

// Store token in SecureStore
export async function setToken(token: string) {
  await SecureStore.setItemAsync('token', token);
}

// Get token from SecureStore
export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('token');
}

// Remove token from SecureStore
export async function removeToken() {
  await SecureStore.deleteItemAsync('token');
}

// Check if user is logged in
export async function isLoggedIn(): Promise<boolean> {
  const token = await getToken();
  return !!token;
} 