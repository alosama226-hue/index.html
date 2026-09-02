// routes/analyze.js — يستقبل نص السيرة ووصف الوظيفة من الواجهة، ويستدعي Claude API من الخادم
// (وليس من المتصفح مباشرة) حتى لا يظهر مفتاح الـAPI للمستخدم أبداً.

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

function getUserIdFromAuthHeader(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET).id;
  } catch {
    return null;
  }
}

router.post('/', async (req, res) => {
  const { cvText, jobText } = req.body || {};
  if (!cvText || !jobText) {
    return res.status(400).json({ error: 'نص السيرة الذاتية ووصف الوظيفة مطلوبان' });
  }

  const prompt =
    'You are a resume-matching engine. Compare the resume and job description below and respond with ONLY a JSON object, no markdown fences, no commentary, in exactly this shape:\n' +
    '{"match_score": <integer 0-100>, "matched_skills": [<up to 5 short strings, same language as the input text>], "missing_skills": [<up to 5 short strings, same language as the input text>], "suggestions": [<up to 3 short actionable strings, same language as the input text>]}\n\n' +
    `Resume:\n"""${cvText}"""\n\n` +
    `Job description:\n"""${jobText}"""`;

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    const text = response.data.content.map((block) => block.text || '').join('').trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // حفظ النتيجة إذا كان المستخدم مسجّل دخول (اختياري)
    const userId = getUserIdFromAuthHeader(req);
    if (userId) {
      const resumeInsert = db
        .prepare('INSERT INTO resumes (user_id, raw_text) VALUES (?, ?)')
        .run(userId, cvText);
      db.prepare(
        'INSERT INTO matches (user_id, resume_id, job_text, match_score, result_json) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, resumeInsert.lastInsertRowid, jobText, parsed.match_score || 0, JSON.stringify(parsed));
    }

    return res.json(parsed);
  } catch (err) {
    console.error('Analyze error:', err.response ? err.response.data : err.message);
    return res.status(502).json({ error: 'تعذّر إتمام التحليل، حاول مرة أخرى.' });
  }
});

module.exports = router;
