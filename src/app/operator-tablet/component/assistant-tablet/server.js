const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const WORKSPACE_DIR = process.cwd();

// ─── Search files/folders (used by @ mention) ──────────────────────────────
app.get('/api/fs/search', (req, res) => {
  const q = req.query.q || '';
  let results = [];
  const IGNORE = new Set(['node_modules', '.git', 'dist', '.angular', 'coverage']);

  const searchRec = (dir) => {
    if (results.length > 30) return;
    let files;
    try { files = fs.readdirSync(dir); } catch { return; }
    for (const f of files) {
      if (IGNORE.has(f) || f.startsWith('.')) continue;
      const fullPath = path.join(dir, f);
      let stat;
      try { stat = fs.statSync(fullPath); } catch { continue; }
      const relPath = path.relative(WORKSPACE_DIR, fullPath).replace(/\\/g, '/');
      if (relPath.toLowerCase().includes(q.toLowerCase())) {
        results.push({ path: relPath, type: stat.isDirectory() ? 'folder' : 'file' });
      }
      if (stat.isDirectory()) searchRec(fullPath);
    }
  };
  try { searchRec(WORKSPACE_DIR); } catch {}
  res.json(results);
});

// ─── Search inside file contents (grep) ─────────────────────────────────────
app.post('/api/fs/grep', (req, res) => {
  const { pattern, path: dirPath = '.' } = req.body;
  if (!pattern) return res.status(400).json({ error: 'pattern is required' });

  let results = [];
  const IGNORE = new Set(['node_modules', '.git', 'dist', '.angular', 'coverage']);
  const startDir = path.join(WORKSPACE_DIR, dirPath);

  const searchRec = (dir) => {
    if (results.length > 200) return; // จำกัดผลลัพธ์ที่ 200 บรรทัดกันข้อมูลล้น
    let files;
    try { files = fs.readdirSync(dir); } catch { return; }
    for (const f of files) {
      if (IGNORE.has(f) || f.startsWith('.')) continue;
      const fullPath = path.join(dir, f);
      let stat;
      try { stat = fs.statSync(fullPath); } catch { continue; }
      if (stat.isDirectory()) {
        searchRec(fullPath);
      } else {
        if (stat.size > 2 * 1024 * 1024) continue; // ข้ามไฟล์ที่ใหญ่เกิน 2MB (มักจะเป็น binary/ภาพ)
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(pattern)) {
              const relPath = path.relative(WORKSPACE_DIR, fullPath).replace(/\\/g, '/');
              results.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
              if (results.length > 200) break;
            }
          }
        } catch {}
      }
    }
  };
  try { searchRec(startDir); } catch (e) { return res.status(500).json({ error: e.message }); }
  res.json({ results });
});

// ─── Read file or list directory ────────────────────────────────────────────
app.post('/api/fs/read', (req, res) => {
  try {
    const fullPath = path.join(WORKSPACE_DIR, req.body.path);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const IGNORE = new Set(['node_modules', '.git', 'dist', '.angular']);
      const files = fs.readdirSync(fullPath, { withFileTypes: true })
        .filter(e => !IGNORE.has(e.name) && !e.name.startsWith('.'))
        .map(e => `${e.isDirectory() ? 'DIR ' : 'FILE'}: ${e.name}`);
      res.json({ content: `Directory: ${req.body.path}\n${files.join('\n')}` });
    } else {
      const content = fs.readFileSync(fullPath, 'utf-8');
      res.json({ content });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Read specific lines of a file ─────────────────────────────────────────
app.post('/api/fs/read_lines', (req, res) => {
  try {
    const { path: filePath, start_line = 1, end_line = 100 } = req.body;
    const fullPath = path.join(WORKSPACE_DIR, filePath);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is a directory' });
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const s = Math.max(0, start_line - 1);
    const e = Math.min(lines.length, end_line);
    
    if (s >= lines.length) {
      return res.json({ content: `[WARNING: Requested start_line (${start_line}) exceeds total lines (${lines.length}). Please request a valid range.]`, total_lines: lines.length });
    }

    const chunk = lines.slice(s, e).map((l, i) => `${s + i + 1} | ${l}`).join('\n');
    res.json({ content: chunk, total_lines: lines.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Write (full file overwrite) ────────────────────────────────────────────
app.post('/api/fs/write', (req, res) => {
  try {
    const fullPath = path.join(WORKSPACE_DIR, req.body.path);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, req.body.content, 'utf-8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Edit (targeted old_str → new_str replacement) ──────────────────────────
app.post('/api/fs/edit', (req, res) => {
  const { path: filePath, old_str, new_str } = req.body;
  if (!filePath || old_str === undefined || new_str === undefined) {
    return res.status(400).json({ error: 'path, old_str, and new_str are required' });
  }
  try {
    const fullPath = path.join(WORKSPACE_DIR, filePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    if (!content.includes(old_str)) {
      return res.status(400).json({ error: `old_str not found in ${filePath}` });
    }
    const newContent = content.replace(old_str, new_str);
    fs.writeFileSync(fullPath, newContent, 'utf-8');
    res.json({ success: true, newContent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Delete file or directory ──────────────────────────────────────────────
app.post('/api/fs/delete', (req, res) => {
  try {
    const fullPath = path.join(WORKSPACE_DIR, req.body.path);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Run shell command ──────────────────────────────────────────────────────
app.post('/api/run', (req, res) => {
  const { command, cwd } = req.body;
  if (!command) return res.status(400).json({ error: 'command is required' });

  const workDir = cwd ? path.resolve(WORKSPACE_DIR, cwd) : WORKSPACE_DIR;

  exec(command, { cwd: workDir, timeout: 60000 }, (error, stdout, stderr) => {
    res.json({
      stdout: stdout || '',
      stderr: stderr || '',
      exitCode: error ? (error.code ?? 1) : 0,
      success: !error
    });
  });
});

// ─── Claude API proxy (avoids CORS & hides API key) ─────────────────────────
app.post('/api/claude', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const anthropicVersion = req.headers['anthropic-version'] || '2023-06-01';

    // Pipe streaming responses back to client
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'anthropic-version': anthropicVersion
      },
      body: JSON.stringify(req.body)
    });

    if (req.body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Accel-Buffering', 'no');
      upstream.body.pipe(res);
    } else {
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    }
  } catch (error) {
    res.status(500).json({ error: { message: 'Proxy error: ' + error.message } });
  }
});

app.listen(PORT, () => {
  console.log(`✅ RE-CODE Server running on http://localhost:${PORT}`);
});
