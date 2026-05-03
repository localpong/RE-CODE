# Angular Project Setup

## ขั้นตอนการติดตั้ง

1. **ติดตั้ง Dependencies:**
   ```bash
   npm install
   ```

2. **เรียกใช้ Development Server:**
   ```bash
   npm start
   ```
   หรือ
   ```bash
   ng serve
   ```
   เพื่อเข้าถึงแอปพลิเคชันในเบราว์เซอร์ที่ http://localhost:4200/

3. **สร้าง Build Production:**
   ```bash
   npm run build
   ```

## โครงสร้างโปรเจค

```
src/
├── app/                      # แอปพลิเคชันหลัก
│   ├── app.component.ts      # Root Component
│   ├── app.component.html    # Template
│   ├── app.component.scss    # Styles
│   └── app.module.ts         # Root Module
├── environments/             # Environment Configuration
│   ├── environment.ts        # Development
│   └── environment.prod.ts   # Production
├── assets/                   # Static Assets
├── styles.scss              # Global Styles
├── index.html               # Main HTML
└── main.ts                  # Entry Point
```

## ไฟล์กำหนดค่า

- **package.json** - Dependencies และ Scripts
- **tsconfig.json** - TypeScript Configuration
- **angular.json** - Angular CLI Configuration
- **tsconfig.app.json** - App-specific TypeScript Configuration

## ขั้นตอนต่อไป

1. รันคำสั่ง `npm install` เพื่อติดตั้ง dependencies
2. รันคำสั่ง `npm start` เพื่อเริ่มต้น development server
3. เริ่มพัฒนา components ตามต้องการ


## ขั้นตอนต่อไป
1. รันคำสั่ง `npm install -g @angular/cli` เพื่อติดตั้ง angular
