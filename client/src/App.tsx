import { useEffect, useRef } from 'react'
import { BudEngine } from './engine/BudEngine'
import './App.css'

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (!containerRef.current) return
    
    const engine = new BudEngine(containerRef.current)
    
    return () => {
      // Cleanup if needed
      containerRef.current?.childNodes.forEach(node => node.remove())
    }
  }, [])

  return (
    <div 
      ref={containerRef} 
      style={{ width: '100vw', height: '100vh' }}
    />
  )
}

