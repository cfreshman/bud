import { useEffect, useState } from 'react'
import { PartType } from '../engine/BudEngine'
import './EditPanel.css'

type SelectedPart = {
  id: string
  type: PartType
  position: [number, number, number]
  color: string
}

type EditPanelProps = {
  onUpdateAttributes: (id: string, attributes: { color?: string }) => void
}

export function EditPanel({ onUpdateAttributes }: EditPanelProps) {
  const [selectedPart, setSelectedPart] = useState<SelectedPart | null>(null)

  useEffect(() => {
    // @ts-ignore - window.budEngine will be set in App.tsx
    const engine = window.budEngine
    if (!engine) return

    const handleSelect = (data: SelectedPart) => {
      setSelectedPart(data)
    }

    const handleDeselect = () => {
      setSelectedPart(null)
    }

    engine.addEventListener('select', handleSelect)
    engine.addEventListener('deselect', handleDeselect)

    return () => {
      engine.removeEventListener('select', handleSelect)
      engine.removeEventListener('deselect', handleDeselect)
    }
  }, [])

  if (!selectedPart) return null

  return (
    <div className="edit-panel">
      <h3>{selectedPart.type}</h3>
      <div className="edit-row">
        <label>color</label>
        <input 
          type="color" 
          value={`#${selectedPart.color}`}
          onChange={(e) => {
            const color = e.target.value.substring(1) // Remove #
            onUpdateAttributes(selectedPart.id, { color })
          }}
        />
      </div>
      <div className="edit-row">
        <label>position</label>
        <span>
          {selectedPart.position.map(n => n.toFixed(2)).join(', ')}
        </span>
      </div>
    </div>
  )
} 