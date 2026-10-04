/* AI 代理：浏览器直连大模型常被 CORS 拦，由本函数转发。
 * SSRF 防护（构造上排除）：上游 URL 只能来自下方 switch 的硬编码字面量，
 * 客户端只能传 provider 标识，无法注入任何地址；
 * 若部署方需要自定义网关，请直接修改本文件顶部的 CUSTOM_GATEWAY 常量。 */
import { guard } from '../lib/http.mjs';
import { clean } from '../lib/common.mjs';

export const maxDuration = 30;

/* 部署方如需自定义网关（如公司内部中转），把地址写死在这里，客户端选「custom」即可 */
const CUSTOM_GATEWAY = '';

function upstreamFor(provider) {
  switch (provider) {
    case 'zhipu':       return 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    case 'siliconflow': return 'https://api.siliconflow.cn/v1/chat/completions';
    case 'deepseek':    return 'https://api.deepseek.com/chat/completions';
    case 'moonshot':    return 'https://api.moonshot.cn/v1/chat/completions';
    case 'dashscope':   return 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    case 'openai':      return 'https://api.openai.com/v1/chat/completions';
    case 'openrouter':  return 'https://openrouter.ai/api/v1/chat/completions';
    case 'custom':      return CUSTOM_GATEWAY;
    default:            return '';
  }
}

export default guard(async b => {
  const provider = clean(b.provider || 'zhipu', 20);
  const upstream = upstreamFor(provider);
  if (!upstream) {
    return [400, { error: provider === 'custom'
      ? '自定义网关未配置：请修改 api/ai.js 顶部 CUSTOM_GATEWAY 常量后重新部署'
      : '未知 provider（可选：zhipu / siliconflow / deepseek / moonshot / dashscope / openai / openrouter / custom）' }];
  }
  const model = clean(b.model || process.env.AI_MODEL || '', 80);
  if (!model) return [400, { error: '未配置模型名称' }];
  const key = clean(b.key || process.env.AI_KEY || process.env['AI_KEY_' + provider.toUpperCase()] || '', 200);
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
  } catch {
    return [502, { error: '上游返回无法解析' }];
  }
});
