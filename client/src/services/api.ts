import { PlantData } from '../engine/types';
import { API_URL } from '../config';
import { getToken } from './auth';

/**
 * Send a message to the plant and get a response
 * @param plantId - The ID of the plant
 * @param message - The message to send
 * @param plantData - The plant data to use for personality
 * @returns The plant's response
 */
export async function sendMessageToPlant(
  plantId: string,
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
    const token = getToken();
    if (!token) throw new Error('not authenticated');

    // Send request to backend
    const response = await fetch(`${API_URL}/plants/${plantId}/chat`, {
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