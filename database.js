const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 创建数据库连接
const db = new sqlite3.Database(path.join(__dirname, 'data.db'), (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to database');
  }
});

// 创建表
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original TEXT UNIQUE,
      translated TEXT
    )
  `);
});

// 获取翻译
function getTranslation(text) {
  return new Promise((resolve, reject) => {
    db.get('SELECT translated FROM translations WHERE original = ?', [text], (err, row) => {
      if (err) reject(err);
      resolve(row ? row.translated : null);
    });
  });
}

// 保存翻译
function saveTranslation(original, translated) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO translations (original, translated) 
      VALUES (?, ?) 
      ON CONFLICT(original) 
      DO UPDATE SET translated = excluded.translated
    `;
    
    db.run(sql, [original, translated], (err) => {
      if (err) reject(err);
      resolve();
    });
  });
}

module.exports = {
  db,
  getTranslation,
  saveTranslation
};
