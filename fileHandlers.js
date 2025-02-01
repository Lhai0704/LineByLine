const fs = require('fs').promises;
const path = require('path');
const EPub = require('epub');

class FileHandler {
    constructor() {
        this.pdfjsLib = null;
    }

    async initPdfLib() {
        if (!this.pdfjsLib) {
            // 动态导入 pdf.js
            const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
            this.pdfjsLib = pdfjs;

            this.pdfjsLib.GlobalWorkerOptions.workerSrc = '../../../resources/pdf.worker.mjs';
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
        return content.split('\n').map(line => ({
            type: 'text',
            content: line.trim(),
            position: {}
        }));
    }
    

    async readPdf(filePath) {
        const pdfjsLib = await this.initPdfLib();
        const data = await fs.readFile(filePath);
        const pdf = await pdfjsLib.getDocument(new Uint8Array(data)).promise;
        
        // 用于存储所有内容（文本和图片）的数组
        const contentItems = [];
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            
            // 获取页面中的所有内容（文本和图片）
            const operatorList = await page.getOperatorList();
            const textContent = await page.getTextContent();
            
            let currentTextIndex = 0;
            const textItems = textContent.items;
            
            // 遍历页面操作列表，按顺序处理文本和图片
            for (let j = 0; j < operatorList.fnArray.length; j++) {
                const fn = operatorList.fnArray[j];
                
                // 处理文本
                if (fn === pdfjsLib.OPS.showText) {
                    if (currentTextIndex < textItems.length) {
                        const textItem = textItems[currentTextIndex];
                        contentItems.push({
                            type: 'text',
                            content: textItem.str.trim(),
                            position: {
                                page: i,
                                y: textItem.transform[5] // y坐标
                            }
                        });
                        currentTextIndex++;
                    }
                }
                // 处理图片
                else if (fn === pdfjsLib.OPS.paintImageXObject) {
                    const imageArgs = operatorList.argsArray[j];
                    const imageId = imageArgs[0];
                    try {
                        const image = await this.getPdfImage(page.objs, imageId);
                        if (image) {
                            contentItems.push({
                                type: 'image',
                                data: image.data,
                                width: image.width,
                                height: image.height,
                                position: {
                                    page: i,
                                    y: operatorList.argsArray[j-1]?.[5] || 0 // 尝试获取图片的y坐标
                                }
                            });
                        }
                    } catch (error) {
                        console.error('Error extracting image:', error);
                    }
                }
            }
        }
        
        // 按页码和位置排序
        contentItems.sort((a, b) => {
            if (a.position.page !== b.position.page) {
                return a.position.page - b.position.page;
            }
            return b.position.y - a.position.y; // PDF坐标系是从底部向上的
        });
        
        return contentItems;
    }

    async readEpub(filePath) {
        return new Promise((resolve, reject) => {
            const epub = new EPub(filePath);
            const contentItems = [];

            epub.on('end', async () => {
                try {
                    for (const chapter of epub.flow) {
                        if (chapter.mediaType && chapter.mediaType.startsWith('image/')) {
                            // 处理图片
                            const imageData = await this.getEpubImage(epub, chapter);
                            if (imageData) {
                                contentItems.push({
                                    type: 'image',
                                    data: imageData.data.toString('base64'),  // 转成 base64
                                    mediaType: imageData.mimeType,  // 保留 mimeType
                                    position: chapter.index
                                });
                            }
                        } else {
                            // 处理文本
                            const text = await this.getEpubChapter(epub, chapter);
                            if (text) {
                                contentItems.push({
                                    type: 'text',
                                    content: text,
                                    position: chapter.index
                                });
                            }
                        }
                    }
                    
                    // 按位置排序
                    contentItems.sort((a, b) => a.position - b.position);
                    
                    resolve(contentItems);
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
                if (error) {
                    reject(error);
                } else {
                    resolve({ data, mimeType });  // 返回完整信息
                }
            });
        });
    }

    

    // 提取PDF页面中的图片
    async extractPdfPageImages(page, pageNum) {
        const pdfjsLib = await this.initPdfLib();
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
