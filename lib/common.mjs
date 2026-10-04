/* 悟性 · 共享校验与工具（server.mjs 与 Vercel api/ 函数共用） */

export const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export function validQ(q) {
  if (!q || typeof q !== 'object') return '题目格式错误';
  if (typeof q.s !== 'string' || q.s.length < 20 || q.s.length > 140) return '题干需要 20–140 字';
  if (!Array.isArray(q.o) || q.o.length !== 4 || q.o.some(o => typeof o !== 'string' || !o.trim() || o.length > 80)) return '四个选项都要填';
  if (new Set(q.o.map(o => o.trim())).size !== 4) return '四个选项不能重复';
  if (!Number.isInteger(q.a) || q.a < 0 || q.a > 3) return '正确答案下标无效';
  if (!Array.isArray(q.e) || q.e.length !== 4 || q.e.some(e => typeof e !== 'string' || !e.trim() || e.length > 120)) return '四条解析都要填';
  if (typeof q.t !== 'string' || !q.t.trim() || q.t.length > 60) return '心得需要 1–60 字';
  if (typeof q.c !== 'string' || q.c.length > 10) return '分类无效';
  return null;
}

/* 轻量限流：每实例每 IP 每 2 秒一次写操作 */
const lastHit = new Map();
export const rateOK = ip => {
  const now = Date.now();
  if ((lastHit.get(ip) || 0) > now - 2000) return false;
  lastHit.set(ip, now);
  return true;
};

/* CORS 头 */
export const corsHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});
