const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// อนุญาตให้ Frontend ยิง API ข้ามโดเมนมาได้ (แก้ CORS Error)
app.use(cors());
// อนุญาตให้แอปอ่านข้อมูลแบบ JSON
app.use(express.json());

// สร้าง Endpoint สำหรับรับ Request จาก Angular แล้วส่งต่อไปที่ Claude
app.post('/api/claude', async (req, res) => {
  try {
    // รับ API Key จาก Header ที่ Angular ส่งมา
    const apiKey = req.headers['x-api-key'];
    const anthropicVersion = req.headers['anthropic-version'] || '2023-06-01';

    // ยิง Request ต่อไปหา Anthropic แบบ Server-to-Server (ไม่ติด CORS)
    // *หมายเหตุ: ต้องรันด้วย Node.js v18 ขึ้นไปถึงจะรองรับ fetch() ในตัว
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'anthropic-version': anthropicVersion
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    
    // ส่งข้อมูลตอบกลับไปให้ Angular
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: { message: 'Internal Proxy Server Error: ' + error.message } });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Claude Proxy Server is running on http://localhost:${PORT}`);
});