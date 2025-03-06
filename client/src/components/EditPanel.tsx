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
}

export function EditPanel({ selectedPart, onUpdateAttributes }: EditPanelProps) {
  if (!selectedPart) return null

  return (
    <div className="edit-panel">
      <div className="edit-row">
        <span>{selectedPart.type}</span>
        <input 
          type="color" 
          value={`#${selectedPart.color}`}
          onChange={(e) => {
            console.log('Color change:', {
              oldColor: selectedPart.color,
              newColor: e.target.value,
              id: selectedPart.id
            })
            onUpdateAttributes(selectedPart.id, { 
              color: e.target.value.slice(1) 
            })
          }}
        />
      </div>
    </div>
  )
} 