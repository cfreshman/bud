import { ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { PlantData, Body, Part, Bone, PartType, PartAttributes, Transform } from './types';

export class ViewEngine {
  protected scene: THREE.Scene;
  protected camera: THREE.PerspectiveCamera;
  protected renderer: Renderer;
  protected plantGroup: THREE.Group;
  protected animationFrame: number | null = null;
  protected gl: ExpoWebGLRenderingContext;
  protected boneTransforms: Map<string, THREE.Matrix4> = new Map();
  protected bonePartIds: Map<string, string> = new Map();
  protected partParentIds: Map<string, Set<string>> = new Map();
  protected isDisposing: boolean = false;
  protected isCloseUp: boolean = true;
  protected isEditor: boolean = false;
  protected isWindy: boolean = false;

  // Plant data
  protected parts = new Map<string, Part>();
  protected bones = new Map<string, Bone>();
  protected bodies = new Map<string, Body>();
  protected roots = new Set<string>();

  // Camera control
  protected targetRotation = new THREE.Vector2(0, 0);
  protected cameraDistance = 5;
  protected cameraTarget = new THREE.Vector3(0, 1, 0);

  constructor(gl: ExpoWebGLRenderingContext) {
    console.log('ViewEngine constructor starting');
    this.gl = gl;
    
    // Get dimensions and validate
    const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;
    console.log('GL dimensions:', { width, height });
    
    if (!width || !height) {
      throw new Error('Invalid GL dimensions');
    }
    
    // Initialize Three.js scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#88aa99');
    console.log('Scene created with background:', this.scene.background);

    // Initialize camera with valid aspect ratio
    this.camera = new THREE.PerspectiveCamera(
      40,
      width / height,
      0.1,
      1000
    );
    
    // Initialize renderer with correct viewport
    console.log('Creating renderer...');
    this.renderer = new Renderer({ gl });
    
    // Reduce resolution by half while keeping display size
    const pixelRatio = 0.5;
    const renderWidth = Math.floor(width * pixelRatio);
    const renderHeight = Math.floor(height * pixelRatio);
    
    // Set display size to full dimensions
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(pixelRatio);
    
    // Set viewport to full dimensions (not render dimensions)
    gl.viewport(0, 0, width, height);
    
    this.renderer.setClearColor('#88aa99', 1);
    
    // Update camera aspect to match display dimensions
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    const color = new THREE.Color();
    this.renderer.getClearColor(color);
    console.log('Renderer created with clear color:', color);

    // Create plant group
    this.plantGroup = new THREE.Group();
    this.scene.add(this.plantGroup);
    console.log('Plant group added to scene');

    // Add stronger lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.2);
    this.scene.add(ambientLight);

    // Add directional light with reduced shadow quality for performance
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.2);
    directionalLight.position.set(2, 4, 2);
    this.scene.add(directionalLight);
    console.log('Lights added to scene');

    // Add ground - green
    const groundGeo = new THREE.CircleGeometry(2, 32);
    const groundMat = new THREE.MeshPhongMaterial({ 
      color: '#bbddbb',
      shininess: 0
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    console.log('Ground added to scene');

    // Add pot
    const potGeo = new THREE.CylinderGeometry(0.6, 0.4, 0.4, 32);
    const potMat = new THREE.MeshPhongMaterial({ 
      color: '#8B5E3C',
      shininess: 10
    });
    const pot = new THREE.Mesh(potGeo, potMat);
    pot.position.y = 0.2;
    this.scene.add(pot);
    console.log('Pot added to scene');

    // Add dirt
    const dirtGeo = new THREE.SphereGeometry(0.55, 32, 16);
    const dirtMat = new THREE.MeshPhongMaterial({
      color: '#5C4033',
      shininess: 0
    });
    const dirt = new THREE.Mesh(dirtGeo, dirtMat);
    dirt.scale.y = 0.3;
    dirt.position.y = 0.35;
    this.scene.add(dirt);
    console.log('Dirt added to scene');

    // Update initial camera position for better view
    this.cameraDistance = 4; // Closer view
    this.cameraTarget.set(0, 0.8, 0); // Look at middle of plant
    this.targetRotation.set(Math.PI / 2, 0); // Angled view from front
    this.updateCameraPosition();
    console.log('Initial camera position:', this.camera.position.toArray());

    // Start animation
    console.log('Starting animation loop');
    this.animate();
    console.log('ViewEngine constructor complete');

    // Force initial render
    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP();
    console.log('Initial render complete, scene children:', this.scene.children.length);
  }

  // Update camera position based on rotation and distance
  private updateCameraPosition() {
    const phi = this.targetRotation.y + Math.PI / 4; // Add offset to start above
    const theta = this.targetRotation.x;
    
    this.camera.position.x = this.cameraDistance * Math.sin(phi) * Math.cos(theta);
    this.camera.position.y = this.cameraDistance * Math.cos(phi);
    this.camera.position.z = this.cameraDistance * Math.sin(phi) * Math.sin(theta);
    
    this.camera.position.add(this.cameraTarget);
    this.camera.lookAt(this.cameraTarget);
  }

  // Handle touch input for camera control
  public onTouchMove(dx: number, dy: number) {
    const sensitivity = 0.01;
    this.targetRotation.x += dx * sensitivity;
    this.targetRotation.y = Math.max(-Math.PI/3, Math.min(Math.PI/3, this.targetRotation.y + dy * sensitivity));
    this.updateCameraPosition();
    
    // Force render after camera move
    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP();
  }

  // Handle pinch input for zoom
  public onPinch(scale: number) {
    const sensitivity = 0.05;
    this.cameraDistance = Math.max(2, Math.min(4, this.cameraDistance * (1 + (1 - scale) * sensitivity)));
    this.updateCameraPosition();
    
    // Force render after camera move
    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP();
  }

  private animate = () => {
    if (this.isDisposing) return;
    this.animationFrame = requestAnimationFrame(this.animate);

    try {
      // Only render, no need to rebuild meshes every frame
      this.renderer.render(this.scene, this.camera);
      this.gl.endFrameEXP();
    } catch (error) {
      console.error('Error in render:', error);
    }
  };

  private fitToPlant() {
    // Create bounding box including plant group and pot
    const box = new THREE.Box3();
    box.expandByObject(this.plantGroup);
    box.expandByPoint(new THREE.Vector3(-0.6, 0, -0.6)); // Pot bounds
    box.expandByPoint(new THREE.Vector3(0.6, 0, 0.6));   // Pot bounds

    // Get box dimensions
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Calculate required distance based on box size and field of view
    const fov = this.camera.fov * Math.PI / 180;
    const maxDim = Math.max(size.x, size.z); // Width/depth
    const fitHeightDistance = size.y / (2 * Math.tan(fov / 2));
    const fitWidthDistance = maxDim / (2 * Math.tan((fov * this.camera.aspect) / 2));
    const fitDistance = Math.max(fitHeightDistance, fitWidthDistance) * 1.2; // Add 20% margin

    // Update camera settings while keeping downward angle
    this.cameraTarget.set(center.x, center.y, center.z);
    this.cameraDistance = Math.max(2, Math.min(8, fitDistance));
    this.updateCameraPosition();
  }

  public setPlantData(data: PlantData) {
    console.log('setPlantData starting:', {
      roots: data.roots.size,
      parts: data.parts.size,
      bones: data.bones.size,
      bodies: data.bodies.size,
    });

    // Store the data
    this.parts = new Map(data.parts);
    this.bones = new Map(data.bones);
    this.bodies = new Map(data.bodies);
    this.roots = new Set(data.roots);

    console.log('Clearing existing plant meshes...');
    // Clear existing plant meshes
    while (this.plantGroup.children.length > 0) {
      const child = this.plantGroup.children[0];
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
      this.plantGroup.remove(child);
    }
    console.log('Plant group cleared, children:', this.plantGroup.children.length);

    // Clear transforms
    this.boneTransforms.clear();
    this.bonePartIds.clear();

    console.log('Rendering root parts:', Array.from(this.roots));
    // Render all root parts
    Array.from(this.roots).forEach(rootId => {
      const body = Array.from(this.bodies.values())
        .find(b => b.rootPartId === rootId);
      if (body) {
        console.log('Rendering body:', { bodyId: body.id, rootId });
        this.renderBody(body.id);
      }
    });

    // Fit camera to plant after rendering
    console.log('Fitting camera to plant...');
    this.fitToPlant();
    
    console.log('Plant positioned at:', this.plantGroup.position.toArray());

    console.log('Forcing render...');
    // Force a render
    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP();

    console.log('Plant setup complete, meshes:', {
      plantGroupChildren: this.plantGroup.children.length,
      sceneChildren: this.scene.children.length
    });
  }

  private renderBody(bodyId: string) {
    console.log('renderBody starting:', { bodyId });
    const body = this.bodies.get(bodyId);
    if (!body) {
      console.log('No body found for id:', bodyId);
      return;
    }

    const worldTransform = new THREE.Matrix4().makeBasis(
      body.transform.right,
      body.transform.up, 
      body.transform.forward
    );
    worldTransform.setPosition(body.transform.position);
    
    console.log('Rendering part hierarchy for body:', {
      bodyId,
      rootPartId: body.rootPartId,
      position: body.transform.position.toArray()
    });
    this.renderPartHierarchy(body.rootPartId, worldTransform);
  }

  private calculateBoneBasis(boneDir: THREE.Vector3): {
    right: THREE.Vector3,
    forward: THREE.Vector3
  } {
    const normalizedDir = boneDir.clone().normalize();
    
    // Find a perpendicular vector to use as right
    // First try cross product with world up
    const worldUp = new THREE.Vector3(0, 1, 0);
    let right = new THREE.Vector3().crossVectors(normalizedDir, worldUp).normalize();
    
    // If bone is aligned with world up, use world forward instead
    if (right.lengthSq() < 0.001) {
      const worldForward = new THREE.Vector3(0, 0, 1);
      right = new THREE.Vector3().crossVectors(normalizedDir, worldForward).normalize();
    }
    
    // Calculate forward by crossing right with bone direction
    const forward = new THREE.Vector3().crossVectors(right, normalizedDir).normalize();
    
    return { right, forward };
  }

  private renderPartHierarchy(
    partId: string, 
    parentWorldTransform: THREE.Matrix4,
    parentGroup?: THREE.Group,
    parentPartIds: Set<string> = new Set(),
    parentAttributes?: PartAttributes
  ) {
    const part = this.parts.get(partId);
    if (!part) return;

    // Store bone to part mapping for each bone in this part
    for (const boneId of part.boneIds) {
      this.bonePartIds.set(boneId, partId);
    }

    // Merge attributes with parent's, allowing override
    const attributes: PartAttributes = {
      ...parentAttributes,
      ...part.attributes
    };
    if (!attributes.color) {
      attributes.color = this.getDefaultColor(part.type);
    }

    // Add current part to parent IDs for children
    const currentParentIds = new Set(parentPartIds);
    currentParentIds.add(partId);
    
    // Store parent IDs for this part
    this.partParentIds.set(partId, currentParentIds);

    // Find the body this part belongs to
    const body = Array.from(this.bodies.values()).find(b => {
      let currentPart: Part | undefined = part;
      while (currentPart) {
        if (b.rootPartId === currentPart.id) return true;
        if (!currentPart.parentBoneId) break;
        const parentBone = this.bones.get(currentPart.parentBoneId);
        if (!parentBone) break;
        currentPart = this.parts.get(parentBone.partId);
      }
      return false;
    });
    if (!body) return;

    // Create a group for this part
    const partGroup = new THREE.Group();
    partGroup.userData.partId = partId;
    partGroup.userData.bodyId = body.id;
    
    // Add to parent group if it exists, otherwise add to plant group
    if (parentGroup) {
      parentGroup.add(partGroup);
    } else {
      this.plantGroup.add(partGroup);
    }

    let currentTransform = parentWorldTransform.clone();
    
    // Process each bone in sequence
    for (const boneId of part.boneIds) {
      const bone = this.bones.get(boneId);
      if (!bone) continue;

      // First rotate current transform by bone's direction
      const rotMatrix = new THREE.Matrix4();
      
      // Create consistent basis vectors regardless of angle
      const boneDir = bone.direction.clone().normalize();
      
      // Calculate basis vectors
      const { right: boneRight, forward: boneForward } = this.calculateBoneBasis(boneDir);
      
      // First apply twist around local Y axis
      const twistMatrix = new THREE.Matrix4().makeRotationY(bone.twist);
      
      // Then create and apply direction rotation matrix
      rotMatrix.makeBasis(boneRight, boneDir, boneForward);
      
      // Combine transforms in correct order: twist first, then direction
      const finalMatrix = rotMatrix.multiply(twistMatrix);

      // Apply rotation to current transform
      const worldTransform = currentTransform.clone().multiply(finalMatrix);

      // Store transform for this bone
      this.boneTransforms.set(boneId, worldTransform.clone());

      // Create mesh for this bone at current position with new rotation
      const geometry = this.createGeometry(part.type, {
        width: bone.width,
        length: bone.length
      });

      const material = new THREE.MeshPhongMaterial({ 
        color: attributes.color,
        shininess: 30,
        side: part.type === 'leaf' || part.type === 'flower' ? THREE.DoubleSide : THREE.FrontSide
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.userData.boneId = boneId;
      mesh.userData.bodyId = body.id;
      mesh.userData.partId = part.id;
      mesh.userData.parentPartIds = Array.from(currentParentIds);

      // Add eyes if this is a head bone and it's a stem
      if (bone.isHead && part.type === 'stem' && this.isCloseUp) {
        const eyeGroup = new THREE.Group();
        
        // Create eyes with flat shading
        const eyeGeo = new THREE.SphereGeometry(bone.width * 0.4, 12, 8);
        const eyeMat = new THREE.MeshPhongMaterial({ 
          color: '#ffffff',
          shininess: 50,
        });
        const pupilGeo = new THREE.SphereGeometry(bone.width * 0.2, 8, 8);
        const pupilMat = new THREE.MeshPhongMaterial({ 
          color: '#000000',
          shininess: 0,
        });
        
        // Left eye with better positioning
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(bone.width * 1.2, bone.length * 0.8, bone.width * 0.8);
        const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
        leftPupil.position.z = bone.width * 0.3;
        leftEye.add(leftPupil);
        eyeGroup.add(leftEye);
        
        // Right eye with better positioning
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(-bone.width * 1.2, bone.length * 0.8, bone.width * 0.8);
        const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
        rightPupil.position.z = bone.width * 0.3;
        rightEye.add(rightPupil);
        eyeGroup.add(rightEye);
        
        mesh.add(eyeGroup);
      }

      // Position mesh using world transform
      mesh.position.setFromMatrixPosition(worldTransform);
      
      // Extract coordinate system from transform
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      const forward = new THREE.Vector3();
      worldTransform.extractBasis(right, up, forward);
      
      // Orient mesh using full basis
      mesh.matrix.makeBasis(right, up, forward);
      mesh.matrix.setPosition(mesh.position);
      mesh.matrixAutoUpdate = false;

      // Add to part group
      partGroup.add(mesh);

      // Process child parts
      for (const [childPartId, attachment] of bone.children.entries()) {
        // Get bone's world transform matrix
        const boneTransform = worldTransform.clone();
        
        // Get bone start position and direction in world space
        const boneStart = new THREE.Vector3().setFromMatrixPosition(boneTransform);
        
        // Calculate attachment point along bone
        const attachPoint = boneStart.clone().add(
          up.clone().multiplyScalar(bone.length * attachment.ratio)
        );

        // Create attachment transform matrix
        const attachmentTransform = new THREE.Matrix4();
        
        // Get parent bone's up direction (bone axis)
        const boneAxis = up.clone().normalize();
        
        let childUp: THREE.Vector3;
        let childForward: THREE.Vector3;
        
        if (attachment.ratio === 0 || attachment.ratio === 1) {
          // For end attachments, use parent bone direction as up
          childUp = boneAxis.clone();
          
          // Use parent's forward as child's forward to maintain same rotation
          childForward = forward.clone();
          
          // If at start of bone, flip both vectors
          if (attachment.ratio === 0) {
            childUp.negate();
            childForward.negate();
          }
        } else {
          // For side attachments, create perpendicular orientation
          // First find a perpendicular direction based on attachment angle
          const perpDir = new THREE.Vector3(
            Math.cos(attachment.angle),
            0,
            Math.sin(attachment.angle)
          ).normalize();
          
          // Transform perpendicular direction by parent's rotation
          perpDir.applyMatrix4(boneTransform);
          perpDir.sub(boneStart).normalize();
          
          // Add offset from bone surface
          attachPoint.add(perpDir.clone().multiplyScalar(bone.width * 0.9));
          
          // Use perpDir as up and boneAxis as forward
          childUp = perpDir;
          childForward = boneAxis.clone();
        }
        
        // Calculate right vector from forward and up
        const childRight = new THREE.Vector3().crossVectors(childForward, childUp).normalize();
        // Recalculate up to ensure orthogonality
        childUp.crossVectors(childRight, childForward).normalize();
        
        // Create final transform
        attachmentTransform.makeBasis(
          childRight,
          childUp,
          childForward
        );
        attachmentTransform.setPosition(attachPoint);
        
        // Recursively render child part
        this.renderPartHierarchy(childPartId, attachmentTransform, partGroup, currentParentIds, attributes);
      }

      // After rendering bone and children, translate current transform forward by bone length
      const translation = new THREE.Matrix4().makeTranslation(0, bone.length, 0);
      currentTransform.multiply(rotMatrix).multiply(translation);
    }
  }

  private createGeometry(type: PartType, params: { width: number, length: number }): THREE.BufferGeometry {
    switch (type) {
      case 'stem':
        const stemGeo = new THREE.CylinderGeometry(params.width, params.width, params.length, 8);
        stemGeo.translate(0, params.length / 2, 0);
        return stemGeo;
      case 'leaf':
        const radius = params.width * 2;
        const leafGeo = new THREE.CylinderGeometry(radius, radius, 0.01, 16, 1, false);
        leafGeo.rotateX(Math.PI / 2);
        const scale = params.length * .8 / radius;
        leafGeo.scale(1, scale, 1);
        leafGeo.translate(0, params.length * .8, 0);
        return leafGeo;
      case 'thorn':
        const length = params.length / 2;
        const thornGeo = new THREE.ConeGeometry(params.width / 2, length, 4);
        thornGeo.translate(0, length / 2, 0);
        return thornGeo;
      case 'flower':
        const flowerGeo = new THREE.ConeGeometry(params.width * 2, params.length * .25, 16);
        flowerGeo.rotateX(Math.PI);
        return flowerGeo;
    }
  }

  private getDefaultColor(type: PartType): string {
    switch (type) {
      case 'stem': return '#44aa44';
      case 'leaf': return '#66cc66';
      case 'thorn': return '#aa4444';
      case 'flower': return '#ffdd88';
    }
  }

  public dispose() {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
    }
    
    this.scene.clear();
    this.renderer.dispose();
    this.gl.endFrameEXP();
  }

  public isDisposed(): boolean {
    return this.isDisposing;
  }
} 