import { guard } from '../lib/http.mjs';
import { clean, rateOK } from '../lib/common.mjs';
import { storeGet, storeSet } from '../lib/store.mjs';

export const maxDuration = 10;
export default guard(async (b, ip) => {
  if (!rateOK(ip)) return [429, { error: '操作太频繁' }];
  const nick = clean(b.nick, 12), no = clean(b.no, 20);
  if (!nick) return [400, { error: '昵称不能为空' }];
  const rec = {
    nick, no,
    rank: clean(b.rank, 12), level: +b.level || 0,
    wuxing: Math.max(0, Math.min(99999, +b.wuxing || 0)),
    days: +b.days || 0, at: Date.now()
  };
  const scores = (await storeGet('wuxing:scores')) || [];
  const i = scores.findIndex(s => s.nick === nick && s.no === no);
  if (i >= 0) { if (rec.wuxing >= scores[i].wuxing) scores[i] = rec; }
  else scores.push(rec);
  const trimmed = scores.sort((a, b) => b.wuxing - a.wuxing).slice(0, 1000);
  await storeSet('wuxing:scores', trimmed);
  return { ok: true };
});
