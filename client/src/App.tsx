import { useEffect, useRef, useState } from 'react'
import { BudEngine } from './engine/BudEngine'
import { EditPanel } from './components/EditPanel'
import { Status } from './components/Status'
import { EditableProperties } from './types'
import './App.css'

declare global {
  interface Window {
    budEngine?: BudEngine
  }
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<BudEngine | null>(null)
  const [selected, setSelected] = useState<EditableProperties | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    
    // Only create engine if it doesn't exist
    if (!engineRef.current) {
      engineRef.current = new BudEngine(containerRef.current, {
        onSelect: (data) => {
          if (!data.length || !data.width) return
          setSelected({
            id: data.id,
            type: data.type,
            position: data.position,
            color: data.color || '',
            length: data.length,
            width: data.width,
            theta: data.theta,
            phi: data.phi,
            twist: data.twist
          })
        },
        onDeselect: () => setSelected(null)
      })
      window.budEngine = engineRef.current
    }

    // No cleanup needed - we want to keep the engine instance
  }, [])

  const handleUpdateProperties = (id: string, updates: Partial<EditableProperties>) => {
    if (!engineRef.current) return
    engineRef.current.updateProperties(id, updates)
    
    // Update selected state with new properties
    setSelected(prev => {
      if (!prev || prev.id !== id) return prev
      return {
        ...prev,
        ...updates,
        // Handle special case for clearing color
        color: updates.color === 'none' ? '' : (updates.color || prev.color)
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
        selected={selected}
        onUpdateProperties={handleUpdateProperties}
        onGrowStem={handleGrowStem}
        onShrinkStem={handleShrinkStem}
      />
      <Status />
    </div>
  )
}

export default App

