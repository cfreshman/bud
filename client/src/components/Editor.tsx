import { useEffect, useRef, useState } from 'react'
import { BudEngine } from '../engine/BudEngine'
import { PlantData, PartType } from '../engine/types'
import { EditPanel } from './EditPanel'
import { EditableProperties } from '../types'
import { serializePlantData, deserializePlantData } from '../utils/plantSaveUtils'

interface EditorProps {
  plantData?: PlantData
  plotIndex: number
  onSave: (plantData: PlantData) => void
  onCancel: () => void
  onDelete: () => void
}

export function Editor({ plantData, plotIndex, onSave, onCancel, onDelete }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<BudEngine | null>(null)
  const cleanupRef = useRef(false)
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

    // Always set the provided plant data when it changes
    if (engineRef.current && plantData) {
      engineRef.current.setPlantData(plantData)
    }

    return () => {
      // Prevent double cleanup in React dev mode
      if (cleanupRef.current) return
      cleanupRef.current = true

      // Only dispose if engine exists and hasn't been disposed
      if (engineRef.current && !engineRef.current.isDisposed()) {
        try {
          engineRef.current.dispose()
        } catch (error) {
          console.warn('Error during BudEngine disposal:', error)
        }
        engineRef.current = null
      }
    }
  }, [plantData]) // Depend on plantData to update when it changes

  // Auto-save engine state whenever it changes
  useEffect(() => {
    const saveEngineState = () => {
      if (engineRef.current && !engineRef.current.isDisposed()) {
        const currentState = engineRef.current.getPlantData()
        const editorState = {
          plotIndex,
          plantData: serializePlantData(currentState)
        }
        localStorage.setItem('editor_plant_state', JSON.stringify(editorState))
      }
    }

    // Save every second if engine exists
    const interval = setInterval(saveEngineState, 1000)

    return () => {
      clearInterval(interval)
      // Only clear editor state if we're actually leaving the editor
      // (not just from the interval cleanup)
      if (engineRef.current && engineRef.current.isDisposed()) {
        localStorage.removeItem('editor_plant_state')
      }
    }
  }, [plotIndex])

  // Handle property updates
  const handlePropertyChange = (id: string, updates: Partial<EditableProperties>) => {
    if (!engineRef.current || engineRef.current.isDisposed()) return

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
    if (!engineRef.current || engineRef.current.isDisposed()) return
    engineRef.current.growStemPart(id)
  }

  // Handle stem shrink
  const handleShrinkStem = (id: string) => {
    if (!engineRef.current || engineRef.current.isDisposed()) return
    engineRef.current.shrinkStemPart(id)
  }

  // Handle part deletion
  const handleDeletePart = (id: string) => {
    if (!engineRef.current || engineRef.current.isDisposed()) return
    engineRef.current.deletePart(id)
  }

  // Handle part cloning
  const handleClonePart = (id: string) => {
    if (!engineRef.current || engineRef.current.isDisposed()) return
    engineRef.current.clonePart(id)
  }

  // Handle applying properties to all parts of same type
  const handleApplyToAll = (id: string) => {
    if (!engineRef.current || engineRef.current.isDisposed()) return
    engineRef.current.applyPropertiesToAllOfType(id)
  }

  // Handle fitting camera to plant
  const handleFitView = () => {
    if (!engineRef.current || engineRef.current.isDisposed()) return
    engineRef.current.fitCameraToPlant()
  }

  // Handle final save
  const handleSave = () => {
    if (!engineRef.current || engineRef.current.isDisposed()) return
    const plantData = engineRef.current.getPlantData()
    // Clear editor state before saving to greenhouse
    localStorage.removeItem('editor_plant_state')
    onSave(plantData)
  }

  // Handle cancel
  const handleCancel = () => {
    // Clear editor state before returning to greenhouse
    localStorage.removeItem('editor_plant_state')
    onCancel()
  }

  // Handle delete
  const handleEditorDelete = () => {
    // Clear editor state before deleting
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