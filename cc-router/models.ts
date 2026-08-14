const MULTIMODAL_MODELS = new Set<string>([
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5.2-codex',
  'deepseek-v4-pro',
  'kimi-k2.7-code',
  'glm-4.7',
  'glm-5.1',
  'glm-5',
])

export function supportsMultimodal(model: string): boolean {
  if (model.startsWith('claude-')) return false
  return MULTIMODAL_MODELS.has(model)
}
