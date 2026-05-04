import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

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

  ngOnInit() {
    if (!this.workspaces || this.workspaces.length === 0) {
      this.workspaces = [{ id: 'ws-' + Date.now(), name: 'Default Workspace', agents: [], skills: [], memoryStores: [] }];
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
        systemPrompt: 'คุณคือ AI Agent',
        modelName: 'qwen2.5',
        temperature: 0.8,
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