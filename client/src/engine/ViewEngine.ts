import * as THREE from 'three'
import { EngineUtils } from './EngineUtils'
import { PlantData } from './types'

export class ViewEngine extends EngineUtils {
  private plots: THREE.Group[] = []
  private selectedPlot: number = -1
  private onSelectPlot: (plotIndex: number | null) => void
  private activePlots = new Map<number, PlantData>()
  private mouseDown = false
  private isDragging = false
  private dragStartPosition = new THREE.Vector3()
  private boundMouseDown: (event: MouseEvent) => void = () => {}
  private boundMouseMove: (event: MouseEvent) => void = () => {}
  private boundMouseUp: () => void = () => {}
  private receivedPlotIndex: number | null = null
  private grassInstances: THREE.InstancedMesh | null = null
  private grassCount = 2000 // Number of grass blades
  private grassRadius = 6 // How far out the grass extends
  private plotPositions: THREE.Vector3[] = [] // Store plot positions for grass distribution
  private bees: THREE.Mesh[] = [] // Store bee meshes
  private lastCameraState: { position: THREE.Vector3, target: THREE.Vector3 } | null = null

  constructor(container: HTMLElement, onSelectPlot: (plotIndex: number | null) => void) {
    super(container)
    this.onSelectPlot = onSelectPlot

    // Create sky and sun before anything else
    this.createSkyAndSun()

    // Load saved camera state or use default
    const savedState = localStorage.getItem('greenhouse_camera_state')
    if (savedState) {
      const state = JSON.parse(savedState)
      this.camera.position.set(state.position.x, state.position.y, state.position.z)
      this.controls.target.set(state.target.x, state.target.y, state.target.z)
    } else {
      // Default camera position
      this.camera.position.set(0, 8, 8)
      this.controls.target.set(0, 0, 0)
    }
    this.controls.update()

    // Store initial camera state
    this.lastCameraState = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone()
    }

    // Add camera change listener
    this.controls.addEventListener('change', () => {
      // Only save if position actually changed
      if (!this.lastCameraState?.position.equals(this.camera.position) ||
          !this.lastCameraState?.target.equals(this.controls.target)) {
        
        this.lastCameraState = {
          position: this.camera.position.clone(),
          target: this.controls.target.clone()
        }
        
        // Save to localStorage
        localStorage.setItem('greenhouse_camera_state', JSON.stringify({
          position: {
            x: this.camera.position.x,
            y: this.camera.position.y,
            z: this.camera.position.z
          },
          target: {
            x: this.controls.target.x,
            y: this.controls.target.y,
            z: this.controls.target.z
          }
        }))
      }
    })

    // Create ground
    this.createGround()
    
    // Create plots
    this.createPlots()
    
    // Create grass
    this.createGrass()

    // Create bees
    this.createBees()
    
    // Add plot selection interaction
    this.setupInteraction()
  }

  private createSkyAndSun() {
    // Create sky dome
    const skyGeo = new THREE.SphereGeometry(100, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color('#bbddbb') },
        bottomColor: { value: new THREE.Color('#88aa99') },
        offset: { value: 20 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);

    // Create sun
    const sunGeo = new THREE.CircleGeometry(4, 32);
    const sunMat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color('#ffdd88') },
        glowColor: { value: new THREE.Color('#ffaa44') }
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform vec3 glowColor;
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 4.0);
          gl_FragColor = vec4(mix(color, glowColor, intensity), 1.0);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending
    });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    sun.position.set(-30, 40, -60);
    sun.lookAt(0, 0, 0);
    this.scene.add(sun);
  }

  private createGround() {
    // Add ground plane with better material
    const groundGeometry = new THREE.CylinderGeometry(5, 5, 0.1, 32);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: '#806b60',
      roughness: 1,
      metalness: 0
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.position.y = -0.05; // Move down half its height to align top with y=0
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Add scattered dark patches
    this.createDarkPatches()
  }

  private createDarkPatches() {
    // Create seeded random number generator
    let seed = 5678;
    const seededRandom = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    // Create a square geometry
    const patchGeo = new THREE.PlaneGeometry(1, 1);
    
    // Create darker material
    const patchMat = new THREE.MeshStandardMaterial({
      color: '#786358',
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
    });

    // Create instanced mesh for patches
    const patchCount = 100;
    const patches = new THREE.InstancedMesh(patchGeo, patchMat, patchCount);
    patches.receiveShadow = true;

    // Get ground radius
    const groundRadius = 5;
    
    // Matrix for transformations
    const matrix = new THREE.Matrix4();
    
    let validInstanceCount = 0;
    let attempts = 0;
    const maxAttempts = patchCount * 2;

    // Sample uniformly over x-y grid
    while (validInstanceCount < patchCount && attempts < maxAttempts) {
      const x = (seededRandom() * 2 - 1) * groundRadius;
      const z = (seededRandom() * 2 - 1) * groundRadius;
      
      // Check if point is within ground circle
      const distanceFromCenter = Math.sqrt(x * x + z * z);
      if (distanceFromCenter > groundRadius) {
        attempts++;
        continue;
      }

      // Calculate base scale with power distribution
      const baseScale = Math.pow(seededRandom(), 4) * 2.5;
      
      // Check if any corner of the square would be outside the circle
      const squareRadius = baseScale * 0.7071; // sqrt(2)/2 ≈ 0.7071
      if (distanceFromCenter + squareRadius > groundRadius) {
        attempts++;
        continue;
      }

      // Higher probability towards center
      const normalizedDist = distanceFromCenter / groundRadius;
      const probability = Math.pow(1 - normalizedDist, 1.2) * 0.9;

      if (seededRandom() < probability) {
        // Position matrix - place slightly above ground surface
        matrix.makeTranslation(x, 0.001, z);
        
        // Apply rotation around Y axis
        const rotationY = seededRandom() * Math.PI * 2;
        matrix.multiply(new THREE.Matrix4().makeRotationY(rotationY));
        
        // Lay flat by rotating around X
        matrix.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
        
        // Apply scale last
        matrix.scale(new THREE.Vector3(baseScale, baseScale, 1));

        // Apply to instance
        patches.setMatrixAt(validInstanceCount, matrix);
        validInstanceCount++;
      }
      
      attempts++;
    }

    // Update instance count and add to scene
    patches.count = validInstanceCount;
    patches.instanceMatrix.needsUpdate = true;
    this.scene.add(patches);
  }

  private createPlots() {
    // Plot dimensions
    const plotSpacing = 1.8
    const rows = 2
    const cols = 3
    
    // Calculate total dimensions
    const totalWidth = (cols - 1) * plotSpacing
    const totalDepth = (rows - 1) * plotSpacing
    
    // Create plots in a grid
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const plot = this.createPlot()
        
        // Position plot in grid
        const x = col * plotSpacing - totalWidth / 2
        const z = row * plotSpacing - totalDepth / 2
        plot.position.set(x, 0, z)
        
        this.plots.push(plot)
        this.scene.add(plot)
      }
    }
  }

  private createPlot(): THREE.Group {
    const group = new THREE.Group()
    
    // Create pot
    const potGeo = new THREE.CylinderGeometry(0.6, 0.4, 0.4, 32)
    const potMat = this.createStandardMaterial('#8B5E3C', 0.6)
    const pot = new THREE.Mesh(potGeo, potMat)
    pot.position.y = 0.2
    pot.castShadow = true
    pot.receiveShadow = true
    group.add(pot)
    
    // Create dirt mound
    const dirtGeo = new THREE.SphereGeometry(0.5, 32, 16)
    const dirtMat = this.createStandardMaterial('#5C4033', 1, 0)
    const dirt = new THREE.Mesh(dirtGeo, dirtMat)
    dirt.scale.y = 0.3
    dirt.position.y = 0.35
    dirt.castShadow = true
    dirt.receiveShadow = true
    group.add(dirt)
    
    return group
  }

  private createGrass() {
    // Create seeded random number generator
    let seed = 1234; // Fixed seed
    const seededRandom = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    // Create a vertical rectangle geometry for grass patches
    const grassGeo = new THREE.PlaneGeometry(0.06, 0.6);
    // Keep vertical but move pivot to bottom
    grassGeo.translate(0, 0.3, 0);
    
    // Create grass material
    const grassMat = new THREE.MeshStandardMaterial({
      color: '#77bb55',
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.1
    });

    // Increase grass count for better coverage with uniform sampling
    this.grassCount = 12000;

    // Create instanced mesh
    this.grassInstances = new THREE.InstancedMesh(grassGeo, grassMat, this.grassCount);
    this.grassInstances.receiveShadow = true;

    // Get ground radius from geometry
    const groundRadius = 5; // Matches circle geometry in createGround()
    
    // Get accurate pot dimensions
    const potTopRadius = 0.6;
    const potBottomRadius = 0.4;
    const maxPotRadius = Math.max(potTopRadius, potBottomRadius);
    const minPotDistance = maxPotRadius + 0.4; // Increased buffer from 0.1 to 0.4 for more space around pots

    // Store plot positions and create matrix/quaternion
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    
    let validInstanceCount = 0;
    let attempts = 0;
    const maxAttempts = this.grassCount * 2;

    // Helper function to get minimum distance to any plot
    const getMinPlotDistance = (x: number, z: number): number => {
      let minDistance = Infinity;
      for (const plot of this.plots) {
        const plotPos = plot.position;
        const dx = x - plotPos.x;
        const dz = z - plotPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        minDistance = Math.min(minDistance, distance);
      }
      return minDistance;
    };

    // Helper function to place grass patch
    const placeGrassPatch = (x: number, z: number, distanceFromCenter: number) => {
      if (!this.grassInstances) return;
      
      // Calculate base height based on distance from center
      // Edge height is 0.8, center is 20% of that (0.16)
      // Use quadratic falloff for more gradual transition
      const edgeHeight = 0.8;
      const centerHeight = edgeHeight * 0.2;
      const normalizedDist = distanceFromCenter / groundRadius;
      const baseHeight = centerHeight + (edgeHeight - centerHeight) * Math.pow(normalizedDist, 2);
      
      // Add more random height variation (more variation near edges)
      const heightVariation = 0.1 + Math.pow(normalizedDist, 1.5) * 0.3;
      const height = baseHeight + (seededRandom() - 0.3) * heightVariation; // Use seeded random

      // Random rotation around Y for variety
      const rotation = seededRandom() * Math.PI * 2; // Use seeded random
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation);

      // Add slight random tilt (more tilt near edges)
      const maxTilt = (distanceFromCenter / groundRadius) * 0.3;
      const tiltAxis = new THREE.Vector3(
        (seededRandom() - 0.5) * maxTilt, // Use seeded random
        0,
        (seededRandom() - 0.5) * maxTilt  // Use seeded random
      ).normalize();
      const tiltQuaternion = new THREE.Quaternion();
      tiltQuaternion.setFromAxisAngle(tiltAxis, seededRandom() * maxTilt); // Use seeded random
      quaternion.multiply(tiltQuaternion);

      // Set position and scale
      matrix.makeRotationFromQuaternion(quaternion);
      matrix.setPosition(x, 0, z);
      matrix.scale(new THREE.Vector3(1, height, 1));

      // Apply to instance
      this.grassInstances.setMatrixAt(validInstanceCount, matrix);
      validInstanceCount++;
    };
    
    // Sample uniformly over x-y grid
    while (validInstanceCount < this.grassCount && attempts < maxAttempts) {
      // Random position in square that bounds the circle
      const x = (seededRandom() * 2 - 1) * groundRadius; // Use seeded random
      const z = (seededRandom() * 2 - 1) * groundRadius; // Use seeded random
      
      // Check if point is within ground circle
      const distanceFromCenter = Math.sqrt(x * x + z * z);
      if (distanceFromCenter > groundRadius) {
        attempts++;
        continue;
      }

      // Get minimum distance to any plot
      const minPlotDist = getMinPlotDistance(x, z);
      if (minPlotDist < minPotDistance) {
        attempts++;
        continue;
      }

      // Calculate probability based on distances
      // Higher probability further from center AND further from pots
      const centerFactor = Math.min(distanceFromCenter / groundRadius, 1);
      const potFactor = Math.min((minPlotDist - minPotDistance) / 1.5, 1); // Reduced from 2 to 1.5 to spread out grass more gradually
      const rawProbability = Math.pow(centerFactor * potFactor, 1.2);
      // Scale probability to start at 0.33 once above zero
      const probability = rawProbability > 0 ? 0.1 + (rawProbability * 0.9) : 0;

      if (seededRandom() < probability) { // Use seeded random
        placeGrassPatch(x, z, distanceFromCenter);
      }
      
      attempts++;
    }

    if (this.grassInstances) {
      // Update final instance count
      this.grassInstances.count = validInstanceCount;
      this.grassInstances.instanceMatrix.needsUpdate = true;
      this.scene.add(this.grassInstances);
    }
  }

  private createBees() {
    // Create simple yellow sphere geometry and material
    const beeGeo = new THREE.SphereGeometry(0.02, 8, 8)
    const beeMat = new THREE.MeshBasicMaterial({
      color: '#ffdd44',
    })

    // Create 3 bees
    for (let i = 0; i < 3; i++) {
      const bee = new THREE.Mesh(beeGeo, beeMat)
      
      // Random starting position
      bee.position.set(
        (Math.random() - 0.5) * 6,
        0.5 + Math.random(), // Will give range of 0.5-1.5
        (Math.random() - 0.5) * 6
      )

      // Store random movement direction
      bee.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.5
      )

      this.bees.push(bee)
      this.scene.add(bee)
    }
  }

  private setupInteraction() {
    const onMouseDown = (event: MouseEvent) => {
      this.mouseDown = true
      this.isDragging = false
      this.dragStartPosition.set(event.clientX, event.clientY, 0)
    }

    const onMouseMove = (event: MouseEvent) => {
      // Calculate mouse position in normalized device coordinates
      this.mouse.x = (event.clientX / this.domElement.clientWidth) * 2 - 1
      this.mouse.y = -(event.clientY / this.domElement.clientHeight) * 2 + 1
      
      // Start dragging if we've moved enough while mouse is down
      if (!this.isDragging && this.mouseDown) {
        const dragDistance = new THREE.Vector3(event.clientX, event.clientY, 0)
          .sub(this.dragStartPosition)
          .length()
        
        if (dragDistance > 5) {
          this.isDragging = true
        }
      }
      
      // Update the picking ray with the camera and mouse position
      this.raycaster.setFromCamera(this.mouse, this.camera)
      
      // Calculate objects intersecting the picking ray
      let minDistance = Infinity
      let closestPlot = -1
      
      this.plots.forEach((plot, index) => {
        const intersects = this.raycaster.intersectObjects(plot.children, true)
        if (intersects.length > 0 && intersects[0].distance < minDistance) {
          minDistance = intersects[0].distance
          closestPlot = index
        }
      })
      
      // Update selection
      if (this.selectedPlot !== closestPlot) {
        // Remove highlight from previously selected plot
        if (this.selectedPlot !== -1) {
          this.highlightPlot(this.selectedPlot, false)
        }
        
        // Add highlight to newly selected plot
        if (closestPlot !== -1) {
          this.highlightPlot(closestPlot, true)
        }
        
        this.selectedPlot = closestPlot
      }
    }
    
    const onMouseUp = () => {
      if (this.mouseDown && !this.isDragging) {
        // Pass null if no plot is selected, otherwise pass the selected plot index
        this.onSelectPlot(this.selectedPlot === -1 ? null : this.selectedPlot)
      }
      this.mouseDown = false
      this.isDragging = false
    }

    // Store bound functions for removal later
    this.boundMouseDown = onMouseDown.bind(this)
    this.boundMouseMove = onMouseMove.bind(this)
    this.boundMouseUp = onMouseUp.bind(this)

    this.domElement.addEventListener('mousedown', this.boundMouseDown)
    this.domElement.addEventListener('mousemove', this.boundMouseMove)
    this.domElement.addEventListener('mouseup', this.boundMouseUp)
  }

  private highlightPlot(index: number, highlight: boolean) {
    const plot = this.plots[index]
    if (!plot) return
    this.highlightMesh(plot, highlight)
  }

  // Methods for managing plants in plots
  setReceivedPlot(plotIndex: number | null) {
    this.receivedPlotIndex = plotIndex
    
    // Update pot color
    if (plotIndex !== null) {
      const plot = this.plots[plotIndex]
      if (plot) {
        const potMesh = plot.children.find((child: THREE.Object3D) => child instanceof THREE.Mesh) as THREE.Mesh
        if (potMesh && potMesh.material instanceof THREE.MeshStandardMaterial) {
          potMesh.material.color.setHex(0x44cc77) // Saturated green color
          potMesh.material.opacity = 0.8
        }
      }
    }
  }

  setPlantInPlot(plotIndex: number, plantData: PlantData | undefined) {
    if (plantData) {
      // Get plot position
      const plot = this.plots[plotIndex]
      if (!plot) return

      // Store the original data without plot offset
      this.activePlots.set(plotIndex, {
        plantId: plantData.plantId,
        parts: new Map(plantData.parts),
        bones: new Map(plantData.bones),
        bodies: new Map(plantData.bodies),
        roots: new Set(plantData.roots),
        shareId: plantData.shareId,
        isCarried: plantData.isCarried
      })

      // Update pot color based on state
      const potMesh = plot.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh
      if (potMesh && potMesh.material instanceof THREE.MeshStandardMaterial) {
        if (plantData.shareId) {
          potMesh.material.color.setHex(0x4477ff) // Blue for shared
          potMesh.material.opacity = 0.8
        } else if (plantData.isCarried) {
          potMesh.material.color.setHex(0xFFD700) // Gold for carried
          potMesh.material.opacity = 0.8
        } else if (plotIndex === this.receivedPlotIndex) {
          potMesh.material.color.setHex(0x44cc77) // Saturated green for received
          potMesh.material.opacity = 0.8
        } else {
          potMesh.material.color.setHex(0x8B5E3C) // Default brown
          potMesh.material.opacity = 0.6
        }
      }

      // Create offset version for initial render
      const offsetData = this.createOffsetPlantData(plantData, plot.position)
      this.renderPlant(offsetData)
    } else {
      // Reset pot color to default
      const plot = this.plots[plotIndex]
      if (plot) {
        const potMesh = plot.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh
        if (potMesh && potMesh.material instanceof THREE.MeshStandardMaterial) {
          potMesh.material.color.setHex(0x8B5E3C)
          potMesh.material.opacity = 0.6
        }
      }
      // Clear from active plots
      this.activePlots.delete(plotIndex)
    }
  }

  setCarriedPlot(plotIndex: number | null) {
    // Reset all plots to their appropriate colors
    this.plots.forEach((plot, index) => {
      const potMesh = plot.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh
      if (potMesh && potMesh.material instanceof THREE.MeshStandardMaterial) {
        const plantData = this.activePlots.get(index)
        if (plantData?.shareId) {
          potMesh.material.color.setHex(0x4477ff) // Keep blue for shared
          potMesh.material.opacity = 0.8
        } else if (index === this.receivedPlotIndex) {
          potMesh.material.color.setHex(0x44cc77) // Keep saturated green for received
          potMesh.material.opacity = 0.8
        } else {
          potMesh.material.color.setHex(0x8B5E3C) // Default brown
          potMesh.material.opacity = 0.6
        }
      }
    })

    // Highlight carried plot
    if (plotIndex !== null) {
      const plot = this.plots[plotIndex]
      if (!plot) return

      const potMesh = plot.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh
      if (potMesh && potMesh.material instanceof THREE.MeshStandardMaterial) {
        potMesh.material.color.setHex(0xFFD700) // Gold color
        potMesh.material.opacity = 0.8
      }
    }
  }

  setSharedPlot(plotIndex: number) {
    const plot = this.plots[plotIndex]
    if (!plot) return

    const potMesh = plot.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh
    if (potMesh && potMesh.material instanceof THREE.MeshStandardMaterial) {
      potMesh.material.color.setHex(0x4477ff) // Blue color
      potMesh.material.opacity = 0.8
    }
  }

  private createOffsetPlantData(plantData: PlantData, plotOffset: THREE.Vector3): PlantData {
    // Create deep clone of plant data
    const offsetData: PlantData = {
      plantId: plantData.plantId,
      parts: new Map(plantData.parts),
      bones: new Map(plantData.bones),
      bodies: new Map(),
      roots: new Set(plantData.roots)
    }

    // Add plot offset to each body
    for (const [id, body] of plantData.bodies) {
      offsetData.bodies.set(id, {
        id: body.id,
        rootPartId: body.rootPartId,
        transform: {
          position: body.transform.position.clone().add(plotOffset),
          up: body.transform.up.clone(),
          right: body.transform.right.clone(),
          forward: body.transform.forward.clone()
        }
      })
    }

    return offsetData
  }
  
  getPlantFromPlot(plotIndex: number): PlantData | undefined {
    // Return the original data without plot offset
    return this.activePlots.get(plotIndex)
  }
  
  isPlotOccupied(plotIndex: number): boolean {
    return this.activePlots.has(plotIndex)
  }

  override dispose() {
    // Remove event listeners with proper bound functions
    if (this.boundMouseDown) this.domElement.removeEventListener('mousedown', this.boundMouseDown)
    if (this.boundMouseMove) this.domElement.removeEventListener('mousemove', this.boundMouseMove)
    if (this.boundMouseUp) this.domElement.removeEventListener('mouseup', this.boundMouseUp)
    
    // Clean up grass instances
    if (this.grassInstances) {
      this.grassInstances.geometry.dispose()
      if (this.grassInstances.material instanceof THREE.Material) {
        this.grassInstances.material.dispose()
      }
      this.scene.remove(this.grassInstances)
      this.grassInstances = null
    }

    // Clean up bees
    this.bees.forEach(bee => {
      bee.geometry.dispose()
      if (bee.material instanceof THREE.Material) {
        bee.material.dispose()
      }
      this.scene.remove(bee)
    })
    this.bees = []
    
    // Call parent dispose first
    super.dispose()
    
    // Clear all plots
    this.plots = []
  }

  protected override animate() {
    if (this.isDisposed() || this.isDisposing) return
    
    this.animationFrameId = requestAnimationFrame(() => this.animate())
    if (!this.scene || !this.renderer || !this.composer) return
    
    this.controls?.update()

    try {
      // Update bee positions
      const deltaTime = 0.016 // Assume 60fps for simplicity
      this.bees?.forEach(bee => {
        // Update position
        bee.position.add(bee.userData.velocity.clone().multiplyScalar(deltaTime))
        
        // Bounce off bounds
        const bounds = 4
        if (bee.position.x < -bounds || bee.position.x > bounds) bee.userData.velocity.x *= -1
        if (bee.position.y < 0.5 || bee.position.y > 1.5) bee.userData.velocity.y *= -1
        if (bee.position.z < -bounds || bee.position.z > bounds) bee.userData.velocity.z *= -1

        // Add small random movement
        bee.userData.velocity.add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.003,
          (Math.random() - 0.5) * 0.003,
          (Math.random() - 0.5) * 0.003
        ))

        // Limit speed
        if (bee.userData.velocity.length() > 3) {
          bee.userData.velocity.normalize().multiplyScalar(3)
        }
      })

      // Re-render all active plants with their plot offsets
      if (this.activePlots && this.activePlots.size > 0) {
        // Clear only plant meshes at start of frame
        const groupsToRemove = this.scene.children.filter(child => 
          child instanceof THREE.Group && child.userData.bodyId !== undefined
        )
        
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

        // Re-render each plant in its plot
        for (const [plotIndex, plantData] of this.activePlots.entries()) {
          const plot = this.plots[plotIndex]
          if (!plot) continue

          // Create offset version for rendering
          const offsetData = this.createOffsetPlantData(plantData, plot.position)
          this.renderPlant(offsetData)
        }
      }

      this.composer?.render()
    } catch (error) {
      console.error('Error in ViewEngine animation loop:', error)
    }
  }

  getPlotScreenPosition(plotIndex: number): { x: number, y: number } | null {
    const plot = this.plots[plotIndex]
    if (!plot) return null

    // Get plot's world position
    const position = new THREE.Vector3()
    plot.getWorldPosition(position)
    position.y += 0.4 // Position above the pot

    // Project to screen coordinates
    const screenPosition = position.clone()
    screenPosition.project(this.camera)

    // Convert to pixel coordinates
    const x = (screenPosition.x + 1) * this.domElement.clientWidth / 2
    const y = (-screenPosition.y + 1) * this.domElement.clientHeight / 2

    return { x, y }
  }
} 