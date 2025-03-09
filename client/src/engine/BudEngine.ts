import * as THREE from 'three'
import { EditableProperties } from '../types'
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
// @ts-ignore
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
// @ts-ignore
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass'
// @ts-ignore
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass'
// @ts-ignore
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass'
import { InputManager } from './InputManager'
import { EngineUtils } from './EngineUtils'
import { PlantData } from './types'

export type PartType = 'stem' | 'leaf' | 'thorn' | 'flower'

export type PartAttributes = {
  color?: string  // Hex color without #
  length?: number // Length of bones in the part
  width?: number  // Width/radius of bones in the part
  // Add other inheritable attributes here like:
  // opacity?: number
  // roughness?: number
  // etc.
}

export type Transform = {
  position: THREE.Vector3    // Local position relative to parent
  up: THREE.Vector3         // Local up direction 
  right: THREE.Vector3      // Local right direction
  forward: THREE.Vector3    // Local forward direction (cross product)
}

export type Body = {
  id: string
  transform: Transform      // Transform in world space
  rootPartId: string       // The root part that starts this body
}

export type Part = {
  id: string
  type: PartType
  attributes: PartAttributes
  boneIds: string[]       // Ordered list of bone IDs making up this part
  parentBoneId?: string    // Which bone this part is attached to
}

export type Attachment = {
  partId: string
  ratio: number    // 0-1 position along bone
  angle: number    // Angle around bone axis in radians
}

export type Bone = {
  id: string
  partId: string           // Which part this bone belongs to
  direction: THREE.Vector3 // Direction bone is pointing (normalized)
  twist: number           // Rotation around direction vector
  length: number          // The length of the bone
  width: number          // Thickness/radius of the bone
  children: Map<string, Attachment>  // Map from child part ID to attachment data
  isHead?: boolean       // Whether this bone is a head with eyes
}

// Part preview in the UI panel
type PartPreview = {
  type: PartType
  mesh: THREE.Mesh
  position: THREE.Vector3
  selected: boolean
}

type EventCallback = (data: any) => void
type EventType = 'select' | 'deselect'

export class BudEngine extends EngineUtils {
  protected bodies: Map<string, Body> = new Map()
  protected parts: Map<string, Part> = new Map()
  protected bones: Map<string, Bone> = new Map()
  protected roots: Set<string> = new Set()
  protected partParentIds: Map<string, Set<string>> = new Map()
  protected uiScene: THREE.Scene
  protected uiCamera: THREE.OrthographicCamera
  protected partPreviews: PartPreview[] = []
  protected selectedPartType?: PartType
  protected inputManager: InputManager
  protected partPots: Map<PartType, THREE.Mesh> = new Map()
  protected partMeshes: Map<PartType, THREE.Mesh> = new Map()
  protected mainPot?: THREE.Mesh
  protected mainDirt?: THREE.Mesh
  protected plantingArea: THREE.Vector3 = new THREE.Vector3(0, 0.4, 0)
  protected plantingRadius: number = 0.5
  protected _eventListeners: Map<EventType, Set<EventCallback>> = new Map()
  protected dragOffset: THREE.Vector3 = new THREE.Vector3()
  protected mouseDown = false
  protected onSelect?: (data: { id: string, type: PartType, position: [number, number, number], color?: string, length: number, width: number, theta?: number, phi?: number, twist?: number }) => void
  protected onDeselect?: () => void
  protected bloomEnabled: boolean = true
  protected partAdded: boolean = false
  protected isDragging = false
  protected dragStartPosition = new THREE.Vector3()
  protected groundPlane!: THREE.Mesh

  constructor(container: HTMLElement, callbacks?: { 
    onSelect?: (data: { 
      id: string
      type: PartType
      position: [number, number, number]
      color?: string
      length: number
      width: number
      theta?: number
      phi?: number
      twist?: number
    }) => void
    onDeselect?: () => void 
  }) {
    super(container)
    this.onSelect = callbacks?.onSelect
    this.onDeselect = callbacks?.onDeselect
    
    // Initialize event listeners
    this._eventListeners.set('select', new Set())
    this._eventListeners.set('deselect', new Set())
    
    // UI scene setup
    this.uiScene = new THREE.Scene()
    
    // UI camera (orthographic for 2D panel)
    const aspect = container.clientWidth / container.clientHeight
    const uiHeight = 1
    const uiWidth = uiHeight * aspect
    this.uiCamera = new THREE.OrthographicCamera(
      -uiWidth, uiWidth,
      uiHeight, -uiHeight,
      0.1, 10
    )
    this.uiCamera.position.z = 1
    
    // Remove existing ground plane and add pot and dirt instead
    this.setupPotAndDirt()
    
    // Initialize input manager
    this.inputManager = new InputManager(this.controls)
    
    // Event listeners
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this))
    this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this))
    this.renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this))
    
    // Start render loop
    requestAnimationFrame(() => {
      this.fitCameraToPlant() // Add camera fit after loading saved state
    })
  }

  protected setupPotAndDirt() {
    // Create main pot with lighter material
    const potGeo = new THREE.CylinderGeometry(0.6, 0.4, 0.4, 32)
    const potMat = new THREE.MeshStandardMaterial({ 
      color: '#8B5E3C',
      roughness: 0.6,
      metalness: 0.1
    })
    this.mainPot = new THREE.Mesh(potGeo, potMat)
    this.mainPot.position.y = 0.2
    this.mainPot.castShadow = true
    this.mainPot.receiveShadow = true
    this.mainPot.userData.isGround = true
    this.scene.add(this.mainPot)

    // Create main dirt mound with lighter material
    const dirtGeo = new THREE.SphereGeometry(0.5, 32, 16)
    const dirtMat = new THREE.MeshStandardMaterial({
      color: '#5C4033',
      roughness: 0.8,
      metalness: 0
    })
    this.mainDirt = new THREE.Mesh(dirtGeo, dirtMat)
    this.mainDirt.scale.y = 0.3
    this.mainDirt.position.y = 0.35
    this.mainDirt.castShadow = true
    this.mainDirt.receiveShadow = true
    this.mainDirt.userData.isGround = true
    this.scene.add(this.mainDirt)

    // Create ingredient pots in a semi-circle
    const parts: [PartType, string][] = [
      ['stem', '#66cc66'],  // Brighter green
      ['leaf', '#88ee88'],  // Even brighter green
      ['thorn', '#cc6666'], // Brighter red
      ['flower', '#ffdd88'] // Brighter purple
    ]

    const radius = 2 // Distance from center
    const startAngle = Math.PI / 4
    const angleStep = Math.PI / 6 // 30 degrees between pots

    parts.forEach(([type, color], i) => {
      const angle = startAngle + i * angleStep + Math.PI
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius

      // Create small pot
      const smallPotGeo = new THREE.CylinderGeometry(0.2, 0.15, 0.2, 32)
      const smallPot = new THREE.Mesh(smallPotGeo, potMat.clone())
      smallPot.position.set(x, 0.1, z)
      smallPot.castShadow = true
      smallPot.receiveShadow = true
      this.scene.add(smallPot)
      this.partPots.set(type, smallPot)

      // Add small dirt mound
      const smallDirtGeo = new THREE.SphereGeometry(0.15, 32, 16)
      const smallDirt = new THREE.Mesh(smallDirtGeo, dirtMat.clone())
      smallDirt.scale.y = 0.3
      smallDirt.position.set(x, 0.18, z)
      smallDirt.castShadow = true
      smallDirt.receiveShadow = true
      this.scene.add(smallDirt)

      // Create part preview in pot - now positioned on top of dirt
      const mesh = this.createPartPreview(type, color)
      // Calculate proper height based on part type
      let previewHeight = 0.23 // Base height (dirt surface)
      mesh.position.set(x, previewHeight, z)
      this.scene.add(mesh)
      this.partMeshes.set(type, mesh)
    })
  }

  protected createGeometry(type: PartType, params: { width: number, length: number }): THREE.BufferGeometry {
    switch (type) {
      case 'stem':
        const stemGeo = new THREE.CylinderGeometry(params.width, params.width, params.length, 8)
        stemGeo.translate(0, params.length / 2, 0)
        return stemGeo
      case 'leaf':
        const radius = params.width * 2
        const leafGeo = new THREE.CylinderGeometry(radius, radius, 0.01, 16, 1, false)
        leafGeo.rotateX(Math.PI / 2) // Rotate to be vertical
        const scale = params.length * .8 / radius
        leafGeo.scale(1, scale, 1) // Scale Y to make it oval
        leafGeo.translate(0, params.length * .8, 0) // Adjust translation for new height
        return leafGeo
      case 'thorn':
        const length = params.length / 2
        const thornGeo = new THREE.ConeGeometry(params.width / 2, length, 4)
        thornGeo.translate(0, length / 2, 0)
        return thornGeo
      case 'flower':
        const flowerGeo = new THREE.ConeGeometry(params.width * 2, params.length * .25, 16)
        flowerGeo.rotateX(Math.PI) // Rotate 180 degrees around X axis to face down
        return flowerGeo
    }
  }

  protected createPartPreview(type: PartType, color: string): THREE.Mesh {
    const scale = 1
    const geometry = this.createGeometry(type, {
      width: type === 'stem' ? 0.03 * scale : 0.05 * scale,
      length: type === 'stem' ? 0.2 * scale : 0.15 * scale
    })

    const material = new THREE.MeshStandardMaterial({ 
      color,
      roughness: 0.7,
      metalness: 0.2,
      side: THREE.FrontSide
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.isPartPreview = true
    mesh.userData.partType = type

    // Rotate leaf to be vertical
    if (type === 'leaf') {
      mesh.rotation.y = Math.PI / 2
    }

    return mesh
  }

  protected onMouseDown(event: MouseEvent) {
    this.mouseDown = true
    this.isDragging = false

    // unselect any selected part
    this.activePartId = undefined

    this.mouse.x = (event.clientX / this.renderer.domElement.clientWidth) * 2 - 1
    this.mouse.y = -(event.clientY / this.renderer.domElement.clientHeight) * 2 + 1
    
    this.dragStartPosition.set(event.clientX, event.clientY, 0)
    
    // Get all valid meshes to check for intersection
    const validMeshes: THREE.Object3D[] = []
    const innerBoneMeshes: THREE.Object3D[] = []
    
    // Add preview meshes
    validMeshes.push(...Array.from(this.partMeshes.values()))
    
    // Add all plant part meshes and collect inner bones separately
    this.scene.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return
      
      if (child.userData.isInnerBone) {
        innerBoneMeshes.push(child)
      } else if (child.userData.boneId || child.userData.isPartPreview) {
        validMeshes.push(child)
      }
    })
    
    // Check for intersections with inner bones first
    this.raycaster.setFromCamera(this.mouse, this.camera)
    let intersects = this.raycaster.intersectObjects(innerBoneMeshes, false)
    
    // If no inner bone hit, check regular meshes
    if (intersects.length === 0) {
      intersects = this.raycaster.intersectObjects(validMeshes, false)
    }
    
    if (intersects.length > 0) {
      const selectedObject = intersects[0].object
      if (!(selectedObject instanceof THREE.Mesh)) return
      
      // Check if this is a preview mesh
      if (selectedObject.userData.isPartPreview) {
        const selectedType = selectedObject.userData.partType as PartType
        if (!selectedType) return
        
        // Disable camera rotation temporarily
        this.controls.enableRotate = false
        this.selectedPartType = selectedType
        this.inputManager.setMode('drag')
        
        // Hide the preview mesh while selected
        selectedObject.visible = false
        
        // Create new part at the intersection point
        const id = this.startBoneDrag({
          worldPosition: intersects[0].point,
          type: selectedType,
          length: 0.3,
          width: 0.05
        })

        // Find the newly created part's group and set it as the outline target
        const partGroup = this.scene.children.find(child => 
          child instanceof THREE.Group && child.userData.partId === id
        )
        if (partGroup) {
          this.outlinePass.selectedObjects = [partGroup]
          this.composer.render()
        }

        // Get the bone ID from the part
        const part = this.parts.get(id)
        if (!part || part.boneIds.length === 0) return
        const boneId = part.boneIds[0]

        this.notifySelect({
          id: boneId,
          type: selectedType,
          position: intersects[0].point.toArray(),
          color: undefined,
          length: part.attributes.length || 0.3,
          width: part.attributes.width || 0.05
        })
        return
      }
      
      // Otherwise this is a plant part mesh or inner bone
      // Find the parent group (part)
      let partGroup = selectedObject.parent
      while (partGroup && !(partGroup instanceof THREE.Group)) {
        partGroup = partGroup.parent
      }
      
      if (partGroup && partGroup.userData.partId) {
        this.controls.enableRotate = false
        const selectedPart = this.parts.get(partGroup.userData.partId)
        if (!selectedPart) return

        // Use the bone ID from either the inner bone or regular mesh
        this.selectedBoneId = selectedObject.userData.boneId
        this.activePartId = partGroup.userData.partId

        // Calculate drag offset
        const intersection = intersects[0].point
        this.dragOffset.copy(selectedObject.position).sub(intersection)
        
        // Add outline to entire part group and force update
        this.outlinePass.selectedObjects = [partGroup]
        this.composer.render()
        
        this.notifySelect({
          id: selectedObject.userData.boneId,
          type: selectedPart.type,
          position: selectedObject.position.toArray(),
          color: selectedPart.attributes.color,
          length: selectedPart.attributes.length || 0.3,
          width: selectedPart.attributes.width || 0.05
        })
        return
      }
    }
    
    // If we get here, we clicked outside any selectable object
    this.selectedBoneId = undefined
    this.outlinePass.selectedObjects = []
    this.composer.render()
    this.notifyDeselect()
  }

  protected onMouseMove(event: MouseEvent) {
    this.mouse.x = (event.clientX / this.renderer.domElement.clientWidth) * 2 - 1
    this.mouse.y = -(event.clientY / this.renderer.domElement.clientHeight) * 2 + 1
    
    // Start dragging if we've moved enough while mouse is down
    if (this.activePartId && !this.isDragging && this.mouseDown) {
      const dragDistance = new THREE.Vector3(event.clientX, event.clientY, 0)
        .sub(this.dragStartPosition)
        .length()
      
      if (dragDistance > 5) {
        this.isDragging = true
        this.inputManager.setMode('drag')
      }
    }
    
    // Only process drag if we're actually dragging
    if (this.isDragging && this.activePartId) {
      this.raycaster.setFromCamera(this.mouse, this.camera)
      
      // Create array of valid surfaces to drag onto
      const validSurfaces: THREE.Object3D[] = []
      
      // Add ground plane and pots
      if (this.groundPlane) validSurfaces.push(this.groundPlane)
      if (this.mainPot) validSurfaces.push(this.mainPot)
      if (this.mainDirt) validSurfaces.push(this.mainDirt)
      validSurfaces.push(...Array.from(this.partPots.values()))

      // Add all part meshes that aren't part of the active part's hierarchy
      const activePart = this.parts.get(this.activePartId)
      if (activePart) {
        this.scene.traverse(child => {
          if (!(child instanceof THREE.Mesh)) return
          if (!child.userData.boneId) return
          
          // Skip if mesh belongs to active part or its parents
          const meshPartId = child.userData.partId
          if (!meshPartId) return

          const parentIds = this.partParentIds.get(meshPartId)
          if (parentIds?.has(activePart.id)) return
          
          validSurfaces.push(child)
        })
      }

      this.raycaster.setFromCamera(this.mouse, this.camera)
      const intersects = this.raycaster.intersectObjects(validSurfaces, false)
      
      if (intersects.length > 0) {
        const intersection = intersects[0].point
        this.updatePartDrag(intersection)
      }
    }
  }

  protected onMouseUp(event: MouseEvent) {
    this.mouseDown = false
    // Re-enable camera rotation
    this.controls.enableRotate = true
    
    // Check if this was a click vs drag
    const dragDistance = new THREE.Vector3(event.clientX, event.clientY, 0)
      .sub(this.dragStartPosition)
      .length()
    
    if (this.isDragging) {
      // Show the preview mesh again
      if (this.selectedPartType) {
        const previewMesh = this.partMeshes.get(this.selectedPartType)
        if (previewMesh) {
          previewMesh.visible = true
        }
      }
      
      // If we were dragging a new part, clear the outline
      if (this.selectedPartType) {
        this.outlinePass.selectedObjects = []
        this.composer.render()
      }
      
      this.endBoneDrag()
      this.isDragging = false
      this.selectedPartType = undefined
      this.inputManager.setMode('camera')
    }
  }

  public onResize = () => {
    const container = this.renderer.domElement.parentElement
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight
    const aspect = width / height

    // Update main camera
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()

    // Update UI camera
    const uiHeight = 1
    const uiWidth = uiHeight * aspect
    this.uiCamera.left = -uiWidth
    this.uiCamera.right = uiWidth
    this.uiCamera.top = uiHeight
    this.uiCamera.bottom = -uiHeight
    this.uiCamera.updateProjectionMatrix()

    // Update renderer
    this.renderer.setSize(width, height)
    
    // Update composer
    this.composer.setSize(width, height)
    
    // Update outline pass
    this.outlinePass.resolution.set(width, height)
  }

  protected animate = () => {
    requestAnimationFrame(this.animate)
    this.controls.update()
    
    // Clear bone transforms and part IDs for this frame
    this.boneTransforms.clear()
    this.bonePartIds.clear()
    
    // Store currently selected objects before cleanup
    const selectedObjects = this.outlinePass.selectedObjects

    // Clear all groups at start of frame EXCEPT:
    // 1. Non-group objects
    // 2. Ground plane (isGround)
    // 3. Part previews (isPartPreview)
    // 4. Part pots and dirt
    // 5. Debug spheres
    const groupsToRemove = this.scene.children.filter(child => {
      // remove toRemove
      if (child.userData.toRemove) return true
        
      // Keep non-group objects
      if (!(child instanceof THREE.Group)) {
        // Keep ground plane, previews, and debug spheres
        if (child.userData.isGround || child.userData.isPartPreview || child.userData.isDebug) return false
        
        // Keep main pot and dirt if they're meshes
        if (child instanceof THREE.Mesh) {
          if (child === this.mainPot || child === this.mainDirt) return false
          
          // Keep part pots and preview meshes
          if (Array.from(this.partPots.values()).includes(child)) return false
          if (Array.from(this.partMeshes.values()).includes(child)) return false
        }
        return false
      }
      
      // Remove if it has a bodyId (it's part of a plant that will be re-rendered)
      return child.userData.bodyId !== undefined
    })
    
    // Only remove the visual meshes, not the underlying data
    groupsToRemove.forEach(group => {
      this.scene.remove(group)
      group.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (child.material instanceof THREE.Material) {
            child.material.dispose()
          }
        }
      })
    })
    
    // Render all root parts
    Array.from(this.roots).forEach(rootId => {
      const body = Array.from(this.bodies.values())
        .find(b => b.rootPartId === rootId)
      if (body && body.transform.position.length() > 0) {
        this.renderBody(body.id)
      }
    })

    // Restore outline selection if needed
    if (selectedObjects.length > 0) {
      // Find the new group for the selected part
      const selectedPartId = selectedObjects[0].userData.partId
      if (selectedPartId) {
        const newGroup = this.findPartGroup(selectedPartId)
        if (newGroup) {
          this.outlinePass.selectedObjects = [newGroup]
        }
      }
    }
    
    // Use composer instead of renderer
    this.composer.render()
  }

  protected cleanupMeshes(currentPartId: string) {
    const currentPart = this.parts.get(currentPartId)
    if (!currentPart) return
    
    // Get all meshes for current part's bones
    const meshesToRemove = this.scene.children.filter(child => {
      if (!(child instanceof THREE.Mesh)) return false
      return currentPart.boneIds.includes(child.userData.boneId)
    })
    
    // Remove meshes and dispose resources
    meshesToRemove.forEach(mesh => {
      this.scene.remove(mesh)
      if (mesh instanceof THREE.Mesh) {
        mesh.geometry.dispose()
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose()
        }
      }
    })
    
    // Recursively clean up child parts
    for (const boneId of currentPart.boneIds) {
      const bone = this.bones.get(boneId)
      if (bone) {
        for (const [childPartId] of bone.children.entries()) {
          this.cleanupMeshes(childPartId)
        }
      }
    }
  }

  protected renderBody(bodyId: string) {
    const body = this.bodies.get(bodyId)
    if (!body) return

    // Clean up all meshes for this body's part hierarchy before rendering
    this.cleanupMeshes(body.rootPartId)

    const worldTransform = new THREE.Matrix4().makeBasis(
      body.transform.right,
      body.transform.up, 
      body.transform.forward
    )
    worldTransform.setPosition(body.transform.position)
    
    this.renderPartHierarchy(body.rootPartId, worldTransform)
  }

  protected calculateBoneBasis(boneDir: THREE.Vector3): {
    right: THREE.Vector3,
    forward: THREE.Vector3
  } {
    const normalizedDir = boneDir.clone().normalize()
    
    // Find a perpendicular vector to use as right
    // First try cross product with world up
    const worldUp = new THREE.Vector3(0, 1, 0)
    let right = new THREE.Vector3().crossVectors(normalizedDir, worldUp).normalize()
    
    // If bone is aligned with world up, use world forward instead
    if (right.lengthSq() < 0.001) {
      const worldForward = new THREE.Vector3(0, 0, 1)
      right = new THREE.Vector3().crossVectors(normalizedDir, worldForward).normalize()
    }
    
    // Calculate forward by crossing right with bone direction
    const forward = new THREE.Vector3().crossVectors(right, normalizedDir).normalize()
    
    return { right, forward }
  }

  protected renderPartHierarchy(
    partId: string, 
    parentWorldTransform: THREE.Matrix4, 
    parentGroup?: THREE.Group,
    parentPartIds: Set<string> = new Set(),
    parentAttributes?: PartAttributes
  ) {
    const part = this.parts.get(partId)
    if (!part) return

    // Store bone to part mapping for each bone in this part
    for (const boneId of part.boneIds) {
      this.bonePartIds.set(boneId, partId)
    }

    // Merge attributes with parent's, allowing override
    const attributes: PartAttributes = {
      ...parentAttributes,
      ...part.attributes
    }
    if (!attributes.color) {
      attributes.color = this.getDefaultColor(part.type)
    }

    // Add debug visualization at transform origin
    if (this.debugMode) {
      const debugGeo = new THREE.CircleGeometry(.05)
      debugGeo.rotateX(Math.PI / 2)
      const debugMat = new THREE.MeshBasicMaterial({ 
        color: 0xff00ff,
        depthTest: false,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
      })
      const debugMesh = new THREE.Mesh(debugGeo, debugMat)
      
      // Extract coordinate system from transform
      const position = new THREE.Vector3()
      const right = new THREE.Vector3()
      const up = new THREE.Vector3()
      const forward = new THREE.Vector3()
      
      position.setFromMatrixPosition(parentWorldTransform)
      parentWorldTransform.extractBasis(right, up, forward)
      
      // Position mesh
      debugMesh.position.copy(position)
      
      // Orient mesh to match coordinate system (up vector is mesh normal)
      debugMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), // Plane's default normal
        up // Orient to match up vector
      )
      
      // Mark for cleanup
      debugMesh.userData.toRemove = true
      debugMesh.renderOrder = 999
      this.scene.add(debugMesh)
    }

    // Add current part to parent IDs for children
    const currentParentIds = new Set(parentPartIds)
    currentParentIds.add(partId)
    
    // Store parent IDs for this part
    this.partParentIds.set(partId, currentParentIds)

    // Find the body this part belongs to
    const body = Array.from(this.bodies.values()).find(b => {
      let currentPart: Part | undefined = part
      while (currentPart) {
        if (b.rootPartId === currentPart.id) return true
        if (!currentPart.parentBoneId) break
        const parentBone = this.bones.get(currentPart.parentBoneId)
        if (!parentBone) break
        currentPart = this.parts.get(parentBone.partId)
      }
      return false
    })
    if (!body) return

    // Create a group for this part
    const partGroup = new THREE.Group()
    partGroup.userData.partId = partId
    partGroup.userData.bodyId = body.id
    
    // Add to parent group if it exists, otherwise add to scene
    if (parentGroup) {
      parentGroup.add(partGroup)
    } else {
      this.scene.add(partGroup)
    }

    let currentTransform = parentWorldTransform.clone()
    
    // Process each bone in sequence
    for (const boneId of part.boneIds) {
      const bone = this.bones.get(boneId)
      if (!bone) continue

      // First rotate current transform by bone's direction
      const rotMatrix = new THREE.Matrix4()
      const worldUpVec = new THREE.Vector3(0, 1, 0)
      
      // Create consistent basis vectors regardless of angle
      const boneDir = bone.direction.clone().normalize()
      
      // Calculate basis vectors
      const { right: boneRight, forward: boneForward } = this.calculateBoneBasis(boneDir)
      
      // First apply twist around local Y axis
      const twistMatrix = new THREE.Matrix4().makeRotationY(bone.twist)
      
      // Then create and apply direction rotation matrix
      rotMatrix.makeBasis(boneRight, boneDir, boneForward)
      
      // Combine transforms in correct order: twist first, then direction
      const finalMatrix = rotMatrix.multiply(twistMatrix)

      // Apply rotation to current transform
      const worldTransform = currentTransform.clone().multiply(finalMatrix)

      // Store transform for this bone
      this.boneTransforms.set(boneId, worldTransform.clone())

      // Create mesh for this bone at current position with new rotation
      const geometry = this.createGeometry(part.type, {
        width: bone.width,
        length: bone.length
      })

      const material = new THREE.MeshStandardMaterial({ 
        color: attributes.color,
        roughness: 0.7,
        metalness: 0.2,
        side: part.type === 'leaf' || part.type === 'flower' ? THREE.DoubleSide : THREE.FrontSide
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      mesh.userData.boneId = boneId
      mesh.userData.bodyId = body.id
      mesh.userData.partId = part.id
      mesh.userData.parentPartIds = Array.from(currentParentIds)

      // Add inner bone for stems
      const isSelectedPart = this.activePartId === part.id
      if (part.type === 'stem' && isSelectedPart) {
        // Create inner bone geometry - slightly smaller than outer bone
        const innerGeo = new THREE.CylinderGeometry(
          bone.width * 0.3, // Inner width
          bone.width * 0.3,
          bone.length * 0.9, // Inner length
          8
        )
        innerGeo.translate(0, bone.length * 0.5, 0) // Center in bone

        // Create material based on selection state
        const isSelected = this.selectedBoneId === boneId
        const innerMat = new THREE.MeshStandardMaterial({
          color: isSelected ? '#ffffff' : '#bbbbbb',
          roughness: 0.9,
          metalness: 0.0,
          depthTest: false,
          transparent: true,
          opacity: 0.7
        })

        const innerMesh = new THREE.Mesh(innerGeo, innerMat)
        innerMesh.renderOrder = 1 // Ensure renders on top
        innerMesh.userData.isInnerBone = true
        innerMesh.userData.boneId = boneId
        innerMesh.userData.partId = part.id
        innerMesh.userData.bodyId = body.id
        
        // Position using bone transform
        innerMesh.position.setFromMatrixPosition(worldTransform)
        
        // Extract coordinate system from transform
        const right = new THREE.Vector3()
        const up = new THREE.Vector3()
        const forward = new THREE.Vector3()
        worldTransform.extractBasis(right, up, forward)
        
        // Orient mesh using full basis
        innerMesh.matrix.makeBasis(right, up, forward)
        innerMesh.matrix.setPosition(innerMesh.position)
        innerMesh.matrixAutoUpdate = false

        // Add to part group instead of mesh
        partGroup.add(innerMesh)
      }

      // Add eyes if this is a head bone and it's a stem
      if (bone.isHead && part.type === 'stem') {
        const eyeGroup = new THREE.Group()
        
        // Create eyes with flat shading
        const eyeGeo = new THREE.SphereGeometry(bone.width * 0.4, 12, 8)
        const eyeMat = new THREE.MeshStandardMaterial({ 
          color: '#ffffff',
          roughness: 0.7,
          metalness: 0.2,
        })
        const pupilGeo = new THREE.SphereGeometry(bone.width * 0.2, 8, 8)
        const pupilMat = new THREE.MeshStandardMaterial({ 
          color: '#000000',
          roughness: 0.7,
          metalness: 0.2,
        })
        
        // Left eye with better positioning
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat)
        leftEye.position.set(bone.width * 1.2, bone.length * 0.8, bone.width * 0.8)
        const leftPupil = new THREE.Mesh(pupilGeo, pupilMat)
        leftPupil.position.z = bone.width * 0.3
        leftEye.add(leftPupil)
        eyeGroup.add(leftEye)
        
        // Right eye with better positioning
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat)
        rightEye.position.set(-bone.width * 1.2, bone.length * 0.8, bone.width * 0.8)
        const rightPupil = new THREE.Mesh(pupilGeo, pupilMat)
        rightPupil.position.z = bone.width * 0.3
        rightEye.add(rightPupil)
        eyeGroup.add(rightEye)
        
        mesh.add(eyeGroup)
      }

      // Position mesh using world transform
      mesh.position.setFromMatrixPosition(worldTransform)
      
      // Extract coordinate system from transform
      const right = new THREE.Vector3()
      const up = new THREE.Vector3()
      const forward = new THREE.Vector3()
      worldTransform.extractBasis(right, up, forward)
      
      // Orient mesh using full basis instead of just up vector
      mesh.matrix.makeBasis(right, up, forward)
      mesh.matrix.setPosition(mesh.position)
      mesh.matrixAutoUpdate = false

      // Add to part group
      partGroup.add(mesh)

      // Add debug visualization if debug mode is on
      if (this.debugMode) {
        const boneStart = new THREE.Vector3().setFromMatrixPosition(worldTransform)
        const arrowMat = new THREE.LineBasicMaterial({
          color: 0xffff00,
          depthTest: false,
          transparent: true,
          opacity: 0.8
        })
        const arrowHelper = new THREE.ArrowHelper(
          up,
          boneStart,
          bone.length,
        )
        arrowHelper.line.material = arrowMat
        arrowHelper.cone.material = arrowMat
        arrowHelper.userData.isDebug = true
        arrowHelper.renderOrder = 999
        partGroup.add(arrowHelper)
      }

      // Process child parts
      for (const [childPartId, attachment] of bone.children.entries()) {
        // Get bone's world transform matrix
        const boneTransform = worldTransform.clone()
        
        // Get bone start position and direction in world space
        const boneStart = new THREE.Vector3().setFromMatrixPosition(boneTransform)
        
        // Calculate attachment point along bone
        const attachPoint = boneStart.clone().add(
          up.clone().multiplyScalar(bone.length * attachment.ratio)
        )

        // Create attachment transform matrix
        const attachmentTransform = new THREE.Matrix4()
        
        // Get parent bone's up direction (bone axis)
        const boneAxis = up.clone().normalize()
        
        let childUp: THREE.Vector3
        let childForward: THREE.Vector3
        
        if (attachment.ratio === 0 || attachment.ratio === 1) {
          // For end attachments, use parent bone direction as up
          childUp = boneAxis.clone()
          
          // Use parent's forward as child's forward to maintain same rotation
          childForward = forward.clone()
          
          // If at start of bone, flip both vectors
          if (attachment.ratio === 0) {
            childUp.negate()
            childForward.negate()
          }
        } else {
          // For side attachments, create perpendicular orientation
          // First find a perpendicular direction based on attachment angle
          const perpDir = new THREE.Vector3(
            Math.cos(attachment.angle),
            0,
            Math.sin(attachment.angle)
          ).normalize()
          
          // Transform perpendicular direction by parent's rotation
          perpDir.applyMatrix4(boneTransform)
          perpDir.sub(boneStart).normalize()
          
          // Add offset from bone surface
          attachPoint.add(perpDir.clone().multiplyScalar(bone.width * 0.9))
          
          // Use perpDir as up and boneAxis as forward
          childUp = perpDir
          childForward = boneAxis.clone()
        }
        
        // Calculate right vector from forward and up
        const childRight = new THREE.Vector3().crossVectors(childForward, childUp).normalize()
        // Recalculate up to ensure orthogonality
        childUp.crossVectors(childRight, childForward).normalize()
        
        // Create final transform
        attachmentTransform.makeBasis(
          childRight,
          childUp,
          childForward
        )
        attachmentTransform.setPosition(attachPoint)
        
        // Recursively render child part
        this.renderPartHierarchy(childPartId, attachmentTransform, partGroup, currentParentIds, attributes)

        // Add debug visualization if debug mode is on
        if (this.debugMode) {
          // Debug vectors with custom materials
          const arrowMat1 = new THREE.LineBasicMaterial({
            color: 0xff0000,
            depthTest: false,
            transparent: true,
            opacity: 0.8
          })
          const arrowMat2 = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            depthTest: false,
            transparent: true,
            opacity: 0.8
          })
          const arrowMat3 = new THREE.LineBasicMaterial({
            color: 0x0000ff,
            depthTest: false,
            transparent: true,
            opacity: 0.8
          })

          // Visualize attachment coordinate system
          const attachHelper1 = new THREE.ArrowHelper(
            childRight,
            attachPoint,
            bone.width * 2,
            0xff0000
          )
          attachHelper1.line.material = arrowMat1
          attachHelper1.cone.material = arrowMat1
          attachHelper1.userData.isDebug = true
          attachHelper1.renderOrder = 999
          partGroup.add(attachHelper1)

          const attachHelper2 = new THREE.ArrowHelper(
            childUp,
            attachPoint,
            bone.width * 2,
            0x00ff00
          )
          attachHelper2.line.material = arrowMat2
          attachHelper2.cone.material = arrowMat2
          attachHelper2.userData.isDebug = true
          attachHelper2.renderOrder = 999
          partGroup.add(attachHelper2)

          const attachHelper3 = new THREE.ArrowHelper(
            childForward,
            attachPoint,
            bone.width * 2,
            0x0000ff
          )
          attachHelper3.line.material = arrowMat3
          attachHelper3.cone.material = arrowMat3
          attachHelper3.userData.isDebug = true
          attachHelper3.renderOrder = 999
          partGroup.add(attachHelper3)

          // Add negative arrows
          const attachHelper1Neg = new THREE.ArrowHelper(
            childRight.clone().negate(),
            attachPoint,
            bone.width * 2,
            0xff0000
          )
          attachHelper1Neg.line.material = arrowMat1
          attachHelper1Neg.cone.material = arrowMat1
          attachHelper1Neg.userData.isDebug = true
          attachHelper1Neg.renderOrder = 999
          partGroup.add(attachHelper1Neg)

          const attachHelper3Neg = new THREE.ArrowHelper(
            childForward.clone().negate(),
            attachPoint,
            bone.width * 2,
            0x0000ff
          )
          attachHelper3Neg.line.material = arrowMat3
          attachHelper3Neg.cone.material = arrowMat3
          attachHelper3Neg.userData.isDebug = true
          attachHelper3Neg.renderOrder = 999
          partGroup.add(attachHelper3Neg)
        }
      }

      // After rendering bone and children, translate current transform forward by bone length
      const translation = new THREE.Matrix4().makeTranslation(0, bone.length, 0)
      currentTransform.multiply(rotMatrix).multiply(translation)
    }
  }

  protected updatePartDrag(worldPosition: THREE.Vector3) {
    if (!this.activePartId) return
    const part = this.parts.get(this.activePartId)
    if (!part || part.boneIds.length === 0) return

    const firstBone = this.bones.get(part.boneIds[0])
    if (!firstBone) return

    // If this part wasn't already a root, make it one
    if (!this.roots.has(part.id)) {
      // Remove from parent's children
      if (part.parentBoneId) {
        const oldParentBone = this.bones.get(part.parentBoneId)
        if (oldParentBone) {
          oldParentBone.children.delete(part.id)
        }
        part.parentBoneId = undefined
      }
      
      // Add to roots
      this.roots.add(part.id)
      
      // Create new body
      this.createBodyForPart(part.id)
    }

    // Find the active body
    const activeBody = Array.from(this.bodies.values()).find(b => b.rootPartId === part.id)
    if (!activeBody) return

    // Check if we're hovering over a stem bone
    this.raycaster.setFromCamera(this.mouse, this.camera)
    
    // Get all stem meshes from scene, excluding meshes from the active part's hierarchy
    const stemMeshes: THREE.Mesh[] = []
    
    this.scene.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return
      
      // Must have a boneId to be a plant part
      if (!child.userData.boneId) return
      
      // Skip if mesh belongs to active part or its parents
      const meshPartId = child.userData.partId
      if (!meshPartId) return

      const parentIds = this.partParentIds.get(meshPartId)
      if (parentIds?.has(part.id)) return
      
      // Find corresponding bone and part
      const bone = this.bones.get(child.userData.boneId)
      if (!bone) return
      const bonePart = this.parts.get(bone.partId)
      if (!bonePart) return
      
      // Only allow attaching to stems
      if (bonePart.type === 'stem') {
        stemMeshes.push(child)
      }
    })
    
    const boneIntersects = this.raycaster.intersectObjects(stemMeshes)
    
    if (boneIntersects.length > 0) {
      const hitMesh = boneIntersects[0].object
      if (!(hitMesh instanceof THREE.Mesh)) return

      // Find corresponding bone
      const parentBone = this.bones.get(hitMesh.userData.boneId)
      if (!parentBone) return

      const parentPart = this.parts.get(parentBone.partId)
      if (parentPart?.type === 'stem') {
        // Store the currently selected part ID before making changes
        const selectedPartId = this.activePartId
        
        // Remove from roots since it's getting a parent
        this.roots.delete(part.id)

        // Get transform from stored map instead of recalculating
        const boneTransform = this.boneTransforms.get(parentBone.id)
        if (!boneTransform) return

        // Extract transform data
        const boneStart = new THREE.Vector3().setFromMatrixPosition(boneTransform)
        const right = new THREE.Vector3()
        const up = new THREE.Vector3()
        const forward = new THREE.Vector3()
        boneTransform.extractBasis(right, up, forward)
        const boneLength = parentBone.length
        
        // Calculate ratio along parent bone using world space positions
        const hitPoint = boneIntersects[0].point
        
        // Project hit point onto bone line to get closest point
        const toHit = new THREE.Vector3().subVectors(hitPoint, boneStart)
        const projectedDistance = toHit.dot(up)
        const ratio = projectedDistance / boneLength
        const clampedRatio = Math.max(0, Math.min(1, ratio))
        
        // Calculate attachment point on bone
        const attachPoint = boneStart.clone().add(up.clone().multiplyScalar(clampedRatio * boneLength))
        
 // Calculate vector from attachment point to mouse in bone's local space
        const toMouse = new THREE.Vector3().subVectors(worldPosition, attachPoint)
        
        // Create inverse rotation matrix to transform toMouse into bone's local space
        const inverseRotation = boneTransform.clone()
        inverseRotation.setPosition(new THREE.Vector3(0, 0, 0))
        inverseRotation.invert()
        
        // Transform toMouse into bone's local space
        const localToMouse = toMouse.clone().applyMatrix4(inverseRotation)
        
        // Project onto XZ plane in local space
        localToMouse.y = 0
        localToMouse.normalize()
        
        // Calculate angle in local XZ plane
        const angle = Math.atan2(localToMouse.z, localToMouse.x)
        
        console.log({ ratio, clampedRatio, degrees: angle * (180 / Math.PI) })
        
        // Remove from old parent if exists
        if (part.parentBoneId) {
          const oldParentBone = this.bones.get(part.parentBoneId)
          if (oldParentBone) {
            oldParentBone.children.delete(part.id)
          }
        }

        // Update parent bone's children
        parentBone.children.set(part.id, {
          partId: part.id,
          ratio: clampedRatio,
          angle: angle
        })

        // Update part's parent reference
        part.parentBoneId = parentBone.id

        // Find root part and render entire body
        let rootPart = parentPart
        while (rootPart.parentBoneId) {
          const parentBone = this.bones.get(rootPart.parentBoneId)
          if (!parentBone) break
          const nextPart = this.parts.get(parentBone.partId)
          if (!nextPart) break
          rootPart = nextPart
        }
        if (rootPart && rootPart.id) {
          this.renderBody(rootPart.id)
          
          // After rendering, find the new group for our selected part
          const newPartGroup = this.findPartGroup(selectedPartId)
          if (newPartGroup) {
            this.outlinePass.selectedObjects = [newPartGroup]
            this.composer.render()
          }
        }
      }
    } else {
      // Store the currently selected part ID before making changes
      const selectedPartId = this.activePartId
      
      // Detaching from parent or initial drag
      if (part.parentBoneId) {
        const oldParentBone = this.bones.get(part.parentBoneId)
        if (oldParentBone) {
          oldParentBone.children.delete(part.id)
        }
        part.parentBoneId = undefined

        // Add back to roots since it's detached
        this.roots.add(part.id)
        
        // Create new body for detached part
        this.createBodyForPart(part.id)
        
        // Render the updated body
        this.renderBody(part.id)
        
        // After rendering, find the new group for our selected part
        const newPartGroup = this.findPartGroup(selectedPartId)
        if (newPartGroup) {
          this.outlinePass.selectedObjects = [newPartGroup]
          this.composer.render()
        }
      }
      
      // Update body position
      if (activeBody) {
        activeBody.transform.position.copy(worldPosition)
        
        // Render the updated body
        this.renderBody(activeBody.id)
      }
    }
  }

  protected endBoneDrag() {
    this.activePartId = undefined
  }

  protected addBone(params: {
    partId: string,
    position: THREE.Vector3,
    length?: number,
    width?: number,
    isHead?: boolean
  }): string {
    const id = Math.random().toString(36).substr(2, 9)
    const length = params.length || 0.3
    const width = params.width || 0.05

    const bone: Bone = {
      id,
      partId: params.partId,
      direction: new THREE.Vector3(0, 1, 0),
      twist: 0,
      length,
      width,
      children: new Map(),
      isHead: params.isHead
    }

    this.bones.set(id, bone)
    return id
  }

  getBones(): Bone[] {
    return Array.from(this.bones.values())
  }

  update(deltaTime: number) {
    // Will handle physics/wind updates here
  }

  addEventListener(event: EventType, callback: EventCallback) {
    if (!this._eventListeners) {
      console.error('Event listeners Map not initialized')
      return
    }
    
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set())
    }
    const listeners = this._eventListeners.get(event)!
    if (!listeners.has(callback)) {
      listeners.add(callback)
    }
  }

  removeEventListener(event: EventType, callback: EventCallback) {
    const listeners = this._eventListeners.get(event)
    if (listeners) {
      listeners.delete(callback)
    }
  }

  protected notifySelect(data: { 
    id: string
    type: PartType
    position: [number, number, number]
    color?: string
    length: number
    width: number
    theta?: number
    phi?: number
    twist?: number
  }) {
    const bone = this.bones.get(data.id)
    if (!bone) {
      console.error('BudEngine: No bone found for id', data.id)
      return
    }

    const partId = this.bonePartIds.get(data.id)
    if (!partId) {
      console.error('BudEngine: No part found for bone', data.id)
      return
    }
    const part = this.parts.get(partId)
    if (!part) {
      console.error('BudEngine: Part not found', partId)
      return
    }

    // Get bone angles
    const dir = bone.direction.clone().normalize()
    const theta = Math.asin(dir.x) * 180 / Math.PI
    const phi = Math.asin(dir.z / Math.cos(theta * Math.PI / 180)) * 180 / Math.PI
    const twist = bone.twist * 180 / Math.PI

    // Use the provided color if it exists, otherwise use the part's color attribute
    const color = data.color !== undefined ? data.color : part.attributes.color

    // Ensure color is always defined and include bone dimensions and angles
    const safeData = {
      ...data,
      color: color || this.getDefaultColor(data.type),
      length: bone.length,
      width: bone.width,
      theta,
      phi,
      twist
    }
    
    if (this.onSelect) {
      this.onSelect(safeData)
    }
  }

  protected notifyDeselect() {
    if (this.onDeselect) {
      this.onDeselect()
    }
  }

  // Make eventListeners accessible for debugging
  get eventListeners(): Map<EventType, Set<EventCallback>> {
    return this._eventListeners
  }

  protected getDefaultColor(type: PartType): string {
    switch (type) {
      case 'stem': return '#44aa44'
      case 'leaf': return '#66cc66'
      case 'thorn': return '#aa4444'
      case 'flower': return '#ffdd88'
    }
  }

  updateBoneAttributes(id: string, attributes: PartAttributes) {
    console.log('BudEngine: Updating bone attributes', {
      id,
      attributes,
      partsKeys: Array.from(this.parts.keys()),
    })

    // Get part ID from bone ID mapping
    const partId = this.bonePartIds.get(id)
    if (!partId) {
      console.error('BudEngine: No part found for bone', id)
      return
    }
    
    const part = this.parts.get(partId)
    if (!part) {
      console.error('BudEngine: Part not found', partId)
      return
    }

    // Update the part's attributes, only changing provided values
    part.attributes = {
      ...part.attributes,
      ...attributes
    }
    if (part.attributes.color === 'none') {
      delete part.attributes.color
    }

    // Update bone dimensions if length or width was changed
    if (attributes.length !== undefined || attributes.width !== undefined) {
      part.boneIds.forEach(boneId => {
        const bone = this.bones.get(boneId)
        if (bone) {
          if (attributes.length !== undefined) {
            bone.length = attributes.length
          }
          if (attributes.width !== undefined) {
            bone.width = attributes.width
          }
        }
      })
    }

    console.log('BudEngine: Updated part attributes', {
      id,
      attributes: part.attributes
    })

    // Find root part and render entire body
    let rootPart = part
    while (rootPart.parentBoneId) {
      const parentBone = this.bones.get(rootPart.parentBoneId)
      if (!parentBone) break
      const nextPart = this.parts.get(parentBone.partId)
      if (!nextPart) break
      rootPart = nextPart
    }

    // Find and render body
    const body = Array.from(this.bodies.values())
      .find(b => b.rootPartId === rootPart.id)
    if (body) {
      this.renderBody(body.id)
    }
  }

  protected addPart(params: {
    worldPosition: THREE.Vector3,
    type: PartType,
    length?: number,
    width?: number,
    isHead?: boolean,
    attributes?: PartAttributes
  }): string {
    const id = Math.random().toString(36).substr(2, 9)
    
    // Create the part with default attributes
    const part: Part = {
      id,
      type: params.type,
      attributes: {
        // Only set default color for leaf, thorn, and flower
        ...(params.type !== 'stem' && { color: this.getDefaultColor(params.type) }),
      },
      boneIds: []
    }
    
    // Create initial bone for the part
    const boneId = this.addBone({
      partId: id,
      position: params.worldPosition.clone(),
      length: params.length || 0.3,
      width: params.width || 0.05,
      isHead: params.isHead
    })
    
    // Add bone to part's sequence
    part.boneIds.push(boneId)
    
    // Log before storing
    console.log('BudEngine: Before storing part', {
      id,
      type: params.type,
      partsMapSize: this.parts.size,
      partsMapKeys: Array.from(this.parts.keys())
    })
    
    // Store the part
    this.parts.set(id, part)
    this.partAdded = true // Set flag when part is added
    
    // Log after storing
    console.log('BudEngine: After storing part', {
      id,
      type: params.type,
      partsMapSize: this.parts.size,
      partsMapKeys: Array.from(this.parts.keys()),
      storedPart: this.parts.get(id),
      partAdded: this.partAdded
    })
    
    // Add to roots since it starts with no parent
    this.roots.add(id)
    
    // Create body for new root part
    const body = this.createBodyForPart(id)

    return id
  }

  protected getBoneIdFromMesh(mesh: THREE.Object3D): string | undefined {
    return mesh.userData.boneId
  }

  // Start dragging a new bone
  startBoneDrag(params: {
    worldPosition: THREE.Vector3,
    type: PartType,
    length?: number,
    width?: number
  }): string {
    // Adjust the world position to be at planting height
    const adjustedPosition = params.worldPosition.clone()
    adjustedPosition.y = this.plantingArea.y

    // Make the first stem created a head
    const isFirstStem = params.type === 'stem' && this.parts.size === 0

    // Create part at the adjusted position
    const partId = this.addPart({
      ...params,
      worldPosition: adjustedPosition,
      isHead: isFirstStem // Only set isHead true for the first stem
    })
    this.activePartId = partId
    
    // Render the body to create the group and meshes
    const body = Array.from(this.bodies.values()).find(b => b.rootPartId === partId)
    if (body) {
      this.renderBody(body.id)
    }
    
    // Now find the part group after rendering
    const partGroup = this.scene.children.find(child => 
      child instanceof THREE.Group && child.userData.partId === partId
    )
    
    if (partGroup) {
      // Set outline on the entire part group
      this.outlinePass.selectedObjects = [partGroup]
      this.composer.render()
    }
    
    return partId
  }

  protected createBodyForPart(partId: string) {
    const part = this.parts.get(partId)
    if (!part) return

    const worldTransform = this.getPartWorldTransform(part, this.bones, this.parts)

    const id = Math.random().toString(36).substr(2, 9)
    const body: Body = {
      id,
      transform: worldTransform,
      rootPartId: partId
    }
    
    this.bodies.set(id, body)
    return body
  }

  protected getPartWorldTransform(part: Part, bones: Map<string, Bone>, parts: Map<string, Part>): Transform {
    // Start with identity transform
    const worldTransform: Transform = {
      position: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      right: new THREE.Vector3(1, 0, 0),
      forward: new THREE.Vector3(0, 0, 1)
    }

    // If part has no parent, it's a root - return planting transform
    if (!part.parentBoneId) {
      return worldTransform
    }

    // Get parent bone and its part
    const parentBone = bones.get(part.parentBoneId)
    if (!parentBone) return worldTransform
    const parentPart = parts.get(parentBone.partId)
    if (!parentPart) return worldTransform

    // Get parent's world transform recursively
    const parentTransform = this.getPartWorldTransform(parentPart, bones, parts)

    // Get attachment data
    const attachment = parentBone.children.get(part.id)
    if (!attachment) return worldTransform

    // Calculate position along parent bone
    const boneStart = parentTransform.position
    const boneDirection = parentTransform.up.clone().multiplyScalar(parentBone.length)
    const attachPoint = boneStart.clone().add(boneDirection.multiplyScalar(attachment.ratio))

    // Calculate rotation
    // First align with parent bone's coordinate system
    worldTransform.up = parentTransform.up.clone()
    worldTransform.right = parentTransform.right.clone()
    worldTransform.forward = parentTransform.forward.clone()

    // Then rotate around bone axis by attachment angle
    const rotationMatrix = new THREE.Matrix4().makeRotationAxis(worldTransform.up, attachment.angle)
    worldTransform.right.applyMatrix4(rotationMatrix)
    worldTransform.forward.applyMatrix4(rotationMatrix)

    // Set final position
    worldTransform.position.copy(attachPoint)

    return worldTransform
  }

  // Add bone to start of stem part
  growStemPart(boneId: string) {
    console.log('BudEngine: Growing stem part', { 
      boneId,
      partsMapSize: this.parts.size,
      partsMap: this.parts,
      hasRequestedPart: this.parts.has(boneId),
      partAdded: this.partAdded
    })

    // Get part ID from bone ID
    const partId = this.bonePartIds.get(boneId)
    if (!partId) {
      console.log('BudEngine: No part found for bone', { boneId })
      return
    }
    
    const part = this.parts.get(partId)
    if (!part || part.type !== 'stem') {
      console.log('BudEngine: Invalid part for growing', { part })
      return
    }
    
    // Create new bone with same properties as first bone
    const firstBone = this.bones.get(part.boneIds[0])
    if (!firstBone) {
      console.log('BudEngine: No first bone found', { boneIds: part.boneIds })
      return
    }
    
    const newBoneId = this.addBone({
      partId,
      position: new THREE.Vector3(), // Position doesn't matter, will be set by transform
      length: firstBone.length,
      width: firstBone.width,
      isHead: false
    })
    console.log('BudEngine: Created new bone', { newBoneId, firstBone })
    
    // Add new bone to start of array
    part.boneIds.unshift(newBoneId)
    console.log('BudEngine: Updated bone array', { boneIds: part.boneIds })
    
    // Find root part and render
    let currentPart = part
    while (currentPart.parentBoneId) {
      const parentBone = this.bones.get(currentPart.parentBoneId)
      if (!parentBone) break
      const parentPart = this.parts.get(parentBone.partId)
      if (!parentPart) break
      currentPart = parentPart
    }
    
    // Find and render body
    const body = Array.from(this.bodies.values())
      .find(b => b.rootPartId === currentPart.id)
    if (body) {
      console.log('BudEngine: Rendering updated body', { bodyId: body.id })
      this.renderBody(body.id)

      // Re-select the new first bone
      this.notifySelect({
        id: newBoneId,
        type: part.type,
        position: [0, 0, 0], // Position will be updated by render
        color: part.attributes.color,
        length: firstBone.length,
        width: firstBone.width
      })

      // Fit camera to updated plant
      this.fitCameraToPlant()
    } else {
      console.log('BudEngine: No body found for part', { rootPartId: currentPart.id })
    }
  }

  // Remove bone from start of stem part
  // Check if a part was added and reset the flag
  wasPartAdded(): boolean {
    const wasAdded = this.partAdded
    this.partAdded = false
    return wasAdded
  }

  protected findPartGroup(partId: string): THREE.Group | undefined {
    let foundGroup: THREE.Group | undefined = undefined
    
    // First try root level for performance
    foundGroup = this.scene.children.find(child => 
      child instanceof THREE.Group && child.userData.partId === partId
    ) as THREE.Group | undefined
    
    // If not found at root, search entire scene hierarchy
    if (!foundGroup) {
      this.scene.traverse(child => {
        if (child instanceof THREE.Group && child.userData.partId === partId) {
          foundGroup = child as THREE.Group
        }
      })
    }
    
    return foundGroup
  }

  protected loadFromLocalStorage() {
    try {
      const savedPlant = localStorage.getItem('bud_plant')
      if (savedPlant) {
        this.loadPlant(savedPlant)
        console.log('Plant loaded from localStorage')
      }
    } catch (error) {
      console.error('Failed to load plant:', error)
    }
  }

  protected serializePlant(): string {
    const rootData = Array.from(this.roots).map(rootId => {
      const body = Array.from(this.bodies.values()).find(b => b.rootPartId === rootId)
      return {
        partData: this.serializePart(rootId),
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

  protected serializePart(partId: string): any {
    const part = this.parts.get(partId)
    if (!part) return null

    const bones = part.boneIds.map(boneId => {
      const bone = this.bones.get(boneId)
      if (!bone) return null

      // Get all child parts of this bone
      const children = Array.from(bone.children.entries()).map(([childId, attachment]) => {
        const childData = this.serializePart(childId)
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

  // Load a serialized plant
  loadPlant(serializedData: string) {
    // Clear current state
    this.clearPlant()
    
    const rootData = JSON.parse(serializedData)
    rootData.forEach((data: any) => {
      const rootId = this.loadPartData(data.partData)
      if (rootId) {
        this.roots.add(rootId)
        
        // If we have transform data, apply it to the body
        if (data.transform) {
          const body = Array.from(this.bodies.values()).find(b => b.rootPartId === rootId)
          if (body) {
            body.transform.position.fromArray(data.transform.position)
            body.transform.up.fromArray(data.transform.up)
            body.transform.right.fromArray(data.transform.right)
            body.transform.forward.fromArray(data.transform.forward)
          }
        }
      }
    })

    // Force re-render all root parts
    Array.from(this.roots).forEach(rootId => {
      const body = Array.from(this.bodies.values()).find(b => b.rootPartId === rootId)
      if (body) {
        this.renderBody(body.id)
      }
    })

    // Force a render to show everything
    this.composer.render()
  }

  protected loadPartData(partData: any, parentBoneId?: string): string | null {
    const partId = Math.random().toString(36).substr(2, 9)
    const part: Part = {
      id: partId,
      type: partData.type,
      attributes: partData.attributes || { color: undefined },
      boneIds: [],
      parentBoneId
    }

    // Create bones
    partData.bones.forEach((boneData: any) => {
      const boneId = this.addBone({
        partId,
        position: new THREE.Vector3(), // Will be set by transform
        length: boneData.length,
        width: boneData.width,
        isHead: boneData.isHead
      })

      // Process children
      const bone = this.bones.get(boneId)
      if (bone) {
        // Restore bone direction and twist if they exist
        if (boneData.direction) {
          bone.direction.fromArray(boneData.direction)
        }
        if (boneData.twist !== undefined) {
          bone.twist = boneData.twist
        }

        boneData.children.forEach((childData: any) => {
          const childId = this.loadPartData(childData.part, boneId)
          if (childId) {
            bone.children.set(childId, childData.attachment)
          }
        })
      }
    })

    this.parts.set(partId, part)

    // If this is a root part, create a body for it
    if (!parentBoneId) {
      this.createBodyForPart(partId)
    }

    return partId
  }

  // Clear the current plant
  clearPlant() {
    this.bodies.clear()
    this.parts.clear()
    this.bones.clear()
    this.roots.clear()
    this.partParentIds.clear()
    this.composer.render()
  }

  // Remove bone from start of stem part
  shrinkStemPart(boneId: string) {
    console.log('BudEngine: Shrinking stem part', { boneId })

    // Get part ID from bone ID
    const partId = this.bonePartIds.get(boneId)
    if (!partId) {
      console.log('BudEngine: No part found for bone', { boneId })
      return
    }
    
    const part = this.parts.get(partId)
    if (!part || part.type !== 'stem') {
      console.log('BudEngine: Invalid part for shrinking', { part })
      return
    }
    
    // Don't remove if only one bone left
    if (part.boneIds.length <= 1) {
      console.log('BudEngine: Cannot shrink - only one bone left', { boneCount: part.boneIds.length })
      return // Can't remove if has attachments
    }
    
    // Get first bone
    const firstBone = this.bones.get(part.boneIds[0])
    if (!firstBone) {
      console.log('BudEngine: No first bone found', { boneIds: part.boneIds })
      return
    }
    
    // Check if first bone has any children
    if (firstBone.children.size > 0) {
      console.log('BudEngine: Cannot shrink - bone has children', { childCount: firstBone.children.size })
      return // Can't remove if has attachments
    }
    
    // Remove bone from array and delete it
    const removedBoneId = part.boneIds.shift()
    if (removedBoneId) {
      this.bones.delete(removedBoneId)
      console.log('BudEngine: Removed bone', { removedBoneId, remainingBones: part.boneIds })
    }
    
    // Find root part and render
    let currentPart = part
    while (currentPart.parentBoneId) {
      const parentBone = this.bones.get(currentPart.parentBoneId)
      if (!parentBone) break
      const parentPart = this.parts.get(parentBone.partId)
      if (!parentPart) break
      currentPart = parentPart
    }
    
    // Find and render body
    const body = Array.from(this.bodies.values())
      .find(b => b.rootPartId === currentPart.id)
    if (body) {
      console.log('BudEngine: Rendering updated body', { bodyId: body.id })
      this.renderBody(body.id)

      // Re-select the new first bone
      const newFirstBone = this.bones.get(part.boneIds[0])
      if (newFirstBone) {
        this.notifySelect({
          id: newFirstBone.id,
          type: part.type,
          position: [0, 0, 0], // Position will be updated by render
          color: part.attributes.color,
          length: newFirstBone.length,
          width: newFirstBone.width
        })
      }
    } else {
      console.log('BudEngine: No body found for part', { rootPartId: currentPart.id })
    }
  }

  updateProperties(boneId: string, updates: {
    color?: string
    length?: number
    width?: number
    theta?: number
    phi?: number
    twist?: number
  }) {
    // Get the bone
    const bone = this.bones.get(boneId)
    if (!bone) {
      console.error('BudEngine: No bone found for id', boneId)
      return
    }

    // Get the part
    const partId = this.bonePartIds.get(boneId)
    if (!partId) {
      console.error('BudEngine: No part found for bone', boneId)
      return
    }
    const part = this.parts.get(partId)
    if (!part) {
      console.error('BudEngine: Part not found', partId)
      return
    }

    // Update part attributes
    if (updates.color !== undefined || updates.length !== undefined || updates.width !== undefined) {
      const attributes: PartAttributes = {}
      if (updates.color !== undefined) {
        if (updates.color === 'none') {
          delete part.attributes.color
        } else {
          attributes.color = updates.color
        }
      }
      if (updates.length !== undefined) {
        attributes.length = updates.length
        // Update all bones in the part
        part.boneIds.forEach(id => {
          const b = this.bones.get(id)
          if (b) b.length = updates.length!
        })
      }
      if (updates.width !== undefined) {
        attributes.width = updates.width
        // Update all bones in the part
        part.boneIds.forEach(id => {
          const b = this.bones.get(id)
          if (b) b.width = updates.width!
        })
      }
      part.attributes = {
        ...part.attributes,
        ...attributes
      }
    }

    // Update bone twist first
    if (updates.twist !== undefined) {
      bone.twist = updates.twist * Math.PI / 180
    }

    // Then update bone angles if needed
    if (updates.theta !== undefined || updates.phi !== undefined) {
      // Convert angles to radians
      // theta: XY angle (-90 to +90, 0 = vertical, + = tilt left, - = tilt right)
      // phi: XZ angle (-90 to +90, 0 = vertical, + = tilt back, - = tilt forward)
      const thetaRad = updates.theta !== undefined 
        ? updates.theta * Math.PI / 180
        : Math.atan2(bone.direction.x, bone.direction.y)
      const phiRad = updates.phi !== undefined 
        ? updates.phi * Math.PI / 180
        : Math.atan2(bone.direction.z, bone.direction.y)

      // Convert from spherical angles to direction vector
      // First calculate the vertical component
      const y = Math.cos(thetaRad) * Math.cos(phiRad)
      
      // Then calculate horizontal components
      const x = Math.sin(thetaRad)
      const z = Math.sin(phiRad) * Math.cos(thetaRad)
      
      bone.direction.set(x, y, z).normalize()
    }

    // Find root part and render entire body
    let rootPart = part
    while (rootPart.parentBoneId) {
      const parentBone = this.bones.get(rootPart.parentBoneId)
      if (!parentBone) break
      const nextPart = this.parts.get(parentBone.partId)
      if (!nextPart) break
      rootPart = nextPart
    }

    // Find and render body
    const body = Array.from(this.bodies.values())
      .find(b => b.rootPartId === rootPart.id)
    if (body) {
      this.renderBody(body.id)
    }
  }

  // Add method to toggle bloom
  toggleBloom(enabled?: boolean) {
    this.bloomEnabled = enabled !== undefined ? enabled : !this.bloomEnabled
    this.bloomPass.enabled = this.bloomEnabled
  }

  // Add method to check if bloom is enabled
  isBloomEnabled(): boolean {
    return this.bloomEnabled
  }

  // Delete a part and all its children recursively
  deletePart(boneId: string) {
    // Get part ID from bone ID
    const partId = this.bonePartIds.get(boneId)
    if (!partId) return

    const part = this.parts.get(partId)
    if (!part) return

    // Recursively collect all child parts to delete
    const partsToDelete = new Set<string>()
    const collectChildren = (currentPartId: string) => {
      partsToDelete.add(currentPartId)
      const currentPart = this.parts.get(currentPartId)
      if (!currentPart) return

      // For each bone in the part
      for (const boneId of currentPart.boneIds) {
        const bone = this.bones.get(boneId)
        if (!bone) continue

        // For each child of the bone
        for (const [childPartId] of bone.children.entries()) {
          collectChildren(childPartId)
        }
      }
    }
    collectChildren(partId)

    // Remove from parent's children if it has a parent
    if (part.parentBoneId) {
      const parentBone = this.bones.get(part.parentBoneId)
      if (parentBone) {
        parentBone.children.delete(partId)
      }
    }

    // Delete all collected parts and their bones
    for (const partIdToDelete of partsToDelete) {
      const partToDelete = this.parts.get(partIdToDelete)
      if (!partToDelete) continue

      // Delete all bones for this part
      for (const boneId of partToDelete.boneIds) {
        this.bones.delete(boneId)
        this.boneTransforms.delete(boneId)
        this.bonePartIds.delete(boneId)
      }

      // Remove from roots if it was a root
      this.roots.delete(partIdToDelete)

      // Remove from parts map
      this.parts.delete(partIdToDelete)
      this.partParentIds.delete(partIdToDelete)

      // Remove any body that had this as root
      for (const [bodyId, body] of this.bodies.entries()) {
        if (body.rootPartId === partIdToDelete) {
          this.bodies.delete(bodyId)
        }
      }
    }

    // If the deleted part had a parent, re-render its root
    if (part.parentBoneId) {
      const parentBone = this.bones.get(part.parentBoneId)
      if (parentBone) {
        let currentPart = this.parts.get(parentBone.partId)
        while (currentPart?.parentBoneId) {
          const parentBone = this.bones.get(currentPart.parentBoneId)
          if (!parentBone) break
          currentPart = this.parts.get(parentBone.partId)
        }
        if (currentPart) {
          const body = Array.from(this.bodies.values())
            .find(b => b.rootPartId === currentPart!.id)
          if (body) {
            this.renderBody(body.id)
          }
        }
      }
    }

    this.notifyDeselect()
  }

  protected clonePartHierarchy(sourceBoneId: string, newParentBoneId?: string): string | null {
    // Get source part info
    const sourcePartId = this.bonePartIds.get(sourceBoneId)
    if (!sourcePartId) return null
    
    const sourcePart = this.parts.get(sourcePartId)
    if (!sourcePart) return null

    // Create new part
    const newPartId = Math.random().toString(36).substr(2, 9)
    const newPart: Part = {
      id: newPartId,
      type: sourcePart.type,
      attributes: { ...sourcePart.attributes },
      boneIds: [],
      parentBoneId: newParentBoneId
    }

    // Clone each bone in the part
    for (const sourceBoneId of sourcePart.boneIds) {
      const sourceBone = this.bones.get(sourceBoneId)
      if (!sourceBone) continue

      // Create new bone with same properties
      const newBoneId = this.addBone({
        partId: newPartId,
        position: new THREE.Vector3(), // Position will be set by transform
        length: sourceBone.length,
        width: sourceBone.width,
        isHead: sourceBone.isHead
      })

      // Copy bone properties
      const newBone = this.bones.get(newBoneId)
      if (!newBone) continue // Skip if bone creation failed

      newBone.direction.copy(sourceBone.direction)
      newBone.twist = sourceBone.twist

      newPart.boneIds.push(newBoneId)

      // Recursively clone children
      for (const [childPartId, attachment] of sourceBone.children.entries()) {
        const childPart = this.parts.get(childPartId)
        if (!childPart) continue

        const childBoneId = childPart.boneIds[0]
        if (!childBoneId) continue

        const newChildPartId = this.clonePartHierarchy(childBoneId, newBoneId)
        if (newChildPartId) {
          newBone.children.set(newChildPartId, { ...attachment })
        }
      }
    }

    // Store the new part
    this.parts.set(newPartId, newPart)
    return newPartId
  }

  clonePart(boneId: string) {
    // Get part ID from bone ID
    const partId = this.bonePartIds.get(boneId)
    if (!partId) {
      console.error('BudEngine: No part found for bone', boneId)
      return
    }

    const sourcePart = this.parts.get(partId)
    if (!sourcePart) {
      console.error('BudEngine: Part not found', partId)
      return
    }

    // Use main pot position instead of part type pot
    if (!this.mainPot) {
      console.error('BudEngine: Main pot not found')
      return
    }

    // Create position slightly in front of the main pot
    const potPosition = this.mainPot.position.clone()
    const offset = new THREE.Vector3(0, -.5, 1.5) // Slightly above and in front
    const newPosition = potPosition.clone().add(offset)

    // Clone the entire hierarchy
    const newPartId = this.clonePartHierarchy(boneId)
    if (!newPartId) {
      console.error('BudEngine: Failed to clone part hierarchy')
      return
    }

    // Add to roots since it's a new independent part
    this.roots.add(newPartId)

    // Create body for new part
    const body = this.createBodyForPart(newPartId)
    if (body) {
      // Set the body position
      body.transform.position.copy(newPosition)
      
      this.renderBody(body.id)

      // Select the first bone of the new part
      const newPart = this.parts.get(newPartId)
      if (newPart && newPart.boneIds.length > 0) {
        const newBoneId = newPart.boneIds[0]
        const newBone = this.bones.get(newBoneId)
        if (newBone) {
          this.notifySelect({
            id: newBoneId,
            type: sourcePart.type,
            position: newPosition.toArray(),
            color: sourcePart.attributes.color,
            length: newBone.length,
            width: newBone.width,
            theta: Math.asin(newBone.direction.x) * 180 / Math.PI,
            phi: Math.asin(newBone.direction.z / Math.cos(Math.asin(newBone.direction.x))) * 180 / Math.PI,
            twist: newBone.twist * 180 / Math.PI
          })
        }
      }

      // Fit camera to include the cloned part
      this.fitCameraToPlant()
    }
  }

  // Make public
  fitCameraToPlant() {
    // Create a bounding box to encompass all plant parts
    const bbox = new THREE.Box3()
    
    // Add main pot to bounding box as minimum size reference
    if (this.mainPot) {
      bbox.expandByObject(this.mainPot)
    }

    // Add all plant parts to bounding box
    this.scene.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return
      if (!child.userData.boneId) return
      bbox.expandByObject(child)
    })

    // Get bounding box center and size
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    bbox.getCenter(center)
    bbox.getSize(size)

    // Calculate camera distance based on bounding box size
    const maxDim = Math.max(size.x, size.y, size.z)
    const distance = maxDim * 2.5 // Adjust multiplier for tighter/looser fit

    // Update camera position while maintaining current angles
    const currentPos = new THREE.Vector3()
    this.camera.getWorldPosition(currentPos)
    const direction = currentPos.clone().sub(center).normalize()
    const newPosition = center.clone().add(direction.multiplyScalar(distance))
    
    // Smoothly move camera to new position
    this.camera.position.copy(newPosition)
    
    // Update controls target to box center
    this.controls.target.copy(center)
    this.controls.update()
  }

  // Apply properties to all parts of a given type
  applyPropertiesToAllOfType(boneId: string) {
    // Get source part from bone ID
    const sourcePartId = this.bonePartIds.get(boneId)
    if (!sourcePartId) return
    
    const sourcePart = this.parts.get(sourcePartId)
    if (!sourcePart || sourcePart.type === 'stem') return

    // Get source bone to get actual dimensions
    const sourceBone = this.bones.get(boneId)
    if (!sourceBone) return

    // Get properties to apply - use actual bone dimensions
    const properties = {
      color: sourcePart.attributes.color,
      length: sourceBone.length,
      width: sourceBone.width
    }

    // Keep track of bodies that need re-rendering
    const bodiesToRender = new Set<string>()

    // Apply to all parts of the same type
    for (const [partId, part] of this.parts.entries()) {
      if (part.type === sourcePart.type && partId !== sourcePartId) {
        // Update part attributes
        part.attributes = {
          ...part.attributes,
          color: properties.color
        }

        // Update bone dimensions
        part.boneIds.forEach(boneId => {
          const bone = this.bones.get(boneId)
          if (bone) {
            bone.length = properties.length
            bone.width = properties.width
          }
        })

        // Find root part and add its body to render list
        let rootPart = part
        while (rootPart.parentBoneId) {
          const parentBone = this.bones.get(rootPart.parentBoneId)
          if (!parentBone) break
          const nextPart = this.parts.get(parentBone.partId)
          if (!nextPart) break
          rootPart = nextPart
        }

        // Find body and add to render set
        const body = Array.from(this.bodies.values())
          .find(b => b.rootPartId === rootPart.id)
        if (body) {
          bodiesToRender.add(body.id)
        }
      }
    }

    // Render all affected bodies
    for (const bodyId of bodiesToRender) {
      this.renderBody(bodyId)
    }
  }

  // Add public method to set plant data
  setPlantData(data: PlantData) {
    this.parts = new Map(data.parts)
    this.bones = new Map(data.bones)
    this.bodies = new Map(data.bodies)
    this.roots = new Set(data.roots)
    this.renderPlant(data)
  }

  // Add public method to get plant data
  getPlantData(): PlantData {
    return {
      parts: this.parts,
      bones: this.bones,
      bodies: this.bodies,
      roots: this.roots
    }
  }
}