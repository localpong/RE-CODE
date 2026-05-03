import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';

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

  onCommandChange(value: string) {
    this.userCommandChange.emit(value);
  }

  onEnter() { this.commandEntered.emit(); }
  onToggleListen() { this.toggleListen.emit(); }
  onStopAudio() { this.stopAudio.emit(); }

  // เตรียมฟังก์ชันเลื่อนจอไว้ให้ Component แม่เรียกใช้งานได้
  public scrollToBottom(): void {
    try {
      if (this.chatLogContainer) {
        this.chatLogContainer.nativeElement.scrollTop = this.chatLogContainer.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }
}