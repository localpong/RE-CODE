import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
// @ts-ignore
import * as Diff from 'diff';
import { ApproveConfig, DEFAULT_APPROVE_CONFIG } from './approve-config.component';

export type RiskLevel = 'low' | 'medium' | 'high';

@Component({
  selector: 'app-code-diff',
  templateUrl: './code-diff.component.html',
  styleUrls: ['./code-diff.component.scss']
})
export class CodeDiffComponent implements OnInit, OnDestroy {
  @Input() filePath: string = '';
  @Input() newContent: string = '';
  @Input() approveConfig: ApproveConfig = { ...DEFAULT_APPROVE_CONFIG };
  @Input() toolCallId: string = '';

  @Output() fileApproved = new EventEmitter<void>();
  @Output() fileRejected = new EventEmitter<void>();

  status: 'pending' | 'approved' | 'rejected' | 'error' | 'reverted' = 'pending';
  errorMessage: string = '';

  oldContent: string = '';
  diffLines: { value: string, added?: boolean, removed?: boolean, isFoldMarker?: boolean, hiddenGroup?: any[] }[] = [];
  isLoadingDiff: boolean = true;
  private diffId!: string;

  // Risk
  riskLevel: RiskLevel = 'low';
  riskReason: string = '';
  addedLines: number = 0;
  removedLines: number = 0;

  // Countdown
  countdown: number = 0;
  countdownActive: boolean = false;
  countdownProgress: number = 100;
  private countdownInterval: any = null;
  private totalSeconds: number = 0;

  async ngOnInit() {
    let hash = 0;
    const str = this.filePath + this.newContent.substring(0, 100);
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    this.diffId = `diff-backup-${hash}`;

    await this.fetchAndCacheOldContent();
    this.computeDiff();
    this.evaluateAutoApprove();
  }

  ngOnDestroy() {
    this.cancelCountdown();
  }

  async fetchAndCacheOldContent() {
    const cached = localStorage.getItem(this.diffId);
    if (cached !== null) {
      this.oldContent = cached;
      this.isLoadingDiff = false;
      return;
    }
    try {
      const res = await fetch('http://localhost:3000/api/fs/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.filePath })
      });
      if (res.ok) {
        const data = await res.json();
        this.oldContent = data.content || '';
        localStorage.setItem(this.diffId, this.oldContent);
      }
    } catch (e) {
      this.oldContent = '';
      localStorage.setItem(this.diffId, this.oldContent);
    }
    this.isLoadingDiff = false;
  }

  computeDiff() {
    const rawDiff = Diff.diffLines(this.oldContent, this.newContent);
    const tempLines: any[] = [];
    rawDiff.forEach((part: any) => {
      const lines = part.value.replace(/\n$/, '').split('\n');
      lines.forEach((line: string) => {
        tempLines.push({ value: line, added: part.added, removed: part.removed });
      });
    });

    const CONTEXT = 3;
    const isVisible = new Array(tempLines.length).fill(false);
    const hasChanges = tempLines.some(l => l.added || l.removed);
    if (!hasChanges) { this.diffLines = tempLines; return; }

    for (let i = 0; i < tempLines.length; i++) {
      if (tempLines[i].added || tempLines[i].removed) {
        for (let j = Math.max(0, i - CONTEXT); j <= Math.min(tempLines.length - 1, i + CONTEXT); j++) {
          isVisible[j] = true;
        }
      }
    }

    this.diffLines = [];
    let hiddenGroup: any[] = [];
    for (let i = 0; i < tempLines.length; i++) {
      if (isVisible[i]) {
        if (hiddenGroup.length > 0) {
          this.diffLines.push({ value: `@@ ... ${hiddenGroup.length} unchanged lines hidden (Click to expand) ... @@`, isFoldMarker: true, hiddenGroup });
          hiddenGroup = [];
        }
        this.diffLines.push(tempLines[i]);
      } else {
        hiddenGroup.push(tempLines[i]);
      }
    }
    if (hiddenGroup.length > 0) {
      this.diffLines.push({ value: `@@ ... ${hiddenGroup.length} unchanged lines hidden (Click to expand) ... @@`, isFoldMarker: true, hiddenGroup });
    }
  }

  assessRisk(): { level: RiskLevel; reason: string } {
    const added   = this.diffLines.filter(l => l.added   && !l.isFoldMarker).length;
    const removed = this.diffLines.filter(l => l.removed && !l.isFoldMarker).length;
    const total   = added + removed;
    this.addedLines   = added;
    this.removedLines = removed;

    if (total > this.approveConfig.maxLinesChanged) {
      return { level: 'high', reason: `เปลี่ยน ${total} บรรทัด (เกินขีด ${this.approveConfig.maxLinesChanged})` };
    }
    if (removed > 0 && removed >= added) {
      return { level: 'high', reason: `ลบมากกว่าเพิ่ม (−${removed} / +${added})` };
    }
    if (removed > 5 || total > 30) {
      return { level: 'medium', reason: `แก้ไขปานกลาง (+${added} / −${removed} บรรทัด)` };
    }
    if (removed === 0) {
      return { level: 'low', reason: `เพิ่มโค้ดเท่านั้น (+${added} บรรทัด)` };
    }
    return { level: 'low', reason: `แก้ไขเล็กน้อย (+${added} / −${removed} บรรทัด)` };
  }

  evaluateAutoApprove() {
    const { mode } = this.approveConfig;
    if (mode === 'manual') return;

    const risk = this.assessRisk();
    this.riskLevel  = risk.level;
    this.riskReason = risk.reason;

    const order: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

    if (mode === 'auto') {
      this.startCountdown();
    } else if (mode === 'smart') {
      if (order[risk.level] <= order[this.approveConfig.maxRiskLevel]) {
        this.startCountdown();
      }
    }
  }

  startCountdown() {
    this.totalSeconds     = this.approveConfig.countdownSeconds;
    this.countdown        = this.totalSeconds;
    this.countdownActive  = true;
    this.countdownProgress = 100;

    this.countdownInterval = setInterval(() => {
      if (!this.countdownActive) { clearInterval(this.countdownInterval); return; }
      this.countdown--;
      this.countdownProgress = (this.countdown / this.totalSeconds) * 100;
      if (this.countdown <= 0) {
        clearInterval(this.countdownInterval);
        this.countdownActive = false;
        this.approve();
      }
    }, 1000);
  }

  cancelCountdown() {
    this.countdownActive   = false;
    this.countdown         = 0;
    this.countdownProgress = 0;
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  expandFold(index: number) {
    const marker = this.diffLines[index];
    if (marker?.isFoldMarker && marker.hiddenGroup) {
      this.diffLines.splice(index, 1, ...marker.hiddenGroup);
    }
  }

  async approve() {
    try {
      const res = await fetch('http://localhost:3000/api/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.filePath, content: this.newContent })
      });
      if (res.ok) {
        this.status = 'approved';
        this.fileApproved.emit();
      } else {
        const err = await res.json();
        throw new Error(err.error);
      }
    } catch (e: any) {
      this.status = 'error';
      this.errorMessage = e.message || 'Unknown error occurred.';
    }
  }

  async revert() {
    try {
      const res = await fetch('http://localhost:3000/api/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.filePath, content: this.oldContent })
      });
      if (res.ok) {
        this.status = 'reverted';
      } else {
        const err = await res.json();
        throw new Error(err.error);
      }
    } catch (e: any) {
      this.status = 'error';
      this.errorMessage = e.message || 'Unknown error occurred while reverting.';
    }
  }

  reject() {
    this.cancelCountdown();
    this.status = 'rejected';
    localStorage.removeItem(this.diffId);
    this.fileRejected.emit();
  }
}
