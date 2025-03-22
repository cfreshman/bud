import React from 'react'

interface PlotMenuProps {
  position: { x: number, y: number }
  isCarried: boolean
  shareId?: string
  isLinkCopied?: boolean
  isMobileView?: boolean
  onSelect: (action: 'edit' | 'chat' | 'carry' | 'share' | 'unshare' | 'copy-link') => void
  onClose: () => void
}

export function PlotMenu({ position, isCarried, shareId, isLinkCopied, isMobileView, onSelect, onClose }: PlotMenuProps) {
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
        ) : (
          <>
            {!isMobileView && (
              <>
                <button className="plot-menu-item" onClick={() => onSelect('edit')}>
                  edit
                </button>
                <button className="plot-menu-item" onClick={() => onSelect('chat')}>
                  chat
                </button>
                <button className="plot-menu-item" onClick={() => onSelect('carry')}>
                  {isCarried ? 'uncarry' : 'carry'}
                </button>
              </>
            )}
            <button 
              className="plot-menu-item" 
              onClick={() => onSelect(shareId ? 'copy-link' : 'share')}
            >
              {shareId ? 'copy link' : 'gift'}
            </button>
            {shareId && (
              <button className="plot-menu-item" onClick={() => onSelect('unshare')}>
                ungift
              </button>
            )}
          </>
        )}
      </div>
    </>
  )
} 