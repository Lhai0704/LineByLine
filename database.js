// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

class Database {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'data.db'), (err) => {
            if (err) {
                console.error('Database connection error:', err);
            } else {
                console.log('Connected to database');
                this.initializeTables();
            }
        });
    }

    // 初始化数据库表
    async initializeTables() {
        const queries = [
            `CREATE TABLE IF NOT EXISTS books (
                book_id TEXT PRIMARY KEY,
                title TEXT,
                path TEXT,
                last_read INTEGER,
                format TEXT,
                current_position INTEGER DEFAULT 0
            )`,
            `CREATE TABLE IF NOT EXISTS translations (
                book_id TEXT,
                sentence_index INTEGER,
                original_text TEXT,
                translated_text TEXT,
                PRIMARY KEY (book_id, sentence_index),
                FOREIGN KEY (book_id) REFERENCES books(book_id)
            )`
        ];

        for (const query of queries) {
            await this.run(query);
        }
    }

    // 生成书籍ID（使用文件路径的哈希值）
    generateBookId(filePath) {
        return crypto.createHash('md5').update(filePath).digest('hex');
    }

    // 添加或更新书籍信息
    async addBook(filePath, title, format) {
        const bookId = this.generateBookId(filePath);
        const query = `
            INSERT INTO books (book_id, title, path, format, last_read)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(book_id) 
            DO UPDATE SET last_read = ?, title = ?
        `;
        const now = Date.now();
        await this.run(query, [bookId, title, filePath, format, now, now, title]);
        return bookId;
    }

    // 获取书籍信息
    async getBook(bookId) {
        return await this.get('SELECT * FROM books WHERE book_id = ?', [bookId]);
    }

    // 获取所有书籍
    async getAllBooks() {
        return await this.all('SELECT * FROM books ORDER BY last_read DESC');
    }

    // 更新阅读进度
    async updateReadingProgress(bookId, position) {
        await this.run(
            'UPDATE books SET current_position = ?, last_read = ? WHERE book_id = ?',
            [position, Date.now(), bookId]
        );
    }

    // 批量保存翻译
    async saveTranslations(bookId, translations) {
        const query = `
            INSERT INTO translations (book_id, sentence_index, original_text, translated_text)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(book_id, sentence_index)
            DO UPDATE SET translated_text = excluded.translated_text
        `;

        const stmt = this.db.prepare(query);
        translations.forEach((trans, index) => {
            stmt.run([bookId, index, trans.original, trans.translated]);
        });
        stmt.finalize();
    }

    // 获取书籍的所有翻译
    async getBookTranslations(bookId) {
        return await this.all(
            'SELECT * FROM translations WHERE book_id = ? ORDER BY sentence_index',
            [bookId]
        );
    }

    // 执行数据库查询的辅助方法
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

module.exports = new Database();
