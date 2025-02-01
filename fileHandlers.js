const fs = require('fs').promises;
const path = require('path');
const EPub = require('epub');

class FileHandler {
    constructor() {
        this.pdfjsLib = null;    
    }

    // 初始化 PDF.js
    async initPdfLib() {
        if (!this.pdfjsLib) {
            // 动态导入 pdf.js
            const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
            this.pdfjsLib = pdfjs;
            // 设置 worker
            const pdfWorker = await import('pdfjs-dist/build/pdf.worker.mjs');
            this.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
        }
        return this.pdfjsLib;
    }

    // 获取文件信息
    async getFileInfo(filePath) {
        const stats = await fs.stat(filePath);
        return {
            path: filePath,
            name: path.basename(filePath),
            format: path.extname(filePath).toLowerCase().slice(1),
            size: stats.size,
            lastModified: stats.mtime
        };
    }

    // 读取文本文件
    async readTxt(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        return {
            content: content.split('\n'),
            images: []
        };
    }

    // 读取EPUB文件
    async readEpub(filePath) {
        return new Promise((resolve, reject) => {
            const epub = new EPub(filePath);
            const result = {
                content: [],
                images: []
            };

            epub.on('end', async () => {
                try {
                    // 获取章节内容
                    for (const chapter of epub.flow) {
                        const text = await this.getEpubChapter(epub, chapter);
                        if (text) result.content.push(text);
                    }

                    // 获取图片
                    for (const item of epub.flow) {
                        if (item.mediaType && item.mediaType.startsWith('image/')) {
                            const imageData = await this.getEpubImage(epub, item);
                            if (imageData) {
                                result.images.push({
                                    id: item.id,
                                    type: item.mediaType,
                                    data: imageData,
                                    chapter: item.chapter
                                });
                            }
                        }
                    }

                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });

            epub.on('error', reject);
            epub.parse();
        });
    }

    // 获取EPUB章节内容
    getEpubChapter(epub, chapter) {
        return new Promise((resolve, reject) => {
            epub.getChapter(chapter.id, (error, text) => {
                if (error) reject(error);
                else {
                    // 将HTML转换为纯文本
                    const content = text.replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                    resolve(content);
                }
            });
        });
    }

    // 获取EPUB图片
    getEpubImage(epub, item) {
        return new Promise((resolve, reject) => {
            epub.getImage(item.id, (error, data, mimeType) => {
                if (error) reject(error);
                else resolve(data);
            });
        });
    }

    // 读取PDF文件
    async readPdf(filePath) {
        const pdfjsLib = await this.initPdfLib();
        const data = await fs.readFile(filePath);
        const pdf = await pdfjsLib.getDocument(new Uint8Array(data)).promise;
        const result = {
            content: [],
            images: []
        };

        // 获取文本内容
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map(item => item.str)
                .join(' ')
                .trim();
            
            if (pageText) {
                result.content.push(pageText);
            }

            // 提取图片
            const images = await this.extractPdfPageImages(page, i);
            result.images.push(...images);
        }

        return result;
    }


    // 提取PDF页面中的图片
    async extractPdfPageImages(page, pageNum) {
        const images = [];
        const ops = await page.getOperatorList();
        const commonObjs = page.commonObjs;
        const imageCache = new Set();

        for (let i = 0; i < ops.fnArray.length; i++) {
            if (ops.fnArray[i] === pdfjsLib.OPS.paintImageXObject) {
                const imageRef = ops.argsArray[i][0];
                if (!imageCache.has(imageRef)) {
                    imageCache.add(imageRef);
                    const img = await this.getPdfImage(commonObjs, imageRef);
                    if (img) {
                        images.push({
                            page: pageNum,
                            data: img.data,
                            width: img.width,
                            height: img.height
                        });
                    }
                }
            }
        }

        return images;
    }

    // 获取PDF图片数据
    async getPdfImage(commonObjs, imageRef) {
        try {
            const imageObj = await commonObjs.get(imageRef);
            if (imageObj && imageObj.data) {
                return {
                    data: imageObj.data,
                    width: imageObj.width,
                    height: imageObj.height
                };
            }
        } catch (error) {
            console.error(`Error extracting PDF image: ${error}`);
        }
        return null;
    }
}

module.exports = new FileHandler();
