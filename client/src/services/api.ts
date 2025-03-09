import { PlantData } from '../engine/types';

const API_URL = 'http://localhost:3001/api';

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

    // Send request to backend
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plantId,
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