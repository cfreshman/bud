import * as THREE from 'three'
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
// @ts-ignore
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
// @ts-ignore
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass'
// @ts-ignore
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass'
import { InputManager } from './InputManager'

export type PartType = 'stem' | 'leaf' | 'thorn' | 'flower'

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
  // Visual
  color?: THREE.Color
  // Bone sequence that makes up this part
  boneIds: string[]       // Ordered list of bone IDs making up this part
  // Attachment to parent
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

export class BudEngine {
  private bodies: Map<string, Body> = new Map()
  private parts: Map<string, Part> = new Map()
  private bones: Map<string, Bone> = new Map()
  private roots: Set<string> = new Set() // Track root part IDs
  private partParentIds: Map<string, Set<string>> = new Map() // Track parent IDs for each part
  private scene: THREE.Scene
  private uiScene: THREE.Scene  // Separate scene for UI elements
  private camera: THREE.PerspectiveCamera
  private uiCamera: THREE.OrthographicCamera
  private renderer: THREE.WebGLRenderer
  private partPreviews: PartPreview[] = []
  private activePartId?: string
  private selectedPartType?: PartType
  private raycaster = new THREE.Raycaster()
  private mouse = new THREE.Vector2()
  private dragStartPosition = new THREE.Vector3()
  private isDragging = false
  private controls: OrbitControls
  private inputManager: InputManager
  private partPots: Map<PartType, THREE.Mesh> = new Map()
  private partMeshes: Map<PartType, THREE.Mesh> = new Map()
  private mainPot?: THREE.Mesh
  private mainDirt?: THREE.Mesh
  private plantingArea: THREE.Vector3 = new THREE.Vector3(0, 0.4, 0)
  private plantingRadius: number = 0.5
  private _eventListeners: Map<EventType, Set<EventCallback>> = new Map()
  private selectedBoneId?: string
  private composer: EffectComposer
  private outlinePass: OutlinePass
  private dragOffset: THREE.Vector3 = new THREE.Vector3()
  private groundPlane: THREE.Mesh
  private mouseDown = false
  private onSelect?: (data: { id: string, type: PartType, position: [number, number, number], color: string }) => void
  private onDeselect?: () => void
  private debugMode: boolean = true  // Add debug flag
  
  constructor(container: HTMLElement, callbacks?: { 
    onSelect?: (data: { id: string, type: PartType, position: [number, number, number], color: string }) => void
    onDeselect?: () => void 
  }) {
    this.onSelect = callbacks?.onSelect
    this.onDeselect = callbacks?.onDeselect
    
    // Main scene setup
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#eeebe6')
    
    // Initialize event listeners
    this._eventListeners.set('select', new Set())
    this._eventListeners.set('deselect', new Set())
    
    // UI scene setup
    this.uiScene = new THREE.Scene()
    
    // Camera setup
    const aspect = container.clientWidth / container.clientHeight
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000)
    this.camera.position.set(2.5, 2.5, -.75)
    this.camera.lookAt(0, 0, 0)
    
    // UI camera (orthographic for 2D panel)
    const uiHeight = 1
    const uiWidth = uiHeight * aspect
    this.uiCamera = new THREE.OrthographicCamera(
      -uiWidth, uiWidth,
      uiHeight, -uiHeight,
      0.1, 10
    )
    this.uiCamera.position.z = 1
    
    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      depth: true // Enable depth buffer
    })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.setClearColor('#eeebe6', 1)
    this.renderer.autoClear = true
    this.renderer.sortObjects = true // Enable proper depth sorting
    container.appendChild(this.renderer.domElement)
    
    // Remove existing ground plane and add pot and dirt instead
    this.setupPotAndDirt()
    
    // Enable shadows
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // Brighter ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.7)
    this.scene.add(ambientLight)
    
    // Brighter directional light with better position
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.2)
    directionalLight.position.set(2, 4, 2)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    directionalLight.shadow.camera.near = 0.1
    directionalLight.shadow.camera.far = 20
    directionalLight.shadow.camera.left = -5
    directionalLight.shadow.camera.right = 5
    directionalLight.shadow.camera.top = 5
    directionalLight.shadow.camera.bottom = -5
    directionalLight.shadow.bias = -0.001 // Reduce shadow artifacts
    this.scene.add(directionalLight)

    // Add fill light from opposite side
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5)
    fillLight.position.set(-2, 2, -2)
    this.scene.add(fillLight)
    
    // Add grid helper with lighter colors
    const gridHelper = new THREE.GridHelper(10, 10, '#888888', '#000000')
    gridHelper.position.y = 0 // Ensure grid is at ground level
    this.scene.add(gridHelper)
    
    // Add invisible ground plane for better intersection
    const groundGeo = new THREE.PlaneGeometry(10, 10)
    const groundMat = new THREE.MeshBasicMaterial({ 
      visible: false,
      side: THREE.DoubleSide
    })
    this.groundPlane = new THREE.Mesh(groundGeo, groundMat)
    this.groundPlane.rotation.x = -Math.PI / 2 // Rotate to be horizontal
    this.groundPlane.position.y = 0
    this.scene.add(this.groundPlane)
    
    // Event listeners
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown.bind(this))
    this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this))
    this.renderer.domElement.addEventListener('mouseup', this.onMouseUp.bind(this))
    window.addEventListener('resize', this.onResize.bind(this))
    
    // Add orbit controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.screenSpacePanning = true
    this.controls.minDistance = 1
    this.controls.maxDistance = 10
    this.controls.maxPolarAngle = Math.PI / 2 // Don't allow camera below ground
    this.controls.target.set(0, 0.4, 0) // Look at planting area
    this.controls.update()

    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    }
    
    // Initialize input manager
    this.inputManager = new InputManager(this.controls)
    
    // Setup post-processing
    this.composer = new EffectComposer(this.renderer)
    
    // Must set up render pass first
    const renderPass = new RenderPass(this.scene, this.camera)
    this.composer.addPass(renderPass)
    
    // Setup outline pass with more visible settings
    this.outlinePass = new OutlinePass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      this.scene,
      this.camera
    )
    this.outlinePass.visibleEdgeColor.set('#ffffff') // White outline
    this.outlinePass.hiddenEdgeColor.set('#ffffff')
    this.outlinePass.edgeStrength = 3 // Reverted from 10
    this.outlinePass.edgeGlow = 0 // Reverted from 1
    this.outlinePass.edgeThickness = 1 // Reverted from 4
    this.outlinePass.pulsePeriod = 0
    this.outlinePass.usePatternTexture = false
    this.composer.addPass(this.outlinePass)

    // Make sure we're using the composer instead of renderer directly
    this.renderer.autoClear = false // Important for post-processing
    this.renderer.setClearColor('#eeebe6', 1)
    
    // Start render loop
    this.animate()
  }

  private setupPotAndDirt() {
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
      ['flower', '#ee88ee'] // Brighter purple
    ]

    const radius = 2 // Distance from center
    const startAngle = -Math.PI / 3 // Start from -60 degrees
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
      switch(type) {
        case 'stem':
          previewHeight += 0.1 // Half height of stem
          break
        case 'leaf':
          previewHeight += 0.1 // Half height of leaf
          break
        case 'thorn':
          previewHeight += 0.075 // Half height of thorn
          break
        case 'flower':
          previewHeight += 0.08 // Radius of sphere
          break
      }
      mesh.position.set(x, previewHeight, z)
      this.scene.add(mesh)
      this.partMeshes.set(type, mesh)
    })
  }

  private createPartPreview(type: PartType, color: string): THREE.Mesh {
    let geometry: THREE.BufferGeometry
    const scale = 1.5 // Make preview parts a bit larger

    switch (type) {
      case 'stem':
        geometry = new THREE.CylinderGeometry(0.03 * scale, 0.03 * scale, 0.2 * scale, 8)
        break
      case 'leaf':
        geometry = new THREE.CircleGeometry(0.12 * scale, 16)
        break
      case 'thorn':
        geometry = new THREE.ConeGeometry(0.04 * scale, 0.15 * scale, 4)
        break
      case 'flower':
        geometry = new THREE.SphereGeometry(0.08 * scale, 8, 8)
        break
    }

    const material = new THREE.MeshStandardMaterial({ 
      color,
      roughness: 0.7,
      metalness: 0.2,
      side: type === 'leaf' ? THREE.DoubleSide : THREE.FrontSide // Make leaves visible from both sides
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

  private onMouseDown(event: MouseEvent) {
    this.mouseDown = true
    this.mouse.x = (event.clientX / this.renderer.domElement.clientWidth) * 2 - 1
    this.mouse.y = -(event.clientY / this.renderer.domElement.clientHeight) * 2 + 1
    
    this.dragStartPosition.set(event.clientX, event.clientY, 0)
    
    // Get all valid meshes to check for intersection
    const validMeshes: THREE.Object3D[] = []
    
    // Add preview meshes
    validMeshes.push(...Array.from(this.partMeshes.values()))
    
    // Add all plant part meshes
    this.scene.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return
      if (!child.userData.boneId) return
      validMeshes.push(child)
    })
    
    // Check for intersections with all valid meshes
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const intersects = this.raycaster.intersectObjects(validMeshes, false)
    
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

        this.notifySelect({
          id,
          type: selectedType,
          position: intersects[0].point.toArray(),
          color: this.getDefaultColor(selectedType)
        })
        return
      }
      
      // Otherwise this is a plant part mesh
      // Find the parent group (part)
      let partGroup = selectedObject.parent
      while (partGroup && !(partGroup instanceof THREE.Group)) {
        partGroup = partGroup.parent
      }
      
      if (partGroup && partGroup.userData.partId) {
        this.controls.enableRotate = false
        const selectedPart = this.parts.get(partGroup.userData.partId)
        if (!selectedPart) return

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
          color: this.getDefaultColor(selectedPart.type)
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

  private onMouseMove(event: MouseEvent) {
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

  private onMouseUp(event: MouseEvent) {
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

  private onResize = () => {
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

  private animate = () => {
    requestAnimationFrame(this.animate)
    this.controls.update()
    
    // Store currently selected objects before cleanup
    const selectedObjects = this.outlinePass.selectedObjects

    // Clear all groups at start of frame EXCEPT:
    // 1. Non-group objects
    // 2. Ground plane (isGround)
    // 3. Part previews (isPartPreview)
    // 4. Part pots and dirt
    // 5. Debug spheres
    const groupsToRemove = this.scene.children.filter(child => {
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
        const newGroup = this.scene.children.find(child =>
          child instanceof THREE.Group && child.userData.partId === selectedPartId
        )
        if (newGroup) {
          this.outlinePass.selectedObjects = [newGroup]
        }
      }
    }
    
    // Use composer instead of renderer
    this.composer.render()
  }

  private cleanupMeshes(currentPartId: string) {
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
        for (const [childPartId] of bone.children) {
          this.cleanupMeshes(childPartId)
        }
      }
    }
  }

  private renderBody(bodyId: string) {
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

  private renderPartHierarchy(
    partId: string, 
    parentWorldTransform: THREE.Matrix4, 
    parentGroup?: THREE.Group,
    parentPartIds: Set<string> = new Set()
  ) {
    const part = this.parts.get(partId)
    if (!part) return

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

      // Calculate bone's local transform
      const localTransform = new THREE.Matrix4()
      const worldUp = new THREE.Vector3(0, 1, 0)
      
      // Create rotation matrix from bone's direction
      if (Math.abs(bone.direction.dot(worldUp)) < 0.99) {
        const right = new THREE.Vector3().crossVectors(worldUp, bone.direction).normalize()
        const forward = new THREE.Vector3().crossVectors(bone.direction, right).normalize()
        localTransform.makeBasis(right, bone.direction, forward)
      } else {
        const right = new THREE.Vector3(1, 0, 0)
        const forward = new THREE.Vector3(0, 0, 1)
        localTransform.makeBasis(right, bone.direction, forward)
      }

      // Apply twist if any
      if (bone.twist !== 0) {
        const twistMatrix = new THREE.Matrix4().makeRotationAxis(bone.direction, bone.twist)
        localTransform.multiply(twistMatrix)
      }

      // Apply current world transform
      const worldTransform = currentTransform.clone().multiply(localTransform)

      // Create mesh for this bone
      let geometry: THREE.BufferGeometry
      let material: THREE.Material
      
      switch (part.type) {
        case 'stem':
          geometry = new THREE.CylinderGeometry(bone.width, bone.width, bone.length, 8)
          material = new THREE.MeshStandardMaterial({ 
            color: part.color || '#44aa44',
            transparent: false,
            opacity: 1
          })
          break
        case 'leaf':
          geometry = new THREE.CircleGeometry(bone.width * 4, 16)
          material = new THREE.MeshStandardMaterial({ 
            color: part.color || '#66cc66',
            side: THREE.DoubleSide
          })
          break
        case 'thorn':
          geometry = new THREE.ConeGeometry(bone.width * 2, bone.length, 4)
          material = new THREE.MeshStandardMaterial({ 
            color: part.color || '#aa4444'
          })
          break
        case 'flower':
          geometry = new THREE.SphereGeometry(bone.width * 3, 8, 8)
          material = new THREE.MeshStandardMaterial({ 
            color: part.color || '#cc66cc'
          })
          break
      }
      geometry.translate(0, bone.length / 2, 0)

      const mesh = new THREE.Mesh(geometry, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      mesh.userData.boneId = boneId
      mesh.userData.bodyId = body.id
      mesh.userData.partId = partId
      mesh.userData.parentPartIds = Array.from(currentParentIds)

      // Position and rotate mesh using world transform
      mesh.position.setFromMatrixPosition(worldTransform)
      
      // Get the same direction we use for the green arrow
      const boneUp = new THREE.Vector3(0, 1, 0).applyMatrix4(worldTransform).normalize()
      
      // Directly align mesh with boneUp
      const meshUp = new THREE.Vector3(0, 1, 0)
      mesh.quaternion.setFromUnitVectors(meshUp, boneUp)

      // Add to part group
      partGroup.add(mesh)

      // Add debug visualization if debug mode is on
      if (0 && this.debugMode) {
        const boneStart = new THREE.Vector3().setFromMatrixPosition(worldTransform)
        const boneUp = new THREE.Vector3(0, 1, 0).applyMatrix4(worldTransform).normalize()
        
        // Calculate boneRight as perpendicular to boneUp and world forward
        const worldForward = new THREE.Vector3(0, 0, 1)
        const boneRight = new THREE.Vector3().crossVectors(worldForward, boneUp).normalize()
        
        // Calculate boneForward to complete orthonormal basis
        const boneForward = new THREE.Vector3().crossVectors(boneUp, boneRight).normalize()

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

        // Create arrow helpers showing bone's transform
        // Red = right, Green = up, Blue = forward
        const arrowHelper1 = new THREE.ArrowHelper(
          boneRight,
          boneStart,
          bone.width,
          0xff0000
        )
        arrowHelper1.line.material = arrowMat1
        arrowHelper1.cone.material = arrowMat1
        arrowHelper1.userData.isDebug = true
        arrowHelper1.renderOrder = 999
        partGroup.add(arrowHelper1)

        // Add negative right arrow (red)
        const arrowHelper1Neg = new THREE.ArrowHelper(
          boneRight.clone().negate(),
          boneStart,
          bone.width,
          0xff0000
        )
        arrowHelper1Neg.line.material = arrowMat1
        arrowHelper1Neg.cone.material = arrowMat1
        arrowHelper1Neg.userData.isDebug = true
        arrowHelper1Neg.renderOrder = 999
        partGroup.add(arrowHelper1Neg)

        const arrowHelper2 = new THREE.ArrowHelper(
          boneUp,
          boneStart,
          bone.length,
          0x00ff00
        )
        arrowHelper2.line.material = arrowMat2
        arrowHelper2.cone.material = arrowMat2
        arrowHelper2.userData.isDebug = true
        arrowHelper2.renderOrder = 999
        partGroup.add(arrowHelper2)

        const arrowHelper3 = new THREE.ArrowHelper(
          boneForward,
          boneStart,
          bone.width,
          0x0000ff
        )
        arrowHelper3.line.material = arrowMat3
        arrowHelper3.cone.material = arrowMat3
        arrowHelper3.userData.isDebug = true
        arrowHelper3.renderOrder = 999
        partGroup.add(arrowHelper3)

        // Add negative forward arrow (blue)
        const arrowHelper3Neg = new THREE.ArrowHelper(
          boneForward.clone().negate(),
          boneStart,
          bone.width,
          0x0000ff
        )
        arrowHelper3Neg.line.material = arrowMat3
        arrowHelper3Neg.cone.material = arrowMat3
        arrowHelper3Neg.userData.isDebug = true
        arrowHelper3Neg.renderOrder = 999
        partGroup.add(arrowHelper3Neg)
      }

      // Process child parts
      for (const [childPartId, attachment] of bone.children.entries()) {
        // Get bone's world transform matrix
        const boneTransform = worldTransform.clone()
        
        // Get bone start position and direction in world space
        const boneStart = new THREE.Vector3().setFromMatrixPosition(boneTransform)
        const boneUp = new THREE.Vector3(0, 1, 0).applyMatrix4(boneTransform).normalize()
        
        // Calculate attachment point along bone
        const attachPoint = boneStart.clone().add(
          boneUp.multiplyScalar(bone.length * attachment.ratio)
        )
        
        // Create unit vector in XZ plane based on angle
        const localOffset = new THREE.Vector3(
          Math.cos(attachment.angle),
          0,
          Math.sin(attachment.angle)
        ).normalize()
        
        // Create a matrix for just the rotation part of the bone transform
        const rotationMatrix = boneTransform.clone()
        rotationMatrix.setPosition(new THREE.Vector3(0, 0, 0))
        
        // Transform the local offset by just the rotation to get world space direction
        const perpOffset = localOffset.clone()
          .applyMatrix4(rotationMatrix)
          .normalize()
          .multiplyScalar(bone.width)
        
        // Add offset to attachment point
        attachPoint.add(perpOffset)
        
        // Create attachment transform matrix
        const attachmentTransform = new THREE.Matrix4()
        
        // Get parent bone's up direction
        const parentUp = boneUp.clone().normalize()
        
        // Create child's coordinate system:
        // 1. childUp is the perpOffset direction (perpendicular to parent)
        const childUp = perpOffset.clone().normalize()
        
        // 2. childForward is perpendicular to both childUp and parentUp
        const childForward = new THREE.Vector3().crossVectors(childUp, parentUp).normalize()
        
        // 3. childRight completes the right-handed system
        const childRight = new THREE.Vector3().crossVectors(childForward, childUp).normalize()
        
        // Create attachment transform matrix with position and orientation
        attachmentTransform.makeBasis(
          childRight,
          childUp,
          childForward
        )
        attachmentTransform.setPosition(attachPoint)
        
        // Recursively render child part
        this.renderPartHierarchy(childPartId, attachmentTransform, partGroup, currentParentIds)

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

      // Update current transform for next bone in sequence
      currentTransform = worldTransform
    }
  }

  private updatePartDrag(worldPosition: THREE.Vector3) {
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

        // Get world transform for parent bone
        const boneTransform = this.getWorldTransformForBone(parentBone)
        const boneStart = new THREE.Vector3().setFromMatrixPosition(boneTransform)
        const boneUp = new THREE.Vector3(0, 1, 0).applyMatrix4(boneTransform).normalize()
        const boneRight = new THREE.Vector3(1, 0, 0).applyMatrix4(boneTransform).normalize()
        const boneForward = new THREE.Vector3(0, 0, 1).applyMatrix4(boneTransform).normalize()
        const boneLength = parentBone.length
        
        // Calculate ratio along parent bone using world space positions
        const hitPoint = boneIntersects[0].point
        
        // Project hit point onto bone line to get closest point
        const toHit = new THREE.Vector3().subVectors(hitPoint, boneStart)
        const projectedDistance = toHit.dot(boneUp)
        const ratio = projectedDistance / boneLength
        const clampedRatio = Math.max(0, Math.min(1, ratio))
        
        // Calculate attachment point on bone
        const attachPoint = boneStart.clone().add(boneUp.clone().multiplyScalar(clampedRatio * boneLength))
        
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
        
        // Calculate perpendicular direction
        firstBone.direction.copy(new THREE.Vector3(0, 1, 0))
        
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
          const newPartGroup = this.scene.children.find(child => 
            child instanceof THREE.Group && child.userData.partId === selectedPartId
          )
          if (newPartGroup) {
            this.outlinePass.selectedObjects = [newPartGroup]
            this.composer.render()
          } else {
            // If not found at root level, search entire scene
            let foundGroup: THREE.Group | null = null
            this.scene.traverse(child => {
              if (child instanceof THREE.Group && child.userData.partId === selectedPartId) {
                foundGroup = child
              }
            })
            if (foundGroup) {
              this.outlinePass.selectedObjects = [foundGroup]
              this.composer.render()
            }
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
        part.attachPoint = undefined
        part.attachAngle = undefined

        // Add back to roots since it's detached
        this.roots.add(part.id)
        
        // Create new body for detached part
        this.createBodyForPart(part.id)
        
        // Render the updated body
        this.renderBody(part.id)
        
        // After rendering, find the new group for our selected part
        const newPartGroup = this.scene.children.find(child => 
          child instanceof THREE.Group && child.userData.partId === selectedPartId
        )
        if (newPartGroup) {
          this.outlinePass.selectedObjects = [newPartGroup]
          this.composer.render()
        }
      }
      
      // Update bone direction and position
      const body = Array.from(this.bodies.values())
        .find(b => b.rootPartId === part.id)
      
      if (body) {
        // Update body position
        body.transform.position.copy(worldPosition)
        
        // Default to pointing upward
        const direction = new THREE.Vector3(0, 1, 0)
        
        // Update bone direction
        firstBone.direction.copy(direction)
        
        // Update body transform
        body.transform.up.copy(direction)
        body.transform.right.set(1, 0, 0) // Default right vector
        body.transform.forward.set(0, 0, 1) // Default forward vector
        
        // Render the updated body
        this.renderBody(body.id)
      }
    }
  }

  // End bone drag
  endBoneDrag() {
    this.activePartId = undefined
  }

  // Add a new bone
  private addBone(params: {
    partId: string,
    position: THREE.Vector3,
    length?: number,
    width?: number
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
      children: new Map()
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

  private notifySelect(data: { id: string, type: PartType, position: [number, number, number], color: string }) {
    // Ensure color is always defined
    const safeData = {
      ...data,
      color: data.color || this.getDefaultColor(data.type)
    }
    if (this.onSelect) {
      this.onSelect(safeData)
    }
  }

  private notifyDeselect() {
    if (this.onDeselect) {
      this.onDeselect()
    }
  }

  // Make eventListeners accessible for debugging
  get eventListeners(): Map<EventType, Set<EventCallback>> {
    return this._eventListeners
  }

  private getDefaultColor(type: PartType): string {
    switch (type) {
      case 'stem': return '44aa44'
      case 'leaf': return '66cc66'
      case 'thorn': return 'aa4444'
      case 'flower': return 'cc66cc'
    }
  }

  updateBoneAttributes(id: string, attributes: { color?: string }) {
    const bone = this.bones.get(id)
    if (!bone) return
    
    const part = this.parts.get(bone.partId)
    if (!part) return

    if (attributes.color) {
      // Update the part's color
      part.color = new THREE.Color(`#${attributes.color}`)
      
      // Find all meshes in this part's group and update their colors
      const partGroup = this.scene.children.find(child => 
        child instanceof THREE.Group && child.userData.partId === part.id
      )
      
      if (partGroup) {
        partGroup.traverse(child => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.color = new THREE.Color(`#${attributes.color}`)
            child.material.needsUpdate = true
          }
        })
        
        // Force a render to show the color change
        this.composer.render()
      }
    }
  }

  private addPart(params: {
    worldPosition: THREE.Vector3,
    type: PartType,
    length?: number,
    width?: number
  }): string {
    const id = Math.random().toString(36).substr(2, 9)
    
    // Create the part
    const part: Part = {
      id,
      type: params.type,
      boneIds: []
    }
    
    // Create initial bone for the part
    const boneId = this.addBone({
      partId: id,
      position: params.worldPosition.clone(),
      length: params.length || 0.3,
      width: params.width || 0.05
    })
    
    // Add bone to part's sequence
    part.boneIds.push(boneId)
    
    // Store the part
    this.parts.set(id, part)
    
    // Add to roots since it starts with no parent
    this.roots.add(id)
    
    // Create body for new root part
    const body = this.createBodyForPart(id)

    return id
  }

  private getBoneIdFromMesh(mesh: THREE.Object3D): string | undefined {
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

    // Create part at the adjusted position
    const partId = this.addPart({
      ...params,
      worldPosition: adjustedPosition
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

  private createBodyForPart(partId: string) {
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

  private getPartWorldTransform(part: Part, bones: Map<string, Bone>, parts: Map<string, Part>): Transform {
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

  private getWorldTransformForBone(bone: Bone): THREE.Matrix4 {
    const part = this.parts.get(bone.partId)
    if (!part) return new THREE.Matrix4()

    // Find the root part by walking up the chain
    let rootPart = part
    while (rootPart.parentBoneId) {
      const parentBone = this.bones.get(rootPart.parentBoneId)
      if (!parentBone) break
      const nextPart = this.parts.get(parentBone.partId)
      if (!nextPart) break
      rootPart = nextPart
    }

    // Get the root part's body transform
    const body = Array.from(this.bodies.values()).find(b => b.rootPartId === rootPart.id)
    let rootTransform;
    if (body) {
      rootTransform = new THREE.Matrix4().makeBasis(
        body.transform.right,
        body.transform.up,
        body.transform.forward
      ).setPosition(body.transform.position)
    } else {
      rootTransform = new THREE.Matrix4()
    }

    // Now recursively calculate transforms from root to target
    return this.calculateTransformFromRoot(rootPart, bone.id, rootTransform)
  }

  private calculateTransformFromRoot(part: Part, targetBoneId: string, parentTransform: THREE.Matrix4): THREE.Matrix4 {
    // Start with parent transform
    let currentTransform = parentTransform.clone()
    
    // Process each bone in this part
    for (const boneId of part.boneIds) {
      const bone = this.bones.get(boneId)
      if (!bone) continue

      // Apply bone's local transform
      const rotMatrix = new THREE.Matrix4()
      const worldUp = new THREE.Vector3(0, 1, 0)
      
      // Create rotation matrix from bone's direction
      if (Math.abs(bone.direction.dot(worldUp)) < 0.99) {
        const right = new THREE.Vector3().crossVectors(worldUp, bone.direction).normalize()
        const forward = new THREE.Vector3().crossVectors(bone.direction, right).normalize()
        rotMatrix.makeBasis(right, bone.direction, forward)
      } else {
        const right = new THREE.Vector3(1, 0, 0)
        const forward = new THREE.Vector3(0, 0, 1)
        rotMatrix.makeBasis(right, bone.direction, forward)
      }

      // Apply twist
      if (bone.twist !== 0) {
        const twistMatrix = new THREE.Matrix4().makeRotationAxis(bone.direction, bone.twist)
        rotMatrix.multiply(twistMatrix)
      }

      // Apply to current transform
      currentTransform.multiply(rotMatrix)

      // If this is our target bone, we're done
      if (boneId === targetBoneId) {
        return currentTransform
      }

      // Check children of this bone
      for (const [childPartId, attachment] of bone.children.entries()) {
        const childPart = this.parts.get(childPartId)
        if (!childPart) continue

        // Create attachment point transform
        const attachTransform = currentTransform.clone()
        const boneDirection = new THREE.Vector3(0, 1, 0).applyMatrix4(currentTransform)
        const offset = boneDirection.multiplyScalar(bone.length * attachment.ratio)
        
        // Get current position and add offset
        const attachPosition = new THREE.Vector3().setFromMatrixPosition(currentTransform).add(offset)
        attachTransform.setPosition(attachPosition)
        
        // Apply attachment angle
        const rotationMatrix = new THREE.Matrix4().makeRotationAxis(boneDirection.normalize(), attachment.angle)
        attachTransform.multiply(rotationMatrix)

        // Recursively process child part
        const result = this.calculateTransformFromRoot(childPart, targetBoneId, attachTransform)
        if (result) return result
      }
    }

    return currentTransform
  }
} 