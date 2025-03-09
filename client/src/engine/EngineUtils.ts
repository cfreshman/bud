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
import { Part, Bone, Body, PartType, PlantData, BoneAttachment, PartAttributes } from './types'

export class EngineUtils {
  protected scene: THREE.Scene
  protected camera: THREE.PerspectiveCamera
  protected renderer: THREE.WebGLRenderer
  protected controls: OrbitControls
  protected composer: EffectComposer
  protected outlinePass: OutlinePass
  protected bloomPass: UnrealBloomPass
  protected raycaster: THREE.Raycaster
  protected mouse: THREE.Vector2
  protected domElement: HTMLElement
  protected animationFrameId?: number
  protected isDisposing: boolean = false

  // Plant rendering state
  protected parts = new Map<string, Part>()
  protected bones = new Map<string, Bone>()
  protected bodies = new Map<string, Body>()
  protected roots = new Set<string>()
  protected boneTransforms = new Map<string, THREE.Matrix4>()
  protected partParentIds = new Map<string, Set<string>>()
  protected bonePartIds = new Map<string, string>()
  protected isEditor: boolean = false
  protected isCloseUp: boolean = false
  protected activePartId?: string
  protected selectedBoneId?: string
  protected debugMode: boolean = false

  constructor(container: HTMLElement) {
    this.domElement = container
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()

    // Scene setup
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#111419')

    // Camera setup
    const aspect = container.clientWidth / container.clientHeight
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000)
    this.camera.position.set(1, 3, 2.5)
    this.camera.lookAt(0, 0, 0)

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      depth: true
    })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.setClearColor('#111419', 1)
    this.renderer.autoClear = true
    this.renderer.sortObjects = true
    container.appendChild(this.renderer.domElement)

    // Enable shadows
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // Controls setup
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.screenSpacePanning = true
    this.controls.minDistance = 1
    this.controls.maxDistance = 10
    this.controls.maxPolarAngle = Math.PI / 2
    this.controls.target.set(0, 0.4, 0)
    this.controls.update()

    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    }

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.2)
    this.scene.add(ambientLight)
    
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
    directionalLight.shadow.bias = -0.001
    this.scene.add(directionalLight)

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5)
    fillLight.position.set(-2, 2, -2)
    this.scene.add(fillLight)

    // Post-processing setup
    this.composer = new EffectComposer(this.renderer)
    
    const renderPass = new RenderPass(this.scene, this.camera)
    this.composer.addPass(renderPass)
    
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.15,
      1,
      0
    )
    this.composer.addPass(this.bloomPass)
    
    this.outlinePass = new OutlinePass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      this.scene,
      this.camera
    )
    this.outlinePass.visibleEdgeColor.set('#ffffff')
    this.outlinePass.hiddenEdgeColor.set('#ffffff')
    this.outlinePass.edgeStrength = 3
    this.outlinePass.edgeGlow = 0
    this.outlinePass.edgeThickness = 1
    this.outlinePass.pulsePeriod = 0
    this.outlinePass.usePatternTexture = false
    this.composer.addPass(this.outlinePass)

    // Make sure we're using the composer instead of renderer directly
    this.renderer.autoClear = false
    this.renderer.setClearColor('#111419', 1)

    // Event listeners
    window.addEventListener('resize', this.onResize.bind(this))

    // Start render loop
    this.startAnimation()
  }

  protected startAnimation() {
    if (this.isDisposed() || this.isDisposing) return
    
    this.animate()
  }

  protected animate() {
    if (this.isDisposed() || this.isDisposing) return
    
    this.animationFrameId = requestAnimationFrame(() => this.animate())
    if (!this.scene || !this.renderer || !this.composer) return
    
    this.controls?.update()

    try {
      // Store currently selected objects before cleanup
      const selectedObjects = this.outlinePass?.selectedObjects || []

      // Clear all groups at start of frame EXCEPT:
      // 1. Non-group objects
      // 2. Ground plane (isGround)
      // 3. Part previews (isPartPreview)
      // 4. Part pots and dirt
      // 5. Debug spheres
      const groupsToRemove = this.scene.children.filter(child => {
        if (!child) return false
        // remove toRemove
        if (child.userData.toRemove) return true
          
        // Keep non-group objects
        if (!(child instanceof THREE.Group)) {
          // Keep ground plane, previews, and debug spheres
          if (child.userData.isGround || child.userData.isPartPreview || child.userData.isDebug) return false
          return false
        }
        
        // Remove if it has a bodyId (it's part of a plant that will be re-rendered)
        return child.userData.bodyId !== undefined
      })
      
      // Only remove the visual meshes, not the underlying data
      groupsToRemove.forEach(group => {
        if (!group || !this.scene) return
        this.scene.remove(group)
        group.traverse(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose()
            if (child.material instanceof THREE.Material) {
              child.material.dispose()
            }
          }
        })
      })

      // Render all root parts
      if (this.roots?.size) {
        Array.from(this.roots).forEach(rootId => {
          if (!this.bodies) return
          const body = Array.from(this.bodies.values())
            .find(b => b.rootPartId === rootId)
          if (body) {
            this.renderBodyWithData(body.id, {
              parts: this.parts,
              bones: this.bones,
              bodies: this.bodies,
              roots: this.roots
            })
          }
        })
      }

      // Restore outline selection if needed
      if (selectedObjects.length > 0 && this.outlinePass) {
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
      this.composer?.render()
    } catch (error) {
      console.error('Error in animation loop:', error)
    }
  }

  protected stopAnimation() {
    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = undefined
    }
  }

  isDisposed(): boolean {
    return !this.scene || this.isDisposing;
  }

  dispose() {
    if (this.isDisposed()) return // Already disposed
    
    this.isDisposing = true
    
    try {
      // Stop animation loop first and wait for it to complete
      if (this.animationFrameId !== undefined) {
        cancelAnimationFrame(this.animationFrameId)
        this.animationFrameId = undefined
      }

      // Remove event listeners
      window.removeEventListener('resize', this.onResize.bind(this))
      
      // Remove renderer from DOM
      if (this.renderer?.domElement?.parentNode) {
        this.renderer.domElement.remove()
      }

      // Clear all maps and collections
      this.parts?.clear()
      this.bones?.clear()
      this.bodies?.clear()
      this.roots?.clear()
      this.boneTransforms?.clear()
      this.partParentIds?.clear()
      this.bonePartIds?.clear()

      // Clear references in a specific order to avoid undefined access
      this.controls = undefined as unknown as OrbitControls
      this.composer = undefined as unknown as EffectComposer
      this.outlinePass = undefined as unknown as OutlinePass
      this.bloomPass = undefined as unknown as UnrealBloomPass
      this.scene = undefined as unknown as THREE.Scene
      this.camera = undefined as unknown as THREE.PerspectiveCamera
      this.renderer = undefined as unknown as THREE.WebGLRenderer
      this.raycaster = undefined as unknown as THREE.Raycaster
      this.mouse = undefined as unknown as THREE.Vector2
      this.domElement = undefined as unknown as HTMLElement
    } catch (error) {
      console.error('Error during disposal:', error)
    } finally {
      this.isDisposing = false
    }
  }

  // Core plant rendering methods
  protected renderPlant(plantData: PlantData) {
    // Store local references for rendering without modifying instance data
    const renderParts = new Map(plantData.parts)
    const renderBones = new Map(plantData.bones)
    const renderBodies = new Map(plantData.bodies)
    const renderRoots = new Set(plantData.roots)

    // Clear transforms for this frame
    this.boneTransforms?.clear()
    this.bonePartIds?.clear()

    // Render all root parts using local references
    Array.from(renderRoots).forEach(rootId => {
      const body = Array.from(renderBodies.values())
        .find(b => b.rootPartId === rootId)
      if (body) {
        this.renderBodyWithData(body.id, {
          parts: renderParts,
          bones: renderBones,
          bodies: renderBodies,
          roots: renderRoots
        })
      }
    })
  }

  protected renderBodyWithData(bodyId: string, data: PlantData) {
    const body = data.bodies.get(bodyId)
    if (!body) return

    // Clean up all meshes for this body's part hierarchy before rendering
    this.cleanupMeshesWithData(body.rootPartId, data)

    const worldTransform = new THREE.Matrix4().makeBasis(
      body.transform.right,
      body.transform.up, 
      body.transform.forward
    )
    worldTransform.setPosition(body.transform.position)
    
    this.renderPartHierarchyWithData(body.rootPartId, worldTransform, data)
  }

  protected cleanupMeshesWithData(currentPartId: string, data: PlantData) {
    const currentPart = data.parts.get(currentPartId)
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
      const bone = data.bones.get(boneId)
      if (bone) {
        for (const [childPartId] of bone.children.entries()) {
          this.cleanupMeshesWithData(childPartId, data)
        }
      }
    }
  }

  protected renderPartHierarchyWithData(
    partId: string, 
    parentWorldTransform: THREE.Matrix4,
    data: PlantData,
    parentGroup?: THREE.Group,
    parentPartIds: Set<string> = new Set(),
    parentAttributes?: PartAttributes
  ) {
    const part = data.parts.get(partId)
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
    const body = Array.from(data.bodies.values()).find(b => {
      let currentPart: Part | undefined = part
      while (currentPart) {
        if (b.rootPartId === currentPart.id) return true
        if (!currentPart.parentBoneId) break
        const parentBone = data.bones.get(currentPart.parentBoneId)
        if (!parentBone) break
        currentPart = data.parts.get(parentBone.partId)
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
      const bone = data.bones.get(boneId)
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

      // Add inner bone for stems in editor mode
      const isSelectedPart = this.isEditor && this.activePartId === part.id
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

      // Add eyes if this is a head bone and it's a stem and we're in close-up view
      if (bone.isHead && part.type === 'stem' && this.isCloseUp) {
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
      
      // Orient mesh using full basis
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
        this.renderPartHierarchyWithData(childPartId, attachmentTransform, data, partGroup, currentParentIds, attributes)
      }

      // After rendering bone and children, translate current transform forward by bone length
      const translation = new THREE.Matrix4().makeTranslation(0, bone.length, 0)
      currentTransform.multiply(rotMatrix).multiply(translation)
    }
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

  protected getDefaultColor(type: PartType): string {
    switch (type) {
      case 'stem': return '#44aa44'
      case 'leaf': return '#66cc66'
      case 'thorn': return '#aa4444'
      case 'flower': return '#ffdd88'
    }
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

  // Helper method to find a part group in the scene
  protected findPartGroup(partId: string): THREE.Group | undefined {
    return this.scene.children.find(child => 
      child instanceof THREE.Group && child.userData.partId === partId
    ) as THREE.Group | undefined
  }

  onResize() {
    const width = this.domElement.clientWidth
    const height = this.domElement.clientHeight

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    
    this.renderer.setSize(width, height)
    this.composer.setSize(width, height)
    
    const resolution = new THREE.Vector2(width, height)
    this.bloomPass.resolution.copy(resolution)
    this.outlinePass.resolution.copy(resolution)
  }

  protected createStandardMaterial(color: string, roughness = 0.8, metalness = 0.1): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness
    })
  }

  protected highlightMesh(mesh: THREE.Mesh | THREE.Group, highlight: boolean) {
    if (mesh instanceof THREE.Mesh) {
      const material = mesh.material as THREE.MeshStandardMaterial
      material.emissive.setHex(highlight ? 0x444444 : 0x000000)
    } else {
      mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const material = child.material as THREE.MeshStandardMaterial
          material.emissive.setHex(highlight ? 0x444444 : 0x000000)
        }
      })
    }
  }
} 