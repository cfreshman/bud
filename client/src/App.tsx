import React, { useState, useEffect, useRef } from 'react'
import { ViewEngine } from './engine/ViewEngine'
import { Editor } from './components/Editor'
import { Greenhouse } from './components/Greenhouse'
import { ChatView } from './components/ChatView'
import { LoginView } from './components/LoginView'
import { PlantData } from './engine/types'
import { serializePlantData, deserializePlantData } from './utils/plantSaveUtils'
import { deleteMessagesForPlot } from './utils/chatStorage'
import { isLoggedIn, getToken } from './services/auth'
import { loadPlants, savePlant, deletePlant } from './services/plants'
import { LoadingScreen } from './components/LoadingScreen'
import { MobileView } from './components/MobileView'
import { API_URL } from './config'
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
  const [sharedBudClaimed, setSharedBudClaimed] = useState(false)
  const viewEngineRef = useRef<ViewEngine | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [username, setUsername] = useState('')
  const [receivedPlot, setReceivedPlot] = useState<number | null>(null)

  // Check auth state on mount
  useEffect(() => {
    const checkAuth = async () => {
      setIsAuthChecking(true)
      const loggedIn = isLoggedIn()
      setIsAuthenticated(loggedIn)
      if (loggedIn) {
        // Get username from localStorage
        const storedUsername = localStorage.getItem('username')
        if (storedUsername) {
          setUsername(storedUsername)
        }
      }
      setIsAuthChecking(false)
    }
    checkAuth()
  }, [])

  // Clear received plant notification after 1 minute
  useEffect(() => {
    if (receivedPlot !== null) {
      const timeout = setTimeout(() => {
        setReceivedPlot(null)
      }, 60000) // 1 minute
      return () => clearTimeout(timeout)
    }
  }, [receivedPlot])

  // Update shared plant handling to set receivedPlot
  useEffect(() => {
    const checkSharedPlant = async () => {
      const path = window.location.pathname
      const match = path.match(/^\/shared\/([a-zA-Z0-9]+)$/)
      if (match && isAuthenticated) {
        const shareId = match[1]
        try {
          const response = await fetch(`${API_URL}/plants/shared/${shareId}`, {
            headers: {
              'Authorization': `Bearer ${getToken()}`
            }
          })
          const data = await response.json()

          // If user is opening their own share link, just remove the share ID from URL
          if (data.message === 'own plant') {
            window.history.replaceState({}, '', '/')
            return
          }

          if (!response.ok) {
            console.error('Failed to get shared plant:', data.message)
            return
          }

          // Add the shared plant to state
          const plantData = deserializePlantData(data.serializedPlant)
          setPlants(prev => new Map(prev).set(data.plotIndex, plantData))
          if (!isMobile) {
            setReceivedPlot(data.plotIndex)
          } else {
            setSharedBudClaimed(true)
          }

          // Remove share ID from URL
          window.history.replaceState({}, '', '/')
        } catch (error) {
          console.error('Failed to get shared plant:', error)
        }
      }
    }
    checkSharedPlant()
  }, [isAuthenticated, isMobile])

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

        // Load active chat state if it exists
        const chatStateStr = localStorage.getItem('chat_state')
        console.log('Chat state from storage:', chatStateStr)
        
        if (chatStateStr) {
          try {
            const chatState = JSON.parse(chatStateStr)
            console.log('Parsed chat state:', chatState)
            console.log('Has plant?', savedPlants.has(chatState.plotIndex))
            
            if (savedPlants.has(chatState.plotIndex)) {
              console.log('Restoring chat for plot:', chatState.plotIndex)
              setSelectedPlot(chatState.plotIndex)
              setIsChatting(true)
            }
          } catch (error) {
            console.error('Failed to load chat state:', error)
            localStorage.removeItem('chat_state')
          }
        }

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
      } catch (error) {
        console.error('Failed to load plants:', error)
      } finally {
        setIsLoading(false)
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
      const state = { plotIndex: selectedPlot }
      console.log('Saving chat state:', state)
      localStorage.setItem('chat_state', JSON.stringify(state))
    }
  }, [isChatting, selectedPlot])

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSelectPlot = (plotIndex: number) => {
    if (plotIndex === receivedPlot) {
      setReceivedPlot(null)
    }
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
    if (plotIndex === receivedPlot) {
      setReceivedPlot(null)
    }
    console.log('Starting chat for plot:', plotIndex)
    if (!plants.has(plotIndex)) {
      console.log('No plant found for plot:', plotIndex)
      return
    }
    
    setSelectedPlot(plotIndex)
    setIsChatting(true)
    console.log('Chat started for plot:', plotIndex)
  }

  const handleCloseChat = () => {
    console.log('Closing chat')
    localStorage.removeItem('chat_state')
    setIsChatting(false)
    setSelectedPlot(null)
  }

  const handleSavePlant = async (plantData: PlantData) => {
    if (selectedPlot === null) return
    
    try {
      // Save to cloud
      await savePlant(selectedPlot, plantData)
      
      // Update local state
      setPlants(prev => new Map(prev).set(selectedPlot, plantData))
      
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
    setUsername('')
    setPlants(new Map())
    setSelectedPlot(null)
    setIsEditing(false)
    setIsChatting(false)
    setActiveEditingPlant(undefined)
    localStorage.clear() // Clear all plant and chat data
  }

  const handleLogin = (newUsername: string) => {
    setIsAuthenticated(true)
    setUsername(newUsername)
    localStorage.setItem('username', newUsername)
  }

  if (isMobile) {
    if (isAuthChecking || isLoading) {
      return <LoadingScreen />;
    }
    if (!isAuthenticated) {
      return <LoginView onLogin={handleLogin} />;
    }
    return <MobileView 
      sharedBudClaimed={sharedBudClaimed} 
      onLogout={handleLogout}
      username={username}
    />;
  }

  return (
    <div className="app">
      {isAuthChecking || isLoading ? (
        <LoadingScreen />
      ) : !isAuthenticated ? (
        <LoginView onLogin={handleLogin} />
      ) : isMobile ? (
        <MobileView 
          sharedBudClaimed={sharedBudClaimed} 
          onLogout={handleLogout}
          username={username}
        />
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
          plotIndex={selectedPlot}
          onClose={handleCloseChat} 
        />
      ) : (
        <Greenhouse 
          plants={plants}
          onSelectPlot={handleSelectPlot}
          onStartChat={handleStartChat}
          onLogout={handleLogout}
          onPlantsChange={setPlants}
          receivedPlot={receivedPlot}
        />
      )}
    </div>
  )
}

export default App

