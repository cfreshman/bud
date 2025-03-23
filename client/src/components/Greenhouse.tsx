import { useEffect, useRef, useState, useCallback } from 'react'
import { ViewEngine } from '../engine/ViewEngine'
import { PlantData } from '../engine/types'
import { deserializePlantData } from '../utils/plantSaveUtils'
import { PlotMenu } from './PlotMenu'
import { ChatView } from './ChatView'
import { removeToken, getToken } from '../services/auth'
import { carryPlant, uncarryPlant, sharePlant, unsharePlant, getStarCounts, StarCounts } from '../services/api'
import { loadPlants } from '../services/plants'
import { WS_URL } from '../config'
import { Star, CaretLeft, Sphere } from '@phosphor-icons/react'

interface GreenhouseProps {
  plants: Map<number, PlantData>
  onSelectPlot: (plotIndex: number) => void
  onStartChat: (plotIndex: number) => void
  onLogout: () => void
  onPlantsChange: (plants: Map<number, PlantData>) => void
  receivedPlot: number | null
  isMobileView?: boolean
}

interface MenuState {
  position: { x: number; y: number };
  plotIndex: number;
  isLinkCopied?: boolean;
  options: string[];
}

export function Greenhouse({ 
  plants, 
  onSelectPlot, 
  onStartChat, 
  onLogout, 
  onPlantsChange,
  receivedPlot,
  isMobileView
}: GreenhouseProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<ViewEngine | null>(null)
  const cleanupRef = useRef(false)
  const [menuState, setMenuState] = useState<MenuState | null>(null)
  const [chatState, setChatState] = useState<{ plant: PlantData } | null>(null)
  const [carriedPlotIndex, setCarriedPlotIndex] = useState<number | null>(null)
  const [stars, setStars] = useState<StarCounts>({ totalStars: 0, currentStars: 0 })
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  
  // Store callback in ref to avoid effect dependency
  const onSelectPlotRef = useRef(onSelectPlot)
  onSelectPlotRef.current = onSelectPlot

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

  // Add focus event listener to reload plants and stars
  useEffect(() => {
    const handleFocus = async () => {
      try {
        const updatedPlants = await loadPlants()
        if (onPlantsChange) {
          onPlantsChange(updatedPlants)
        }
        const counts = await getStarCounts()
        setStars(counts)
      } catch (error) {
        console.error('Failed to reload data on focus:', error)
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [onPlantsChange])

  // Create click handler with access to current plants
  const handlePlotClick = useCallback((plotIndex: number | null) => {
    // If clicking outside plots, just close the menu
    if (plotIndex === null) {
      setMenuState(null)
      return
    }

    // On mobile, only allow selecting plots with plants
    if (isMobileView && !plants.has(plotIndex)) {
      return
    }

    // If plot is empty and not on mobile, go directly to edit mode
    if (!plants.has(plotIndex) && !isMobileView) {
      onSelectPlotRef.current(plotIndex)
      return
    }

    // Otherwise show menu
    const position = engineRef.current?.getPlotScreenPosition(plotIndex)
    if (!position) return

    // On mobile, only show gift option for plots with plants
    if (isMobileView) {
      setMenuState({
        position,
        plotIndex,
        options: ['gift']
      })
      return
    }

    // Desktop menu
    setMenuState({
      position,
      plotIndex,
      options: plants.has(plotIndex) ? ['edit', 'chat', 'gift', 'delete'] : ['edit']
    })
  }, [plants, isMobileView])

  // Initialize or reinitialize the ViewEngine
  const initializeEngine = useCallback(() => {
    if (!containerRef.current) return
    
    // Dispose of existing engine if there is one
    if (engineRef.current && !engineRef.current.isDisposed()) {
      engineRef.current.dispose()
    }
    
    // Create new engine
    engineRef.current = new ViewEngine(containerRef.current, handlePlotClick, isMobileView)

    // Load plants into plots and find carried plant
    plants.forEach((plantData, plotIndex) => {
      engineRef.current?.setPlantInPlot(plotIndex, plantData)
      if (plantData.isCarried) {
        setCarriedPlotIndex(plotIndex)
        engineRef.current?.setCarriedPlot(plotIndex)
      }
      // Set received plant visual
      if (plotIndex === receivedPlot) {
        engineRef.current?.setReceivedPlot(plotIndex)
      }
    })
  }, [handlePlotClick, plants, receivedPlot])

  // Initialize engine on mount
  useEffect(() => {
    initializeEngine()
    
    // Set up WebSocket connection
    const token = getToken()
    if (!token) return

    const ws = new WebSocket(`${WS_URL}?token=${token}`)
    
    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'plant_web_update') {
        const updatedPlants = await loadPlants()
        if (onPlantsChange) {
          onPlantsChange(updatedPlants)
        }
      }
    }

    return () => {
      ws.close()

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
  }, [initializeEngine, onPlantsChange])

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

  const handleSharePlant = async (plotIndex: number) => {
    try {
      const plant = plants.get(plotIndex)
      if (!plant) return

      await sharePlant(plotIndex.toString())
      
      const updatedPlants = await loadPlants()
      
      // Get the updated plant with shareId
      const updatedPlant = updatedPlants.get(plotIndex)
      if (!updatedPlant?.shareId) return
      
      // Copy link to clipboard
      const shareUrl = `${window.location.origin}/shared/${updatedPlant.shareId}`
      await navigator.clipboard.writeText(shareUrl)
      
      // Show "link copied" state
      if (menuState) {
        setMenuState({ ...menuState, isLinkCopied: true })
        
        // Close menu after delay
        setTimeout(() => {
          setMenuState(null)
        }, 1500)
      }

      if (onPlantsChange) {
        onPlantsChange(updatedPlants)
      }
    } catch (error) {
      console.error('Failed to share plant:', error)
    }
  }

  const handleUnsharePlant = async (plotIndex: number) => {
    try {
      const plant = plants.get(plotIndex)
      if (!plant) return

      await unsharePlant(plotIndex.toString())
      
      // Reload plants to get updated shareId
      const updatedPlants = await loadPlants()
      if (onPlantsChange) {
        onPlantsChange(updatedPlants)
      }
    } catch (error) {
      console.error('Failed to unshare plant:', error)
    }
  }

  const handleCopyLink = (plotIndex: number) => {
    const plant = plants.get(plotIndex)
    if (!plant?.shareId) return

    const shareUrl = `${window.location.origin}/shared/${plant.shareId}`
    navigator.clipboard.writeText(shareUrl)
  }

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
      {!isMobileView && (
        <div style={{ 
          position: 'fixed', 
          top: '20px', 
          left: '20px', 
          zIndex: 1000,
          display: 'flex',
          gap: '12px',
          alignItems: 'center'
        }}>
          <button className="chat-button" onClick={onLogout}>
            logout
          </button>
          <div className="chat-button" style={{ cursor: 'default', border: '1px solid transparent', backgroundClip: 'padding-box' }}>
            <Star weight="fill" style={{ marginRight: '4px' }} />
            {stars.currentStars}
          </div>
          {carriedPlotIndex === null && (
            <>
              {showDownloadMenu ? (
                <>
                  <button 
                    className="chat-button"
                    onClick={() => setShowDownloadMenu(false)}
                    style={{ padding: '0 8px' }}
                  >
                    <CaretLeft weight="bold" />
                  </button>
                  <a 
                    href="https://testflight.apple.com/join/ChMubZNX"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chat-button"
                  >
                    bud 🌱 iOS
                  </a>
                  <a 
                    href="/android/bud.apk"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chat-button"
                  >
                    bud 🌱 android
                  </a>
                </>
              ) : (
                <button 
                  className="chat-button"
                  onClick={() => setShowDownloadMenu(true)}
                >
                  download bud carrier 🌱
                </button>
              )}
            </>
          )}
          {receivedPlot !== null && (
            <button 
              className="chat-button" 
              onClick={() => onStartChat(receivedPlot)}
              style={{ 
                background: '#fdfdfd',
                color: '#000000',
                border: '1px solid #000000'
              }}
            >
              you received a plant!
            </button>
          )}
        </div>
      )}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div 
          ref={containerRef} 
          style={{ 
            width: '100%', 
            height: '100%',
            backgroundColor: '#111419',
            userSelect: 'none'
          }}
        />
        <button
          className="chat-button"
          onClick={() => engineRef.current?.resetCamera()}
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            ...(isMobileView ? {
              width: '40px',
              height: '40px',
              borderRadius: '40px',
            } : {
              width: '32px',
              height: '32px',
              borderRadius: '32px',
            }),
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <Sphere size={isMobileView ? 20 : 16} />
        </button>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {menuState && (
            <PlotMenu
              position={menuState.position}
              isCarried={carriedPlotIndex === menuState.plotIndex}
              shareId={plants.get(menuState.plotIndex)?.shareId}
              isLinkCopied={menuState.isLinkCopied}
              isMobileView={isMobileView}
              onSelect={(action) => {
                if (action === 'edit') {
                  onSelectPlotRef.current(menuState.plotIndex)
                } else if (action === 'chat') {
                  if (onStartChat) {
                    onStartChat(menuState.plotIndex)
                  } else {
                    const plant = plants.get(menuState.plotIndex)
                    if (plant) {
                      setChatState({ plant: { ...plant, isCarried: carriedPlotIndex === menuState.plotIndex } })
                    }
                  }
                } else if (action === 'carry') {
                  handleCarryPlant(menuState.plotIndex)
                } else if (action === 'share') {
                  handleSharePlant(menuState.plotIndex)
                } else if (action === 'unshare') {
                  handleUnsharePlant(menuState.plotIndex)
                } else if (action === 'copy-link') {
                  handleCopyLink(menuState.plotIndex)
                }
                if (!menuState.isLinkCopied) {
                  setMenuState(null)
                }
              }}
              onClose={() => {
                if (!menuState.isLinkCopied) {
                  setMenuState(null)
                }
              }}
            />
          )}
        </div>
      </div>
    </>
  )
} 