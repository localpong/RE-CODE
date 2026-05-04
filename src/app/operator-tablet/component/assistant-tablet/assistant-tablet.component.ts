import { Component, OnInit, HostListener, ViewChild } from '@angular/core';
import { AiTerminalComponent } from '../terminal/ai-terminal.component';
import { AppWorkspace, AppAgent } from '../workspace-manager/workspace-manager.component';

interface ChatSession {
  id: string;
  title: string;
  systemPrompt: string;
  temperature?: number;
  apiKey?: string;
  modelName?: string;
  apiUrl?: string;
  isPinned?: boolean;
  agentId?: string;
  history: { role: string, text: string }[];
}

@Component({
  selector: 'app-assistant-tablet',
  templateUrl: './assistant-tablet.component.html',
  styleUrls: ['./assistant-tablet.component.scss']
})
export class AssistantTabletComponent implements OnInit {
  currentTime: Date = new Date();
  isProcessing: boolean = false;

  // ควบคุมการแสดงผลแถบประวัติ
  isSidebarOpen: boolean = true;

  private readonly STORAGE_KEY = 'ASSISTANT_SESSIONS_DATA';
  private readonly WORKSPACE_STORAGE_KEY = 'ASSISTANT_WORKSPACES_DATA';

  showSettings: boolean = false;
  showWorkspaceManager: boolean = false;
  workspaces: AppWorkspace[] = [];
  sessionSearchTerm: string = ''; // ตัวแปรสำหรับค้นหาห้องสนทนา
  isDragging: boolean = false; // ตัวแปรแสดงสถานะการลากไฟล์
  private dragCounter: number = 0; // ตัวแปรแก้บัค UI กะพริบตอนลากไฟล์ทับกล่องลูก
  
  localModels: string[] = []; // เก็บรายชื่อโมเดลในเครื่อง

  // ตัวแปรสำหรับเชื่อมกับ AI Terminal
  sessions: ChatSession[] = [
    {
      id: 'session-1',
      title: 'Current Session',
      systemPrompt: 'คุณคือ GHOST-OS Assistant ผู้ช่วย AI ส่วนตัวที่สุภาพและเป็นทางการ ตอบคำถามสั้นๆ กระชับและช่วยเหลือเจ้านายอย่างเต็มที่',
      temperature: 0.8,
      history: [{ role: 'ai', text: '[SYSTEM_START] GHOST-OS Assistant Standby... พร้อมรับคำสั่งแล้วครับเจ้านาย' }]
    },
    {
      id: 'session-2',
      title: 'Project Alpha Ideas',
      systemPrompt: 'คุณคือ AI ระดมสมองสุดสร้างสรรค์ มีนิสัยร่าเริง ชอบใช้ Emoji และชอบเสนอไอเดียแปลกใหม่',
      temperature: 1.2,
      history: [
        { role: 'ai', text: 'ข้อมูลของ Project Alpha โหลดเสร็จสิ้นแล้ว' },
        { role: 'user', text: 'ช่วยสรุปให้ฟังหน่อย' },
        { role: 'ai', text: 'มันคือโปรเจคสร้างระบบผู้ช่วยส่วนตัวที่ดูดีที่สุดใน Wasteland ครับ' }
      ]
    }
  ];
  activeSessionId: string = 'session-1';
  currentAiFace: string = " [ O   O ] \n   \\_-_/   ";
  chatHistory: { role: string, text: string }[] = this.sessions[0].history;
  isListening: boolean = false;
  recognition: any;
  userCommand: string = '';

  get filteredSessions(): ChatSession[] {
    let result = this.sessions;
    if (this.sessionSearchTerm.trim()) {
      const term = this.sessionSearchTerm.toLowerCase();
      result = result.filter(s => s.title.toLowerCase().includes(term));
    }
    // เรียงห้องที่ปักหมุดไว้ด้านบนสุด
    return [...result].sort((a, b) => {
      const pinA = a.isPinned ? 1 : 0;
      const pinB = b.isPinned ? 1 : 0;
      return pinB - pinA;
    });
  }

  @ViewChild(AiTerminalComponent) private aiTerminal!: AiTerminalComponent;

  private audioContext: any = null; // ตัวแปรสำหรับระบบเสียง

  constructor() {}

  ngOnInit(): void {
    this.initSpeechRecognition(); // เริ่มต้นระบบรับคำสั่งเสียง

    this.fetchLocalModels(); // โหลดรายชื่อโมเดลในเครื่องตอนเปิดหน้าจอ

    // โหลดข้อมูล Session จาก localStorage
    const savedData = localStorage.getItem(this.STORAGE_KEY);
    if (savedData) {
      try {
        this.sessions = JSON.parse(savedData);
        // ตรวจสอบและเพิ่ม systemPrompt สำหรับห้องเก่าที่ยังไม่มี
        this.sessions.forEach(s => {
          if (!s.systemPrompt) {
            s.systemPrompt = 'คุณคือผู้ช่วย AI ทั่วไป ตอบคำถามอย่างเป็นธรรมชาติ';
          }
          if (s.temperature === undefined) {
          s.temperature = 0.8; // ใช้ค่าคงที่เป็นค่าเริ่มต้นสำหรับห้องเก่า
          }
        });
        if (this.sessions.length > 0) {
          this.activeSessionId = this.sessions[0].id;
          this.chatHistory = this.sessions[0].history;
          setTimeout(() => this.scrollToBottom(), 100); // เลื่อนแชทลงเมื่อโหลดข้อมูลครั้งแรก
        }
      } catch (e) {
        console.error('Failed to parse saved sessions', e);
      }
    }

    // โหลดข้อมูล Workspace จาก localStorage
    const savedWorkspaces = localStorage.getItem(this.WORKSPACE_STORAGE_KEY);
    if (savedWorkspaces) {
      try {
        this.workspaces = JSON.parse(savedWorkspaces);
      } catch (e) {
        console.error('Failed to parse saved workspaces', e);
      }
    }

    // อัปเดตเวลาบนหน้าจอ
    setInterval(() => {
      this.currentTime = new Date();
    }, 1000);

    // ปิด Sidebar อัตโนมัติเมื่อเริ่มต้นบนจอมือถือ
    if (window.innerWidth < 768) {
      this.isSidebarOpen = false;
    }

    // โหลดรายการแพ็กเกจเสียงล่วงหน้า เพื่อเตรียมพร้อมสำหรับ Text-to-Speech
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
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
        this.sendCommand(); // ส่งคำสั่งทันทีที่พูดจบ
      };

      this.recognition.onend = () => {
        this.isListening = false;
      };
    } else {
      console.warn('เบราว์เซอร์นี้ไม่รองรับระบบ Speech Recognition');
    }
  }

  async fetchLocalModels() {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (response.ok) {
        const data = await response.json();
        if (data && data.models) {
          this.localModels = data.models.map((m: any) => m.name);
        }
      }
    } catch (e) {
      console.warn('ไม่พบเซิร์ฟเวอร์ Local AI (Ollama) เพื่อดึงรายชื่อโมเดล');
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    if (event.target.innerWidth < 768 && this.isSidebarOpen) {
      this.isSidebarOpen = false;
    } else if (event.target.innerWidth >= 768 && !this.isSidebarOpen) {
      this.isSidebarOpen = true;
    }
  }

  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  saveSessions() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.sessions));
  }

  saveWorkspaces() {
    localStorage.setItem(this.WORKSPACE_STORAGE_KEY, JSON.stringify(this.workspaces));
  }

  resetSessionSettings() {
    const session = this.getActiveSession();
    if (session && confirm('คุณแน่ใจหรือไม่ว่าต้องการคืนค่าการตั้งค่าห้องนี้กลับเป็นค่าเริ่มต้น?')) {
      session.systemPrompt = 'คุณคือผู้ช่วย AI ทั่วไป ตอบคำถามอย่างเป็นธรรมชาติ';
      session.temperature = 0.8;
      session.apiKey = '';
      session.modelName = 'qwen2.5';
      session.apiUrl = '';
      session.agentId = '';
      this.saveSessions();
    }
  }

  selectSession(id: string) {
    this.activeSessionId = id;
    const session = this.sessions.find(s => s.id === id);
    if (session) {
      this.chatHistory = session.history; // เปลี่ยนประวัติแชทไปเป็นของห้องที่เลือก
      setTimeout(() => this.scrollToBottom(), 50); // เลื่อนแชทเมื่อเปลี่ยนห้อง
    }
  }

  getActiveSession(): ChatSession | undefined {
    return this.sessions.find(s => s.id === this.activeSessionId);
  }

  toggleSettings() {
    this.showSettings = !this.showSettings;
  }

  toggleWorkspaceManager() {
    this.showWorkspaceManager = !this.showWorkspaceManager;
  }

  createNewSession() {
    const newId = 'session-' + Date.now();
    const newSession: ChatSession = {
      id: newId,
      title: 'New Session ' + (this.sessions.length + 1),
      systemPrompt: 'คุณคือผู้ช่วย AI ทั่วไป ตอบคำถามอย่างเป็นธรรมชาติ',
      temperature: 0.8,
      apiKey: '',
      modelName: 'qwen2.5',
      apiUrl: '',
      agentId: '',
      history: [{ role: 'ai', text: 'ห้องสนทนาใหม่ พร้อมใช้งานครับ' }]
    };
    this.sessions.push(newSession);
    this.saveSessions();
    this.selectSession(newId);
  }

  getActiveSessionTitle(): string {
    const session = this.sessions.find(s => s.id === this.activeSessionId);
    return session ? session.title : 'Unknown Session';
  }

  renameSession(id: string, event: Event) {
    event.stopPropagation(); // ป้องกันไม่ให้ทะลุไปกดเลือกห้อง
    const session = this.sessions.find(s => s.id === id);
    if (session) {
      const newTitle = prompt('ระบุชื่อห้องใหม่:', session.title);
      if (newTitle !== null && newTitle.trim() !== '') {
        session.title = newTitle.trim();
        this.saveSessions();
      }
    }
  }

  togglePin(id: string, event: Event) {
    event.stopPropagation();
    const session = this.sessions.find(s => s.id === id);
    if (session) {
      session.isPinned = !session.isPinned;
      this.saveSessions();
    }
  }

  // ================= ระบบลากและวาง (Drag & Drop) =================
  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  onDragEnter(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragCounter++;
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragCounter--;
    if (this.dragCounter === 0) {
      this.isDragging = false;
    }
  }

  async onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
    this.dragCounter = 0;

    const file = event.dataTransfer?.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      
      // ตรวจสอบว่าใช่ไฟล์ Text ที่ได้มาจากการ Export หรือไม่
      if (text.includes('=== CHAT HISTORY EXPORT ===')) {
        const lines = text.split(/\r?\n/);
        let sessionTitle = 'Imported Session ' + new Date().toLocaleTimeString();
        const newHistory: { role: string, text: string }[] = [];
        let currentRole = '';
        let currentText = '';

        for (const line of lines) {
          if (line.startsWith('SESSION: ')) {
            sessionTitle = line.substring(9).trim() + ' (Imported)';
          } else if (line.startsWith('[USER]: ')) {
            if (currentRole) newHistory.push({ role: currentRole, text: currentText.trim() });
            currentRole = 'user';
            currentText = line.substring(8);
          } else if (line.startsWith('[AI]: ')) {
            if (currentRole) newHistory.push({ role: currentRole, text: currentText.trim() });
            currentRole = 'ai';
            currentText = line.substring(6);
          } else if (currentRole) {
            currentText += '\n' + line;
          }
        }
        if (currentRole) newHistory.push({ role: currentRole, text: currentText.trim() });

        if (newHistory.length > 0) {
          const newId = 'session-' + Date.now();
          const newSession: ChatSession = {
            id: newId,
            title: sessionTitle,
            systemPrompt: 'คุณคือผู้ช่วย AI ทั่วไป ตอบคำถามอย่างเป็นธรรมชาติ',
            temperature: 0.8,
            apiKey: '',
            modelName: 'qwen2.5',
            apiUrl: '',
            history: newHistory
          };
          this.sessions.push(newSession);
          this.saveSessions();
          this.selectSession(newId);
        }
      } else {
        alert('รูปแบบไฟล์ไม่ถูกต้อง กรุณาใช้ไฟล์ Text ที่ Export มาจากระบบเท่านั้น');
      }
    } catch (e) {
      console.error('File import error:', e);
      alert('เกิดข้อผิดพลาดในการอ่านไฟล์');
    }
  }

  deleteSession(id: string, event: Event) {
    event.stopPropagation();
    if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบห้องสนทนานี้?')) {
      this.sessions = this.sessions.filter(s => s.id !== id);
      if (this.sessions.length === 0) {
        this.createNewSession(); // ถ้าลบจนหมดให้สร้างห้อง default ใหม่
      } else if (this.activeSessionId === id) {
        this.selectSession(this.sessions[0].id); // ถ้าลบห้องที่กำลังเปิดอยู่ ให้เปลี่ยนไปห้องแรก
      }
      this.saveSessions();
    }
  }

  clearChat() {
    if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบประวัติการสนทนาในห้องนี้?')) {
      this.chatHistory.length = 0; // ลบข้อมูลโดยไม่ทิ้ง Reference
      this.chatHistory.push({ role: 'ai', text: '[SYSTEM] ล้างประวัติการสนทนาเรียบร้อยแล้ว' });
      this.saveSessions();
      setTimeout(() => this.scrollToBottom(), 50);
    }
  }

  sendCommand() {
    if (this.isProcessing || !this.userCommand.trim()) return;

    const userCmd = this.userCommand;
    this.userCommand = '';

    // ตรวจสอบ Slash Command
    if (userCmd.trim().startsWith('/')) {
      const sysMatch = userCmd.trim().match(/^\/(sys|system|persona|prompt)(?:\s+(.*))?$/i);
      const nameMatch = userCmd.trim().match(/^\/(name|rename)(?:\s+(.*))?$/i);
      
      if (sysMatch) {
        const args = sysMatch[2];
        if (args && args.trim()) {
          const session = this.getActiveSession();
          if (session) {
            session.systemPrompt = args.trim();
            this.saveSessions();
            this.chatHistory.push({ role: 'user', text: userCmd });
            this.chatHistory.push({ role: 'ai', text: `[SYSTEM] ปรับเปลี่ยนบุคลิกนิสัย AI (System Prompt) เป็น: "${args.trim()}" เรียบร้อยแล้ว` });
            setTimeout(() => this.scrollToBottom(), 50);
          }
        } else {
          this.chatHistory.push({ role: 'user', text: userCmd });
          this.chatHistory.push({ role: 'ai', text: '[SYSTEM] กรุณาระบุข้อความ System Prompt ตัวอย่าง: /sys คุณคือผู้ช่วยสุดโหด' });
          setTimeout(() => this.scrollToBottom(), 50);
        }
        return;
      }

      if (nameMatch) {
        const newName = nameMatch[2];
        if (newName && newName.trim()) {
          const session = this.getActiveSession();
          if (session) {
            const oldName = session.title;
            session.title = newName.trim();
            this.saveSessions();
            this.chatHistory.push({ role: 'user', text: userCmd });
            this.chatHistory.push({ role: 'ai', text: `[SYSTEM] เปลี่ยนชื่อห้องสนทนาจาก "${oldName}" เป็น "${session.title}" เรียบร้อยแล้ว` });
            setTimeout(() => this.scrollToBottom(), 50);
          }
        } else {
          this.chatHistory.push({ role: 'user', text: userCmd });
          this.chatHistory.push({ role: 'ai', text: '[SYSTEM] กรุณาระบุชื่อห้องใหม่ ตัวอย่าง: /name ห้องทำงานลับ' });
          setTimeout(() => this.scrollToBottom(), 50);
        }
        return;
      }

      const cmdLowerSlash = userCmd.trim().toLowerCase();
      
      if (cmdLowerSlash === '/pin') {
        const session = this.getActiveSession();
        if (session) {
          session.isPinned = !session.isPinned;
          this.saveSessions();
          this.chatHistory.push({ role: 'user', text: userCmd });
          const statusStr = session.isPinned ? 'ปักหมุด' : 'ถอนหมุด';
          this.chatHistory.push({ role: 'ai', text: `[SYSTEM] ${statusStr}ห้องสนทนา "${session.title}" เรียบร้อยแล้ว` });
          setTimeout(() => this.scrollToBottom(), 50);
        }
        return;
      }

      if (cmdLowerSlash === '/del' || cmdLowerSlash === '/delete') {
        if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบห้องสนทนานี้?')) {
          const id = this.activeSessionId;
          this.sessions = this.sessions.filter(s => s.id !== id);
          if (this.sessions.length === 0) {
            this.createNewSession(); // ถ้าลบจนหมดให้สร้างห้อง default ใหม่
          } else {
            this.selectSession(this.sessions[0].id); // เปลี่ยนไปห้องแรก
          }
          this.saveSessions();
        }
        return;
      }

      if (cmdLowerSlash === '/export') {
        const session = this.getActiveSession();
        if (session) {
          let exportText = `=== CHAT HISTORY EXPORT ===\n`;
          exportText += `SESSION: ${session.title}\n`;
          exportText += `DATE: ${new Date().toLocaleString()}\n`;
          exportText += `===========================\n\n`;
          
          this.chatHistory.forEach(msg => {
            const role = msg.role === 'ai' ? 'AI' : 'USER';
            exportText += `[${role}]: ${msg.text}\n\n`;
          });

          const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `ChatExport_${session.title.replace(/\s+/g, '_')}_${Date.now()}.txt`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);

          this.chatHistory.push({ role: 'user', text: userCmd });
          this.chatHistory.push({ role: 'ai', text: `[SYSTEM] ดาวน์โหลดประวัติการสนทนาของห้อง "${session.title}" เป็นไฟล์ Text สำเร็จแล้ว` });
          this.saveSessions();
          setTimeout(() => this.scrollToBottom(), 50);
        }
        return;
      }

      if (cmdLowerSlash === '/help') {
        this.chatHistory.push({ role: 'user', text: userCmd });
        this.chatHistory.push({ role: 'ai', text: '[SYSTEM] รายการคำสั่งลัด (Slash Commands):\n- /sys [ข้อความ] : กำหนดบทบาท/นิสัยให้ AI (เช่น /sys คุณคือเพื่อนสนิท)\n- /name [ชื่อห้อง] : เปลี่ยนชื่อห้องสนทนาปัจจุบัน\n- /pin : ปักหมุด/ถอนหมุดห้องสนทนาปัจจุบัน\n- /del หรือ /delete : ลบห้องสนทนาปัจจุบัน\n- /clear [จำนวน] : ล้างประวัติแชททั้งหมด (หรือระบุจำนวนบรรทัดล่าสุดที่ต้องการลบ)\n- /export : ดาวน์โหลดประวัติแชทห้องปัจจุบันเป็นไฟล์ Text\n- /help : แสดงรายการคำสั่งทั้งหมด' });
        this.saveSessions();
        setTimeout(() => this.scrollToBottom(), 50);
        return;
      }
    }

    // ตรวจสอบคำสั่งเคลียร์แชท (Clear Chat)
    const clearMatch = userCmd.trim().match(/^(?:\/)?(?:clear|clear chat|เคลียร์แชท)(?:\s+(\d+))?$/i);
    if (clearMatch) {
      const numToClearStr = clearMatch[1];
      if (numToClearStr) {
        const numToClear = parseInt(numToClearStr, 10);
        if (numToClear > 0) {
          const removeCount = Math.min(numToClear, this.chatHistory.length);
          this.chatHistory.splice(this.chatHistory.length - removeCount, removeCount);
          this.chatHistory.push({ role: 'user', text: userCmd });
          this.chatHistory.push({ role: 'ai', text: `[SYSTEM] ลบประวัติการสนทนา ${removeCount} ข้อความล่าสุดเรียบร้อยแล้ว` });
        }
      } else {
        this.chatHistory.length = 0;
        this.chatHistory.push({ role: 'user', text: userCmd });
        this.chatHistory.push({ role: 'ai', text: '[SYSTEM] รับทราบ ทำการล้างประวัติการสนทนาในห้องนี้เรียบร้อยแล้ว' });
      }
      this.saveSessions();
      setTimeout(() => this.scrollToBottom(), 50);
      return;
    }

    this.chatHistory.push({ role: 'user', text: userCmd });
    this.saveSessions();
    this.isProcessing = true;
    this.currentAiFace = " [ -   - ] \n   \\___/   ";
    setTimeout(() => this.scrollToBottom(), 50);

    this.callLocalAI();
  }

  findAgentById(agentId: string): AppAgent | undefined {
    for (const ws of this.workspaces) {
      const agent = ws.agents.find(a => a.id === agentId);
      if (agent) return agent;
    }
    return undefined;
  }

  buildAgentContext(agent: AppAgent): string {
    let context = `[PERSONA]: ${agent.systemPrompt}`;
    
    let memContext = '';
    let skillContext = '';
    
    for (const ws of this.workspaces) {
      agent.memoryStoreIds.forEach(mid => {
        const mem = ws.memoryStores.find(m => m.id === mid);
        if (mem) memContext += `\n- [${mem.name}]: ${mem.description}`;
      });
      agent.skillIds.forEach(sid => {
        const skill = ws.skills.find(s => s.id === sid);
        if (skill) skillContext += `\n- [${skill.name}]: ${skill.description}`;
      });
    }

    if (memContext) context += `\n\n[MEMORY STORES (RAG KNOWLEDGE)]:${memContext}`;
    if (skillContext) context += `\n\n[AVAILABLE SKILLS]:${skillContext}`;
    
    return context;
  }

  async callLocalAI() {
    const session = this.getActiveSession();
    let finalSystemPrompt = `[PERSONA]: ${session?.systemPrompt || 'คุณคือผู้ช่วย AI ทั่วไป'}`;
    let sessionTemperature = session?.temperature ?? 0.8;
    let modelName = (session?.modelName ?? 'qwen2.5').trim();

    // Override ด้วย Agent หากมีการเลือกไว้
    if (session?.agentId) {
      const agent = this.findAgentById(session.agentId);
      if (agent) {
        finalSystemPrompt = this.buildAgentContext(agent);
        sessionTemperature = agent.temperature;
        modelName = agent.modelName;
      }
    }

    // กรองข้อความระบบทิ้งไปก่อน เพื่อไม่ให้ API สับสน
    const validHistory = this.chatHistory.filter(m => !m.text.startsWith('[SYSTEM_START]') && !m.text.startsWith('[SYSTEM]'));
    
    // เตรียม Messages (ดึงประวัติมาแค่ 6 บรรทัดล่าสุดให้ AI ไม่งง)
    const recentHistory = validHistory.slice(-6).map(m => ({
      role: m.role === 'ai' ? 'assistant' : 'user', // ปรับ role ให้เข้ากับมาตรฐาน API
      content: m.text
    }));

    try {
      let aiResponseText = '';
      const apiKey = (session?.apiKey ?? '').trim();
      const apiUrl = (session?.apiUrl ?? '').trim();

      if (apiKey) {
        // ================== CLOUD API (Gemini / OpenAI) ==================
        if (modelName.toLowerCase().includes('gemini')) {
          // --- GEMINI API ---
          const geminiMessages = recentHistory.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          }));
          
          // ป้องกัน Error จาก Gemini ที่บังคับให้เริ่มสนทนาด้วย role: user
          if (geminiMessages.length > 0 && geminiMessages[0].role === 'model') {
            geminiMessages.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
          }

          // ช่วยดักจับและซ่อมแซมชื่อโมเดล
          let actualModelName = modelName.trim();
          if (actualModelName.toLowerCase() === 'gemini') {
            actualModelName = 'gemini-flash-latest';
          }
          actualModelName = actualModelName.replace(/^models\//i, ''); // ลบคำว่า models/ ออกถ้าเผลอใส่มาซ้ำ

          let baseUrl = apiUrl;
          
          if (!baseUrl) {
            baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${actualModelName}:generateContent`;
          } else {
            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
            if (baseUrl.endsWith('models')) {
              baseUrl += `/${actualModelName}:generateContent`;
            } else if (baseUrl.includes('googleapis.com') && !baseUrl.includes(':generateContent')) {
              if (!baseUrl.includes('/models')) baseUrl += '/models';
              baseUrl += `/${actualModelName}:generateContent`;
            }
          }
          
          const finalUrl = baseUrl;
          
          const requestBody: any = {
            systemInstruction: { parts: [{ text: finalSystemPrompt }] },
            contents: geminiMessages,
            generationConfig: { temperature: sessionTemperature }
          };

          const response = await fetch(finalUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-goog-api-key': apiKey 
            },
            body: JSON.stringify(requestBody)
          });
          const data = await response.json();
          if (data.error) throw new Error(data.error.message);
          aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '[ERROR] ไม่มีข้อความตอบกลับจาก Gemini';
          
        } else if (modelName.toLowerCase().includes('claude')) {
          // --- CLAUDE API (Anthropic) ---
          
          // คัดกรองประวัติแชท: Claude API บังคับว่าข้อความแรกสุดต้องมาจาก "user" เสมอ
          // และห้ามส่ง Role ซ้ำกันติดกัน (เช่น user ตามด้วย user หรือ assistant ตามด้วย assistant)
          const claudeMessages: any[] = [];
          for (const msg of recentHistory) {
            if (claudeMessages.length === 0) {
              if (msg.role === 'user' && msg.content.trim()) claudeMessages.push({ ...msg });
            } else {
              const lastMsg = claudeMessages[claudeMessages.length - 1];
              if (lastMsg.role === msg.role) {
                lastMsg.content += '\n\n' + msg.content; // รวบข้อความที่มาจาก Role เดียวกันติดกัน
              } else if (msg.content.trim()) {
                claudeMessages.push({ ...msg });
              }
            }
          }
          if (claudeMessages.length === 0) {
            claudeMessages.push({ role: 'user', content: '...' }); // กันการส่ง array ว่างไปหา Claude
          }

          let apiEndpoint = apiUrl || 'https://api.anthropic.com/v1/messages';
          
          // ช่วยเติม Path ให้ถ้าผู้ใช้กรอกมาแค่ http://localhost:3000
          if (apiEndpoint.endsWith('/')) {
            apiEndpoint = apiEndpoint.slice(0, -1);
          }
          if (apiEndpoint === 'http://localhost:3000') {
            apiEndpoint += '/api/claude';
          }
          
          // จำลองพฤติกรรม --max-time 600 (600 วินาที = 600,000 ms) ด้วย AbortController
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 600000);

          try {
            const response = await fetch(apiEndpoint, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'X-Api-Key': apiKey, // ใช้ตัวพิมพ์ตามอ้างอิง
                'anthropic-version': '2023-06-01',
                'anthropic-dangerously-allow-browser': 'true' // บังคับใส่เมื่อยิง API จาก Frontend (Angular) ตรงๆ
              },
              body: JSON.stringify({
                model: modelName,
                system: finalSystemPrompt,
                messages: claudeMessages,
                max_tokens: 4096, // สามารถตั้งเป็น 1024 ตามข้อมูล หรือใช้ 4096 เผื่อคุยยาวๆ ได้
                temperature: sessionTemperature
              }),
              signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await response.json();
            if (data.type === 'error') throw new Error(data.error.message);
            aiResponseText = data.content?.[0]?.text || '[ERROR] ไม่มีข้อความตอบกลับจาก Claude';
          } catch (err: any) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
              throw new Error('API ใช้เวลาตอบรับนานเกินไป (Timeout: 600s)');
            }
            throw err;
          }
        } else {
          // --- OPENAI API (รองรับโมเดลที่ใช้ฟอร์แมตนี้ เช่น gpt-4o, Groq, Together) ---
          const openAiMessages = [
            { role: 'system', content: finalSystemPrompt },
            ...recentHistory
          ];
          const apiEndpoint = apiUrl || 'https://api.openai.com/v1/chat/completions';
          const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: modelName,
              messages: openAiMessages,
              temperature: sessionTemperature
            })
          });
          const data = await response.json();
          if (data.error) throw new Error(data.error.message);
          aiResponseText = data.choices?.[0]?.message?.content || '[ERROR] ไม่มีข้อความตอบกลับจาก OpenAI';
        }
      } else {
        // ================== LOCAL AI (Ollama) ==================
        const messages = [
          { role: 'system', content: finalSystemPrompt },
          ...recentHistory
        ];
        const apiEndpoint = apiUrl || 'http://localhost:11434/api/chat';
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            messages: messages,
            stream: false,
            options: { temperature: sessionTemperature, num_ctx: 2048 }
          })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        aiResponseText = data.message?.content || '[ERROR] ไม่พบการตอบกลับจาก Local AI';
      }
      
      const aiMessage = { role: 'ai', text: '' };
      this.chatHistory.push(aiMessage);

      // สั่งให้อ่านออกเสียงข้อความ
      this.speakText(aiResponseText);

      // ทำเอฟเฟกต์ Typewriter
      for (let i = 0; i < aiResponseText.length; i++) {
        aiMessage.text += aiResponseText[i];
        if (i % 2 === 0) {
          this.playTypewriterBeep();
          this.currentAiFace = this.currentAiFace === " [ O   O ] \n   \\_o_/   " ? " [ O   O ] \n   \\_O_/   " : " [ O   O ] \n   \\_o_/   ";
        }
        await new Promise(resolve => setTimeout(resolve, 30));
        this.scrollToBottom();
      }
    } catch (error: any) {
      this.chatHistory.push({ role: 'ai', text: `[ERROR] การเชื่อมต่อล้มเหลว: ${error.message || 'ไม่สามารถติดต่อ AI ได้'}` });
    } finally {
      this.isProcessing = false;
      this.currentAiFace = " [ O   O ] \n   \\_-_/   ";
      this.saveSessions();
      setTimeout(() => this.scrollToBottom(), 50);
    }
  }

  toggleListening() {
    if (!this.recognition) {
      alert('เบราว์เซอร์ของคุณไม่รองรับระบบสั่งการด้วยเสียง (แนะนำให้ใช้ Google Chrome หรือ Edge)');
      return;
    }
    if (this.isProcessing) return;
    
    if (this.isListening) {
      this.recognition.stop();
    } else {
      this.recognition.start();
      this.isListening = true;
    }
  }

  stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  speakText(text: string) {
    // ลบสัญลักษณ์พิเศษก่อนอ่าน
    const cleanText = text.replace(/[*_\[\]#]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) return;

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();

      const voices = window.speechSynthesis.getVoices();
      const thaiVoice = voices.find(voice => 
        voice.lang.toLowerCase().includes('th') || 
        voice.name.toLowerCase().includes('thai') ||
        voice.name.includes('ไทย')
      );
      const englishVoice = voices.find(voice => voice.lang.toLowerCase().startsWith('en-'));

      // Regex to split text into Thai and non-Thai (assumed English) parts
      const segments = cleanText.match(/[\u0E00-\u0E7F]+|[^\u0E00-\u0E7F]+/g) || [];

      segments.forEach(segment => {
        if (!segment.trim()) return;

        const utterance = new SpeechSynthesisUtterance(segment);
        utterance.pitch = 1.2;
        utterance.rate = 1.1;

        // Check if the segment is primarily Thai
        if (/[\u0E00-\u0E7F]/.test(segment)) {
          if (thaiVoice) utterance.voice = thaiVoice;
          utterance.lang = 'th-TH';
        } else { // Assume English for the rest
          if (englishVoice) utterance.voice = englishVoice;
          utterance.lang = 'en-US';
        }
        window.speechSynthesis.speak(utterance);
      });
    }
  }

  private getAudioContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.audioContext = new AudioCtx();
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  playTypewriterBeep() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600 + Math.random() * 200, ctx.currentTime);
      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (e) {}
  }

  private scrollToBottom(): void {
    if (this.aiTerminal) {
      this.aiTerminal.scrollToBottom();
    }
  }
}