# 快速开始指南

## Day 1：最简单的 AI 对话

今天我们做了一个最基础的 AI 聊天界面，目标是理解：
- ✅ 怎么调用 OpenAI API
- ✅ 前后端怎么交互
- ✅ Vue 3 基础用法

---

## 第一步：配置 OpenAI API Key

1. 打开 `backend/.env` 文件
2. 把 `your_openai_api_key_here` 替换成你的真实 API Key

```
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 第二步：启动后端

打开终端，运行：

```bash
cd backend
npm run dev
```

你应该看到：
```
🚀 Server is running on http://localhost:3000
📝 API: http://localhost:3000/api/chat
```

---

## 第三步：启动前端

**打开新的终端窗口**，运行：

```bash
cd frontend
npm run dev
```

你应该看到类似：
```
  VITE v8.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

## 第四步：打开浏览器测试

1. 打开浏览器访问：http://localhost:5173/
2. 你会看到一个聊天界面
3. 输入任何问题，比如："你好"
4. 等待几秒，AI 会回复你

---

## 项目结构

```
ai-customer-service/
├── backend/
│   ├── server.js          # 后端 API 服务器（50 行）
│   ├── .env               # 环境变量（API Key）
│   └── package.json
├── frontend/
│   ├── src/
│   │   └── App.vue        # 聊天界面（约 300 行）
│   └── package.json
└── README.md
```

---

## 代码讲解

### 后端 API（server.js）

```javascript
// 核心逻辑：接收用户消息，调用 OpenAI，返回回复
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  
  // 调用 OpenAI API
  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: '你是一个友好的AI助手' },
      { role: 'user', content: message }
    ]
  });
  
  res.json({ reply: completion.choices[0].message.content });
});
```

**学到什么**：
- ✅ Express 创建 API 接口
- ✅ OpenAI API 调用方法
- ✅ 错误处理

---

### 前端界面（App.vue）

```typescript
// 发送消息的核心逻辑
const sendMessage = async () => {
  // 1. 添加用户消息到界面
  messages.value.push({
    role: 'user',
    content: userMessage
  });
  
  // 2. 调用后端 API
  const response = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message: userMessage })
  });
  
  // 3. 显示 AI 回复
  const data = await response.json();
  messages.value.push({
    role: 'assistant',
    content: data.reply
  });
};
```

**学到什么**：
- ✅ Vue 3 Composition API
- ✅ TypeScript 类型定义
- ✅ Fetch API 调用后端
- ✅ 响应式数据（ref）

---

## 常见问题

### Q1: 后端启动报错 "OPENAI_API_KEY is not defined"
**A**: 检查 `backend/.env` 文件，确保填入了正确的 API Key

### Q2: 前端发送消息后报错 "Network error"
**A**: 检查后端是否正常运行（http://localhost:3000/health 应该返回 OK）

### Q3: AI 回复很慢或超时
**A**: OpenAI API 有时会慢，这是正常的。明天我们会加入流式输出来解决这个问题。

---

## 今天的成果

✅ **前端**：一个简洁的聊天界面（消息列表 + 输入框）
✅ **后端**：一个简单的 API（接收消息 → 调用 OpenAI → 返回回复）
✅ **交互**：前后端能正常通信
✅ **理解**：知道了 AI 应用的基本工作流程

---

## 明天的任务（Day 2-3）

我们会加入**流式输出**（Streaming），让 AI 的回答像打字机一样一个字一个字蹦出来。

这是 AI 应用的核心特性，也是面试的重点！

---

## 需要帮助？

如果遇到任何问题：
1. 先看控制台报错信息
2. 检查后端日志（运行 backend 的终端窗口）
3. 确认 API Key 是否正确
4. 确认网络连接是否正常

加油！🚀
