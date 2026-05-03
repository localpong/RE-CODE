const fs = require('fs');

const tsTabletFile = 'f:/GIT/RE-CODE/src/app/operator-tablet/component/operator-tablet/operator-tablet.component.ts';
let tsTabletCode = fs.readFileSync(tsTabletFile, 'utf8');

const currentLoop = `    // ระบบ Loop อัปเดตการเดินแบบสมูท (Smooth Movement) 30 FPS
    setInterval(() => {
      const dx = this.targetWorldX - this.currentX;
      const dy = this.targetWorldY - this.currentY;
      
      const groundZ = this.getTerrainHeight(this.currentX, this.currentY);
      
      // ระบบกระโดดแบบมีแรงโน้มถ่วง (สมูตขึ้น)
      this.currentZ += this.zVelocity;
      if (this.currentZ > groundZ) {
        this.zVelocity -= 1.5; // แรงโน้มถ่วง (Gravity) ดึงกลับลงมา
      } else {
        this.zVelocity = 0;
        this.currentZ = groundZ; // แตะพื้น
      }

      // ระบบเดินแนวนอน
      if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
        this.currentX += dx * 0.2; 
        this.currentY += dy * 0.2;
        this.isWalking = true;
      } else {
        this.currentX = this.targetWorldX;
        this.currentY = this.targetWorldY;
        this.isWalking = false;
      }
      
      const diffRot = this.targetMapRotation - this.mapRotation;
      if (Math.abs(diffRot) > 0.5) {
        this.mapRotation += diffRot * 0.2;
      } else {
        this.mapRotation = this.targetMapRotation;
      }
    }, 1000 / 30);`;

const newLoop = `    // ระบบ Loop อัปเดตการเดินแบบสมูท (Smooth Movement) 30 FPS
    setInterval(() => {
      const dx = this.targetWorldX - this.currentX;
      const dy = this.targetWorldY - this.currentY;
      
      const groundZ = this.getTerrainHeight(this.currentX, this.currentY);
      
      // ระบบกระโดดแบบมีแรงโน้มถ่วง (สมูตขึ้น)
      this.currentZ += this.zVelocity;
      if (this.currentZ > groundZ) {
        this.zVelocity -= 1.5; // แรงโน้มถ่วง (Gravity) ดึงกลับลงมา
      } else {
        this.zVelocity = 0;
        this.currentZ = groundZ; // แตะพื้น
      }

      // ระบบเดินแนวนอน
      if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
        this.currentX += dx * 0.2; 
        this.currentY += dy * 0.2;
        this.isWalking = true;
      } else {
        this.currentX = this.targetWorldX;
        this.currentY = this.targetWorldY;
        this.isWalking = false;
      }
      
      const diffRot = this.targetMapRotation - this.mapRotation;
      if (Math.abs(diffRot) > 0.5) {
        this.mapRotation += diffRot * 0.2;
      } else {
        this.mapRotation = this.targetMapRotation;
      }

      // ระบบเดินต่อเนื่องเมื่อกดปุ่มค้าง
      if (this.pressedKeys && this.pressedKeys.size > 0 && !this.isProcessing) {
        if (this.pressedKeys.has('w')) this.executeContinuousMovement('เดินหน้า');
        else if (this.pressedKeys.has('s')) this.executeContinuousMovement('ถอยหลัง');
        else if (this.pressedKeys.has('a')) this.executeContinuousMovement('เดินซ้าย');
        else if (this.pressedKeys.has('d')) this.executeContinuousMovement('เดินขวา');
      }
    }, 1000 / 30);`;

if (tsTabletCode.includes(currentLoop)) {
  tsTabletCode = tsTabletCode.replace(currentLoop, newLoop);
  fs.writeFileSync(tsTabletFile, tsTabletCode);
  console.log("Patched loop successfully!");
} else {
  console.log("Could not find the loop to patch.");
}