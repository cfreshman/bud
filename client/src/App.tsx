import { useEffect, useRef } from 'react'
import { BudEngine } from './engine/BudEngine'
import { EditPanel } from './components/EditPanel'
import './App.css'

declare global {
  interface Window {
    budEngine?: BudEngine
  }
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const engine = new BudEngine(containerRef.current)
    window.budEngine = engine

    return () => {
      window.budEngine = undefined
      // Clean up Three.js resources
    }
  }, [])

  const handleUpdateAttributes = (id: string, attributes: { color?: string }) => {
    if (!window.budEngine) return
    window.budEngine.updateBoneAttributes(id, attributes)
  }

  return (
    <div className="app">
      <div ref={containerRef} className="canvas-container" />
      <EditPanel onUpdateAttributes={handleUpdateAttributes} />
    </div>
  )
}

export default App

