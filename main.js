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
        filters: [
            { name: 'Text Files', extensions: ['txt'] },
            { name: 'EPUB Files', extensions: ['epub'] },
            { name: 'PDF Files', extensions: ['pdf'] },
        ],
    });

    if (!result.canceled) {
        const filePath = result.filePaths[0];
        const fileExt = path.extname(filePath).toLowerCase();

        let content = [];

        // 读取 txt 文件
        if (fileExt === '.txt') {
            content = fs.readFileSync(filePath, 'utf8').split('\n');
            return content;
        }

        // 读取 epub 文件
        else if (fileExt === '.epub') {
            const EPub = require('epub');

            return new Promise((resolve, reject) => {
                const epub = new EPub(filePath, '/images/', '/chapters/');

                epub.on('end', async () => {
                    try {
                        // 获取所有章节内容
                        const chapters = [];

                        // 使用 Promise.all 和 map 来并行处理所有章节
                        const chapterPromises = epub.flow.map(chapter => {
                            return new Promise((resolveChapter, rejectChapter) => {
                                epub.getChapter(chapter.id, (error, text) => {
                                    if (error) {
                                        rejectChapter(error);
                                    } else {
                                        // 将 HTML 转换为纯文本
                                        const textContent = text.replace(/<[^>]+>/g, '')
                                            .replace(/\n\s*\n/g, '\n')
                                            .trim();
                                        resolveChapter(textContent);
                                    }
                                });
                            });
                        });

                        const chapterContents = await Promise.all(chapterPromises);
                        resolve(chapterContents);
                    } catch (error) {
                        reject(error);
                    }
                });

                epub.on('error', error => {
                    reject(error);
                });

                epub.parse();
            });
        }

        // 读取 pdf 文件
        else if (fileExt === '.pdf') {
            const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
            const pdf = await pdfjsLib.getDocument(filePath).promise;
            const numPages = pdf.numPages;
            const textContent = [];

            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const content = await page.getTextContent();
                const pageText = content.items.map((item) => item.str).join(' ');
                textContent.push(pageText);
            }

            content = textContent;
            return content;
        }
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
