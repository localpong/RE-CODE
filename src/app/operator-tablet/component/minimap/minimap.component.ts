import { Component, Input, ViewChild, ElementRef, AfterViewInit, OnDestroy, OnChanges, SimpleChanges, NgZone } from '@angular/core';
import * as THREE from 'three';

@Component({
  selector: 'app-minimap',
  templateUrl: './minimap.component.html',
  styleUrls: ['./minimap.component.scss']
})
export class MinimapComponent implements AfterViewInit, OnDestroy, OnChanges {
  // รับค่าสถานะต่างๆ มาจาก OperatorTabletComponent
  @Input() currentX: number = 0;
  @Input() currentY: number = 0;
  @Input() currentZ: number = 0;
  @Input() mapRotation: number = 0;
  @Input() radarBlips: { x: number, y: number, z: number, type: string, label?: string }[] = [];
  @Input() environmentObjects: { x: number, y: number, z: number, type: string, width: number, depth: number, rotation: number }[] = [];

  @ViewChild('minimapCanvas') private canvasRef!: ElementRef<HTMLCanvasElement>;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private animationId: number = 0;

  // จัดการวัตถุ 3D ในโลก
  private terrainMesh!: THREE.Mesh;
  private pivotGroup: THREE.Group = new THREE.Group();
  private worldGroup: THREE.Group = new THREE.Group();
  private blipsGroup: THREE.Group = new THREE.Group();
  private playerMesh!: THREE.Mesh;

  constructor(private ngZone: NgZone) {}

  ngAfterViewInit(): void {
    this.initThreeJs();
    this.animate();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.scene) {
      this.updateMap();
    }
  }

  ngOnDestroy(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.renderer) this.renderer.dispose();
  }

  // ฟังก์ชันคำนวณความสูงของภูมิประเทศ (ต้องเหมือนกับใน operator-tablet.component.ts)
  private getTerrainHeight(worldX: number, worldY: number): number {
    // ใช้ Sine/Cosine สร้างเนินเขาง่ายๆ
    const scale = 0.02; // ยิ่งค่าน้อย เนินยิ่งกว้าง
    const amplitude = 15; // ยิ่งค่ามาก เนินยิ่งสูง
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

    // สร้าง Environment Objects ตามค่าที่ได้รับจาก Parent (OperatorTablet)
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

      if (mesh) {
        placeObject(mesh, env.x, env.y, env.rotation, yOffset);
      }
    });
  }

  private initThreeJs(): void {
    const canvas = this.canvasRef.nativeElement;
    const container = canvas.parentElement!;

    // 1. ตั้งค่าตัวเรนเดอร์ (Renderer)
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    // 2. สร้างฉาก (Scene) พร้อมหมอกพิษ
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x001105, 0.006); // หมอกสีเขียวเข้ม/ดำ ค่อยๆ จางหายไปที่ระยะไกล

    // 3. กล้องมุมมองตานก เอียงเล็กน้อยแบบภาพโฮโลแกรม (Perspective Camera)
    this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 1, 1000);
    this.camera.position.set(0, 120, 100);
    this.camera.lookAt(0, 0, 0);

    // 4. ระบบแสง (Lighting)
    const ambientLight = new THREE.AmbientLight(0x404040, 2); 
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0x00ffcc, 1.5); // แสงตกกระทบโทนสีฟ้าเขียว
    dirLight.position.set(50, 100, -50);
    this.scene.add(dirLight);

    // 5. สร้างพื้นผิวภูมิประเทศ (Terrain) แทนที่ GridHelper เดิม
    const terrainSize = 800; // ขยายขนาดให้ใหญ่ขึ้น
    const terrainSegments = 100;
    const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
    terrainGeo.rotateX(-Math.PI / 2); // หมุนให้เป็นพื้น

    // แก้ไขการเข้าถึง attribute 'position' และบอก Type ชั่วคราวเพื่อให้ TypeScript ตรวจสอบผ่าน
    const vertices = (terrainGeo.attributes['position'] as THREE.BufferAttribute).array;
    for (let i = 0; i < vertices.length; i += 3) {
      const localX = vertices[i];
      const localZ = vertices[i+2];
      // แปลงพิกัด Local ของ Plane กลับเป็นพิกัดโลกเพื่อคำนวณความสูงที่ถูกต้อง
      const worldX = localX * 2;
      const worldY = -localZ * 2;
      const height = this.getTerrainHeight(worldX, worldY);
      vertices[i+1] = height / 2; // กำหนดความสูง (แกน Y) และสเกลกลับมา
    }
    terrainGeo.computeVertexNormals(); // คำนวณ Normal ใหม่เพื่อให้แสงเงาถูกต้อง

    // 5.1 สร้างลวดลายตารางไฮเทค (High-Tech Grid) ด้วย Canvas สำหรับใช้เป็น Texture พื้นผิว
    const canvasTexture = document.createElement('canvas');
    canvasTexture.width = 512;
    canvasTexture.height = 512;
    const ctx = canvasTexture.getContext('2d');
    if (ctx) {
      // พื้นหลังสีทึบโทนเข้ม
      ctx.fillStyle = '#05120a';
      ctx.fillRect(0, 0, 512, 512);

      // วาดตารางหลัก (Main Grid)
      ctx.strokeStyle = '#005544';
      ctx.lineWidth = 2;
      const gridSize = 64;
      for (let i = 0; i <= 512; i += gridSize) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
      }

      // วาดเส้นตารางย่อย (Sub-grid)
      ctx.strokeStyle = '#00281c';
      ctx.lineWidth = 1;
      const subGridSize = 16;
      for (let i = 0; i <= 512; i += subGridSize) {
        if (i % gridSize !== 0) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
        }
      }

      // จุดตกแต่งเรืองแสงตามทางแยกตารางหลัก
      ctx.fillStyle = '#00ffcc';
      for (let x = 0; x <= 512; x += gridSize) {
        for (let y = 0; y <= 512; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const floorTexture = new THREE.CanvasTexture(canvasTexture);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(40, 40); // ควบคุมการซ้ำของลวดลายให้กระจายทั่ว Terrain

    const terrainMat = new THREE.MeshStandardMaterial({ 
      color: 0xbbffff, 
      map: floorTexture, 
      roughness: 0.7, 
      metalness: 0.2,
      transparent: true,
      opacity: 0.95
    });
    this.terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    this.worldGroup.add(this.terrainMesh);

    // เรียกใช้ฟังก์ชันตกแต่งสภาพแวดล้อม (แม่น้ำ ท่อนไม้) ลงในแผนที่ 3D
    this.addEnvironmentDecorations();

    // 6. ตัวแทนผู้เล่นตรงกลางจอ (Player Indicator)
    const playerGeo = new THREE.ConeGeometry(5, 12, 4);
    playerGeo.rotateX(Math.PI / 2); // ชี้ปลายแหลมไปข้างหน้า (แกน -Z)
    const playerMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.5, wireframe: true });
    this.playerMesh = new THREE.Mesh(playerGeo, playerMat);
    this.scene.add(this.playerMesh);

    this.worldGroup.add(this.blipsGroup);
    this.pivotGroup.add(this.worldGroup);
    this.scene.add(this.pivotGroup);
    this.updateMap();
  }

  private updateMap(): void {
    if (!this.scene) return;

    // เคลียร์เศษซากวัตถุเก่าออกก่อนวาดใหม่
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
    
    this.radarBlips.forEach(blip => {
      // นำพิกัดโลกมาใช้วาง Object โดยตรง (ย่อสเกล / 2)
      const targetX = blip.x / 2; 
      const targetZ = -blip.y / 2; // แกน Y ในโลกเกม คือแกน -Z ใน 3D
      const targetY = blip.z / 2; // ความสูงของวัตถุ

      let color = 0x00ffff; // สัญญาณปกติ (สีฟ้า)
      let geometry: THREE.BufferGeometry = defaultGeo;
      let yOffset = 2; // ความสูงลอยจากพื้น

      if (blip.type === 'obstacle') {
        color = 0xff0055; // สิ่งกีดขวาง (สีแดง)
        geometry = obstacleGeo;
        yOffset = 7.5;
      } else if (blip.type === 'scrap') {
        color = 0xaaaaaa; // เศษเหล็ก (สีเทา)
        geometry = scrapGeo;
      } else if (blip.type === 'chip') {
        color = 0x00ff00; // ชิปวงจร (สีเขียว)
        geometry = chipGeo;
      } else if (blip.type === 'camera') {
        color = 0xffa500; // กล้อง (สีส้ม)
        geometry = cameraGeo;
      } else if (blip.type === 'solarPanel') {
        color = 0x1e90ff; // แผงโซลาร์ (สีฟ้าเข้ม)
        geometry = solarGeo;
      } else if (blip.type === 'batteryItem') {
        color = 0xffff00; // แบตเตอรี่ (สีเหลือง)
        geometry = batteryGeo;
      } else if (blip.type === 'phone') {
        color = 0xff1493; // มือถือ (สีชมพูเข้ม)
        geometry = phoneGeo;
      }
      
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
      const mesh = new THREE.Mesh(geometry, mat);
      
      // หมุนบางวัตถุให้ดูสมจริงขึ้น
      if (blip.type === 'camera' || blip.type === 'batteryItem') {
        mesh.rotation.x = Math.PI / 2;
      }
      
      mesh.position.set(targetX, targetY + yOffset, targetZ); // วางวัตถุตามความสูงจริง + ให้ลอยนิดหน่อย
      this.blipsGroup.add(mesh);
    });
  }

  private animate(): void {
    // ใช้ NgZone ช่วยจัดการไม่ให้รบกวนประสิทธิภาพของ Angular ทุกๆ เฟรมเรต (60fps)
    this.ngZone.runOutsideAngular(() => {
      const renderLoop = () => {
        this.animationId = requestAnimationFrame(renderLoop);
        
        // ทำให้วัตถุที่เจอ (ลูท/ศัตรู) ลอยหมุนๆ เหมือนข้อมูลโฮโลแกรมล้ำยุค
        this.blipsGroup.children.forEach(mesh => {
          mesh.rotation.y += 0.05;
          mesh.rotation.x += 0.02;
        });

        // อัปเดตความสูงของตัวแทนผู้เล่นให้ตรงกับความสูงของพื้นที่
        this.playerMesh.position.y = (this.currentZ / 2) + 6; // +6 คือครึ่งหนึ่งของความสูง Cone
        
        // เลื่อนโลกทั้งหมดให้สวนทางกับหุ่นยนต์ (ทำให้เหมือนหุ่นเคลื่อนที่ไปข้างหน้า)
        this.worldGroup.position.set(-this.currentX / 2, 0, this.currentY / 2);
        // หมุนแผนที่รอบๆ ตัวหุ่นยนต์
        this.pivotGroup.rotation.y = THREE.MathUtils.degToRad(-this.mapRotation);

        this.renderer.render(this.scene, this.camera);
      };
      renderLoop();
    });
  }
}