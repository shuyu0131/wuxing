/* 悟性 · 存储适配层
 *  - 配置了 Upstash Redis（KV_REST_API_URL / KV_REST_API_TOKEN，Vercel 集成自动注入）→ 全局持久化
 *  - 未配置 → 内存存储（无服务器实例间不共享，重启即清空；适合先跑起来看效果）
 * 两个键：wuxing:scores / wuxing:community，值为整个 JSON 数组（小团队规模足够，整体写回）。
 */
const KV_URL = process.env.KV_REST_API_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || '';
export const KV_ON = !!(KV_URL && KV_TOKEN);

async function kvGet(key) {
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const j = await r.json();
  if (!j.result) return null;
  try { return JSON.parse(j.result); } catch { return null; }
}
async function kvSet(key, value) {
  const r = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(value)
  });
  if (!r.ok) throw new Error('KV write failed: ' + r.status);
  return true;
}

const mem = new Map();
export async function storeGet(key) {
  if (KV_ON) return kvGet(key);
  return mem.get(key) ?? null;
}
export async function storeSet(key, value) {
  if (KV_ON) return kvSet(key, value);
  mem.set(key, value);
  return true;
}
