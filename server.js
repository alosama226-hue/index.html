// server.js — نقطة انطلاق الخادم

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const linkedinRoutes = require('./routes/linkedin');
const analyzeRoutes = require('./routes/analyze');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/auth/linkedin', linkedinRoutes);
app.use('/api/analyze', analyzeRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`مُطابِق backend يعمل على http://localhost:${PORT}`);
});
