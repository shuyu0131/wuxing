import { guard } from '../lib/http.mjs';
import { storeGet } from '../lib/store.mjs';

export const maxDuration = 10;
export default guard(async () => {
  const scores = (await storeGet('wuxing:scores')) || [];
  const community = (await storeGet('wuxing:community')) || [];
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
});
