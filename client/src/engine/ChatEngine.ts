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
  private grassInstances: THREE.InstancedMesh | null = null
  private grassCount = 12000
  private grassRadius = 5

  constructor(container: HTMLElement) {
    super(container)

    // Set flags for eyes and editor mode
    this.isCloseUp = true
    this.isEditor = false
    this.isWindy = true

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

    // Create sky and sun
    this.createSkyAndSun()

    // Create ground and dark patches
    this.createGround()

    // Add pot
    const potGeo = new THREE.CylinderGeometry(0.6, 0.4, 0.4, 32)
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
    const dirtGeo = new THREE.SphereGeometry(0.55, 32, 16)
    const dirtMat = new THREE.MeshStandardMaterial({
      color: '#5C4033',
      roughness: 1,
      metalness: 0
    })
    const dirt = new THREE.Mesh(dirtGeo, dirtMat)
    dirt.scale.y = 0.3
    dirt.position.y = 0.35
    dirt.castShadow = true
    dirt.receiveShadow = true
    this.scene.add(dirt)

    // Create grass
    this.createGrass()

    // Start animation
    this.startAnimation()
  }

  private createSkyAndSun() {
    // Create sky dome
    const skyGeo = new THREE.SphereGeometry(100, 32, 32)
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color('#88aa99') },
        bottomColor: { value: new THREE.Color('#bbddbb') }
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
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          float t = pow(max(0.0, h * 0.5 + 0.5), 0.75);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }
      `,
      side: THREE.BackSide
    })
    const sky = new THREE.Mesh(skyGeo, skyMat)
    this.scene.add(sky)

    // Create sun
    const sunGeo = new THREE.CircleGeometry(5, 32)
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
    })
    const sun = new THREE.Mesh(sunGeo, sunMat)
    sun.position.set(-30, 40, -60)
    sun.lookAt(0, 0, 0)
    this.scene.add(sun)
  }

  private createGround() {
    // Create ground cylinder
    const groundGeo = new THREE.CylinderGeometry(5, 5, 0.1, 32)
    // Use a darker, slightly more saturated reddish dirt color
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#806b60',
      roughness: 1,
      metalness: 0
    })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.position.y = -0.05 // Move down half its height to align top with y=0
    ground.receiveShadow = true
    this.scene.add(ground)

    // Add scattered dark patches on top face
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

    // Helper function to get minimum distance to pot
    const getMinPotDistance = (x: number, z: number): number => {
      const dx = x;
      const dz = z;
      return Math.sqrt(dx * dx + dz * dz);
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

      // Get minimum distance to pot
      const minPotDist = getMinPotDistance(x, z);
      if (minPotDist < minPotDistance) {
        attempts++;
        continue;
      }

      // Calculate probability based on distances
      // Higher probability further from center AND further from pot
      const centerFactor = Math.min(distanceFromCenter / groundRadius, 1);
      const potFactor = Math.min((minPotDist - minPotDistance) / 1.5, 1); // Reduced from 2 to 1.5 to spread out grass more gradually
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

    // Render the plant
    this.renderPlant(data);
  }

  addMessage(plantId: string, content: string, sender: 'user' | 'plant', skipThinking: boolean = false) {
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
    // If it's a user message, show a "..." bubble for the plant (unless skipThinking is true)
    else if (sender === 'user' && content.trim() !== '' && !skipThinking) {
      // Show a "..." bubble for the plant
      this.showSpeechBubble('...')
    }

    return message
  }

  getConversation(plantId: string): Conversation | undefined {
    return this.conversations.get(plantId)
  }

  private showSpeechBubble(text: string) {
    // Check if domElement exists (might be null during disposal)
    if (!this.domElement) return;
    
    // Clear any existing speech bubbles
    const existingBubbles = this.domElement.querySelectorAll('.bubble-container');
    existingBubbles.forEach(bubble => bubble.remove());

    // If empty text, just clear bubbles and return
    if (!text) return;
    
    // Find the last user message if available
    let lastUserMessage = '';
    const isThinking = text === '...';
    
    if (this.plantData?.plantId) {
      const conversation = this.conversations.get(this.plantData.plantId);
      if (conversation && conversation.messages.length > 0) {
        // Find the most recent user message
        for (let i = conversation.messages.length - 1; i >= 0; i--) {
          const msg = conversation.messages[i];
          if (msg.sender === 'user') {
            lastUserMessage = msg.content;
            break;
          }
        }
      }
    }
    
    // Find the plant's head bone
    const headBone = Array.from(this.bones.values()).find(bone => bone.isHead)
    if (!headBone) return
    
    // Get head bone's world position
    const transform = this.boneTransforms.get(headBone.id)
    if (!transform) return
    
    // Get screen position
    const position = new THREE.Vector3()
    position.setFromMatrixPosition(transform)
    position.y += headBone.length * 1.4 // Position higher above head
    
    // Project to screen coordinates
    const screenPosition = position.clone()
    screenPosition.project(this.camera)
    
    // Convert to pixel coordinates
    const x = (screenPosition.x + 1) * this.domElement.clientWidth / 2
    const y = (-screenPosition.y + 1) * this.domElement.clientHeight / 2
    
    // Create container for both messages
    const bubbleContainer = document.createElement('div');
    bubbleContainer.className = 'bubble-container';
    bubbleContainer.style.position = 'absolute';
    bubbleContainer.style.left = `${x}px`;
    bubbleContainer.style.top = `${y}px`;
    bubbleContainer.style.transform = 'translate(-50%, -100%)';
    
    // Add user message if available
    if (lastUserMessage) {
      const userBubble = document.createElement('div');
      userBubble.className = 'chat-bubble user-bubble';
      userBubble.textContent = lastUserMessage;
      bubbleContainer.appendChild(userBubble);
    }
    
    // Add plant message
    const plantBubble = document.createElement('div');
    plantBubble.className = 'chat-bubble plant-bubble';
    if (isThinking) {
      plantBubble.className += ' thinking-bubble';
    }
    plantBubble.textContent = text;
    bubbleContainer.appendChild(plantBubble);
    
    // Add to DOM
    this.domElement.appendChild(bubbleContainer);
    
    // Adjust position if the bubble is too close to the top of the screen
    const bubbleRect = bubbleContainer.getBoundingClientRect();
    if (bubbleRect.top < 20) {
      const newTop = y + (20 - bubbleRect.top);
      bubbleContainer.style.top = `${newTop}px`;
    }
  }

  override dispose() {
    // Clean up grass instances
    if (this.grassInstances) {
      this.grassInstances.geometry.dispose()
      if (this.grassInstances.material instanceof THREE.Material) {
        this.grassInstances.material.dispose()
      }
      this.scene.remove(this.grassInstances)
      this.grassInstances = null
    }

    super.dispose()
  }
} 