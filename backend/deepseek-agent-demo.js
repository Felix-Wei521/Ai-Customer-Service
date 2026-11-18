require('dotenv').config();
const { ChatOpenAI } = require("@langchain/openai");
const { tool } = require("@langchain/core/tools");
const { z } = require("zod");

console.log('=== DeepSeek Agent 测试（LangChain + Tool Calling） ===\n');
console.log('✅ DeepSeek 优势：');
console.log('   - 真正的 OpenAI 兼容 API');
console.log('   - LangChain 完美支持');
console.log('   - 价格便宜（¥1/百万tokens）');
console.log('   - 响应速度快\n');

// ========== 1. 定义工具 ==========
const searchKnowledgeBase = tool(
  async ({ query }) => {
    console.log(`\n🔧 [工具调用] search_knowledge_base`);
    console.log(`   查询: "${query}"`);

    const mockData = {
      "魏仁杰": "魏仁杰，29岁，前端开发5年经验（Vue/React），联系电话19983485600",
      "手机号": "魏仁杰，29岁，前端开发5年经验（Vue/React），联系电话19983485600",
      "产品价格": "基础版299元/月，专业版599元/月",
      "专业版": "基础版299元/月，专业版599元/月",
      "退款": "7天内无理由退款"
    };

    for (const [key, value] of Object.entries(mockData)) {
      if (query.includes(key)) {
        console.log(`   ✅ 找到结果`);
        return `知识库检索结果：${value}`;
      }
    }

    console.log(`   ⚠️ 未找到相关信息`);
    return "未找到相关信息";
  },
  {
    name: "search_knowledge_base",
    description: "从知识库中检索信息，适用于查找用户资料、产品信息、公司政策等",
    schema: z.object({
      query: z.string().describe("检索关键词")
    })
  }
);

const calculator = tool(
  async ({ expression }) => {
    console.log(`\n🔧 [工具调用] calculator`);
    console.log(`   计算: "${expression}"`);

    try {
      const result = new Function('"use strict"; return (' + expression + ')')();
      if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
        return "计算结果无效，请检查表达式";
      }
      console.log(`   ✅ 结果: ${result}`);
      return `计算结果: ${result}`;
    } catch (error) {
      console.log(`   ❌ 计算失败`);
      return "计算失败，请检查表达式";
    }
  },
  {
    name: "calculator",
    description: "执行数学计算，支持基本的四则运算",
    schema: z.object({
      expression: z.string().describe("数学表达式，如 '100 * 0.8'")
    })
  }
);

// ========== 2. 初始化 DeepSeek 模型 ==========
const model = new ChatOpenAI({
  modelName: "deepseek-chat",  // DeepSeek 的模型名
  temperature: 0,
  apiKey: process.env.DEEPSEEK_API_KEY,  // ✅ 改用 apiKey 参数（更明确）
  configuration: {
    baseURL: "https://api.deepseek.com"  // DeepSeek 官方地址
  }
});

console.log('📡 模型配置：');
console.log(`   Model: deepseek-chat`);
console.log(`   API: https://api.deepseek.com`);
console.log(`   Key: ${process.env.DEEPSEEK_API_KEY?.substring(0, 10)}...`);
console.log('');

// ========== 3. 绑定工具 ==========
const modelWithTools = model.bindTools([searchKnowledgeBase, calculator]);

// ========== 4. 测试 Agent ==========
async function testAgent() {
  const testQueries = [
    "魏仁杰的手机号是多少？",
    "专业版多少钱？打8折是多少钱？",
    "你的退款政策是什么？"
  ];

  for (const query of testQueries) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📨 [用户问题] ${query}`);
    console.log('─'.repeat(60));

    try {
      // 第一步：让模型决定调用什么工具
      const response = await modelWithTools.invoke(query);

      console.log(`\n🤖 [模型决策]`);

      if (response.tool_calls && response.tool_calls.length > 0) {
        console.log(`   选择调用 ${response.tool_calls.length} 个工具:`);

        // 第二步：执行工具调用
        for (const toolCall of response.tool_calls) {
          console.log(`   - ${toolCall.name}(${JSON.stringify(toolCall.args)})`);

          // 手动执行工具
          let toolResult;
          if (toolCall.name === 'search_knowledge_base') {
            toolResult = await searchKnowledgeBase.invoke(toolCall.args);
          } else if (toolCall.name === 'calculator') {
            toolResult = await calculator.invoke(toolCall.args);
          }

          // 第三步：带着工具结果再次调用模型
          const finalResponse = await model.invoke([
            { role: "user", content: query },
            { role: "assistant", content: "", tool_calls: [toolCall] },
            { role: "tool", content: toolResult, tool_call_id: toolCall.id }
          ]);

          console.log(`\n💬 [最终回复] ${finalResponse.content}`);
        }
      } else {
        // 不需要调用工具，直接回答
        console.log(`   不需要调用工具，直接回答`);
        console.log(`\n💬 [最终回复] ${response.content}`);
      }

    } catch (error) {
      console.error(`\n❌ 执行失败: ${error.message}`);
    }
  }

  console.log(`\n${'='.repeat(60)}\n`);
  console.log('🎉 测试完成！');
  console.log('\n💡 对比总结：');
  console.log('   Anthropic Agent: 准确，但第三方中转可能不稳定');
  console.log('   DeepSeek Agent: LangChain原生支持，便宜快速');
}

// ========== 5. 运行测试 ==========
testAgent().catch(console.error);
