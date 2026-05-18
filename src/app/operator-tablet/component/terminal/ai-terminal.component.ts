import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { ApproveConfig, DEFAULT_APPROVE_CONFIG } from './approve-config.component';

export interface MessageFragment {
  type: 'text' | 'code' | 'file-edit';
  content: string;
  language?: string;
  filePath?: string;
}

export interface PastedImage {
  dataUrl: string;
  name: string;
}

// Extended chat message — supports plain text AND tool-call / tool-result display
export interface ChatMessage {
  role: string; // 'user' | 'ai' | 'tool-call' | 'tool-result'
  text: string;
  isIntermediate?: boolean; // ระบุว่าเป็นแค่ข้อความระหว่างใช้เครื่องมือหรือไม่
  // Tool call fields (only when role === 'tool-call')
  toolCallId?: string;
  toolName?: string;
  toolInput?: any;   // { path, newContent } for file tools; { command } for run_command
  toolStatus?: 'running' | 'waiting-approval' | 'approved' | 'rejected' | 'done' | 'error';
}

interface SlashCommand {
  name: string;
  description: string;
  usage: string;
}

// Human-readable labels for each tool
const TOOL_LABELS: Record<string, { icon: string; label: string }> = {
  read_file:       { icon: '📖', label: 'อ่านไฟล์' },
  read_file_lines: { icon: '📄', label: 'อ่านไฟล์บางส่วน' },
  write_file:      { icon: '✏️', label: 'เขียนไฟล์' },
  edit_file:       { icon: '✂️', label: 'แก้ไขไฟล์' },
  list_directory:  { icon: '📂', label: 'ดูโฟลเดอร์' },
  grep_search:     { icon: '🔎', label: 'ค้นหาโค้ดในไฟล์' },
  search_files:    { icon: '🔍', label: 'ค้นหาไฟล์' },
  run_command:     { icon: '▶', label: 'รันคำสั่ง' },
  run_tests:       { icon: '🧪', label: 'รันทดสอบ' },
};

@Component({
  selector: 'app-ai-terminal',
  templateUrl: './ai-terminal.component.html',
  styleUrls: ['./ai-terminal.component.scss']
})
export class AiTerminalComponent {
  @Input() currentAiFace: string = '';
  @Input() chatHistory: ChatMessage[] = [];
  @Input() isProcessing: boolean = false;
  @Input() isListening: boolean = false;
  @Input() userCommand: string = '';
  @Input() approveConfig: ApproveConfig = { ...DEFAULT_APPROVE_CONFIG };

  @Output() userCommandChange = new EventEmitter<string>();
  @Output() commandEntered = new EventEmitter<void>();
  @Output() toggleListen = new EventEmitter<void>();
  @Output() stopAudio = new EventEmitter<void>();
  @Output() stopGenerate = new EventEmitter<void>();
  @Output() imagesChanged = new EventEmitter<PastedImage[]>();
  @Output() filesChanged = new EventEmitter<string[]>();
  // Fired when user approves/rejects a tool call (file edit or run_command)
  @Output() toolResolved = new EventEmitter<{ id: string; approved: boolean }>();

  @ViewChild('chatLog') private chatLogContainer!: ElementRef;
  @ViewChild('textareaRef') private textareaRef!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('fileInput') private fileInputRef!: ElementRef<HTMLInputElement>;

  copiedCodeId: string | null = null;
  copiedIndex: number | null = null;

  // @ mention state
  showMentionDropdown = false;
  mentionResults: { path: string, type: string }[] = [];
  mentionStartIndex = -1;

  // Slash command state
  showSlashDropdown = false;
  filteredSlashCommands: SlashCommand[] = [];
  slashSelectedIndex = 0;

  // Image / file attachment state
  pastedImages: PastedImage[] = [];
  attachedFiles: string[] = [];
  isDragOver = false;

  readonly slashCommands: SlashCommand[] = [
    { name: '/sys',    description: 'เปลี่ยน System Prompt / บุคลิก AI',  usage: '/sys [ข้อความ]' },
    { name: '/name',   description: 'เปลี่ยนชื่อห้องสนทนา',               usage: '/name [ชื่อใหม่]' },
    { name: '/pin',    description: 'ปักหมุด / ถอนหมุดห้องสนทนา',         usage: '/pin' },
    { name: '/del',    description: 'ลบห้องสนทนานี้',                      usage: '/del' },
    { name: '/export', description: 'ส่งออกประวัติการสนทนาเป็นไฟล์ Text',  usage: '/export' },
    { name: '/clear',  description: 'ล้างประวัติการสนทนา',                 usage: '/clear [จำนวน]' },
    { name: '/help',   description: 'แสดงคำสั่งทั้งหมด',                   usage: '/help' },
  ];

  // ─── Tool call display helpers ─────────────────────────────────────────────

  getToolMeta(toolName?: string) {
    return TOOL_LABELS[toolName || ''] ?? { icon: '🔧', label: toolName ?? 'Tool' };
  }

  getToolPreview(chat: ChatMessage): string {
    if (!chat.toolInput) return '';
    const { toolName, toolInput } = chat;
    if (toolName === 'run_command' || toolName === 'run_tests') return `$ ${toolInput.command}`;
    if (toolName === 'read_file' || toolName === 'list_directory') return toolInput.path;
    if (toolName === 'read_file_lines') return `${toolInput.path} (Lines ${toolInput.start_line}-${toolInput.end_line})`;
    if (toolName === 'write_file' || toolName === 'edit_file') return toolInput.path;
    if (toolName === 'search_files') return toolInput.pattern;
    if (toolName === 'grep_search') return `"${toolInput.pattern}" in ${toolInput.path || '.'}`;
    return JSON.stringify(toolInput).substring(0, 80);
  }

  getToolStatusLabel(status?: string): string {
    const map: Record<string, string> = {
      'running': '⏳ กำลังทำงาน...',
      'waiting-approval': '⏸ รออนุมัติ',
      'approved': '✓ อนุมัติแล้ว',
      'rejected': '✕ ปฏิเสธ',
      'done': '✓ เสร็จสิ้น',
      'error': '⚠ ผิดพลาด',
    };
    return map[status || ''] ?? status ?? '';
  }

  onToolApproved(toolCallId: string) {
    this.toolResolved.emit({ id: toolCallId, approved: true });
  }

  onToolRejected(toolCallId: string) {
    this.toolResolved.emit({ id: toolCallId, approved: false });
  }

  // ─── Keyboard handler ──────────────────────────────────────────────────────

  onKeyDown(event: KeyboardEvent) {
    const key = event.key;

    if (key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!this.isProcessing && (this.userCommand.trim() || this.pastedImages.length > 0 || this.attachedFiles.length > 0)) {
        this.onEnter();
      }
      return;
    }

    if (key === 'Escape') {
      this.userCommand = '';
      this.emitCommand('');
      this.showMentionDropdown = false;
      this.showSlashDropdown = false;
      this.autoResize(event.target as HTMLTextAreaElement);
      return;
    }

    if (key === 'ArrowUp' && !this.userCommand && !this.showSlashDropdown && !this.showMentionDropdown) {
      const userMsgs = this.chatHistory.filter(c => c.role === 'user');
      if (userMsgs.length > 0) {
        this.userCommand = userMsgs[userMsgs.length - 1].text;
        this.emitCommand(this.userCommand);
        event.preventDefault();
        setTimeout(() => this.autoResize(this.textareaRef?.nativeElement), 0);
      }
      return;
    }

    if (this.showSlashDropdown) {
      if (key === 'ArrowDown') { this.slashSelectedIndex = Math.min(this.slashSelectedIndex + 1, this.filteredSlashCommands.length - 1); event.preventDefault(); return; }
      if (key === 'ArrowUp')   { this.slashSelectedIndex = Math.max(this.slashSelectedIndex - 1, 0); event.preventDefault(); return; }
    }

    if (key === 'Tab') {
      if (this.showSlashDropdown && this.filteredSlashCommands.length > 0) {
        event.preventDefault();
        this.selectSlashCommand(this.filteredSlashCommands[this.slashSelectedIndex]);
        return;
      }
      if (this.showMentionDropdown) {
        const first = this.mentionResults.find(r => !['loading', 'empty', 'error'].includes(r.type));
        if (first) { event.preventDefault(); this.selectMention(first.path); }
        return;
      }
    }
  }

  // ─── Input change ──────────────────────────────────────────────────────────

  async onInputChange(event: any) {
    const textarea = event.target as HTMLTextAreaElement;
    const value = textarea.value;
    const cursor = textarea.selectionStart ?? value.length;

    this.autoResize(textarea);

    const trimmed = value.trim();
    if (trimmed.startsWith('/') && !trimmed.includes(' ')) {
      const q = trimmed.toLowerCase();
      this.filteredSlashCommands = this.slashCommands.filter(c => c.name.startsWith(q));
      this.showSlashDropdown = this.filteredSlashCommands.length > 0;
      this.slashSelectedIndex = 0;
    } else {
      this.showSlashDropdown = false;
    }

    const beforeCursor = value.substring(0, cursor);
    const mentionMatch = beforeCursor.match(/@([^\s]*)$/);
    if (mentionMatch) {
      this.showMentionDropdown = true;
      this.mentionStartIndex = mentionMatch.index!;
      const query = mentionMatch[1];

      if (query.length < 2) {
        this.mentionResults = [{ path: 'พิมพ์ชื่อไฟล์ 2 ตัวอักษรขึ้นไปเพื่อค้นหา...', type: 'empty' }];
      } else {
        try {
          this.mentionResults = [{ path: 'กำลังค้นหาไฟล์...', type: 'loading' }];
          const res = await fetch(`http://localhost:3000/api/fs/search?q=${encodeURIComponent(query)}`);
          if (res.ok) {
            this.mentionResults = await res.json();
            if (this.mentionResults.length === 0) this.mentionResults = [{ path: 'ไม่พบไฟล์', type: 'empty' }];
          } else {
            this.showMentionDropdown = false;
            this.mentionResults = [];
          }
        } catch {
          this.showMentionDropdown = false;
          this.mentionResults = [];
        }
      }
    } else {
      this.showMentionDropdown = false;
    }

    this.userCommand = value;
    this.emitCommand(value);
  }

  private autoResize(el: HTMLTextAreaElement | undefined) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 220) + 'px';
  }

  private emitCommand(value: string) {
    this.userCommandChange.emit(value);
  }

  // ─── Slash commands ────────────────────────────────────────────────────────

  selectSlashCommand(cmd: SlashCommand) {
    this.userCommand = cmd.name + ' ';
    this.emitCommand(this.userCommand);
    this.showSlashDropdown = false;
    setTimeout(() => {
      const el = this.textareaRef?.nativeElement;
      if (el) { el.focus(); this.autoResize(el); }
    }, 0);
  }

  // ─── @ Mentions ────────────────────────────────────────────────────────────

  selectMention(path: string) {
    if (['กำลังค้นหา', 'ไม่พบ', 'ไม่สามารถ'].some(w => path.includes(w))) return;
    const before = this.userCommand.substring(0, this.mentionStartIndex);
    const afterMatch = this.userCommand.substring(this.mentionStartIndex).match(/^@[^\s]*/);
    const afterLen = afterMatch ? afterMatch[0].length : 1;
    let after = this.userCommand.substring(this.mentionStartIndex + afterLen);
    
    // จัดการช่องว่าง: ถ้าก่อนหน้ามี space และหลังมี space ให้ยุบเหลือตัวเดียว
    if (before.endsWith(' ') && after.startsWith(' ')) {
      after = after.substring(1);
    }
    
    // ลบเฉพาะส่วนที่พิมพ์ค้นหา @ เดิมออกจากช่องแชท
    this.userCommand = before + after;
    this.showMentionDropdown = false;
    this.emitCommand(this.userCommand);

    // เพิ่มเป็นไฟล์แนบแทน
    if (!this.attachedFiles.includes(path)) {
      this.attachedFiles.push(path);
      this.filesChanged.emit([...this.attachedFiles]);
    }
  }

  removeAttachedFile(index: number) {
    this.attachedFiles.splice(index, 1);
    this.filesChanged.emit([...this.attachedFiles]);
  }

  clearFiles() {
    this.attachedFiles = [];
    this.filesChanged.emit([]);
  }

  // ─── Image paste ───────────────────────────────────────────────────────────

  onPaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (file) this.readImageFile(file, `screenshot_${Date.now()}.png`);
      }
    }
  }

  onDragOver(event: DragEvent) { event.preventDefault(); this.isDragOver = true; }

  onDragLeave(event: DragEvent) {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) this.isDragOver = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragOver = false;
    const files = event.dataTransfer?.files;
    if (files) Array.from(files).forEach(f => { if (f.type.startsWith('image/')) this.readImageFile(f, f.name); });
  }

  triggerFileInput() { this.fileInputRef?.nativeElement.click(); }

  onFileSelected(event: any) {
    const files: FileList = event.target.files;
    if (files) Array.from(files).forEach((f: File) => { if (f.type.startsWith('image/')) this.readImageFile(f, f.name); });
    event.target.value = '';
  }

  private readImageFile(file: File, name: string) {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.pastedImages.push({ dataUrl: e.target!.result as string, name });
      this.imagesChanged.emit([...this.pastedImages]);
    };
    reader.readAsDataURL(file);
  }

  removePastedImage(index: number) { this.pastedImages.splice(index, 1); this.imagesChanged.emit([...this.pastedImages]); }
  clearImages() { this.pastedImages = []; this.imagesChanged.emit([]); }

  // ─── Events → parent ───────────────────────────────────────────────────────

  onEnter() {
    this.commandEntered.emit();
    setTimeout(() => this.autoResize(this.textareaRef?.nativeElement), 0);
  }
  onToggleListen() { this.toggleListen.emit(); }
  onStopAudio()    { this.stopAudio.emit(); }
  onStopGenerate() { this.stopGenerate.emit(); }

  // ─── Message parsing (only for text/code/file-edit in 'ai' role) ──────────

  parseMessage(text: string): MessageFragment[] {
    if (!text) return [];
    const fragments: MessageFragment[] = [];
    let lastIndex = 0;
    let match;

    const editRegex = /\[EDIT_FILE\s*:\s*([^\]]+?)\]([\s\S]*?)\[\/\s*EDIT_FILE\s*\]/gi;
    while ((match = editRegex.exec(text)) !== null) {
      if (match.index > lastIndex) fragments.push(...this.parseCodeBlocks(text.substring(lastIndex, match.index)));
      
      let fileContent = match[2].trim();
      // ป้องกันกรณีที่ AI เผลอใส่ Markdown Code block ครอบเนื้อหาด้านในมาให้อีกชั้น
      const mdMatch = fileContent.match(/^```[a-zA-Z0-9+#.-]*\r?\n([\s\S]*?)```$/);
      if (mdMatch) {
        fileContent = mdMatch[1].trim();
      }

      fragments.push({ type: 'file-edit', filePath: match[1].trim(), content: fileContent });
      lastIndex = editRegex.lastIndex;
    }
    if (lastIndex < text.length) fragments.push(...this.parseCodeBlocks(text.substring(lastIndex)));
    return fragments;
  }

  parseCodeBlocks(text: string): MessageFragment[] {
    const fragments: MessageFragment[] = [];
    const regex = /```([a-zA-Z0-9+#.-]*)\r?\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) fragments.push({ type: 'text', content: text.substring(lastIndex, match.index) });
      fragments.push({ type: 'code', language: match[1] || 'code', content: match[2].trim() });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) fragments.push({ type: 'text', content: text.substring(lastIndex) });
    return fragments;
  }

  trackByFragment(index: number, frag: MessageFragment): string { return index + '-' + frag.type; }

  // ─── Clipboard helpers ─────────────────────────────────────────────────────

  async copyCodeToClipboard(code: string, id: string) {
    try {
      await navigator.clipboard.writeText(code);
      this.copiedCodeId = id;
      setTimeout(() => { if (this.copiedCodeId === id) this.copiedCodeId = null; }, 2000);
    } catch (err) { console.error('Copy failed:', err); }
  }

  async copyToClipboard(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedIndex = index;
      setTimeout(() => { if (this.copiedIndex === index) this.copiedIndex = null; }, 2000);
    } catch (err) { console.error('Copy failed:', err); }
  }

  public scrollToBottom(): void {
    try {
      if (this.chatLogContainer) this.chatLogContainer.nativeElement.scrollTop = this.chatLogContainer.nativeElement.scrollHeight;
    } catch {}
  }
}
