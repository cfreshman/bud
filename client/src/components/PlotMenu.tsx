import React from 'react'

interface PlotMenuProps {
  position: { x: number, y: number }
  onSelect: (action: 'chat' | 'edit' | 'carry') => void
  onClose: () => void
  isCarried?: boolean
}

export function PlotMenu({ position, onSelect, onClose, isCarried = false }: PlotMenuProps) {
  return (
    <>
      <div 
        className="plot-menu-backdrop"
        onClick={onClose}
      />
      <div 
        className="plot-menu"
        style={{ 
          left: position.x,
          top: position.y,
          transform: 'translate(-50%, 8px)'
        }}
      >
        <button
          className="plot-menu-item"
          onClick={() => onSelect('chat')}
        >
          chat
        </button>
        <button
          className="plot-menu-item"
          onClick={() => onSelect('edit')}
        >
          edit
        </button>
        <button
          className="plot-menu-item"
          onClick={() => onSelect('carry')}
        >
          {isCarried ? 'uncarry' : 'carry'}
        </button>
      </div>
    </>
  )
} 