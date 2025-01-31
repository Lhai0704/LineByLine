const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { getTranslation, saveTranslation } = require('./database');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const TRANSLATOR_API_KEY = '';
const TRANSLATOR_URL = 'http://localhost:3000/translate'; // 修改为本地服务器地址

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

// 选择文件
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Text Files', extensions: ['txt'] }]
  });

  if (!result.canceled) {
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n');
  }
  return [];
});

// 读取译文
ipcMain.handle('get-translation', async (event, text) => {
  try {
    return await getTranslation(text);
  } catch (err) {
    console.error('Translation query error:', err);
    return null;
  }
});

// 存储译文
ipcMain.handle('save-translation', async (event, original, translated) => {
  try {
    await saveTranslation(original, translated);
  } catch (err) {
    console.error('Translation save error:', err);
  }
});

// 翻译文本
ipcMain.handle('translate-text', async (event, text) => {
  try {
    // 先查询数据库，看看是否已有翻译
    const existingTranslation = await getTranslation(text);
    if (existingTranslation) {
      return existingTranslation;
    }

    // 如果没有，调用翻译 API
    const response = await fetch(TRANSLATOR_URL, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': TRANSLATOR_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ text }]),
    });

    const data = await response.json();
    const translatedText = data[0]?.translations[0]?.text || '';

    // 存入数据库
    await saveTranslation(text, translatedText);

    return translatedText;
  } catch (err) {
    console.error('Translation error:', err);
    return '';
  }
});
