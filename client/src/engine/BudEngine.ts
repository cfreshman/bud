import * as THREE from 'three'
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
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
  
  constructor(container: HTMLElement) {
    // Main scene setup
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#111111')
    
    // UI scene setup
    this.uiScene = new THREE.Scene()
    
    // Camera setup
    const aspect = container.clientWidth / container.clientHeight
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000)
    this.camera.position.set(3, 3, 3)
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
      alpha: true 
    })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.autoClear = false // Important for rendering two scenes
    container.appendChild(this.renderer.domElement)
    
    // Remove existing ground plane and add pot and dirt instead
    this.setupPotAndDirt()
    
    // Enable shadows
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(ambientLight)
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(5, 5, 5)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 1024
    directionalLight.shadow.mapSize.height = 1024
    this.scene.add(directionalLight)
    
    // Add grid helper
    const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x222222)
    this.scene.add(gridHelper)
    
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
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    }
    
    // Initialize input manager
    this.inputManager = new InputManager(this.controls)
    
    // Start render loop
    this.animate()
  }

  private setupPotAndDirt() {
    // Create main pot
    const potGeo = new THREE.CylinderGeometry(0.6, 0.4, 0.4, 32)
    const potMat = new THREE.MeshStandardMaterial({ 
      color: '#654321',
      roughness: 0.8,
      metalness: 0.2
    })
    this.mainPot = new THREE.Mesh(potGeo, potMat)
    this.mainPot.position.y = 0.2
    this.mainPot.castShadow = true
    this.mainPot.receiveShadow = true
    this.scene.add(this.mainPot)

    // Create main dirt mound
    const dirtGeo = new THREE.SphereGeometry(0.5, 32, 16)
    const dirtMat = new THREE.MeshStandardMaterial({
      color: '#3a2a1a',
      roughness: 1,
      metalness: 0
    })
    this.mainDirt = new THREE.Mesh(dirtGeo, dirtMat)
    this.mainDirt.scale.y = 0.3
    this.mainDirt.position.y = 0.35
    this.mainDirt.castShadow = true
    this.mainDirt.receiveShadow = true
    this.scene.add(this.mainDirt)

    // Create ingredient pots in a semi-circle
    const parts: [PartType, string][] = [
      ['stem', '#44aa44'],
      ['leaf', '#66cc66'],
      ['thorn', '#aa4444'],
      ['flower', '#cc66cc']
    ]

    const radius = 2 // Distance from center
    const startAngle = -Math.PI / 3 // Start from -60 degrees
    const angleStep = Math.PI / 6 // 30 degrees between pots

    parts.forEach(([type, color], i) => {
      const angle = startAngle + i * angleStep
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
        geometry = new THREE.ConeGeometry(0.12 * scale, 0.2 * scale, 8)
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
      metalness: 0.2
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }

  private onMouseDown(event: MouseEvent) {
    this.mouse.x = (event.clientX / this.renderer.domElement.clientWidth) * 2 - 1
    this.mouse.y = -(event.clientY / this.renderer.domElement.clientHeight) * 2 + 1
    
    // Check for part pot interaction
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const intersects = this.raycaster.intersectObjects(Array.from(this.partMeshes.values()))
    
    if (intersects.length > 0) {
      const selectedMesh = intersects[0].object
      const selectedType = Array.from(this.partMeshes.entries())
        .find(([_, mesh]) => mesh === selectedMesh)?.[0]
      
      if (selectedType) {
        this.inputManager.setMode('drag')
        this.selectedPartType = selectedType
        this.isDragging = true
        
        // Hide the preview mesh while dragging
        selectedMesh.visible = false
        
        // Create new part at planting height
        const intersection = intersects[0].point.clone()
        intersection.y = this.plantingArea.y
        
        this.startBoneDrag({
          worldPosition: intersection,
          type: selectedType,
          length: 0.3,
          width: 0.05
        })
      }
    }
  }

  private onMouseMove(event: MouseEvent) {
    this.mouse.x = (event.clientX / this.renderer.domElement.clientWidth) * 2 - 1
    this.mouse.y = -(event.clientY / this.renderer.domElement.clientHeight) * 2 + 1
    
    if (this.isDragging && this.selectedPartType) {
      // Project mouse onto planting plane
      this.raycaster.setFromCamera(this.mouse, this.camera)
      
      let surfacePoint: THREE.Vector3
      
      // First try to intersect with main dirt
      const mainDirtIntersects = this.raycaster.intersectObject(this.mainDirt!)
      
      if (mainDirtIntersects.length > 0) {
        // Use the exact surface point from main dirt raycast
        surfacePoint = mainDirtIntersects[0].point
        
        // Limit placement to planting radius
        const toIntersection = surfacePoint.clone().sub(this.plantingArea)
        const horizontalDist = new THREE.Vector2(toIntersection.x, toIntersection.z).length()
        
        if (horizontalDist > this.plantingRadius) {
          // Only normalize the horizontal components
          const normalized = new THREE.Vector2(toIntersection.x, toIntersection.z)
            .normalize()
            .multiplyScalar(this.plantingRadius)
          surfacePoint.x = this.plantingArea.x + normalized.x
          surfacePoint.z = this.plantingArea.z + normalized.y
        }
      } else {
        // If not over main dirt, check mini pots
        const allDirtMounds = Array.from(this.scene.children).filter(obj => 
          obj instanceof THREE.Mesh && 
          obj !== this.mainDirt &&
          obj.material instanceof THREE.MeshStandardMaterial &&
          obj.material.color.getHexString() === '3a2a1a' // dirt color
        )
        
        const miniDirtIntersects = this.raycaster.intersectObjects(allDirtMounds)
        
        if (miniDirtIntersects.length > 0) {
          // Use the exact surface point from mini dirt raycast
          surfacePoint = miniDirtIntersects[0].point
        } else {
          // Fallback to plane if not hitting any dirt
          const planeNormal = new THREE.Vector3(0, 1, 0)
          const plane = new THREE.Plane(planeNormal, this.plantingArea.y)
          surfacePoint = new THREE.Vector3()
          this.raycaster.ray.intersectPlane(plane, surfacePoint)
        }
      }
      
      this.updateBoneDrag(surfacePoint)
    }
  }

  private onMouseUp() {
    if (this.isDragging) {
      // Show the preview mesh again
      if (this.selectedPartType) {
        const previewMesh = this.partMeshes.get(this.selectedPartType)
        if (previewMesh) {
          previewMesh.visible = true
        }
      }
      
      // Check if part is within planting area
      const bone = this.bones.get(this.activeBoneId!)
      if (bone) {
        const distanceFromCenter = bone.start.clone().sub(this.plantingArea).length()
        if (distanceFromCenter > this.plantingRadius) {
          // Remove bone if dropped outside planting area
          const mesh = this.boneMeshes.get(this.activeBoneId!)
          if (mesh) {
            this.scene.remove(mesh)
            this.boneMeshes.delete(this.activeBoneId!)
          }
          this.bones.delete(this.activeBoneId!)
        }
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
  }

  private animate = () => {
    requestAnimationFrame(this.animate)
    
    // Update controls
    this.controls.update()
    
    // Clear everything
    this.renderer.clear()
    
    // Render main scene
    this.renderer.render(this.scene, this.camera)
    
    // Render UI on top
    this.renderer.clearDepth()
    this.renderer.render(this.uiScene, this.uiCamera)
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
    type: Bone['type'],
    length?: number,
    width?: number
  }): string {
    const id = this.addBone(params)
    this.activeBoneId = id
    return id
  }

  // Update bone during drag
  updateBoneDrag(worldPosition: THREE.Vector3) {
    if (!this.activeBoneId) return
    const bone = this.bones.get(this.activeBoneId)
    if (!bone) return

    // Update position
    const offset = new THREE.Vector3().subVectors(worldPosition, bone.start)
    bone.start.add(offset)
    bone.end.add(offset)

    // Update mesh
    const mesh = this.boneMeshes.get(this.activeBoneId)
    if (mesh) {
      const center = new THREE.Vector3().addVectors(bone.start, bone.end).multiplyScalar(0.5)
      mesh.position.copy(center)
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
        geometry = new THREE.ConeGeometry(bone.width * 4, bone.end.distanceTo(bone.start), 8)
        material = new THREE.MeshStandardMaterial({ color: '#66cc66' })
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
    mesh.setRotationFromMatrix(rotMatrix)

    return mesh
  }

  getBones(): Bone[] {
    return Array.from(this.bones.values())
  }

  update(deltaTime: number) {
    // Will handle physics/wind updates here
  }
} 