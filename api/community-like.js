import { guard } from '../lib/http.mjs';
import { rateOK } from '../lib/common.mjs';
import { storeGet, storeSet } from '../lib/store.mjs';

export const maxDuration = 10;
export default guard(async (b, ip) => {
  if (!rateOK(ip)) return [429, { error: '操作太频繁' }];
  const community = (await storeGet('wuxing:community')) || [];
  const it = community.find(x => x.id === b.id);
  if (!it) return [404, { error: '题目不存在' }];
  it.likes = (it.likes || 0) + 1;
  await storeSet('wuxing:community', community);
  return { ok: true, likes: it.likes };
});
