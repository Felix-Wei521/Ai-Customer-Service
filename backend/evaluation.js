/**
 * Agent 评测系统
 * 用于测试 Anthropic Agent 和 DeepSeek Agent 的性能
 */

require('dotenv').config();
const axios = require('axios');

// ==================== 测试用例 ====================

const testCases = [
  // 类型1：知识库检索
  {
    id: 1,
    name: "知识库检索-产品价格",
    question: "专业版多少钱？",
    expectedTool: "search_knowledge_base",
    expectedKeywords: ["599", "元", "专业版"],
    category: "knowledge_search"
  },
  {
    id: 2,
    name: "知识库检索-退款政策",
    question: "你们的退款政策是什么？",
    expectedTool: "search_knowledge_base",
    expectedKeywords: ["7天", "退款"],
    category: "knowledge_search"
  },

  // 类型2：数学计算
  {
    id: 3,
    name: "计算-简单乘法",
    question: "599打8折是多少钱？",
    expectedTool: "calculator",
    expectedKeywords: ["479"],
    category: "calculation"
  },
  {
    id: 4,
    name: "计算-复杂表达式",
    question: "100加50再乘以2是多少？",
    expectedTool: "calculator",
    expectedKeywords: ["300"],
    category: "calculation"
  },

  // 类型3：订单查询
  {
    id: 5,
    name: "订单查询-存在的订单",
    question: "帮我查一下订单ORD001的状态",
    expectedTool: "get_order_info",
    expectedKeywords: ["ORD001", "已发货"],
    category: "order_query"
  },
  {
    id: 6,
    name: "订单查询-不存在的订单",
    question: "帮我查一下订单ORD999",
    expectedTool: "get_order_info",
    expectedKeywords: ["不存在", "ORD999"],
    category: "order_query"
  },

  // 类型4：多工具组合
  {
    id: 7,
    name: "组合-查询后计算",
    question: "专业版多少钱？打9折是多少？",
    expectedTool: "multiple", // 需要多个工具
    expectedKeywords: ["599", "539"],
    category: "complex"
  },
  {
    id: 8,
    name: "组合-订单金额计算",
    question: "查一下订单ORD002，如果打8折是多少钱？",
    expectedTool: "multiple",
    expectedKeywords: ["599", "479"],
    category: "complex"
  },

  // 类型5：无需工具（直接回答）
  {
    id: 9,
    name: "闲聊-问候",
    question: "你好",
    expectedTool: "none",
    expectedKeywords: ["你好", "您好", "hi"],
    category: "chitchat"
  },
  {
    id: 10,
    name: "闲聊-能力询问",
    question: "你能做什么？",
    expectedTool: "none",
    expectedKeywords: ["帮助", "查询", "计算"],
    category: "chitchat"
  }
];

// ==================== 评测配置 ====================

const API_BASE = 'http://localhost:3000';
const EVALUATION_CONFIG = {
  anthropic: {
    endpoint: `${API_BASE}/api/agent/chat`,
    name: 'Anthropic Agent'
  },
  deepseek: {
    endpoint: `${API_BASE}/api/deepseek/chat`,
    name: 'DeepSeek Agent'
  }
};

// ==================== 评测函数 ====================

/**
 * 调用 Agent API
 */
async function callAgent(agentType, question) {
  const config = EVALUATION_CONFIG[agentType];
  const startTime = Date.now();

  try {
    const response = await axios.post(config.endpoint, {
      message: question,
      history: [] // 单轮测试，不带历史
    }, {
      timeout: 30000 // 30秒超时
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    return {
      success: true,
      reply: response.data.reply,
      mode: response.data.mode,
      iterations: response.data.iterations,
      toolsUsed: response.data.toolsUsed || [],
      responseTime: responseTime
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      success: false,
      error: error.message,
      responseTime: endTime - startTime
    };
  }
}

/**
 * 检查是否包含期望的关键词
 */
function checkKeywords(reply, expectedKeywords) {
  const lowerReply = reply.toLowerCase();
  const matchedKeywords = expectedKeywords.filter(keyword =>
    lowerReply.includes(keyword.toLowerCase())
  );
  return {
    matched: matchedKeywords.length,
    total: expectedKeywords.length,
    ratio: matchedKeywords.length / expectedKeywords.length,
    matchedKeywords
  };
}

/**
 * 评分函数
 */
function scoreResult(result, testCase) {
  if (!result.success) {
    return {
      totalScore: 0,
      successScore: 0,
      toolScore: 0,
      keywordScore: 0,
      speedScore: 0,
      details: '请求失败'
    };
  }

  // 1. 成功分（30分）
  const successScore = 30;

  // 2. 工具调用分（30分）
  let toolScore = 0;
  if (testCase.expectedTool === 'none') {
    // 不需要工具，如果没调用工具就得分
    toolScore = (result.toolsUsed.length === 0 || !result.iterations) ? 30 : 0;
  } else if (testCase.expectedTool === 'multiple') {
    // 需要多个工具，调用了2个以上工具就得分
    toolScore = (result.iterations >= 2 || result.toolsUsed.length >= 2) ? 30 : 15;
  } else {
    // 需要特定工具
    const usedExpectedTool = result.toolsUsed.includes(testCase.expectedTool);
    toolScore = usedExpectedTool ? 30 : 0;
  }

  // 3. 关键词匹配分（30分）
  const keywordCheck = checkKeywords(result.reply, testCase.expectedKeywords);
  const keywordScore = Math.round(keywordCheck.ratio * 30);

  // 4. 响应速度分（10分）
  let speedScore = 10;
  if (result.responseTime > 5000) speedScore = 5;
  if (result.responseTime > 10000) speedScore = 2;
  if (result.responseTime > 20000) speedScore = 0;

  const totalScore = successScore + toolScore + keywordScore + speedScore;

  return {
    totalScore,
    successScore,
    toolScore,
    keywordScore,
    speedScore,
    keywordCheck,
    responseTime: result.responseTime
  };
}

/**
 * 运行单个测试用例
 */
async function runTestCase(testCase, agentType) {
  console.log(`\n📝 [测试 ${testCase.id}] ${testCase.name}`);
  console.log(`   问题: "${testCase.question}"`);
  console.log(`   Agent: ${EVALUATION_CONFIG[agentType].name}`);

  const result = await callAgent(agentType, testCase.question);

  if (result.success) {
    console.log(`   ✅ 成功 (${result.responseTime}ms)`);
    console.log(`   回复: ${result.reply.substring(0, 100)}...`);
  } else {
    console.log(`   ❌ 失败: ${result.error}`);
  }

  const score = scoreResult(result, testCase);
  console.log(`   得分: ${score.totalScore}/100`);

  return {
    testCase,
    result,
    score
  };
}

/**
 * 运行完整评测
 */
async function runEvaluation() {
  console.log('='.repeat(60));
  console.log('🎯 Agent 评测系统');
  console.log('='.repeat(60));

  const results = {
    anthropic: [],
    deepseek: []
  };

  // 测试 Anthropic Agent
  console.log('\n\n🤖 ===== 测试 Anthropic Agent =====');
  for (const testCase of testCases) {
    const result = await runTestCase(testCase, 'anthropic');
    results.anthropic.push(result);
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒，避免请求过快
  }

  // 测试 DeepSeek Agent
  console.log('\n\n⚡ ===== 测试 DeepSeek Agent =====');
  for (const testCase of testCases) {
    const result = await runTestCase(testCase, 'deepseek');
    results.deepseek.push(result);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 生成报告
  generateReport(results);
}

/**
 * 生成评测报告
 */
function generateReport(results) {
  console.log('\n\n');
  console.log('='.repeat(60));
  console.log('📊 评测报告');
  console.log('='.repeat(60));

  // 计算总分
  const anthropicTotal = results.anthropic.reduce((sum, r) => sum + r.score.totalScore, 0);
  const deepseekTotal = results.deepseek.reduce((sum, r) => sum + r.score.totalScore, 0);

  const anthropicAvg = anthropicTotal / results.anthropic.length;
  const deepseekAvg = deepseekTotal / results.deepseek.length;

  // 计算成功率
  const anthropicSuccess = results.anthropic.filter(r => r.result.success).length;
  const deepseekSuccess = results.deepseek.filter(r => r.result.success).length;

  const anthropicSuccessRate = (anthropicSuccess / results.anthropic.length * 100).toFixed(1);
  const deepseekSuccessRate = (deepseekSuccess / results.deepseek.length * 100).toFixed(1);

  // 计算平均响应时间
  const anthropicAvgTime = results.anthropic
    .filter(r => r.result.success)
    .reduce((sum, r) => sum + r.result.responseTime, 0) / anthropicSuccess;
  const deepseekAvgTime = results.deepseek
    .filter(r => r.result.success)
    .reduce((sum, r) => sum + r.result.responseTime, 0) / deepseekSuccess;

  // 计算工具调用准确率
  const anthropicToolCorrect = results.anthropic.filter(r => r.score.toolScore >= 25).length;
  const deepseekToolCorrect = results.deepseek.filter(r => r.score.toolScore >= 25).length;

  const anthropicToolRate = (anthropicToolCorrect / results.anthropic.length * 100).toFixed(1);
  const deepseekToolRate = (deepseekToolCorrect / results.deepseek.length * 100).toFixed(1);

  // 打印总体对比
  console.log('\n【总体对比】');
  console.log('┌─────────────────┬──────────────┬──────────────┐');
  console.log('│ 指标            │ Anthropic    │ DeepSeek     │');
  console.log('├─────────────────┼──────────────┼──────────────┤');
  console.log(`│ 平均得分        │ ${anthropicAvg.toFixed(1).padEnd(12)} │ ${deepseekAvg.toFixed(1).padEnd(12)} │`);
  console.log(`│ 成功率          │ ${anthropicSuccessRate}%${' '.repeat(9 - anthropicSuccessRate.length)} │ ${deepseekSuccessRate}%${' '.repeat(9 - deepseekSuccessRate.length)} │`);
  console.log(`│ 工具准确率      │ ${anthropicToolRate}%${' '.repeat(9 - anthropicToolRate.length)} │ ${deepseekToolRate}%${' '.repeat(9 - deepseekToolRate.length)} │`);
  console.log(`│ 平均响应时间    │ ${Math.round(anthropicAvgTime)}ms${' '.repeat(10 - String(Math.round(anthropicAvgTime)).length)} │ ${Math.round(deepseekAvgTime)}ms${' '.repeat(10 - String(Math.round(deepseekAvgTime)).length)} │`);
  console.log('└─────────────────┴──────────────┴──────────────┘');

  // 按类别统计
  console.log('\n【分类统计】');
  const categories = ['knowledge_search', 'calculation', 'order_query', 'complex', 'chitchat'];
  const categoryNames = {
    'knowledge_search': '知识库检索',
    'calculation': '数学计算',
    'order_query': '订单查询',
    'complex': '复杂组合',
    'chitchat': '闲聊对话'
  };

  for (const category of categories) {
    const anthropicCat = results.anthropic.filter(r => r.testCase.category === category);
    const deepseekCat = results.deepseek.filter(r => r.testCase.category === category);

    if (anthropicCat.length > 0) {
      const anthropicCatAvg = anthropicCat.reduce((sum, r) => sum + r.score.totalScore, 0) / anthropicCat.length;
      const deepseekCatAvg = deepseekCat.reduce((sum, r) => sum + r.score.totalScore, 0) / deepseekCat.length;

      console.log(`\n${categoryNames[category]}:`);
      console.log(`  Anthropic: ${anthropicCatAvg.toFixed(1)}分`);
      console.log(`  DeepSeek:  ${deepseekCatAvg.toFixed(1)}分`);
    }
  }

  // 详细结果
  console.log('\n【详细结果】');
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const anthropicResult = results.anthropic[i];
    const deepseekResult = results.deepseek[i];

    console.log(`\n测试${testCase.id}: ${testCase.name}`);
    console.log(`  Anthropic: ${anthropicResult.score.totalScore}/100 (${anthropicResult.result.responseTime}ms)`);
    console.log(`  DeepSeek:  ${deepseekResult.score.totalScore}/100 (${deepseekResult.result.responseTime}ms)`);
    console.log(`  优势: ${anthropicResult.score.totalScore > deepseekResult.score.totalScore ? 'Anthropic' : deepseekResult.score.totalScore > anthropicResult.score.totalScore ? 'DeepSeek' : '平局'}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ 评测完成！');
  console.log('='.repeat(60));
}

// ==================== 运行评测 ====================

runEvaluation().catch(console.error);
