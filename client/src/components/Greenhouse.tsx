import { useEffect, useRef, useState, useCallback } from 'react'
import { ViewEngine } from '../engine/ViewEngine'
import { PlantData } from '../engine/types'
import { deserializePlantData } from '../utils/plantSaveUtils'
import { PlotMenu } from './PlotMenu'
import { ChatView } from './ChatView'
import { removeToken } from '../services/auth'
import { carryPlant, uncarryPlant } from '../services/api'

interface GreenhouseProps {
  plants: Map<number, PlantData>
  onSelectPlot: (plotIndex: number) => void
  onStartChat: (plotIndex: number) => void
  onLogout: () => void
}

export function Greenhouse({ plants, onSelectPlot, onStartChat, onLogout }: GreenhouseProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ViewEngine | null>(null)
  const cleanupRef = useRef(false)
  const [menuState, setMenuState] = useState<{ position: { x: number, y: number }, plotIndex: number } | null>(null)
  const [chatState, setChatState] = useState<{ plant: PlantData } | null>(null)
  const [carriedPlotIndex, setCarriedPlotIndex] = useState<number | null>(null)
  
  // Store callback in ref to avoid effect dependency
  const onSelectPlotRef = useRef(onSelectPlot)
  onSelectPlotRef.current = onSelectPlot

  // Create click handler with access to current plants
  const handlePlotClick = useCallback((plotIndex: number | null) => {
    // If clicking outside plots, just close the menu
    if (plotIndex === null) {
      setMenuState(null)
      return
    }

    // If plot is empty, go directly to edit mode
    if (!plants.has(plotIndex)) {
      onSelectPlotRef.current(plotIndex)
      return
    }

    // Otherwise show menu for populated plots
    const position = engineRef.current?.getPlotScreenPosition(plotIndex)
    if (!position) return

    setMenuState({ position, plotIndex })
  }, [plants])

  // Initialize or reinitialize the ViewEngine
  const initializeEngine = useCallback(() => {
    if (!containerRef.current) return
    
    // Dispose of existing engine if there is one
    if (engineRef.current && !engineRef.current.isDisposed()) {
      engineRef.current.dispose()
    }
    
    // Create new engine
    engineRef.current = new ViewEngine(containerRef.current, handlePlotClick)

    // Load plants into plots and find carried plant
    plants.forEach((plantData, plotIndex) => {
      engineRef.current?.setPlantInPlot(plotIndex, plantData)
      if (plantData.isCarried) {
        setCarriedPlotIndex(plotIndex)
        engineRef.current?.setCarriedPlot(plotIndex)
      }
    })
  }, [handlePlotClick, plants])

  // Initialize engine on mount
  useEffect(() => {
    initializeEngine()
    
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
  }, [initializeEngine])

  // Reinitialize engine when returning from chat
  const handleChatClose = useCallback(() => {
    setChatState(null)
    // Use setTimeout to ensure the DOM is ready before reinitializing
    setTimeout(() => {
      initializeEngine()
    }, 0)
  }, [initializeEngine])

  const handleCarryPlant = async (plotIndex: number) => {
    try {
      const plant = plants.get(plotIndex)
      if (!plant) return

      if (carriedPlotIndex === plotIndex) {
        await uncarryPlant(plotIndex.toString())
        setCarriedPlotIndex(null)
        engineRef.current?.setCarriedPlot(null)
      } else {
        await carryPlant(plotIndex.toString())
        setCarriedPlotIndex(plotIndex)
        engineRef.current?.setCarriedPlot(plotIndex)
      }
    } catch (error) {
      console.error('Failed to carry/uncarry plant:', error)
    }
  }

  // Update carried plot visual when component mounts/unmounts
  useEffect(() => {
    if (engineRef.current && carriedPlotIndex !== null) {
      engineRef.current.setCarriedPlot(carriedPlotIndex)
    }
    return () => {
      engineRef.current?.setCarriedPlot(null)
    }
  }, [carriedPlotIndex])

  // Show ChatView when chatState is set
  if (chatState) {
    return (
      <ChatView 
        plant={chatState.plant}
        onClose={handleChatClose}
        plotIndex={menuState?.plotIndex || 0}
      />
    )
  }

  return (
    <>
      <button 
        className="chat-button"
        onClick={onLogout}
        style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          zIndex: 1000
        }}
      >
        logout
      </button>
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
              isCarried={carriedPlotIndex === menuState.plotIndex}
              onSelect={(action) => {
                if (action === 'edit') {
                  onSelectPlotRef.current(menuState.plotIndex)
                } else if (action === 'chat') {
                  if (onStartChat) {
                    onStartChat(menuState.plotIndex)
                  } else {
                    const plant = plants.get(menuState.plotIndex)
                    if (plant) {
                      setChatState({ plant })
                    }
                  }
                } else if (action === 'carry') {
                  handleCarryPlant(menuState.plotIndex)
                }
                setMenuState(null)
              }}
              onClose={() => setMenuState(null)}
            />
          )}
        </div>
      </div>
    </>
  )
} 