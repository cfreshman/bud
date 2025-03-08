import { EditableProperties } from '../types'

type EditPanelProps = {
  selected: EditableProperties | null
  onUpdateProperties: (id: string, updates: Partial<EditableProperties>) => void
  onGrowStem?: (id: string) => void
  onShrinkStem?: (id: string) => void
  onDelete?: (id: string) => void
  onClone?: (id: string) => void
  onFitView?: () => void
  onApplyToAll?: (id: string) => void
}

export function EditPanel({ 
  selected, 
  onUpdateProperties, 
  onGrowStem, 
  onShrinkStem, 
  onDelete, 
  onClone,
  onFitView,
  onApplyToAll
}: EditPanelProps) {
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
          onClick={() => onUpdateProperties(selected.id, { color: selected.type === 'stem' ? '#44aa44' : 
            selected.type === 'leaf' ? '#66cc66' : 
            selected.type === 'thorn' ? '#aa4444' : 
            '#ffdd88' })}
        >
          default
        </button>
        <button 
          onClick={() => onUpdateProperties(selected.id, { color: 'none' })}
        >
          inherit
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

      {selected.type !== 'stem' && onApplyToAll && (
        <div className="edit-row">
          <button 
            className="apply-all"
            onClick={() => onApplyToAll(selected.id)}
          >
            apply to all {selected.type}s
          </button>
        </div>
      )}

      <div className="edit-row">
        <span>θ angle</span>
        <input
          type="range"
          min="-90"
          max="90"
          step="5"
          value={((selected.phi % 360 + 540) % 360) - 180}
          onChange={(e) => {
            const phi = parseFloat(e.target.value)
            onUpdateProperties(selected.id, { theta: selected.theta, phi })
          }}
          onInput={(e) => {
            const phi = parseFloat((e.target as HTMLInputElement).value)
            onUpdateProperties(selected.id, { theta: selected.theta, phi })
          }}
        />
        <span className="value">{Math.round(((selected.phi % 360 + 540) % 360) - 180)}°</span>
      </div>

      <div className="edit-row">
        <span>φ angle</span>
        <input
          type="range"
          min="-90"
          max="90"
          step="5"
          value={((selected.theta % 360 + 540) % 360) - 180}
          onChange={(e) => {
            const theta = parseFloat(e.target.value)
            onUpdateProperties(selected.id, { theta, phi: selected.phi })
          }}
          onInput={(e) => {
            const theta = parseFloat((e.target as HTMLInputElement).value)
            onUpdateProperties(selected.id, { theta, phi: selected.phi })
          }}
        />
        <span className="value">{Math.round(((selected.theta % 360 + 540) % 360) - 180)}°</span>
      </div>

      <div className="edit-row">
        <span>twist</span>
        <input
          type="range"
          min="-180"
          max="180"
          step="5"
          value={((selected.twist % 360 + 540) % 360) - 180}
          onChange={(e) => {
            const twist = parseFloat(e.target.value)
            onUpdateProperties(selected.id, { twist })
          }}
          onInput={(e) => {
            const twist = parseFloat((e.target as HTMLInputElement).value)
            onUpdateProperties(selected.id, { twist })
          }}
        />
        <span className="value">{Math.round(((selected.twist % 360 + 540) % 360) - 180)}°</span>
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

      <div className="edit-row">
        <button 
          className="clone"
          onClick={() => onClone?.(selected.id)}
        >
          clone
        </button>
        <button 
          className="delete"
          onClick={() => onDelete?.(selected.id)}
        >
          delete
        </button>
      </div>

      <div className="edit-row">
        <button 
          className="fit-view"
          onClick={onFitView}
        >
          fit view
        </button>
      </div>
    </div>
  )
} 