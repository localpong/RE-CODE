import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  selectedTheme: string = 'light'; // ค่าเริ่มต้น
  selectedLanguage: string = 'th'; // ค่าเริ่มต้น

  constructor() { }

  ngOnInit(): void {
    // โหลดการตั้งค่าที่มีอยู่ (ถ้ามี)
    this.loadSettings();
  }

  loadSettings(): void {
    // ตัวอย่าง: โหลดจาก localStorage
    const savedTheme = localStorage.getItem('appTheme');
    if (savedTheme) {
      this.selectedTheme = savedTheme;
    }

    const savedLanguage = localStorage.getItem('appLanguage');
    if (savedLanguage) {
      this.selectedLanguage = savedLanguage;
    }
    console.log('Settings loaded:', { theme: this.selectedTheme, language: this.selectedLanguage });
  }

  saveSettings(): void {
    // ตัวอย่าง: บันทึกการตั้งค่าลง localStorage
    localStorage.setItem('appTheme', this.selectedTheme);
    localStorage.setItem('appLanguage', this.selectedLanguage);

    console.log('Settings saved:', { theme: this.selectedTheme, language: this.selectedLanguage });
    alert('บันทึกการตั้งค่าเรียบร้อยแล้ว!');
    // อาจจะมีการเรียก service เพื่อส่งการตั้งค่าไป backend หรืออัปเดต state ของแอป
  }
}