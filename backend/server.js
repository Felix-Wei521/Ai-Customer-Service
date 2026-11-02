const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { Pinecone } = require('@pinecone-database/pinecone');
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

// 初始化 Anthropic 客户端（用于聊天）
const anthropicConfig = {
  apiKey: process.env.OPENAI_API_KEY,
};

// 如果配置了自定义 API 地址，则使用它
if (process.env.API_BASE_URL) {
  anthropicConfig.baseURL = process.env.API_BASE_URL;
}

const anthropic = new Anthropic(anthropicConfig);

// 初始化 OpenAI 客户端（用于 Embedding）
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.API_BASE_URL,
});

// 初始化 Pinecone 客户端（向量数据库）
let pinecone;
let pineconeIndex;

async function initPinecone() {
  if (!process.env.PINECONE_API_KEY) {
    console.log('⚠️  未配置 Pinecone API Key，向量将只存储在内存中');
    return;
  }

  try {
    pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    // 索引名称
    const indexName = 'ai-customer-service';

    // 检查索引是否存在
    const indexList = await pinecone.listIndexes();
    const indexExists = indexList.indexes?.some(index => index.name === indexName);

    if (!indexExists) {
      // 索引不存在，自动创建
      console.log('📝 索引不存在，正在创建...');

      await pinecone.createIndex({
        name: indexName,
        dimension: 1536,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1',
          },
        },
      });

      console.log('✅ 索引创建成功，等待初始化...');

      // 等待索引就绪（最多等待 60 秒）
      for (let i = 0; i < 60; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const indexes = await pinecone.listIndexes();
        const index = indexes.indexes?.find(idx => idx.name === indexName);
        if (index && index.status?.ready) {
          console.log('✅ 索引已就绪');
          break;
        }
      }
    } else {
      console.log('✅ 索引已存在');
    }

    // 获取索引
    pineconeIndex = pinecone.index(indexName);

    console.log('✅ Pinecone 初始化成功');
  } catch (error) {
    console.error('❌ Pinecone 初始化失败:', error.message);
    console.log('💡 请检查：');
    console.log('   1. API Key 是否正确');
    console.log('   2. 网络连接是否正常');
    console.log('   3. 免费额度是否还有剩余');
  }
}

// 启动时初始化 Pinecone
initPinecone();

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

/**
 * 文本向量化（Embedding）
 * @param {string} text - 要向量化的文本
 * @returns {Promise<number[]>} 向量数组
 */
async function getEmbedding(text) {
  // 模拟 Embedding（用于学习和演示）
  // 真实项目中应该调用 OpenAI Embedding API
  return generateMockEmbedding(text);

  /* 真实 Embedding API 调用（需要真实的 OpenAI API Key）
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Embedding 错误:', error);
    throw error;
  }
  */
}

/**
 * 生成模拟向量（用于学习和演示）
 * 真实项目中应该使用真实的 Embedding API
 * @param {string} text - 文本
 * @returns {number[]} 1536 维向量
 */
function generateMockEmbedding(text) {
  // 生成 1536 维向量（和 OpenAI text-embedding-3-small 一致）
  const dimension = 1536;
  const vector = [];

  // 使用文本内容作为种子，让相似文本生成相似向量
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed += text.charCodeAt(i);
  }

  // 生成伪随机向量（基于文本种子）
  for (let i = 0; i < dimension; i++) {
    // 使用简单的伪随机算法
    seed = (seed * 9301 + 49297) % 233280;
    const random = seed / 233280.0;
    // 生成 -1 到 1 之间的数字
    vector.push((random - 0.5) * 2);
  }

  // 归一化向量（让向量长度为 1）
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map(val => val / magnitude);
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

    // 3. 向量化每个切片
    console.log('开始向量化...');
    const embeddingPromises = chunks.map(chunk => getEmbedding(chunk.text));
    const embeddings = await Promise.all(embeddingPromises);
    console.log('向量化完成！每个向量维度:', embeddings[0].length);

    // 4. 存储切片（添加文档信息 + 向量）
    const docId = Date.now().toString();
    chunks.forEach((chunk, index) => {
      documentChunks.push({
        id: `${docId}_${index}`,
        docId,
        docName: req.file.originalname,
        text: chunk.text,
        embedding: embeddings[index], // 存储向量
        chunkIndex: index,
        uploadedAt: new Date().toISOString(),
      });
    });

    // 5. 存储向量到 Pinecone
    if (pineconeIndex) {
      console.log('开始上传到 Pinecone...');

      // 准备 Pinecone 数据格式
      const vectors = chunks.map((chunk, index) => ({
        id: `${docId}_${index}`,
        values: embeddings[index],
        metadata: {
          docId,
          docName: req.file.originalname,
          text: chunk.text.substring(0, 1000), // Pinecone metadata 有大小限制，只存前 1000 字符
          chunkIndex: index,
          uploadedAt: new Date().toISOString(),
        },
      }));

      console.log('准备上传向量数量:', vectors.length);
      console.log('第一个向量预览:', {
        id: vectors[0].id,
        valuesLength: vectors[0].values.length,
        metadataTextLength: vectors[0].metadata.text.length,
      });

      // 检查是否有数据
      if (vectors.length === 0) {
        throw new Error('没有向量数据可以上传');
      }

      // 批量上传到 Pinecone
      // Pinecone SDK v8.x 的正确调用方式
      try {
        console.log('准备调用 Pinecone upsert (v8.x)，向量数组长度:', vectors.length);

        // v8.x 的 API：直接调用 upsert，不需要 namespace()
        const upsertResponse = await pineconeIndex.upsert(vectors);

        console.log('✅ Pinecone 上传完成', upsertResponse);
      } catch (upsertError) {
        console.error('❌ Pinecone upsert 错误:', upsertError.message);
        throw upsertError;
      }
    } else {
      console.log('⚠️  Pinecone 未配置，向量仅存储在内存中');
    }

    // 6. 删除临时文件
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
      hasEmbedding: !!c.embedding, // 是否有向量
      embeddingDim: c.embedding ? c.embedding.length : 0, // 向量维度
    })),
  });
});

// 测试 Embedding 接口
app.post('/api/embedding/test', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: '请提供文本' });
    }

    console.log('测试 Embedding:', text);

    const embedding = await getEmbedding(text);

    res.json({
      text,
      embeddingDim: embedding.length,
      embeddingPreview: embedding.slice(0, 10), // 只返回前 10 个数字
      message: 'Embedding 生成成功',
    });
  } catch (error) {
    console.error('Embedding 测试错误:', error);
    res.status(500).json({
      error: 'Embedding 失败',
      details: error.message
    });
  }
});

// 语义搜索接口（从 Pinecone 检索相似文档）
app.post('/api/search', async (req, res) => {
  try {
    const { query, topK = 3 } = req.body;

    if (!query) {
      return res.status(400).json({ error: '请提供搜索内容' });
    }

    console.log('搜索问题:', query);

    // 1. 将问题向量化
    const queryEmbedding = await getEmbedding(query);
    console.log('问题向量化完成');

    let results;

    // 2. 从 Pinecone 检索
    if (pineconeIndex) {
      console.log('从 Pinecone 检索...');

      const queryResponse = await pineconeIndex.namespace('').query({
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
      });

      results = queryResponse.matches.map(match => ({
        id: match.id,
        score: match.score,
        text: match.metadata.text,
        docName: match.metadata.docName,
        chunkIndex: match.metadata.chunkIndex,
      }));

      console.log('Pinecone 检索完成，找到', results.length, '条结果');
    } else {
      // 3. 从内存中检索（如果没有 Pinecone）
      console.log('从内存中检索...');

      const scores = documentChunks.map(chunk => ({
        ...chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
      }));

      // 按相似度降序排序
      scores.sort((a, b) => b.score - a.score);

      // 返回 Top-K
      results = scores.slice(0, topK).map(chunk => ({
        id: chunk.id,
        score: chunk.score,
        text: chunk.text,
        docName: chunk.docName,
        chunkIndex: chunk.chunkIndex,
      }));

      console.log('内存检索完成，找到', results.length, '条结果');
    }

    res.json({
      query,
      results,
      message: '搜索成功',
    });
  } catch (error) {
    console.error('搜索错误:', error);
    res.status(500).json({
      error: '搜索失败',
      details: error.message
    });
  }
});

/**
 * 计算余弦相似度
 * @param {number[]} vecA - 向量 A
 * @param {number[]} vecB - 向量 B
 * @returns {number} 相似度（0-1）
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

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

// 流式聊天接口（带 RAG 功能）
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

    // ========== RAG 步骤 1：搜索相关文档 ==========
    let context = '';
    try {
      console.log('🔍 开始 RAG 检索...');

      // 将问题向量化
      const queryEmbedding = await getEmbedding(message);

      let searchResults = [];

      // 从 Pinecone 或内存中检索
      if (pineconeIndex) {
        console.log('从 Pinecone 检索...');
        try {
          const queryResponse = await pineconeIndex.query({
            vector: queryEmbedding,
            topK: 3,
            includeMetadata: true,
          });
          searchResults = queryResponse.matches || [];
        } catch (pineconeError) {
          console.log('Pinecone 检索失败，改用内存检索:', pineconeError.message);
        }
      }

      // 如果 Pinecone 检索失败或未配置，使用内存检索
      if (searchResults.length === 0 && documentChunks.length > 0) {
        console.log('从内存中检索...');
        const scores = documentChunks.map(chunk => ({
          ...chunk,
          score: cosineSimilarity(queryEmbedding, chunk.embedding),
        }));
        scores.sort((a, b) => b.score - a.score);
        searchResults = scores.slice(0, 3);
      }

      // 拼接检索到的文档作为上下文
      if (searchResults.length > 0) {
        console.log('✅ 检索到', searchResults.length, '条相关文档');
        context = '\n\n参考信息：\n';
        searchResults.forEach((result, index) => {
          const text = result.metadata?.text || result.text;
          const score = result.score;
          context += `\n[文档${index + 1}]（相似度：${(score * 100).toFixed(1)}%）\n${text}\n`;
        });
        console.log('上下文长度:', context.length, '字符');
      } else {
        console.log('⚠️  未检索到相关文档');
      }
    } catch (ragError) {
      console.error('RAG 检索错误:', ragError.message);
      // 如果 RAG 失败，继续正常对话
    }

    // ========== RAG 步骤 2：拼接 Prompt ==========
    let finalPrompt = message;
    if (context) {
      finalPrompt = `${context}\n\n---\n\n用户问题：${message}\n\n请根据上述参考信息回答用户问题。如果参考信息中没有相关内容，请说明"根据现有信息无法回答"。`;
    }

    console.log('调用 Claude API...');

    // 调用普通 API（第三方服务不支持流式）
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: finalPrompt,
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
