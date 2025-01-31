const express = require('express');
const app = express();
const port = 3000;

// 模拟翻译数据库
const mockTranslations = {
  // 常用词汇示例
  'hello': '你好',
  'world': '世界',
  'book': '书',
  'read': '阅读',
  'welcome': '欢迎',
  // 可以根据需要添加更多
};

// 支持 JSON 请求体
app.use(express.json());

// 模拟翻译 API 端点
app.post('/translate', (req, res) => {
  const requestBody = req.body;
  
  // 验证请求格式
  if (!Array.isArray(requestBody) || !requestBody[0]?.text) {
    return res.status(400).json({
      error: {
        code: 400,
        message: "Invalid request format"
      }
    });
  }

  const textToTranslate = requestBody[0].text;
  
  // 模拟翻译逻辑
  let translatedText;
  
  if (mockTranslations[textToTranslate.toLowerCase()]) {
    // 如果在预设词典中找到对应翻译
    translatedText = mockTranslations[textToTranslate.toLowerCase()];
  } else {
    // 简单的模拟翻译规则：在原文后添加"[已翻译]"
    translatedText = `${textToTranslate}[已翻译]`;
  }

  // 模拟 API 响应格式
  const response = [{
    translations: [{
      text: translatedText,
      to: "zh"
    }]
  }];

  // 模拟随机延迟（100-500ms），更真实地模拟网络请求
  setTimeout(() => {
    res.json(response);
  }, Math.random() * 400 + 100);
});

// 添加错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: {
      code: 500,
      message: "Internal server error"
    }
  });
});

app.listen(port, () => {
  console.log(`Mock translation server running at http://localhost:${port}`);
});
