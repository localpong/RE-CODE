import { Component, Input, ViewChild, ElementRef, AfterViewInit, OnDestroy, OnChanges, SimpleChanges, NgZone } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

@Component({
  selector: 'app-world-view',
  templateUrl: './world-view.component.html',
  styleUrls: ['./world-view.component.scss']
})
export class WorldViewComponent implements AfterViewInit, OnDestroy, OnChanges {
  // รับค่าสถานะต่างๆ มาจาก OperatorTabletComponent
  @Input() currentX: number = 0;
  @Input() currentY: number = 0;
  @Input() currentZ: number = 0;
  @Input() mapRotation: number = 0;
  @Input() radarBlips: { x: number, y: number, z: number, type: string, label?: string }[] = [];
  @Input() environmentObjects: { x: number, y: number, z: number, type: string, width: number, depth: number, rotation: number }[] = [];
  @Input() isWalking: boolean = false;

  @ViewChild('worldCanvas') private canvasRef!: ElementRef<HTMLCanvasElement>;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private animationId: number = 0;

  // จัดการวัตถุ 3D ในโลก
  private terrainMesh!: THREE.Mesh;
  private robotPivot: THREE.Group = new THREE.Group();
  private robotTiltGroup: THREE.Group = new THREE.Group(); // [เพิ่ม] กรุ๊ปสำหรับเอียงตัวหุ่นโดยไม่กวนแอนิเมชันเดิน
  private worldGroup: THREE.Group = new THREE.Group();
  private blipsGroup: THREE.Group = new THREE.Group();
  private robotModel!: THREE.Object3D;
  private mixer!: THREE.AnimationMixer;
  private walkAction?: THREE.AnimationAction;
  private resizeObserver!: ResizeObserver;

  constructor(private ngZone: NgZone) {}

  ngAfterViewInit(): void {
    this.initThreeJs();
    this.animate();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.scene) {
      this.updateMap();
    }
    if (changes['isWalking'] && this.walkAction) {
      if (this.isWalking) {
        this.walkAction.play();
      } else {
        this.walkAction.stop();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.renderer) this.renderer.dispose();
    if (this.resizeObserver) this.resizeObserver.disconnect();
  }

  private createProceduralTexture(type: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 256, 256);

    if (type === 'grid') {
      ctx.fillStyle = '#0a2a2a';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#00fbff';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.2;
      for (let i = 0; i <= 256; i += 32) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
      }
    } else if (type === 'hex') {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      const size = 20;
      for (let x = 0; x < 256; x += size * 1.5) {
        for (let y = 0; y < 256; y += size * Math.sqrt(3)) {
          const drawHex = (hx: number, hy: number) => {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
              const angle = 2 * Math.PI / 6 * i;
              const px = hx + size * Math.cos(angle);
              const py = hy + size * Math.sin(angle);
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
          };
          drawHex(x, y);
          drawHex(x + size * 0.75, y + size * Math.sqrt(3) / 2);
        }
      }
    } else if (type === 'hazard') {
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#222';
      for (let i = -256; i < 512; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 20, 0);
        ctx.lineTo(i + 276, 256);
        ctx.lineTo(i + 256, 256);
        ctx.fill();
      }
    } else if (type === 'circuit') {
      ctx.fillStyle = '#003300';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      for(let i=0; i<30; i++) {
         ctx.beginPath();
         ctx.moveTo(Math.random()*256, Math.random()*256);
         ctx.lineTo(Math.random()*256, Math.random()*256);
         ctx.lineTo(Math.random()*256, Math.random()*256);
         ctx.stroke();
         ctx.fillStyle = '#00ff00';
         ctx.beginPath();
         ctx.arc(Math.random()*256, Math.random()*256, 3, 0, Math.PI*2);
         ctx.fill();
      }
    } else if (type === 'noise') {
      const imgData = ctx.createImageData(256, 256);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const val = Math.random() * 255;
        imgData.data[i] = val * 0.5;
        imgData.data[i+1] = val * 0.5;
        imgData.data[i+2] = val * 0.5;
        imgData.data[i+3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    if (type === 'grid' || type === 'hex') {
      texture.repeat.set(16, 16);
    }
    return texture;
  }

  private getTerrainHeight(worldX: number, worldY: number): number {
    const scale = 0.02;
    const amplitude = 15;
    return (Math.sin(worldX * scale) + Math.cos(worldY * scale * 0.7)) * amplitude;
  }

  private addEnvironmentDecorations(): void {
    const shallowWaterMat = new THREE.MeshStandardMaterial({ color: 0x0088ff, transparent: true, opacity: 0.4, depthWrite: false });
    const deepWaterMat = new THREE.MeshStandardMaterial({ color: 0x0033aa, transparent: true, opacity: 0.6, depthWrite: false });
    const logMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 1.0 });

    const placeObject = (mesh: THREE.Mesh, gameX: number, gameY: number, rotationDeg: number, yOffset: number) => {
      mesh.position.set(gameX / 2, 0, -gameY / 2);
      mesh.position.y = (this.getTerrainHeight(gameX, gameY) / 2) + yOffset;
      mesh.rotation.y = THREE.MathUtils.degToRad(rotationDeg);
      this.worldGroup.add(mesh);
    };

    this.environmentObjects.forEach(env => {
      let mesh: THREE.Mesh | null = null;
      let yOffset = 1;
      if (env.type === 'shallow_water') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(env.width, 2, env.depth), shallowWaterMat);
        yOffset = 1;
      } else if (env.type === 'deep_water') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(env.width, 2, env.depth), deepWaterMat);
        yOffset = 1.2;
      } else if (env.type === 'log') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(env.width, 8, env.depth), logMat);
        yOffset = 4;
      }
      if (mesh) placeObject(mesh, env.x, env.y, env.rotation, yOffset);
    });
  }

  private initThreeJs(): void {
    const canvas = this.canvasRef.nativeElement;
    const container = canvas.parentElement!;

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x001105, 0.006);

    this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 1, 1000);
    this.camera.position.set(0, 30, 60);
    this.robotPivot.add(this.camera);
    this.robotPivot.add(this.robotTiltGroup); // เอา Tilt Group ใส่ใน Pivot
    this.scene.add(this.robotPivot);
    this.camera.lookAt(0, 10, 0);

    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0x00ffcc, 1.5);
    dirLight.position.set(50, 100, -50);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    const terrainGeo = new THREE.PlaneGeometry(800, 800, 100, 100);
    terrainGeo.rotateX(-Math.PI / 2);
    const vertices = (terrainGeo.attributes['position'] as THREE.BufferAttribute).array;
    for (let i = 0; i < vertices.length; i += 3) {
      vertices[i+1] = this.getTerrainHeight(vertices[i] * 2, -vertices[i+2] * 2) / 2;
    }
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({ 
      color: 0x1a3a3a, 
      roughness: 0.8, 
      metalness: 0.2,
      map: this.createProceduralTexture('hex') 
    });
    this.terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    this.terrainMesh.receiveShadow = true;
    this.worldGroup.add(this.terrainMesh);

    // เพิ่มเส้นตาราง (Wireframe) ซ้อนทับบนพื้นผิวให้ดูเหมือนแผนที่โฮโลแกรมเรดาร์
    const wireframeMat = new THREE.MeshBasicMaterial({ color: 0x00fbff, wireframe: true, transparent: true, opacity: 0.15 });
    const wireframeMesh = new THREE.Mesh(terrainGeo, wireframeMat);
    wireframeMesh.position.y = 0.1; // ยกขึ้นนิดหน่อยเพื่อไม่ให้ Z-fighting (พื้นผิวกระพริบ)
    this.worldGroup.add(wireframeMesh);

    this.addEnvironmentDecorations();

    // สร้างตัวแทนหุ่นยนต์ชั่วคราว (Fallback) รูปทรงกล่องสี่เหลี่ยม ในกรณีที่โหลดไฟล์โมเดล 3D ไม่สำเร็จ
    const fallbackGeo = new THREE.BoxGeometry(6, 6, 8);
    const fallbackMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, wireframe: true });
    this.robotModel = new THREE.Mesh(fallbackGeo, fallbackMat);
    this.robotTiltGroup.add(this.robotModel); // ใส่ Fallback ใน Tilt Group แทน

    const loader = new GLTFLoader();
    loader.load('assets/garbage-robot.gltf', (gltf) => {
      this.robotTiltGroup.remove(this.robotModel); // ลบ Fallback ออกเมื่อโหลดโมเดลจริงสำเร็จ
      this.robotModel = gltf.scene;
      this.robotModel.scale.set(4, 4, 4);
      this.robotModel.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          const oldMaterial = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          oldMaterial.metalness = 0.8;
          oldMaterial.roughness = 0.4;
        }
      });
      this.robotTiltGroup.add(this.robotModel); // ใส่โมเดลจริงใน Tilt Group

      this.mixer = new THREE.AnimationMixer(this.robotModel);
      const animationClip = gltf.animations[0];
      if (animationClip) {
        this.walkAction = this.mixer.clipAction(animationClip);
        this.walkAction.setLoop(THREE.LoopRepeat, Infinity);
        if (this.isWalking) this.walkAction.play();
      }
    }, undefined, (error) => {
      console.error('Model loading error:', error);
    });

    this.worldGroup.add(this.blipsGroup);
    this.scene.add(this.worldGroup);
    this.updateMap();

    // จัดการขนาด Canvas อัตโนมัติเมื่อ Layout ของ Angular โหลดเสร็จ หรือมีการย่อขยายหน้าจอ
    this.resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    });
    this.resizeObserver.observe(container);
  }

  private updateMap(): void {
    if (!this.scene) return;

    while (this.blipsGroup.children.length > 0) {
      this.blipsGroup.remove(this.blipsGroup.children[0]);
    }

    // เตรียมรูปทรง 3D พื้นฐานสำหรับสิ่งของประเภทต่างๆ
    const defaultGeo = new THREE.BoxGeometry(4, 4, 4);
    const scrapGeo = new THREE.DodecahedronGeometry(3);
    const chipGeo = new THREE.BoxGeometry(4, 1, 4);
    const cameraGeo = new THREE.CylinderGeometry(2, 2, 4, 8);
    const solarGeo = new THREE.BoxGeometry(6, 0.5, 4);
    const batteryGeo = new THREE.CylinderGeometry(1.5, 1.5, 4, 8);
    const phoneGeo = new THREE.BoxGeometry(3, 0.5, 5);
    const obstacleGeo = new THREE.BoxGeometry(15, 15, 15);
    const anomalyGeo = new THREE.IcosahedronGeometry(5); // วัตถุลึกลับ

    this.radarBlips.forEach(blip => {
      const targetX = blip.x / 2;
      const targetZ = -blip.y / 2;
      const targetY = blip.z / 2;

      let color = 0x00ffff; // สัญญาณปกติ (สีฟ้า)
      let geometry: THREE.BufferGeometry = defaultGeo;
      let yOffset = 2; // ความสูงลอยจากพื้น
      let emissiveIntensity = 0.6;
      let textureType = '';

      if (blip.type === 'obstacle') {
        color = 0xff0055; // สิ่งกีดขวาง (สีแดง)
        geometry = obstacleGeo;
        yOffset = 7.5;
        textureType = 'hazard';
      } else if (blip.type === 'scrap') {
        color = 0xaaaaaa; // เศษเหล็ก (สีเทา)
        geometry = scrapGeo;
        textureType = 'noise';
      } else if (blip.type === 'chip') {
        color = 0x00ff00; // ชิปวงจร (สีเขียว)
        geometry = chipGeo;
        textureType = 'circuit';
      } else if (blip.type === 'camera') {
        color = 0xffa500; // กล้อง (สีส้ม)
        geometry = cameraGeo;
        textureType = 'noise';
      } else if (blip.type === 'solarPanel') {
        color = 0x1e90ff; // แผงโซลาร์ (สีฟ้าเข้ม)
        geometry = solarGeo;
        textureType = 'grid';
      } else if (blip.type === 'batteryItem') {
        color = 0xffff00; // แบตเตอรี่ (สีเหลือง)
        geometry = batteryGeo;
        textureType = 'hazard';
      } else if (blip.type === 'phone') {
        color = 0xff1493; // มือถือ (สีชมพูเข้ม)
        geometry = phoneGeo;
        textureType = 'circuit';
      } else if (blip.type === 'anomaly') {
        color = 0xcc00ff; // วัตถุลึกลับ (สีม่วง)
        geometry = anomalyGeo;
        emissiveIntensity = 1.5; // สว่างเป็นพิเศษ
        yOffset = 4;
        textureType = 'noise';
      }

      const matOpts: THREE.MeshStandardMaterialParameters = { 
        color, 
        emissive: color, 
        emissiveIntensity: emissiveIntensity 
      };
      
      if (textureType) {
        matOpts.map = this.createProceduralTexture(textureType);
      }

      const mat = new THREE.MeshStandardMaterial(matOpts);
      const mesh = new THREE.Mesh(geometry, mat);
      
      // หมุนบางวัตถุให้ดูสมจริงขึ้น
      if (blip.type === 'camera' || blip.type === 'batteryItem') {
        mesh.rotation.x = Math.PI / 2;
      }

      mesh.position.set(targetX, targetY + yOffset, targetZ);
      this.blipsGroup.add(mesh);
    });
  }

  private animate(): void {
    this.ngZone.runOutsideAngular(() => {
      const renderLoop = () => {
        this.animationId = requestAnimationFrame(renderLoop);
        const delta = this.clock.getDelta();

        this.blipsGroup.children.forEach(mesh => {
          mesh.rotation.y += 0.05;
          mesh.rotation.x += 0.02;
        });

        if (this.robotModel) {
          // ยกตัวขึ้นที่ Tilt Group แทนการแก้ที่ Model ตรงๆ
          this.robotTiltGroup.position.y = (this.currentZ / 2) + 4.8;
        }
        if (this.mixer) {
          this.mixer.update(delta);
        }

        this.robotPivot.rotation.y = THREE.MathUtils.degToRad(this.mapRotation);
        this.worldGroup.position.set(-this.currentX / 2, 0, this.currentY / 2);

        // คำนวณความชันของพื้นที่ (Terrain Slope) และปรับให้โมเดลหุ่นเอียงตาม (สัมพันธภาพกับพื้นที่)
        if (this.robotTiltGroup) {
          const offset = 1.0;
          const hL = this.getTerrainHeight(this.currentX - offset, this.currentY) / 2;
          const hR = this.getTerrainHeight(this.currentX + offset, this.currentY) / 2;
          const hD = this.getTerrainHeight(this.currentX, this.currentY - offset) / 2;
          const hU = this.getTerrainHeight(this.currentX, this.currentY + offset) / 2;

          const vecX = new THREE.Vector3(offset * 2, hR - hL, 0);
          const vecZ = new THREE.Vector3(0, hU - hD, -offset * 2); // แกน Y ในเกม = -Z ใน 3D
          const normal = new THREE.Vector3().crossVectors(vecX, vecZ).normalize();

          // นำ Normal ที่ได้มาเทียบกับแกน Local ของ Pivot เพื่อให้หุ่นเอียงตามเนินเขาได้อย่างถูกต้องตามทิศที่กำลังหัน
          const localNormal = normal.clone().applyQuaternion(this.robotPivot.quaternion.clone().invert());
          const targetQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), localNormal);
          this.robotTiltGroup.quaternion.slerp(targetQuat, 0.2); // ให้ Tilt Group เอียงตัวแทน Model
        }

        this.renderer.render(this.scene, this.camera);
      };
      renderLoop();
    });
  }
}