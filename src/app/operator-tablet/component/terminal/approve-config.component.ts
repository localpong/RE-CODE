import { Component, Input, Output, EventEmitter } from '@angular/core';

export interface ApproveConfig {
  mode: 'manual' | 'smart' | 'auto';
  countdownSeconds: number;
  maxRiskLevel: 'low' | 'medium' | 'high';
  maxLinesChanged: number;
}

export const DEFAULT_APPROVE_CONFIG: ApproveConfig = {
  mode: 'manual',
  countdownSeconds: 3,
  maxRiskLevel: 'medium',
  maxLinesChanged: 100
};

@Component({
  selector: 'app-approve-config',
  templateUrl: './approve-config.component.html',
  styleUrls: ['./approve-config.component.scss']
})
export class ApproveConfigComponent {
  @Input() config: ApproveConfig = { ...DEFAULT_APPROVE_CONFIG };
  @Output() configChange = new EventEmitter<ApproveConfig>();

  setMode(mode: 'manual' | 'smart' | 'auto') {
    this.config = { ...this.config, mode };
    this.emit();
  }

  setRiskLevel(level: 'low' | 'medium' | 'high') {
    this.config = { ...this.config, maxRiskLevel: level };
    this.emit();
  }

  emit() {
    this.configChange.emit({ ...this.config });
  }

  getModeDescription(): string {
    switch (this.config.mode) {
      case 'manual': return 'ต้องกด Approve ด้วยตนเองทุกครั้ง (เหมือน Claude Code ปกติ)';
      case 'smart':  return 'Approve อัตโนมัติถ้าความเสี่ยงไม่เกินระดับที่กำหนด';
      case 'auto':   return 'Approve อัตโนมัติทุกการแก้ไข (เหมือนเปิด dangerouslySkipPermissions)';
    }
  }

  getRiskDescription(): string {
    switch (this.config.maxRiskLevel) {
      case 'low':    return 'เพิ่มโค้ดเท่านั้น ไม่มีการลบ';
      case 'medium': return 'แก้ไขปานกลาง ลบได้บางส่วน';
      case 'high':   return 'ทุกการเปลี่ยนแปลง รวมถึงลบจำนวนมาก';
    }
  }
}
