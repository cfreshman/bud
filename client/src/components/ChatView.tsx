import { useEffect, useRef, useState } from 'react'
import { PlantData } from '../engine/types'
import { ChatEngine, Message } from '../engine/ChatEngine'
import { sendMessageToPlant } from '../services/api'
import { loadMessages, saveMessages, clearMessages } from '../utils/chatStorage'

interface ChatViewProps {
  plant: PlantData
  onClose: () => void
}

export function ChatView({ plant, onClose }: ChatViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [chatEngine, setChatEngine] = useState<ChatEngine>()
  const [input, setInput] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Load messages from localStorage when component mounts
  useEffect(() => {
    if (!plant.plantId) return
    
    const savedMessages = loadMessages(plant.plantId)
    setMessages(savedMessages)
    
    // Add saved messages to chat engine when it's initialized
    if (chatEngine && savedMessages.length > 0) {
      savedMessages.forEach(msg => {
        if (msg.sender === 'plant') {
          chatEngine.addMessage(plant.plantId!, msg.content, 'plant')
        }
      })
    }
  }, [plant.plantId, chatEngine])

  // Save messages to localStorage when they change
  useEffect(() => {
    if (!plant.plantId || messages.length === 0) return
    saveMessages(plant.plantId, messages)
  }, [plant.plantId, messages])

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
    
    // Add user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      plantId: plant.plantId,
      content: input,
      sender: 'user',
      timestamp: Date.now()
    }
    
    // Clear input and reset textarea height
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      // Get plant's response from API
      const plantResponse = await sendMessageToPlant(plant.plantId, input, plant)
      
      // Add plant message
      const plantMessage = chatEngine.addMessage(plant.plantId, plantResponse, 'plant')
      setMessages(prev => [...prev, userMessage, plantMessage])
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
      setMessages(prev => [...prev, userMessage, fallbackMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleClearHistory = () => {
    if (!plant.plantId || !chatEngine) return
    
    // Clear messages in localStorage
    clearMessages(plant.plantId)
    
    // Clear messages in state
    setMessages([])
    
    // Clear any visible speech bubble
    if (plant.plantId) {
      chatEngine.addMessage(plant.plantId, '', 'plant')
    }
    
    // Close history overlay
    setShowHistory(false)
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
            {messages.map(msg => (
              <div key={msg.id} className={`chat-message ${msg.sender}`}>
                <div className="chat-message-content">
                  {msg.content}
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="chat-empty-message">
                no messages yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 