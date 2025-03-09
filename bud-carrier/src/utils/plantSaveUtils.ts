import * as THREE from 'three'
import { PlantData } from '../engine/types'

interface SerializedRoot {
  plantId?: string
  partData: any
  transform?: {
    position: number[]
    up: number[]
    right: number[]
    forward: number[]
  }
}

export function deserializePlantData(serialized: string): PlantData {
  const rootData = JSON.parse(serialized) as SerializedRoot[]
  const result: PlantData = {
    plantId: rootData[0]?.plantId,
    parts: new Map(),
    bones: new Map(),
    bodies: new Map(),
    roots: new Set()
  }

  rootData.forEach((data: any) => {
    const rootId = loadPartData(data.partData, undefined, result)
    if (rootId) {
      result.roots.add(rootId)
      
      // If we have transform data, create a body
      if (data.transform) {
        const bodyId = Math.random().toString(36).substr(2, 9)
        result.bodies.set(bodyId, {
          id: bodyId,
          rootPartId: rootId,
          transform: {
            position: new THREE.Vector3().fromArray(data.transform.position),
            up: new THREE.Vector3().fromArray(data.transform.up),
            right: new THREE.Vector3().fromArray(data.transform.right),
            forward: new THREE.Vector3().fromArray(data.transform.forward)
          }
        })
      }
    }
  })

  return result
}

function loadPartData(partData: any, parentBoneId: string | undefined, data: PlantData): string | null {
  const partId = Math.random().toString(36).substr(2, 9)
  const part = {
    id: partId,
    type: partData.type,
    attributes: partData.attributes || { color: undefined },
    boneIds: [],
    parentBoneId
  }

  // Create bones
  partData.bones.forEach((boneData: any) => {
    const boneId = Math.random().toString(36).substr(2, 9)
    const bone = {
      id: boneId,
      partId,
      direction: new THREE.Vector3(),
      twist: 0,
      length: boneData.length,
      width: boneData.width,
      isHead: boneData.isHead,
      children: new Map()
    }
    part.boneIds.push(boneId)

    // Restore bone direction and twist if they exist
    if (boneData.direction) {
      bone.direction.fromArray(boneData.direction)
    }
    if (boneData.twist !== undefined) {
      bone.twist = boneData.twist
    }

    // Process children
    if (boneData.children) {
      boneData.children.forEach((childData: any) => {
        const childId = loadPartData(childData.part, boneId, data)
        if (childId) {
          bone.children.set(childId, childData.attachment)
        }
      })
    }

    data.bones.set(boneId, bone)
  })

  data.parts.set(partId, part)
  return partId
} 