import { eq } from 'drizzle-orm'
import { db } from './db/client'
import { aiModels } from './db/schema'

export interface SeedModel {
  modelId: string
  displayName: string
  provider: 'openai-compatible' | 'anthropic'
  category: 'chat' | 'reasoning' | 'image'
  vendor: string
  capabilities: string[]
  contextWindow: number | null
  rpmLimit?: number | null
  tpmLimit?: number | null
  sortOrder: number
}

export const SEED_MODELS: SeedModel[] = [
  // OpenAI compatible
  { modelId: 'gpt-5.4', displayName: 'GPT 5.4', provider: 'openai-compatible', category: 'chat', vendor: 'openai', capabilities: ['streaming', 'reasoning_effort'], contextWindow: 128000, rpmLimit: 5, tpmLimit: 10000, sortOrder: 10 },
  { modelId: 'gpt-5.5', displayName: 'GPT 5.5', provider: 'openai-compatible', category: 'chat', vendor: 'openai', capabilities: ['streaming', 'reasoning_effort'], contextWindow: 128000, rpmLimit: 50, tpmLimit: 200000, sortOrder: 11 },
  { modelId: 'gpt-5.6-sol', displayName: 'GPT 5.6 Sol', provider: 'openai-compatible', category: 'chat', vendor: 'openai', capabilities: ['streaming', 'reasoning_effort'], contextWindow: 128000, rpmLimit: 50, tpmLimit: 200000, sortOrder: 12 },
  { modelId: 'deepseek-v4-pro', displayName: 'DeepSeek V4 Pro', provider: 'openai-compatible', category: 'chat', vendor: 'deepseek', capabilities: ['streaming'], contextWindow: 1000000, rpmLimit: 50, tpmLimit: 200000, sortOrder: 20 },
  { modelId: 'deepseek-v4-flash', displayName: 'DeepSeek V4 Flash', provider: 'openai-compatible', category: 'chat', vendor: 'deepseek', capabilities: ['streaming'], contextWindow: 1000000, rpmLimit: 50, tpmLimit: 200000, sortOrder: 21 },
  { modelId: 'doubao-seed-2.0-mini', displayName: 'Doubao Seed 2.0 mini', provider: 'openai-compatible', category: 'chat', vendor: 'doubao', capabilities: ['streaming', 'reasoning_mode'], contextWindow: 256000, rpmLimit: 5, tpmLimit: 10000, sortOrder: 22 },
  { modelId: 'gemini-3-pro-preview', displayName: 'Gemini 3 Pro Preview', provider: 'openai-compatible', category: 'chat', vendor: 'google', capabilities: ['streaming', 'tool-call', 'multi-tool-call', 'vision', 'structured-output', 'agent-thought', 'video', 'document', 'audio'], contextWindow: 1000000, rpmLimit: 20, tpmLimit: 20000, sortOrder: 23 },
  { modelId: 'glm-5.2', displayName: 'GLM 5.2', provider: 'openai-compatible', category: 'chat', vendor: 'zai', capabilities: ['streaming'], contextWindow: 1000000, rpmLimit: 30, tpmLimit: 500000, sortOrder: 30 },
  { modelId: 'kimi-k3', displayName: 'Kimi K3', provider: 'openai-compatible', category: 'chat', vendor: 'moonshot', capabilities: ['streaming', 'reasoning_mode'], contextWindow: 1_000_000, rpmLimit: 50, tpmLimit: 500_000, sortOrder: 31 },
  { modelId: 'kimi-k2-7-code', displayName: 'Kimi K2.7 Code', provider: 'openai-compatible', category: 'reasoning', vendor: 'moonshot', capabilities: ['streaming', 'reasoning_mode'], contextWindow: 256000, rpmLimit: 30, tpmLimit: 50000, sortOrder: 40 },
  { modelId: 'gpt-image-2', displayName: 'GPT-Image-2', provider: 'openai-compatible', category: 'image', vendor: 'openai', capabilities: ['image_generation'], contextWindow: null, rpmLimit: 20, tpmLimit: 0, sortOrder: 50 },
  { modelId: 'gemini-3-pro-image', displayName: 'Gemini 3 Pro Image', provider: 'openai-compatible', category: 'image', vendor: 'google', capabilities: ['image_generation'], contextWindow: null, rpmLimit: 20, tpmLimit: 0, sortOrder: 51 },
  // Anthropic
  { modelId: 'claude-opus-4.6', displayName: 'Claude Opus 4.6', provider: 'anthropic', category: 'chat', vendor: 'anthropic', capabilities: ['streaming', 'tool-call', 'multi-tool-call', 'stream-tool-call', 'structured-output', 'vision', 'agent-thought'], contextWindow: 200000, rpmLimit: 5, tpmLimit: 10000, sortOrder: 1 },
  { modelId: 'claude-opus-4.7', displayName: 'Claude Opus 4.7', provider: 'anthropic', category: 'chat', vendor: 'anthropic', capabilities: ['streaming'], contextWindow: 200000, rpmLimit: 20, tpmLimit: 200000, sortOrder: 2 },
  { modelId: 'claude-opus-4.8', displayName: 'Claude Opus 4.8', provider: 'anthropic', category: 'chat', vendor: 'anthropic', capabilities: ['streaming'], contextWindow: 200000, rpmLimit: 20, tpmLimit: 200000, sortOrder: 3 },
  { modelId: 'claude-opus-5', displayName: 'Claude Opus 5', provider: 'anthropic', category: 'chat', vendor: 'anthropic', capabilities: ['streaming'], contextWindow: 200000, rpmLimit: 50, tpmLimit: 500000, sortOrder: 4 },
  { modelId: 'claude-sonnet-4.6', displayName: 'Claude Sonnet 4.6', provider: 'anthropic', category: 'chat', vendor: 'anthropic', capabilities: ['streaming'], contextWindow: 200000, rpmLimit: 100, tpmLimit: 200000, sortOrder: 5 },
  { modelId: 'claude-sonnet-5', displayName: 'Claude Sonnet 5', provider: 'anthropic', category: 'chat', vendor: 'anthropic', capabilities: ['streaming'], contextWindow: 200000, rpmLimit: 50, tpmLimit: 500000, sortOrder: 6 },
]

export async function seedAiModels(): Promise<void> {
  const now = new Date()
  for (const m of SEED_MODELS) {
    const existing = await db.select({ id: aiModels.id }).from(aiModels).where(eq(aiModels.modelId, m.modelId)).get()
    if (existing) {
      await db.update(aiModels).set({
        displayName: m.displayName,
        provider: m.provider,
        category: m.category,
        vendor: m.vendor,
        capabilities: m.capabilities,
        contextWindow: m.contextWindow,
        rpmLimit: m.rpmLimit ?? null,
        tpmLimit: m.tpmLimit ?? null,
        sortOrder: m.sortOrder,
        updatedAt: now,
      }).where(eq(aiModels.modelId, m.modelId))
      continue
    }
    await db.insert(aiModels).values({
      ...m,
      enabled: 1,
      createdAt: now,
      updatedAt: now,
    })
  }
}
