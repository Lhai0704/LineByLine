const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
// const { getTranslation, saveTranslation } = require('./database');
const Database = require('./database');
const FileHandler = require('./fileHandlers');
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
        filters: [
            { name: 'Supported Files', extensions: ['txt', 'epub', 'pdf'] }
        ]
    });

    if (!result.canceled) {
        const filePath = result.filePaths[0];
        const fileInfo = await FileHandler.getFileInfo(filePath);
        
        // 添加书籍到数据库
        const bookId = await Database.addBook(
            filePath,
            fileInfo.name,
            fileInfo.format
        );

        // 根据文件格式读取内容
        let contentItems;
        switch (fileInfo.format) {
            case 'txt':
                contentItems = await FileHandler.readTxt(filePath);
                break;
            case 'epub':
                contentItems = await FileHandler.readEpub(filePath);
                break;
            case 'pdf':
                contentItems = await FileHandler.readPdf(filePath);
                break;
        }

        return {
            bookId,
            contentItems
            // content: fileData.content,
            // images: fileData.images
        };
    }
    return null;
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
ipcMain.handle('translate-text', async (event, { bookId, sentenceIndex, text }) => {
    try {
        // 先查询数据库
        const existingTranslation = await Database.getBookTranslations(bookId);
        const savedTranslation = existingTranslation.find(t => 
            t.sentence_index === sentenceIndex && t.original_text === text
        );
        
        if (savedTranslation) {
            return savedTranslation.translated_text;
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

        // 保存翻译到数据库
        if (translatedText) {
            await Database.saveTranslations(bookId, [{
                sentence_index: sentenceIndex,
                original: text,
                translated: translatedText
            }]);
        }

        return translatedText;
    } catch (err) {
        console.error('Translation error:', err);
        return '';
    }
});

// 获取书籍的所有翻译
ipcMain.handle('get-book-translations', async (event, bookId) => {
    try {
        return await Database.getBookTranslations(bookId);
    } catch (err) {
        console.error('Error getting translations:', err);
        return null;
    }
});
