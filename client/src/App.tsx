import React, { useState, useEffect, useRef } from 'react'
import { ViewEngine } from './engine/ViewEngine'
import { Editor } from './components/Editor'
import { Greenhouse } from './components/Greenhouse'
import { ChatView } from './components/ChatView'
import { PlantData } from './engine/types'
import { serializePlantData, deserializePlantData } from './utils/plantSaveUtils'
import { deleteMessagesForPlot } from './utils/chatStorage'
import './App.css'

function App() {
  const [selectedPlot, setSelectedPlot] = useState<number | null>(null)
  const [plants, setPlants] = useState<Map<number, PlantData>>(new Map())
  const [isEditing, setIsEditing] = useState(false)
  const [isChatting, setIsChatting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [activeEditingPlant, setActiveEditingPlant] = useState<PlantData | undefined>()
  const viewEngineRef = useRef<ViewEngine | null>(null)

  // Load plants from localStorage on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      
      try {
        const savedPlants = new Map<number, PlantData>()
        for (let i = 0; i < 6; i++) {
          const savedPlantStr = localStorage.getItem(`greenhouse_plot_${i}`)
          if (savedPlantStr) {
            try {
              const plantData = deserializePlantData(savedPlantStr)
              // Re-save if we generated a new ID
              if (!savedPlantStr.includes('"plantId"')) {
                localStorage.setItem(`greenhouse_plot_${i}`, serializePlantData(plantData))
              }
              savedPlants.set(i, plantData)
            } catch (error) {
              console.error(`Failed to load plot ${i}:`, error)
            }
          }
        }
        console.log('Loading plants from localStorage:', savedPlants.size, 'plants')
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
        // Add a small delay to ensure the loading screen is visible
        // even if loading is very fast
        setTimeout(() => {
          setIsLoading(false)
        }, 800)
      }
    }
    
    loadData()
  }, [])

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

  const handleSavePlant = (plantData: PlantData) => {
    if (selectedPlot === null) return
    
    try {
      // Save to localStorage first
      localStorage.setItem(`greenhouse_plot_${selectedPlot}`, serializePlantData(plantData))
      
      // Then update plants Map
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

  const handleDeletePlant = () => {
    if (selectedPlot === null) return
    
    // Delete chat messages for this plot
    deleteMessagesForPlot(selectedPlot)
    
    // Remove plant from localStorage
    localStorage.removeItem(`greenhouse_plot_${selectedPlot}`)
    
    // Update state
    setPlants(prev => {
      const newPlants = new Map(prev)
      newPlants.delete(selectedPlot)
      return newPlants
    })
    
    // Exit edit mode
    setIsEditing(false)
    setSelectedPlot(null)
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
        />
      )}
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-text">bud 🌱</div>
    </div>
  )
}

export default App

