import * as THREE from 'three'
import { PlantData } from '../engine/types'

export function serializePlantData(data: PlantData): string {
  const rootData = Array.from(data.roots).map(rootId => {
    const body = Array.from(data.bodies.values()).find(b => b.rootPartId === rootId)
    return {
      partData: serializePartData(rootId, data),
      transform: body ? {
        position: body.transform.position.toArray(),
        up: body.transform.up.toArray(),
        right: body.transform.right.toArray(),
        forward: body.transform.forward.toArray()
      } : undefined
    }
  })
  return JSON.stringify(rootData)
}

function serializePartData(partId: string, data: PlantData): any {
  const part = data.parts.get(partId)
  if (!part) return null

  const bones = part.boneIds.map(boneId => {
    const bone = data.bones.get(boneId)
    if (!bone) return null

    // Get all child parts of this bone
    const children = Array.from(bone.children.entries()).map(([childId, attachment]) => {
      const childData = serializePartData(childId, data)
      if (!childData) return null
      return {
        attachment,
        part: childData
      }
    }).filter(x => x !== null)

    return {
      length: bone.length,
      width: bone.width,
      isHead: bone.isHead,
      direction: bone.direction.toArray(),
      twist: bone.twist,
      children
    }
  })

  return {
    type: part.type,
    attributes: part.attributes,
    bones
  }
}

export function deserializePlantData(serialized: string): PlantData {
  const rootData = JSON.parse(serialized)
  const result: PlantData = {
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