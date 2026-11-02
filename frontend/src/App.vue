<script setup lang="ts">
import { ref, nextTick } from 'vue'

// 消息类型
interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

// 文档类型
interface Document {
  id: string
  name: string
  uploadedAt: string
  chunkCount: number
}

// 状态管理
const messages = ref<Message[]>([])
const inputMessage = ref('')
const isLoading = ref(false)
const error = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

// 标签页状态
const activeTab = ref<'chat' | 'documents'>('chat')

// 文档上传状态
const documents = ref<Document[]>([])
const uploading = ref(false)
const uploadError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

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

// ========== 文档管理功能 ==========

// 加载文档列表
const loadDocuments = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/documents')
    const data = await response.json()
    documents.value = data.documents || []
  } catch (err) {
    console.error('加载文档失败:', err)
  }
}

// 上传文档
const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  if (file.type !== 'application/pdf') {
    uploadError.value = '只支持 PDF 文件'
    return
  }

  uploading.value = true
  uploadError.value = ''

  try {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('http://localhost:3000/api/documents/upload', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error('上传失败')
    }

    const result = await response.json()
    console.log('上传成功:', result)

    // 重新加载文档列表
    await loadDocuments()

    // 清空文件输入
    if (fileInput.value) {
      fileInput.value.value = ''
    }

    alert(`文档上传成功！\n\n文件名: ${result.docName}\n文本长度: ${result.textLength} 字符\n切片数量: ${result.chunkCount} 块`)
  } catch (err) {
    uploadError.value = '上传失败，请重试'
    console.error('上传错误:', err)
  } finally {
    uploading.value = false
  }
}

// 查看文档详情
const viewDocumentChunks = async (docId: string) => {
  try {
    const response = await fetch(`http://localhost:3000/api/documents/${docId}/chunks`)
    const data = await response.json()

    console.log('文档切片详情:', data)
    alert(`文档: ${data.docName}\n\n切片数量: ${data.chunks.length}\n\n前 3 块预览:\n${data.chunks.slice(0, 3).map((c: any) => `块 ${c.index}: ${c.text} (${c.length} 字符)`).join('\n\n')}`)
  } catch (err) {
    console.error('查看详情失败:', err)
    alert('查看详情失败')
  }
}

// 切换标签页时加载文档
const switchTab = (tab: 'chat' | 'documents') => {
  activeTab.value = tab
  if (tab === 'documents') {
    loadDocuments()
  }
}

</script>

<template>
  <div class="chat-container">
    <div class="chat-header">
      <h1>🤖 AI 客服助手</h1>
      <p>Week 2: RAG - 文档处理</p>

      <!-- 标签页切换 -->
      <div class="tabs">
        <button
          :class="['tab', { active: activeTab === 'chat' }]"
          @click="switchTab('chat')"
        >
          💬 聊天
        </button>
        <button
          :class="['tab', { active: activeTab === 'documents' }]"
          @click="switchTab('documents')"
        >
          📄 文档管理
        </button>
      </div>
    </div>

    <!-- 聊天界面 -->
    <div v-show="activeTab === 'chat'" class="chat-messages" ref="messagesContainer">
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

    <!-- 文档管理界面 -->
    <div v-show="activeTab === 'documents'" class="documents-view">
      <div class="upload-section">
        <h2>📤 上传文档</h2>
        <p class="hint">支持 PDF 格式，最大 10MB</p>

        <div class="upload-box">
          <input
            type="file"
            ref="fileInput"
            accept=".pdf"
            @change="handleFileUpload"
            :disabled="uploading"
          />
          <p v-if="uploading" class="uploading">上传中...</p>
          <p v-if="uploadError" class="error">{{ uploadError }}</p>
        </div>
      </div>

      <div class="documents-section">
        <h2>📚 已上传文档 ({{ documents.length }})</h2>

        <div v-if="documents.length === 0" class="empty-docs">
          <p>还没有上传任何文档</p>
        </div>

        <div v-else class="documents-list">
          <div
            v-for="doc in documents"
            :key="doc.id"
            class="document-card"
          >
            <div class="doc-icon">📄</div>
            <div class="doc-info">
              <h3>{{ doc.name }}</h3>
              <p class="doc-meta">
                切片数: {{ doc.chunkCount }} |
                上传时间: {{ new Date(doc.uploadedAt).toLocaleString() }}
              </p>
            </div>
            <button
              class="view-button"
              @click="viewDocumentChunks(doc.id)"
            >
              查看详情
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-show="activeTab === 'chat'" class="chat-input">
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

/* ========== 标签页样式 ========== */
.tabs {
  display: flex;
  gap: 10px;
  margin-top: 15px;
  justify-content: center;
}

.tab {
  padding: 8px 20px;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
}

.tab:hover {
  background: rgba(255, 255, 255, 0.3);
}

.tab.active {
  background: white;
  color: #667eea;
  border-color: white;
  font-weight: bold;
}

/* ========== 文档管理样式 ========== */
.documents-view {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.upload-section {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
}

.upload-section h2 {
  margin: 0 0 5px;
  color: #333;
}

.hint {
  color: #999;
  font-size: 14px;
  margin: 0 0 15px;
}

.upload-box {
  border: 2px dashed #ddd;
  border-radius: 8px;
  padding: 30px;
  text-align: center;
  transition: border-color 0.3s;
}

.upload-box:hover {
  border-color: #667eea;
}

.upload-box input[type="file"] {
  font-size: 14px;
}

.uploading {
  color: #667eea;
  font-weight: bold;
  margin-top: 10px;
}

.upload-box .error {
  color: #c33;
  margin-top: 10px;
}

.documents-section {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.documents-section h2 {
  margin: 0 0 15px;
  color: #333;
}

.empty-docs {
  text-align: center;
  color: #999;
  padding: 40px;
  font-size: 16px;
}

.documents-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.document-card {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  border: 2px solid #eee;
  border-radius: 8px;
  transition: all 0.3s;
}

.document-card:hover {
  border-color: #667eea;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
}

.doc-icon {
  font-size: 40px;
  flex-shrink: 0;
}

.doc-info {
  flex: 1;
}

.doc-info h3 {
  margin: 0 0 5px;
  color: #333;
  font-size: 16px;
}

.doc-meta {
  margin: 0;
  color: #999;
  font-size: 13px;
}

.view-button {
  padding: 8px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: transform 0.2s;
  white-space: nowrap;
}

.view-button:hover {
  transform: translateY(-2px);
}
</style>
