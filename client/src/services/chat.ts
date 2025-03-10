import { API_URL } from '../config';
import { Message } from '../engine/ChatEngine';
import { getToken } from './auth';

export async function loadChatHistory(plotIndex: number): Promise<Message[]> {
  const token = getToken();
  if (!token) throw new Error('not authenticated');

  const response = await fetch(`${API_URL}/plants/${plotIndex}/chat`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'failed to load chat history');
  }

  return response.json();
}

export async function saveChatHistory(plotIndex: number, messages: Message[]): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('not authenticated');

  const response = await fetch(`${API_URL}/plants/${plotIndex}/chat`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ messages })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'failed to save chat history');
  }
}

export async function clearChatHistory(plotIndex: number): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('not authenticated');

  const response = await fetch(`${API_URL}/plants/${plotIndex}/chat`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'failed to clear chat history');
  }
} 