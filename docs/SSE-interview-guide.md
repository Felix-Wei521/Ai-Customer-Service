# SSE（Server-Sent Events）面试题库

> 这些是 AI 应用工程师面试中关于流式输出的常见问题。
> 建议花 1-2 小时熟悉这些答案，理解原理。

---

## 🎯 基础概念题

### Q1: 什么是 SSE？它和普通 HTTP 请求有什么区别？

**标准答案**：

SSE（Server-Sent Events）是一种服务器向客户端推送数据的技术。

**区别**：

| 项目 | 普通 HTTP | SSE |
|------|----------|-----|
| **连接** | 请求-响应后关闭 | 保持连接打开 |
| **方向** | 双向（一次性） | 单向（服务器→客户端） |
| **数据推送** | 客户端主动请求 | 服务器主动推送 |
| **应用场景** | 查询数据 | 实时推送（AI 回复、股票行情） |

**代码示例**：
```javascript
// 普通 HTTP
const response = await fetch('/api/chat');
const data = await response.json(); // 一次性获取

// SSE
const response = await fetch('/api/chat/stream');
const reader = response.body.getReader();
// 持续读取数据块
```

---

### Q2: SSE vs WebSocket，有什么区别？如何选择？

**标准答案**：

| 特性 | SSE | WebSocket |
|------|-----|-----------|
| **协议** | HTTP | WebSocket 协议 |
| **通信方向** | 单向（服务器→客户端） | 双向 |
| **复杂度** | 简单 | 复杂（需要握手） |
| **断线重连** | 浏览器自动重连 | 需要手动实现 |
| **浏览器支持** | 原生支持 | 原生支持 |
| **应用场景** | 服务器推送（AI 回复、通知） | 双向实时通信（聊天室、游戏） |

**我的项目为什么选 SSE？**

1. ✅ **需求匹配**：AI 回复是单向推送（服务器→客户端）
2. ✅ **实现简单**：基于 HTTP，不需要额外的握手协议
3. ✅ **浏览器原生支持**：不需要额外的库
4. ✅ **自动重连**：网络断开后浏览器会自动重连

**什么时候用 WebSocket？**
- 双向实时通信（聊天室、协同编辑）
- 需要客户端主动推送数据
- 需要更低的延迟

---

### Q3: SSE 的数据格式是什么？为什么要这样设计？

**标准答案**：

**格式**：
```
data: <内容>\n\n
```

**示例**：
```
data: {"text":"你好"}\n\n
data: {"text":"世界"}\n\n
data: [DONE]\n\n
```

**规则**：
1. 必须以 `data: ` 开头
2. 后面跟数据（JSON 或纯文本）
3. 必须以 `\n\n`（两个换行符）结尾

**为什么两个换行符？**
- 第一个 `\n`：结束当前行
- 第二个 `\n`：结束当前消息
- 浏览器识别 `\n\n` 为一条完整消息

**其他字段**：
```
event: message\n
data: {"text":"你好"}\n
id: 123\n
retry: 10000\n
\n
```

- `event`：事件类型（可选）
- `id`：消息 ID（可选，用于断线重连）
- `retry`：重连延迟（毫秒，可选）

---

## 🔧 实现细节题

### Q4: 你是如何实现流式输出的？

**标准答案**：

**后端（Node.js + Express）**：

1. **设置 SSE 响应头**：
```javascript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
```

2. **逐块发送数据**：
```javascript
for (let i = 0; i < fullText.length; i += chunkSize) {
  const chunk = fullText.slice(i, i + chunkSize);
  res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
  await new Promise(resolve => setTimeout(resolve, delay));
}
```

3. **发送结束标记**：
```javascript
res.write('data: [DONE]\n\n');
res.end();
```

**前端（Vue 3 + TypeScript）**：

1. **发送请求**：
```javascript
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: userMessage })
});
```

2. **逐块读取数据**：
```javascript
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = decoder.decode(value, { stream: true });
  // 处理数据...
}
```

3. **实时更新界面**：
```javascript
lastMessage.content += parsed.text; // 累加内容
scrollToBottom(); // 自动滚动
```

---

### Q5: 为什么要用 `{ stream: true }`？UTF-8 字符边界问题是什么？

**标准答案**：

**问题场景**：

中文字符在 UTF-8 编码中占 3 个字节。例如"你"：
```
E4 BD A0 (16进制)
```

**问题**：
流式传输可能在字节中间断开：
```
数据块 1：E4 BD
数据块 2：A0
```

**如果直接解码**：
```javascript
// ❌ 错误做法
const text1 = decoder.decode(Uint8Array[0xE4, 0xBD]); // 乱码！
const text2 = decoder.decode(Uint8Array[0xA0]); // 乱码！
```

**正确做法**：
```javascript
// ✅ 正确做法：使用 stream: true
const decoder = new TextDecoder();

// 第一块：缓存不完整的字节
const text1 = decoder.decode(Uint8Array[0xE4, 0xBD], { stream: true });
// 返回 ""，缓存 E4 BD

// 第二块：拼接后解码
const text2 = decoder.decode(Uint8Array[0xA0], { stream: true });
// 拼接 E4 BD A0，返回 "你"
```

**原理**：
- `stream: true` 告诉 TextDecoder：这是流式数据
- TextDecoder 会缓存不完整的字节
- 等下一块数据到达时，拼接后再解码

**面试加分点**：
> "我在实现流式输出时，遇到了 UTF-8 字符边界问题。因为中文字符占 3 个字节，流式传输可能在字节中间断开，导致乱码。我使用了 `TextDecoder` 的 `{ stream: true }` 选项，它会自动缓存不完整的字节，等下一块数据到达时拼接后再解码，完美解决了这个问题。"

---

### Q6: 为什么要有 buffer 缓冲区？

**标准答案**：

**问题场景**：

SSE 数据可能在行中间断开：

```
数据块 1："data: {\"te"
数据块 2："xt\":\"你好\"}\n\n"
```

**如果直接处理**：
```javascript
// ❌ 错误做法
const lines1 = "data: {\"te".split('\n'); // ["data: {\"te"]
JSON.parse("data: {\"te"); // 报错！不完整的 JSON
```

**正确做法：使用 buffer**：
```javascript
let buffer = '';

// 第一块
buffer += "data: {\"te";
const lines = buffer.split('\n');
buffer = lines.pop(); // 保留 "data: {\"te"

// 第二块
buffer += "xt\":\"你好\"}\n\n";
const lines = buffer.split('\n'); 
// ["data: {\"text\":\"你好\"}", "", ""]
buffer = lines.pop(); // 保留 ""（空）

// 现在第一行是完整的 JSON，可以解析了
```

**原理**：
1. 数据到达时，先累加到 buffer
2. 按换行符分割
3. 保留最后一行（可能不完整）
4. 处理完整的行
5. 下次数据到达时，拼接上之前保留的行

---

### Q7: 如果第三方 API 不支持流式，你怎么办？

**标准答案**：

**我的解决方案：后端模拟流式输出**

**流程**：
1. 后端调用普通 API，获取完整回复
2. 在后端按字符分块
3. 通过 SSE 协议逐块推送给前端
4. 前端收到流式数据，逐字显示

**代码示例**：
```javascript
// 1. 调用普通 API
const completion = await anthropic.messages.create({...});
const fullText = completion.content[0].text;

// 2. 分块发送
const chunkSize = 2; // 每次 2 个字符
const delay = 30; // 延迟 30ms

for (let i = 0; i < fullText.length; i += chunkSize) {
  const chunk = fullText.slice(i, i + chunkSize);
  res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
  await new Promise(resolve => setTimeout(resolve, delay));
}
```

**优点**：
- ✅ 兼容不支持流式的 API
- ✅ 前端依然有流式体验
- ✅ 实现简单

**缺点**：
- ⚠️ 需要等待 AI 生成全部内容（5-10 秒）
- ⚠️ 然后才开始逐字显示

**对比真正的流式**：
- **真正流式**：AI 生成第一个字时就能看到（< 1 秒）
- **模拟流式**：等 AI 生成完全部（10 秒）+ 逐字显示（5 秒）

**面试话术**：
> "我使用的第三方 API 服务不支持真正的流式输出，所以我在后端做了优化：先获取完整回复，然后在服务器端按字符分块，通过 SSE 逐块推送给前端，模拟了打字机效果。这样既保证了良好的用户体验，又兼容了第三方服务的限制。"

---

## 🚀 优化和扩展题

### Q8: 如果网络连接中断怎么办？如何实现错误重试？

**标准答案**：

**方案 1：前端重试机制**

```javascript
const MAX_RETRIES = 3;
let retryCount = 0;

const sendMessageWithRetry = async () => {
  try {
    await sendMessage();
    retryCount = 0; // 成功后重置
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(`重试第 ${retryCount} 次...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // 延迟 1 秒
      return sendMessageWithRetry(); // 递归重试
    } else {
      error.value = '发送失败，请检查网络';
    }
  }
};
```

**方案 2：指数退避重试**

```javascript
const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
// 第 1 次：1 秒
// 第 2 次：2 秒
// 第 3 次：4 秒
// 第 4 次：8 秒
// 最多：10 秒
```

**方案 3：显示重试按钮**

```javascript
if (error) {
  error.value = '发送失败，点击重试';
  showRetryButton.value = true;
}
```

---

### Q9: 如何取消一个正在进行的请求？

**标准答案**：

**使用 AbortController**：

```javascript
let currentController: AbortController | null = null;

const sendMessage = async () => {
  // 取消上一个请求
  if (currentController) {
    currentController.abort();
  }
  
  // 创建新的控制器
  currentController = new AbortController();
  
  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      signal: currentController.signal, // 传入取消信号
      // ...
    });
    
    // 处理响应...
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('请求已取消');
    } else {
      throw error;
    }
  }
};
```

**应用场景**：
- 用户快速连续点击发送按钮
- 用户想中止当前回复，发送新问题
- 页面切换时清理资源

---

### Q10: 如何优化用户体验？

**标准答案**：

**1. 打字光标**：
```html
<span v-if="isLoading" class="typing-cursor">▋</span>
```

```css
.typing-cursor {
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
```

**2. 自动滚动**：
```javascript
const scrollToBottom = () => {
  nextTick(() => {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  });
};
```

**3. 状态提示**：
```javascript
const status = ref(''); // '思考中' | '回复中' | ''

// AI 生成时
status.value = '思考中...';

// 收到第一个字符时
status.value = '回复中...';

// 完成时
status.value = '';
```

**4. 性能监控**：
```javascript
const startTime = Date.now();
let firstChunkTime = 0;

// 收到第一个数据块
if (!firstChunkTime) {
  firstChunkTime = Date.now();
  console.log(`首字延迟: ${firstChunkTime - startTime}ms`);
}

// 完成时
console.log(`总耗时: ${Date.now() - startTime}ms`);
```

---

## 🎯 总结

这些面试题涵盖了：
- ✅ 基础概念（SSE、WebSocket）
- ✅ 实现细节（数据格式、字符边界、缓冲区）
- ✅ 问题解决（不支持流式、网络中断）
- ✅ 用户体验（光标、滚动、重试）

**建议**：
1. 花 1-2 小时熟悉这些答案
2. 理解原理，不要死记硬背
3. 结合自己的项目代码，能讲出实现细节
4. 面试时举例说明，展示实际解决问题的能力

---

**记住**：面试官更看重你的**理解深度**和**解决问题的思路**，而不是完美的代码！
