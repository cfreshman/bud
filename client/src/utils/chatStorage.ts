import { Message } from '../engine/ChatEngine'

const CHAT_STORAGE_PREFIX = 'bud_chat_'

/**
 * Save messages for a specific plant
 * @param plantId The plant ID
 * @param messages The messages to save
 */
export function saveMessages(plantId: string, messages: Message[]): void {
  try {
    localStorage.setItem(`${CHAT_STORAGE_PREFIX}${plantId}`, JSON.stringify(messages))
  } catch (error) {
    console.error('Error saving chat messages:', error)
  }
}

/**
 * Load messages for a specific plant
 * @param plantId The plant ID
 * @returns The messages for the plant, or an empty array if none exist
 */
export function loadMessages(plantId: string): Message[] {
  try {
    const storedMessages = localStorage.getItem(`${CHAT_STORAGE_PREFIX}${plantId}`)
    if (!storedMessages) return []
    return JSON.parse(storedMessages)
  } catch (error) {
    console.error('Error loading chat messages:', error)
    return []
  }
}

/**
 * Clear messages for a specific plant
 * @param plantId The plant ID
 */
export function clearMessages(plantId: string): void {
  try {
    localStorage.removeItem(`${CHAT_STORAGE_PREFIX}${plantId}`)
  } catch (error) {
    console.error('Error clearing chat messages:', error)
  }
}

/**
 * Clear all chat messages for all plants
 */
export function clearAllMessages(): void {
  try {
    const keys = Object.keys(localStorage)
    keys.forEach(key => {
      if (key.startsWith(CHAT_STORAGE_PREFIX)) {
        localStorage.removeItem(key)
      }
    })
  } catch (error) {
    console.error('Error clearing all chat messages:', error)
  }
}

/**
 * Delete messages for a plant when the plant is deleted
 * @param plotIndex The plot index
 */
export function deleteMessagesForPlot(plotIndex: number): void {
  try {
    // Get the plant ID from localStorage
    const savedPlantStr = localStorage.getItem(`greenhouse_plot_${plotIndex}`)
    if (!savedPlantStr) return
    
    // Parse the plant data to get the ID
    const plantData = JSON.parse(savedPlantStr)
    if (!plantData || !plantData[0]?.plantId) return
    
    // Clear messages for this plant ID
    clearMessages(plantData[0].plantId)
  } catch (error) {
    console.error('Error deleting messages for plot:', error)
  }
} 