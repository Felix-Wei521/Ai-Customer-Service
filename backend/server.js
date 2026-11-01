const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const PORT = 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 初始化 Anthropic 客户端
const anthropicConfig = {
  apiKey: process.env.OPENAI_API_KEY,
};

// 如果配置了自定义 API 地址，则使用它
if (process.env.API_BASE_URL) {
  anthropicConfig.baseURL = process.env.API_BASE_URL;
}

const anthropic = new Anthropic(anthropicConfig);

console.log('API 配置:', {
  hasApiKey: !!process.env.OPENAI_API_KEY,
  baseURL: process.env.API_BASE_URL || '默认（https://api.anthropic.com）'
});

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// 聊天接口（使用 Claude 模型）
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('收到用户消息:', message);

    // 调用 Anthropic API（Claude 模型）
    // 尝试使用通用的模型名称（第三方服务通常支持）
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

    // 打印完整的返回数据，方便调试
    console.log('完整返回数据:', JSON.stringify(completion, null, 2));

    // 解析返回数据
    let reply;
    if (completion.content && Array.isArray(completion.content)) {
      // 找到 type 为 "text" 的内容（过滤掉 "thinking" 类型）
      const textContent = completion.content.find(item => item.type === 'text');
      if (textContent && textContent.text) {
        reply = textContent.text;
      } else if (completion.content[0] && completion.content[0].text) {
        // 兜底：如果没有 type 字段，使用第一个有 text 的元素
        reply = completion.content[0].text;
      }
    } else if (completion.choices && completion.choices[0] && completion.choices[0].message) {
      // OpenAI 格式（有些中转服务使用这种格式）
      reply = completion.choices[0].message.content;
    } else if (typeof completion === 'string') {
      // 纯文本格式
      reply = completion;
    }

    if (!reply) {
      console.error('未知的返回格式:', completion);
      reply = '抱歉，无法解析 AI 回复';
    }

    console.log('AI 回复:', reply);

    res.json({ reply });
  } catch (error) {
    console.error('完整错误信息:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({ error: 'Something went wrong', details: error.message });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📝 API: http://localhost:${PORT}/api/chat`);
});
