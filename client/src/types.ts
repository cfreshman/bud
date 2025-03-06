import { PartType } from './engine/BudEngine'

// Properties that can be edited in the UI, combining both part and bone properties
export type EditableProperties = {
  id: string
  type: PartType
  position: [number, number, number]
  
  // Part-specific properties
  color: string
  length: number
  width: number
  
  // Bone-specific properties
  theta: number    // Vertical angle from up (0-180)
  phi: number      // Horizontal angle around up (0-360) 
  twist: number    // Rotation around bone axis (0-360)
} 