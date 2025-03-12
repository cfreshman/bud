import React from 'react'

interface PlotMenuProps {
  position: { x: number, y: number }
  onSelect: (action: 'chat' | 'edit' | 'carry' | 'share' | 'unshare' | 'copy-link') => void
  onClose: () => void
  isCarried?: boolean
  shareId?: string
  isLinkCopied?: boolean
}

export function PlotMenu({ position, onSelect, onClose, isCarried = false, shareId, isLinkCopied }: PlotMenuProps) {
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
        {isLinkCopied ? (
          <button
            className="plot-menu-item"
            style={{ opacity: 0.6, cursor: 'default' }}
            onClick={(e) => e.preventDefault()}
          >
            link copied
          </button>
        ) : !shareId ? (
          <>
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
            {!isCarried && (
              <button
                className="plot-menu-item"
                onClick={() => onSelect('share')}
              >
                share
              </button>
            )}
          </>
        ) : (
          <>
            <button
              className="plot-menu-item"
              onClick={() => onSelect('copy-link')}
            >
              copy link
            </button>
            <button
              className="plot-menu-item"
              onClick={() => onSelect('unshare')}
            >
              unshare
            </button>
          </>
        )}
      </div>
    </>
  )
} 