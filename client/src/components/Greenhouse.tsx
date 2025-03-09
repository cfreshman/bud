import { useEffect, useRef } from 'react'
import { ViewEngine } from '../engine/ViewEngine'
import { PlantData } from '../engine/types'

interface GreenhouseProps {
  plants: Map<number, PlantData>
  onSelectPlot: (plotIndex: number) => void
}

export function Greenhouse({ plants, onSelectPlot }: GreenhouseProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ViewEngine | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    
    // Only create engine if it doesn't exist
    if (!engineRef.current) {
      engineRef.current = new ViewEngine(containerRef.current, (plotIndex) => {
        onSelectPlot(plotIndex)
      })
    }

    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
    }
  }, [onSelectPlot])

  // Update plants in plots when they change
  useEffect(() => {
    if (!engineRef.current) return

    // Clear all plots first
    for (let i = 0; i < 6; i++) {
      engineRef.current.setPlantInPlot(i, undefined)
    }

    // Set new plants
    plants.forEach((plantData, plotIndex) => {
      engineRef.current?.setPlantInPlot(plotIndex, plantData)
    })
  }, [plants])

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        backgroundColor: '#111419'
      }} 
    />
  )
} 