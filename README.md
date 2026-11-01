# 企业级智能客服系统（AI 驱动）

## 项目简介

基于 LLM 和 RAG 架构的企业智能客服解决方案，支持知识库管理、实时对话、数据统计等功能。

## 技术栈

**前端**：Vue 3 + TypeScript + Vite
**后端**：Node.js + Express
**AI**：OpenAI API + RAG
**向量库**：Pinecone
**部署**：Vercel

## 学习进度

### Week 1：基础对话 + 流式输出
- [x] Day 1-2：最简单的对话界面
- [ ] Day 3-4：流式输出（SSE）
- [ ] Day 5-7：历史记录 + 美化界面

### Week 2：RAG 知识库
- [ ] Day 8-10：上传文档 + 文本提取
- [ ] Day 11-12：文本切片 + 向量化
- [ ] Day 13-14：知识库问答

### Week 3：企业级特性
- [ ] Day 15-17：多轮对话 + 上下文管理
- [ ] Day 18-21：失败处理 + 转人工

### Week 4：优化 + 亮点
- [ ] Day 22-24：数据统计 + 可视化
- [ ] Day 25-26：A/B 测试
- [ ] Day 27-28：部署 + 文档

## 快速开始

### 前端
```bash
cd frontend
npm install
npm run dev
```

### 后端
```bash
cd backend
npm install
npm run dev
```

## 项目亮点（面试重点）

1. **文本切片优化**：解决长文档 token 限制问题
2. **对话压缩策略**：降低 token 消耗 40%
3. **失败处理机制**：AI 置信度判断，自动转人工
4. **A/B 测试框架**：数据驱动优化 Prompt 效果

## License

MIT
