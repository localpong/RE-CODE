import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface FileOperation {
  type: 'read' | 'write' | 'edit' | 'delete' | 'create';
  path: string;
  content?: string;
  oldContent?: string;
  newContent?: string;
  timestamp?: Date;
  status?: 'pending' | 'success' | 'error';
  message?: string;
}

export interface FileContent {
  path: string;
  content: string;
  lastModified?: Date;
  size?: number;
}

const SERVER = 'http://localhost:3000';

@Injectable({
  providedIn: 'root'
})
export class FileManagerService {
  private fileOperations = new BehaviorSubject<FileOperation[]>([]);
  private currentFile = new BehaviorSubject<FileContent | null>(null);
  private fileCache = new Map<string, FileContent>();
  private operationHistory: FileOperation[] = [];

  public fileOperations$ = this.fileOperations.asObservable();
  public currentFile$ = this.currentFile.asObservable();

  constructor() {
    this.initializeService();
  }

  /**
   * Initialize the service (similar to Claude extension initialization)
   */
  private initializeService(): void {
    console.log('FileManager Service initialized - Claude VSCode Extension Mode');
  }

  /**
   * อ่านไฟล์ (Read File)
   * ทำงานเหมือน: read_file function ของ Claude
   */
  public readFile(path: string): Observable<FileContent> {
    return new Observable(observer => {
      const operation: FileOperation = { type: 'read', path, timestamp: new Date(), status: 'pending' };
      fetch(`${SERVER}/api/fs/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to read file');
        const fileContent: FileContent = { path, content: data.content, lastModified: new Date(), size: data.content.length };
        this.fileCache.set(path, fileContent);
        this.currentFile.next(fileContent);
        operation.status = 'success';
        operation.content = data.content;
        this.addOperationToHistory(operation);
        observer.next(fileContent);
        observer.complete();
      })
      .catch(error => {
        operation.status = 'error';
        operation.message = error.message;
        this.addOperationToHistory(operation);
        observer.error(error);
      });
    });
  }

  /**
   * แก้ไขไฟล์ (Edit File)
   * ทำงานเหมือน: edit_file function ของ Claude
   * ค้นหา oldStr และแทนที่ด้วย newStr
   */
  public editFile(path: string, oldStr: string, newStr: string): Observable<FileContent> {
    return new Observable(observer => {
      const operation: FileOperation = { type: 'edit', path, oldContent: oldStr, newContent: newStr, timestamp: new Date(), status: 'pending' };
      fetch(`${SERVER}/api/fs/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, old_str: oldStr, new_str: newStr })
      })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to edit file');
        const fileContent: FileContent = { path, content: data.newContent, lastModified: new Date(), size: data.newContent.length };
        this.fileCache.set(path, fileContent);
        this.currentFile.next(fileContent);
        operation.status = 'success';
        operation.content = data.newContent;
        this.addOperationToHistory(operation);
        observer.next(fileContent);
        observer.complete();
      })
      .catch(error => {
        operation.status = 'error';
        operation.message = error.message;
        this.addOperationToHistory(operation);
        observer.error(error);
      });
    });
  }

  /**
   * เขียนไฟล์ใหม่ (Write File)
   * ทำงานเหมือน: write_file function ของ Claude
   */
  public writeFile(path: string, content: string): Observable<FileContent> {
    return new Observable(observer => {
      const operation: FileOperation = { type: 'write', path, content, timestamp: new Date(), status: 'pending' };
      fetch(`${SERVER}/api/fs/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content })
      })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to write file');
        const fileContent: FileContent = { path, content, lastModified: new Date(), size: content.length };
        this.fileCache.set(path, fileContent);
        this.currentFile.next(fileContent);
        operation.status = 'success';
        this.addOperationToHistory(operation);
        observer.next(fileContent);
        observer.complete();
      })
      .catch(error => {
        operation.status = 'error';
        operation.message = error.message;
        this.addOperationToHistory(operation);
        observer.error(error);
      });
    });
  }

  /**
   * สร้างไฟล์ใหม่ (Create File)
   * ทำงานเหมือน: write_file function ของ Claude สำหรับไฟล์ใหม่
   */
  public createFile(path: string, content: string = ''): Observable<FileContent> {
    return this.writeFile(path, content);
  }

  /**
   * ลบไฟล์ (Delete File)
   */
  public deleteFile(path: string): Observable<boolean> {
    return new Observable(observer => {
      const operation: FileOperation = { type: 'delete', path, timestamp: new Date(), status: 'pending' };
      fetch(`${SERVER}/api/fs/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete file');
        this.fileCache.delete(path);
        if (this.currentFile.value?.path === path) {
          this.currentFile.next(null);
        }
        operation.status = 'success';
        this.addOperationToHistory(operation);
        observer.next(true);
        observer.complete();
      })
      .catch(error => {
        operation.status = 'error';
        operation.message = error.message;
        this.addOperationToHistory(operation);
        observer.error(error);
      });
    });
  }

  /**
   * ค้นหาไฟล์ตามชื่อ (Search Files)
   */
  public searchFiles(pattern: string): Observable<string[]> {
    return new Observable(observer => {
      fetch(`${SERVER}/api/fs/search?q=${encodeURIComponent(pattern)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to search files');
        const results = data.map((f: any) => f.path);
        observer.next(results);
        observer.complete();
      })
      .catch(error => observer.error(error));
    });
  }

  /**
   * ดึงประวัติการทำงาน (Get Operation History)
   */
  public getOperationHistory(): FileOperation[] {
    return [...this.operationHistory];
  }

  /**
   * ล้างประวัติการทำงาน (Clear History)
   */
  public clearHistory(): void {
    this.operationHistory = [];
    this.fileOperations.next([]);
  }

  /**
   * ดึงไฟล์ที่แคชไว้ (Get Cached File)
   */
  public getCachedFile(path: string): FileContent | undefined {
    return this.fileCache.get(path);
  }

  /**
   * ล้างแคช (Clear Cache)
   */
  public clearCache(): void {
    this.fileCache.clear();
    this.currentFile.next(null);
  }

  /**
   * Undo last operation (ยกเลิกการทำงานล่าสุด)
   */
  public undoLastOperation(): void {
    if (this.operationHistory.length === 0) {
      console.warn('No operations to undo');
      return;
    }
    
    const lastOperation = this.operationHistory.pop();
    if (lastOperation) {
      console.log(`Undo operation: ${lastOperation.type} on ${lastOperation.path}`);
    }
  }

  private addOperationToHistory(operation: FileOperation): void {
    this.operationHistory.push(operation);
    this.fileOperations.next([...this.operationHistory]);
  }
}
