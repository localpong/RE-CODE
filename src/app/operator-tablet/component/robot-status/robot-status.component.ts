import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-robot-status',
  templateUrl: './robot-status.component.html',
  styleUrls: ['./robot-status.component.scss'] 
})
export class RobotStatusComponent {
  // รับ Object สถานะหุ่นยนต์มาจาก OperatorTabletComponent
  @Input() robotStatus: any;

  // ส่งสัญญาณ Action ต่างๆ กลับไปให้ตัวแม่ทำงาน
  @Output() save = new EventEmitter<void>();
  @Output() load = new EventEmitter<void>();
  @Output() reset = new EventEmitter<void>();

  onSave() { this.save.emit(); }
  onLoad() { this.load.emit(); }
  onReset() { this.reset.emit(); }
}