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
  rpmLimit?: number | null
  tpmLimit?: number | null
  status?: 'available' | 'unavailable'
  statusReason?: string
}

export type RecommendationCategory = string

export interface AiRecommendation {
  title: string
  desc: string
  query: string
  category?: RecommendationCategory
  personalized?: boolean
}

export type ModelsByCategory = Partial<Record<ModelCategory, AiModel[]>>

export type AiThemePreference = 'system' | 'light' | 'dark'

export interface AiPreferences {
  theme: AiThemePreference
}

export type ImageModelId = 'gpt-image-2' | 'gemini-3-pro-image'
export type ImageAspectRatio = '1:1' | '16:9' | '9:16'

export interface TextMessage {
  type?: 'text'
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
  status?: 'error' | 'interrupted'
}

export interface ImageRequestMessage {
  type: 'image-request'
  role: 'user'
  requestId: string
  prompt: string
  modelId: ImageModelId
  aspectRatio: ImageAspectRatio
  referenceImageId?: string
  createdAt: string
}

export interface ImageResultMessage {
  type: 'image-result'
  role: 'assistant'
  requestId: string
  modelId: ImageModelId
  prompt: string
  aspectRatio: ImageAspectRatio
  status: 'generating' | 'completed' | 'error' | 'cancelled'
  imageUrl?: string
  createdAt: string
  completedAt?: string
  errorMessage?: string
}

export interface GeminiMultimodalUserMessage {
  type: 'gemini-multimodal-user'
  role: 'user'
  requestId: string
  content: string
  referenceImageId?: string
  createdAt: string
}

export interface GeminiMultimodalAssistantMessage {
  type: 'gemini-multimodal-assistant'
  role: 'assistant'
  requestId: string
  content: string
  status: 'generating' | 'completed' | 'error' | 'cancelled'
  imageUrl?: string
  createdAt: string
  completedAt?: string
  errorMessage?: string
}

export type ChatMessage = TextMessage | ImageRequestMessage | ImageResultMessage | GeminiMultimodalUserMessage | GeminiMultimodalAssistantMessage

export interface ChatParams {
  reasoningEffort?: 'low' | 'medium' | 'high'
  maxTokens?: number
}

export interface ConversationOutlineItem {
  messageIndex: number
  title: string
  detail: string
}

export interface ConversationDigest {
  summary: string
  outline: ConversationOutlineItem[]
  sourceMessageCount: number
  updatedAt: string
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
  parentConversationId: number | null
  branchFromMessageIndex: number | null
  digest: ConversationDigest | null
  digestMessageCount: number
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
  parentConversationId: number | null
  hasDigest: boolean
  createdAt: string
  updatedAt: string
}
