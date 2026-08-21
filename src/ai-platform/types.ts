export type ModelProvider = 'openai-compatible' | 'anthropic'
export type ModelCategory = 'chat' | 'reasoning' | 'image'

export interface AiModel {
  id: number
  modelId: string
  displayName: string
  provider: ModelProvider
  category: ModelCategory
  vendor: string
  capabilities: string[]
  contextWindow: number | null
  sortOrder: number
  enabled: number
  createdAt: string
  updatedAt: string
}

export interface AiRecommendation {
  title: string
  desc: string
  query: string
}

export type ModelsByCategory = Partial<Record<ModelCategory, AiModel[]>>

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
}

export interface ChatParams {
  reasoningEffort?: 'low' | 'medium' | 'high'
  maxTokens?: number
}

export interface AiConversation {
  id: number
  userKey: string
  title: string
  modelId: string
  systemPrompt: string
  params: ChatParams
  messages: ChatMessage[]
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export interface AiConversationSummary {
  id: number
  title: string
  modelId: string
  systemPrompt: string
  params: ChatParams
  pinned: boolean
  createdAt: string
  updatedAt: string
}
