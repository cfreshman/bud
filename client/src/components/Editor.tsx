import { useEffect, useRef, useState } from 'react'
import { BudEngine } from '../engine/BudEngine'
import { PlantData } from '../engine/types'
import { EditPanel } from './EditPanel'
import { EditableProperties } from '../types'
import { serializePlantData, deserializePlantData } from '../utils/plantSaveUtils'
import { Star } from '@phosphor-icons/react'
import { getStarCounts, StarCounts } from '../services/api'
import { updateStars } from '../services/api'

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
  const originalPartCountRef = useRef(0)
  const starsRef = useRef<StarCounts>({ totalStars: 0, currentStars: 0 })
  const [selectedPart, setSelectedPart] = useState<EditableProperties | null>(null)
  const [stars, setStars] = useState<StarCounts>({ totalStars: 0, currentStars: 0 })
  const [displayStars, setDisplayStars] = useState<StarCounts>({ totalStars: 0, currentStars: 0 })
  const [error, setError] = useState<string>('')

  // Update starsRef when stars state changes
  useEffect(() => {
    starsRef.current = stars
    setDisplayStars(stars)
  }, [stars])

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

  // Load active editing state if it exists
  useEffect(() => {
    const editorStateStr = localStorage.getItem('editor_plant_state')
    if (editorStateStr) {
      try {
        const editorState = JSON.parse(editorStateStr)
        originalPartCountRef.current = editorState.originalPartCount || 0
      } catch (error) {
        console.error('Failed to load editor state:', error)
        localStorage.removeItem('editor_plant_state')
      }
    }
  }, [])

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
        },
        onPartCountChange: (totalCount) => {
          const delta = totalCount - originalPartCountRef.current
          const needed = starsRef.current.currentStars - delta
          console.log({ delta, needed })

          // Update display stars to show projected count
          setDisplayStars({
            totalStars: starsRef.current.totalStars,
            currentStars: starsRef.current.currentStars - delta
          })

          if (needed < 0) {
            setError(`not enough stars (need ${-needed} more)`)
            engineRef.current?.hidePartPreviews()
          } else if (needed === 0) {
            setError('')
            engineRef.current?.hidePartPreviews()
          } else {
            setError('')
            engineRef.current?.showPartPreviews()
          }
        }
      })
    }

    // Always set the provided plant data when it changes
    if (engineRef.current && plantData) {
      engineRef.current.setPlantData(plantData)
      // Need to wait a frame for the plant to render before getting count
      requestAnimationFrame(() => {
        const initialCount = engineRef.current?.getCurrentPartCount() || 0
        originalPartCountRef.current = initialCount
        
        // Save initial state with original part count
        const editorState = {
          plotIndex,
          plantData: serializePlantData(plantData),
          originalPartCount: initialCount
        }
        localStorage.setItem('editor_plant_state', JSON.stringify(editorState))
      })
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

  // Auto-save effect with delta validation
  useEffect(() => {
    const saveEngineState = () => {
      if (engineRef.current && !engineRef.current.isDisposed()) {
        const currentState = engineRef.current.getPlantData()
        
        const editorState = {
          plotIndex,
          plantData: serializePlantData(currentState),
          originalPartCount: originalPartCountRef.current
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

  // Remove the validation effect since we're using the callback now
  useEffect(() => {
    if (!engineRef.current || engineRef.current.isDisposed()) return

    const wasPartAdded = engineRef.current.wasPartAdded()
    if (wasPartAdded) {
      const currentCount = engineRef.current.getCurrentPartCount()
      const delta = currentCount - originalPartCountRef.current
      setStars(prev => ({
        ...prev,
        currentStars: prev.currentStars - delta
      }))
    }
  }, [selectedPart])

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
  const handleSave = async () => {
    if (!engineRef.current || engineRef.current.isDisposed()) return
    const currentState = engineRef.current.getPlantData()
    
    // Calculate star cost delta
    const currentCount = engineRef.current.getCurrentPartCount()
    const delta = currentCount - originalPartCountRef.current
    if (delta > stars.currentStars) {
      setError(`not enough stars (need ${delta}, have ${stars.currentStars})`)
      return
    }
    setError('')

    // Update stars on server - negative delta since we're using stars
    try {
      await updateStars(-delta)
    } catch (error) {
      console.error('Failed to update stars:', error)
      return
    }
    
    // Filter out bodies not on the main pot
    const validRoots = Array.from(currentState.roots).filter(rootId => {
      const body = Array.from(currentState.bodies.values())
        .find(b => b.rootPartId === rootId)
      return body && engineRef.current?.isBodyOnMainPot(body)
    })
    
    const newPlantData = {
      ...currentState,
      parts: new Map(currentState.parts),
      bones: new Map(currentState.bones),
      bodies: new Map(currentState.bodies),
      roots: new Set(validRoots),
      isCarried: plantData?.isCarried || false
    }

    // Clear editor state before saving to greenhouse
    localStorage.removeItem('editor_plant_state')
    onSave(newPlantData)
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
        <div className="star-count">
          <Star weight="fill" />
          {displayStars.currentStars}/{displayStars.totalStars}
        </div>
        <button 
          className="control-button save" 
          onClick={handleSave}
          disabled={error !== ''}
        >
          {error || 'save'}
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