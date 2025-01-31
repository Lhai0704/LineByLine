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
    const [lines, setLines] = useState([]);
    const [translations, setTranslations] = useState({});

    // 选择文件，将每句话分割开
    const handleFileSelect = async () => {
        try {
            const fileContent = await ipcRenderer.invoke('select-file');

            if (!fileContent || fileContent.length === 0) {
                console.warn("文件内容为空");
                return;
            }

            const text = fileContent.join(' ').replace(/\n/g, ' '); // 合并所有行，并替换换行符为空格
            
            const sentenceEndRegex = new RegExp(
                `(?<!${TITLES.join('|')}\\s?)` +  // 确保不在尊称之后（允许尊称后有空格）
                `(?<=[。！？.!?])\\s+`,             // 句子结束标点后的空格
                'gi' // 添加 'i' 标志，大小写不敏感
            );

            // 按标点符号拆分
            const sentences = text
                .split(sentenceEndRegex) // 忽略常见缩写
                .map(s => s.trim())
                .filter(s => s.length > 0);

            setLines(sentences);
        } catch (error) {
            console.error("读取文件失败:", error);
        }
    };


    const translateLine = async (line) => {
        const translated = await ipcRenderer.invoke('translate-text', line);
        setTranslations((prev) => ({ ...prev, [line]: translated }));
    };

    return (
        <div style={{ padding: '20px' }}>
            <button onClick={handleFileSelect}>选择文件</button>
            <div style={{ marginTop: '20px' }}>
                {lines.map((line, index) => (
                    <div key={index} style={{ marginBottom: '15px' }}>
                        <p>{line}</p>
                        <button onClick={() => translateLine(line)}>翻译</button>
                        <p style={{ color: 'gray' }}>{translations[line]}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default App;
