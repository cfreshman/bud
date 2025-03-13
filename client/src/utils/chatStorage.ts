import { Message } from '../engine/ChatEngine'
import { loadChatHistory, saveChatHistory, clearChatHistory } from '../services/chat'

/**
 * Save messages for a specific plot
 * @param plotIndex The plot index
 * @param messages The messages to save
 */
export async function saveMessages(plotIndex: number, messages: Message[]): Promise<void> {
  console.log('Saving messages:', { plotIndex, messageCount: messages.length })
  try {
    await saveChatHistory(plotIndex, messages)
    console.log('Messages saved successfully')
  } catch (error) {
    console.error('Error saving chat messages:', error)
  }
}

/**
 * Load messages for a specific plot
 * @param plotIndex The plot index
 * @returns The messages for the plot, or an empty array if none exist
 */
export async function loadMessages(plotIndex: number): Promise<Message[]> {
  console.log('Loading messages for plot:', plotIndex)
  try {
    const messages = await loadChatHistory(plotIndex)
    console.log('Loaded messages:', { count: messages.length })
    return messages
  } catch (error) {
    console.error('Error loading chat messages:', error)
    return []
  }
}

/**
 * Clear messages for a specific plot
 * @param plotIndex The plot index
 */
export async function clearMessages(plotIndex: number): Promise<void> {
  console.log('Clearing messages for plot:', plotIndex)
  try {
    await clearChatHistory(plotIndex)
    console.log('Messages cleared successfully')
  } catch (error) {
    console.error('Error clearing chat messages:', error)
  }
}

/**
 * Delete messages for a plot when the plant is deleted
 * @param plotIndex The plot index
 */
export async function deleteMessagesForPlot(plotIndex: number): Promise<void> {
  try {
    await clearMessages(plotIndex)
  } catch (error) {
    console.error('Error deleting messages for plot:', error)
  }
} 