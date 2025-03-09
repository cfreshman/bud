import React, { useState, useEffect, useRef } from 'react'
import { ViewEngine } from './engine/ViewEngine'
import { Editor } from './components/Editor'
import { Greenhouse } from './components/Greenhouse'
import { ChatView } from './components/ChatView'
import { LoginView } from './components/LoginView'
import { PlantData } from './engine/types'
import { serializePlantData, deserializePlantData } from './utils/plantSaveUtils'
import { deleteMessagesForPlot } from './utils/chatStorage'
import { isLoggedIn } from './services/auth'
import { loadPlants, savePlant, deletePlant } from './services/plants'
import './App.css'

function App() {
  const [selectedPlot, setSelectedPlot] = useState<number | null>(null)
  const [plants, setPlants] = useState<Map<number, PlantData>>(new Map())
  const [isEditing, setIsEditing] = useState(false)
  const [isChatting, setIsChatting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthChecking, setIsAuthChecking] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [activeEditingPlant, setActiveEditingPlant] = useState<PlantData | undefined>()
  const viewEngineRef = useRef<ViewEngine | null>(null)

  // Check auth state on mount
  useEffect(() => {
    const checkAuth = async () => {
      setIsAuthChecking(true)
      setIsAuthenticated(isLoggedIn())
      setIsAuthChecking(false)
    }
    checkAuth()
  }, [])

  // Load plants from cloud when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false)
      return
    }

    const loadData = async () => {
      setIsLoading(true)
      
      try {
        const savedPlants = await loadPlants()
        setPlants(savedPlants)

        // Load active editing state if it exists
        const editorStateStr = localStorage.getItem('editor_plant_state')
        if (editorStateStr) {
          try {
            const editorState = JSON.parse(editorStateStr)
            const plantData = deserializePlantData(editorState.plantData)
            setActiveEditingPlant(plantData)
            setSelectedPlot(editorState.plotIndex)
            setIsEditing(true)
          } catch (error) {
            console.error('Failed to load editor state:', error)
            localStorage.removeItem('editor_plant_state')
          }
        }
        
        // Load active chat state if it exists
        const chatStateStr = localStorage.getItem('chat_state')
        if (chatStateStr && !isEditing) {
          try {
            const chatState = JSON.parse(chatStateStr)
            const plotIndex = chatState.plotIndex
            
            // Only restore chat if the plant exists
            if (savedPlants.has(plotIndex)) {
              setSelectedPlot(plotIndex)
              setIsChatting(true)
            } else {
              // Clean up invalid chat state
              localStorage.removeItem('chat_state')
            }
          } catch (error) {
            console.error('Failed to load chat state:', error)
            localStorage.removeItem('chat_state')
          }
        }
      } catch (error) {
        console.error('Failed to load plants:', error)
      } finally {
        setTimeout(() => {
          setIsLoading(false)
        }, 800)
      }
    }
    
    loadData()
  }, [isAuthenticated])

  // Reload plants when returning from editor
  useEffect(() => {
    if (!isEditing && isAuthenticated && !isLoading) {
      const reloadPlants = async () => {
        try {
          const savedPlants = await loadPlants()
          setPlants(savedPlants)
        } catch (error) {
          console.error('Failed to reload plants:', error)
        }
      }
      reloadPlants()
    }
  }, [isEditing, isAuthenticated, isLoading])

  // Save chat state whenever it changes
  useEffect(() => {
    if (isChatting && selectedPlot !== null) {
      localStorage.setItem('chat_state', JSON.stringify({ plotIndex: selectedPlot }))
    } else {
      localStorage.removeItem('chat_state')
    }
  }, [isChatting, selectedPlot])

  const handleSelectPlot = (plotIndex: number) => {
    // Get plant data from plants Map
    const plantData = plants.get(plotIndex)
    
    console.log('Selecting plot:', plotIndex, plantData ? {
      parts: plantData.parts.size,
      bones: plantData.bones.size,
      bodies: plantData.bodies.size,
      roots: plantData.roots.size
    } : 'empty')
    
    setSelectedPlot(plotIndex)
    setIsEditing(true)
    setActiveEditingPlant(plantData)
  }
  
  const handleStartChat = (plotIndex: number) => {
    if (!plants.has(plotIndex)) return
    
    setSelectedPlot(plotIndex)
    setIsChatting(true)
  }

  const handleCloseChat = () => {
    setIsChatting(false)
    setSelectedPlot(null)
  }

  const handleSavePlant = async (plantData: PlantData) => {
    if (selectedPlot === null) return
    
    try {
      // Save to cloud
      await savePlant(selectedPlot, plantData)
      
      // Update local state
      const newPlants = new Map(plants)
      newPlants.set(selectedPlot, plantData)
      setPlants(newPlants)
      
      // Clear editing state
      setSelectedPlot(null)
      setIsEditing(false)
      setActiveEditingPlant(undefined)
    } catch (error) {
      console.error('Failed to save plant:', error)
    }
  }

  const handleCancelEdit = () => {
    // Clear editing state
    setSelectedPlot(null)
    setIsEditing(false)
    setActiveEditingPlant(undefined)
  }

  const handleDeletePlant = async () => {
    if (selectedPlot === null) return
    
    try {
      // Delete from cloud
      await deletePlant(selectedPlot)
      
      // Delete chat messages
      deleteMessagesForPlot(selectedPlot)
      
      // Update local state
      setPlants(prev => {
        const newPlants = new Map(prev)
        newPlants.delete(selectedPlot)
        return newPlants
      })
      
      // Exit edit mode
      setIsEditing(false)
      setSelectedPlot(null)
    } catch (error) {
      console.error('Failed to delete plant:', error)
    }
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setPlants(new Map())
    setSelectedPlot(null)
    setIsEditing(false)
    setIsChatting(false)
    setActiveEditingPlant(undefined)
    localStorage.clear() // Clear all plant and chat data
  }

  if (isAuthChecking) {
    return <LoadingScreen />
  }

  if (!isAuthenticated) {
    return <LoginView onLogin={() => setIsAuthenticated(true)} />
  }

  return (
    <div className="app">
      {isLoading ? (
        <LoadingScreen />
      ) : isEditing ? (
        <Editor 
          plantData={activeEditingPlant}
          plotIndex={selectedPlot || 0}
          onSave={handleSavePlant}
          onCancel={handleCancelEdit}
          onDelete={handleDeletePlant}
        />
      ) : isChatting && selectedPlot !== null && plants.has(selectedPlot) ? (
        <ChatView 
          plant={plants.get(selectedPlot)!} 
          onClose={handleCloseChat} 
        />
      ) : (
        <Greenhouse 
          plants={plants}
          onSelectPlot={handleSelectPlot}
          onStartChat={handleStartChat}
          onLogout={handleLogout}
        />
      )}
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-text">bud 🌱 loading</div>
    </div>
  )
}

export default App

