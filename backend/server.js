const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 配置文件上传
const upload = multer({
  dest: 'uploads/', // 临时存储目录
  limits: {
    fileSize: 10 * 1024 * 1024, // 限制 10MB
  },
  fileFilter: (req, file, cb) => {
    // 修复中文文件名乱码
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');

    // 只允许 PDF 文件
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('只支持 PDF 文件'));
    }
  },
});

// 存储文档切片（实际项目中应该用数据库）
const documentChunks = [];

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

// ========== 文档处理工具函数 ==========

/**
 * 文本切片函数
 * @param {string} text - 要切片的文本
 * @param {number} chunkSize - 每块的字符数
 * @param {number} overlap - 重叠的字符数
 * @returns {Array} 切片数组
 */
function chunkText(text, chunkSize = 500, overlap = 50) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = start + chunkSize;
    const chunk = text.slice(start, end);

    if (chunk.trim()) {
      chunks.push({
        text: chunk.trim(),
        start,
        end: Math.min(end, text.length),
      });
    }

    // 下一块从 (当前位置 + 块大小 - 重叠) 开始
    start = end - overlap;
  }

  return chunks;
}

/**
 * 提取 PDF 文本
 * @param {string} filePath - PDF 文件路径
 * @returns {Promise<string>} 提取的文本
 */
async function extractPdfText(filePath) {
  const dataBuffer = await fs.readFile(filePath);
  // pdf-parse v1.x 直接调用函数
  const data = await pdfParse(dataBuffer);
  return data.text;
}

// ========== 文档上传接口 ==========

// 上传文档并处理
app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传文件' });
    }

    console.log('收到文件:', req.file.originalname);

    // 1. 提取 PDF 文本
    const text = await extractPdfText(req.file.path);
    console.log('提取文本长度:', text.length, '字符');

    // 2. 文本切片
    const chunks = chunkText(text, 500, 50);
    console.log('切片数量:', chunks.length);

    // 3. 存储切片（添加文档信息）
    const docId = Date.now().toString();
    chunks.forEach((chunk, index) => {
      documentChunks.push({
        id: `${docId}_${index}`,
        docId,
        docName: req.file.originalname,
        text: chunk.text,
        chunkIndex: index,
        uploadedAt: new Date().toISOString(),
      });
    });

    // 4. 删除临时文件
    await fs.unlink(req.file.path);

    console.log('文档处理完成，总切片数:', documentChunks.length);

    res.json({
      success: true,
      docId,
      docName: req.file.originalname,
      textLength: text.length,
      chunkCount: chunks.length,
      message: '文档上传成功',
    });
  } catch (error) {
    console.error('文档上传错误:', error);
    res.status(500).json({
      error: '文档处理失败',
      details: error.message
    });
  }
});

// 获取所有文档列表
app.get('/api/documents', (req, res) => {
  // 去重，获取唯一文档
  const docs = {};
  documentChunks.forEach(chunk => {
    if (!docs[chunk.docId]) {
      docs[chunk.docId] = {
        id: chunk.docId,
        name: chunk.docName,
        uploadedAt: chunk.uploadedAt,
        chunkCount: 0,
      };
    }
    docs[chunk.docId].chunkCount++;
  });

  res.json({
    documents: Object.values(docs),
    totalChunks: documentChunks.length,
  });
});

// 查看文档切片详情
app.get('/api/documents/:docId/chunks', (req, res) => {
  const { docId } = req.params;
  const chunks = documentChunks.filter(chunk => chunk.docId === docId);

  if (chunks.length === 0) {
    return res.status(404).json({ error: '文档不存在' });
  }

  res.json({
    docId,
    docName: chunks[0].docName,
    chunks: chunks.map(c => ({
      id: c.id,
      index: c.chunkIndex,
      text: c.text.substring(0, 100) + '...', // 只返回前 100 字
      length: c.text.length,
    })),
  });
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

// 流式聊天接口（模拟流式输出）
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('收到用户消息（流式）:', message);

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    console.log('调用普通 API...');

    // 调用普通 API（第三方服务不支持流式）
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

    // 解析返回数据，找到文本内容
    let fullText = '';
    if (completion.content && Array.isArray(completion.content)) {
      const textContent = completion.content.find(item => item.type === 'text');
      if (textContent && textContent.text) {
        fullText = textContent.text;
      }
    }

    console.log('AI 回复完成，开始模拟流式输出...');
    console.log('回复长度:', fullText.length, '字符');

    // 模拟流式输出：按字符分块发送
    const chunkSize = 2; // 每次发送 2 个字符
    const delay = 30; // 每次延迟 30ms

    for (let i = 0; i < fullText.length; i += chunkSize) {
      const chunk = fullText.slice(i, i + chunkSize);
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);

      // 延迟一下，制造打字机效果
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // 发送结束标记
    res.write('data: [DONE]\n\n');
    res.end();

    console.log('流式输出完成');
  } catch (error) {
    console.error('流式错误:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📝 API: http://localhost:${PORT}/api/chat`);
  console.log(`🌊 Stream API: http://localhost:${PORT}/api/chat/stream`);
});
