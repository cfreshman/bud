import * as THREE from 'three'
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

export class BudEngine {
  private bodies: Map<string, Body> = new Map()
  private parts: Map<string, Part> = new Map()
  private bones: Map<string, Bone> = new Map()
  private roots: Set<string> = new Set()
  private partParentIds: Map<string, Set<string>> = new Map()
  private scene: THREE.Scene
  private uiScene: THREE.Scene
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
  private bloomPass: UnrealBloomPass
  private dragOffset: THREE.Vector3 = new THREE.Vector3()
  private groundPlane: THREE.Mesh
  private mouseDown = false
  private onSelect?: (data: { id: string, type: PartType, position: [number, number, number], color?: string, length: number, width: number, theta?: number, phi?: number, twist?: number }) => void
  private onDeselect?: () => void
  private debugMode: boolean = false
  private bloomEnabled: boolean = true
  private boneTransforms: Map<string, THREE.Matrix4> = new Map()
  private partAdded: boolean = false
  private bonePartIds: Map<string, string> = new Map()
  
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
    this.onSelect = callbacks?.onSelect
    this.onDeselect = callbacks?.onDeselect
    
    // Main scene setup
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#111419')
    
    // Initialize event listeners
    this._eventListeners.set('select', new Set())
    this._eventListeners.set('deselect', new Set())
    
    // UI scene setup
    this.uiScene = new THREE.Scene()
    
    // Camera setup
    const aspect = container.clientWidth / container.clientHeight
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000)
    this.camera.position.set(1, 3, 2.5)
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
    this.renderer.setClearColor('#111419', 1)
    this.renderer.autoClear = true
    this.renderer.sortObjects = true // Enable proper depth sorting
    container.appendChild(this.renderer.domElement)
    
    // Remove existing ground plane and add pot and dirt instead
    this.setupPotAndDirt()
    
    // Enable shadows
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // Brighter ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.2)
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
    const gridHelper = new THREE.GridHelper(10, 10, '#888888', '#dddddd')
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
    
    // Render pass
    const renderPass = new RenderPass(this.scene, this.camera)
    this.composer.addPass(renderPass)
    
    // Very subtle bloom on everything
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.15,    // strength - very subtle
      1,    // radius
      0     // threshold - low threshold so it affects everything
    )
    this.composer.addPass(this.bloomPass)
    
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
    this.renderer.setClearColor('#111419', 1)
    
    // Start render loop
    this.animate()

    // Load saved plant state after everything is set up
    requestAnimationFrame(() => {
      this.loadFromLocalStorage()
    })
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

  private createGeometry(type: PartType, params: { width: number, length: number }): THREE.BufferGeometry {
    switch (type) {
      case 'stem':
        const stemGeo = new THREE.CylinderGeometry(params.width, params.width, params.length, 8)
        stemGeo.translate(0, params.length / 2, 0)
        return stemGeo
      case 'leaf':
        const radius = params.length * 2 / 7
        const leafGeo = new THREE.CylinderGeometry(radius, radius, 0.01, 16, 1, false)
        leafGeo.rotateX(Math.PI / 2) // Rotate to be vertical
        leafGeo.scale(1, 2, 1) // Scale Y to make it oval
        leafGeo.translate(0, radius * 2, 0) // Adjust translation for new height
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

  private createPartPreview(type: PartType, color: string): THREE.Mesh {
    const scale = 1
    const geometry = this.createGeometry(type, {
      width: type === 'stem' ? 0.03 * scale : 0.05 * scale,
      length: type === 'stem' ? 0.2 * scale : 0.15 * scale
    })

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
    this.isDragging = false

    // unselect any selected part
    this.activePartId = undefined

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
        for (const [childPartId] of bone.children.entries()) {
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
      const worldUp = new THREE.Vector3(0, 1, 0)
      
      if (Math.abs(bone.direction.dot(worldUp)) < 0.9999) {
        const right = new THREE.Vector3().crossVectors(worldUp, bone.direction).normalize()
        const forward = new THREE.Vector3().crossVectors(bone.direction, right).normalize()
        rotMatrix.makeBasis(right, bone.direction, forward)
      } else {
        const right = new THREE.Vector3(1, 0, 0)
        const forward = new THREE.Vector3(0, 0, 1)
        rotMatrix.makeBasis(right, bone.direction, forward)
      }

      // Apply twist if any
      if (bone.twist !== 0) {
        const twistMatrix = new THREE.Matrix4().makeRotationAxis(bone.direction, bone.twist)
        rotMatrix.multiply(twistMatrix)
      }

      // Apply rotation to current transform
      const worldTransform = currentTransform.clone().multiply(rotMatrix)

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
      mesh.userData.partId = partId
      mesh.userData.parentPartIds = Array.from(currentParentIds)

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
        
        // Get parent bone's up direction
        const parentUp = up.clone().normalize()

        let childUp: THREE.Vector3
        let childRight: THREE.Vector3
        let childForward: THREE.Vector3

        // Handle end attachments (ratio 0 or 1) differently from side attachments
        if (attachment.ratio === 0 || attachment.ratio === 1) {
          // For end attachments, align with bone direction
          childUp = parentUp.clone()
          childRight = right.clone()
          childForward = forward.clone()

          // If attaching to start (ratio 0), rotate 180° around right axis to point outward
          if (attachment.ratio === 0) {
            const rotMatrix = new THREE.Matrix4().makeRotationAxis(childRight, Math.PI)
            childUp.applyMatrix4(rotMatrix)
            childForward.applyMatrix4(rotMatrix)
          }
          // ratio 1 means align with parent's direction (no rotation needed)

          // Apply twist around up axis
          const twistMatrix = new THREE.Matrix4().makeRotationAxis(childUp, attachment.angle)
          childRight.applyMatrix4(twistMatrix)
          childForward.applyMatrix4(twistMatrix)
        } else {
          // Original side attachment logic
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
            .multiplyScalar(bone.width * .9)
          
          // Add offset to attachment point
          attachPoint.add(perpOffset)
          
          // Create child's coordinate system:
          // 1. childUp is the perpOffset direction (perpendicular to parent)
          childUp = perpOffset.clone().normalize()
          
          // 2. childForward is the parent's up direction
          childForward = parentUp
          
          // 3. childRight completes the right-handed system
          childRight = new THREE.Vector3().crossVectors(childForward, childUp).normalize()
        }

        // Create attachment transform with position and orientation
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
          this.saveToLocalStorage() // Save after attaching to another part
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
        this.saveToLocalStorage() // Save after position change
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

  private notifySelect(data: { 
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
    const theta = Math.acos(bone.direction.y) * 180 / Math.PI
    const phi = Math.atan2(bone.direction.z, bone.direction.x) * 180 / Math.PI
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
      phi: phi < 0 ? phi + 360 : phi, // Convert to 0-360 range
      twist: twist < 0 ? twist + 360 : twist // Convert to 0-360 range
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

    this.saveToLocalStorage()
  }

  private addPart(params: {
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
        color: undefined,
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
      if (Math.abs(bone.direction.dot(worldUp)) < 0.9999) {
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
      this.saveToLocalStorage() // Save after growing

      // Re-select the new first bone
      this.notifySelect({
        id: newBoneId,
        type: part.type,
        position: [0, 0, 0], // Position will be updated by render
        color: part.attributes.color,
        length: firstBone.length,
        width: firstBone.width
      })
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

  // Add this helper method to find part groups anywhere in the scene
  private findPartGroup(partId: string): THREE.Group | null {
    let foundGroup: THREE.Group | null = null
    
    // First try root level for performance
    foundGroup = this.scene.children.find(child => 
      child instanceof THREE.Group && child.userData.partId === partId
    ) as THREE.Group | null
    
    // If not found at root, search entire scene hierarchy
    if (!foundGroup) {
      this.scene.traverse(child => {
        if (child instanceof THREE.Group && child.userData.partId === partId) {
          foundGroup = child
        }
      })
    }
    
    return foundGroup
  }

  // Save current plant state to localStorage
  private saveToLocalStorage() {
    try {
      const serializedPlant = this.serializePlant()
      localStorage.setItem('bud_plant', serializedPlant)
      // console.log('Plant saved to localStorage')
    } catch (error) {
      console.error('Failed to save plant:', error)
    }
  }

  // Load plant state from localStorage
  private loadFromLocalStorage() {
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

  // Serialize just the root parts and their hierarchies
  serializePlant(): string {
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

  private serializePart(partId: string): any {
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

  private loadPartData(partData: any, parentBoneId?: string): string | null {
    const partId = Math.random().toString(36).substr(2, 9)
    const part: Part = {
      id: partId,
      type: partData.type,
      attributes: partData.attributes || { color: undefined },
      boneIds: [],
      parentBoneId
    }

    // Create bones
    partData.bones.forEach((boneData: any, index: number) => {
      const boneId = this.addBone({
        partId,
        position: new THREE.Vector3(), // Will be set by transform
        length: boneData.length,
        width: boneData.width,
        isHead: boneData.isHead
      })
      part.boneIds.push(boneId)

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
      this.saveToLocalStorage() // Save after shrinking

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

    // Update bone angles
    if (updates.theta !== undefined || updates.phi !== undefined) {
      // Convert spherical coordinates to direction vector
      const theta = updates.theta !== undefined ? updates.theta * Math.PI / 180 : Math.acos(bone.direction.y)
      const phi = updates.phi !== undefined ? updates.phi * Math.PI / 180 : Math.atan2(bone.direction.z, bone.direction.x)
      
      bone.direction.set(
        Math.sin(theta) * Math.cos(phi - Math.PI / 2),
        Math.cos(theta),
        Math.sin(theta) * Math.sin(phi - Math.PI / 2)
      ).normalize()
    }

    // Update bone twist
    if (updates.twist !== undefined) {
      bone.twist = updates.twist * Math.PI / 180
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
      this.saveToLocalStorage()
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

    this.saveToLocalStorage()
    this.notifyDeselect()
  }
}