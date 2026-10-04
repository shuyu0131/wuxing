/* 悟性 · Vercel 函数共用壳：CORS / JSON 解析 / 错误兜底 */
import { corsHeaders } from './common.mjs';

export function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [k, v] of Object.entries(corsHeaders())) res.setHeader(k, v);
  res.end(JSON.stringify(obj));
}
export async function readBody(req) {
  let b = '';
  for await (const c of req) { b += c; if (b.length > 1e6) throw new Error('payload too large'); }
  try { return JSON.parse(b || '{}'); } catch { return {}; }
}
export const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

/* 包一层：OPTIONS 预检、异常兜底、返回值 [code,obj] 或 obj */
export function guard(handler) {
  return async (req, res) => {
    for (const [k, v] of Object.entries(corsHeaders())) res.setHeader(k, v);
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    try {
      const body = req.method === 'POST' ? await readBody(req) : {};
      const out = await handler(body, ipOf(req), req, res);
      if (res.writableEnded) return;
      const [code, obj] = Array.isArray(out) && typeof out[0] === 'number' ? out : [200, out];
      json(res, code, obj);
    } catch (e) {
      if (!res.writableEnded) json(res, 500, { error: String(e.message || e) });
    }
  };
}
