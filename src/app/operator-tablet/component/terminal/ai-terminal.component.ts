import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';

export interface MessageFragment {
  type: 'text' | 'code';
  content: string;
  language?: string;
}

@Component({
  selector: 'app-ai-terminal',
  templateUrl: './ai-terminal.component.html',
  styleUrls: ['./ai-terminal.component.scss']
})
export class AiTerminalComponent {
  // รับค่าต่างๆ มาจากหน้าหลัก
  @Input() currentAiFace: string = '';
  @Input() chatHistory: { role: string, text: string }[] = [];
  @Input() isProcessing: boolean = false;
  @Input() isListening: boolean = false;
  @Input() userCommand: string = '';

  // ส่ง Event กลับไปยังหน้าหลักเวลาผู้เล่นตอบโต้
  @Output() userCommandChange = new EventEmitter<string>();
  @Output() commandEntered = new EventEmitter<void>();
  @Output() toggleListen = new EventEmitter<void>();
  @Output() stopAudio = new EventEmitter<void>();

  @ViewChild('chatLog') private chatLogContainer!: ElementRef;

  copiedIndex: number | null = null;
  copiedCodeId: string | null = null;

  onCommandChange(value: string) {
    this.userCommandChange.emit(value);
  }

  onEnter() { this.commandEntered.emit(); }
  onToggleListen() { this.toggleListen.emit(); }
  onStopAudio() { this.stopAudio.emit(); }

  parseMessage(text: string): MessageFragment[] {
    if (!text) return [];
    const fragments: MessageFragment[] = [];
    // ใช้ Regex ค้นหาบล็อกโค้ดที่ครอบด้วย ``` (backticks 3 ตัว)
    const regex = /```([a-zA-Z0-9+#-]*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragments.push({ type: 'text', content: text.substring(lastIndex, match.index) });
      }
      fragments.push({ type: 'code', language: match[1] || 'code', content: match[2].trim() });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      fragments.push({ type: 'text', content: text.substring(lastIndex) });
    }

    return fragments.length > 0 ? fragments : [{ type: 'text', content: text }];
  }

  async copyCodeToClipboard(code: string, id: string) {
    try {
      await navigator.clipboard.writeText(code);
      this.copiedCodeId = id;
      setTimeout(() => {
        if (this.copiedCodeId === id) {
          this.copiedCodeId = null;
        }
      }, 2000);
    } catch (err) {
      console.error('Failed to copy code: ', err);
    }
  }

  async copyToClipboard(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      this.copiedIndex = index;
      setTimeout(() => {
        if (this.copiedIndex === index) {
          this.copiedIndex = null;
        }
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }

  // เตรียมฟังก์ชันเลื่อนจอไว้ให้ Component แม่เรียกใช้งานได้
  public scrollToBottom(): void {
    try {
      if (this.chatLogContainer) {
        this.chatLogContainer.nativeElement.scrollTop = this.chatLogContainer.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }
}