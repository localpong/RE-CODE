# Angular Project - Operator Tablet Application

ระบบจัดการแท็บเล็ตสำหรับผู้ปฏิบัติการ พัฒนาด้วย Angular Framework และ Deploy ไป GitHub Pages

## 🚀 ความเร็วเริ่มต้น

### ขั้นตอนการติดตั้ง

1. **Clone Repository:**
   ```bash
   git clone <repository-url>
   cd operator-tablet
   ```

2. **ติดตั้ง Dependencies:**
   ```bash
   npm install
   ```

3. **เรียกใช้ Development Server:**
   ```bash
   npm start
   ```
   หรือ
   ```bash
   ng serve
   ```
   เข้าถึงแอปพลิเคชันที่ http://localhost:4200/

4. **รัน Unit Tests:**
   ```bash
   npm test
   ```
   หรือ
   ```bash
   ng test
   ```
   เรียกใช้ unittest ด้วย Karma และ Jasmine

5. **สร้าง Build Production:**
   ```bash
   npm run build
   ```
   หรือ
   ```bash
   npm run build -- --configuration production
   ```

6. **Deploy ไป GitHub Pages:**
   ```bash
   npm run deploy
   ```

---

## 📁 โครงสร้างโปรเจค

```
operator-tablet/
├── src/
│   ├── app/
│   │   ├── operator-tablet/          # Main Feature Module
│   │   │   ├── components/
│   │   │   ├── services/
│   │   │   ├── models/
│   │   │   └── operator-tablet.component.ts
│   │   ├── app.component.ts          # Root Component
│   │   ├── app.component.html
│   │   ├── app.component.scss
│   │   ├── app.component.spec.ts     # Unit Tests
│   │   └── app.module.ts             # Root Module
│   ├── environments/                 # Environment Configuration
│   │   ├── environment.ts            # Development
│   │   └── environment.prod.ts       # Production
│   ├── assets/                       # Static Assets (Images, Icons)
│   ├── styles.scss                   # Global Styles
│   ├── index.html                    # Main HTML
│   └── main.ts                       # Entry Point
├── .github/
│   └── workflows/
│       ├── ai-auto-approve.yml       # AI Auto-Approve CI/CD
│       └── deploy.yml                # GitHub Pages Deployment
├── scripts/
│   └── ai-safety-check.js            # AI Safety Validation
├── .husky/
│   └── pre-commit                    # Git Hooks for AI Auto-Commit
├── angular.json                      # Angular CLI Configuration
├── tsconfig.json                     # TypeScript Configuration
├── tsconfig.app.json                 # App-specific TypeScript Config
├── tsconfig.spec.json                # Unit Test TypeScript Config
├── karma.conf.js                     # Karma Test Runner Config
├── package.json                      # Dependencies & Scripts
├── .env.local                        # Environment Variables (ห้ามลง Git)
└── README.md                         # Documentation
```

---

## ⚙️ ไฟล์กำหนดค่า

| ไฟล์ | คำอธิบาย |
|-----|---------|
| **package.json** | Dependencies, Scripts, Version Management |
| **tsconfig.json** | TypeScript Compiler Options |
| **angular.json** | Angular CLI Configuration & Build Options |
| **tsconfig.app.json** | App-specific TypeScript Configuration |
| **tsconfig.spec.json** | Unit Test TypeScript Configuration |
| **karma.conf.js** | Karma Test Runner Configuration |
| **.angular.json** | Angular Project Metadata |

---

## 🧪 Unit Testing

### Framework ที่ใช้:
- **Jasmine** - Testing Framework สำหรับเขียน Unit Tests
- **Karma** - Test Runner สำหรับรัน Unit Tests

### วิธีการใช้งาน:

```bash
# รัน Unit Tests ทั้งหมด (Watch Mode)
ng test

# รัน Unit Tests แบบครั้งเดียวและออก
ng test --watch=false

# รัน Unit Tests พร้อม Code Coverage Report
ng test --code-coverage

# รัน Unit Tests สำหรับไฟล์เฉพาะ
ng test --include='**/operator-tablet/**'
```

### สร้าง Unit Tests:
```bash
# สร้าง Component พร้อม Unit Test
ng generate component my-component

# สร้าง Service พร้อม Unit Test
ng generate service my-service

# สร้าง Module พร้อม Unit Test
ng generate module my-module
```

### ตัวอย่าง Unit Test:
```typescript
describe('OperatorTabletComponent', () => {
  let component: OperatorTabletComponent;
  let fixture: ComponentFixture<OperatorTabletComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ OperatorTabletComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(OperatorTabletComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
```

---

## 🤖 AI Auto-Approve & Auto-Deploy (Fully Autonomous)

### ตั้งค่า AI Autonomous Mode:

1. **สร้างไฟล์ `.env.local`:**
   ```env
   AI_AUTONOMOUS_MODE=true
   AI_AUTO_APPROVE=true
   AI_AUTO_COMMIT=true
   AI_AUTO_DEPLOY=false
   ```

2. **ใช้ Commands:**
   ```bash
   # AI Auto-Approve + Test + Commit
   npm run ai:approve

   # AI Auto-Commit
   npm run ai:commit

   # AI Full Pipeline (Test + Build + Commit + Deploy)
   npm run ai:deploy
   ```

3. **GitHub Actions จะ:**
   - ✅ รัน Unit Tests อัตโนมัติ
   - ✅ ตรวจสอบ Linting
   - ✅ สร้าง Production Build
   - ✅ Auto-Approve PR หากผ่านทุกการตรวจสอบ
   - ✅ Deploy ไป GitHub Pages อัตโนมัติ

---

## 🔄 NPM Scripts

| Command | คำอธิบาย |
|---------|---------|
| `npm start` | เริ่มต้น Development Server (ng serve) |
| `npm test` | รัน Unit Tests (ng test) |
| `npm run build` | สร้าง Development Build |
| `npm run build -- --configuration production` | สร้าง Production Build |
| `npm run deploy` | Deploy ไป GitHub Pages |
| `npm run lint` | ตรวจสอบ Code Quality (ESLint/TSLint) |
| `npm run ai:approve` | AI Auto-Approve Mode |
| `npm run ai:commit` | AI Auto-Commit Changes |
| `npm run ai:deploy` | AI Full Pipeline |

---

## 📝 GitHub Pages Deployment

### ตั้งค่า Repository Settings:

1. ไปที่ **Settings** → **Pages**
2. เลือก **Deploy from a branch**
3. เลือก Branch: **gh-pages**
4. Save

### Deploy อัตโนมัติ:
```bash
npm run deploy
```

### Deploy ด้วย GitHub Actions:
```bash
git push origin main
# GitHub Actions จะ Build + Deploy อัตโนมัติ
```

---

## 🛡️ Safety & Security

### AI Code Review Restrictions:

ไฟล์ที่ **ห้ามแก้ไข** โดย AI:
- ❌ `.github/workflows/**`
- ❌ `angular.json`
- ❌ `tsconfig.json`
- ❌ `package.json` (version changes)

ไฟล์ที่ **ต้องรีวิว** ก่อนอนุมัติ:
- ⚠️ `src/app/operator-tablet/**`
- ⚠️ `src/environments/**`
- ⚠️ Services & Models

ไฟล์ที่ **สามารถแก้ไขอัตโนมัติ**:
- ✅ Components & Templates
- ✅ Styles (SCSS)
- ✅ Unit Tests
- ✅ Documentation

---

## 🚦 Development Workflow

### Local Development:
```bash
# 1. ติดตั้ง Dependencies
npm install

# 2. เริ่มต้น Dev Server
npm start

# 3. เปิด Terminal ใหม่ แล้วรัน Tests
npm test

# 4. ตรวจสอบ Code Quality
npm run lint

# 5. Push ไป GitHub
git add .
git commit -m "feat: add new feature"
git push origin feature-branch
```

### CI/CD Pipeline:
```
Push Code → GitHub Actions → Run Tests → Lint Check → Build → Auto-Approve → Deploy
```

---

## 📋 Pre-requisites

- **Node.js**: v16.x หรือสูงกว่า
- **npm**: v8.x หรือสูงกว่า
- **Angular CLI**: v14.x หรือสูงกว่า
- **Git**: สำหรับ Version Control

### ติดตั้ง Angular CLI:
```bash
npm install -g @angular/cli
```

### ตรวจสอบ Version:
```bash
node --version
npm --version
ng version
```

---

## 📚 Resources

- [Angular Official Documentation](https://angular.io/docs)
- [Angular CLI Documentation](https://angular.io/cli)
- [Jasmine Testing Framework](https://jasmine.github.io/)
- [Karma Test Runner](https://karma-runner.github.io/)
- [GitHub Pages Documentation](https://pages.github.com/)

---

## 🔧 Troubleshooting

### Port 4200 ถูกใช้งาน:
```bash
ng serve --port 4201
```

### Clear Node Modules & Reinstall:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Build ล้มเหลว:
```bash
npm run build -- --configuration production --verbose
```

### Tests ล้มเหลว:
```bash
npm test -- --watch=false --browsers=ChromeHeadless
```

---

## 📞 Support & Contribution

หากมีปัญหา หรือต้องการช่วยเหลือ:
1. สร้าง **GitHub Issue**
2. ส่ง **Pull Request**
3. ติดต่อ Development Team

---

## 📄 License

MIT License - ดูรายละเอียดใน LICENSE ไฟล์

---

**Last Updated**: 2024  
**Framework**: Angular 14+  
**Deployment**: GitHub Pages  
**AI Autonomous Mode**: Enabled ✅