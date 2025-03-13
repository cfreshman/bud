import { useEffect, useRef, useState } from 'react'
import { PlantData } from '../engine/types'
import { ChatEngine, Message } from '../engine/ChatEngine'
import { sendMessageToPlant } from '../services/api'
import { loadMessages, saveMessages, clearMessages } from '../utils/chatStorage'
import { getStarCounts, StarCounts } from '../services/api'
import { Star } from '@phosphor-icons/react'

interface ChatViewProps {
  plant: PlantData
  plotIndex: number
  onClose: () => void
}

export function ChatView({ plant, plotIndex, onClose }: ChatViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [chatEngine, setChatEngine] = useState<ChatEngine>()
  const [input, setInput] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [stars, setStars] = useState<StarCounts>({ totalStars: 0, currentStars: 0 })

  // Load star counts on mount
  useEffect(() => {
    const loadStars = async () => {
      try {
        const counts = await getStarCounts()
        setStars(counts)
      } catch (err) {
        console.error('Failed to load star counts:', err)
      }
    }
    loadStars()
  }, [])

  // Add focus event listener to reload stars
  useEffect(() => {
    const handleFocus = async () => {
      try {
        const counts = await getStarCounts()
        setStars(counts)
      } catch (error) {
        console.error('Failed to reload star counts:', error)
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // Load messages when component mounts
  useEffect(() => {
    let mounted = true
    
    const loadChatHistory = async () => {
      try {
        if (!mounted) return
        setIsLoading(true)
        const savedMessages = await loadMessages(plotIndex)
        if (!mounted) return
        
        // Only set messages if we got some back and component is still mounted
        if (savedMessages.length > 0) {
          setMessages(savedMessages)
        }
      } catch (error) {
        console.error('Error loading chat history:', error)
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }
    
    loadChatHistory()
    
    return () => {
      mounted = false
    }
  }, [plotIndex]) // Only reload when plot changes

  // Update chat engine when it's ready or messages change
  useEffect(() => {
    if (!chatEngine || !plant.plantId) return

    // First clear any existing messages
    chatEngine.addMessage(plant.plantId, '', 'plant')
    
    // Add all messages to the chat engine in order
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const isLastMessage = i === messages.length - 1
      const skipThinking = !(isLastMessage && msg.sender === 'user')
      chatEngine.addMessage(plant.plantId, msg.content, msg.sender, skipThinking)
    }
    
    // If the last message is from the user, show a "..." bubble
    const lastMessage = messages[messages.length - 1]
    if (lastMessage && lastMessage.sender === 'user') {
      chatEngine.addMessage(plant.plantId, '...', 'plant')
    }
  }, [chatEngine, messages, plant.plantId])

  // Save messages when they change
  useEffect(() => {
    // Don't save if messages were just cleared
    if (messages.length === 0) return
    
    // Skip initial load
    const isInitialLoad = messages.every(msg => {
      const timestamp = msg.timestamp || 0
      return timestamp < Date.now() - 5000 // Skip if all messages are older than 5 seconds
    })
    if (isInitialLoad) return
    
    const syncMessages = async () => {
      try {
        await saveMessages(plotIndex, messages)
      } catch (error) {
        console.error('Error saving messages:', error)
      }
    }
    
    syncMessages()
  }, [messages, plotIndex])

  useEffect(() => {
    if (!containerRef.current || !plant.plantId) return

    const engine = new ChatEngine(containerRef.current)
    setChatEngine(engine)
    
    // Set plant data after engine is initialized
    engine.setPlantData(plant)

    return () => {
      engine.dispose()
    }
  }, [plant])

  // Auto-resize textarea as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [input])

  const handleSend = async () => {
    if (!input.trim() || !plant.plantId || !chatEngine || isLoading) return
    
    // Clear any existing plant message in the 3D view
    if (plant.plantId) {
      chatEngine.addMessage(plant.plantId, '', 'plant')
    }
    
    setIsLoading(true)
    
    // Add user message to ChatEngine - this will automatically show a "..." bubble
    const userMessage = chatEngine.addMessage(plant.plantId, input, 'user')
    
    // Clear input and reset textarea height
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      // Get plant's response from API using plotIndex
      const response = await sendMessageToPlant(plotIndex.toString(), input, plant)
      
      // Add plant message
      const plantMessage = chatEngine.addMessage(plant.plantId, response.message, 'plant')
      
      // Update messages state and save to MongoDB
      const newMessages = [...messages, userMessage, plantMessage]
      setMessages(newMessages)
      await saveMessages(plotIndex, newMessages)

      // Update star counts if they changed
      if (response.stars) {
        setStars(response.stars)
      }
    } catch (error) {
      console.error('Error getting plant response:', error)
      // Add fallback message if API fails
      const fallbackResponse = "I'm having trouble understanding right now."
      const fallbackMessage = {
        id: crypto.randomUUID(),
        plantId: plant.plantId,
        content: fallbackResponse,
        sender: 'plant' as const,
        timestamp: Date.now()
      }
      chatEngine.addMessage(plant.plantId, fallbackResponse, 'plant')
      
      // Update messages state and save to MongoDB even if response failed
      const newMessages = [...messages, userMessage, fallbackMessage]
      setMessages(newMessages)
      await saveMessages(plotIndex, newMessages)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClearHistory = async () => {
    if (!plant.plantId || !chatEngine) return
    
    try {
      // Clear messages in localStorage and cloud
      await clearMessages(plotIndex)
      
      // Clear messages in state
      setMessages([])
      
      // Clear any visible speech bubble
      chatEngine.addMessage(plant.plantId, '', 'plant')
      
      // Close history overlay
      setShowHistory(false)

      // Force a re-render of the chat history
      await loadMessages(plotIndex)
    } catch (error) {
      console.error('Error clearing chat history:', error)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Allow shift+enter for new line
        return
      }
      
      // Only send if not currently loading
      if (!isLoading) {
        e.preventDefault()
        handleSend()
      }
    }
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      
      {/* Star count centered at top */}
      <div style={{ 
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000
      }}>
        <div className="chat-button" style={{ cursor: 'default', border: '1px solid transparent', backgroundClip: 'padding-box' }}>
          <Star weight="fill" style={{ marginRight: '4px' }} />
          {stars.currentStars}/{stars.totalStars}
        </div>
      </div>

      {/* Input container with buttons on either side */}
      <div className="chat-controls">
        {/* Return button */}
        <button 
          className="chat-button"
          onClick={onClose}
        >
          return
        </button>

        {/* Growing textarea */}
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isLoading ? "plant is thinking..." : "type a message..."}
          rows={1}
        />

        {/* History button */}
        <button 
          className="chat-button"
          onClick={() => setShowHistory(true)}
        >
          history
        </button>
      </div>

      {/* History overlay */}
      <div className={`chat-history-overlay ${showHistory ? 'visible' : ''}`}>
        <div className="chat-history-modal">
          <div className="chat-history-header">
            <h3>conversation history</h3>
            <div>
              <button 
                className="chat-history-clear"
                onClick={handleClearHistory}
              >
                clear
              </button>
              <button 
                className="chat-history-close"
                onClick={() => setShowHistory(false)}
              >
                ×
              </button>
            </div>
          </div>
          <div className="chat-history-messages">
            {messages.length === 0 ? (
              <div className="chat-empty-message">
                no messages yet
              </div>
            ) : (
              // Reverse the messages array to maintain chronological order with column-reverse flex
              [...messages].reverse().map(msg => (
                <div key={msg.id} className={`chat-message ${msg.sender}`}>
                  <div className="chat-message-content">
                    {msg.content}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 