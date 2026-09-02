// netlify/functions/analyze.js
// دالة سيرفرلس (بدون خادم تديره أنت) — Netlify تشغّلها تلقائياً عند كل طلب،
// وتختفي بعدها. مفتاح Anthropic يبقى محفوظ في إعدادات Netlify، ما يظهر أبداً للمتصفح.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let cvText, jobText;
  try {
    const body = JSON.parse(event.body || '{}');
    cvText = body.cvText;
    jobText = body.jobText;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'طلب غير صالح' }) };
  }

  if (!cvText || !jobText) {
    return { statusCode: 400, body: JSON.stringify({ error: 'نص السيرة الذاتية ووصف الوظيفة مطلوبان' }) };
  }

  const prompt =
    'You are a resume-matching engine. Compare the resume and job description below and respond with ONLY a JSON object, no markdown fences, no commentary, in exactly this shape:\n' +
    '{"match_score": <integer 0-100>, "matched_skills": [<up to 5 short strings, same language as the input text>], "missing_skills": [<up to 5 short strings, same language as the input text>], "suggestions": [<up to 3 short actionable strings, same language as the input text>]}\n\n' +
    `Resume:\n"""${cvText}"""\n\n` +
    `Job description:\n"""${jobText}"""`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = (data.content || []).map((block) => block.text || '').join('').trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    console.error('Analyze function error:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'تعذّر إتمام التحليل، حاول مرة أخرى.' }) };
  }
};
