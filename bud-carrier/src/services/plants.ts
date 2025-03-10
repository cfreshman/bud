import { API_URL } from '../config';
import { PlantData } from '../engine/types';
import { getToken } from './auth';
import { deserializePlantData } from '../utils/plantSaveUtils';

interface ServerResponse {
  [key: string]: {
    serializedPlant: string;
  };
}

// Load the carried plant
export async function loadPlant(): Promise<PlantData | undefined> {
  console.log('Loading carried plant from server...');
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

    const data = await response.json() as { [key: string]: { serializedPlant: string, isCarried: boolean } };
    const plants = Object.entries(data);
    console.log('Got plants:', { count: plants.length });

    // Find the carried plant
    const carriedPlant = plants.find(([_, plant]) => plant.isCarried);
    if (!carriedPlant) {
      console.log('No carried plant found');
      return undefined;
    }

    console.log('Found carried plant');
    return deserializePlantData(carriedPlant[1].serializedPlant);
  } catch (error) {
    console.error('Error loading carried plant:', error);
    throw error;
  }
} 