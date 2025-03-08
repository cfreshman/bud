import { EditableProperties } from '../types'

type EditPanelProps = {
  selected: EditableProperties | null
  onUpdateProperties: (id: string, updates: Partial<EditableProperties>) => void
  onGrowStem?: (id: string) => void
  onShrinkStem?: (id: string) => void
}

export function EditPanel({ selected, onUpdateProperties, onGrowStem, onShrinkStem }: EditPanelProps) {
  if (!selected) return null

  return (
    <div className="edit-panel">
      <div className="edit-row">
        <span>{selected.type}</span>
        <input 
          type="color" 
          value={selected.color}
          onChange={(e) => {
            onUpdateProperties(selected.id, { color: e.target.value })
          }}
        />
        <button 
          onClick={() => onUpdateProperties(selected.id, { color: 'none' })}
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
          value={selected.length}
          onChange={(e) => {
            const length = parseFloat(e.target.value)
            onUpdateProperties(selected.id, { length })
          }}
          onInput={(e) => {
            const length = parseFloat((e.target as HTMLInputElement).value)
            onUpdateProperties(selected.id, { length })
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
          value={selected.width}
          onChange={(e) => {
            const width = parseFloat(e.target.value)
            onUpdateProperties(selected.id, { width })
          }}
          onInput={(e) => {
            const width = parseFloat((e.target as HTMLInputElement).value)
            onUpdateProperties(selected.id, { width })
          }}
        />
      </div>

      <div className="edit-row">
        <span>θ angle</span>
        <input
          type="range"
          min="0"
          max="180"
          step="5"
          value={selected.theta}
          onChange={(e) => {
            const theta = parseFloat(e.target.value)
            onUpdateProperties(selected.id, { theta, phi: selected.phi })
          }}
          onInput={(e) => {
            const theta = parseFloat((e.target as HTMLInputElement).value)
            onUpdateProperties(selected.id, { theta, phi: selected.phi })
          }}
        />
      </div>

      <div className="edit-row">
        <span>φ angle</span>
        <input
          type="range"
          min="0"
          max="360"
          step="5"
          value={selected.phi}
          onChange={(e) => {
            const phi = parseFloat(e.target.value)
            onUpdateProperties(selected.id, { theta: selected.theta, phi })
          }}
          onInput={(e) => {
            const phi = parseFloat((e.target as HTMLInputElement).value)
            onUpdateProperties(selected.id, { theta: selected.theta, phi })
          }}
        />
      </div>

      <div className="edit-row">
        <span>twist</span>
        <input
          type="range"
          min="0"
          max="360"
          step="5"
          value={selected.twist}
          onChange={(e) => {
            const twist = parseFloat(e.target.value)
            onUpdateProperties(selected.id, { twist })
          }}
          onInput={(e) => {
            const twist = parseFloat((e.target as HTMLInputElement).value)
            onUpdateProperties(selected.id, { twist })
          }}
        />
      </div>
      
      {selected.type === 'stem' && onGrowStem && onShrinkStem && (
        <div className="edit-row">
          <button onClick={() => onGrowStem(selected.id)}>
            grow
          </button>
          <button onClick={() => onShrinkStem(selected.id)}>
            shrink
          </button>
        </div>
      )}
    </div>
  )
} 