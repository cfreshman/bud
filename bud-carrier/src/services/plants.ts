import { API_URL } from '../config';
import { PlantData } from '../engine/types';
import { getToken } from './auth';
import { deserializePlantData } from '../utils/plantSaveUtils';

interface ServerResponse {
  [key: string]: {
    serializedPlant: string;
  };
}

// Load the first available plant
export async function loadPlant(): Promise<PlantData | undefined> {
  console.log('Loading plants from server...');
  const token = await getToken();
  if (!token) {
    console.log('No token found');
    return undefined;
  }

  try {
    const response = await fetch(`${API_URL}/plants`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    console.log('Server response:', { status: response.status });

    if (!response.ok) {
      throw new Error('Failed to load plants');
    }

    const data = await response.json() as ServerResponse;
    const plants = Object.values(data);
    console.log('Got plants:', { count: plants.length });

    if (plants.length === 0) {
      console.log('No plants found');
      return undefined;
    }

    // Use the first plant
    const firstPlant = plants[0];
    console.log('Using first plant');
    return deserializePlantData(firstPlant.serializedPlant);
  } catch (error) {
    console.error('Error loading plant:', error);
    throw error;
  }
} 