import * as THREE from 'three'

export type PartType = 'stem' | 'leaf' | 'thorn' | 'flower'

export interface PartAttributes {
  color?: string
  length?: number
  width?: number
  theta?: number
  phi?: number
  twist?: number
}

export interface Part {
  id: string
  type: PartType
  attributes: PartAttributes
  boneIds: string[]
  parentBoneId?: string
}

export interface BoneAttachment {
  partId: string
  ratio: number
  angle: number
}

export interface Bone {
  id: string
  partId: string
  length: number
  width: number
  isHead?: boolean
  direction: THREE.Vector3
  twist: number
  children: Map<string, BoneAttachment>
}

export interface Body {
  id: string
  transform: {
    position: THREE.Vector3
    up: THREE.Vector3
    right: THREE.Vector3
    forward: THREE.Vector3
  }
  rootPartId: string
}

export interface PlantData {
  plantId?: string  // Unique ID for the plant, used for chat/persistence
  parts: Map<string, Part>
  bones: Map<string, Bone>
  bodies: Map<string, Body>
  roots: Set<string>
} 