import { PlantData } from '../engine/types'
import { getToken } from './auth'
import { serializePlantData, deserializePlantData } from '../utils/plantSaveUtils'

const API_URL = 'http://localhost:3001/api'

interface ServerResponse {
  serializedPlant: string
}

export async function savePlant(plotIndex: number, plantData: PlantData): Promise<void> {
  const token = getToken()
  if (!token) throw new Error('not authenticated')

  const response = await fetch(`${API_URL}/plants/${plotIndex}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ serializedPlant: serializePlantData(plantData) })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'failed to save plant')
  }
}

export async function loadPlants(): Promise<Map<number, PlantData>> {
  const token = getToken()
  if (!token) throw new Error('not authenticated')

  const response = await fetch(`${API_URL}/plants`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'failed to load plants')
  }

  const plants = await response.json()
  return new Map(
    Object.entries(plants).map(([key, value]) => {
      const serverValue = value as ServerResponse
      if (!serverValue.serializedPlant) {
        throw new Error('Invalid plant data received from server')
      }
      return [parseInt(key), deserializePlantData(serverValue.serializedPlant)]
    })
  )
}

export async function deletePlant(plotIndex: number): Promise<void> {
  const token = getToken()
  if (!token) throw new Error('not authenticated')

  const response = await fetch(`${API_URL}/plants/${plotIndex}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'failed to delete plant')
  }
} 