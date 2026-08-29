import { Tabs, Typography } from 'antd';
import { JsonBlock } from './JsonBlock';
import { useT } from '../i18n';

const { Paragraph } = Typography;

interface ConnectSnippetsProps {
  apiKey: string;
  mockBaseUrl: string;
  sessionId?: string;
}

/** 接入示例：把 base_url 指过来就行。 */
export function ConnectSnippets({ apiKey, mockBaseUrl, sessionId = 'debug-001' }: ConnectSnippetsProps) {
  const t = useT();
  const prompt = t('connect.samplePrompt');
  const sessionBaseUrl = `${mockBaseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')}/${encodeURIComponent(sessionId)}/v1`;
  const python = `from openai import OpenAI

client = OpenAI(
    base_url="${sessionBaseUrl}",
    api_key="${apiKey}",
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "${prompt}"}],
)
print(response.choices[0].message)`;

  const langchain = `from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="gpt-4o",
    base_url="${sessionBaseUrl}",
    api_key="${apiKey}",
    streaming=True,
)`;

  const node = `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${sessionBaseUrl}',
  apiKey: '${apiKey}',
});

const stream = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: '${prompt}' }],
  stream: true,
});
for await (const chunk of stream) process.stdout.write(chunk.choices[0]?.delta?.content ?? '');`;

  const curl = `curl ${sessionBaseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "${prompt}"}],
    "stream": false
  }'`;

  return (
    <div>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {t('connect.sessionHint')}
      </Paragraph>
      <Tabs
        items={[
          {
            key: 'python',
            label: 'OpenAI SDK (Python)',
            children: <JsonBlock value={python} maxHeight={360} />,
          },
          {
            key: 'langchain',
            label: 'LangChain',
            children: <JsonBlock value={langchain} maxHeight={360} />,
          },
          {
            key: 'node',
            label: 'OpenAI SDK (Node)',
            children: <JsonBlock value={node} maxHeight={360} />,
          },
          { key: 'curl', label: 'curl', children: <JsonBlock value={curl} maxHeight={360} /> },
        ]}
      />
    </div>
  );
}
