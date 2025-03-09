import * as THREE from 'three'
import { EngineUtils } from './EngineUtils'
import { PlantData } from './types'

export class ViewEngine extends EngineUtils {
  private plots: THREE.Group[] = []
  private selectedPlot: number = -1
  private onSelectPlot: (plotIndex: number) => void
  private activePlots = new Map<number, PlantData>()
  private mouseDown = false
  private isDragging = false
  private dragStartPosition = new THREE.Vector3()
  private boundMouseDown: (event: MouseEvent) => void = () => {}
  private boundMouseMove: (event: MouseEvent) => void = () => {}
  private boundMouseUp: () => void = () => {}

  constructor(container: HTMLElement, onSelectPlot: (plotIndex: number) => void) {
    super(container)
    this.onSelectPlot = onSelectPlot

    // this.scene.background = new THREE.Color('#ccccff')
    this.scene.background = new THREE.Color('#88aa99')

    // Adjust camera for greenhouse view
    this.camera.position.set(0, 6, 8)
    this.camera.lookAt(0, 0, 0)
    this.controls.target.set(0, 0, 0)
    this.controls.update()

    // Create ground
    this.createGround()
    
    // Create plots
    this.createPlots()
    
    // Add plot selection interaction
    this.setupInteraction()
  }

  private createGround() {
    // Create ground plane
    const groundGeo = new THREE.CircleGeometry(5, 32)
    // const groundMat = this.createStandardMaterial('#ccc9c5')
    const groundMat = this.createStandardMaterial('#bbddbb')
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)
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
    const dirtMat = this.createStandardMaterial('#5C4033', 0.8, 0)
    const dirt = new THREE.Mesh(dirtGeo, dirtMat)
    dirt.scale.y = 0.3
    dirt.position.y = 0.35
    dirt.castShadow = true
    dirt.receiveShadow = true
    group.add(dirt)
    
    return group
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
      if (this.mouseDown && !this.isDragging && this.selectedPlot !== -1) {
        this.onSelectPlot(this.selectedPlot)
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
  setPlantInPlot(plotIndex: number, plantData: PlantData | undefined) {
    if (plantData) {
      // Get plot position
      const plot = this.plots[plotIndex]
      if (!plot) return

      // Store the original data without plot offset
      this.activePlots.set(plotIndex, {
        parts: new Map(plantData.parts),
        bones: new Map(plantData.bones),
        bodies: new Map(plantData.bodies),
        roots: new Set(plantData.roots)
      })

      // Create offset version for initial render
      const offsetData = this.createOffsetPlantData(plantData, plot.position)
      this.renderPlant(offsetData)
    } else {
      // Clear from active plots
      this.activePlots.delete(plotIndex)
    }
  }

  private createOffsetPlantData(plantData: PlantData, plotOffset: THREE.Vector3): PlantData {
    // Create deep clone of plant data
    const offsetData: PlantData = {
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
} 