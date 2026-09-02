// routes/linkedin.js — تسجيل الدخول عبر "Sign in with LinkedIn using OpenID Connect"
//
// يعطي فقط: الاسم، البريد، والصورة (الأساسية المجانية بدون اعتماد Partner).
// لا يعطي خبرات أو مهارات أو تعليم — هذه تحتاج اعتماد Partner Program من لينكدإن (راجع الخطة التقنية).
//
// الخطوات: 1) توجيه المستخدم لصفحة تسجيل الدخول في لينكدإن
//          2) لينكدإن يرجّعه لرابط الـcallback مع "code"
//          3) نستبدل الـcode بـ access_token
//          4) نجلب بيانات المستخدم الأساسية من /v2/userinfo
//          5) ننشئ حساب أو نسجّل دخول المستخدم الموجود، ونصدر JWT خاص بمنصتنا

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

function issueToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// الخطوة 1: توجيه المستخدم لتسجيل الدخول عبر لينكدإن
router.get('/', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('li_oauth_state', state, { httpOnly: true, maxAge: 5 * 60 * 1000, sameSite: 'lax' });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
    state,
    scope: 'openid profile email'
  });

  res.redirect(`${AUTH_URL}?${params.toString()}`);
});

// الخطوة 2: لينكدإن يرجّع المستخدم هنا بعد الموافقة
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;
  const savedState = req.cookies ? req.cookies.li_oauth_state : null;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(errorDescription || error)}`);
  }
  if (!code || !state || state !== savedState) {
    return res.status(400).send('فشل التحقق من الطلب (state mismatch) — حاول تسجيل الدخول مرة أخرى.');
  }

  try {
    // الخطوة 3: استبدال الـcode بـ access_token
    const tokenResponse = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;

    // الخطوة 4: جلب البيانات الأساسية للمستخدم
    const profileResponse = await axios.get(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const { sub: linkedinId, email, name } = profileResponse.data;

    // الخطوة 5: إيجاد المستخدم أو إنشاؤه، ثم إصدار رمز دخول خاص بمنصتنا
    let user = db.prepare('SELECT * FROM users WHERE linkedin_id = ?').get(linkedinId);
    if (!user && email) {
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    }

    if (user) {
      db.prepare('UPDATE users SET linkedin_id = ?, name = COALESCE(name, ?) WHERE id = ?')
        .run(linkedinId, name, user.id);
    } else {
      const result = db
        .prepare('INSERT INTO users (email, linkedin_id, name) VALUES (?, ?, ?)')
        .run(email || null, linkedinId, name || null);
      user = { id: result.lastInsertRowid, email, name };
    }

    const token = issueToken(user);
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('LinkedIn OAuth error:', err.response ? err.response.data : err.message);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=linkedin_auth_failed`);
  }
});

module.exports = router;
