import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

export type InputMode = 'camera' | 'drag' | 'ui'
export type InputAction = 'rotate' | 'pan' | 'zoom' | 'drag'

export class InputManager {
  private controls: OrbitControls
  private currentMode: InputMode = 'camera'
  private blockedActions: Set<InputAction> = new Set()

  constructor(controls: OrbitControls) {
    this.controls = controls
    this.setMode('camera')
  }

  setMode(mode: InputMode) {
    this.currentMode = mode
    
    // Reset all controls first
    this.controls.enableRotate = true
    this.controls.enablePan = true
    this.controls.enableZoom = true
    this.blockedActions.clear()

    // Configure controls based on mode
    switch (mode) {
      case 'camera':
        // All controls enabled by default
        break
      case 'drag':
        // When dragging parts, disable camera movement
        this.controls.enableRotate = false
        this.controls.enablePan = false
        this.blockedActions.add('rotate')
        this.blockedActions.add('pan')
        break
      case 'ui':
        // When interacting with UI, disable all camera controls
        this.controls.enableRotate = false
        this.controls.enablePan = false
        this.controls.enableZoom = false
        this.blockedActions.add('rotate')
        this.blockedActions.add('pan')
        this.blockedActions.add('zoom')
        break
    }
  }

  blockAction(action: InputAction) {
    this.blockedActions.add(action)
    switch (action) {
      case 'rotate':
        this.controls.enableRotate = false
        break
      case 'pan':
        this.controls.enablePan = false
        break
      case 'zoom':
        this.controls.enableZoom = false
        break
    }
  }

  unblockAction(action: InputAction) {
    this.blockedActions.delete(action)
    // Only unblock if we're in camera mode
    if (this.currentMode === 'camera') {
      switch (action) {
        case 'rotate':
          this.controls.enableRotate = true
          break
        case 'pan':
          this.controls.enablePan = true
          break
        case 'zoom':
          this.controls.enableZoom = true
          break
      }
    }
  }

  isActionBlocked(action: InputAction): boolean {
    return this.blockedActions.has(action)
  }

  getCurrentMode(): InputMode {
    return this.currentMode
  }
} 