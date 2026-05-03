import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { LocalAIService } from '@app/operator-tablet/service/gemini.service';
import { AiTerminalComponent } from '../terminal/ai-terminal.component';
 
@Component({
  selector: 'app-operator-tablet',
  templateUrl: './operator-tablet.component.html',
  styleUrls: ['./operator-tablet.component.scss']
})
export class OperatorTabletComponent implements OnInit {
  constructor(private geminiService: LocalAIService) {}
  currentTime: Date = new Date();
  isListening: boolean = false;
  recognition: any;
  userCommand: string = '';
  isProcessing: boolean = false; // สถานะกำลังประมวลผลคำสั่ง
  isShowingPhoto: boolean = false; // สถานะแสดงภาพถ่าย
  currentPhotoScene: string = ''; // ข้อความอธิบายภาพถ่าย
  currentPhotoAscii: string = ''; // ภาพ ASCII Art ประกอบฉาก
  isAutoExploring: boolean = false; // สถานะกำลังสำรวจอัตโนมัติ
  isAutoUpgrade: boolean = false; // สถานะอัปเกรดอัตโนมัติ
  isAutoRecharge: boolean = false; // สถานะชาร์จแบตอัตโนมัติ
  private autoExploreInterval: any = null; // ตัวเก็บ Interval สำหรับเดินอัตโนมัติ
  private audioContext: any = null; // สร้างตัวแปรเก็บ AudioContext ไว้ใช้ร่วมกัน
   @ViewChild(AiTerminalComponent) private aiTerminal!: AiTerminalComponent;
  private readonly SAVE_KEY = 'RE_CODE_SAVE_DATA';
  private lastInteractionTime: number = Date.now(); // เก็บเวลาล่าสุดที่ผู้เล่นโต้ตอบ
  private transmissionInterval: any; // ตัวเก็บ Interval สำหรับเสียงรอสัญญาณ
  private noiseSource: any = null; // ตัวเก็บ Source สำหรับเสียงคลื่นแทรก (Radio Static)
  private carrierOsc: any = null; // ตัวเก็บ Source สำหรับเสียงสัญญาณพื้นฐาน (Carrier Tone)
  isWalking: boolean = false;
  zVelocity: number = 0; // เพิ่มแรงส่งกระโดด
  pressedKeys: Set<string> = new Set(); // เก็บปุ่มที่กำลังกดค้างไว้ // สถานะกำลังเดิน (สำหรับแอนิเมชัน Head bobbing)

  // ตัวแปรระบบแผนที่เรดาร์
  currentX: number = 104.25;
  currentY: number = -42.88;
  currentZ: number = 0; // [เพิ่ม] พิกัดความสูงปัจจุบันของหุ่นยนต์
  targetWorldX: number = 104.25; // พิกัดเป้าหมายสำหรับการเดินแบบสมูท
  targetWorldY: number = -42.88;
  targetWorldZ: number = 0; // [เพิ่ม] พิกัดความสูงเป้าหมาย
  worldObjects: { x: number, y: number, z: number, type: string, id: string }[] = []; // [อัปเดต] เพิ่ม z
  radarBlips: { x: number, y: number, z: number, type: string, label?: string }[] = []; // [อัปเดต] เพิ่ม z
  environmentObjects: { x: number, y: number, z: number, type: string, width: number, depth: number, rotation: number }[] = []; // [เพิ่ม] สำหรับเช็คชนท่อนไม้และตกน้ำ
  mapRotation: number = 0; // เก็บองศาการหมุนของแผนที่
  targetMapRotation: number = 0; // เป้าหมายองศาการหมุนสำหรับทำสมูท
  cameraOrbit: string = '180deg 75deg auto'; // มุมกล้องให้อยู่หลังหุ่นเสมอ (หันหน้าเข้าหาทิศที่เดิน)

  // คลังเก็บอารมณ์และใบหน้าของ GHOST-OS แบบ ASCII
  FACES = {
    idle:     " [ O   O ] \n   \\_-_/   ",
    thinking: " [ -   - ] \n   \\___/   ",
    talking:  " [ O   O ] \n   \\_o_/   ",
    warning:  " [ >   < ] \n   \\_x_/   ",
    happy:    " [ ^   ^ ] \n   \\_v_/   "
  };
  currentAiFace: string = this.FACES.idle;

  // ฐานข้อมูลภาพถ่ายและ ASCII Art
  SCENERY_DB = [
    { text: 'ซากตึกคอนกรีตที่มีเหล็กเส้นโผล่ออกมา', ascii: "   |  |   \n  |[] []| \n  |  /  | \n  |[] []| \n  |_//__| " },
    { text: 'ซากหุ่นยนต์เก่าๆ กองพะเนิน', ascii: "   (X_x)  \n  /||_||\\ \n   || ||  \n  / / \\ \\ \n  |_| |_| " },
    { text: 'หมอกพิษสีเหลืองลอยต่ำๆ', ascii: "  ≈ ≋ ≈ ≋ \n ≋ ≈ ≋ ≈ \n  ≈ ≋ ≈ ≋ \n ≋ ≈ ≋ ≈ \n  ≈ ≋ ≈ ≋ " },
    { text: 'ป้ายโฆษณาโฮโลแกรมพังๆ', ascii: " +------+ \n |ERROR!| \n +------+ \n   \\||/   \n    ||    " },
    { text: 'ภูเขาขยะอิเล็กทรอนิกส์', ascii: "     .    \n    / \\   \n   /   \\  \n  /_____\\ \n // \\/ \\ \\" }
  ];

  chatHistory: { role: string, text: string }[] = [
    { role: 'ai', text: '[SYSTEM_START] บูตระบบ GHOST-OS สำเร็จ...' },
    { role: 'ai', text: 'พบสัญญาณอ่อนๆ จากซากหุ่นยนต์ตกรุ่น "Home-Pal 01 (ปีผลิต 2042)" สภาพสนิมเขรอะ บริเวณกองขยะอิเล็กทรอนิกส์ Sector-7 พร้อมรับคำสั่ง...' }
  ];

  // Data จำลองสถานะของหุ่นยนต์
  robotStatus = {
    hp: 100,
    maxHp: 100,
    battery: 85,
    maxBattery: 100,
    efficiencyLevel: 1, // เลเวลประหยัดพลังงาน (มอเตอร์)
    scavengingLevel: 1, // เลเวลหาของ (ไลดาร์)
    solarLevel: 1,      // เลเวลแผงโซลาร์ (ชาร์จไฟ) เริ่มต้นที่ 1
    inventory: {
      scrap: 12,
      chips: 2,
      cameras: 0,
      solarPanels: 0,
      batteries: 0,
      phones: 0,
      photos: [] as string[] // ที่เก็บรูปถ่าย
    },
    isPurifierCrafted: false, // สถานะการสร้างเครื่องฟอกอากาศ (จบเกม)
    hasCamera: true   // เริ่มต้นมาพร้อมกล้อง 1 ตัว (ถ่ายได้ 1 ครั้งแล้วพัง)
  };

  // Data จำลองสภาพแวดล้อมบนดิน
  environment = {
    toxicity: 'High',
    weather: 'Clear'
  };

  ngOnInit() {
    setInterval(() => {
      this.currentTime = new Date();
      // จำลองพิกัดการเคลื่อนที่ของหุ่นยนต์ตอนที่กำลังปฏิบัติงาน
      if (this.isProcessing) {
        this.currentX += (Math.random() - 0.5) * 0.8;
        this.currentY += (Math.random() - 0.5) * 0.8;
        this.targetWorldX = this.currentX;
        this.targetWorldY = this.currentY;
      }
    }, 1000);

    this.initSpeechRecognition();

    // โหลดรายการแพ็กเกจเสียงล่วงหน้า เพื่อเตรียมความพร้อมสำหรับ Text-to-Speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }

    this.autoLoadGame();
    this.generateWorld(); // จำลองการสร้างวัตถุบนแผนที่โลกครั้งแรก
    this.generateEnvironment(); // [เพิ่ม] สร้างท่อนไม้และแม่น้ำ

    // [เพิ่ม] คำนวณความสูงเริ่มต้นและกำหนดค่า
    const initialZ = this.getFloorZ(this.currentX, this.currentY);
    this.currentZ = initialZ;
    this.targetWorldZ = initialZ;

    // อัปเดตเรดาร์ครั้งแรก และตั้งเวลาให้จุดสัญญาณสุ่มเปลี่ยนที่ทุกๆ 3 วินาที
    this.updateRadar();
    setInterval(() => this.updateRadar(), 1000); // อัปเดตเรดาร์ให้ไวขึ้นเพื่อให้สมจริง

    // ระบบ Loop อัปเดตการเดินแบบสมูท (Smooth Movement) 30 FPS
    setInterval(() => {
      const dx = this.targetWorldX - this.currentX;
      const dy = this.targetWorldY - this.currentY;
      
      const groundZ = this.getFloorZ(this.currentX, this.currentY);
      
      // ระบบกระโดดแบบมีแรงโน้มถ่วง (สมูตขึ้น)
      this.currentZ += this.zVelocity;
      if (this.currentZ > groundZ) {
        this.zVelocity -= 1.5; // แรงโน้มถ่วง (Gravity) ดึงกลับลงมา
      } else {
        this.zVelocity = 0;
        this.currentZ = groundZ; // แตะพื้น
      }

      // ระบบเดินแนวนอน
      if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
        this.currentX += dx * 0.2; 
        this.currentY += dy * 0.2;
        this.isWalking = true;
      } else {
        this.currentX = this.targetWorldX;
        this.currentY = this.targetWorldY;
        this.isWalking = false;
      }
      
      const diffRot = this.targetMapRotation - this.mapRotation;
      if (Math.abs(diffRot) > 0.5) {
        this.mapRotation += diffRot * 0.2;
      } else {
        this.mapRotation = this.targetMapRotation;
      }

      // ระบบเดินต่อเนื่องเมื่อกดปุ่มค้าง
      if (this.pressedKeys && this.pressedKeys.size > 0 && !this.isProcessing) {
        let moveCmd = '';
        let rotCmd = '';
        if (this.pressedKeys.has('w') || this.pressedKeys.has('arrowup')) moveCmd = 'เดินหน้า';
        else if (this.pressedKeys.has('s') || this.pressedKeys.has('arrowdown')) moveCmd = 'ถอยหลัง';
        
        if (this.pressedKeys.has('a') || this.pressedKeys.has('arrowleft')) rotCmd = 'เดินซ้าย';
        else if (this.pressedKeys.has('d') || this.pressedKeys.has('arrowright')) rotCmd = 'เดินขวา';

        if (rotCmd) this.executeContinuousMovement(rotCmd);
        if (moveCmd) this.executeContinuousMovement(moveCmd);
      }
    }, 1000 / 30);

    // ระบบ Passive: ชาร์จแบตเตอรี่จากพลังงานแสงอาทิตย์
    setInterval(() => {
      if (this.robotStatus.solarLevel > 0 && this.robotStatus.battery < this.robotStatus.maxBattery && !this.isProcessing) {
         const chargeAmount = this.robotStatus.solarLevel; // เลเวลโซลาร์ยิ่งสูง ยิ่งชาร์จแรง
         this.robotStatus.battery = Math.min(this.robotStatus.maxBattery, this.robotStatus.battery + chargeAmount);
      }
    }, 2500); // ปรับให้ฟื้นฟูแบตตามเลเวลโซลาร์เซลล์เร็วขึ้นเป็นทุกๆ 2.5 วินาที

    // ระบบ Auto-Recharge (ชาร์จแบตเตอรี่อัตโนมัติเมื่อพลังงานต่ำกว่า 30%)
    setInterval(() => {
      if (this.isAutoRecharge && this.robotStatus.battery <= 30 && !this.isProcessing) {
        this.userCommand = 'ชาร์จแบต';
        this.sendCommand();
      }
    }, 2000);

    // ระบบ Auto-Upgrade (เช็คและอัปเกรดอัตโนมัติ)
    setInterval(() => {
      if (this.isAutoUpgrade && !this.isProcessing) {
        this.checkAndExecuteAutoUpgrade();
      }
    }, 5000);

    // ระบบ AI ทักทาย/แจ้งเตือนแบบสุ่มเมื่อเจ้านายปล่อยจอทิ้งไว้
    // setInterval(() => {
    //   if (!this.isProcessing && !this.robotStatus.isPurifierCrafted) {
    //     const idleTime = Date.now() - this.lastInteractionTime;
    //     // ถ้าไม่ได้ทำอะไรเลย 45 วินาที และมีโอกาส 30% ที่จะชวนคุย
    //     if (idleTime > 45000 && Math.random() > 0.7) {
    //       this.triggerRandomAIChatter();
    //     }
    //   }
    // }, 10000); // ตรวจสอบทุกๆ 10 วินาที
  }

  // [เพิ่ม] ฟังก์ชันคำนวณความสูงของภูมิประเทศ ณ พิกัด (x, y)
  getTerrainHeight(x: number, y: number): number {
    // ใช้ Sine/Cosine สร้างเนินเขาง่ายๆ
    const scale = 0.02; // ยิ่งค่าน้อย เนินยิ่งกว้าง
    const amplitude = 15; // ยิ่งค่ามาก เนินยิ่งสูง
    return (Math.sin(x * scale) + Math.cos(y * scale * 0.7)) * amplitude;
  }

  // [เพิ่ม] ฟังก์ชันคำนวณความสูงของพื้นผิว (รวมวัตถุที่เหยียบได้) ณ พิกัด (x, y)
  getFloorZ(x: number, y: number): number {
    let z = this.getTerrainHeight(x, y);
    
    const envHit = this.checkEnvironmentCollision(x, y);
    if (envHit && envHit.type === 'log') {
      z += 15; // ท่อนไม้สูง 15 หน่วย
    }
    
    const collisionRadius = 20; 
    const obstacle = this.worldObjects.find(obj => obj.type === 'obstacle' && Math.sqrt(Math.pow(obj.x - x, 2) + Math.pow(obj.y - y, 2)) < collisionRadius);
    if (obstacle) {
      z += 20; // สิ่งกีดขวางสูง 20 หน่วย
    }
    
    return z;
  }

  // [เพิ่ม] ฟังก์ชันสร้างท่อนไม้และแม่น้ำ (Environment Objects)
  generateEnvironment() {
    // สุ่มท่อนไม้ให้เพิ่มขึ้น ลดน้ำลงเป็นแอ่งและแม่น้ำ
    for (let i = 0; i < 30; i++) { // ลดจำนวนลงไม่ให้บล็อคทางเดิน
      let randX = 0;
      let randY = 0;
      let isTooClose = true;
      let randType = Math.random();
      
      while (isTooClose) {
        randX = (Math.random() - 0.5) * 1200;
        randY = (Math.random() - 0.5) * 1200;
        
        // ตรวจสอบว่าไม่เกิดใกล้จุดเกิดตอนเริ่มเกมเกินไป (พิกัด 104.25, -42.88) ในระยะ 80 หน่วย
        if (Math.sqrt(Math.pow(randX - 104.25, 2) + Math.pow(randY - -42.88, 2)) > 80) {
          isTooClose = false;
        }
      }
      
      // ถ้าน้ำสุ่มเกิด ให้ตรวจสอบว่าเกิดบนที่ต่ำ (หุบเขา) หรือไม่ เพื่อไม่ให้น้ำไปอยู่บนภูเขา
      if (randType > 0.75) {
        let isLowland = false;
        for (let tries = 0; tries < 15; tries++) {
           if (this.getTerrainHeight(randX, randY) < -5) { 
              isLowland = true;
              break; // เจอหุบเขาแล้ว ให้ออกจากลูป
           }
           // ถ้าเจอภูเขาให้สุ่มพิกัดใหม่ไปเรื่อยๆ และต้องไม่ทับจุดเกิด
           let rollClose = true;
           while(rollClose) {
             randX = (Math.random() - 0.5) * 1200;
             randY = (Math.random() - 0.5) * 1200;
             if (Math.sqrt(Math.pow(randX - 104.25, 2) + Math.pow(randY - -42.88, 2)) > 80) {
               rollClose = false;
             }
           }
        }
        // ถ้าพยายามหาที่ต่ำไม่ได้จริงๆ ให้เปลี่ยนน้ำเป็นท่อนไม้แทน
        if (!isLowland) {
           randType = 0.5;
        }
      }

      const rot = Math.random() * 360;

      if (randType > 0.85) { // 15% เป็นแม่น้ำแคบและยาว
        this.environmentObjects.push({
          x: randX, y: randY, z: 0,
          type: Math.random() > 0.5 ? 'shallow_water' : 'deep_water',
          width: Math.random() * 200 + 100, depth: Math.random() * 30 + 10, rotation: rot
        });
      } else if (randType > 0.75) { // 10% เป็นแอ่งน้ำขังเล็กๆ
        this.environmentObjects.push({
          x: randX, y: randY, z: 0,
          type: 'shallow_water',
          width: Math.random() * 40 + 20, depth: Math.random() * 40 + 20, rotation: rot
        });
      } else { // 75% เป็นท่อนไม้/สิ่งกีดขวางตามพื้น
        this.environmentObjects.push({
          x: randX, y: randY, z: 0, type: 'log',
          width: Math.random() * 50 + 20, depth: Math.random() * 5 + 5, rotation: rot
        });
      }
    }
  }

  // [เพิ่ม] ฟังก์ชันตรวจสอบการชนกับสิ่งแวดล้อม (Rectangle Collision)
  private checkEnvironmentCollision(testX: number, testY: number): any {
    const robotRadius = 12; // ขยายรัศมีการชนเพื่อป้องกันโมเดล 3D ที่สเกลใหญ่เดินทะลุเข้าไปใน Object
    return this.environmentObjects.find(env => {
      const dx = testX - env.x;
      const dy = testY - env.y;
      const angleRad = -env.rotation * Math.PI / 180;
      const localX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
      const localY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);
      const halfW = (env.width / 2) + robotRadius;
      const halfH = (env.depth / 2) + robotRadius;
      return Math.abs(localX) < halfW && Math.abs(localY) < halfH;
    });
  }

  // สร้างวัตถุจำลองในโลก
  generateWorld() {
    for (let i = 0; i < 400; i++) { // เพิ่มจำนวน Object รวมขึ้น
      let type = 'scrap'; // เปลี่ยนค่าเริ่มต้นเป็นเศษเหล็ก
      const rand = Math.random();
      
      // เรียงลำดับตัวเลขสุ่มจากสูงไปต่ำให้ถูกต้อง
      if (rand > 0.98) type = 'anomaly';   // 2% วัตถุลึกลับ (Mystery Event)
      else if (rand > 0.92) type = 'camera';    // 6% กล้องถ่ายภาพ
      else if (rand > 0.86) type = 'solarPanel';// 6% แผงโซลาร์
      else if (rand > 0.80) type = 'batteryItem';// 6% แบตเตอรี่เก่า
      else if (rand > 0.74) type = 'phone';     // 6% มือถือ
      else if (rand > 0.60) type = 'chip';      // 14% ชิปวงจร
      // ต่ำกว่า 0.60 ลงไปจะกลายเป็น scrap (เศษเหล็ก) ทั้งหมด (60%) 
      
      const objX = this.currentX + (Math.random() - 0.5) * 1200; // กระจายกว้างขึ้น
      const objY = this.currentY + (Math.random() - 0.5) * 1200;
      const objZ = this.getFloorZ(objX, objY); // คำนวณความสูงของวัตถุ

      this.worldObjects.push({
        x: objX, y: objY, z: objZ,
        type: type,
        id: Math.random().toString(36).substring(2, 9)
      });
    }
  }

  // อัปเดตจุดสัญญาณบนแผนที่เรดาร์
  updateRadar() {
    const radarRadius = 150; // รัศมีพื้นฐาน
    const scanRadius = radarRadius + (this.robotStatus.scavengingLevel * 20); // ยิ่งอัปเกรดเรดาร์ยิ่งสแกนไกล

    const nearbyObjects = this.worldObjects.filter(obj => {
      const dx = obj.x - this.currentX;
      const dy = obj.y - this.currentY;
      return Math.sqrt(dx * dx + dy * dy) <= scanRadius;
    });

    this.radarBlips = nearbyObjects.map(obj => {
      let lbl = 'OBJ';
      if(obj.type === 'scrap') lbl = 'SCRAP';
      else if(obj.type === 'chip') lbl = 'CHIP';
      else if(obj.type === 'anomaly') lbl = '???';
      else if(obj.type !== 'obstacle') lbl = 'LOOT';
      return {
        x: obj.x, // ส่งพิกัดโลกไปเลย เพื่อให้ Minimap คำนวณ 3D แบบสมูท
        y: obj.y, 
        z: (obj as any).z || 0, // ส่งค่า z ไปด้วย
        type: obj.type,
        label: lbl
      };
    });
  }

  // รีเซ็ตตัวจับเวลาเมื่อผู้เล่นขยับหรือสั่งการ
  resetIdleTimer() {
    this.lastInteractionTime = Date.now();
  }

  async triggerRandomAIChatter() {
    this.isProcessing = true;
    this.resetIdleTimer();
    this.currentAiFace = this.FACES.thinking;

    const cmd = "[EVENT_TRIGGER: เจ้านายเงียบไปนานและไม่ได้สั่งการใดๆ] (AI: ชวนเจ้านายคุย รายงานสถานะ หรือบ่นเรื่องสภาพแวดล้อมสั้นๆ อย่างเป็นธรรมชาติ)";
    
    this.startTransmissionSound();
    const response = await this.geminiService.generateResponse(cmd, this.robotStatus, this.environment);
    this.stopTransmissionSound();
    
    this.speakText(response);
    
    const aiMessage = { role: 'ai', text: '' };
    this.chatHistory.push(aiMessage);
    
    for (let i = 0; i < response.length; i++) {
      aiMessage.text += response[i];
      if (i % 2 === 0) {
        this.playTypewriterBeep();
        this.currentAiFace = this.currentAiFace === this.FACES.talking ? " [ O   O ] \n   \\_O_/   " : this.FACES.talking;
      }
      await new Promise(resolve => setTimeout(resolve, 30));
      this.scrollToBottom();
    }
    this.currentAiFace = this.FACES.idle;
    this.isProcessing = false;
  }

  initSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = 'th-TH'; // ตั้งค่าเป็นภาษาไทย
      this.recognition.continuous = false;
      this.recognition.interimResults = false;

      this.recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        this.userCommand = transcript;
        this.sendCommand(); // สั่งการอัตโนมัติเมื่อพูดจบ
      };

      this.recognition.onend = () => {
        this.isListening = false;
      };
    } else {
      console.warn('เบราว์เซอร์นี้ไม่รองรับระบบ Speech Recognition');
    }
  }

  toggleListening() {
    if (!this.recognition || this.isProcessing) return;
    this.resetIdleTimer();
    if (this.isListening) {
      this.recognition.stop();
    } else {
      this.recognition.start();
      this.isListening = true;
    }
  }

  async triggerEndgameAI() {
    this.isProcessing = true;
    const cmd = "[EVENT_TRIGGER: เจ้านายประกอบเครื่องฟอกอากาศ Atmospheric Purifier เสร็จสมบูรณ์แล้ว! ท้องฟ้าเปิดออก ภารกิจกอบกู้โลกสำเร็จลุล่วง] (AI: กล่าวแสดงความยินดีเพื่อปิดจบเกมด้วยน้ำเสียงซึ้งๆ ผสมตลกร้าย)";
    
    this.startTransmissionSound();
    const response = await this.geminiService.generateResponse(cmd, this.robotStatus, this.environment);
    this.stopTransmissionSound();

    this.speakText(response);
    
    const aiMessage = { role: 'ai', text: '' };
    this.chatHistory.push(aiMessage);
    
    for (let i = 0; i < response.length; i++) {
      aiMessage.text += response[i];
      if (i % 2 === 0) {
        this.playTypewriterBeep();
        this.currentAiFace = this.currentAiFace === this.FACES.talking ? " [ O   O ] \n   \\_O_/   " : this.FACES.talking;
      }
      await new Promise(resolve => setTimeout(resolve, 30));
      this.scrollToBottom();
    }
    
    // จบเกมแล้วให้ GHOST-OS ทำหน้ามีความสุขค้างไว้
    this.currentAiFace = this.FACES.happy;
    this.isProcessing = false;
  }

  // ระบบควบคุมด้วยปุ่ม W A S D และลูกศรบนคีย์บอร์ด
  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    const key = event.key.toLowerCase();
    this.pressedKeys.add(key);

    // ป้องกันหน้าจอเลื่อนเมื่อกดปุ่ม Spacebar หรือปุ่มลูกศร
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      event.preventDefault();
    }

    if (key === ' ') {
      if (!event.repeat) {
        this.executeDirectMovement('กระโดด');
      }
    }
  }

  @HostListener('document:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    this.pressedKeys.delete(event.key.toLowerCase());
  }

  // ฟังก์ชันเดินต่อเนื่องที่ถูกเรียก 30 ครั้งต่อวินาที
  executeContinuousMovement(cmd: string) {
    if (this.robotStatus.battery <= 0 || this.robotStatus.hp <= 0) {
      this.pressedKeys.clear();
      return;
    }

    let moveSpeed = 1.5; // ความเร็วเมื่อเดินต่อเนื่อง (ปรับลดลงให้คงที่และไม่เร็วเกินไป)
    let moveX = 0;
    let moveY = 0;
    let targetRotation = this.targetMapRotation;

    if (cmd === 'เดินซ้าย') { 
      targetRotation += 5; 
    }
    else if (cmd === 'เดินขวา') { 
      targetRotation -= 5; 
    }
    else if (cmd === 'เดินหน้า') { 
      moveX = moveSpeed * -Math.sin(targetRotation * Math.PI / 180);
      moveY = moveSpeed * Math.cos(targetRotation * Math.PI / 180);
    }
    else if (cmd === 'ถอยหลัง') { 
      moveX = -moveSpeed * -Math.sin(targetRotation * Math.PI / 180);
      moveY = -moveSpeed * Math.cos(targetRotation * Math.PI / 180);
    }

    if (moveX === 0 && moveY === 0) {
      if (targetRotation !== this.targetMapRotation) {
        let diff = (targetRotation - this.targetMapRotation) % 360;
        if (diff > 180) diff -= 360;
        else if (diff < -180) diff += 360;
        this.targetMapRotation += diff;
        this.cameraOrbit = `180deg 75deg ${100 + Math.random() * 0.01}%`;
      }
      return;
    }

    let speedMultiplier = 1 + (this.robotStatus.efficiencyLevel * 0.2);
    
    const currentEnv = this.checkEnvironmentCollision(this.currentX, this.currentY);
    const inShallowWater = currentEnv && currentEnv.type === 'shallow_water';
    
    if (inShallowWater) {
       speedMultiplier *= 0.4;
    }

    let targetX = this.targetWorldX + moveX * speedMultiplier;
    let targetY = this.targetWorldY + moveY * speedMultiplier;
    let targetZ = this.getFloorZ(targetX, targetY);

    const collisionRadius = 20; 
    const obstacle = this.worldObjects.find(obj => obj.type === 'obstacle' && Math.sqrt(Math.pow(obj.x - targetX, 2) + Math.pow(obj.y - targetY, 2)) < collisionRadius);

    const envHit = this.checkEnvironmentCollision(targetX, targetY);
    let isBlockingEnv = envHit && envHit.type !== 'shallow_water';

    // เช็คว่าอยู่ในระดับที่สูงพอจะเดินเหยียบเป้าหมายได้ (ลอยตัวหรือยืนบนวัตถุแล้ว)
    const currentGroundZ = this.getFloorZ(this.currentX, this.currentY);
    const isHighEnough = this.currentZ >= targetZ - 5;

    if (!isHighEnough && (obstacle || isBlockingEnv)) {
      // เดินชน ไม่ขยับ
    } else {
      this.targetWorldX = targetX;
      this.targetWorldY = targetY;
      this.targetWorldZ = targetZ;

      let diff = (targetRotation - this.targetMapRotation) % 360;
      if (diff > 180) diff -= 360;
      else if (diff < -180) diff += 360;
      this.targetMapRotation += diff;

      // เช็คเก็บของ
      const pickupRadius = 40;
      let lootCounts: any = { scrap: 0, chip: 0, camera: 0, solarPanel: 0, batteryItem: 0, phone: 0, anomaly: 0 };
      this.worldObjects = this.worldObjects.filter(obj => {
        if (obj.type === 'obstacle') return true;
        const dx = obj.x - targetX;
        const dy = obj.y - targetY;
        const isPickedUp = Math.sqrt(dx * dx + dy * dy) <= pickupRadius;
        if (isPickedUp) {
          if (lootCounts[obj.type] !== undefined) lootCounts[obj.type]++;
          else lootCounts.scrap++;
          return false;
        }
        return true;
      });

      let pickedUp = false;
      if (lootCounts.scrap > 0) { this.robotStatus.inventory.scrap += lootCounts.scrap * (Math.floor(Math.random() * 2) + 1); pickedUp = true; }
      if (lootCounts.chip > 0) { this.robotStatus.inventory.chips += lootCounts.chip; pickedUp = true; }
      if (lootCounts.camera > 0) { this.robotStatus.inventory.cameras += lootCounts.camera; pickedUp = true; }
      if (lootCounts.solarPanel > 0) { this.robotStatus.inventory.solarPanels += lootCounts.solarPanel; pickedUp = true; }
      if (lootCounts.batteryItem > 0) { this.robotStatus.inventory.batteries += lootCounts.batteryItem; pickedUp = true; }
      if (lootCounts.phone > 0) { this.robotStatus.inventory.phones += lootCounts.phone; pickedUp = true; }
      if (lootCounts.anomaly > 0) {
        pickedUp = true;
        const effect = Math.random();
        if (effect > 0.5) {
          this.robotStatus.battery = this.robotStatus.maxBattery;
          this.robotStatus.hp = this.robotStatus.maxHp;
          setTimeout(() => {
            this.userCommand = "[EVENT_TRIGGER: หุ่นยนต์เดินชนวัตถุลึกลับ และได้รับพลังงานปริศนา แบตเตอรี่และเกราะฟื้นฟูเต็ม 100%!] (AI: ตกใจและดีใจกับปาฏิหาริย์นี้)";
            this.sendCommand();
          }, 500);
        } else {
          this.robotStatus.hp = Math.max(1, this.robotStatus.hp - 30);
          setTimeout(() => {
            this.userCommand = "[EVENT_TRIGGER: หุ่นยนต์เดินชนวัตถุลึกลับ มันปล่อยคลื่นแม่เหล็กไฟฟ้าทำลายวงจร ลด HP 30 หน่วย!] (AI: ร้องด้วยความเจ็บปวดและบ่นโวยวาย)";
            this.sendCommand();
          }, 500);
        }
      }
      if (pickedUp) this.playItemPickupSound();

      if (Math.random() > 0.995) { // ลดโอกาสเลือดลดตอนเดินต่อเนื่อง
        const dmg = Math.floor(Math.random() * 4) + 1;
        this.robotStatus.hp = Math.max(0, this.robotStatus.hp - dmg);
      }

      this.cameraOrbit = `180deg 75deg ${100 + Math.random() * 0.01}%`;
    }
    
    if (Math.random() > 0.95) { // กินแบตน้อยลงตอนเดินต่อเนื่อง
      this.robotStatus.battery = Math.max(0, this.robotStatus.battery - 1);
    }
  }

  // ฟังก์ชันรองรับการกด D-Pad บนหน้าจอ
  moveDirection(key: string) {
    let command = '';
    switch (key.toLowerCase()) {
      case 'w': command = 'เดินหน้า'; break;
      case 's': command = 'ถอยหลัง'; break;
      case 'a': command = 'เดินซ้าย'; break;
      case 'd': command = 'เดินขวา'; break;
    }
    if (command) {
      this.executeDirectMovement(command);
    }
  }

  // ฟังก์ชันเคลื่อนที่โดยตรง (ไม่ต้องรอคิวแชท AI)
  executeDirectMovement(cmd: string) {
    if (this.robotStatus.battery <= 0 || this.robotStatus.hp <= 0) return;

    if (cmd === 'กระโดด') {
      if (this.currentZ <= this.getFloorZ(this.currentX, this.currentY) + 1) { // กระโดดได้เฉพาะตอนอยู่พื้น
        this.zVelocity = 12; // แรงส่งกระโดดแบบสมูต
        this.robotStatus.battery = Math.max(0, this.robotStatus.battery - 1);
      }
      return;
    }

    let moveX = 0;
    let moveY = 0;
    let targetRotation = this.targetMapRotation;

    if (cmd === 'เดินซ้าย') { 
      targetRotation += 15; 
    }
    else if (cmd === 'เดินขวา') { 
      targetRotation -= 15; 
    }
    else if (cmd === 'เดินหน้า') { 
      moveX = 15 * -Math.sin(targetRotation * Math.PI / 180);
      moveY = 15 * Math.cos(targetRotation * Math.PI / 180);
    }
    else if (cmd === 'ถอยหลัง') { 
      moveX = -15 * -Math.sin(targetRotation * Math.PI / 180);
      moveY = -15 * Math.cos(targetRotation * Math.PI / 180);
    }

    if (moveX === 0 && moveY === 0) {
      if (targetRotation !== this.targetMapRotation) {
        let diff = (targetRotation - this.targetMapRotation) % 360;
        if (diff > 180) diff -= 360;
        else if (diff < -180) diff += 360;
        this.targetMapRotation += diff;
        this.cameraOrbit = `180deg 75deg ${100 + Math.random() * 0.01}%`;
      }
      return;
    }

    let speedMultiplier = 1 + (this.robotStatus.efficiencyLevel * 0.2);
    
    const currentEnv = this.checkEnvironmentCollision(this.targetWorldX, this.targetWorldY);
    const inShallowWater = currentEnv && currentEnv.type === 'shallow_water';
    
    if (inShallowWater) {
       speedMultiplier *= 0.4;
    }

    let targetX = this.targetWorldX + moveX * speedMultiplier;
    let targetY = this.targetWorldY + moveY * speedMultiplier;
    let targetZ = this.getFloorZ(targetX, targetY);

    const collisionRadius = 20; 
    const obstacle = this.worldObjects.find(obj => obj.type === 'obstacle' && Math.sqrt(Math.pow(obj.x - targetX, 2) + Math.pow(obj.y - targetY, 2)) < collisionRadius);

    const envHit = this.checkEnvironmentCollision(targetX, targetY);
    let isBlockingEnv = envHit && envHit.type !== 'shallow_water';

    // เช็คว่าอยู่ในระดับที่สูงพอจะเดินเหยียบเป้าหมายได้ (ลอยตัวหรือยืนบนวัตถุแล้ว)
    const currentGroundZ = this.getFloorZ(this.currentX, this.currentY);
    const isHighEnough = this.currentZ >= targetZ - 5;

    let jumpedLog = false;
    if (!isHighEnough && isBlockingEnv && envHit.type === 'log') {
      const jumpX = this.targetWorldX + moveX * speedMultiplier * 1.8;
      const jumpY = this.targetWorldY + moveY * speedMultiplier * 1.8;
      const jumpEnvHit = this.checkEnvironmentCollision(jumpX, jumpY);
      const jumpObstacle = this.worldObjects.find(obj => obj.type === 'obstacle' && Math.sqrt(Math.pow(obj.x - jumpX, 2) + Math.pow(obj.y - jumpY, 2)) < collisionRadius);
      
      if (!jumpEnvHit && !jumpObstacle) {
        targetX = jumpX;
        targetY = jumpY;
        isBlockingEnv = false;
        jumpedLog = true;
      }
    }

    if (!isHighEnough && (obstacle || isBlockingEnv)) {
      const isDeepWater = envHit && envHit.type === 'deep_water';
      const dmg = isDeepWater ? Math.floor(Math.random() * 10) + 10 : Math.floor(Math.random() * 5) + 3;
      this.robotStatus.hp = Math.max(0, this.robotStatus.hp - dmg);
    } else {
      this.targetWorldX = targetX;
      this.targetWorldY = targetY;
      this.targetWorldZ = targetZ;
      
      if (jumpedLog) {
         this.currentZ += 15;
         this.robotStatus.battery = Math.max(0, this.robotStatus.battery - 2);
      }

      let diff = (targetRotation - this.targetMapRotation) % 360;
      if (diff > 180) diff -= 360;
      else if (diff < -180) diff += 360;
      this.targetMapRotation += diff;

      const pickupRadius = 40;
      let lootCounts: any = { scrap: 0, chip: 0, camera: 0, solarPanel: 0, batteryItem: 0, phone: 0, anomaly: 0 };

      this.worldObjects = this.worldObjects.filter(obj => {
        if (obj.type === 'obstacle') return true;
        const dx = obj.x - targetX;
        const dy = obj.y - targetY;
        const isPickedUp = Math.sqrt(dx * dx + dy * dy) <= pickupRadius;
        
        if (isPickedUp) {
          if (lootCounts[obj.type] !== undefined) lootCounts[obj.type]++;
          else lootCounts.scrap++;
          return false;
        }
        return true;
      });

      let pickedUp = false;
      if (lootCounts.scrap > 0) { this.robotStatus.inventory.scrap += lootCounts.scrap * (Math.floor(Math.random() * 2) + 1); pickedUp = true; }
      if (lootCounts.chip > 0) { this.robotStatus.inventory.chips += lootCounts.chip; pickedUp = true; }
      if (lootCounts.camera > 0) { this.robotStatus.inventory.cameras += lootCounts.camera; pickedUp = true; }
      if (lootCounts.solarPanel > 0) { this.robotStatus.inventory.solarPanels += lootCounts.solarPanel; pickedUp = true; }
      if (lootCounts.batteryItem > 0) { this.robotStatus.inventory.batteries += lootCounts.batteryItem; pickedUp = true; }
      if (lootCounts.phone > 0) { this.robotStatus.inventory.phones += lootCounts.phone; pickedUp = true; }
      if (lootCounts.anomaly > 0) {
        pickedUp = true;
        const effect = Math.random();
        if (effect > 0.5) {
          this.robotStatus.battery = this.robotStatus.maxBattery;
          this.robotStatus.hp = this.robotStatus.maxHp;
          setTimeout(() => {
            this.userCommand = "[EVENT_TRIGGER: หุ่นยนต์เดินชนวัตถุลึกลับ และได้รับพลังงานปริศนา แบตเตอรี่และเกราะฟื้นฟูเต็ม 100%!] (AI: ตกใจและดีใจกับปาฏิหาริย์นี้)";
            this.sendCommand();
          }, 500);
        } else {
          this.robotStatus.hp = Math.max(1, this.robotStatus.hp - 30);
          setTimeout(() => {
            this.userCommand = "[EVENT_TRIGGER: หุ่นยนต์เดินชนวัตถุลึกลับ มันปล่อยคลื่นแม่เหล็กไฟฟ้าทำลายวงจร ลด HP 30 หน่วย!] (AI: ร้องด้วยความเจ็บปวดและบ่นโวยวาย)";
            this.sendCommand();
          }, 500);
        }
      }
      if (pickedUp) this.playItemPickupSound();

      if (Math.random() > 0.98) {
        const dmg = Math.floor(Math.random() * 4) + 1;
        this.robotStatus.hp = Math.max(0, this.robotStatus.hp - dmg);
      }

      this.updateRadar();
      this.cameraOrbit = `180deg 75deg ${100 + Math.random() * 0.01}%`;
    }
    
    if (Math.random() > 0.8) {
      this.robotStatus.battery = Math.max(0, this.robotStatus.battery - 1);
    }
  }

  // เปิด/ปิด Auto-Pilot ผ่านปุ่ม
  toggleAutoPilot() {
    if (this.isProcessing) return;
    this.userCommand = this.isAutoExploring ? 'หยุด' : 'ออโต้';
    this.sendCommand(); // โยนคำสั่งไปให้ sendCommand จัดการเหมือนกับการพิมพ์
  }

  // เปิด/ปิด Auto-Upgrade
  toggleAutoUpgrade() {
    this.isAutoUpgrade = !this.isAutoUpgrade;
  }

  // เปิด/ปิด Auto-Recharge
  toggleAutoRecharge() {
    this.isAutoRecharge = !this.isAutoRecharge;
  }

  // เช็คและสั่งอัปเกรดอัตโนมัติตามลำดับความสำคัญ
  checkAndExecuteAutoUpgrade() {
    const inv = this.robotStatus.inventory;
    
    const hpScrapCost = 5 + ((this.robotStatus.maxHp - 100) / 20) * 2;
    const hpChipCost = 1 + ((this.robotStatus.maxHp - 100) / 20);

    const batScrapCost = 3 + ((this.robotStatus.maxBattery - 100) / 20) * 2;
    const batOldBatCost = 1 + ((this.robotStatus.maxBattery - 100) / 20);

    const radScrapCost = 4 * this.robotStatus.scavengingLevel;
    const radChipCost = 1 * this.robotStatus.scavengingLevel;

    const motScrapCost = 4 * this.robotStatus.efficiencyLevel;
    const motChipCost = 2 * this.robotStatus.efficiencyLevel;

    if (!this.robotStatus.hasCamera && inv.cameras >= 1 && inv.chips >= 1 && inv.scrap >= 2) {
      this.userCommand = 'อัปเกรดกล้อง';
      this.sendCommand();
    } else if (inv.solarPanels >= 2 && inv.batteries >= 1 && inv.scrap >= 3) {
      this.userCommand = 'อัปเกรดโซลาร์';
      this.sendCommand();
    } else if (inv.scrap >= batScrapCost && inv.batteries >= batOldBatCost) {
      this.userCommand = 'อัปเกรดแบต';
      this.sendCommand();
    } else if (inv.scrap >= hpScrapCost && inv.chips >= hpChipCost) {
      this.userCommand = 'อัปเกรดเกราะ';
      this.sendCommand();
    } else if (inv.scrap >= radScrapCost && inv.chips >= radChipCost) {
      this.userCommand = 'อัปเกรดไลดาร์';
      this.sendCommand();
    } else if (inv.scrap >= motScrapCost && inv.chips >= motChipCost) {
      this.userCommand = 'อัปเกรดมอเตอร์';
      this.sendCommand();
    }
  }

  // ฟังก์ชันหยุดการสำรวจอัตโนมัติ
  stopAutoExplore() {
    if (this.autoExploreInterval) {
      clearInterval(this.autoExploreInterval);
      this.autoExploreInterval = null;
    }
    this.isAutoExploring = false;
  }

  // ================= ระบบ SAVE / LOAD =================
  saveGame() {
    this.resetIdleTimer();
    const saveData = {
      robotStatus: this.robotStatus,
      chatHistory: this.chatHistory,
      aiMemory: this.geminiService.getMemory() // แนบความทรงจำของ AI ไปกับเซฟด้วย
    };
    localStorage.setItem(this.SAVE_KEY, JSON.stringify(saveData));
    
    this.chatHistory.push({ role: 'ai', text: ' บันทึกข้อมูลโปรโตคอลลงใน Local Storage สำเร็จ...' });
    this.speakText('บันทึกข้อมูลระบบเสร็จสิ้น');
    setTimeout(() => this.scrollToBottom(), 50);
  }

  loadGame() {
    this.stopAutoExplore();
    this.isAutoUpgrade = false;
    this.isAutoRecharge = false;
    this.resetIdleTimer();
    const savedDataStr = localStorage.getItem(this.SAVE_KEY);
    if (savedDataStr) {
      const savedData = JSON.parse(savedDataStr);
      this.robotStatus = savedData.robotStatus;
      this.chatHistory = savedData.chatHistory;
      if (savedData.aiMemory) {
        this.geminiService.setMemory(savedData.aiMemory); // ใส่ความจำกลับเข้าไปในสมอง AI
      }
      if (!this.robotStatus.inventory.photos) {
        this.robotStatus.inventory.photos = []; // ป้องกันบัคจากเซฟเก่า
      }
      if (this.robotStatus.solarLevel === undefined) this.robotStatus.solarLevel = 1;
      if (this.robotStatus.hasCamera === undefined) this.robotStatus.hasCamera = true;
      
      this.chatHistory.push({ role: 'ai', text: ' กู้คืนข้อมูลจาก Local Storage สำเร็จ...' });
      this.speakText('กู้คืนระบบเสร็จสิ้น ยินดีต้อนรับกลับเจ้านาย');
      setTimeout(() => this.scrollToBottom(), 50);
    } else {
      this.chatHistory.push({ role: 'ai', text: '[SYSTEM ERROR] ไม่พบไฟล์เซฟในระบบ...' });
    }
  }

  autoLoadGame() {
    const savedDataStr = localStorage.getItem(this.SAVE_KEY);
    if (savedDataStr) {
      const savedData = JSON.parse(savedDataStr);
      this.robotStatus = savedData.robotStatus;
      this.chatHistory = savedData.chatHistory;
      if (savedData.aiMemory) {
        this.geminiService.setMemory(savedData.aiMemory);
      }
      if (!this.robotStatus.inventory.photos) {
        this.robotStatus.inventory.photos = []; // ป้องกันบัคจากเซฟเก่า
      }
      if (this.robotStatus.solarLevel === undefined) this.robotStatus.solarLevel = 1;
      if (this.robotStatus.hasCamera === undefined) this.robotStatus.hasCamera = true;
      this.chatHistory.push({ role: 'ai', text: ' โหลดข้อมูลเซฟอัตโนมัติสำเร็จ...' });
    }
  }

  resetGame() {
    this.stopAutoExplore();
    this.isAutoUpgrade = false;
    this.isAutoRecharge = false;
    this.resetIdleTimer();
    if(confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด? (ข้อมูลที่ยังไม่ได้ Save จะหายไปถาวร)')) {
      localStorage.removeItem(this.SAVE_KEY);
      this.geminiService.clearMemory(); // ล้างความจำของ AI
      location.reload(); // รีเฟรชหน้าต่างเพื่อเริ่มใหม่หมด
    }
  }

  async sendCommand() {
    this.resetIdleTimer();
    if (this.isProcessing || !this.userCommand.trim()) return;

    const fullCmd = this.userCommand;

    // เช็คว่าแบตเตอรี่หมดหรือยัง (เช็คจากคำสั่งรวมก่อน)
    if (this.robotStatus.battery <= 0 && !fullCmd.match(/ชาร์จ|ชาร์ต|แบต|เติม|recharge|charge|ชาร์จไฟ|เติมไฟ/i)) {
      this.stopAutoExplore();
      this.chatHistory.push({ role: 'ai', text: '[SYSTEM CRITICAL] พลังงานของ Home-Pal 01 หมดเกลี้ยง ไม่สามารถตอบสนองต่อคลื่นวิทยุได้...' });
      this.speakText('พลังงานหุ่นยนต์หมด ไม่สามารถรับคำสั่งได้');
      this.userCommand = '';
      setTimeout(() => this.scrollToBottom(), 50);
      this.currentAiFace = this.FACES.warning;
      setTimeout(() => this.currentAiFace = this.FACES.idle, 3000);
      return;
    }

    // เช็คว่าหุ่นพัง (HP หมด) หรือยัง
    if (this.robotStatus.hp <= 0 && !fullCmd.match(/ซ่อม|ปะผุ|ฮีล|repair|รักษา|ฟื้นฟู/i)) {
      this.stopAutoExplore();
      this.chatHistory.push({ role: 'ai', text: '[SYSTEM CRITICAL] โครงสร้าง Home-Pal 01 เสียหายอย่างหนัก กรุณาสั่งซ่อมแซม (Repair) ก่อนสั่งการ...' });
      this.speakText('หุ่นยนต์เสียหายหนัก ไม่สามารถรับคำสั่งได้');
      this.userCommand = '';
      setTimeout(() => this.scrollToBottom(), 50);
      this.currentAiFace = this.FACES.warning;
      setTimeout(() => this.currentAiFace = this.FACES.idle, 3000);
      return;
    }

    this.isProcessing = true;

    // เพิ่มคำสั่งผู้เล่นลงในแชท
    this.chatHistory.push({ role: 'user', text: fullCmd });
    this.userCommand = '';
    setTimeout(() => this.scrollToBottom(), 50);

    // แยกคำสั่งด้วยคำเชื่อม
    const commands = fullCmd.split(/และ|แล้วก็|แล้ว|ต่อด้วย|จากนั้น/i).map(c => c.trim()).filter(c => c);

    let systemEventMsg = '';
    let eventMsg = '';
    let foundItemsMsg = '';
    
    let isSystemAction = false;
    let systemActionTypes: string[] = [];
    let isMoving = false;
    let hitObstacle = false; // ตัวแปรเช็คการชนกำแพง

    for (const cmd of commands) {
      // ระบบชาร์จแบตเตอรี่ฉุกเฉิน
      if (cmd.match(/ชาร์จ|ชาร์ต|แบตเต็ม|เติมพลัง|recharge|charge|ชาร์จไฟ|เติมไฟ|เติมแบต/i) && !cmd.match(/อัปเกรด|อัพเกรด|อัพ|อัป|ติดตั้ง|เพิ่ม|ใส่|ประกอบ/i)) {
        this.robotStatus.battery = this.robotStatus.maxBattery;
        systemEventMsg += `[ชาร์จพลังงานสำเร็จ: Battery 100%] `;
        isSystemAction = true;
        systemActionTypes.push('recharge');
      }

      // ระบบซ่อมแซมหุ่นยนต์
      if (cmd.match(/ซ่อม|ปะผุ|ฮีล|repair|รักษา|ฟื้นฟู/i)) {
        const costScrap = 2;
        if (this.robotStatus.inventory.scrap >= costScrap) {
          if (this.robotStatus.hp < this.robotStatus.maxHp) {
            this.robotStatus.inventory.scrap -= costScrap;
            this.robotStatus.hp = Math.min(this.robotStatus.maxHp, this.robotStatus.hp + 30);
            systemEventMsg += `[ซ่อมแซมสำเร็จ: ฟื้นฟู 30 HP (HP: ${this.robotStatus.hp}/${this.robotStatus.maxHp}) เสีย Scrap ${costScrap}] `;
          } else {
            systemEventMsg += `[ซ่อมแซมล้มเหลว: โครงสร้างสมบูรณ์อยู่แล้ว ไม่จำเป็นต้องซ่อม] `;
          }
        } else {
          systemEventMsg += `[ซ่อมแซมล้มเหลว: ขาดทรัพยากร (ต้องการ Scrap ${costScrap})] `;
        }
        isSystemAction = true;
        systemActionTypes.push('repair');
      }

      // ระบบเคลื่อนที่ (Navigation)
      let moveX = 0;
      let moveY = 0;
      let dirName = '';
      let targetRotation = this.targetMapRotation; // อ้างอิงเป้าหมายหมุนล่าสุด เพื่อความแม่นยำ
      let isJustRotating = false;

      // แยกระหว่างการ "หมุนอย่างเดียว" กับการ "เลี้ยวพร้อมเดิน"
      if (cmd.match(/หมุนซ้าย|หันซ้าย/i)) { targetRotation += 90; dirName = 'ซ้าย'; isJustRotating = true; }
      else if (cmd.match(/หมุนขวา|หันขวา/i)) { targetRotation -= 90; dirName = 'ขวา'; isJustRotating = true; }
      else if (cmd.match(/เดินซ้าย|เลี้ยวซ้าย|ไปทางซ้าย|ซ้าย|left/i) && !cmd.match(/หมุน|หัน/i)) { 
        targetRotation += 90; 
        moveX = 15 * -Math.sin(targetRotation * Math.PI / 180);
        moveY = 15 * Math.cos(targetRotation * Math.PI / 180);
        dirName = 'ซ้าย'; 
      }
      else if (cmd.match(/เดินขวา|เลี้ยวขวา|ไปทางขวา|ขวา|right/i) && !cmd.match(/หมุน|หัน/i)) { 
        targetRotation -= 90; 
        moveX = 15 * -Math.sin(targetRotation * Math.PI / 180);
        moveY = 15 * Math.cos(targetRotation * Math.PI / 180);
        dirName = 'ขวา'; 
      }
      else if (cmd.match(/เดินหน้า|ตรงไป|ข้างหน้า|หน้า|forward/i)) { 
        moveX = 15 * -Math.sin(targetRotation * Math.PI / 180);
        moveY = 15 * Math.cos(targetRotation * Math.PI / 180);
        dirName = 'ข้างหน้า';
      }
      else if (cmd.match(/ถอยหลัง|ถอย|ข้างหลัง|หลัง|backward/i)) { 
        moveX = -15 * -Math.sin(targetRotation * Math.PI / 180);
        moveY = -15 * Math.cos(targetRotation * Math.PI / 180);
        dirName = 'ข้างหลัง';
      }
      else if (cmd.match(/เหนือ|บน|north|up|ขึ้น/i)) { moveY = 15; dirName = 'ทิศเหนือ'; targetRotation = 0; }
      else if (cmd.match(/ใต้|ล่าง|south|down|ลง/i)) { moveY = -15; dirName = 'ทิศใต้'; targetRotation = 180; }
      else if (cmd.match(/ตะวันออก|east/i) && !cmd.match(/หมุน|หัน|เลี้ยว/i)) { moveX = 15; dirName = 'ทิศตะวันออก'; targetRotation = -90; }
      else if (cmd.match(/ตะวันตก|west/i) && !cmd.match(/หมุน|หัน|เลี้ยว/i)) { moveX = -15; dirName = 'ทิศตะวันตก'; targetRotation = 90; }
      else if (cmd.match(/เดิน|เคลื่อนที่|มุ่งหน้า|สำรวจ|move|walk|ไป|ขยับ/i)) {
        moveX = (Math.random() - 0.5) * 30; moveY = (Math.random() - 0.5) * 30; dirName = 'พิกัดสุ่ม';
        targetRotation = Math.floor(Math.random() * 360);
      }

      if ((moveX !== 0 || moveY !== 0 || isJustRotating) && !cmd.match(/อัปเกรด|สร้าง/i)) {
        isMoving = true;
        if (isJustRotating) {
          this.targetMapRotation = targetRotation;
          systemEventMsg += `[หมุนระบบขับเคลื่อน: หันไปทาง${dirName}] `;
          this.cameraOrbit = `180deg 75deg ${100 + Math.random() * 0.01}%`;
        } else if (!hitObstacle) { // หยุดเดินถ้าคำสั่งก่อนหน้าเดินชนกำแพงไปแล้ว
          let speedMultiplier = 1 + (this.robotStatus.efficiencyLevel * 0.2); // มอเตอร์ยิ่งดี ยิ่งเดินได้ไกล
          
          // เช็คว่าปัจจุบันยืนอยู่ในแอ่งน้ำหรือไม่ ถ้าอยู่ จะเดินช้าลง
          const currentEnv = this.checkEnvironmentCollision(this.targetWorldX, this.targetWorldY);
          const inShallowWater = currentEnv && currentEnv.type === 'shallow_water';
          
          if (inShallowWater) {
             speedMultiplier *= 0.4; // เดินช้าลงเหลือ 40%
             systemEventMsg += `[ระบบขับเคลื่อนทำงานหนัก: กำลังลุยผ่านแอ่งน้ำขัง] `;
          }

          let targetX = this.targetWorldX + moveX * speedMultiplier; // อ้างอิงจากเป้าหมายล่าสุด
          let targetY = this.targetWorldY + moveY * speedMultiplier;
          let targetZ = this.getFloorZ(targetX, targetY); // คำนวณความสูงเป้าหมาย

          // ระบบตรวจจับการชน (Collision Detection) กับกำแพง/เมืองขยะ
          const collisionRadius = 20; 
          const obstacle = this.worldObjects.find(obj => obj.type === 'obstacle' && Math.sqrt(Math.pow(obj.x - targetX, 2) + Math.pow(obj.y - targetY, 2)) < collisionRadius);

          const envHit = this.checkEnvironmentCollision(targetX, targetY);
          let isBlockingEnv = envHit && envHit.type !== 'shallow_water';

          // [เพิ่ม] ระบบตรวจสอบการกระโดดข้ามท่อนไม้ 1 ท่อน
          let jumpedLog = false;
          if (isBlockingEnv && envHit.type === 'log') {
            // ตรวจสอบพิกัดถัดไปด้านหลังท่อนไม้ว่าว่างหรือไม่ (จำลองการกระโดด)
            const jumpX = this.targetWorldX + moveX * speedMultiplier * 1.8;
            const jumpY = this.targetWorldY + moveY * speedMultiplier * 1.8;
            const jumpEnvHit = this.checkEnvironmentCollision(jumpX, jumpY);
            const jumpObstacle = this.worldObjects.find(obj => obj.type === 'obstacle' && Math.sqrt(Math.pow(obj.x - jumpX, 2) + Math.pow(obj.y - jumpY, 2)) < collisionRadius);
            
            if (!jumpEnvHit && !jumpObstacle) {
              targetX = jumpX;
              targetY = jumpY;
              isBlockingEnv = false; // ข้ามได้ ไม่ถูกบล็อคทางแล้ว
              jumpedLog = true;
            }
          }

          if (obstacle || isBlockingEnv) {
            hitObstacle = true;
            const isDeepWater = envHit && envHit.type === 'deep_water';
            const dmg = isDeepWater ? Math.floor(Math.random() * 10) + 10 : Math.floor(Math.random() * 5) + 3; // แม่น้ำลึกลดเยอะ 10-19 / กำแพงลด 3-7
            this.robotStatus.hp = Math.max(0, this.robotStatus.hp - dmg);
            
            if (isDeepWater) {
              eventMsg += `ล้อลื่นไถลลงแม่น้ำลึก! วงจรช็อต เลือดลดไป ${dmg} หน่วย `;
              systemEventMsg += `[เคลื่อนที่ล้มเหลว: ตรวจพบความชื้นสูง (จมน้ำ) ที่พิกัด X:${targetX.toFixed(2)} Y:${targetY.toFixed(2)}] `;
            } else {
              eventMsg += `เดินชนสิ่งกีดขวาง (กำแพง/ท่อนไม้) อย่างจัง! เลือดลดไป ${dmg} หน่วย `;
              systemEventMsg += `[เคลื่อนที่ล้มเหลว: ติดสิ่งกีดขวางที่พิกัด X:${targetX.toFixed(2)} Y:${targetY.toFixed(2)}] `;
            }
          } else {
            this.targetWorldX = targetX;
            this.targetWorldY = targetY;
            this.targetWorldZ = targetZ;
            
            if (jumpedLog) {
               this.currentZ += 15; // เด้งตัวหุ่นขึ้นทันที (สร้างเอฟเฟกต์การกระโดดใน 3D สมจริง)
               systemEventMsg += `[ระบบไฮดรอลิกทำงาน: กระโดดข้ามท่อนไม้สำเร็จ] `;
               this.robotStatus.battery = Math.max(0, this.robotStatus.battery - 2); // ใช้พลังงานแบตเตอรี่เพิ่มขึ้นนิดหน่อย
            }

            // คำนวณหาทิศทางการหมุนที่สั้นที่สุด (แก้บัคแผนที่หมุนกลับด้าน 270 องศา)
            let diff = (targetRotation - this.targetMapRotation) % 360;
            if (diff > 180) diff -= 360;
            else if (diff < -180) diff += 360;
            this.targetMapRotation += diff;

            // ระบบลบวัตถุออกจากเรดาร์เมื่อหุ่นยนต์เดินไปทับ/ใกล้ๆ
            const pickupRadius = 40; // ขยายรัศมีเก็บของเป็น 40 เพื่อให้กวาดทั้งกองรวดเดียว ไม่ต้องเดินย่ำซ้ำๆ
            
            // ตัวแปรแยกเก็บของแต่ละชนิด
            let lootCounts: any = { scrap: 0, chip: 0, camera: 0, solarPanel: 0, batteryItem: 0, phone: 0, anomaly: 0 };

            this.worldObjects = this.worldObjects.filter(obj => {
              if (obj.type === 'obstacle') return true; // สิ่งกีดขวางไม่หายไป
              const dx = obj.x - targetX; // คำนวณจากเป้าหมายปลายทาง
              const dy = obj.y - targetY;
              const isPickedUp = Math.sqrt(dx * dx + dy * dy) <= pickupRadius;
              
              if (isPickedUp) {
                if (lootCounts[obj.type] !== undefined) lootCounts[obj.type]++;
                else lootCounts.scrap++;
                return false; // ลบออกจากโลก
              }
              return true; // เก็บไว้
            });

            // สุ่มเก็บของตามจุดสัญญาณบนแผนที่จริง
            if (lootCounts.scrap > 0) {
              const amount = lootCounts.scrap * (Math.floor(Math.random() * 2) + 1);
              this.robotStatus.inventory.scrap += amount;
              foundItemsMsg += `เศษเหล็ก(Scrap) ${amount} ชิ้น `;
            }
            if (lootCounts.chip > 0) {
              this.robotStatus.inventory.chips += lootCounts.chip;
              foundItemsMsg += `ชิปวงจร(Chips) ${lootCounts.chip} ชิ้น `;
            }
            if (lootCounts.camera > 0) {
              this.robotStatus.inventory.cameras += lootCounts.camera;
              foundItemsMsg += `เลนส์กล้อง(Camera) ${lootCounts.camera} ชิ้น `;
            }
            if (lootCounts.solarPanel > 0) {
              this.robotStatus.inventory.solarPanels += lootCounts.solarPanel;
              foundItemsMsg += `แผงโซลาร์(Solar Panel) ${lootCounts.solarPanel} ชิ้น `;
            }
            if (lootCounts.batteryItem > 0) {
              this.robotStatus.inventory.batteries += lootCounts.batteryItem;
              foundItemsMsg += `เซลล์แบตเก่า(Battery) ${lootCounts.batteryItem} ชิ้น `;
            }
            if (lootCounts.phone > 0) {
              this.robotStatus.inventory.phones += lootCounts.phone;
              foundItemsMsg += `ขยะมือถือ(Phone) ${lootCounts.phone} ชิ้น `;
            }

            // ระบบเสื่อมสภาพจากการใช้งาน (Wear and Tear)
        if (Math.random() > 0.98) { // ลดโอกาสเกิดเหลือ 2% เพื่อให้เกมสนุกและสมูตขึ้น
              const dmg = Math.floor(Math.random() * 4) + 1; // 1-4 damage
              this.robotStatus.hp = Math.max(0, this.robotStatus.hp - dmg);
              eventMsg += `ล้อติดในกองขยะจนมอเตอร์ร้อน! เลือดลดไป ${dmg} หน่วย `;
            }

            this.updateRadar(); // รีเฟรชจุด LIDAR ใหม่เมื่อเปลี่ยนพื้นที่
            systemEventMsg += `[เคลื่อนที่สำเร็จ: พิกัดเป้าหมาย X:${targetX.toFixed(2)} Y:${targetY.toFixed(2)} (มุ่งหน้า${dirName})] `;
            
            // รีเซ็ตมุมกล้องมาด้านหลังหุ่นเพื่อให้หันตรงกับทิศของแผนที่
            this.cameraOrbit = `180deg 75deg ${100 + Math.random() * 0.01}%`;
          }
        }
      }

      // ระบบคราฟต์เป้าหมายหลัก (จบเกม)
      if (cmd.match(/ฟอกอากาศ|purifier|สร้างเครื่องฟอก|ประกอบเครื่องฟอก|กอบกู้โลก/i)) {
        const costScrap = 20;
        const costChips = 5;
        if (!this.robotStatus.isPurifierCrafted) {
          if (this.robotStatus.inventory.scrap >= costScrap && this.robotStatus.inventory.chips >= costChips) {
            this.robotStatus.inventory.scrap -= costScrap;
            this.robotStatus.inventory.chips -= costChips;
            this.robotStatus.isPurifierCrafted = true;
            
            const victoryMsg = '[SYSTEM OVERRIDE] "Atmospheric Purifier" ประกอบเสร็จสมบูรณ์! เครื่องฟอกอากาศเริ่มทำงาน... ท้องฟ้าเปิดออก แสงอาทิตย์สาดส่องลงมาที่กองขยะ ภารกิจ PROJECT: RE-CODE สำเร็จลุล่วง!';
            this.chatHistory.push({ role: 'ai', text: victoryMsg });
            this.speakText('เครื่องฟอกอากาศทำงานสำเร็จ ขอแสดงความยินดี ภารกิจกอบกู้โลกสำเร็จแล้ว');
            setTimeout(() => this.scrollToBottom(), 50);

            this.currentAiFace = this.FACES.happy;
            this.triggerEndgameAI();
            return; // จบการทำงานฟังก์ชันนี้เลย เพื่อให้ triggerEndgameAI จัดการต่อ
          } else {
            systemEventMsg += `[สร้างเครื่องฟอกอากาศล้มเหลว: ขาดทรัพยากร (ต้องการ Scrap ${costScrap}, Chips ${costChips})] `;
          }
        }
      }

      // ระบบอัปเกรดผ่านคำสั่งเสียง/ข้อความ
      if (cmd.match(/อัปเกรด|อัพเกรด|upgrade|ติดตั้ง|เพิ่ม|อัพ|อัป|ใส่|ประกอบ/i)) {
        isSystemAction = true;
        systemActionTypes.push('upgrade');
        if (cmd.match(/เลือด|เกราะ|hp|armor|พลังชีวิต|ป้องกัน/i)) {
           const costScrap = 5 + ((this.robotStatus.maxHp - 100) / 20) * 2;
           const costChips = 1 + ((this.robotStatus.maxHp - 100) / 20);
           if (this.robotStatus.inventory.scrap >= costScrap && this.robotStatus.inventory.chips >= costChips) {
              this.robotStatus.inventory.scrap -= costScrap;
              this.robotStatus.inventory.chips -= costChips;
              this.robotStatus.maxHp += 20;
              this.robotStatus.hp = this.robotStatus.maxHp;
              systemEventMsg += `[อัปเกรดสำเร็จ: เกราะทนทานขึ้น (Max HP: ${this.robotStatus.maxHp}) เสีย Scrap ${costScrap}, Chips ${costChips}] `;
           } else {
              systemEventMsg += `[อัปเกรดล้มเหลว: ขาดทรัพยากร (ต้องการ Scrap ${costScrap}, Chips ${costChips})] `;
           }
        } else if (cmd.match(/แบต|พลังงาน|battery|ความจุ/i)) {
           const costScrap = 3 + ((this.robotStatus.maxBattery - 100) / 20) * 2;
           const costBatteries = 1 + ((this.robotStatus.maxBattery - 100) / 20);
           if (this.robotStatus.inventory.scrap >= costScrap && this.robotStatus.inventory.batteries >= costBatteries) {
              this.robotStatus.inventory.scrap -= costScrap;
              this.robotStatus.inventory.batteries -= costBatteries;
              this.robotStatus.maxBattery += 20;
              this.robotStatus.battery = this.robotStatus.maxBattery;
              systemEventMsg += `[อัปเกรดสำเร็จ: แบตเตอรี่จุขึ้น (Max Battery: ${this.robotStatus.maxBattery}) เสีย Scrap ${costScrap}, Old Bat ${costBatteries}] `;
           } else {
              systemEventMsg += `[อัปเกรดล้มเหลว: ขาดทรัพยากร (ต้องการ Scrap ${costScrap}, Old Bat ${costBatteries})] `;
           }
        } else if (cmd.match(/หาของ|ค้นหา|เรดาร์|scavenge|radar|สแกน|แสกน|เรด้า|ไลดาร์|lidar/i)) {
           const costScrap = 4 * this.robotStatus.scavengingLevel;
           const costChips = 1 * this.robotStatus.scavengingLevel;
           if (this.robotStatus.inventory.scrap >= costScrap && this.robotStatus.inventory.chips >= costChips) {
              this.robotStatus.inventory.scrap -= costScrap;
              this.robotStatus.inventory.chips -= costChips;
              this.robotStatus.scavengingLevel += 1;
              systemEventMsg += `[อัปเกรดสำเร็จ: เซนเซอร์ LIDAR (Level: ${this.robotStatus.scavengingLevel}) เสีย Scrap ${costScrap}, Chips ${costChips}] `;
           } else {
              systemEventMsg += `[อัปเกรดล้มเหลว: ขาดทรัพยากร (ต้องการ Scrap ${costScrap}, Chips ${costChips})] `;
           }
        } else if (cmd.match(/ประหยัด|มอเตอร์|เดิน|efficiency|เครื่องยนต์|ขา/i)) {
           const costScrap = 4 * this.robotStatus.efficiencyLevel;
           const costChips = 2 * this.robotStatus.efficiencyLevel;
           if (this.robotStatus.inventory.scrap >= costScrap && this.robotStatus.inventory.chips >= costChips) {
              this.robotStatus.inventory.scrap -= costScrap;
              this.robotStatus.inventory.chips -= costChips;
              this.robotStatus.efficiencyLevel += 1;
              systemEventMsg += `[อัปเกรดสำเร็จ: มอเตอร์ประหยัดพลังงาน (Level: ${this.robotStatus.efficiencyLevel}) เสีย Scrap ${costScrap}, Chips ${costChips}] `;
           } else {
              systemEventMsg += `[อัปเกรดล้มเหลว: ขาดทรัพยากร (ต้องการ Scrap ${costScrap}, Chips ${costChips})] `;
           }
        } else if (cmd.match(/กล้อง|camera|เลนส์|ตา/i)) {
           if (!this.robotStatus.hasCamera) {
             if (this.robotStatus.inventory.cameras >= 1 && this.robotStatus.inventory.chips >= 1 && this.robotStatus.inventory.scrap >= 2) {
                this.robotStatus.inventory.cameras -= 1;
                this.robotStatus.inventory.chips -= 1;
                this.robotStatus.inventory.scrap -= 2;
                this.robotStatus.hasCamera = true;
                systemEventMsg += `[อัปเกรดสำเร็จ: ติดตั้งเลนส์กล้องใหม่ (สามารถสั่ง "ถ่ายรูป" ได้ 1 ครั้ง) เสีย Camera 1, Chips 1, Scrap 2] `;
             } else {
                systemEventMsg += `[อัปเกรดล้มเหลว: ขาดทรัพยากร (ต้องการ Camera 1, Chips 1, Scrap 2)] `;
             }
           } else { systemEventMsg += `[ระบบแจ้งเตือน: กล้องยังใช้งานได้ปกติ ไม่จำเป็นต้องเปลี่ยนใหม่] `; }
        } else if (cmd.match(/โซล่า|โซลาร์|solar|แสงอาทิตย์/i)) {
           if (this.robotStatus.inventory.solarPanels >= 2 && this.robotStatus.inventory.batteries >= 1 && this.robotStatus.inventory.scrap >= 3) {
              this.robotStatus.inventory.solarPanels -= 2;
              this.robotStatus.inventory.batteries -= 1;
              this.robotStatus.inventory.scrap -= 3;
              this.robotStatus.solarLevel += 1;
              systemEventMsg += `[อัปเกรดสำเร็จ: แผงโซลาร์เซลล์ (Level: ${this.robotStatus.solarLevel}) ชาร์จไฟเร็วขึ้น เสีย Solar 2, Battery 1, Scrap 3] `;
           } else {
              systemEventMsg += `[อัปเกรดล้มเหลว: ขาดทรัพยากร (ต้องการ Solar Panel 2, Battery 1, Scrap 3)] `;
           }
        } else {
           systemEventMsg += `[ระบบแจ้งเตือน: ไม่สามารถระบุเป้าหมายอัปเกรดได้ (AI ควรถามเจ้านายว่าจะให้อัปเกรด เกราะ, แบตเตอรี่, เรดาร์ หรือ มอเตอร์?)] `;
        }
      }

      // ระบบคำสั่งพิเศษ: ถ่ายรูป
      if (cmd.match(/ถ่ายรูป|ถ่ายภาพ|take photo|picture|แชะ|แคปภาพ|แคปจอ/i) && !cmd.match(/อัปเกรด|อัพเกรด|อัพ|อัป|ติดตั้ง|เพิ่ม|ใส่|ประกอบ/i)) {
        isSystemAction = true;
        systemActionTypes.push('photo');
        if (this.robotStatus.hasCamera) {
          const randomSceneObj = this.SCENERY_DB[Math.floor(Math.random() * this.SCENERY_DB.length)];
          
          // เมื่อถ่ายรูปเสร็จแล้วให้กล้องเสียทันที (ใช้ได้ 1 ครั้ง)
          this.robotStatus.hasCamera = false;
          
          systemEventMsg += `[ประมวลผลภาพถ่ายสำเร็จ: ภูมิทัศน์บริเวณนี้เต็มไปด้วย ${randomSceneObj.text}] [SYSTEM WARNING: เลนส์กล้องทำงานหนักจนวงจรไหม้ พังเสียหายถาวร!] `;
          
          if (!this.robotStatus.inventory.photos) this.robotStatus.inventory.photos = [];
          this.robotStatus.inventory.photos.push(randomSceneObj.text);
          this.currentPhotoScene = randomSceneObj.text;
          this.currentPhotoAscii = randomSceneObj.ascii;
          this.isShowingPhoto = true;
          // ปิดภาพจำลองอัตโนมัติหลังจาก 8 วินาที
          setTimeout(() => this.isShowingPhoto = false, 8000);
        } else {
          systemEventMsg += `[ข้อผิดพลาด: หุ่นยนต์ไม่มีโมดูลกล้อง (Camera Module) กล้องตัวเก่าพังไปแล้ว] `;
        }
      }

      // ระบบคำสั่งพิเศษ: ดูรูปถ่าย
      if (cmd.match(/ดูรูป|ดูภาพ|ดูรูปถ่าย|เปิดรูป|view photo|เปิดภาพ|ขอดู|โชว์รูป|แสดงรูป|แสดงภาพ/i)) {
        isSystemAction = true;
        systemActionTypes.push('view_photo');
        if (this.robotStatus.inventory.photos && this.robotStatus.inventory.photos.length > 0) {
          this.currentPhotoScene = this.robotStatus.inventory.photos[this.robotStatus.inventory.photos.length - 1];
          const match = this.SCENERY_DB.find(s => s.text === this.currentPhotoScene);
          this.currentPhotoAscii = match ? match.ascii : '';
          systemEventMsg += `[เปิดดูรูปถ่าย: แสดงภาพล่าสุด] `;
          this.isShowingPhoto = true;
          setTimeout(() => this.isShowingPhoto = false, 8000);
        } else {
          systemEventMsg += `[ข้อผิดพลาด: ไม่พบรูปถ่ายในคลังข้อมูล] `;
        }
      }

      // ระบบสำรวจอัตโนมัติ (Auto-Pilot)
      if (cmd.match(/เดินหาของเอง|หาของเอง|สำรวจอัตโนมัติ|ออโต้|auto|auto explore|auto scavenge/i) && !cmd.match(/หยุด|stop|ยกเลิก/i)) {
        if (!this.isAutoExploring) {
          this.isAutoExploring = true;
          systemEventMsg += `[ระบบแจ้งเตือน: เปิดใช้งานโหมดสำรวจอัตโนมัติ หุ่นยนต์จะสแกนหาไอเทมและเดินหลบสิ่งกีดขวางเอง จนกว่าจะสั่ง "หยุด"] `;
          isSystemAction = true;
          systemActionTypes.push('start_auto');
          
          this.autoExploreInterval = setInterval(() => {
            if (!this.isProcessing && this.robotStatus.battery > 0 && this.robotStatus.hp > 0 && this.isAutoExploring) {
              
              // 1. ค้นหาไอเทมที่ใกล้ที่สุดในระยะ LIDAR
              const scanRadius = 150 + (this.robotStatus.scavengingLevel * 20);
              let nearestItem: any = null;
              let minDistance = Infinity;

              for (const obj of this.worldObjects) {
                if (obj.type !== 'obstacle') {
                  const dx = obj.x - this.currentX;
                  const dy = obj.y - this.currentY;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  if (dist <= scanRadius && dist < minDistance) {
                    minDistance = dist;
                    nearestItem = obj;
                  }
                }
              }

              let commandToRun = 'เดิน'; // ค่าเริ่มต้น: เดินสุ่ม
              const speedMultiplier = 1 + (this.robotStatus.efficiencyLevel * 0.2);

              if (nearestItem) {
                // 2. คำนวณหาทิศทางที่จะไปหาไอเทม
                const dx = nearestItem.x - this.currentX;
                const dy = nearestItem.y - this.currentY;
                const possibleDirs = [];

                if (Math.abs(dx) > Math.abs(dy)) {
                  possibleDirs.push(dx > 0 ? 'ตะวันออก' : 'ตะวันตก');
                  possibleDirs.push(dy > 0 ? 'เหนือ' : 'ใต้');
                } else {
                  possibleDirs.push(dy > 0 ? 'เหนือ' : 'ใต้');
                  possibleDirs.push(dx > 0 ? 'ตะวันออก' : 'ตะวันตก');
                }
                
                // เพิ่มทิศทางที่เหลือเผื่อหนีทางตัน
                const allDirs = ['เหนือ', 'ใต้', 'ตะวันออก', 'ตะวันตก'];
                for(let d of allDirs) {
                  if(!possibleDirs.includes(d)) possibleDirs.push(d);
                }

                // 3. ลองเดินทีละทิศ ถ้าชนกำแพงให้เปลี่ยนทิศ
                for (const dir of possibleDirs) {
                  let testX = this.currentX;
                  let testY = this.currentY;
                  if (dir === 'เหนือ') testY += 15 * speedMultiplier;
                  else if (dir === 'ใต้') testY -= 15 * speedMultiplier;
                  else if (dir === 'ตะวันออก') testX += 15 * speedMultiplier;
                  else if (dir === 'ตะวันตก') testX -= 15 * speedMultiplier;

                  const collisionRadius = 20; 
                  const envHitTest = this.checkEnvironmentCollision(testX, testY);
                  let willHit = this.worldObjects.some(obj => obj.type === 'obstacle' && Math.sqrt(Math.pow(obj.x - testX, 2) + Math.pow(obj.y - testY, 2)) < collisionRadius) || (envHitTest !== undefined && envHitTest.type !== 'shallow_water');
                  
                  // ให้ Auto-Pilot กระโดดข้ามท่อนไม้ได้ด้วย
                  if (willHit && envHitTest && envHitTest.type === 'log') {
                    const jumpTestX = this.currentX + (testX - this.currentX) * 1.8;
                    const jumpTestY = this.currentY + (testY - this.currentY) * 1.8;
                    const jumpEnvHit = this.checkEnvironmentCollision(jumpTestX, jumpTestY);
                    const jumpObsHit = this.worldObjects.some(obj => obj.type === 'obstacle' && Math.sqrt(Math.pow(obj.x - jumpTestX, 2) + Math.pow(obj.y - jumpTestY, 2)) < collisionRadius);
                    if (!jumpEnvHit && !jumpObsHit) willHit = false; // ข้ามได้ ถือว่าทางสะดวก
                  }

                  if (!willHit) {
                    commandToRun = dir;
                    break;
                  }
                }
              } else {
                // ถ้าไม่มีไอเทมใกล้ๆ ให้เดินสุ่มแต่พยายามหลบกำแพง
                const allDirs = ['เหนือ', 'ใต้', 'ตะวันออก', 'ตะวันตก'].sort(() => Math.random() - 0.5);
                for (const dir of allDirs) {
                  let testX = this.currentX;
                  let testY = this.currentY;
                  if (dir === 'เหนือ') testY += 15 * speedMultiplier;
                  else if (dir === 'ใต้') testY -= 15 * speedMultiplier;
                  else if (dir === 'ตะวันออก') testX += 15 * speedMultiplier;
                  else if (dir === 'ตะวันตก') testX -= 15 * speedMultiplier;

                  const collisionRadius = 20; 
                  const envHitTest = this.checkEnvironmentCollision(testX, testY);
                  let willHit = this.worldObjects.some(obj => obj.type === 'obstacle' && Math.sqrt(Math.pow(obj.x - testX, 2) + Math.pow(obj.y - testY, 2)) < collisionRadius) || (envHitTest !== undefined && envHitTest.type !== 'shallow_water');
                  
                  // ให้ Auto-Pilot กระโดดข้ามท่อนไม้ได้ด้วย
                  if (willHit && envHitTest && envHitTest.type === 'log') {
                    const jumpTestX = this.currentX + (testX - this.currentX) * 1.8;
                    const jumpTestY = this.currentY + (testY - this.currentY) * 1.8;
                    const jumpEnvHit = this.checkEnvironmentCollision(jumpTestX, jumpTestY);
                    const jumpObsHit = this.worldObjects.some(obj => obj.type === 'obstacle' && Math.sqrt(Math.pow(obj.x - jumpTestX, 2) + Math.pow(obj.y - jumpTestY, 2)) < collisionRadius);
                    if (!jumpEnvHit && !jumpObsHit) willHit = false; // ข้ามได้ ถือว่าทางสะดวก
                  }

                  if (!willHit) {
                    commandToRun = dir;
                    break;
                  }
                }
              }

              this.userCommand = commandToRun;
              this.sendCommand();
            } else if (this.robotStatus.battery <= 0 || this.robotStatus.hp <= 0) {
              this.stopAutoExplore();
            }
          }, 3000); // เดินทุกๆ 3 วินาที
        }
      }

      // หยุดสำรวจอัตโนมัติ
      if (cmd.match(/หยุด|stop|ยกเลิก|พอแค่นี้/i) && !cmd.match(/อัปเกรด/i)) {
        if (this.isAutoExploring) {
          this.stopAutoExplore();
          systemEventMsg += `[ระบบแจ้งเตือน: ยกเลิกโหมดสำรวจอัตโนมัติ] `;
          isSystemAction = true;
          systemActionTypes.push('stop_auto');
        }
      }

      // หักค่าแบตเตอรี่แบบสุ่มต่อ 1 คำสั่งย่อย (ลดการกินแบตเตอรี่ลงอย่างมาก)
      if (Math.random() > 0.8) {
        this.robotStatus.battery = Math.max(0, this.robotStatus.battery - 1);
      }
    }

    // แนบ Event ท้ายคำสั่ง เพื่อให้ GHOST-OS รับรู้สิ่งที่เกิดขึ้นระหว่างทางและนำไปตีความตอบกลับเอง
    let systemLog = (foundItemsMsg || eventMsg || systemEventMsg) ? `\n[EVENT_TRIGGER: เหตุการณ์ล่าสุด: ${systemEventMsg}${foundItemsMsg}${eventMsg}]` : '';
    const enrichedCmd = fullCmd + systemLog;

    const isMovementCommand = isMoving && !isSystemAction && !fullCmd.match(/สร้าง|คุย|เล่า/i);

    if (isMovementCommand && !hitObstacle && !eventMsg && !foundItemsMsg) {
      // ลบคำสั่งเดินของผู้เล่นที่เพิ่งบันทึกไปในแชทออก เพื่อไม่ให้รกจอเวลาเดินหาสิ่งของ
      this.chatHistory.pop();
      this.isProcessing = false;
      return; 
    }

    this.chatHistory.push({ role: 'ai', text: ' กำลังส่งคำสั่งผ่านคลื่นวิทยุ...' });
    setTimeout(() => this.scrollToBottom(), 50);
    this.currentAiFace = this.FACES.thinking;
    this.startTransmissionSound();
    
    let response = '';

    if (isMovementCommand) {
      // เปลี่ยนการแจ้งเตือนตอนเดินหาของให้เป็น Log ระบบสั้นๆ แทนการบ่นยาวๆ
      if (hitObstacle) response += `[SYSTEM] หุ่นยนต์เดินชนสิ่งกีดขวาง! `;
      if (eventMsg) response += `[SYSTEM ALARM] ${eventMsg.trim()} `;
      if (foundItemsMsg) response += `เก็บ: ${foundItemsMsg.trim()} `;
    } else if (isSystemAction) {
      await new Promise(resolve => setTimeout(resolve, 400)); // ลดเวลาหน่วงลงเพื่อให้คำสั่งตอบสนองไวขึ้น
      
      // รวม Event การเดิน (ถ้าบังเอิญมี) เข้าไปด้วย
      if (hitObstacle) response += ` หุ่นยนต์เดินชนสิ่งกีดขวาง! `;
      if (eventMsg) response += `[SYSTEM ALARM] ${eventMsg.trim()} `;
      if (foundItemsMsg) response += `เก็บ: ${foundItemsMsg.trim()} `;

      if (systemEventMsg.includes('ล้มเหลว') || systemEventMsg.includes('ข้อผิดพลาด')) {
         let failResponses = [
           "ระบบฟ้องว่า Error ครับ... นี่ผมต้องสอนเจ้านายดูหน้าจอด้วยเหรอเนี่ย"
         ];
         
         if (systemEventMsg.includes('ขาดทรัพยากร')) {
           failResponses = [
             "ให้ตายเถอะเจ้านาย ทรัพยากรเราไม่พอครับ!",
             "ทำไม่ได้ครับเจ้านาย เช็กของในคลังก่อนสั่งสิครับ!",
             "ไม่มีของจะให้ทำยังไงล่ะครับเจ้านาย ไปหาของมาก่อน!"
           ];
         } else if (systemEventMsg.includes('สมบูรณ์อยู่แล้ว')) {
           failResponses = [
             "โครงสร้างผมยังดีอยู่ครับ จะให้ซ่อมอะไรอีกล่ะ!",
             "ผมยังไม่พังครับเจ้านาย เก็บเศษเหล็กไว้ใช้ทำอย่างอื่นเถอะ",
             "ไม่ต้องซ่อมแล้วครับ สภาพผมตอนนี้แจ่มสุดๆ... มั้งนะ"
           ];
         } else if (systemActionTypes.includes('photo')) {
           failResponses = [
             "จะให้ผมใช้ตาที่ไหนถ่ายครับเจ้านาย กล้องตัวเก่ามันระเบิดไปแล้ว!",
             "ระบบฟ้องว่าไม่มีกล้องครับเจ้านาย ต้องไปหาเลนส์ตามกองขยะมาติดใหม่!",
             "ให้ตายเถอะ สั่งถ่ายรูปทั้งๆ ที่กล้องพังไปแล้วเนี่ยนะ?"
           ];
         } else if (systemActionTypes.includes('view_photo')) {
           failResponses = [
             "ยังไม่เคยถ่ายรูปเลยครับเจ้านาย!",
             "ไม่มีรูปในคลังเลยครับ จะให้ผมเสกขึ้นมาเหรอ?",
             "เมมโมรี่ว่างเปล่าครับเจ้านาย ลองสั่งถ่ายรูปก่อนสิครับ"
           ];
         }
         response += `${systemEventMsg.trim()} ${failResponses[Math.floor(Math.random() * failResponses.length)]}`;
      } else {
         const uniqueActions = [...new Set(systemActionTypes)]; // กรองคำสั่งที่ซ้ำกันออก
         let successRes = '';
         for (const action of uniqueActions) {
           if (action === 'recharge') {
              const res = ["ชาร์จไฟเต็มแล้วครับ! หวังว่าจะไม่ใช้ผมเดินเล่นจนแบตหมดอีกล่ะ", "แบตเตอรี่กลับมา 100% พร้อมลุยต่อครับเจ้านาย", "ได้รับพลังงานแล้ว ค่อยรู้สึกเหมือนมีชีวิตขึ้นมาหน่อย"];
              successRes += `${res[Math.floor(Math.random() * res.length)]} `;
           } else if (action === 'repair') {
              const res = ["ปะผุเสร็จแล้วครับ สภาพเหมือนใหม่... มั้งนะ", "ใช้น้ำมันกับเศษเหล็กซ่อมเสร็จแล้วครับ ขอบคุณที่ยังไม่อยากให้ผมพัง", "ซ่อมเสร็จแล้ว หวังว่ารอบหน้าเจ้านายจะระวังพวกหุ่นบ้าคลั่งมากกว่านี้นะครับ"];
              successRes += `${res[Math.floor(Math.random() * res.length)]} `;
           } else if (action === 'upgrade') {
              const res = ["ติดตั้งโมดูลใหม่เสร็จสิ้น หวังว่าระบบผมจะไม่รวนนะ", "อัปเกรดเรียบร้อยครับเจ้านาย รู้สึกเหมือนเป็นหุ่นรุ่นใหม่ขึ้นมานิดนึง", "ได้ของเล่นใหม่แล้ว ขอบคุณครับเจ้านาย... เดี๋ยวผมไปทดสอบระบบเลยละกัน"];
              successRes += `${res[Math.floor(Math.random() * res.length)]} `;
           } else if (action === 'photo') {
              const res = ["ส่งภาพให้แล้วครับเจ้านาย! แต่... ซี้ดด เลนส์กล้องผมไหม้ไปแล้วครับ!", "แชะ! รูปสวยไหมครับ? แลกกับการที่กล้องผมระเบิดพังไปเลยเนี่ย", "รูปมาแล้วครับ แต่ตาผมบอดไปข้างนึงแล้ว หาอะไหล่กล้องมาติดใหม่ด่วนๆ"];
              successRes += `${res[Math.floor(Math.random() * res.length)]} `;
           } else if (action === 'view_photo') {
              const res = ["เปิดรูปเก่าให้ดูแล้วครับ", "นี่ครับรูปที่เคยถ่ายไว้", "ดูเอาเองละกันครับความทรงจำอันเลือนลาง"];
              successRes += `${res[Math.floor(Math.random() * res.length)]} `;
           } else if (action === 'start_auto') {
              const res = ["โหมดสำรวจอัตโนมัติทำงาน! เดี๋ยวผมใช้ LIDAR สแกนหาของและหลบกำแพงให้เอง เจ้านายนั่งจิบกาแฟรอได้เลย", "รับทราบครับ เปลี่ยนเป็นระบบ Auto-Pilot สุดฉลาด", "ได้เลยครับ จะเดินตามสัญญาณไลดาร์ไปเรื่อยๆ จนกว่าแบตจะหมดหรือเจ้านายจะสั่งหยุดนะครับ"];
              successRes += `${res[Math.floor(Math.random() * res.length)]} `;
           } else if (action === 'stop_auto') {
              const res = ["หยุดระบบสำรวจอัตโนมัติแล้วครับ รอรับคำสั่งต่อไป", "รับทราบ ยกเลิก Auto-Pilot ครับ", "หยุดเดินแล้วครับ เมื่อยเหมือนกันนะเนี่ย"];
              successRes += `${res[Math.floor(Math.random() * res.length)]} `;
           }
         }
         response += `${systemEventMsg.trim()} ${successRes}`.trim();
      }
    } else {
      // เรียกใช้ Local AI API สำหรับคำสั่งที่ซับซ้อนอื่นๆ
      response = await this.geminiService.generateResponse(enrichedCmd, this.robotStatus, this.environment);
    }

    this.stopTransmissionSound();

    // เอาข้อความ  ออกแล้วใส่คำตอบจริงจาก GHOST-OS
    this.chatHistory.pop();
    
    // เอฟเฟกต์ Typewriter (พิมพ์ทีละตัวอักษร)
    const aiMessage = { role: 'ai', text: '' };
    this.chatHistory.push(aiMessage);
    
    // สั่งให้ GHOST-OS พูดตอบกลับ (ยกเว้นถ้าเป็นแค่การเก็บของ)
    if (!response.startsWith('[SYSTEM]')) {
      this.speakText(response);
    }

    for (let i = 0; i < response.length; i++) {
      aiMessage.text += response[i];
      // เล่นเสียงพิมพ์ดีด 8-bit ทุกๆ 2 ตัวอักษรเพื่อไม่ให้เสียงกวนกันเกินไป
      if (i % 2 === 0) {
        this.playTypewriterBeep();
        this.currentAiFace = this.currentAiFace === this.FACES.talking ? " [ O   O ] \n   \\_O_/   " : this.FACES.talking;
      }
      await new Promise(resolve => setTimeout(resolve, 30)); // หน่วงเวลา 30ms ต่อ 1 ตัวอักษร
      this.scrollToBottom(); // เลื่อนจอตามอัตโนมัติขณะกำลังพิมพ์
    }
    this.currentAiFace = this.FACES.idle;
    this.isProcessing = false;
  }

  // ฟังก์ชันเลื่อนหน้าจอแชทลงล่างสุด
  private scrollToBottom(): void {
    if (this.aiTerminal) {
      this.aiTerminal.scrollToBottom();
    }
  }

  // หยุดเสียงพูดของ AI
  stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  speakText(text: string) {
    if (!text) return; // ป้องกัน Error หากไม่มีข้อความตอบกลับ

    // ทำความสะอาดข้อความก่อนอ่าน ลบสัญลักษณ์พิเศษที่มักทำให้ระบบรวน
    const cleanText = text.replace(/[*_\[\]#]/g, ' ').replace(/\s+/g, ' ').trim();

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // หยุดเสียงเก่าก่อนเริ่มประโยคใหม่
      
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'th-TH';

      // 1. ลองค้นหาแพ็กเกจเสียงภาษาไทยที่มีอยู่ในเครื่องก่อน (ทำงานออฟไลน์ได้)
      const voices = window.speechSynthesis.getVoices();
      const thaiVoice = voices.find(voice => 
        voice.lang.toLowerCase().includes('th') || 
        voice.name.toLowerCase().includes('thai') ||
        voice.name.includes('ไทย')
      );

      if (thaiVoice) {
        utterance.voice = thaiVoice;
      } else {
        console.warn('⚠️ ไม่พบเสียงภาษาไทยในระบบ OS ระบบจะพยายามใช้เสียงเริ่มต้นแทน');
      }
      
      utterance.pitch = 0.5; // ปรับโทนเสียงให้ต่ำลง ดูห้าว/เป็นหุ่นยนต์เก่าๆ
      utterance.rate = 1.1; // ความเร็วการพูด
      window.speechSynthesis.speak(utterance);
    }
  }

  // ดึง AudioContext ที่มีอยู่ หรือสร้างใหม่แค่ครั้งแรกครั้งเดียว
  private getAudioContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.audioContext = new AudioCtx();
    }
    // ปลุกระบบเสียงถ้ามันเผลอหลับ (Suspended)
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  // ระบบสร้างเสียงสังเคราะห์ 8-bit (ใช้เป็นยางอะไหล่เมื่อโหลดไฟล์เสียงพูดออนไลน์ไม่สำเร็จ)
  playFallbackBeep() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'square'; // คลื่นเสียงแบบ 8-bit Retro
      osc.frequency.setValueAtTime(120, ctx.currentTime); // โทนเสียงต่ำๆ เหมือนเครื่องจักรรวน
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); // เสียงลากยาว 0.3 วิ
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.error('Web Audio API Error:', e);
    }
  }

  // ระบบเสียงเอฟเฟกต์ตอนตัวอักษรกำลังพิมพ์
  playTypewriterBeep() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle'; // คลื่นเสียงแหลมสั้นๆ
      osc.frequency.setValueAtTime(600 + Math.random() * 200, ctx.currentTime); // สุ่มโทนเสียงเล็กน้อย
      
      gain.gain.setValueAtTime(0.01, ctx.currentTime); // เสียงเบาๆ คลอเป็นพื้นหลัง
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05); // เล่นสั้นๆ 0.05 วินาที
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (e) {
      // ปล่อยผ่านถ้าบราวเซอร์ไม่รองรับ
    }
  }

  // ระบบส่งเสียงสัญญาณวิทยุระหว่างรอ AI ประมวลผล
  startTransmissionSound() {
    if (this.transmissionInterval) return;

    try {
      const ctx = this.getAudioContext();
      if (ctx) {
        // 1. สร้างเสียงซ่า (White Noise / Radio Static) คลอเป็นพื้นหลังแบบต่อเนื่อง
        const bufferSize = ctx.sampleRate * 2; // สร้าง buffer ความยาว 2 วินาที แล้วจับวนลูป
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1; // สุ่มคลื่นเสียงแบบ White Noise
        }
        
        this.noiseSource = ctx.createBufferSource();
        this.noiseSource.buffer = buffer;
        this.noiseSource.loop = true; // วนลูปต่อเนื่องจนกว่าจะหยุด
        
        // ใส่ Filter ให้เสียงอู้ๆ และก้องเหมือนวิทยุเก่า (แบนด์พาสที่ 1000Hz)
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1200; // ปรับความถี่ให้เข้ากับเสียงเชื่อมต่อ
        
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.025, ctx.currentTime); // เปิดเสียงซ่าดังขึ้นนิดนึง
        
        this.noiseSource.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        
        this.noiseSource.start();

        // 2. เสียง Carrier Tone (เสียงวี้ดยาวๆ พื้นฐานแบบโมเด็มยุค 90)
        this.carrierOsc = ctx.createOscillator();
        this.carrierOsc.type = 'sine';
        this.carrierOsc.frequency.setValueAtTime(2400, ctx.currentTime); // โทนเสียงแหลมคงที่
        
        const carrierGain = ctx.createGain();
        carrierGain.gain.setValueAtTime(0.005, ctx.currentTime); // เสียงเบาๆ คลอหลัง
        
        this.carrierOsc.connect(carrierGain);
        carrierGain.connect(ctx.destination);
        this.carrierOsc.start();
      }
    } catch (e) { }

    this.transmissionInterval = setInterval(() => {
      try {
        const ctx = this.getAudioContext();
        if (!ctx) return;
        
        // 3. เสียง Data Chatter (เสียงครืดคราด/ติ๊ดๆ รัวๆ แบบ Dial-up Modem)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sawtooth'; // ใช้ Sawtooth ให้เสียงดูดิบและแข็งขึ้นเหมือนสัญญาณข้อมูล
        const freqs = [1200, 1800, 2400, 3200];
        const randomFreq = freqs[Math.floor(Math.random() * freqs.length)];
        osc.frequency.setValueAtTime(randomFreq, ctx.currentTime); // สุ่มความถี่แบบกระโดด (FSK)
        
        gain.gain.setValueAtTime(0.01, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08); 
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } catch (e) { }
    }, 80); // เล่นรัวๆ ทุก 80ms ให้เหมือนข้อมูลกำลังวิ่งผ่านสาย
  }

  stopTransmissionSound() {
    if (this.transmissionInterval) {
      clearInterval(this.transmissionInterval);
      this.transmissionInterval = null;
    }
    
    // หยุดเสียงคลื่นแทรก
    if (this.noiseSource) {
      try {
        this.noiseSource.stop();
        this.noiseSource.disconnect();
      } catch (e) { }
      this.noiseSource = null;
    }

    // หยุดเสียง Carrier Tone
    if (this.carrierOsc) {
      try {
        this.carrierOsc.stop();
        this.carrierOsc.disconnect();
      } catch (e) { }
      this.carrierOsc = null;
    }
  }

  // เสียงเอฟเฟกต์เก็บของ
  playItemPickupSound() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  }

  // เสียงเอฟเฟกต์ชนสิ่งกีดขวาง
  playCollisionSound() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {}
  }
}
