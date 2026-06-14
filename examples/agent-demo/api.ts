/**
 * OpenAI 客户端 + 流式聊天 API
 */

import OpenAI from 'openai'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import type { TokenUsage } from './component/types.js'

// ─── 环境变量 ────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

// ─── OpenAI 客户端 ────────────────────────────────

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: `${process.env.DEEPSEEK_API_KEY}`,
})

// ─── 流式聊天 ────────────────────────────────────

export async function streamChat(
  messages: Array<{ role: string; content: string }>,
  onThinking: () => void,
  onChunk: (content: string, reasoning: string) => void,
  onDone: (content: string, reasoning: string, usage?: TokenUsage) => void,
  onError: (err: Error) => void,
) {
  try {
    const stream = await openai.chat.completions.create({
      messages: messages as any,
      model: 'deepseek-v4-flash',
      thinking: { type: 'enabled' },
      stream: true,
      stream_options: { include_usage: true },
    })

    let fullContent = ''
    let fullReasoning = ''
    let hasReasoning = false
    let usage: TokenUsage | undefined
    let thinkingNotified = false

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (delta) {
        if (delta.reasoning_content) {
          if (!hasReasoning) {
            hasReasoning = true
            if (!thinkingNotified) {
              thinkingNotified = true
              onThinking()
            }
          }
          fullReasoning += delta.reasoning_content
        }
        if (delta.content) {
          fullContent += delta.content
        }
      }
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          completionTokens: chunk.usage.completion_tokens ?? 0,
          totalTokens: chunk.usage.total_tokens ?? 0,
        }
      }
      onChunk(fullContent, fullReasoning)
    }

    onDone(fullContent, fullReasoning, usage)
  } catch (err: any) {
    onError(err instanceof Error ? err : new Error(String(err.message || err)))
  }
}
