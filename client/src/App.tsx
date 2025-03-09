import React, { useState, useRef, useEffect } from 'react'
import { Greenhouse } from './components/Greenhouse'
import { Editor } from './components/Editor'
import { ViewEngine } from './engine/ViewEngine'
import { PlantData } from './engine/types'
import { serializePlantData, deserializePlantData } from './utils/plantSaveUtils'
import './App.css'

function App() {
  const [selectedPlot, setSelectedPlot] = useState<number | null>(null)
  const [plants, setPlants] = useState<Map<number, PlantData>>(new Map())
  const [isEditing, setIsEditing] = useState(false)
  const [activeEditingPlant, setActiveEditingPlant] = useState<PlantData | undefined>()
  const viewEngineRef = useRef<ViewEngine | null>(null)

  // Load plants from localStorage on mount
  useEffect(() => {
    try {
      const savedPlants = new Map<number, PlantData>()
      for (let i = 0; i < 6; i++) {
        const savedPlantStr = localStorage.getItem(`greenhouse_plot_${i}`)
        if (savedPlantStr) {
          try {
            const plantData = deserializePlantData(savedPlantStr)
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
          setSelectedPlot(editorState.plotIndex)
          setIsEditing(true)
          setActiveEditingPlant(plantData)
        } catch (error) {
          console.error('Failed to load active editing state:', error)
        }
      }
    } catch (error) {
      console.error('Failed to load plants:', error)
    }
  }, [])

  // Save active editing state whenever it changes
  useEffect(() => {
    try {
      if (isEditing && selectedPlot !== null) {
        const activeState = {
          selectedPlot,
          isEditing,
          plantData: activeEditingPlant ? serializePlantData(activeEditingPlant) : undefined
        }
        localStorage.setItem('active_editing_state', JSON.stringify(activeState))
      } else {
        localStorage.removeItem('active_editing_state')
      }
    } catch (error) {
      console.error('Failed to save active editing state:', error)
    }
  }, [isEditing, selectedPlot, activeEditingPlant])

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

  const handleSavePlant = (plantData: PlantData) => {
    if (selectedPlot === null) return
    
    console.log('Saving plant to plot:', selectedPlot, {
      parts: plantData.parts.size,
      bones: plantData.bones.size,
      bodies: plantData.bodies.size,
      roots: plantData.roots.size
    })

    try {
      // Save to localStorage first
      const serialized = serializePlantData(plantData)
      localStorage.setItem(`greenhouse_plot_${selectedPlot}`, serialized)

      // Reload all plants from localStorage to ensure consistency
      const savedPlants = new Map<number, PlantData>()
      for (let i = 0; i < 6; i++) {
        const savedPlantStr = localStorage.getItem(`greenhouse_plot_${i}`)
        if (savedPlantStr) {
          try {
            const plantData = deserializePlantData(savedPlantStr)
            savedPlants.set(i, plantData)
          } catch (error) {
            console.error(`Failed to load plot ${i}:`, error)
          }
        }
      }
      setPlants(savedPlants)
      
      // Clear editing state
      setSelectedPlot(null)
      setIsEditing(false)
      setActiveEditingPlant(undefined)
    } catch (error) {
      console.error('Failed to save plant:', error)
    }
  }

  const handleCancelEdit = () => {
    // Reload the original plant data from localStorage
    if (selectedPlot !== null) {
      try {
        const savedPlantStr = localStorage.getItem(`greenhouse_plot_${selectedPlot}`)
        if (savedPlantStr) {
          const plantData = deserializePlantData(savedPlantStr)
          const newPlants = new Map(plants)
          newPlants.set(selectedPlot, plantData)
          setPlants(newPlants)
        }
      } catch (error) {
        console.error('Failed to reload plant:', error)
      }
    }
    
    // Clear editing state
    setSelectedPlot(null)
    setIsEditing(false)
    setActiveEditingPlant(undefined)
  }

  const handleDeletePlant = () => {
    if (selectedPlot === null) return
    
    try {
      // Remove from localStorage first
      localStorage.removeItem(`greenhouse_plot_${selectedPlot}`)
      
      // Then remove from plants Map
      const newPlants = new Map(plants)
      newPlants.delete(selectedPlot)
      setPlants(newPlants)
      
      // Clear editing state
      setSelectedPlot(null)
      setIsEditing(false)
      setActiveEditingPlant(undefined)
    } catch (error) {
      console.error('Failed to delete plant:', error)
    }
  }

  return (
    <div className="app">
      <div className="main-view">
        {isEditing ? (
          <Editor 
            plantData={activeEditingPlant}
            plotIndex={selectedPlot || 0}
            onSave={handleSavePlant}
            onCancel={handleCancelEdit}
            onDelete={handleDeletePlant}
          />
        ) : (
          <Greenhouse 
            plants={plants}
            onSelectPlot={handleSelectPlot}
          />
        )}
      </div>
    </div>
  )
}

export default App

