import { PartType } from '../engine/BudEngine'

type SelectedPart = {
  id: string
  type: PartType
  position: [number, number, number]
  color: string
} | null

type EditPanelProps = {
  selectedPart: SelectedPart
  onUpdateAttributes: (id: string, attributes: { color?: string }) => void
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