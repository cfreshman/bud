import { useEffect, useRef, useState } from 'react'
import { BudEngine } from '../engine/BudEngine'
import { PlantData, PartType } from '../engine/types'
import { EditPanel } from './EditPanel'
import { EditableProperties } from '../types'
import { serializePlantData, deserializePlantData } from '../utils/plantSaveUtils'

interface EditorProps {
  plantData?: PlantData
  onSave: (plantData: PlantData) => void
  onCancel: () => void
  onDelete: () => void
}

export function Editor({ plantData, onSave, onCancel, onDelete }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<BudEngine | null>(null)
  const [selectedPart, setSelectedPart] = useState<EditableProperties | null>(null)
  
  useEffect(() => {
    if (!containerRef.current) return
    
    // Only create engine if it doesn't exist
    if (!engineRef.current) {
      engineRef.current = new BudEngine(containerRef.current, {
        onSelect: (data) => {
          setSelectedPart({
            id: data.id,
            type: data.type,
            color: data.color || '#44aa44',
            length: data.length,
            width: data.width,
            theta: data.theta || 0,
            phi: data.phi || 0,
            twist: data.twist || 0
          })
        },
        onDeselect: () => {
          setSelectedPart(null)
        }
      })
    }

    // Load plant data if provided
    if (plantData) {
      engineRef.current.setPlantData(plantData)
    }

    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [])

  // Auto-save engine state whenever it changes
  useEffect(() => {
    const saveEngineState = () => {
      if (engineRef.current) {
        const currentState = engineRef.current.getPlantData()
        localStorage.setItem('editor_plant_state', serializePlantData(currentState))
      }
    }

    // Save every second if engine exists
    const interval = setInterval(saveEngineState, 1000)

    return () => clearInterval(interval)
  }, [])

  // Load saved engine state on mount
  useEffect(() => {
    const savedState = localStorage.getItem('editor_plant_state')
    if (savedState && engineRef.current) {
      try {
        const state = deserializePlantData(savedState)
        engineRef.current.setPlantData(state)
      } catch (error) {
        console.error('Failed to load editor state:', error)
      }
    }
  }, [])

  // Handle property updates
  const handlePropertyChange = (id: string, updates: Partial<EditableProperties>) => {
    if (!engineRef.current) return

    // Update the engine
    engineRef.current.updateProperties(id, updates)
    
    // Update local state to reflect changes
    if (selectedPart && selectedPart.id === id) {
      setSelectedPart({
        ...selectedPart,
        ...updates
      })
    }
  }

  // Handle stem growth
  const handleGrowStem = (id: string) => {
    if (!engineRef.current) return
    engineRef.current.growStemPart(id)
  }

  // Handle stem shrink
  const handleShrinkStem = (id: string) => {
    if (!engineRef.current) return
    engineRef.current.shrinkStemPart(id)
  }

  // Handle part deletion
  const handleDeletePart = (id: string) => {
    if (!engineRef.current) return
    engineRef.current.deletePart(id)
    
    const updatedPlantData = engineRef.current.getPlantData()
    onSave(updatedPlantData)
  }

  // Handle part cloning
  const handleClonePart = (id: string) => {
    if (!engineRef.current) return
    engineRef.current.clonePart(id)
  }

  // Handle applying properties to all parts of same type
  const handleApplyToAll = (id: string) => {
    if (!engineRef.current) return
    engineRef.current.applyPropertiesToAllOfType(id)
  }

  // Handle fitting camera to plant
  const handleFitView = () => {
    if (!engineRef.current) return
    engineRef.current.fitCameraToPlant()
  }

  // Handle final save
  const handleSave = () => {
    if (!engineRef.current) return
    const plantData = engineRef.current.getPlantData()
    onSave(plantData)
    localStorage.removeItem('editor_plant_state')
  }

  // Handle cancel
  const handleCancel = () => {
    localStorage.removeItem('editor_plant_state')
    onCancel()
  }

  // Handle delete
  const handleEditorDelete = () => {
    localStorage.removeItem('editor_plant_state')
    onDelete()
  }

  return (
    <div className="editor-container">
      <div 
        ref={containerRef} 
        className="canvas-container"
        style={{ 
          width: '100%', 
          height: '100%',
          backgroundColor: '#111419'
        }} 
      />
      
      <div className="editor-controls">
        <button className="control-button cancel" onClick={handleCancel}>
          cancel
        </button>
        <button className="control-button delete" onClick={handleEditorDelete}>
          delete
        </button>
        <button className="control-button save" onClick={handleSave}>
          save
        </button>
      </div>
      
      <EditPanel
        selected={selectedPart}
        onUpdateProperties={handlePropertyChange}
        onGrowStem={handleGrowStem}
        onShrinkStem={handleShrinkStem}
        onDelete={handleDeletePart}
        onClone={handleClonePart}
        onFitView={handleFitView}
        onApplyToAll={handleApplyToAll}
      />
    </div>
  )
} 