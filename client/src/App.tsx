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
        onSelect: (data) => setSelectedPart(data),
        onDeselect: () => setSelectedPart(null)
      })
      window.budEngine = engineRef.current
    }

    return () => {
      if (engineRef.current) {
        // Clean up Three.js resources here
        window.budEngine = undefined
        engineRef.current = null
      }
    }
  }, [])

  const handleUpdateAttributes = (id: string, attributes: { color?: string }) => {
    if (!engineRef.current) return
    engineRef.current.updateBoneAttributes(id, attributes)
  }

  return (
    <div className="app">
      <div ref={containerRef} className="canvas-container" />
      <EditPanel 
        selectedPart={selectedPart}
        onUpdateAttributes={handleUpdateAttributes} 
      />
      <Status />
    </div>
  )
}

export default App

