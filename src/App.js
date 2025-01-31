import React, { useState } from 'react';
const { ipcRenderer } = window.require('electron');

function App() {
  const [lines, setLines] = useState([]);

  const handleFileSelect = async () => {
    const content = await ipcRenderer.invoke('select-file');
    setLines(content);
  };

  return (
    <div style={{ padding: '20px' }}>
      <button onClick={handleFileSelect}>
        选择文件
      </button>
      <div style={{ marginTop: '20px' }}>
        {lines.map((line, index) => (
          <div key={index} style={{ marginBottom: '10px' }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
