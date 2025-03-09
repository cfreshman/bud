import { useEffect, useRef, useState } from 'react'
import { PlantData } from '../engine/types'
import { ChatEngine, Message } from '../engine/ChatEngine'
import { sendMessageToPlant } from '../services/api'

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
    if (!chatEngine || !input.trim() || !plant.plantId) return

    // Add user message
    const userMessage = chatEngine.addMessage(plant.plantId, input, 'user')
    setMessages(prev => [...prev, userMessage])
    
    // Clear input and reset textarea height
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    // Show loading state
    setIsLoading(true)

    try {
      // Get plant's response from API
      const plantResponse = await sendMessageToPlant(plant.plantId, input, plant)
      
      // Add plant message
      const plantMessage = chatEngine.addMessage(plant.plantId, plantResponse, 'plant')
      setMessages(prev => [...prev, plantMessage])
    } catch (error) {
      console.error('Error getting plant response:', error)
      // Add fallback message if API fails
      const fallbackResponse = "I'm having trouble understanding right now."
      chatEngine.addMessage(plant.plantId, fallbackResponse, 'plant')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Allow shift+enter for new line
        return
      }
      
      e.preventDefault()
      handleSend()
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
          disabled={isLoading}
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
            <button 
              className="chat-history-close"
              onClick={() => setShowHistory(false)}
            >
              ×
            </button>
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