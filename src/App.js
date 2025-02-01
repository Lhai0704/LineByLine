import React, { useState } from 'react';
const { ipcRenderer } = window.require('electron');

// 常见的尊称和后缀
const TITLES = [
    'M(?:r|rs|s)\\.',  // Mr., Mrs., Ms.
    'D(?:r)\\.',       // Dr.
    'P(?:rof)\\.',     // Prof.
    'R(?:ev)\\.',      // Rev.
    'H(?:on)\\.',      // Hon.
    'J(?:r)\\.',       // Jr.
    'S(?:r|t)\\.',     // Sr., St.
    'U\\.S\\.'         // U.S.
];

function App() {
    const [contentItems, setContentItems] = useState([]);
    const [translations, setTranslations] = useState({});
    const [currentBookId, setCurrentBookId] = useState(null);

    // 选择文件并处理内容
    const handleFileSelect = async () => {
        try {
            const result = await ipcRenderer.invoke('select-file');
            if (!result) return;

            const { bookId, contentItems } = result;
            setCurrentBookId(bookId);

            // 处理文本内容，将长文本分割成句子
            const processedItems = [];
            let sentenceIndex = 0;

            for (const item of contentItems) {
                if (item.type === 'text') {
                    const text = item.content;
                    const sentenceEndRegex = new RegExp(
                        `(?<!${TITLES.join('|')}\\s?)(?<=[。！？.!?])\\s+`,
                        'gi'
                    );

                    const sentences = text
                        .split(sentenceEndRegex)
                        .map(s => s.trim())
                        .filter(s => s.length > 0);

                    sentences.forEach(sentence => {
                        processedItems.push({
                            type: 'text',
                            content: sentence,
                            position: item.position,
                            sentenceIndex: sentenceIndex++
                        });
                    });
                } else if (item.type === 'image') {
                    processedItems.push(item);
                }
            }

            setContentItems(processedItems);

            // 获取已有的翻译
            const savedTranslations = await ipcRenderer.invoke('get-book-translations', bookId);
            if (savedTranslations) {
                const translationsMap = {};
                savedTranslations.forEach(item => {
                    translationsMap[item.original_text] = item.translated_text;
                });
                setTranslations(translationsMap);
            }
        } catch (error) {
            console.error("读取文件失败:", error);
        }
    };

    // 翻译单句
    const translateSentence = async (sentence, index) => {
        try {
            if (translations[sentence]) return;

            const translatedText = await ipcRenderer.invoke('translate-text', {
                bookId: currentBookId,
                sentenceIndex: index,
                text: sentence
            });

            if (translatedText) {
                setTranslations(prev => ({
                    ...prev,
                    [sentence]: translatedText
                }));
            }
        } catch (error) {
            console.error("翻译失败:", error);
        }
    };

    // 批量翻译当前页面
    const translateCurrentPage = async () => {
        try {
            const untranslatedSentences = sentences.filter(s => !translations[s]);
            if (untranslatedSentences.length === 0) return;

            // 显示翻译进度
            for (let i = 0; i < untranslatedSentences.length; i++) {
                const sentence = untranslatedSentences[i];
                await translateSentence(sentence, sentences.indexOf(sentence));
            }
        } catch (error) {
            console.error("批量翻译失败:", error);
        }
    };

    // 渲染内容项（文本或图片）
    const renderContentItem = (item, index) => {
        if (item.type === 'image') {
            return (
                <div key={`image-${index}`} className="image-container">
                    {/* <img
                        src={`data:${item.mediaType || 'image/jpeg'};base64,${item.data.toString('base64')}`}
                        alt={`Image ${index}`}
                        style={{ maxWidth: '100%', height: 'auto' }}
                    /> */}
                    <img src={`data:${item.mediaType};base64,${item.data}`} alt="EPUB Image" />

                </div>
            );
        } else {
            const sentence = item.content;
            return (
                <div key={`text-${index}`} className="sentence-container">
                    <p className="original-text">{sentence}</p>
                    <button 
                        onClick={() => translateSentence(sentence, item.sentenceIndex)}
                        disabled={!!translations[sentence]}
                    >
                        翻译
                    </button>
                    {translations[sentence] && (
                        <p className="translated-text">{translations[sentence]}</p>
                    )}
                </div>
            );
        }
    };

    // 图片查看组件
    const ImageViewer = ({ images }) => {
        if (!images || images.length === 0) return null;

        return (
            <div className="images-container">
                {images.map((img, index) => (
                    <div key={index} className="image-item">
                        <img
                            src={`data:${img.type || 'image/jpeg'};base64,${img.data.toString('base64')}`}
                            alt={`Page ${img.page || index + 1}`}
                        />
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="app-container">
            <div className="toolbar">
                <button onClick={handleFileSelect}>选择文件</button>
            </div>

            <div className="content-container">
                {contentItems.map((item, index) => renderContentItem(item, index))}
            </div>
        </div>
    );
}

export default App;
