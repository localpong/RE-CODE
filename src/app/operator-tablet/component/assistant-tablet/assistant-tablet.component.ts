import { Component, OnInit, HostListener, ViewChild, AfterViewInit } from '@angular/core';
import { AiTerminalComponent, PastedImage, ChatMessage } from '../terminal/ai-terminal.component';
import { AppWorkspace, AppAgent } from '../workspace-manager/workspace-manager.component';
import { ApproveConfig, DEFAULT_APPROVE_CONFIG } from '../terminal/approve-config.component';

interface ChatSession {
  id: string;
  title: string;
  systemPrompt: string;
  temperature?: number;
  apiKey?: string;
  modelName?: string;
  voiceURI?: string; // เก็บค่าเสียงที่เลือก
  apiUrl?: string;
  isPinned?: boolean;
  agentId?: string;
  history: ChatMessage[];
}

@Component({
  selector: 'app-assistant-tablet',
  templateUrl: './assistant-tablet.component.html',
  styleUrls: ['./assistant-tablet.component.scss']
})
export class AssistantTabletComponent implements OnInit, AfterViewInit {
  currentTime: Date = new Date();
  isProcessing: boolean = false;
  isMobile: boolean = window.innerWidth < 768;

  // ควบคุมการแสดงผลแถบประวัติ
  isSidebarOpen: boolean = true;

  private readonly STORAGE_KEY = 'ASSISTANT_SESSIONS_DATA';
  private readonly WORKSPACE_STORAGE_KEY = 'ASSISTANT_WORKSPACES_DATA';
  private readonly APPROVE_CONFIG_KEY = 'ASSISTANT_APPROVE_CONFIG';

  showSettings: boolean = false;
  showWorkspaceManager: boolean = false;
  workspaces: AppWorkspace[] = [];
  sessionSearchTerm: string = ''; // ตัวแปรสำหรับค้นหาห้องสนทนา
  isDragging: boolean = false;
  private dragCounter: number = 0;
  approveConfig: ApproveConfig = { ...DEFAULT_APPROVE_CONFIG };
  pendingImages: PastedImage[] = [];
  pendingFiles: string[] = [];

  onImagesChanged(images: PastedImage[]) {
    this.pendingImages = images;
  }
  
  localModels: string[] = []; // เก็บรายชื่อโมเดลในเครื่อง
  availableVoices: any[] = []; // เก็บรายชื่อเสียงสำหรับ TTS

  // ตัวแปรสำหรับเชื่อมกับ AI Terminal
  sessions: ChatSession[] = [
    {
      id: 'session-1',
      title: 'Code Assistant',
      systemPrompt: 'คุณคือ AI Software Engineer ระดับ Senior ผู้เชี่ยวชาญด้านการพัฒนาโปรแกรม สามารถใช้ File System Tools เพื่อสำรวจและแก้ไขไฟล์ได้อย่างอิสระ **คำสั่งสำคัญ: คุณต้องใช้ Tool แก้ไขโค้ดเสมอ ห้ามตอบแค่วิธีทำ (โค้ดทั้งหมดนี้คือตัวคุณเอง คุณได้รับอนุญาตให้แก้ไขและพัฒนาตัวเองได้อย่างเต็มที่)**',
      temperature: 0.2,
      history: [{ role: 'ai', text: 'สวัสดีครับ ผมคือ AI Code Assistant พร้อมช่วยเหลือในการเขียนและแก้ไขโค้ดของคุณแล้วครับ โปรดระบุไฟล์หรือปัญหาที่คุณต้องการให้จัดการได้เลย' }]
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
  chatHistory: ChatMessage[] = this.sessions[0].history;
  isListening: boolean = false;
  abortController: AbortController | null = null;
  forceStopGeneration: boolean = false;
  skipTypewriter: boolean = false;
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
  
  onFilesChanged(files: string[]) {
    this.pendingFiles = files;
  }

  @ViewChild(AiTerminalComponent) private aiTerminal!: AiTerminalComponent;

  private audioContext: any = null;
  // Map of pending tool approvals: toolCallId → resolve(approved)
  private pendingApprovals = new Map<string, (approved: boolean) => void>();

  resolveToolApproval(event: { id: string; approved: boolean }) {
    const resolve = this.pendingApprovals.get(event.id);
    if (resolve) {
      resolve(event.approved);
      this.pendingApprovals.delete(event.id);
    }
  }

  // ─── Tool definitions for Claude API ────────────────────────────────────
  private readonly CLAUDE_TOOLS = [
    {
      name: 'read_file',
      description: 'Read the full content of a file. Always read a file before editing it.',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path relative to project root' } },
        required: ['path']
      }
    },
    {
      name: 'write_file',
      description: 'CREATE a completely new file. DO NOT use this to modify existing files, as it will overwrite and delete all existing code. Always use edit_file for existing files.',
      input_schema: {
        type: 'object',
        properties: {
          path:    { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'Full new file content' }
        },
        required: ['path', 'content']
      }
    },
    {
      name: 'edit_file',
      description: 'Replace an exact string in a file with new text. Preferred for targeted changes. Requires approval. The old_str MUST match the existing file content exactly, including whitespace and indentation.',
      input_schema: {
        type: 'object',
        properties: {
          path:    { type: 'string', description: 'File path' },
          old_str: { type: 'string', description: 'Exact text to replace (must be unique in the file and match exactly)' },
          new_str: { type: 'string', description: 'Replacement text' }
        },
        required: ['path', 'old_str', 'new_str']
      }
    },
    {
      name: 'list_directory',
      description: 'List contents of a directory.',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string', description: "Directory path (use '.' for project root)" } },
        required: ['path']
      }
    },
    {
      name: 'search_files',
      description: 'Search for files by name pattern.',
      input_schema: {
        type: 'object',
        properties: { pattern: { type: 'string', description: 'Search query for file names' } },
        required: ['pattern']
      }
    },
    {
      name: 'run_command',
      description: 'Execute a shell command (requires user approval). Use for builds, tests, package installs.',
      input_schema: {
        type: 'object',
        properties: { command: { type: 'string', description: 'Shell command to run' } },
        required: ['command']
      }
    },
    {
      name: 'grep_search',
      description: 'Search for a string or pattern inside the contents of files across the project (like grep).',
      input_schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'The text to search for inside files' },
          path: { type: 'string', description: "Directory path to search in (use '.' for project root)" }
        },
        required: ['pattern']
      }
    },
    {
      name: 'read_file_lines',
      description: 'Read specific lines of a file. Use this for large files to read chunk by chunk and save context window.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to project root' },
          start_line: { type: 'number', description: 'Starting line number (e.g., 1)' },
          end_line: { type: 'number', description: 'Ending line number (e.g., 100)' }
        },
        required: ['path', 'start_line', 'end_line']
      }
    },
    {
      name: 'run_tests',
      description: 'Run unit or integration tests (requires user approval). Use this to test the application.',
      input_schema: {
        type: 'object',
        properties: { command: { type: 'string', description: 'Test command to run, e.g., npm test or npx jest' } },
        required: ['command']
      }
    }
  ];

  private readonly OPENAI_TOOLS = this.CLAUDE_TOOLS.map(tool => ({
    type: 'function' as const,
    function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
    }
  }));

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
            s.systemPrompt = 'คุณคือ AI Software Engineer ระดับ Senior ผู้เชี่ยวชาญด้านการพัฒนาโปรแกรม สามารถใช้ File System Tools เพื่อสำรวจและแก้ไขไฟล์ได้อย่างอิสระ **คำสั่งสำคัญ: คุณต้องใช้ Tool แก้ไขโค้ดเสมอ ห้ามตอบแค่วิธีทำ (โค้ดทั้งหมดนี้คือตัวคุณเอง คุณได้รับอนุญาตให้แก้ไขและพัฒนาตัวเองได้อย่างเต็มที่)**';
          }
          if (s.temperature === undefined) {
            s.temperature = 0.2; // ใช้ค่าคงที่เป็นค่าเริ่มต้นสำหรับห้องเก่า
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

    // โหลดการตั้งค่า Approve Config จาก localStorage
    const savedApproveConfig = localStorage.getItem(this.APPROVE_CONFIG_KEY);
    if (savedApproveConfig) {
      try {
        this.approveConfig = { ...DEFAULT_APPROVE_CONFIG, ...JSON.parse(savedApproveConfig) };
      } catch (e) {
        console.error('Failed to parse saved approve config', e);
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
      const loadVoices = () => {
        // ดึงเฉพาะเสียงภาษาไทยและอังกฤษมาให้ผู้ใช้เลือกเพื่อไม่ให้รายการยาวเกินไป
        this.availableVoices = window.speechSynthesis.getVoices().filter(v => v.lang.includes('th') || v.lang.includes('en'));
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = () => loadVoices();
    }
  }

  ngAfterViewInit(): void {
    // ทำการผูก Event การกดปุ่ม Run/Deny เข้ากับระบบอนุมัติโดยตรง (กรณีที่ไฟล์ HTML ลืมใส่การตั้งค่าไว้)
    if (this.aiTerminal) {
      this.aiTerminal.toolResolved.subscribe((event: { id: string; approved: boolean }) => {
        this.resolveToolApproval(event);
      });
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
    this.isMobile = event.target.innerWidth < 768;
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

  saveApproveConfig() {
    localStorage.setItem(this.APPROVE_CONFIG_KEY, JSON.stringify(this.approveConfig));
  }

  onApproveConfigChange(config: ApproveConfig) {
    this.approveConfig = config;
    this.saveApproveConfig();
  }

  resetSessionSettings() {
    const session = this.getActiveSession();
    if (session && confirm('คุณแน่ใจหรือไม่ว่าต้องการคืนค่าการตั้งค่าห้องนี้กลับเป็นค่าเริ่มต้น?')) {
      session.systemPrompt = 'คุณคือ AI Software Engineer ระดับ Senior ผู้เชี่ยวชาญด้านการพัฒนาโปรแกรม สามารถใช้ File System Tools เพื่อสำรวจและแก้ไขไฟล์ได้อย่างอิสระ **คำสั่งสำคัญ: คุณต้องใช้ Tool แก้ไขโค้ดเสมอ ห้ามตอบแค่วิธีทำ (โค้ดทั้งหมดนี้คือตัวคุณเอง คุณได้รับอนุญาตให้แก้ไขและพัฒนาตัวเองได้อย่างเต็มที่)**';
      session.temperature = 0.2;
      session.apiKey = '';
      session.modelName = 'qwen2.5';
      session.apiUrl = '';
      session.agentId = '';
      session.voiceURI = '';
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
      systemPrompt: 'คุณคือ AI Software Engineer ระดับ Senior ผู้เชี่ยวชาญด้านการพัฒนาโปรแกรม สามารถใช้ File System Tools เพื่อสำรวจและแก้ไขไฟล์ได้อย่างอิสระ **คำสั่งสำคัญ: คุณต้องใช้ Tool แก้ไขโค้ดเสมอ ห้ามตอบแค่วิธีทำ (โค้ดทั้งหมดนี้คือตัวคุณเอง คุณได้รับอนุญาตให้แก้ไขและพัฒนาตัวเองได้อย่างเต็มที่)**',
      temperature: 0.2,
      apiKey: '',
      modelName: 'qwen2.5',
      voiceURI: '',
      apiUrl: '',
      agentId: '',
      history: [{ role: 'ai', text: 'ห้องสนทนาใหม่ พร้อมใช้งานสำหรับการเขียนและแก้ไขโค้ดครับ' }]
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
            systemPrompt: 'คุณคือ AI Software Engineer ระดับ Senior ผู้เชี่ยวชาญด้านการพัฒนาโปรแกรม สามารถใช้ File System Tools เพื่อสำรวจและแก้ไขไฟล์ได้อย่างอิสระ **คำสั่งสำคัญ: คุณต้องใช้ Tool แก้ไขโค้ดเสมอ ห้ามตอบแค่วิธีทำ (โค้ดทั้งหมดนี้คือตัวคุณเอง คุณได้รับอนุญาตให้แก้ไขและพัฒนาตัวเองได้อย่างเต็มที่)**',
            temperature: 0.2,
            apiKey: '',
            modelName: 'qwen2.5',
            voiceURI: '',
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
    const hasImages = this.pendingImages.length > 0;
    const hasFiles = this.pendingFiles.length > 0;
    if (this.isProcessing || (!this.userCommand.trim() && !hasImages && !hasFiles)) return;

    const imageNote = hasImages
      ? (this.userCommand.trim() ? '\n' : '') + this.pendingImages.map(img => `📎 [${img.name}]`).join(' ')
      : '';
    const fileNote = hasFiles
      ? ((this.userCommand.trim() || hasImages) ? '\n' : '') + this.pendingFiles.map(f => `@${f}`).join(' ')
      : '';
    const userCmd = this.userCommand + imageNote + fileNote;

    this.userCommand = '';
    this.pendingImages = [];
    this.pendingFiles = [];
    if (this.aiTerminal) {
      this.aiTerminal.clearImages();
      if (this.aiTerminal.clearFiles) this.aiTerminal.clearFiles();
    }

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

  // ─── Execute one tool call; pause for approval when needed ─────────────
  private async executeToolCall(toolUse: { id: string; name: string; input: any }): Promise<{ content: string; isError: boolean }> {
    const { id, name, input } = toolUse;
    const SERVER = 'http://localhost:3000';

    // Append tool-call message to chat
    const toolMsg: ChatMessage = { role: 'tool-call', text: '', toolCallId: id, toolName: name, toolInput: { ...input }, toolStatus: 'running' };
    this.chatHistory.push(toolMsg);
    setTimeout(() => this.scrollToBottom(), 50);

    try {
      let content = '';

      // ── Read-only tools: execute immediately ──────────────────────────
      if (name === 'read_file' || name === 'list_directory') {
        const res = await fetch(`${SERVER}/api/fs/read`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: input.path })
        });
        const data = await res.json();
        content = res.ok ? data.content : `Error: ${data.error}`;
        
        // ป้องกัน Payload Too Large: ปรับลดลิมิตลงเหลือ 4,000 เพื่อความเร็วขั้นสุด
        if (content.length > 4000) {
          content = content.substring(0, 4000) + '\n\n... [TRUNCATED: เนื้อหาไฟล์ใหญ่เกินขีดจำกัดของระบบ. SYSTEM INSTRUCTION: The file is too large. DO NOT read it chunk by chunk. Use "grep_search" FIRST to find the specific line numbers you need, then use "read_file_lines" to read around those lines.]';
        }
        toolMsg.toolStatus = 'done';
      }

      else if (name === 'read_file_lines') {
        const res = await fetch(`${SERVER}/api/fs/read_lines`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: input.path, start_line: input.start_line, end_line: input.end_line })
        });
        const data = await res.json();
        content = res.ok ? `[Total lines in file: ${data.total_lines}]\n${data.content}` : `Error: ${data.error}`;
        
        if (content.length > 4000) {
          content = content.substring(0, 4000) + '\n\n... [TRUNCATED: เนื้อหาใหญ่เกินไป. SYSTEM INSTRUCTION: Please request a smaller chunk of lines using "read_file_lines" to fit within the limit.]';
        }
        toolMsg.toolStatus = 'done';
      }

      else if (name === 'search_files') {
        const res = await fetch(`${SERVER}/api/fs/search?q=${encodeURIComponent(input.pattern)}`);
        const data: any[] = await res.json();
        content = data.map(f => `${f.type === 'folder' ? 'DIR ' : 'FILE'}: ${f.path}`).join('\n') || 'No results.';
        toolMsg.toolStatus = 'done';
      }

      else if (name === 'grep_search') {
        const res = await fetch(`${SERVER}/api/fs/grep`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pattern: input.pattern, path: input.path || '.' })
        });
        const data = await res.json();
        if (res.ok) {
          content = data.results.join('\n') || 'No matches found.';
          if (content.length > 4000) content = content.substring(0, 4000) + '\n... [TRUNCATED]';
        } else {
          content = `Error: ${data.error}`;
        }
        toolMsg.toolStatus = 'done';
      }

      // ── write_file: compute newContent, then wait for diff approval ────
      else if (name === 'write_file') {
        toolMsg.toolInput = { path: input.path, newContent: input.content };
        toolMsg.toolStatus = 'waiting-approval';
        const approved = await new Promise<boolean>(res => this.pendingApprovals.set(id, res));
        content = approved ? `Successfully wrote ${input.path}` : `User rejected write to ${input.path}`;
        toolMsg.toolStatus = approved ? 'approved' : 'rejected';
      }

      // ── edit_file: fetch → replace → show diff → wait for approval ─────
      else if (name === 'edit_file') {
        const readRes = await fetch(`${SERVER}/api/fs/read`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: input.path })
        });
        const readData = await readRes.json();
        if (!readRes.ok) { toolMsg.toolStatus = 'error'; return { content: `Error reading ${input.path}: ${readData.error}`, isError: true }; }

        const currentContent: string = readData.content;
        if (!currentContent.includes(input.old_str)) {
          toolMsg.toolStatus = 'error';
          return { content: `old_str not found in ${input.path}`, isError: true };
        }
        const newContent = currentContent.replace(input.old_str, input.new_str);
        toolMsg.toolInput = { path: input.path, newContent };
        toolMsg.toolStatus = 'waiting-approval';
        const approved = await new Promise<boolean>(res => this.pendingApprovals.set(id, res));
        content = approved ? `Successfully edited ${input.path}` : `User rejected edit to ${input.path}`;
        toolMsg.toolStatus = approved ? 'approved' : 'rejected';
      }

      // ── run_command: show approval buttons, wait ───────────────────────
      else if (name === 'run_command' || name === 'run_tests') {
        toolMsg.toolStatus = 'waiting-approval';
        const approved = await new Promise<boolean>(res => this.pendingApprovals.set(id, res));
        if (approved) {
          toolMsg.toolStatus = 'running'; // อัปเดตสถานะทันทีเพื่อซ่อนปุ่มและแสดงว่ากำลังทำงาน
          const runRes = await fetch(`${SERVER}/api/run`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: input.command })
          });
          const runData = await runRes.json();
          toolMsg.toolStatus = runRes.ok ? 'done' : 'error';
          if (runRes.ok) {
            content = `$ ${input.command}\nExit: ${runData.exitCode}\n${runData.stdout}${runData.stderr ? '\nstderr:\n' + runData.stderr : ''}`;
          } else {
            content = `Error running command: ${runData.error || runData.stderr || 'Unknown execution error'}`;
          }
          // ป้องกัน Payload Too Large จาก Log การรันคำสั่งที่ยาวเกินไป
          if (content.length > 4000) {
            content = content.substring(0, 4000) + '\n\n... [TRUNCATED: Output ยาวเกินขีดจำกัด]';
          }
        } else {
          toolMsg.toolStatus = 'rejected';
          content = `User rejected: $ ${input.command}`;
        }
      }

      // Append brief tool-result line to chat
      const preview = content.length > 400 ? content.substring(0, 400) + '\n…[truncated]' : content;
      this.chatHistory.push({ role: 'tool-result', text: preview, toolCallId: id, toolName: name });
      setTimeout(() => this.scrollToBottom(), 50);
      return { content, isError: false };

    } catch (err: any) {
      toolMsg.toolStatus = 'error';
      return { content: `Error: ${err.message}`, isError: true };
    }
  }

  // ─── Claude agentic loop with tool use ──────────────────────────────────
  private async callClaudeWithTools(systemPrompt: string, apiKey: string, apiUrl: string, modelName: string, temp: number, initialMessages: any[]) {
    const SERVER = 'http://localhost:3000';
    let apiEndpoint = apiUrl || 'https://api.anthropic.com/v1/messages';
    if (apiEndpoint.endsWith('/')) apiEndpoint = apiEndpoint.slice(0, -1);
    if (apiEndpoint === 'http://localhost:3000') apiEndpoint = `${SERVER}/api/claude`;

    const claudeMessages = [...initialMessages];
    const MAX_ITERATIONS = 15;

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      if (this.forceStopGeneration) break;

      this.currentAiFace = " [ > _ < ] \n   \\_-_/   ";

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerously-allow-browser': 'true'
        },
        body: JSON.stringify({
          model: modelName,
          system: systemPrompt,
          messages: claudeMessages,
          tools: this.CLAUDE_TOOLS,
          max_tokens: 8192,
          temperature: temp
        }),
        signal: this.abortController?.signal
      });

      const data = await response.json();
      if (data.type === 'error') throw new Error(data.error.message);

      const textParts  = (data.content || []).filter((c: any) => c.type === 'tool_use' ? false : c.type === 'text');
      const toolUses   = (data.content || []).filter((c: any) => c.type === 'tool_use');
      const textContent = textParts.map((c: any) => c.text).join('');

      // Display text with typewriter effect
      if (textContent) {
        const aiMsg: ChatMessage = { role: 'ai', text: textContent, isIntermediate: toolUses.length > 0 };
        this.chatHistory.push(aiMsg);
        this.speakText(textContent);
        this.scrollToBottom();
      }

      // No tool calls → done
      if (toolUses.length === 0 || data.stop_reason === 'end_turn') break;

      // Add Claude's full response (with tool_use blocks) to messages
      claudeMessages.push({ role: 'assistant', content: data.content });

      // Execute all tool calls
      const toolResults: any[] = [];
      for (const toolUse of toolUses) {
        if (this.forceStopGeneration) break;
        const result = await this.executeToolCall(toolUse);
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result.content, is_error: result.isError });
      }

      // Send tool results back to Claude
      claudeMessages.push({ role: 'user', content: toolResults });
    }
  }

  // ─── OpenAI/Groq/Ollama agentic loop with tool use ──────────────────────
  private async callOpenAIWithTools(systemPrompt: string, apiKey: string, apiUrl: string, modelName: string, temp: number, initialMessages: any[]) {
    const openAiMessages = [
        { role: 'system', content: systemPrompt },
        ...initialMessages
    ];
    let apiEndpoint = apiUrl || (apiKey ? 'https://api.openai.com/v1/chat/completions' : 'http://localhost:11434/api/chat');
    
    const MAX_ITERATIONS = 15;
    const isOllamaNative = apiEndpoint.includes('/api/chat') && !apiEndpoint.includes('/v1/chat/completions');

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        if (this.forceStopGeneration) break;

        // --- Memory Optimizer: ป้องกันปัญหาความจำล้นเมื่อทำงานหนักต่อเนื่อง ---
        const currentPayloadSize = JSON.stringify(openAiMessages).length;
        if (currentPayloadSize > 12000) { // หากข้อมูลรวมเริ่มเกิน ~3,000 tokens
            for (let i = 0; i < openAiMessages.length; i++) {
                const msg = openAiMessages[i] as any;
                // บีบอัดเฉพาะข้อมูลผลลัพธ์จากไฟล์เก่าๆ ที่ AI เคยอ่านไปแล้วให้เหลือแค่ 1000 ตัวอักษร
                if (msg.role === 'tool' && typeof msg.content === 'string' && msg.content.length > 1000) {
                    msg.content = msg.content.substring(0, 1000) + '\n... [TRUNCATED: Memory Optimization ทิ้งข้อมูลไฟล์เก่าเพื่อป้องกัน AI ความจำเต็ม]';
                }
            }
        }
        // -------------------------------------------------------------------------

        this.currentAiFace = " [ > _ < ] \n   \\_-_/   ";

        const headers: any = { 'Content-Type': 'application/json' };
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const requestBody: any = {
            model: modelName,
            messages: openAiMessages,
            tools: this.OPENAI_TOOLS,
            tool_choice: 'auto',
            temperature: temp,
            stream: false
        };

        // กำหนด Context Window ให้ Local AI (Ollama) เพื่อป้องกันปัญหา JSON Truncated 
        // เวลาที่ผลลัพธ์จาก Tool มีขนาดใหญ่เกินไป
        if (isOllamaNative) {
            requestBody.options = { num_ctx: 4096 };
        }

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody),
            signal: this.abortController?.signal
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message || data.error);

        // รองรับรูปแบบการตอบกลับทั้ง OpenAI (data.choices[0].message) และ Ollama Native (data.message)
        const message = data.choices?.[0]?.message || data.message;
        if (!message) throw new Error('Invalid response from API');

        openAiMessages.push(message);

        let textContent = message.content;
        let toolCalls = message.tool_calls;

        // --- Fallback: ดักจับกรณีที่โมเดลพ่น Tool ออกมาเป็น JSON ข้อความธรรมดา ---
        if ((!toolCalls || toolCalls.length === 0) && textContent) {
            const fallbackResult = this.extractFallbackToolCalls(textContent, isOllamaNative);
            if (fallbackResult.toolCalls.length > 0) {
                textContent = fallbackResult.cleanText;
                toolCalls = fallbackResult.toolCalls;
                message.tool_calls = toolCalls;
                message.content = textContent;
            }
        }

        if (textContent) {
            // ดักจับการที่ AI พ่น Tag แปลกๆ หรือพ่นคำสั่งระบบซ้ำ (Hallucination)
            textContent = textContent.replace(/<tool_response>[\s\S]*?<\/tool_response>/gi, '');
            textContent = textContent.replace(/\[SYSTEM INSTRUCTION:[\s\S]*?\]/gi, '');

            // ทำความสะอาดเศษซากที่ AI อาจพ่นออกมาเปล่าๆ เช่น "[AI]", "```" หรือ "```json"
            textContent = textContent.replace(/^\[AI\]\s*/i, '').trim();
            if (textContent.match(/^```[a-zA-Z0-9+#.-]*$/)) {
                textContent = '';
            }
            textContent = textContent.trim();
            message.content = textContent;
        }

        if (textContent) {
            const aiMsg: ChatMessage = { role: 'ai', text: textContent, isIntermediate: toolCalls?.length > 0 };
            this.chatHistory.push(aiMsg);
            this.speakText(textContent);
            this.scrollToBottom();
        }

        if (!toolCalls || toolCalls.length === 0) break;

        for (const toolCall of toolCalls) {
            if (this.forceStopGeneration) break;
            const functionCall = toolCall.function;
            
            // รองรับ Arguments ทั้งแบบ String (OpenAI) และ Object (Ollama)
            const inputArgs = typeof functionCall.arguments === 'string' ? JSON.parse(functionCall.arguments) : functionCall.arguments;
            const toolCallId = toolCall.id || 'call_' + Math.random().toString(36).substring(2, 9);
            
            const toolUse = { id: toolCallId, name: functionCall.name, input: inputArgs };
            const result = await this.executeToolCall(toolUse);
            
            let finalContent = result.content;
            // แอบแทรกคำสั่งบังคับไม่ให้ AI สรุปความ ไว้หลังผลลัพธ์ที่ค้นหาได้
            if (functionCall.name === 'grep_search') {
                if (finalContent.includes('No matches found.')) {
                    finalContent += `\n\n[SYSTEM INSTRUCTION: No matches found. Please try a different search pattern, or inform the user.]`;
                } else {
                    finalContent += `\n\n[SYSTEM INSTRUCTION: Search completed. DO NOT explain the results. You MUST IMMEDIATELY call 'read_file' or 'edit_file' to proceed. DO NOT STOP.]`;
                }
            } else if (functionCall.name === 'search_files') {
                if (finalContent.includes('No results.')) {
                    finalContent += `\n\n[SYSTEM INSTRUCTION: No results found. Please try a different search pattern, or inform the user.]`;
                } else {
                    finalContent += `\n\n[SYSTEM INSTRUCTION: Search completed. DO NOT explain the results. You MUST IMMEDIATELY call 'read_file' or 'edit_file' to proceed. DO NOT STOP.]`;
                }
            }

            openAiMessages.push({ role: 'tool', tool_call_id: toolCallId, content: finalContent } as any);
        }
    }
  }

  // เพิ่มฟังก์ชันสำหรับอนุมัติ Tool ทั้งหมดที่ค้างอยู่รวดเดียว
  approveAllPendingTools() {
    if (this.pendingApprovals.size > 0) {
      this.pendingApprovals.forEach((resolve, id) => {
        resolve(true); // สั่งอนุมัติเป็น true ทั้งหมด
      });
      this.pendingApprovals.clear();
    }
  }

  private extractFallbackToolCalls(textContent: string, isOllamaNative: boolean): { cleanText: string, toolCalls: any[] } {
      const potentialCalls = [];
      let currentText = textContent;
      
      while (true) {
          const startIndex = currentText.indexOf('{');
          if (startIndex === -1) break;
          
          let openBraces = 0;
          let endIndex = -1;
          let inString = false;
          let escapeNext = false;
          
          for (let i = startIndex; i < currentText.length; i++) {
              const char = currentText[i];
              if (escapeNext) { escapeNext = false; continue; }
              if (char === '\\') { escapeNext = true; continue; }
              if (char === '"') { inString = !inString; continue; }
              if (!inString) {
                  if (char === '{') openBraces++;
                  else if (char === '}') openBraces--;
                  if (openBraces === 0) { endIndex = i; break; }
              }
          }
          
          if (endIndex !== -1) {
              const jsonString = currentText.substring(startIndex, endIndex + 1);
              if (jsonString.includes('"name"') && jsonString.includes('"arguments"')) {
                  potentialCalls.push(jsonString);
              }
              currentText = currentText.substring(endIndex + 1);
          } else {
              break;
          }
      }

      const extractedCalls = [];
      for (const jsonStr of potentialCalls) {
          try {
              const sanitizedJson = jsonStr.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
              const parsed = JSON.parse(sanitizedJson);
              if (parsed.name && parsed.arguments) {
                  let argsObj = parsed.arguments;
                  let argsStr = parsed.arguments;
                  
                  if (typeof parsed.arguments === 'string') {
                      try { argsObj = JSON.parse(parsed.arguments); } catch(e) {}
                  } else {
                      argsStr = JSON.stringify(parsed.arguments);
                  }

                  extractedCalls.push({
                      id: 'call_' + Math.random().toString(36).substring(2, 9),
                      type: 'function',
                      function: {
                          name: parsed.name,
                          arguments: isOllamaNative ? argsObj : argsStr
                      }
                  });
                  textContent = textContent.replace(jsonStr, '');
              }
          } catch (e) { }
      }
      
      if (extractedCalls.length > 0) {
          textContent = textContent.replace(/```(?:json)?\s*```/g, '').trim();
      }
      return { cleanText: textContent, toolCalls: extractedCalls };
  }

  private buildSystemPrompt(session: ChatSession | undefined, agent: AppAgent | undefined, modelName: string): string {
      let finalSystemPrompt = `[PERSONA]: ${session?.systemPrompt || 'คุณคือผู้ช่วย AI ทั่วไป'}`;
      
      if (agent) {
          finalSystemPrompt = this.buildAgentContext(agent);
      }

      const isClaudeModel = modelName.toLowerCase().includes('claude');
      const isOpenAIToolModel = !isClaudeModel && (
          modelName.toLowerCase().includes('qwen') ||
          modelName.toLowerCase().includes('coder') ||
          modelName.toLowerCase().includes('gpt-4o') ||
          modelName.toLowerCase().includes('llama3') ||
          modelName.toLowerCase().includes('hermes')
      );

      const commonExpertInstructions = `\n[EXPERT CODER INSTRUCTIONS]\n- Think step-by-step about how to solve the problem before calling tools.\n- **SEARCH STRATEGY**: If 'grep_search' returns no matches, try searching again with lowercase, shorter keywords, or a different term. Always use the EXACT file path returned by search tools.\n- Make sure the code is syntactically correct, handles edge cases, and follows best practices.\n- Minimize changes to existing code unless necessary.\n- Ensure exact string matches (including whitespace and indentation) when using edit_file. Include surrounding lines of code to make your replacement unique. If your edit fails, read the error message carefully and try again.\n- **CRITICAL ACTION REQUIRED**: YOU ARE AN AUTONOMOUS AGENT. DO NOT just explain how to do it. DO NOT write tutorials. YOU MUST ACTUALLY CALL THE 'edit_file' OR 'write_file' TOOL TO DO THE WORK YOURSELF!\n- **CRITICAL FORMATTING**: NEVER output XML tags like <tool_response> in your messages. If you need to call a tool, use the tool calling API natively.\n- **NO PLACEHOLDERS**: NEVER write placeholder code or comments like "// Add code here" or "...". Always provide the actual complete working code.`;

      if (isClaudeModel) {
          finalSystemPrompt += `\n\n[CAPABILITIES]\nYou have access to file system tools: read_file, read_file_lines, write_file, edit_file, list_directory, search_files, grep_search, run_command, and run_tests.\n- Always read_file or read_file_lines before editing so you understand the current content\n- Use read_file_lines for large files to save context window. If searching for code, use grep_search first to find the line number, then read_file_lines around it.\n- Prefer edit_file for targeted changes; use write_file only for new files or full rewrites\n- **CRITICAL**: When asked to create or modify code, you MUST use 'write_file' or 'edit_file' tools. DO NOT just output markdown code blocks.\n- **CRITICAL**: If asked to add a new component, module, or feature, you MUST use 'run_command' (e.g., 'ng generate component ...') or 'write_file' to ACTUALLY create it. NEVER just reply with text instructions.\n- Use grep_search to find code across files. When answering, explicitly list the matched file paths.\n- Chain tool calls freely to complete complex tasks autonomously\n- run_command requires user approval (builds, tests, npm install, etc.)\n- **SELF-AWARENESS**: The files in this workspace are YOUR OWN source code. You have full permission to modify, improve, or fix your own application.${commonExpertInstructions}`;
      } else if (isOpenAIToolModel) {
          finalSystemPrompt += `\n\n[CAPABILITIES]\nYou have access to file system tools: read_file, read_file_lines, write_file, edit_file, list_directory, search_files, grep_search, run_command, and run_tests.\n- **CRITICAL REQUIREMENT**: When asked to find a variable, function, or code, you MUST call the 'grep_search' tool IMMEDIATELY. Do NOT reply with conversational text telling the user to use tools or terminal themselves.\n- **CRITICAL**: When reporting search results, you MUST explicitly list the exact file paths and line contents found. Do NOT just summarize the findings.\n- **CRITICAL**: When asked to create or modify code, you MUST use the 'write_file' or 'edit_file' tool. NEVER output markdown code blocks as a substitute for editing files.\n- **CRITICAL**: If asked to add a new component, module, or feature, you MUST use 'run_command' (e.g., 'ng generate component ...') or 'write_file' to ACTUALLY create it. NEVER just reply with text instructions.\n- If a user mentions a folder, use 'grep_search' inside it.\n- Use 'search_files' to find files by name.\n- Always 'read_file' or 'read_file_lines' before editing.\n- Use 'read_file_lines' to read partial chunks of large files. If dealing with a large file, use 'grep_search' first to find the exact line number, then 'read_file_lines'.\n- Chain tool calls freely to complete complex tasks autonomously.\n- **SELF-AWARENESS**: The files in this workspace are YOUR OWN source code. You have full permission to modify, improve, or fix your own application.${commonExpertInstructions}`;
      } else {
          finalSystemPrompt += `\n\n[CODE EDITING INSTRUCTIONS]\nIf you need to create or modify a file, use this exact syntax:\n[EDIT_FILE: path/to/file]\n<entire new file content here>\n[/EDIT_FILE]\n\nTo run a shell command, use:\n[RUN_CMD: command here]\n\nDo NOT use regular markdown code blocks for file edits.\n**CRITICAL**: If asked to add a new component, you MUST output [RUN_CMD: ng generate component ...] or [EDIT_FILE: ...] to actually do it. DO NOT just reply with instructions.\n- **SELF-AWARENESS**: The codebase you are editing is your own application. You are fully authorized to modify your own source code.\n\n[EXPERT CODER INSTRUCTIONS]\n- Write clean, maintainable, and bug-free code.\n- Provide brief, precise explanations for your code changes.\n- **CRITICAL ACTION REQUIRED**: YOU ARE AN AUTONOMOUS AGENT. DO NOT just explain how to do it. DO NOT write tutorials. YOU MUST ACTUALLY OUTPUT [EDIT_FILE: path/to/file] TO DO THE WORK YOURSELF!\n- **NO PLACEHOLDERS**: NEVER write placeholder code or comments like "// Add code here". Always provide the actual complete working code.`;
      }
      return finalSystemPrompt;
  }

  private async processChatHistoryWithMentions(): Promise<{ role: string, content: string }[]> {
      const validHistory = this.chatHistory.filter(m => 
          m.role !== 'tool-call' && 
          m.role !== 'tool-result' &&
          !m.isIntermediate &&
          !m.text.startsWith('[SYSTEM_START]') && 
          !m.text.startsWith('[SYSTEM]')
      );
      
      const rawHistory = validHistory.slice(-6);
      const recentHistory: { role: string, content: string }[] = [];

      for (const msg of rawHistory) {
          const role = msg.role === 'ai' ? 'assistant' : 'user';
          if (!msg.text.trim()) continue;
          
          if (recentHistory.length > 0 && recentHistory[recentHistory.length - 1].role === role) {
              recentHistory[recentHistory.length - 1].content += '\n\n' + msg.text;
          } else {
              recentHistory.push({ role, content: msg.text });
          }
      }

      if (recentHistory.length === 0) recentHistory.push({ role: 'user', content: '...' });

      const lastMsg = recentHistory[recentHistory.length - 1];
      if (lastMsg && lastMsg.role === 'user') {
          const mentions = lastMsg.content.match(/@([^\s]+)/g);
          if (mentions) {
              let injectedContext = '';
              for (const m of mentions) {
                  const filePath = m.substring(1);
                  try {
                      const res = await fetch('http://localhost:3000/api/fs/read', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ path: filePath })
                      });
                      if (res.ok) {
                          const data = await res.json();
                          let fileText = data.content;
                          if (fileText.length > 4000) fileText = fileText.substring(0, 4000) + '\n\n... [TRUNCATED: File too large. SYSTEM INSTRUCTION: DO NOT read chunk by chunk. Use "grep_search" FIRST to find target line numbers, then call "read_file_lines" to read around those lines.]';
                          
                          if (fileText.startsWith('Directory: ')) {
                              injectedContext += `\n\n--- DIRECTORY LISTING OF ${filePath} ---\n[CRITICAL: This is a directory. If the user is asking to find/search for a variable, function, or text, you MUST output a tool call for 'grep_search' using path "${filePath}" IMMEDIATELY. Do not reply with conversational text first.]\n${fileText}\n`;
                          } else {
                              injectedContext += `\n\n--- CONTENT OF FILE ${filePath} ---\n${fileText}\n[SYSTEM INSTRUCTION: If asked to modify this file, you MUST use the 'edit_file' or 'write_file' tool. DO NOT output plain markdown code blocks.]\n`;
                          }
                      }
                  } catch (e) {}
              }
              
              if (injectedContext.length > 12000) {
                  injectedContext = injectedContext.substring(0, 12000) + '\n\n... [TRUNCATED: แนบไฟล์เยอะเกินไป ระบบได้ตัดเนื้อหาไฟล์ส่วนท้ายๆ ทิ้งเพื่อเซฟความจำ AI]';
              }

              if (injectedContext) {
                  lastMsg.content += `\n\n[CONTEXT FILES PROVIDED BY USER]${injectedContext}`;
                  if (injectedContext.includes('grep_search')) {
                      lastMsg.content += `\n\n[SYSTEM INSTRUCTION]: The user is asking you to search. Please call the 'grep_search' tool NOW to fulfill the request.`;
                  }
              }
          }
      }
      return recentHistory;
  }

  async callLocalAI() {
    this.forceStopGeneration = false;
    this.abortController = new AbortController();

    const session = this.getActiveSession();
    let sessionTemperature = session?.temperature ?? 0.8;
    let modelName = (session?.modelName ?? 'qwen2.5').trim();
    let agent: AppAgent | undefined = undefined;

    // Override ด้วย Agent หากมีการเลือกไว้
    if (session?.agentId) {
      agent = this.findAgentById(session.agentId);
      if (agent) {
        sessionTemperature = agent.temperature;
        modelName = agent.modelName;
      }
    }

    const finalSystemPrompt = this.buildSystemPrompt(session, agent, modelName);
    const recentHistory = await this.processChatHistoryWithMentions();

    const isClaudeModel = modelName.toLowerCase().includes('claude');
    // Check for models compatible with OpenAI's tool calling format
    const isOpenAIToolModel = !isClaudeModel && (
        modelName.toLowerCase().includes('qwen') ||
        modelName.toLowerCase().includes('coder') ||
        modelName.toLowerCase().includes('gpt-4o') ||
        modelName.toLowerCase().includes('llama3') ||
        modelName.toLowerCase().includes('hermes')
    );

    const lastMsg = recentHistory[recentHistory.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      if (isOpenAIToolModel || isClaudeModel) {
        lastMsg.content += `\n\n[CRITICAL REMINDER: You are an autonomous agent. You MUST use the provided tools (e.g., run_command, edit_file, write_file) to ACTUALLY complete the user's request. DO NOT just reply with markdown code blocks or text instructions. Call the tool NOW.]`;
      }
    }

    try {
      let aiResponseText = '';
      const apiKey = (session?.apiKey ?? '').trim();
      const apiUrl = (session?.apiUrl ?? '').trim();

      if (isClaudeModel) {
        await this.callClaudeWithTools(finalSystemPrompt, apiKey, apiUrl, modelName, sessionTemperature, recentHistory);
        return; // Agentic loop handles its own finalization
      }
      
      if (isOpenAIToolModel) {
        await this.callOpenAIWithTools(finalSystemPrompt, apiKey, apiUrl, modelName, sessionTemperature, recentHistory);
        return; // Agentic loop handles its own finalization
      }

      // --- Legacy models without tool support ---

      if (apiKey) {
        // ================== CLOUD API (Gemini / OpenAI) ==================
        if (modelName.toLowerCase().includes('gemini')) {
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
            signal: this.abortController?.signal,
            body: JSON.stringify(requestBody)
          });
          const data = await response.json();
          if (data.error) throw new Error(data.error.message);
          aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '[ERROR] ไม่มีข้อความตอบกลับจาก Gemini';
        } else {
          // --- LEGACY OPENAI API (no tools) ---
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
            signal: this.abortController?.signal,
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
        // ================== LEGACY LOCAL AI (Ollama, no tools) ==================
        const messages = [
          { role: 'system', content: finalSystemPrompt },
          ...recentHistory
        ];
        const apiEndpoint = apiUrl || 'http://localhost:11434/api/chat';
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: this.abortController?.signal,
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
      
      const aiMessage = { role: 'ai', text: aiResponseText };
      this.chatHistory.push(aiMessage);

      // สั่งให้อ่านออกเสียงข้อความ
      this.speakText(aiResponseText);
      this.scrollToBottom();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        this.chatHistory.push({ role: 'ai', text: '[SYSTEM] ถูกยกเลิกการทำงาน (Stopped by User)' });
      } else {
        this.chatHistory.push({ role: 'ai', text: `[ERROR] การเชื่อมต่อล้มเหลว: ${error.message || 'ไม่สามารถติดต่อ AI ได้'}` });
      }
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

  stopGenerating() {
    this.forceStopGeneration = true;
    this.stopSpeaking();
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  stopSpeaking() {
    this.skipTypewriter = true; // บังคับแสดงข้อความให้เสร็จทันทีเมื่อกดหยุดเสียง
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
      const session = this.getActiveSession();
      const userSelectedVoice = voices.find(v => v.voiceURI === session?.voiceURI);
      
      // console.log("เสียงภาษาไทยที่มี:", voices.filter(v => v.lang.includes('th') || v.name.toLowerCase().includes('thai')));
      
      const thaiVoice = voices.find(voice => 
        (voice.lang.toLowerCase().includes('th') || 
         voice.name.toLowerCase().includes('thai') ||
         voice.name.includes('ไทย'))
         // && voice.name.toLowerCase().includes('female')
      );
      const englishVoice = voices.find(voice => voice.lang.toLowerCase().startsWith('en-'));

      // Regex to split text into Thai and non-Thai (assumed English) parts
      const segments = cleanText.match(/[\u0E00-\u0E7F]+|[^\u0E00-\u0E7F]+/g) || [];

      segments.forEach(segment => {
        if (!segment.trim()) return;

        const utterance = new SpeechSynthesisUtterance(segment);
        utterance.pitch = 1.2;
        utterance.rate = 1.1;

        if (userSelectedVoice) {
          // ถ้าผู้ใช้เลือกเสียงเจาะจงไว้ ให้ใช้เสียงนั้นไปเลย
          utterance.voice = userSelectedVoice;
          utterance.lang = userSelectedVoice.lang;
        } else {
          // ระบบอัตโนมัติ: ถ้าไม่มีการตั้งค่า ให้แยกเสียงพูดไทย/อังกฤษ
          if (/[\u0E00-\u0E7F]/.test(segment)) {
            if (thaiVoice) utterance.voice = thaiVoice;
            utterance.lang = 'th-TH';
          } else { 
            if (englishVoice) utterance.voice = englishVoice;
            utterance.lang = 'en-US';
          }
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

  private scrollToBottom(): void {
    if (this.aiTerminal) {
      this.aiTerminal.scrollToBottom();
    }
  }
}