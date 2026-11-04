require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

// ========== 1. 初始化Anthropic客户端 ==========
const anthropic = new Anthropic({
  apiKey: process.env.OPENAI_API_KEY,  // 你的.env里用的这个key
  baseURL: process.env.API_BASE_URL
});

// ========== 2. 定义工具（Anthropic格式） ==========
const tools = [
  {
    name: "search_knowledge_base",
    description: "从知识库中检索信息，适用于查找用户资料、产品信息、公司政策等",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "检索关键词"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "calculator",
    description: "执行数学计算，支持基本的四则运算",
    input_schema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "数学表达式，如 '100 * 0.8'"
        }
      },
      required: ["expression"]
    }
  }
];

// ========== 3. 实现工具执行函数 ==========
function executeKnowledgeBase(query) {
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
}

function executeCalculator(expression) {
  console.log(`\n🔧 [工具调用] calculator`);
  console.log(`   计算: "${expression}"`);

  try {
    const result = eval(expression);
    console.log(`   ✅ 结果: ${result}`);
    return `计算结果: ${result}`;
  } catch (error) {
    console.log(`   ❌ 计算失败`);
    return "计算失败，请检查表达式";
  }
}

// ========== 4. Agent主循环（ReAct模式） ==========
async function runAgent(userMessage) {
  console.log(`\n📨 [用户问题] ${userMessage}`);
  console.log("─".repeat(50));

  const messages = [
    { role: "user", content: userMessage }
  ];

  let continueLoop = true;
  let iterationCount = 0;
  const maxIterations = 5;  // 防止无限循环

  while (continueLoop && iterationCount < maxIterations) {
    iterationCount++;
    console.log(`\n🔄 [第${iterationCount}轮推理]`);

    try {
      // 调用Claude，传入工具定义
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        tools: tools,
        messages: messages,
        system: "你是一个智能客服助手。回答问题前，你必须先使用 search_knowledge_base 工具查询知识库。如果需要计算，使用 calculator 工具。不要凭空回答，必须基于工具返回的结果。"
      });

      console.log(`   Stop reason: ${response.stop_reason}`);

      // 处理响应内容
      for (const content of response.content) {
        if (content.type === 'text') {
          console.log(`\n💬 [AI思考] ${content.text}`);
        } else if (content.type === 'tool_use') {
          console.log(`\n🤖 [决策] 调用工具: ${content.name}`);
          console.log(`   参数: ${JSON.stringify(content.input)}`);

          // 执行工具
          let toolResult;
          if (content.name === 'search_knowledge_base') {
            toolResult = executeKnowledgeBase(content.input.query);
          } else if (content.name === 'calculator') {
            toolResult = executeCalculator(content.input.expression);
          } else {
            toolResult = "未知工具";
          }

          // 将工具结果添加到对话历史
          messages.push({
            role: "assistant",
            content: response.content
          });

          messages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: content.id,
                content: toolResult
              }
            ]
          });

          console.log(`   🔄 继续推理...`);
          continueLoop = true;  // 继续循环，让AI基于工具结果生成最终答案
          break;  // 跳出content循环，进入下一轮推理
        }
      }

      // 如果stop_reason是end_turn，说明AI已经完成回答
      if (response.stop_reason === 'end_turn') {
        continueLoop = false;

        // 提取最终文本回复
        const finalText = response.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');

        if (finalText) {
          console.log(`\n✅ [最终回复] ${finalText}`);
        }
      }

    } catch (error) {
      console.error(`\n❌ API调用失败: ${error.message}`);
      continueLoop = false;
    }
  }

  if (iterationCount >= maxIterations) {
    console.log(`\n⚠️ 达到最大迭代次数(${maxIterations})，停止推理`);
  }

  console.log("\n" + "=".repeat(50));
}

// ========== 5. 测试多个问题 ==========
async function main() {
  console.log("=== Anthropic Tool Calling Agent 测试 ===");

  const testQueries = [
    "魏仁杰的手机号是多少？",
    "专业版多少钱？打8折是多少钱？",
    "你的退款政策是什么？"
  ];

  for (const query of testQueries) {
    await runAgent(query);
  }
}

main().catch(console.error);
