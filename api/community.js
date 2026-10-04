import { guard } from '../lib/http.mjs';
import { clean, validQ, rateOK } from '../lib/common.mjs';
import { storeGet, storeSet } from '../lib/store.mjs';
import { randomUUID } from 'node:crypto';

export const maxDuration = 10;
export default guard(async (b, ip, req) => {
  if (req.method === 'GET') {
    const community = (await storeGet('wuxing:community')) || [];
    return { items: community.slice(-60).reverse() };
  }
  if (req.method !== 'POST') return [405, { error: 'method not allowed' }];
  if (!rateOK(ip)) return [429, { error: '操作太频繁' }];
  const author = clean(b.author, 12);
  if (!author) return [400, { error: '请先在「我的」设置昵称' }];
  const err = validQ(b.q);
  if (err) return [400, { error: err }];
  const community = (await storeGet('wuxing:community')) || [];
  if (community.some(x => x.q.s === b.q.s)) return [400, { error: '已存在题干相同的题目' }];
  const item = {
    id: 'C' + randomUUID().replace(/-/g, '').slice(0, 12),
    author, no: clean(b.no, 20),
    q: { ...b.q, s: clean(b.q.s, 140) },
    plays: 0, correct: 0, likes: 0, at: Date.now()
  };
  community.push(item);
  await storeSet('wuxing:community', community);
  return { ok: true, q: { ...item.q, id: item.id } };
});
