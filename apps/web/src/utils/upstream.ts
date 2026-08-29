import type { Project, UpstreamConfig } from '@agent-mock/shared';
import { t } from '../i18n';

/**
 * 取项目可用的上游 AI 列表。
 * 老版本项目只能配一个上游（upstreamEnabled + upstreamBaseUrl），
 * 这里把它包成一条 id 为 legacy 的配置，让上层只需要面对数组这一种形态。
 */
export function resolveUpstreams(project: Project | null): UpstreamConfig[] {
  const settings = project?.settings;
  if (!settings) return [];
  if (settings.upstreams.length > 0) return settings.upstreams;
  if (!settings.upstreamEnabled || !settings.upstreamBaseUrl) return [];
  return [
    {
      id: 'legacy',
      name: t('upstream.defaultName'),
      enabled: true,
      baseUrl: settings.upstreamBaseUrl,
      apiKey: settings.upstreamApiKey,
      model: settings.upstreamModel,
    },
  ];
}
