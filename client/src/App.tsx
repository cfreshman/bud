import React, { useState, useRef, useEffect } from 'react'
import { Greenhouse } from './components/Greenhouse'
import { Editor } from './components/Editor'
import { ViewEngine } from './engine/ViewEngine'
import { PlantData } from './engine/types'
import { serializePlantData, deserializePlantData } from './utils/plantSaveUtils'
import './App.css'

function App() {
  const [selectedPlot, setSelectedPlot] = useState<number | null>(null)
  const [plants, setPlants] = useState<Map<number, PlantData>>(() => {
    // Initialize plants from localStorage on mount
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
      console.log('Initializing plants state with:', savedPlants.size, 'plants')
      return savedPlants
    } catch (error) {
      console.error('Failed to initialize plants:', error)
      return new Map()
    }
  })
  const [isEditing, setIsEditing] = useState(false)
  const [activeEditingPlant, setActiveEditingPlant] = useState<PlantData | undefined>()
  const viewEngineRef = useRef<ViewEngine | null>(null)

  // Load saved state on mount
  useEffect(() => {
    try {
      // Load active editing state
      const activeEditingStr = localStorage.getItem('active_editing_state')
      if (activeEditingStr) {
        const activeState = JSON.parse(activeEditingStr)
        setSelectedPlot(activeState.selectedPlot)
        setIsEditing(activeState.isEditing)
        if (activeState.plantData) {
          try {
            const plantData = deserializePlantData(activeState.plantData)
            setActiveEditingPlant(plantData)
          } catch (error) {
            console.error('Failed to load active editing plant:', error)
          }
        }
      }
    } catch (error) {
      console.error('Failed to load saved state:', error)
    }
  }, [])

  // Save plants whenever they change
  useEffect(() => {
    try {
      console.log('Saving plants, count:', plants.size, 'plants:', Array.from(plants.keys()))
      
      // Save each occupied plot
      for (const [plotIndex, plantData] of plants.entries()) {
        try {
          const serialized = serializePlantData(plantData)
          console.log(`Saving plot ${plotIndex}:`, {
            parts: plantData.parts.size,
            bones: plantData.bones.size,
            bodies: plantData.bodies.size,
            roots: plantData.roots.size,
            serializedLength: serialized.length
          })
          localStorage.setItem(`greenhouse_plot_${plotIndex}`, serialized)
        } catch (error) {
          console.error(`Failed to save plot ${plotIndex}:`, error)
        }
      }

      // Clear empty plots
      for (let i = 0; i < 6; i++) {
        if (!plants.has(i)) {
          localStorage.removeItem(`greenhouse_plot_${i}`)
        }
      }
    } catch (error) {
      console.error('Failed to save plants:', error)
    }
  }, [plants])

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

    // Update plants Map
    const newPlants = new Map(plants)
    newPlants.set(selectedPlot, plantData)
    setPlants(newPlants)
    
    // Clear editing state
    setSelectedPlot(null)
    setIsEditing(false)
    setActiveEditingPlant(undefined)
  }

  const handleCancelEdit = () => {
    setSelectedPlot(null)
    setIsEditing(false)
    setActiveEditingPlant(undefined)
  }

  const handleDeletePlant = () => {
    if (selectedPlot === null) return
    
    // Remove from plants Map
    const newPlants = new Map(plants)
    newPlants.delete(selectedPlot)
    setPlants(newPlants)
    
    // Clear editing state
    setSelectedPlot(null)
    setIsEditing(false)
    setActiveEditingPlant(undefined)
  }

  return (
    <div className="app">
      <div className="main-view">
        {isEditing ? (
          <Editor 
            plantData={activeEditingPlant}
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

