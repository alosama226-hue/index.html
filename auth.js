// routes/auth.js — تسجيل حساب جديد وتسجيل الدخول بالبريد الإلكتروني وكلمة المرور

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

function issueToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// POST /api/auth/signup { email, password, name }
router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'هذا البريد الإلكتروني مسجّل مسبقاً' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = db
    .prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
    .run(email, passwordHash, name || null);

  const user = { id: result.lastInsertRowid, email, name };
  return res.status(201).json({ token: issueToken(user), user });
});

// POST /api/auth/login { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !user.password_hash) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }

  return res.json({ token: issueToken(user), user: { id: user.id, email: user.email, name: user.name } });
});

module.exports = router;
