// db.js — قاعدة بيانات SQLite بسيطة (ملف واحد على القرص)، كافية لمرحلة الـMVP.
// عند التوسع لاحقاً، يمكن استبدالها بـ PostgreSQL بنفس شكل الجداول تقريباً.

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'mutabiq.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password_hash TEXT,
    linkedin_id TEXT UNIQUE,
    name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    raw_text TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    resume_id INTEGER REFERENCES resumes(id),
    job_text TEXT,
    match_score INTEGER,
    result_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;
