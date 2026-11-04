/**
 * 测试API调用（使用你原来能跑通的方式）
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

// 使用你原来的配置方式
const client = new Anthropic({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.API_BASE_URL,
});

async function testAPI() {
  console.log('测试API配置...');
  console.log('API Key:', process.env.OPENAI_API_KEY?.substring(0, 20) + '...');
  console.log('Base URL:', process.env.API_BASE_URL);

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',  // 改用你之前能用的模型
      max_tokens: 1024,
      messages: [
        { role: 'user', content: '你好，请回复"测试成功"' }
      ],
    });

    console.log('\n✅ API调用成功！');
    console.log('回复:', message.content[0].text);
    return true;
  } catch (error) {
    console.error('\n❌ API调用失败:', error.message);
    return false;
  }
}

testAPI();
