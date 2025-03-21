import { API_URL } from '../config';
import { Message } from '../engine/ChatEngine';
import { getToken } from './auth';

export async function loadChatHistory(plotIndex: number): Promise<Message[]> {
  console.log('API: Loading chat history for plot:', plotIndex);
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

  const messages = await response.json();
  console.log('API: Loaded messages:', { count: messages.length });
  return messages;
}

export async function saveChatHistory(plotIndex: number, messages: Message[]): Promise<void> {
  console.log('API: Saving chat history:', { plotIndex, messageCount: messages.length });
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
  console.log('API: Chat history saved successfully');
}

export async function clearChatHistory(plotIndex: number): Promise<void> {
  console.log('API: Clearing chat history for plot:', plotIndex);
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
  console.log('API: Chat history cleared successfully');
}

export async function getGoals(): Promise<string[]> {
  console.log('API: Getting goals');
  const token = getToken();
  if (!token) throw new Error('not authenticated');

  const response = await fetch(`${API_URL}/plants/goals`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'failed to get goals');
  }

  const goals = await response.json();
  console.log('API: Got goals:', goals);
  return goals;
}

export async function setGoal(content: string): Promise<string[]> {
  console.log('API: Setting goal:', content);
  const token = getToken();
  if (!token) throw new Error('not authenticated');

  const response = await fetch(`${API_URL}/plants/goals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ content })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'failed to set goal');
  }

  const goals = await response.json();
  console.log('API: Goal set successfully');
  return goals;
}

export async function unsetGoal(index: number): Promise<string[]> {
  console.log('API: Removing goal at index:', index);
  const token = getToken();
  if (!token) throw new Error('not authenticated');

  const response = await fetch(`${API_URL}/plants/goals/${index}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'failed to remove goal');
  }

  const goals = await response.json();
  console.log('API: Goal removed successfully');
  return goals;
} 