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

export type Bone = {
  id: string
  start: THREE.Vector3
  end: THREE.Vector3
  width: number
  // Local coordinate system for this bone
  up: THREE.Vector3      // Y axis - points along bone
  right: THREE.Vector3   // X axis - determines orientation around bone
  forward: THREE.Vector3 // Z axis - cross product of up/right
  parentId?: string
  parentAttachPoint?: number  // 0-1 ratio along parent bone
  parentAngle?: number       // angle around parent bone in radians
  type: PartType
  color?: THREE.Color
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
  private bones: Map<string, Bone> = new Map()
  private boneMeshes: Map<string, THREE.Mesh> = new Map()
  private scene: THREE.Scene
  private uiScene: THREE.Scene  // Separate scene for UI elements
  private camera: THREE.PerspectiveCamera
  private uiCamera: THREE.OrthographicCamera
  private renderer: THREE.WebGLRenderer
  private partPreviews: PartPreview[] = []
  private activeBoneId?: string
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
  private eventListeners: Map<EventType, Set<EventCallback>> = new Map()
  private selectedBoneId?: string
  private composer: EffectComposer
  private outlinePass: OutlinePass
  private dragOffset: THREE.Vector3 = new THREE.Vector3()
  private dragPlane: THREE.Plane = new THREE.Plane()
  private dragPlaneHelper: THREE.Vector3 = new THREE.Vector3()
  private gridHelper: THREE.GridHelper
  private groundPlane: THREE.Mesh
  private mouseDown = false
  
  constructor(container: HTMLElement) {
    // Main scene setup
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#eeebe6')
    
    // UI scene setup
    this.uiScene = new THREE.Scene()
    
    // Camera setup
    const aspect = container.clientWidth / container.clientHeight
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000)
    this.camera.position.set(1.5, 2, -.4)
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
    this.gridHelper = gridHelper
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
    const renderPass = new RenderPass(this.scene, this.camera)
    this.composer.addPass(renderPass)
    
    // Setup outline pass with brighter outline
    this.outlinePass = new OutlinePass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      this.scene,
      this.camera
    )
    this.outlinePass.visibleEdgeColor.set('#ffffff')
    this.outlinePass.hiddenEdgeColor.set('#ffffff')
    this.outlinePass.edgeStrength = 10
    this.outlinePass.edgeThickness = 2
    this.outlinePass.pulsePeriod = 0 // No pulsing
    this.composer.addPass(this.outlinePass)

    // Make sure we clear properly
    this.renderer.autoClear = true
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

    // Rotate leaf to be vertical
    if (type === 'leaf') {
      mesh.rotation.y = Math.PI / 2
    }

    return mesh
  }

  private onMouseDown(event: MouseEvent) {
    this.mouseDown = true
    // Convert mouse coordinates to normalized device coordinates (-1 to +1)
    this.mouse.x = (event.clientX / this.renderer.domElement.clientWidth) * 2 - 1
    this.mouse.y = -(event.clientY / this.renderer.domElement.clientHeight) * 2 + 1
    
    // Save drag start position
    this.dragStartPosition.set(event.clientX, event.clientY, 0)
    
    // Check for bone/part selection first
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const boneIntersects = this.raycaster.intersectObjects(Array.from(this.boneMeshes.values()))
    
    if (boneIntersects.length > 0) {
      // If we hit something, disable camera rotation temporarily
      this.controls.enableRotate = false
      
      const selectedObject = boneIntersects[0].object
      if (!(selectedObject instanceof THREE.Mesh)) return

      const selectedId = Array.from(this.boneMeshes.entries())
        .find(([_, mesh]) => mesh === selectedObject)?.[0]
      
      if (selectedId) {
        const bone = this.bones.get(selectedId)
        this.selectedBoneId = selectedId
        this.activeBoneId = selectedId // Set active for potential dragging
        
        // Calculate drag offset from hit point
        const intersection = boneIntersects[0].point
        this.dragOffset.copy(selectedObject.position).sub(intersection)
        
        // Add outline to selected object
        this.outlinePass.selectedObjects = [selectedObject]
        
        this.emitEvent('select', {
          id: selectedId,
          type: bone ? bone.type : this.getPartTypeFromMesh(selectedObject),
          position: bone ? bone.start.toArray() : selectedObject.position.toArray(),
          color: bone?.color?.getHexString() || this.getDefaultColor(bone ? bone.type : this.getPartTypeFromMesh(selectedObject))
        })
        return
      }
    }
    
    // If no bone/part was selected, check for part pot interaction
    const partIntersects = this.raycaster.intersectObjects(Array.from(this.partMeshes.values()))
    
    if (partIntersects.length > 0) {
      // If we hit something, disable camera rotation temporarily
      this.controls.enableRotate = false
      
      const selectedObject = partIntersects[0].object
      if (!(selectedObject instanceof THREE.Mesh)) return

      const selectedType = Array.from(this.partMeshes.entries())
        .find(([_, mesh]) => mesh === selectedObject)?.[0]
      
      if (selectedType) {
        this.selectedPartType = selectedType
        // Just select initially - don't start dragging yet
        this.inputManager.setMode('drag')
        
        // Hide the preview mesh while selected
        selectedObject.visible = false
        
        // Create new part at the intersection point but don't start dragging yet
        this.startBoneDrag({
          worldPosition: partIntersects[0].point,
          type: selectedType,
          length: 0.3,
          width: 0.05
        })
      }
    } else {
      // If clicking empty space, always clear selection
      this.selectedBoneId = undefined
      this.outlinePass.selectedObjects = []
      this.emitEvent('deselect', null)
    }
  }

  private onMouseMove(event: MouseEvent) {
    // Convert mouse coordinates to normalized device coordinates (-1 to +1)
    this.mouse.x = (event.clientX / this.renderer.domElement.clientWidth) * 2 - 1
    this.mouse.y = -(event.clientY / this.renderer.domElement.clientHeight) * 2 + 1
    
    // If we have an active bone/part and mouse is still down, check if we should start dragging
    if (this.activeBoneId && !this.isDragging && this.mouseDown) {
        const dragDistance = new THREE.Vector3(event.clientX, event.clientY, 0)
            .sub(this.dragStartPosition)
            .length()
        
        if (dragDistance > 5) { // Start dragging after 5px movement
            this.isDragging = true
        }
    }
    
    if (this.isDragging) {
      // Get all valid surfaces for raycasting
      const validSurfaces: THREE.Object3D[] = []
      
      // Add defined meshes to valid surfaces
      if (this.mainPot) validSurfaces.push(this.mainPot)
      if (this.mainDirt) validSurfaces.push(this.mainDirt)
      if (this.groundPlane) validSurfaces.push(this.groundPlane)
      
      // Add all part pots and bone meshes as valid surfaces, excluding the active mesh
      validSurfaces.push(...Array.from(this.partPots.values()))
      validSurfaces.push(...Array.from(this.boneMeshes.values())
        .filter(mesh => mesh !== this.boneMeshes.get(this.activeBoneId!)))

      // Raycast against all surfaces
      this.raycaster.setFromCamera(this.mouse, this.camera)
      const intersects = this.raycaster.intersectObjects(validSurfaces, false)
      
      if (intersects.length > 0) {
        const intersection = intersects[0].point
        this.updateBoneDrag(intersection)
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
        // Only clear outline if we were dragging a new part
        this.outlinePass.selectedObjects = []
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
    
    // Update controls
    this.controls.update()
    
    // Render with post-processing
    this.composer.render()
  }

  // Calculate local coordinate system for a bone
  private calculateBoneOrientation(start: THREE.Vector3, end: THREE.Vector3, referenceUp = new THREE.Vector3(0, 1, 0)): {
    up: THREE.Vector3,
    right: THREE.Vector3,
    forward: THREE.Vector3
  } {
    const up = new THREE.Vector3().subVectors(end, start).normalize()
    
    // If bone is parallel to reference up, use a different reference
    const alignment = Math.abs(up.dot(referenceUp))
    const reference = alignment > 0.99 ? new THREE.Vector3(1, 0, 0) : referenceUp
    
    // Calculate right vector perpendicular to up and reference
    const right = new THREE.Vector3().crossVectors(up, reference).normalize()
    
    // Calculate forward vector to complete orthogonal system
    const forward = new THREE.Vector3().crossVectors(right, up).normalize()
    
    return { up, right, forward }
  }

  // Start dragging a new bone
  startBoneDrag(params: {
    worldPosition: THREE.Vector3,
    type: PartType,
    length?: number,
    width?: number
  }): string {
    if (params.type === 'stem') {
      const id = this.addBone(params)
      this.activeBoneId = id
      const mesh = this.boneMeshes.get(id)
      if (mesh) {
        this.outlinePass.selectedObjects = [mesh]
      }
      return id
    } else {
      // For non-stem parts, create a simple mesh
      const id = Math.random().toString(36).substr(2, 9)
      const mesh = this.createPartMesh(params.type, params.worldPosition)
      this.boneMeshes.set(id, mesh)
      this.scene.add(mesh)
      this.activeBoneId = id
      this.outlinePass.selectedObjects = [mesh]
      return id
    }
  }

  // Update bone during drag
  updateBoneDrag(worldPosition: THREE.Vector3) {
    if (!this.activeBoneId) return
    const mesh = this.boneMeshes.get(this.activeBoneId)
    if (!mesh) return

    // For stems, update bone and mesh
    const bone = this.bones.get(this.activeBoneId)
    if (bone) {
      const offset = new THREE.Vector3().subVectors(worldPosition, bone.start)
      bone.start.add(offset)
      bone.end.add(offset)
      const center = new THREE.Vector3().addVectors(bone.start, bone.end).multiplyScalar(0.5)
      mesh.position.copy(center)
    } else {
      // For non-stem parts, just update position
      mesh.position.copy(worldPosition)
    }
  }

  // End bone drag
  endBoneDrag() {
    this.activeBoneId = undefined
  }

  // Add a new bone
  private addBone(params: {
    worldPosition: THREE.Vector3,
    type: Bone['type'],
    length?: number,
    width?: number
  }): string {
    const id = Math.random().toString(36).substr(2, 9)
    const length = params.length || 1
    const width = params.width || 0.1

    const end = new THREE.Vector3().copy(params.worldPosition).add(new THREE.Vector3(0, length, 0))
    const orientation = this.calculateBoneOrientation(params.worldPosition, end)
    
    const bone: Bone = {
      id,
      start: params.worldPosition.clone(),
      end: new THREE.Vector3().copy(params.worldPosition).add(orientation.up.multiplyScalar(length)),
      width,
      ...orientation,
      type: params.type
    }

    this.bones.set(id, bone)
    
    // Create and add mesh
    const mesh = this.createBoneMesh(bone)
    this.boneMeshes.set(id, mesh)
    this.scene.add(mesh)

    return id
  }

  private createBoneMesh(bone: Bone): THREE.Mesh {
    let geometry: THREE.BufferGeometry
    let material: THREE.Material
    
    switch (bone.type) {
      case 'stem':
        geometry = new THREE.CylinderGeometry(bone.width, bone.width, bone.end.distanceTo(bone.start), 8)
        material = new THREE.MeshStandardMaterial({ color: '#44aa44' })
        break
      case 'leaf':
        geometry = new THREE.CircleGeometry(bone.width * 4, 16)
        material = new THREE.MeshStandardMaterial({ 
          color: '#66cc66',
          side: THREE.DoubleSide
        })
        break
      case 'thorn':
        geometry = new THREE.ConeGeometry(bone.width * 2, bone.end.distanceTo(bone.start), 4)
        material = new THREE.MeshStandardMaterial({ color: '#aa4444' })
        break
      case 'flower':
        geometry = new THREE.SphereGeometry(bone.width * 3, 8, 8)
        material = new THREE.MeshStandardMaterial({ color: '#cc66cc' })
        break
    }

    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true

    // Position and orient the mesh
    const center = new THREE.Vector3().addVectors(bone.start, bone.end).multiplyScalar(0.5)
    mesh.position.copy(center)
    
    // Create rotation matrix from bone's coordinate system
    const rotMatrix = new THREE.Matrix4()
    const up = new THREE.Vector3().subVectors(bone.end, bone.start).normalize()
    rotMatrix.makeBasis(bone.right, up, bone.forward)
    
    // For leaves, adjust the orientation to be vertical
    if (bone.type === 'leaf') {
      const leafRotation = new THREE.Matrix4().makeRotationY(Math.PI / 2)
      rotMatrix.multiply(leafRotation)
    }
    
    mesh.setRotationFromMatrix(rotMatrix)

    return mesh
  }

  private createPartMesh(type: PartType, position: THREE.Vector3): THREE.Mesh {
    let geometry: THREE.BufferGeometry
    let material: THREE.Material
    const scale = 1.5 // Match preview scale
    
    switch (type) {
      case 'stem':
        geometry = new THREE.CylinderGeometry(0.03 * scale, 0.03 * scale, 0.2 * scale, 8)
        material = new THREE.MeshStandardMaterial({ color: '#44aa44' })
        break
      case 'leaf':
        geometry = new THREE.CircleGeometry(0.12 * scale, 16)
        // Translate geometry up by half its height so bottom is at origin
        geometry.translate(0, 0.2 * scale / 2, 0)
        material = new THREE.MeshStandardMaterial({ 
          color: '#66cc66',
          side: THREE.DoubleSide
        })
        break
      case 'thorn':
        geometry = new THREE.ConeGeometry(0.04 * scale, 0.15 * scale, 4)
        // Translate geometry up by half its height so bottom is at origin
        geometry.translate(0, 0.15 * scale / 2, 0)
        material = new THREE.MeshStandardMaterial({ color: '#aa4444' })
        break
      case 'flower':
        geometry = new THREE.SphereGeometry(0.08 * scale, 8, 8)
        // Translate geometry up by its radius so bottom is at origin
        geometry.translate(0, 0.08 * scale, 0)
        material = new THREE.MeshStandardMaterial({ color: '#cc66cc' })
        break
      default:
        throw new Error(`Invalid part type: ${type}`)
    }

    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    
    // Position mesh at the provided position (which is already the bottom point)
    mesh.position.copy(position)

    // Set initial rotation
    if (type === 'leaf') {
      mesh.rotation.y = Math.PI / 2 // Make leaf vertical
    }

    return mesh
  }

  getBones(): Bone[] {
    return Array.from(this.bones.values())
  }

  update(deltaTime: number) {
    // Will handle physics/wind updates here
  }

  addEventListener(event: EventType, callback: EventCallback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)
  }

  removeEventListener(event: EventType, callback: EventCallback) {
    this.eventListeners.get(event)?.delete(callback)
  }

  private emitEvent(event: EventType, data: any) {
    this.eventListeners.get(event)?.forEach(callback => callback(data))
  }

  private getDefaultColor(type: PartType): string {
    switch (type) {
      case 'stem': return '44aa44'
      case 'leaf': return '66cc66'
      case 'thorn': return 'aa4444'
      case 'flower': return 'cc66cc'
    }
  }

  updateBoneAttributes(id: string, attributes: {
    color?: string
  }) {
    const bone = this.bones.get(id)
    const mesh = this.boneMeshes.get(id)
    
    if (bone && mesh && mesh.material instanceof THREE.MeshStandardMaterial) {
      if (attributes.color) {
        bone.color = new THREE.Color(attributes.color)
        mesh.material.color = bone.color
      }
    }
  }

  private getPartTypeFromMesh(mesh: THREE.Mesh): PartType {
    // Determine part type based on geometry
    const geometry = mesh.geometry
    if (geometry instanceof THREE.CircleGeometry) return 'leaf'
    if (geometry instanceof THREE.ConeGeometry) return 'thorn'
    if (geometry instanceof THREE.SphereGeometry) return 'flower'
    return 'stem' // Default to stem for cylinder geometry
  }
} 