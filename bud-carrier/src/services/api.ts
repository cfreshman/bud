import { API_URL } from '../config';
import { PlantData } from '../engine/types';
import { getToken } from './auth';

export interface Message {
  id: string;
  plantId: string;
  content: string;
  sender: 'user' | 'plant';
  timestamp: number;
}

/**
 * Load chat history for a plot
 */
export async function loadChatHistory(plotIndex: string): Promise<Message[]> {
  const token = await getToken();
  if (!token) throw new Error('not authenticated');

  const response = await fetch(`${API_URL}/plants/${plotIndex}/chat`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to load chat history');
  }

  return response.json();
}

/**
 * Save chat history for a plot
 */
export async function saveChatHistory(plotIndex: string, messages: Message[]): Promise<void> {
  const token = await getToken();
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
    throw new Error('Failed to save chat history');
  }
}

/**
 * Send a message to the plant and get a response
 * @param plotIndex - The plot index of the plant
 * @param message - The message to send
 * @param plantData - The plant data to use for personality
 * @returns The plant's response
 */
export async function sendMessageToPlant(
  plotIndex: string,
  message: string,
  plantData: PlantData
): Promise<string> {
  try {
    // Extract relevant plant attributes for personality
    const plantAttributes = {
      parts: Array.from(plantData.parts.values()).map(part => ({
        type: part.type,
        attributes: part.attributes
      }))
    };

    // Get token for authentication
    const token = await getToken();
    if (!token) throw new Error('not authenticated');

    // Send request to backend
    const response = await fetch(`${API_URL}/plants/${plotIndex}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        message,
        plantAttributes
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get response from plant');
    }

    const data = await response.json();
    return data.message;
  } catch (error) {
    console.error('Error sending message to plant:', error);
    return 'Sorry, I am having trouble responding right now.';
  }
} 