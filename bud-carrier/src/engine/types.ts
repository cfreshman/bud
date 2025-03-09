import * as THREE from 'three';

export type PartType = 'stem' | 'leaf' | 'thorn' | 'flower';

export type PartAttributes = {
  color?: string
  length?: number
  width?: number
};

export type Transform = {
  position: THREE.Vector3
  up: THREE.Vector3
  right: THREE.Vector3
  forward: THREE.Vector3
};

export type Body = {
  id: string
  transform: Transform
  rootPartId: string
};

export type Part = {
  id: string
  type: PartType
  attributes: PartAttributes
  boneIds: string[]
  parentBoneId?: string
};

export type Bone = {
  id: string
  partId: string
  direction: THREE.Vector3
  twist: number
  length: number
  width: number
  children: Map<string, { partId: string, ratio: number, angle: number }>
  isHead?: boolean
};

export type PlantData = {
  plantId?: string
  parts: Map<string, Part>
  bones: Map<string, Bone>
  bodies: Map<string, Body>
  roots: Set<string>
}; 