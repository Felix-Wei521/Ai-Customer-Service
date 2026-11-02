<script setup lang="ts">
import { ref, nextTick } from 'vue'

// 消息类型
interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

// 状态管理
const messages = ref<Message[]>([])
const inputMessage = ref('')
const isLoading = ref(false)
const error = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

// 滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// 发送消息（流式版本）
const sendMessage = async () => {
  if (!inputMessage.value.trim() || isLoading.value) {
    return
  }

  const userMessage = inputMessage.value.trim()
  inputMessage.value = ''
  error.value = ''

  // 添加用户消息到列表
  messages.value.push({
    id: Date.now(),
    role: 'user',
    content: userMessage,
    timestamp: new Date()
  })

  isLoading.value = true

  // 先添加一个空的 AI 消息（用于流式填充）
  const aiMessageId = Date.now() + 1
  messages.value.push({
    id: aiMessageId,
    role: 'assistant',
    content: '',
    timestamp: new Date()
  })

  try {
    // 调用流式 API
    const response = await fetch('http://localhost:3000/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: userMessage
      })
    })

    if (!response.ok) {
      throw new Error('Network response was not ok')
    }

    // 获取流式读取器
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Failed to get response reader')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    // 逐块读取数据
    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      // 解码数据（处理 UTF-8 字符边界）
      buffer += decoder.decode(value, { stream: true })

      // 按行分割
      const lines = buffer.split('\n')

      // 保留最后一行（可能不完整）
      buffer = lines.pop() || ''

      // 处理每一行
      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue

        const data = line.replace(/^data: /, '').trim()

        // 检测结束标记
        if (data === '[DONE]') {
          break
        }

        try {
          const parsed = JSON.parse(data)

          if (parsed.error) {
            error.value = parsed.error
            break
          }

          if (parsed.text) {
            // 找到最后一条 AI 消息，累加内容
            const lastMessage = messages.value.find(m => m.id === aiMessageId)
            if (lastMessage) {
              lastMessage.content += parsed.text
              // 每次更新后滚动到底部
              scrollToBottom()
            }
          }
        } catch (e) {
          console.error('Failed to parse SSE data:', data, e)
        }
      }
    }

  } catch (err) {
    error.value = '发送失败，请检查网络连接'
    console.error('Error:', err)
    // 如果失败，删除空的 AI 消息
    const index = messages.value.findIndex(m => m.id === aiMessageId)
    if (index !== -1 && !messages.value[index].content) {
      messages.value.splice(index, 1)
    }
  } finally {
    isLoading.value = false
  }
}

// 回车发送
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}
</script>

<template>
  <div class="chat-container">
    <div class="chat-header">
      <h1>🤖 AI 客服助手</h1>
      <p>Day 3-4: 流式输出（SSE）</p>
    </div>

    <div class="chat-messages" ref="messagesContainer">
      <div v-if="messages.length === 0" class="empty-state">
        <p>👋 你好！我是 AI 助手，有什么可以帮你的吗？</p>
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        :class="['message', msg.role]"
      >
        <div class="message-avatar">
          {{ msg.role === 'user' ? '👤' : '🤖' }}
        </div>
        <div class="message-content">
          <div class="message-text">
            {{ msg.content }}
            <!-- 如果是最后一条 AI 消息且正在加载，显示光标 -->
            <span
              v-if="msg.role === 'assistant' && isLoading && msg.id === messages[messages.length - 1]?.id"
              class="typing-cursor"
            >▋</span>
          </div>
          <div class="message-time">
            {{ msg.timestamp.toLocaleTimeString() }}
          </div>
        </div>
      </div>

      <div v-if="isLoading" class="message assistant">
        <div class="message-avatar">🤖</div>
        <div class="message-content">
          <div class="message-text loading">正在思考...</div>
        </div>
      </div>
    </div>

    <div class="chat-input">
      <div v-if="error" class="error-message">{{ error }}</div>
      <div class="input-wrapper">
        <textarea
          v-model="inputMessage"
          @keydown="handleKeydown"
          placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
          :disabled="isLoading"
          rows="1"
        />
        <button
          @click="sendMessage"
          :disabled="!inputMessage.trim() || isLoading"
          class="send-button"
        >
          {{ isLoading ? '发送中...' : '发送' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 800px;
  margin: 0 auto;
  background: #f5f5f5;
}

.chat-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px;
  text-align: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.chat-header h1 {
  margin: 0;
  font-size: 24px;
}

.chat-header p {
  margin: 5px 0 0;
  opacity: 0.9;
  font-size: 14px;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.empty-state {
  text-align: center;
  color: #999;
  margin-top: 100px;
  font-size: 18px;
}

.message {
  display: flex;
  gap: 10px;
  animation: fadeIn 0.3s ease;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  font-size: 32px;
  flex-shrink: 0;
}

.message-content {
  max-width: 70%;
}

.message-text {
  background: white;
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  word-wrap: break-word;
}

.message.user .message-text {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.message-text.loading {
  font-style: italic;
  color: #999;
}

.message-time {
  font-size: 12px;
  color: #999;
  margin-top: 5px;
  padding: 0 5px;
}

.chat-input {
  background: white;
  padding: 20px;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
}

.error-message {
  background: #fee;
  color: #c33;
  padding: 10px;
  border-radius: 6px;
  margin-bottom: 10px;
  font-size: 14px;
}

.input-wrapper {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

textarea {
  flex: 1;
  padding: 12px;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  min-height: 50px;
  max-height: 150px;
  transition: border-color 0.3s;
}

textarea:focus {
  outline: none;
  border-color: #667eea;
}

textarea:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.send-button {
  padding: 12px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: transform 0.2s, opacity 0.3s;
  white-space: nowrap;
}

.send-button:hover:not(:disabled) {
  transform: translateY(-2px);
}

.send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 打字光标动画 */
.typing-cursor {
  display: inline-block;
  margin-left: 2px;
  animation: blink 1s infinite;
  color: #667eea;
}

@keyframes blink {
  0%, 49% {
    opacity: 1;
  }
  50%, 100% {
    opacity: 0;
  }
}
</style>
