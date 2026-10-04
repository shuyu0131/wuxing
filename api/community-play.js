import { guard } from '../lib/http.mjs';
import { storeGet, storeSet } from '../lib/store.mjs';

export const maxDuration = 10;
export default guard(async b => {
  const community = (await storeGet('wuxing:community')) || [];
  const it = community.find(x => x.id === b.id);
  if (!it) return [404, { error: '题目不存在' }];
  it.plays = (it.plays || 0) + 1; if (b.ok) it.correct = (it.correct || 0) + 1;
  await storeSet('wuxing:community', community);
  return { ok: true };
});
