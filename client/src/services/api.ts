import { PlantData } from '../engine/types';
import { API_URL } from '../config';
import { getToken } from './auth';

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
    const token = getToken();
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

export async function carryPlant(plotIndex: string): Promise<void> {
  const response = await fetch(`${API_URL}/plants/${plotIndex}/carry`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  })

  if (!response.ok) {
    throw new Error('Failed to carry plant')
  }
}

export async function uncarryPlant(plotIndex: string): Promise<void> {
  const response = await fetch(`${API_URL}/plants/${plotIndex}/uncarry`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  })

  if (!response.ok) {
    throw new Error('Failed to uncarry plant')
  }
}

export async function sharePlant(plotIndex: string): Promise<{ shareId: string }> {
  console.log('Attempting to share plant:', { plotIndex })
  const token = getToken()
  if (!token) throw new Error('not authenticated')

  console.log('Making share API call to:', `${API_URL}/plants/${plotIndex}/share`)
  const response = await fetch(`${API_URL}/plants/${plotIndex}/share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  })

  console.log('Share API response:', { 
    ok: response.ok, 
    status: response.status,
    statusText: response.statusText 
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('Share API error:', error)
    throw new Error(error.message || 'failed to share plant')
  }

  const result = await response.json()
  console.log('Share API success:', result)
  return result
}

export async function unsharePlant(plotIndex: string): Promise<void> {
  const token = getToken()
  if (!token) throw new Error('not authenticated')

  const response = await fetch(`${API_URL}/plants/${plotIndex}/unshare`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'failed to unshare plant')
  }
} 