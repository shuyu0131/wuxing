#!/usr/bin/env node
/**
 * 悟性 · 职场修炼场 — 零依赖本地服务端
 *   node server.mjs            # 默认 http://localhost:8899
 *   PORT=9000 node server.mjs  # 自定义端口
 *
 * 职责：
 *   1. 托管本目录静态文件（index.html）
 *   2. 联网排行榜：POST /api/score 提交成绩，GET /api/leaderboard 取双榜
 *   3. 玩家出题：POST /api/community 投稿，GET /api/community 取题，
 *      POST /api/community/play 回报作答，POST /api/community/like 点赞
 *   4. AI 代理：POST /api/ai —— 浏览器直连大模型接口常被 CORS 拦，由本端转发；
 *      上游 URL 只能来自硬编码白名单（客户端传 provider 标识），防 SSRF
 *
 * 数据落在 ./data/*.json，不连任何第三方。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clean, validQ, rateOK, corsHeaders } from './lib/common.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
fs.mkdirSync(DATA, { recursive: true });

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return d; } };
const writeJSON = (f, d) => { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(path.join(DATA, f), JSON.stringify(d)); };
let scores = readJSON('scores.json', []);
let community = readJSON('community.json', []);

/* ---------- 工具 ---------- */
const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() });
  res.end(JSON.stringify(obj));
};
const cors = corsHeaders;
const readBody = req => new Promise((ok, no) => {
  let b = ''; req.on('data', c => { b += c; if (b.length > 1e6) { no(new Error('too large')); req.destroy(); } });
  req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { no(new Error('bad json')); } });
  req.on('error', no);
});

/* ---------- 路由 ---------- */
const routes = {
  'GET /api/health': () => ({ ok: true, name: 'wuxing-server', now: Date.now() }),

  'GET /api/leaderboard': () => {
    const byWuxing = [...scores].sort((a, b) => b.wuxing - a.wuxing).slice(0, 50)
      .map(({ nick, rank, level, wuxing, days }) => ({ nick, rank, level, wuxing, days }));
    const agg = {};
    for (const q of community) {
      const a = agg[q.author] ||= { nick: q.author, count: 0, plays: 0, likes: 0 };
      a.count++; a.plays += q.plays || 0; a.likes += q.likes || 0;
    }
    const contributors = Object.values(agg)
      .sort((a, b) => (b.count * 10 + b.plays + b.likes * 5) - (a.count * 10 + a.plays + a.likes * 5))
      .slice(0, 10);
    return { scores: byWuxing, contributors, total: community.length };
  },

  'POST /api/score': (b, ip) => {
    if (!rateOK(ip)) return [429, { error: '操作太频繁' }];
    const nick = clean(b.nick, 12), no = clean(b.no, 20);
    if (!nick) return [400, { error: '昵称不能为空' }];
    const wuxing = Math.max(0, Math.min(99999, +b.wuxing || 0));
    const rec = { nick, no, rank: clean(b.rank, 12), level: +b.level || 0, wuxing, days: +b.days || 0, at: Date.now() };
    const i = scores.findIndex(s => s.nick === nick && s.no === no);
    if (i >= 0) { if (wuxing >= scores[i].wuxing) scores[i] = rec; }
    else scores.push(rec);
    if (scores.length > 2000) scores = scores.sort((a, b) => b.wuxing - a.wuxing).slice(0, 1000);
    writeJSON('scores.json', scores);
    return { ok: true };
  },

  'GET /api/community': () => ({ items: community.slice(-60).reverse() }),

  'POST /api/community': (b, ip) => {
    if (!rateOK(ip)) return [429, { error: '操作太频繁' }];
    const author = clean(b.author, 12);
    if (!author) return [400, { error: '请先在「我的」设置昵称' }];
    const err = validQ(b.q);
    if (err) return [400, { error: err }];
    if (community.some(x => x.q.s === b.q.s)) return [400, { error: '已存在题干相同的题目' }];
    const item = {
      id: 'C' + Date.now().toString(36) + Math.floor(Math.random() * 1e4),
      author, no: clean(b.no, 20), q: { ...b.q, s: clean(b.q.s, 140) },
      plays: 0, correct: 0, likes: 0, at: Date.now()
    };
    community.push(item);
    writeJSON('community.json', community);
    return { ok: true, q: { ...item.q, id: item.id } };
  },

  'POST /api/community/play': b => {
    const it = community.find(x => x.id === b.id);
    if (!it) return [404, { error: '题目不存在' }];
    it.plays = (it.plays || 0) + 1; if (b.ok) it.correct = (it.correct || 0) + 1;
    writeJSON('community.json', community);
    return { ok: true };
  },

  'POST /api/community/like': (b, ip) => {
    if (!rateOK(ip)) return [429, { error: '操作太频繁' }];
    const it = community.find(x => x.id === b.id);
    if (!it) return [404, { error: '题目不存在' }];
    it.likes = (it.likes || 0) + 1;
    writeJSON('community.json', community);
    return { ok: true, likes: it.likes };
  },

  'POST /api/ai': async (b, ip) => {
    if (!rateOK(ip)) return [429, { error: '操作太频繁' }];
    // 上游 URL 只能来自硬编码白名单（客户端传 provider 标识，无法注入地址）
    const GATEWAYS = {
      zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      siliconflow: 'https://api.siliconflow.cn/v1/chat/completions',
      deepseek: 'https://api.deepseek.com/chat/completions',
      moonshot: 'https://api.moonshot.cn/v1/chat/completions',
      dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      openai: 'https://api.openai.com/v1/chat/completions',
      openrouter: 'https://openrouter.ai/api/v1/chat/completions',
      custom: process.env.AI_URL || '' // 部署方在环境变量配置的自定义网关（非用户输入）
    };
    const upstream = GATEWAYS[clean(b.provider || 'zhipu', 20)];
    if (!upstream) return [400, { error: '未知 provider（zhipu/siliconflow/deepseek/moonshot/dashscope/openai/openrouter/custom）' }];
    const model = clean(b.model || process.env.AI_MODEL || '', 80);
    if (!model) return [400, { error: '未配置模型名称' }];
    const key = clean(b.key || process.env.AI_KEY || process.env['AI_KEY_' + clean(b.provider, 20).toUpperCase()] || '', 200);
    if (!key) return [400, { error: '未配置 API Key（可在「我的」里填写，或在服务端环境变量配置）' }];
    if (!Array.isArray(b.messages) || !b.messages.length) return [400, { error: '参数不完整' }];
    const body = { model, messages: b.messages.slice(0, 12), temperature: 1, max_tokens: 1000 };
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key };
    const r = await fetch(upstream, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await r.text();
    if (!r.ok) return [502, { error: '上游返回 ' + r.status + '：' + text.slice(0, 200) }];
    try {
      const j = JSON.parse(text);
      const content = j.choices?.[0]?.message?.content ?? '';
      if (!content) return [502, { error: '上游返回为空' }];
      return { ok: true, content };
    } catch { return [502, { error: '上游返回无法解析' }]; }
  }
};

/* ---------- 静态文件 ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(req, res, pathname) {
  let p = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const ip = (req.socket.remoteAddress || '').replace('::ffff:', '') || 'unknown';
  if (req.method === 'OPTIONS') { res.writeHead(204, cors()); res.end(); return; }
  const u = new URL(req.url, 'http://x');
  const key = req.method + ' ' + u.pathname;
  const handler = routes[key];
  try {
    if (handler) {
      const body = req.method === 'POST' ? await readBody(req) : {};
      const out = await handler(body, ip);
      const [code, obj] = Array.isArray(out) && typeof out[0] === 'number' ? out : [200, out];
      return json(res, code, obj);
    }
    if (u.pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });
    serveStatic(req, res, decodeURIComponent(u.pathname));
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

let port = +process.env.PORT || 8899;
server.on('error', e => {
  if (e.code === 'EADDRINUSE' && port < 8920) { console.log(`端口 ${port} 被占用，尝试 ${port + 1} …`); server.listen(++port); }
  else { console.error(e); process.exit(1); }
});
server.listen(port, () => {
  console.log('悟性 · 职场修炼场 服务端已启动');
  console.log(`  本机访问   http://localhost:${port}`);
  console.log(`  局域网访问 http://<你的IP>:${port}   （同事可一起玩/上榜）`);
  console.log('  数据目录   ' + DATA);
});
