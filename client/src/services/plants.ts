import { API_URL } from '../config'
import { PlantData } from '../engine/types'
import { getToken } from './auth'
import { serializePlantData, deserializePlantData } from '../utils/plantSaveUtils'

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
    body: JSON.stringify({ 
      serializedPlant: serializePlantData(plantData),
      isCarried: plantData.isCarried || false
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'failed to save plant')
  }
}

export async function loadPlants(): Promise<Map<number, PlantData>> {
  const token = getToken()
  if (!token) throw new Error('not authenticated')

  console.log('Loading plants from server...')
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
  console.log('Raw plants from server:', plants)
  
  return new Map(
    Object.entries(plants).map(([key, value]) => {
      const serverValue = value as { serializedPlant: string, isCarried: boolean, shareId?: string }
      console.log('Processing plant:', { plotIndex: key, shareId: serverValue.shareId })
      if (!serverValue.serializedPlant) {
        throw new Error('Invalid plant data received from server')
      }
      const plantData = deserializePlantData(serverValue.serializedPlant)
      plantData.isCarried = serverValue.isCarried
      plantData.shareId = serverValue.shareId
      console.log('Processed plant:', { plotIndex: key, shareId: plantData.shareId })
      return [parseInt(key), plantData]
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