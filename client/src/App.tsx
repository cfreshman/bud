import { useEffect, useRef, useState } from 'react'
import { BudEngine, PartType } from './engine/BudEngine'
import { EditPanel } from './components/EditPanel'
import { Status } from './components/Status'
import './App.css'

declare global {
  interface Window {
    budEngine?: BudEngine
  }
}

type SelectedPart = {
  id: string
  type: PartType
  position: [number, number, number]
  color: string
  length: number
  width: number
} | null

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<BudEngine | null>(null)
  const [selectedPart, setSelectedPart] = useState<SelectedPart>(null)

  useEffect(() => {
    if (!containerRef.current) return
    
    // Only create engine if it doesn't exist
    if (!engineRef.current) {
      engineRef.current = new BudEngine(containerRef.current, {
        onSelect: (data) => {
          if (!data.length || !data.width) return
          setSelectedPart({
            id: data.id,
            type: data.type,
            position: data.position,
            color: data.color || '',
            length: data.length,
            width: data.width
          })
        },
        onDeselect: () => setSelectedPart(null)
      })
      window.budEngine = engineRef.current
    }

    // No cleanup needed - we want to keep the engine instance
  }, [])

  const handleUpdateAttributes = (id: string, attributes: { color?: string, length?: number, width?: number }) => {
    if (!engineRef.current) return
    engineRef.current.updateBoneAttributes(id, attributes)
    
    // Update selectedPart state with new attributes
    setSelectedPart(prev => {
      if (!prev || prev.id !== id) return prev
      return {
        ...prev,
        ...attributes,
        // Handle special case for clearing color
        color: attributes.color === 'none' ? '' : (attributes.color || prev.color)
      }
    })
  }

  const handleGrowStem = (id: string) => {
    if (!engineRef.current) return
    console.log('App: Growing stem', { id })
    engineRef.current.growStemPart(id)
  }

  const handleShrinkStem = (id: string) => {
    if (!engineRef.current) return
    console.log('App: Shrinking stem', { id })
    engineRef.current.shrinkStemPart(id)
  }

  return (
    <div className="app">
      <div ref={containerRef} className="canvas-container" />
      <EditPanel 
        selectedPart={selectedPart}
        onUpdateAttributes={handleUpdateAttributes}
        onGrowStem={handleGrowStem}
        onShrinkStem={handleShrinkStem}
      />
      <Status />
    </div>
  )
}

export default App

