import { guard } from '../lib/http.mjs';

export const maxDuration = 10;
export default guard(() => ({
  ok: true,
  name: 'wuxing-vercel',
  now: Date.now(),
  ai: {
    url: process.env.AI_URL || '',
    model: process.env.AI_MODEL || '',
    set: !!(process.env.AI_URL && process.env.AI_MODEL && process.env.AI_KEY)
  }
}));
