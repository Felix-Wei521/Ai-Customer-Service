/**
 * ========================================
 * AI 客服系统 - 后端服务器（带详细注释）
 * ========================================
 *
 * 功能：
 * 1. 普通对话接口（/api/chat）
 * 2. 流式对话接口（/api/chat/stream）
 *
 * 技术栈：
 * - Express：Web 框架
 * - Anthropic SDK：调用 Claude AI
 * - SSE：Server-Sent Events 流式输出
 */

const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config(); // 加载 .env 文件中的环境变量

const app = express();
const PORT = 3000;

// ========================================
// 中间件配置
// ========================================

/**
 * CORS（跨域资源共享）中间件
 *
 * 为什么需要？
 * - 前端运行在 http://localhost:5173
 * - 后端运行在 http://localhost:3000
 * - 浏览器默认不允许跨域请求（安全限制）
 * - cors() 允许前端访问后端 API
 */
app.use(cors());

/**
 * JSON 解析中间件
 *
 * 作用：
 * - 解析请求体中的 JSON 数据
 * - 使得 req.body 可以直接访问 JSON 对象
 *
 * 示例：
 * 前端发送：{ "message": "你好" }
 * 后端访问：req.body.message === "你好"
 */
app.use(express.json());

// ========================================
// 初始化 Anthropic 客户端
// ========================================

/**
 * 第一步：构建配置对象
 *
 * apiKey：从环境变量读取（.env 文件）
 * 为什么不直接写在代码里？
 * - 安全：避免 API Key 泄露到 Git
 * - 灵活：不同环境（开发/生产）用不同 Key
 */
const anthropicConfig = {
  apiKey: process.env.OPENAI_API_KEY, // 注意：变量名叫 OPENAI_API_KEY 但存的是 Anthropic Key
};

/**
 * 第二步：配置自定义 API 地址（如果有）
 *
 * 为什么需要？
 * - 官方 Anthropic API：https://api.anthropic.com
 * - 第三方中转服务：https://code1.newcli.com（你的情况）
 *
 * 如果 .env 里配置了 API_BASE_URL，就用它
 * 否则用默认的官方地址
 */
if (process.env.API_BASE_URL) {
  anthropicConfig.baseURL = process.env.API_BASE_URL;
}

/**
 * 第三步：创建 Anthropic 客户端实例
 *
 * 这个 anthropic 对象用于调用 AI API
 * 它会自动处理：
 * - HTTP 请求
 * - 身份验证（API Key）
 * - 错误处理
 * - 数据序列化
 */
const anthropic = new Anthropic(anthropicConfig);

// 打印配置信息（调试用）
console.log('API 配置:', {
  hasApiKey: !!process.env.OPENAI_API_KEY, // !! 转换为布尔值（隐藏真实 Key）
  baseURL: process.env.API_BASE_URL || '默认（https://api.anthropic.com）'
});

// ========================================
// 接口 1：健康检查
// ========================================

/**
 * GET /health
 *
 * 作用：
 * - 检查服务器是否正常运行
 * - 常用于监控系统、负载均衡器
 *
 * 测试方法：
 * 浏览器访问：http://localhost:3000/health
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// ========================================
// 接口 2：普通对话（非流式）
// ========================================

/**
 * POST /api/chat
 *
 * 流程：
 * 1. 接收用户消息
 * 2. 调用 AI API
 * 3. 等待 AI 生成完整回复
 * 4. 一次性返回给前端
 *
 * 缺点：
 * - 用户需要等待 5-10 秒
 * - 看不到进度，体验差
 *
 * 优点：
 * - 实现简单
 * - 兼容所有 API 服务
 */
app.post('/api/chat', async (req, res) => {
  try {
    // 1. 获取用户消息
    const { message } = req.body; // 解构赋值，等同于 req.body.message

    // 2. 参数校验
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('收到用户消息:', message);

    // 3. 调用 AI API
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929', // 模型名称
      max_tokens: 1024, // 最大生成 1024 个 token（约 500-700 字）
      messages: [
        {
          role: 'user', // 角色：user（用户）或 assistant（AI）
          content: message, // 消息内容
        },
      ],
    });

    // 4. 解析 AI 返回的数据

    /**
     * Anthropic API 返回的数据结构：
     * {
     *   content: [
     *     { type: "thinking", text: "..." },  // AI 的思考过程（不显示给用户）
     *     { type: "text", text: "你好！" }    // AI 的实际回复
     *   ]
     * }
     *
     * 我们只需要 type === "text" 的内容
     */
    let reply;
    if (completion.content && Array.isArray(completion.content)) {
      // 查找 type 为 "text" 的内容
      const textContent = completion.content.find(item => item.type === 'text');
      if (textContent && textContent.text) {
        reply = textContent.text;
      } else if (completion.content[0] && completion.content[0].text) {
        // 兜底：如果没有 type 字段，用第一个元素
        reply = completion.content[0].text;
      }
    } else if (completion.choices && completion.choices[0] && completion.choices[0].message) {
      // 兼容 OpenAI 格式（有些第三方服务用这种格式）
      reply = completion.choices[0].message.content;
    } else if (typeof completion === 'string') {
      // 纯文本格式
      reply = completion;
    }

    // 5. 如果解析失败，返回错误提示
    if (!reply) {
      console.error('未知的返回格式:', completion);
      reply = '抱歉，无法解析 AI 回复';
    }

    console.log('AI 回复:', reply);

    // 6. 返回给前端
    res.json({ reply });

  } catch (error) {
    // 错误处理
    console.error('完整错误信息:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({
      error: 'Something went wrong',
      details: error.message
    });
  }
});

// ========================================
// 接口 3：流式对话（SSE）
// ========================================

/**
 * POST /api/chat/stream
 *
 * SSE（Server-Sent Events）流式输出
 *
 * 流程：
 * 1. 接收用户消息
 * 2. 调用 AI API，获取完整回复
 * 3. 将回复按字符分块
 * 4. 通过 SSE 协议逐块推送给前端
 * 5. 前端逐块显示，形成打字机效果
 *
 * 为什么要模拟流式？
 * - 第三方服务不支持真正的流式 API
 * - 我们在后端模拟，前端依然有流式体验
 *
 * 优点：
 * - 用户体验好（逐字显示）
 * - 兼容不支持流式的 API 服务
 *
 * 缺点：
 * - 需要等待 AI 生成完全部内容（5-10 秒）
 * - 然后才开始逐字显示
 */
app.post('/api/chat/stream', async (req, res) => {
  try {
    // 1. 获取用户消息
    const { message } = req.body;

    // 2. 参数校验
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('收到用户消息（流式）:', message);

    // ========================================
    // 3. 设置 SSE 响应头（重要！）
    // ========================================

    /**
     * Content-Type: text/event-stream
     *
     * 作用：告诉浏览器这是一个 SSE 流
     * 浏览器会：
     * - 保持连接打开
     * - 逐块接收数据
     * - 不会等待响应完成才显示
     */
    res.setHeader('Content-Type', 'text/event-stream');

    /**
     * Cache-Control: no-cache
     *
     * 作用：禁止缓存
     * 为什么？
     * - SSE 是实时数据，不应该被缓存
     * - 每次请求都要获取最新数据
     */
    res.setHeader('Cache-Control', 'no-cache');

    /**
     * Connection: keep-alive
     *
     * 作用：保持连接打开
     * 为什么？
     * - SSE 需要持续推送数据
     * - 连接不能在第一次响应后就关闭
     */
    res.setHeader('Connection', 'keep-alive');

    console.log('调用普通 API...');

    // 4. 调用 AI API（同普通接口）
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
    });

    // 5. 解析返回数据，提取文本内容
    let fullText = '';
    if (completion.content && Array.isArray(completion.content)) {
      const textContent = completion.content.find(item => item.type === 'text');
      if (textContent && textContent.text) {
        fullText = textContent.text;
      }
    }

    console.log('AI 回复完成，开始模拟流式输出...');
    console.log('回复长度:', fullText.length, '字符');

    // ========================================
    // 6. 模拟流式输出：按字符分块发送
    // ========================================

    /**
     * chunkSize：每次发送的字符数
     *
     * 值越小：
     * - 打字机效果越明显
     * - 但会增加请求次数
     *
     * 值越大：
     * - 速度越快
     * - 但打字机效果不明显
     *
     * 推荐：2-5 个字符
     */
    const chunkSize = 2;

    /**
     * delay：每次发送的延迟（毫秒）
     *
     * 值越小：
     * - 显示越快
     * - 但看起来像"刷"出来的
     *
     * 值越大：
     * - 打字机效果越明显
     * - 但用户等待时间长
     *
     * 推荐：20-50ms
     */
    const delay = 30;

    /**
     * 循环发送数据块
     *
     * 例如：fullText = "你好，我是 AI 助手"
     *
     * 第 1 次循环（i=0）：发送 "你好"
     * 第 2 次循环（i=2）：发送 "，我"
     * 第 3 次循环（i=4）：发送 "是 "
     * ...
     */
    for (let i = 0; i < fullText.length; i += chunkSize) {
      // 截取当前块
      const chunk = fullText.slice(i, i + chunkSize);

      /**
       * SSE 数据格式（重要！）
       *
       * 格式：data: <JSON>\n\n
       *
       * 例如：data: {"text":"你好"}\n\n
       *
       * 必须遵守：
       * 1. 以 "data: " 开头
       * 2. 后面跟 JSON 数据
       * 3. 以 "\n\n"（两个换行符）结尾
       *
       * 为什么要两个换行符？
       * - 第一个 \n：结束当前行
       * - 第二个 \n：结束当前消息
       * - 浏览器识别 \n\n 为一条完整消息
       */
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);

      /**
       * 延迟一下，制造打字机效果
       *
       * await：等待延迟完成
       * Promise：创建一个异步操作
       * setTimeout：延迟指定毫秒数
       * resolve：完成延迟，继续下一次循环
       *
       * 等价于：暂停 30ms，然后继续
       */
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // ========================================
    // 7. 发送结束标记
    // ========================================

    /**
     * [DONE] 标记
     *
     * 作用：告诉前端数据已全部发送完毕
     * 前端检测到 [DONE] 后：
     * - 停止读取数据
     * - 关闭连接
     * - 设置 isLoading = false
     */
    res.write('data: [DONE]\n\n');

    /**
     * res.end()
     *
     * 作用：关闭响应，释放连接
     * 如果不调用 res.end()：
     * - 连接会一直保持打开
     * - 浏览器会一直等待
     * - 资源无法释放
     */
    res.end();

    console.log('流式输出完成');

  } catch (error) {
    // ========================================
    // 8. 错误处理
    // ========================================

    console.error('流式错误:', error);

    /**
     * 即使出错，也要遵守 SSE 格式
     *
     * 发送错误消息给前端
     * 前端可以：
     * - 显示错误提示
     * - 提示用户重试
     */
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// ========================================
// 启动服务器
// ========================================

/**
 * app.listen()
 *
 * 作用：启动 HTTP 服务器，监听端口
 *
 * PORT：3000
 * 为什么是 3000？
 * - 约定俗成的开发端口
 * - 不与系统端口冲突（1-1024 是系统保留）
 * - 前端通常用 5173、3000、8080 等
 */
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📝 API: http://localhost:${PORT}/api/chat`);
  console.log(`🌊 Stream API: http://localhost:${PORT}/api/chat/stream`);
});
