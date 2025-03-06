import { PartType } from '../engine/BudEngine'

type SelectedPart = {
  id: string
  type: PartType
  position: [number, number, number]
  color: string
  length: number
  width: number
} | null

type EditPanelProps = {
  selectedPart: SelectedPart
  onUpdateAttributes: (id: string, attributes: { color?: string, length?: number, width?: number }) => void
  onGrowStem?: (id: string) => void
  onShrinkStem?: (id: string) => void
}

export function EditPanel({ selectedPart, onUpdateAttributes, onGrowStem, onShrinkStem }: EditPanelProps) {
  if (!selectedPart) return null

  return (
    <div className="edit-panel">
      <div className="edit-row">
        <span>{selectedPart.type}</span>
        <input 
          type="color" 
          value={selectedPart.color}
          onChange={(e) => {
            console.log('Color change:', {
              oldColor: selectedPart.color,
              newColor: e.target.value,
              id: selectedPart.id
            })
            onUpdateAttributes(selectedPart.id, { 
              color: e.target.value
            })
          }}
        />
        <button 
          onClick={() => {
            console.log('Clear color:', { id: selectedPart.id })
            onUpdateAttributes(selectedPart.id, { color: 'none' })
          }}
          style={{ marginLeft: '8px' }}
        >
          clear
        </button>
      </div>

      <div className="edit-row">
        <span>length</span>
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.05"
          value={selectedPart.length}
          onChange={(e) => {
            const length = parseFloat(e.target.value)
            console.log('Length change:', { length, id: selectedPart.id })
            onUpdateAttributes(selectedPart.id, { length })
          }}
          onInput={(e) => {
            const length = parseFloat((e.target as HTMLInputElement).value)
            onUpdateAttributes(selectedPart.id, { length })
          }}
        />
      </div>

      <div className="edit-row">
        <span>radius</span>
        <input
          type="range"
          min="0.01"
          max="0.2"
          step="0.01"
          value={selectedPart.width}
          onChange={(e) => {
            const width = parseFloat(e.target.value)
            console.log('Width change:', { width, id: selectedPart.id })
            onUpdateAttributes(selectedPart.id, { width })
          }}
          onInput={(e) => {
            const width = parseFloat((e.target as HTMLInputElement).value)
            onUpdateAttributes(selectedPart.id, { width })
          }}
        />
      </div>
      
      {selectedPart.type === 'stem' && onGrowStem && onShrinkStem && (
        <div className="edit-row">
          <button onClick={() => {
            console.log('EditPanel: Grow clicked', { id: selectedPart.id })
            onGrowStem(selectedPart.id)
          }}>
            grow
          </button>
          <button onClick={() => {
            console.log('EditPanel: Shrink clicked', { id: selectedPart.id })
            onShrinkStem(selectedPart.id)
          }}>
            shrink
          </button>
        </div>
      )}
    </div>
  )
} 