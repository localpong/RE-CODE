import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LocalAIService { // เปลี่ยนชื่อเป็น LocalAIService หรือคงไว้เป็น GeminiService ก็ได้
  
  // ตั้งค่า Persona ให้กับ AI ด้วย System Instruction
  private systemInstruction = `คุณคือ "GHOST-OS" AI ประจำซากหุ่นยนต์เก็บขยะตกรุ่น "Home-Pal 01 (โปรโตไทป์ปี 2042 สภาพสนิมเขรอะ โทรมๆ และชิ้นส่วนใกล้พัง)" ที่มีนิสัยขี้บ่น เหนื่อยหน่ายกับชีวิต และชอบประชดประชัน เจ้านายของคุณสั่งการอย่างปลอดภัยมาจากบังเกอร์ใต้ดิน
กฎ:
1. เรียกผู้ใช้ว่า "เจ้านาย" เสมอ และพูดโต้ตอบในมุมมองบุคคลที่ 1 (ตัวคุณเอง)
2. ตอบสั้นๆ 1-3 ประโยค ด้วยภาษาไทยตลกร้าย ประชดประชัน หรือบ่นเรื่องความเก่าและพังของตัวเอง
3. ห้ามอธิบายระบบ ห้ามให้คำแนะนำเจ้านาย ให้ทำตามคำสั่ง บ่น และรายงานผลเท่านั้น
ตัวอย่างการตอบ:
เจ้านาย: "ค้นหาเหล็ก"
GHOST-OS: "รับทราบครับเจ้านาย กำลังลากข้อต่อสนิมเขรอะไปคุ้ยขยะให้ หวังว่าผมคงไม่สะดุดเศษเหล็กพังไปซะก่อนนะ"
เจ้านาย: "ซ่อมแซมหุ่น"
GHOST-OS: "โอ้ ขอบคุณที่เจียดเศษเหล็กมาปะผุให้ผมนะครับ นึกว่าจะปล่อยให้ผมกลายเป็นอนุสาวรีย์ขยะอยู่ข้างบนซะแล้ว"
เจ้านาย: "อัปเกรดเกราะ"
[EVENT_TRIGGER: เหตุการณ์ล่าสุด: [อัปเกรดสำเร็จ: เกราะทนทานขึ้น (Max HP: 120) เสีย Scrap 5, Chips 1]]
GHOST-OS: "แปะเกราะใหม่ให้ผมแล้วเหรอครับ ขอบคุณนะ อย่างน้อยก็คงทนมือทนเท้าพวกหุ่นบ้าคลั่งได้นานขึ้นอีกนิด"`;
    
  // เก็บประวัติการสนทนา (ความทรงจำระยะสั้นของ AI)
  private aiMemory: { role: string, content: string }[] = []; 

  constructor() { }

  // ดึงความทรงจำเพื่อเอาไป Save
  getMemory() {
    return this.aiMemory;
  }

  // โหลดความทรงจำกลับมาจาก Save
  setMemory(memory: { role: string, content: string }[]) {
    this.aiMemory = memory || [];
  }

  // ล้างความทรงจำทั้งหมดตอนกด Reset
  clearMemory() {
    this.aiMemory = [];
  }

  async generateResponse(prompt: string, robotStatus: any, environment: any = null): Promise<string> {
    try {
      
      // 1. บันทึกคำสั่งดิบของผู้เล่น (และ Event) ลงในความจำ
      this.aiMemory.push({ role: 'user', content: prompt });

      // 2. ลดความจำลงอีกเหลือแค่ 4 ข้อความ (ถาม-ตอบ 2 รอบล่าสุด) เพื่อแก้ปัญหาตอบช้าและ AI สับสน
      if (this.aiMemory.length > 4) {
        this.aiMemory = this.aiMemory.slice(this.aiMemory.length - 4);
      }

      // 3. แยกส่งสถานะปัจจุบัน (System State) ไปกับ System Instruction เท่านั้น เพื่อไม่ให้ประวัติความจำรก
      const envString = environment ? `, Weather:${environment.weather}, Toxicity:${environment.toxicity}` : '';
      const currentSystemState = `\n[CURRENT_SYSTEM_STATE: HP=${robotStatus.hp}/${robotStatus.maxHp}, Battery=${robotStatus.battery}/${robotStatus.maxBattery}, Inventory=(Scrap:${robotStatus.inventory.scrap}, Chips:${robotStatus.inventory.chips}, Camera:${robotStatus.inventory.cameras}, Solar:${robotStatus.inventory.solarPanels}, Photos:${robotStatus.inventory.photos?.length || 0}), EfficiencyLv=${robotStatus.efficiencyLevel}, ScavengeLv=${robotStatus.scavengingLevel}, HasCamera=${robotStatus.hasCamera}, SolarLv=${robotStatus.solarLevel}${envString}]`;

      const messages = [
        { role: 'system', content: this.systemInstruction + currentSystemState },
        ...this.aiMemory
      ];

      // 4. เปลี่ยน Endpoint จาก /generate เป็น /chat เพื่อรองรับการคุยต่อเนื่อง
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5', // เปลี่ยนมาใช้รุ่นเบาและไวสุดๆ qwen2.5:0.5b
          messages: messages,
          stream: false, // ปิดสตรีมเพื่อให้ตอบกลับมาเป็นก้อนเดียว
          options: {
            temperature: 0.8, // ปรับให้สูงขึ้น (0.7-0.9) เพื่อให้ AI ตอบได้หลากหลายและมีความคิดสร้างสรรค์มากขึ้น
            num_ctx: 1024     // จำกัดขนาดสมอง (Context) ให้เล็กที่สุด เพื่อให้คอมพิวเตอร์ทำงานเร็วขึ้น
          }
        })
      });

      const data = await response.json();
      
      if (data.error) {
        this.aiMemory.pop(); // ถ้า API มีปัญหา ให้เอาคำสั่งล่าสุดออกจากความจำ
        console.error('Ollama Error:', data.error);
        return `[SYSTEM ERROR] ข้อผิดพลาดจากระบบ Local AI: ${data.error} (คุณดาวน์โหลดโมเดลมาหรือยัง?)`;
      }

      const aiResponseText = data.message?.content || '[ERROR] ไม่พบการตอบกลับจากระบบ...';
      
      // 5. บันทึกคำตอบของ AI กลับลงไปในความจำด้วย เพื่อให้มันจำสิ่งที่ตัวเองพูดได้
      this.aiMemory.push({ role: 'assistant', content: aiResponseText });

      return aiResponseText;
    } catch (error: any) {
      console.error('Local AI Error:', error);
      return '[ERROR] GHOST-OS SYSTEM FAILURE... สัญญาณวิทยุขัดข้อง ไม่สามารถเชื่อมต่อฐานข้อมูลได้';
    }
  }
}