import { useEffect, useRef, useState, useCallback } from 'react'
import { ViewEngine } from '../engine/ViewEngine'
import { PlantData } from '../engine/types'
import { deserializePlantData } from '../utils/plantSaveUtils'
import { PlotMenu } from './PlotMenu'

interface GreenhouseProps {
  plants: Map<number, PlantData>
  onSelectPlot: (plotIndex: number) => void
}

export function Greenhouse({ plants, onSelectPlot }: GreenhouseProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ViewEngine | null>(null)
  const cleanupRef = useRef(false)
  const [menuState, setMenuState] = useState<{ position: { x: number, y: number }, plotIndex: number } | null>(null)
  
  // Store callback in ref to avoid effect dependency
  const onSelectPlotRef = useRef(onSelectPlot)
  onSelectPlotRef.current = onSelectPlot

  // Create click handler with access to current plants
  const handlePlotClick = useCallback((plotIndex: number) => {
    console.log('Plot clicked:', plotIndex, 'Has plant:', plants.has(plotIndex))
    // Only show menu if plot has a plant
    if (!plants.has(plotIndex)) return

    // Get plot position
    const position = engineRef.current?.getPlotScreenPosition(plotIndex)
    console.log('Menu position:', position)
    if (!position) return

    setMenuState({ position, plotIndex })
  }, [plants])

  useEffect(() => {
    if (!containerRef.current) return
    
    // Only create engine if it doesn't exist
    if (!engineRef.current) {
      engineRef.current = new ViewEngine(containerRef.current, handlePlotClick)

      // Load initial plants from localStorage
      for (let i = 0; i < 6; i++) {
        try {
          const savedPlantStr = localStorage.getItem(`greenhouse_plot_${i}`)
          if (savedPlantStr) {
            const plantData = deserializePlantData(savedPlantStr)
            engineRef.current.setPlantInPlot(i, plantData)
          }
        } catch (error) {
          console.error(`Failed to load plot ${i}:`, error)
        }
      }
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
          console.warn('Error during ViewEngine disposal:', error)
        }
        engineRef.current = null
      }
    }
  }, [handlePlotClick]) // Add handlePlotClick to dependencies

  // Update plants in plots when they change
  useEffect(() => {
    if (!engineRef.current) return

    // Clear all plots first
    for (let i = 0; i < 6; i++) {
      engineRef.current.setPlantInPlot(i, undefined)
    }

    // First try to load from localStorage
    for (let i = 0; i < 6; i++) {
      try {
        const savedPlantStr = localStorage.getItem(`greenhouse_plot_${i}`)
        if (savedPlantStr) {
          const plantData = deserializePlantData(savedPlantStr)
          engineRef.current.setPlantInPlot(i, plantData)
        }
      } catch (error) {
        console.error(`Failed to load plot ${i}:`, error)
      }
    }

    // Then apply any plants from props (these would be more recent)
    plants.forEach((plantData, plotIndex) => {
      engineRef.current?.setPlantInPlot(plotIndex, plantData)
    })
  }, [plants])

  console.log('Render with menuState:', menuState)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div 
        ref={containerRef} 
        style={{ 
          width: '100%', 
          height: '100%',
          backgroundColor: '#111419'
        }}
      />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {menuState && (
          <PlotMenu
            position={menuState.position}
            onSelect={(action) => {
              console.log('Menu action selected:', action, menuState.plotIndex)
              if (action === 'edit') {
                onSelectPlotRef.current(menuState.plotIndex)
              }
              // TODO: Handle chat action
              setMenuState(null)
            }}
            onClose={() => {
              console.log('Menu closed')
              setMenuState(null)
            }}
          />
        )}
      </div>
    </div>
  )
} 