const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const root = path.join(__dirname, 'public');
const maxBodyBytes = 20 * 1024 * 1024;

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(Object.assign(new Error('이미지 용량이 너무 큽니다.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('잘못된 요청입니다.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

async function removeHandwriting(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    return json(res, 503, { error: '서버에 OPENAI_API_KEY가 설정되지 않았습니다.' });
  }

  try {
    const { image } = await readJson(req);
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image || '');
    if (!match) return json(res, 400, { error: 'PNG, JPG 또는 WEBP 이미지를 넣어주세요.' });

    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 15 * 1024 * 1024) {
      return json(res, 413, { error: '이미지는 15MB 이하여야 합니다.' });
    }

    const ext = match[1].split('/')[1].replace('jpeg', 'jpg');
    const form = new FormData();
    form.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1');
    form.append('image[]', new Blob([bytes], { type: match[1] }), `worksheet.${ext}`);
    form.append('prompt', [
      'This is a photographed or scanned Korean school worksheet.',
      'Remove only handwriting, pencil work, pen marks, highlighting, grading marks, check marks, circles, and scribbles added by a person.',
      'Preserve every original printed character, number, math symbol, diagram, line, table, box, spacing, crop, and page layout exactly.',
      'Restore erased areas to the natural paper background.',
      'Do not solve the problems. Do not rewrite, translate, sharpen, invent, move, or redesign any printed content.',
      'Return the cleaned worksheet only.'
    ].join(' '));
    form.append('input_fidelity', 'high');
    form.append('quality', 'high');
    form.append('output_format', 'png');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    const aiResponse = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: controller.signal
    }).finally(() => clearTimeout(timer));

    const result = await aiResponse.json();
    if (!aiResponse.ok) {
      console.error('OpenAI image edit failed:', aiResponse.status, result?.error?.message || result);
      return json(res, 502, { error: 'AI가 이미지를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.' });
    }

    const base64 = result?.data?.[0]?.b64_json;
    if (!base64) return json(res, 502, { error: 'AI 처리 결과에 이미지가 없습니다.' });
    return json(res, 200, { image: `data:image/png;base64,${base64}` });
  } catch (error) {
    const status = error.status || (error.name === 'AbortError' ? 504 : 500);
    const message = error.name === 'AbortError'
      ? 'AI 처리 시간이 너무 오래 걸렸습니다. 다시 시도해주세요.'
      : (error.message || 'AI 필기 지우기 중 오류가 발생했습니다.');
    return json(res, status, { error: message });
  }
}

http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  if (req.method === 'POST' && pathname === '/api/remove-handwriting') {
    return removeHandwriting(req, res);
  }

  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(root, `.${decodeURIComponent(requested)}`);
  if (!file.startsWith(`${root}${path.sep}`)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(file);
    const type = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}).listen(port, () => console.log(`1등급 연습기: http://localhost:${port}`));
