/**
 * 冒烟测试脚本：不依赖任何第三方包，直接用 fetch 打 Mock API。
 *
 *   node examples/smoke.mjs                     # 用示例项目的 key（sk-mock-demo）
 *   MOCK_API_KEY=sk-mock-xxx node examples/smoke.mjs
 *   MOCK_BASE_URL=http://localhost:3000 node examples/smoke.mjs
 *
 * 覆盖：规则命中（Think + Tool Call）→ 回传 tool 结果 → 拿到最终回复，
 * 以及一次流式请求。人工模式请配合 Web UI 使用。
 */

const SERVER_URL = (process.env.MOCK_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '').replace(/\/v1$/, '');
const API_KEY = process.env.MOCK_API_KEY ?? 'sk-mock-demo';
const SESSION_ID = process.env.MOCK_SESSION_ID ?? `smoke-${Date.now()}`;

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${API_KEY}`,
  // HTTP 头只能放 ASCII，中文名请用 encodeURIComponent，服务端会自动解码
  'X-Mock-Session-Name': encodeURIComponent('冒烟测试'),
};
const BASE_URL = `${SERVER_URL}/${encodeURIComponent(SESSION_ID)}/v1`;

async function chat(body) {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`);
  return JSON.parse(text);
}

async function streamChat(body) {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoning = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      const chunk = JSON.parse(payload);
      const delta = chunk.choices?.[0]?.delta ?? {};
      if (delta.content) content += delta.content;
      if (delta.reasoning_content) reasoning += delta.reasoning_content;
    }
  }
  return { content, reasoning };
}

function log(title, value) {
  console.log(`\n=== ${title} ===`);
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

const messages = [{ role: 'user', content: '帮我查询订单 123456' }];

log('会话 ID', SESSION_ID);

// 会话必须显式绑定规则（ruleIds）才会参与规则匹配。找到示例项目，把启用规则
// 全部绑到本次冒烟会话上；管理 API 的接口详见 apps/server/src/api。
const projects = (await (await fetch(`${SERVER_URL}/api/projects`)).json()).items;
const project = projects.find((item) => item.apiKey === API_KEY) ?? projects[0];
if (project) {
  const rules = (await (await fetch(`${SERVER_URL}/api/projects/${project.id}/rules`)).json())
    .items.filter((rule) => rule.enabled);
  const created = await fetch(`${SERVER_URL}/api/projects/${project.id}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '冒烟测试', externalId: SESSION_ID, ruleIds: rules.map((rule) => rule.id) }),
  });
  if (!created.ok) {
    const detail = await created.text();
    throw new Error(`绑定规则的会话创建失败：HTTP ${created.status} ${detail}`);
  }
  log('已绑定启用规则', rules.map((rule) => rule.name));
}

// 第一轮：示例规则会返回 Think + get_order 的 tool call
const first = await chat({ model: 'gpt-4o', messages });
log('第 1 轮响应', first.choices[0].message);

const toolCalls = first.choices[0].message.tool_calls ?? [];
if (toolCalls.length > 0) {
  messages.push(first.choices[0].message);
  for (const call of toolCalls) {
    // 真实场景里这一步是 Agent 执行 Tool；这里直接用 Mock 的 Tool 端点取假数据
    const toolResponse = await fetch(`${BASE_URL}/tools/${call.function.name}`, {
      method: 'POST',
      headers,
      body: call.function.arguments || '{}',
    });
    const result = await toolResponse.json();
    log(`Tool ${call.function.name} 返回`, result);
    messages.push({
      role: 'tool',
      tool_call_id: call.id,
      name: call.function.name,
      content: JSON.stringify(result),
    });
  }

  // 第二轮：把 tool 结果回传，示例规则会给出最终答复
  const second = await chat({ model: 'gpt-4o', messages });
  log('第 2 轮响应', second.choices[0].message);
}

// 流式
const streamed = await streamChat({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: '帮我查询订单 999' }],
});
log('流式结果', streamed);

console.log('\n完成。打开 Web UI 的工作台即可看到这次会话的完整时间线。');
