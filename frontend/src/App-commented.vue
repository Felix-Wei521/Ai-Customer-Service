/**
 * ========================================
 * AI 客服系统 - 前端页面（带详细注释）
 * ========================================
 *
 * 功能：
 * 1. 聊天界面
 * 2. 流式接收 AI 回复（SSE）
 * 3. 打字机效果 + 光标闪烁
 * 4. 自动滚动到最新消息
 *
 * 技术栈：
 * - Vue 3 Composition API
 * - TypeScript
 * - Fetch API + ReadableStream
 */

<script setup lang="ts">
import { ref, nextTick } from 'vue'

// ========================================
// 类型定义
// ========================================

/**
 * 消息类型
 *
 * id：唯一标识符（用于 v-for 的 key）
 * role：消息角色
 *   - 'user'：用户消息
 *   - 'assistant'：AI 助手消息
 * content：消息内容
 * timestamp：消息发送时间
 */
interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

// ========================================
// 响应式状态管理
// ========================================

/**
 * messages：消息列表
 *
 * ref()：创建响应式引用
 * 为什么用 ref？
 * - Vue 3 的响应式系统基础
 * - 当 messages.value 改变时，界面自动更新
 *
 * 数组结构：
 * [
 *   { id: 1, role: 'user', content: '你好', timestamp: ... },
 *   { id: 2, role: 'assistant', content: '你好！', timestamp: ... }
 * ]
 */
const messages = ref<Message[]>([])

/**
 * inputMessage：输入框内容
 *
 * v-model 绑定
 * 用户输入时，这个值会自动更新
 */
const inputMessage = ref('')

/**
 * isLoading：加载状态
 *
 * true：AI 正在回复
 * false：可以发送新消息
 *
 * 用途：
 * - 显示加载动画
 * - 禁用发送按钮（防止重复发送）
 */
const isLoading = ref(false)

/**
 * error：错误信息
 *
 * 空字符串：无错误
 * 非空：显示错误提示
 */
const error = ref('')

/**
 * messagesContainer：消息列表容器的 DOM 引用
 *
 * 用途：
 * - 控制滚动位置
 * - 自动滚动到底部
 *
 * ref<HTMLElement | null>：
 * - HTMLElement：DOM 元素类型
 * - null：初始值（还没挂载到 DOM）
 */
const messagesContainer = ref<HTMLElement | null>(null)

// ========================================
// 工具函数
// ========================================

/**
 * 滚动到底部
 *
 * nextTick()：等待 DOM 更新完成
 * 为什么需要 nextTick？
 * - Vue 更新 DOM 是异步的
 * - 如果立刻滚动，新消息还没渲染出来
 * - nextTick 确保在 DOM 更新后再滚动
 *
 * scrollTop = scrollHeight：
 * - scrollTop：当前滚动位置
 * - scrollHeight：内容总高度
 * - 设置为总高度 = 滚动到底部
 */
const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// ========================================
// 核心功能：发送消息（流式版本）
// ========================================

/**
 * sendMessage：发送消息并接收流式回复
 *
 * async：异步函数
 * 为什么要异步？
 * - 网络请求需要时间
 * - 不能阻塞界面（否则界面会卡住）
 *
 * 流程：
 * 1. 验证输入
 * 2. 添加用户消息到列表
 * 3. 创建空的 AI 消息
 * 4. 发送请求，逐块接收数据
 * 5. 实时更新 AI 消息内容
 */
const sendMessage = async () => {
  // ========================================
  // 步骤 1：输入验证
  // ========================================

  /**
   * 阻止发送的条件：
   * 1. inputMessage.value.trim()：去除首尾空格后为空
   * 2. isLoading.value：正在加载（防止重复发送）
   *
   * 为什么要 trim()？
   * - 用户可能输入纯空格
   * - 纯空格不应该发送给 AI
   */
  if (!inputMessage.value.trim() || isLoading.value) {
    return
  }

  // 保存用户消息到临时变量
  const userMessage = inputMessage.value.trim()

  // 清空输入框（立刻清空，用户体验更好）
  inputMessage.value = ''

  // 清空错误提示
  error.value = ''

  // ========================================
  // 步骤 2：添加用户消息到列表
  // ========================================

  /**
   * Date.now()：当前时间戳（毫秒）
   * 为什么用时间戳作为 id？
   * - 简单、唯一
   * - 每毫秒最多一条消息，足够用
   *
   * 生产环境应该用：
   * - UUID（更安全）
   * - 数据库自增 ID
   */
  messages.value.push({
    id: Date.now(),
    role: 'user',
    content: userMessage,
    timestamp: new Date()
  })

  // 设置加载状态
  isLoading.value = true

  // ========================================
  // 步骤 3：创建空的 AI 消息（用于流式填充）
  // ========================================

  /**
   * 为什么先创建空消息？
   * - 流式输出需要逐渐填充内容
   * - 如果每次都 push 新消息，会有很多重复的消息框
   * - 先创建一个空的，然后不断更新它的 content
   *
   * Date.now() + 1：
   * - 保证 AI 消息的 id 和用户消息不同
   * - +1 是为了避免同一毫秒内创建两条消息
   */
  const aiMessageId = Date.now() + 1
  messages.value.push({
    id: aiMessageId,
    role: 'assistant',
    content: '', // 初始为空，等待流式填充
    timestamp: new Date()
  })

  try {
    // ========================================
    // 步骤 4：发送 HTTP 请求
    // ========================================

    /**
     * fetch()：浏览器原生 HTTP 请求 API
     *
     * 替代方案：
     * - axios（更强大，但需要额外安装）
     * - XMLHttpRequest（老式 API，不推荐）
     *
     * 为什么用 fetch？
     * - 原生支持，无需安装
     * - 支持 Promise（async/await）
     * - 支持 ReadableStream（流式读取）
     */
    const response = await fetch('http://localhost:3000/api/chat/stream', {
      method: 'POST', // HTTP 方法
      headers: {
        'Content-Type': 'application/json' // 告诉服务器：我发送的是 JSON 数据
      },
      body: JSON.stringify({
        message: userMessage // 将对象转换为 JSON 字符串
      })
    })

    /**
     * 检查响应状态
     *
     * response.ok：
     * - true：状态码 200-299（成功）
     * - false：状态码 400-599（错误）
     *
     * 为什么要检查？
     * - fetch 不会自动抛出错误（即使 404、500）
     * - 需要手动检查并抛出错误
     */
    if (!response.ok) {
      throw new Error('Network response was not ok')
    }

    // ========================================
    // 步骤 5：获取流式读取器
    // ========================================

    /**
     * response.body：响应体（ReadableStream）
     * getReader()：获取流式读取器
     *
     * 什么是 ReadableStream？
     * - 浏览器提供的流式数据 API
     * - 数据像水流一样，一点点到达
     * - 不需要等全部到达，可以边到边处理
     *
     * reader：
     * - read()：读取下一块数据
     * - 返回 { done, value }
     *   - done：是否读取完毕
     *   - value：当前数据块（Uint8Array 字节数组）
     */
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Failed to get response reader')
    }

    /**
     * TextDecoder：将字节数组解码为字符串
     *
     * 为什么需要？
     * - 网络传输的是字节（0-255）
     * - 需要转换为字符串才能显示
     *
     * 支持的编码：
     * - utf-8（默认，支持中文）
     * - gbk、big5 等
     */
    const decoder = new TextDecoder()

    /**
     * buffer：缓冲区
     *
     * 为什么需要缓冲区？
     * - 数据可能在行中间断开
     * - 例如：第一块 "data: {\"te"，第二块 "xt\":\"你好\"}\n\n"
     * - 需要缓存不完整的行，等下一块到了再拼接
     */
    let buffer = ''

    // ========================================
    // 步骤 6：逐块读取数据
    // ========================================

    /**
     * while (true) 无限循环
     *
     * 为什么无限循环？
     * - 不知道有多少数据块
     * - 需要一直读取，直到 done === true
     *
     * 退出条件：
     * - done === true（数据读取完毕）
     * - 遇到 [DONE] 标记
     */
    while (true) {
      /**
       * await reader.read()：读取下一块数据
       *
       * 返回值：
       * {
       *   done: false,              // 是否读取完毕
       *   value: Uint8Array [100]   // 字节数组
       * }
       *
       * 解构赋值：
       * const { done, value } = ...
       * 等同于：
       * const result = await reader.read()
       * const done = result.done
       * const value = result.value
       */
      const { done, value } = await reader.read()

      /**
       * 如果读取完毕，退出循环
       *
       * break：跳出 while 循环
       */
      if (done) break

      /**
       * 解码字节数组为字符串
       *
       * { stream: true }：重要！处理 UTF-8 字符边界
       *
       * 为什么需要 stream: true？
       * - 汉字"你"的 UTF-8 编码：E4 BD A0（3 个字节）
       * - 数据块可能在字节中间断开：
       *   - 第一块：E4 BD
       *   - 第二块：A0
       * - 如果直接解码，会乱码
       * - stream: true 让 TextDecoder 缓存不完整的字节
       * - 等下一块到了，拼接后再解码
       *
       * 示例：
       * 第一块：decoder.decode([E4, BD], { stream: true })
       *   → 返回 ""（缓存 E4 BD）
       * 第二块：decoder.decode([A0], { stream: true })
       *   → 返回 "你"（拼接 E4 BD A0，解码成功）
       */
      buffer += decoder.decode(value, { stream: true })

      /**
       * 按行分割
       *
       * SSE 格式：
       * data: {"text":"你"}\n\n
       * data: {"text":"好"}\n\n
       *
       * split('\n')：按换行符分割
       * 结果：['data: {"text":"你"}', '', 'data: {"text":"好"}', '', ...]
       *
       * 为什么有空字符串？
       * - \n\n 分割后，中间有个空行
       */
      const lines = buffer.split('\n')

      /**
       * 保留最后一行（可能不完整）
       *
       * pop()：删除并返回数组最后一个元素
       *
       * 为什么要保留？
       * - 数据可能在行中间断开
       * - 例如：buffer = "data: {\"text\":\"你"（不完整）
       * - 需要等下一块数据到了，拼接后再处理
       *
       * 示例：
       * lines = ['data: {"text":"你好"}', '', 'data: {']
       * buffer = lines.pop()  → buffer = 'data: {'
       * lines = ['data: {"text":"你好"}', '']
       *
       * 下次循环：
       * buffer = 'data: {' + '"text":"我"}\n\n'
       *        = 'data: {"text":"我"}\n\n'
       * 现在是完整的一行了！
       */
      buffer = lines.pop() || ''

      // ========================================
      // 步骤 7：处理每一行
      // ========================================

      /**
       * for...of：遍历数组
       *
       * 等价于：
       * for (let i = 0; i < lines.length; i++) {
       *   const line = lines[i]
       *   ...
       * }
       *
       * for...of 更简洁、可读性更好
       */
      for (const line of lines) {
        /**
         * 跳过空行或不符合格式的行
         *
         * !line.trim()：去除空格后为空
         * !line.startsWith('data: ')：不以 "data: " 开头
         *
         * continue：跳过当前循环，进入下一次
         */
        if (!line.trim() || !line.startsWith('data: ')) continue

        /**
         * 提取 JSON 数据
         *
         * 原始行："data: {\"text\":\"你好\"}"
         *
         * replace(/^data: /, '')：
         * - 正则表达式：/^data: /
         *   - ^：匹配开头
         *   - data: ：字面量
         * - 替换为空字符串
         *
         * 结果："{"text":"你好"}"
         *
         * trim()：去除首尾空格
         */
        const data = line.replace(/^data: /, '').trim()

        /**
         * 检测结束标记
         *
         * [DONE]：服务器发送的结束信号
         * 检测到后，停止读取
         */
        if (data === '[DONE]') {
          break
        }

        /**
         * 解析 JSON
         *
         * try...catch：捕获解析错误
         * 为什么需要？
         * - JSON.parse() 可能抛出错误（格式不正确）
         * - 需要捕获错误，避免程序崩溃
         */
        try {
          const parsed = JSON.parse(data)

          /**
           * 如果是错误消息
           *
           * parsed = { error: "Something went wrong" }
           */
          if (parsed.error) {
            error.value = parsed.error
            break
          }

          /**
           * 如果是文本消息
           *
           * parsed = { text: "你好" }
           */
          if (parsed.text) {
            /**
             * 找到最后一条 AI 消息
             *
             * find()：查找符合条件的第一个元素
             *
             * 为什么不用 messages.value[messages.value.length - 1]？
             * - 更安全（即使消息列表为空也不会报错）
             * - 更明确（根据 id 查找，而不是索引）
             */
            const lastMessage = messages.value.find(m => m.id === aiMessageId)

            if (lastMessage) {
              /**
               * 累加内容（重要！）
               *
               * 不是 =，而是 +=
               * 为什么？
               * - 流式输出是逐块累加的
               * - 第 1 块："你"
               * - 第 2 块："好"
               * - 结果："你好"
               *
               * 如果用 =，每次都会覆盖：
               * - 第 1 块：content = "你"
               * - 第 2 块：content = "好"（覆盖了）
               * - 结果："好"（错误！）
               */
              lastMessage.content += parsed.text

              /**
               * 每次更新后，滚动到底部
               *
               * 为什么每次都滚动？
               * - 新内容可能超出屏幕
               * - 自动滚动，用户始终能看到最新内容
               */
              scrollToBottom()
            }
          }
        } catch (e) {
          // 解析失败，打印错误日志
          console.error('Failed to parse SSE data:', data, e)
        }
      }
    }

  } catch (err) {
    // ========================================
    // 步骤 8：错误处理
    // ========================================

    /**
     * 显示错误信息
     */
    error.value = '发送失败，请检查网络连接'
    console.error('Error:', err)

    /**
     * 如果失败，删除空的 AI 消息
     *
     * 为什么要删除？
     * - 我们在发送前创建了空的 AI 消息
     * - 如果请求失败，这条空消息没有意义
     * - 删除它，避免界面上出现空白消息框
     *
     * findIndex()：查找符合条件的元素索引
     * splice(index, 1)：删除指定索引的元素
     */
    const index = messages.value.findIndex(m => m.id === aiMessageId)
    if (index !== -1 && !messages.value[index].content) {
      messages.value.splice(index, 1)
    }
  } finally {
    // ========================================
    // 步骤 9：清理工作
    // ========================================

    /**
     * finally：无论成功还是失败，都会执行
     *
     * 用途：
     * - 清理资源
     * - 重置状态
     *
     * 这里：重置加载状态
     * - 成功：AI 回复完成，可以发送新消息了
     * - 失败：请求结束，也可以重新尝试了
     */
    isLoading.value = false
  }
}

// ========================================
// 快捷键处理
// ========================================

/**
 * 回车发送消息
 *
 * @keydown：键盘按下事件
 *
 * e.key === 'Enter'：按下回车键
 * !e.shiftKey：没有同时按住 Shift
 *
 * 为什么要检查 Shift？
 * - Enter：发送消息
 * - Shift + Enter：换行（多行输入）
 *
 * e.preventDefault()：阻止默认行为
 * 为什么需要？
 * - textarea 按回车默认会换行
 * - 我们要发送消息，不要换行
 * - 所以阻止默认换行行为
 */
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}
</script>

<!-- 模板部分省略，与原文件相同 -->
