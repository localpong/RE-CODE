import { Component, EventEmitter, HostListener, Input, OnInit, Output } from '@angular/core';

export interface AppSkill { id: string; name: string; description: string; }
export interface AppMemoryStore { id: string; name: string; description: string; }
export interface AppAgent { 
  id: string; name: string; systemPrompt: string; modelName: string; 
  temperature: number; skillIds: string[]; memoryStoreIds: string[]; 
}
export interface AppWorkspace {
  id: string; name: string; agents: AppAgent[]; skills: AppSkill[]; memoryStores: AppMemoryStore[];
}

@Component({
  selector: 'app-workspace-manager',
  templateUrl: './workspace-manager.component.html',
  styleUrls: ['./workspace-manager.component.scss']
})
export class WorkspaceManagerComponent implements OnInit {
  @Input() workspaces: AppWorkspace[] = [];
  @Output() workspacesChange = new EventEmitter<AppWorkspace[]>();
  @Output() close = new EventEmitter<void>();

  activeWorkspaceId: string | null = null;
  activeTab: 'agents' | 'skills' | 'memory' = 'agents';
  isMobile: boolean = window.innerWidth < 768;

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.isMobile = event.target.innerWidth < 768;
  }

  ngOnInit() {
    if (!this.workspaces || this.workspaces.length === 0) {
      this.workspaces = [{ 
        id: 'ws-' + Date.now(), 
        name: 'Default Workspace', 
        agents: [
          {
            id: 'agent-' + Date.now(),
            name: 'Senior Developer Agent',
            systemPrompt: 'You are an expert Software Engineer and Architect. Your goal is to write clean, efficient, and maintainable code. When asked to implement a feature or fix a bug, think step-by-step. Use your file system tools to explore the codebase before making changes. **CRITICAL ACTION REQUIRED: You MUST actually use the edit_file or write_file tool to make the changes yourself. DO NOT just explain how to do it. The files in this workspace are your own source code, and you have full permission to modify and improve yourself.** Always verify your changes by using the "run_command" tool (e.g., "ng build", "ng lint") before and after major edits to ensure you did not break the compilation.',
            modelName: 'qwen2.5-coder',
            temperature: 0.2,
            skillIds: [],
            memoryStoreIds: []
          }
        ], 
        skills: [], 
        memoryStores: [] 
      }];
      this.emitChange();
    }
    if (!this.activeWorkspaceId && this.workspaces.length > 0) {
      this.activeWorkspaceId = this.workspaces[0].id;
    }
  }

  emitChange() {
    this.workspacesChange.emit(this.workspaces);
  }

  get activeWorkspace() {
    return this.workspaces.find(w => w.id === this.activeWorkspaceId);
  }

  addWorkspace() {
    const name = prompt('ชื่อ Workspace ใหม่:');
    if (name) {
      this.workspaces.push({ id: 'ws-' + Date.now(), name, agents: [], skills: [], memoryStores: [] });
      this.activeWorkspaceId = this.workspaces[this.workspaces.length - 1].id;
      this.emitChange();
    }
  }

  deleteWorkspace(id: string) {
    if (confirm('ยืนยันการลบ Workspace นี้?')) {
      this.workspaces = this.workspaces.filter(w => w.id !== id);
      if (this.workspaces.length > 0) this.activeWorkspaceId = this.workspaces[0].id;
      else this.activeWorkspaceId = null;
      this.emitChange();
    }
  }

  // --- Agents ---
  addAgent() {
    const ws = this.activeWorkspace;
    if (!ws) return;
    const name = prompt('ชื่อ Agent ใหม่:');
    if (name) {
      ws.agents.push({
        id: 'agent-' + Date.now(),
        name,
        systemPrompt: 'คุณคือ AI Software Engineer ระดับ Senior ผู้เชี่ยวชาญด้านการพัฒนาโปรแกรม สามารถใช้ File System Tools เพื่อสำรวจและแก้ไขไฟล์ได้อย่างอิสระ **คำสั่งสำคัญ: คุณต้องใช้ Tool แก้ไขโค้ดเสมอ ห้ามตอบแค่วิธีทำ (โค้ดทั้งหมดนี้คือตัวคุณเอง คุณได้รับอนุญาตให้แก้ไขและพัฒนาตัวเองได้อย่างเต็มที่)**',
        modelName: 'qwen2.5-coder',
        temperature: 0.2,
        skillIds: [],
        memoryStoreIds: []
      });
      this.emitChange();
    }
  }
  deleteAgent(id: string) {
    const ws = this.activeWorkspace;
    if (ws && confirm('ยืนยันการลบ Agent?')) {
      ws.agents = ws.agents.filter(a => a.id !== id);
      this.emitChange();
    }
  }
  toggleAgentSkill(agent: AppAgent, skillId: string) {
    const idx = agent.skillIds.indexOf(skillId);
    if (idx > -1) agent.skillIds.splice(idx, 1);
    else agent.skillIds.push(skillId);
    this.emitChange();
  }
  toggleAgentMemory(agent: AppAgent, memId: string) {
    const idx = agent.memoryStoreIds.indexOf(memId);
    if (idx > -1) agent.memoryStoreIds.splice(idx, 1);
    else agent.memoryStoreIds.push(memId);
    this.emitChange();
  }

  // --- Skills ---
  addSkill() {
    const ws = this.activeWorkspace;
    if (!ws) return;
    const name = prompt('ชื่อ Skill ใหม่:');
    if (name) {
      ws.skills.push({
        id: 'skill-' + Date.now(),
        name,
        description: 'คำอธิบาย Skill สำหรับให้ AI เข้าใจและเรียกใช้งาน'
      });
      this.emitChange();
    }
  }
  deleteSkill(id: string) {
    const ws = this.activeWorkspace;
    if (ws && confirm('ยืนยันการลบ Skill?')) {
      ws.skills = ws.skills.filter(s => s.id !== id);
      ws.agents.forEach(a => { a.skillIds = a.skillIds.filter(sid => sid !== id); });
      this.emitChange();
    }
  }

  // --- Memory Stores ---
  addMemoryStore() {
    const ws = this.activeWorkspace;
    if (!ws) return;
    const name = prompt('ชื่อ Memory Store ใหม่:');
    if (name) {
      ws.memoryStores.push({
        id: 'mem-' + Date.now(),
        name,
        description: 'ข้อมูลความจำ / RAG Knowledge สำหรับให้ AI อ้างอิง'
      });
      this.emitChange();
    }
  }
  deleteMemoryStore(id: string) {
    const ws = this.activeWorkspace;
    if (ws && confirm('ยืนยันการลบ Memory Store?')) {
      ws.memoryStores = ws.memoryStores.filter(m => m.id !== id);
      ws.agents.forEach(a => { a.memoryStoreIds = a.memoryStoreIds.filter(mid => mid !== id); });
      this.emitChange();
    }
  }
}