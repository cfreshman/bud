import { ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { PlantData, Body, Part, Bone, PartType, PartAttributes, Transform } from './types';

export class ViewEngine {
  protected scene: THREE.Scene;
  protected camera: THREE.PerspectiveCamera;
  protected renderer: Renderer;
  protected plantGroup: THREE.Group;
  protected animationFrameId: number | null = null;
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

  protected hasBasicSetup: boolean = false;

  constructor(gl: ExpoWebGLRenderingContext) {
    console.log('ViewEngine constructor starting...');
    this.gl = gl;

    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    
    // Create renderer
    this.renderer = new Renderer({ gl });
    this.renderer.setSize(width, height);
    this.renderer.setClearColor('#88aa99');
    
    // Enable shadows with better quality
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#88aa99');
    
    // Create camera with better FOV and positioning
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    
    // Create plant group
    this.plantGroup = new THREE.Group();
    this.scene.add(this.plantGroup);
    
    // Set initial camera position for better view
    this.camera.position.set(0, 2, 3);
    this.camera.lookAt(0, 1, 0);
    this.targetRotation.set(Math.PI/2, 0);  // Start at front center (90°) with 15° vertical
    this.cameraTarget.set(0, 1, 0);    // Look at center
    this.updateCameraPosition();
    console.log('Initial camera position:', this.camera.position.toArray());

    // Force render
    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP();

    // Start animation loop with delay to ensure GL context is ready
    setTimeout(() => {
      console.log('Starting animation loop...');
      this.animate();
    }, 100);

    console.log('ViewEngine constructor complete');
  }

  // Update camera position based on rotation and distance
  private updateCameraPosition() {
    // Convert targetRotation.x from 15° to 165° range to create limited arc
    const theta = this.targetRotation.x; // Remove the negation and offset
    
    // Convert targetRotation.y to control height from 0° to 45°
    const heightRatio = Math.max(0, Math.min(1, this.targetRotation.y / (Math.PI/4))); // 0 to 1
    const phi = heightRatio * (Math.PI/4); // 0° to 45°
    
    // Calculate camera position on the arc
    this.camera.position.x = -this.cameraDistance * Math.cos(theta);
    this.camera.position.z = this.cameraDistance * Math.sin(theta) * Math.cos(phi);
    this.camera.position.y = this.cameraDistance * Math.sin(phi);
    
    this.camera.position.add(this.cameraTarget);
    this.camera.lookAt(this.cameraTarget);
  }

  // Handle touch input for camera control
  public onTouchMove(dx: number, dy: number) {
    const sensitivity = 0.01;
    // Horizontal rotation from 15° to 165° (through front at 90°)
    // Negate dx to match physical swipe direction
    this.targetRotation.x = Math.max(Math.PI/12, Math.min(11*Math.PI/12, this.targetRotation.x - dx * sensitivity));
    // Vertical angle from 0° to 45° from horizontal
    this.targetRotation.y = Math.max(0, Math.min(Math.PI/4, this.targetRotation.y + dy * sensitivity));
    this.updateCameraPosition();
    
    // Force render after camera move
    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP();
  }

  // Handle pinch input for zoom
  public onPinch(scale: number) {
    const sensitivity = 0.05;
    // Adjust zoom limits for better view
    this.cameraDistance = Math.max(2, Math.min(8, this.cameraDistance * (1 + (1 - scale) * sensitivity)));
    this.updateCameraPosition();
    
    // Force render after camera move
    this.renderer.render(this.scene, this.camera);
    this.gl.endFrameEXP();
  }

  protected animate = () => {
    if (this.isDisposed() || this.isDisposing) {
      console.log('Animation stopped - engine disposed');
      return;
    }
    
    this.animationFrameId = requestAnimationFrame(this.animate);
    if (!this.scene || !this.renderer) {
      console.log('Animation frame skipped - missing scene or renderer');
      return;
    }
    
    try {
      // // Log scene contents
      // console.log('Rendering frame:', {
      //   sceneChildren: this.scene.children.length,
      //   plantGroupChildren: this.plantGroup.children.length,
      //   cameraPosition: this.camera.position.toArray(),
      //   hasBasicSetup: this.hasBasicSetup
      // });

      if (this.hasBasicSetup) {
        this.renderer.render(this.scene, this.camera);
        this.gl.endFrameEXP();
      }
    } catch (error) {
      console.error('Error in ViewEngine animation loop:', error);
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

    if (!this.hasBasicSetup) {
      // Add lights with better intensity
      const ambientLight = new THREE.AmbientLight(0xffffff, 2.2);
      this.scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 2.2);
      directionalLight.position.set(2, 4, 2);
      directionalLight.castShadow = true;
      
      // Improve shadow map settings
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
      directionalLight.shadow.camera.near = 0.1;
      directionalLight.shadow.camera.far = 20;
      directionalLight.shadow.camera.left = -3;
      directionalLight.shadow.camera.right = 3;
      directionalLight.shadow.camera.top = 3;
      directionalLight.shadow.camera.bottom = -3;
      directionalLight.shadow.bias = -0.001;
      directionalLight.shadow.normalBias = 0.02;
      directionalLight.shadow.radius = 2;
      
      this.scene.add(directionalLight);
      
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
      fillLight.position.set(-2, 2, -2);
      this.scene.add(fillLight);
      
      // Add ground plane with better material
      const groundGeometry = new THREE.CircleGeometry(5, 32);
      const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: '#bbddbb',
        roughness: 0.8,
        metalness: 0.1
      });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this.scene.add(ground);

      // Add pot with better material
      const potGeo = new THREE.CylinderGeometry(0.6, 0.4, 0.4, 32);
      const potMat = new THREE.MeshStandardMaterial({ 
        color: '#8B5E3C',
        roughness: 0.6,
        metalness: 0.1
      });
      const pot = new THREE.Mesh(potGeo, potMat);
      pot.position.y = 0.2;
      pot.castShadow = true;
      pot.receiveShadow = true;
      this.scene.add(pot);

      // Add dirt with better material
      const dirtGeo = new THREE.SphereGeometry(0.55, 32, 16);
      const dirtMat = new THREE.MeshStandardMaterial({ 
        color: '#5C4033',
        roughness: 0.8,
        metalness: 0
      });
      const dirt = new THREE.Mesh(dirtGeo, dirtMat);
      dirt.scale.y = 0.3;
      dirt.position.y = 0.35;
      dirt.castShadow = true;
      dirt.receiveShadow = true;
      this.scene.add(dirt);

      this.hasBasicSetup = true;
      console.log('Basic setup complete');
    }

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

      const material = new THREE.MeshStandardMaterial({ 
        color: attributes.color,
        roughness: 0.7,
        metalness: 0.1
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.boneId = boneId;
      mesh.userData.bodyId = body.id;
      mesh.userData.partId = part.id;
      mesh.userData.parentPartIds = Array.from(currentParentIds);

      // Add eyes if this is a head bone and it's a stem
      if (bone.isHead && part.type === 'stem' && this.isCloseUp) {
        const eyeGroup = new THREE.Group();
        
        // Create eyes with better materials
        const eyeGeo = new THREE.SphereGeometry(bone.width * 0.4, 12, 8);
        const eyeMat = new THREE.MeshStandardMaterial({ 
          color: '#ffffff',
          roughness: 0.7,
          metalness: 0.2
        });
        const pupilGeo = new THREE.SphereGeometry(bone.width * 0.2, 8, 8);
        const pupilMat = new THREE.MeshStandardMaterial({ 
          color: '#000000',
          roughness: 0.7,
          metalness: 0.2
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
    console.log('Disposing ViewEngine');
    this.isDisposing = true;
    
    if (this.animationFrameId !== null) {
      console.log('Canceling animation frame:', this.animationFrameId);
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    this.scene.clear();
    this.renderer.dispose();
    this.gl.endFrameEXP();
    console.log('ViewEngine disposed');
  }

  public isDisposed(): boolean {
    return this.isDisposing;
  }

  public getPlantHeadPosition(): { x: number, y: number } | null {
    // Find the head bone (last bone of the main stem)
    const mainStemPart = Array.from(this.parts.values())
      .find(part => part.type === 'stem' && this.roots.has(part.id));
    
    if (!mainStemPart) return null;

    // Get the last bone of the stem
    const lastBoneId = mainStemPart.boneIds[mainStemPart.boneIds.length - 1];
    const lastBoneTransform = this.boneTransforms.get(lastBoneId);
    
    if (!lastBoneTransform) return null;

    // Get position from transform
    const position = new THREE.Vector3();
    position.setFromMatrixPosition(lastBoneTransform);
    position.y += 1; // Move up a bit for better bubble placement

    // Project to screen coordinates
    const screenPosition = position.clone();
    screenPosition.project(this.camera);

    // Convert to pixel coordinates
    const x = (screenPosition.x + 1) * this.gl.drawingBufferWidth / 2;
    const y = (-screenPosition.y + 1) * this.gl.drawingBufferHeight / 2;

    return { x, y };
  }

  public forceRender() {
    if (!this.scene || !this.renderer || this.isDisposed() || this.isDisposing) return;
    
    try {
      this.renderer.render(this.scene, this.camera);
      this.gl.endFrameEXP();
    } catch (error) {
      console.error('Error in forceRender:', error);
    }
  }
} 