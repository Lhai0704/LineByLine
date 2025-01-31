import React, { useState } from 'react';
const { ipcRenderer } = window.require('electron');

function App() {
  const [lines, setLines] = useState([]);
  const [translations, setTranslations] = useState({});

  const handleFileSelect = async () => {
    const content = await ipcRenderer.invoke('select-file');
    setLines(content);
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
          <div key={index} style={{ marginBottom: '10px' }}>
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
