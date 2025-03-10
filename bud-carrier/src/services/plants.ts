import { API_URL } from '../config';
import { PlantData } from '../engine/types';
import { getToken } from './auth';
import { deserializePlantData } from '../utils/plantSaveUtils';

interface PlantResponse {
  plotIndex: number;
  serializedPlant: string;
  isCarried: boolean;
}

// Load the carried plant
export async function loadPlant(): Promise<{ plant: PlantData | undefined, plotIndex: number | undefined }> {
  console.log('Loading carried plant from server...');
  const token = await getToken();
  if (!token) {
    console.log('No token found');
    return { plant: undefined, plotIndex: undefined };
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

    const data = await response.json() as { [key: string]: PlantResponse };
    const plants = Object.values(data);
    console.log('Got plants:', { count: plants.length });

    // Find the carried plant
    const carriedPlant = plants.find(plant => plant.isCarried);
    if (!carriedPlant) {
      console.log('No carried plant found');
      return { plant: undefined, plotIndex: undefined };
    }

    console.log('Found carried plant with plot index:', carriedPlant.plotIndex);
    return {
      plant: deserializePlantData(carriedPlant.serializedPlant),
      plotIndex: carriedPlant.plotIndex
    };
  } catch (error) {
    console.error('Error loading carried plant:', error);
    throw error;
  }
} 