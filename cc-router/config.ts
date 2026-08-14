export interface RouterConfig {
  port: number
  upstreamBaseUrl: string
  multimodalModel: string
}

export function loadConfig(): RouterConfig {
  return {
    port: Number(process.env.PORT ?? 8787),
    upstreamBaseUrl: process.env.UPSTREAM_BASE_URL ?? 'http://ai-service.tal.com/coding',
    multimodalModel: process.env.MULTIMODAL_MODEL ?? 'gpt-5.6-terra',
  }
}
