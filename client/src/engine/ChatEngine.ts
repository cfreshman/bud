import * as THREE from 'three'
import { EngineUtils } from './EngineUtils'
import { PlantData } from './types'
import { generateUUID } from '../utils/idUtils'

export interface Message {
  id: string
  plantId: string
  content: string
  sender: 'user' | 'plant'
  timestamp: number
}

export interface Conversation {
  id: string
  plantId: string
  messages: Message[]
}

export class ChatEngine extends EngineUtils {
  private conversations = new Map<string, Conversation>()
  private plantData?: PlantData

  constructor(container: HTMLElement) {
    super(container)

    // Set flags for eyes and editor mode
    this.isCloseUp = true
    this.isEditor = false

    // Configure scene for chat view - green background
    this.scene.background = new THREE.Color('#88aa99')
    
    // Position camera for close-up view
    this.camera.position.set(0, 2, 3)
    this.camera.lookAt(0, 1, 0)
    this.controls.target.set(0, 1, 0)

    // Limit camera movement
    this.controls.minDistance = 2
    this.controls.maxDistance = 4
    this.controls.minPolarAngle = Math.PI / 4 // Limit how high camera can go
    this.controls.maxPolarAngle = Math.PI / 2 // Limit how low camera can go
    this.controls.update()

    // Add ground - green
    const groundGeo = new THREE.CircleGeometry(5, 32)
    const groundMat = new THREE.MeshStandardMaterial({ 
      color: '#bbddbb',
      roughness: 0.8,
      metalness: 0.1
    })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    // Add pot
    const potGeo = new THREE.CylinderGeometry(0.4, 0.3, 0.4, 32)
    const potMat = new THREE.MeshStandardMaterial({ 
      color: '#8B5E3C',
      roughness: 0.6,
      metalness: 0.1
    })
    const pot = new THREE.Mesh(potGeo, potMat)
    pot.position.y = 0.2
    pot.castShadow = true
    pot.receiveShadow = true
    this.scene.add(pot)

    // Add dirt
    const dirtGeo = new THREE.SphereGeometry(0.35, 32, 16)
    const dirtMat = new THREE.MeshStandardMaterial({
      color: '#5C4033',
      roughness: 0.8,
      metalness: 0
    })
    const dirt = new THREE.Mesh(dirtGeo, dirtMat)
    dirt.scale.y = 0.3
    dirt.position.y = 0.35
    dirt.castShadow = true
    dirt.receiveShadow = true
    this.scene.add(dirt)

    // Start animation
    this.startAnimation()
  }

  setPlantData(data: PlantData) {
    // Store a reference to the plant data
    this.plantData = data;
    
    // Clear existing meshes
    this.scene.children.forEach(child => {
      if (child.userData.isPlantPart) {
        this.scene.remove(child);
      }
    });

    // Copy properties from data
    this.parts = new Map(data.parts);
    this.bones = new Map(data.bones);
    this.bodies = new Map(data.bodies);
    this.roots = new Set(data.roots);
    
    // Place plant at center of scene
    const body = Array.from(this.bodies.values())[0];
    if (body) {
      const offsetPosition = new THREE.Vector3(0, 0.4, 0);
      const transform = new THREE.Matrix4().makeBasis(
        body.transform.right,
        body.transform.up, 
        body.transform.forward
      );
      transform.setPosition(offsetPosition);
      
      // Render the plant at this position
      this.renderPlant(data);
    }
  }

  addMessage(plantId: string, content: string, sender: 'user' | 'plant') {
    let conversation = this.conversations.get(plantId)
    
    if (!conversation) {
      conversation = {
        id: generateUUID(),
        plantId,
        messages: []
      }
      this.conversations.set(plantId, conversation)
    }

    const message: Message = {
      id: generateUUID(),
      plantId,
      content,
      sender,
      timestamp: Date.now()
    }

    conversation.messages.push(message)
    
    // If it's a plant message, show the speech bubble
    if (sender === 'plant') {
      this.showSpeechBubble(content)
    }

    return message
  }

  getConversation(plantId: string): Conversation | undefined {
    return this.conversations.get(plantId)
  }

  private showSpeechBubble(text: string) {
    // Find the plant's head bone
    const headBone = Array.from(this.bones.values()).find(bone => bone.isHead)
    if (!headBone) return

    // Get head bone's world position
    const transform = this.boneTransforms.get(headBone.id)
    if (!transform) return

    // Get screen position
    const position = new THREE.Vector3()
    position.setFromMatrixPosition(transform)
    position.y += headBone.length // Position above head

    // Project to screen coordinates
    const screenPosition = position.clone()
    screenPosition.project(this.camera)

    // Convert to pixel coordinates
    const x = (screenPosition.x + 1) * this.domElement.clientWidth / 2
    const y = (-screenPosition.y + 1) * this.domElement.clientHeight / 2

    // Create container for speech bubble
    const bubbleContainer = document.createElement('div')
    bubbleContainer.className = 'chat-bubble-container'
    bubbleContainer.style.left = `${x}px`
    bubbleContainer.style.top = `${y}px`
    bubbleContainer.style.transform = 'translate(-50%, -100%)'

    // Create speech bubble rectangle
    const bubble = document.createElement('div')
    bubble.className = 'chat-bubble'
    bubble.textContent = text
    
    // Create triangle stem
    const stem = document.createElement('div')
    stem.className = 'chat-bubble-stem'
    
    // Create inner triangle to create the outline effect
    const innerStem = document.createElement('div')
    innerStem.className = 'chat-bubble-stem-inner'
    
    stem.appendChild(innerStem)
    
    // Assemble bubble
    bubbleContainer.appendChild(bubble)
    bubbleContainer.appendChild(stem)
    this.domElement.appendChild(bubbleContainer)

    // Fade in
    requestAnimationFrame(() => {
      bubbleContainer.style.opacity = '1'
    })

    // Remove after delay
    setTimeout(() => {
      bubbleContainer.style.opacity = '0'
      setTimeout(() => bubbleContainer.remove(), 200)
    }, 5000)
  }

  protected override animate() {
    super.animate()
    
    // Add any chat-specific animation here if needed
  }
} 