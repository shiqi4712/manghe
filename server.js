'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const requiredEnv = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'TOKEN_SECRET'];
for (const key of requiredEnv) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}
if (process.env.TOKEN_SECRET.length < 32) throw new Error('TOKEN_SECRET must contain at least 32 characters.');

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const prizeNames = ['珊瑚信号', '晴空飞船', '柠檬唱片', '莓果轨迹', '薄荷方程', '橘子频道', '银色月球', '午夜星愿'];

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+08:00',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined
});

if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const verifyLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const drawLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const adminLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });

function normalizeStudentId(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signToken(payload, ttlSeconds) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyToken(token, expectedType) {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', process.env.TOKEN_SECRET).update(body).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.type !== expectedType || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function studentAuth(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  const payload = verifyToken(token, 'student');
  if (!payload) return res.status(401).json({ error: 'STUDENT_SESSION_EXPIRED', message: '验证已过期，请重新输入姓名和学员 ID。' });
  req.student = payload;
  next();
}

function adminAuth(req, res, next) {
  const payload = verifyToken(req.cookies.admin_session, 'admin');
  if (!payload) return res.status(401).json({ error: 'ADMIN_AUTH_REQUIRED', message: '请先登录管理后台。' });
  req.admin = payload;
  next();
}

function drawPayload(row) {
  if (!row || row.prize_id === null || row.prize_id === undefined) return null;
  return {
    prizeId: Number(row.prize_id),
    prizeName: prizeNames[Number(row.prize_id)],
    drawnAt: row.drawn_at,
    redeemed: Boolean(row.redeemed_at),
    redeemedAt: row.redeemed_at
  };
}

async function addLog(connection, req, action, studentId, detail) {
  await connection.execute(
    'INSERT INTO admin_logs (admin_name, action, student_id, detail, ip_address) VALUES (?, ?, ?, ?, ?)',
    [req.admin?.name || 'system', action, studentId || null, detail || null, req.ip]
  );
}

app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected', time: new Date().toISOString() });
  } catch (error) { next(error); }
});

app.post('/api/student/verify', verifyLimiter, async (req, res, next) => {
  try {
    const studentId = normalizeStudentId(req.body.studentId);
    const studentName = normalizeName(req.body.studentName);
    if (!studentId || !studentName) return res.status(400).json({ error: 'INVALID_INPUT', message: '请输入姓名和学员 ID。' });

    const [rows] = await pool.execute(
      `SELECT s.student_id, s.student_name, s.class_name, s.is_active,
              d.prize_id, d.drawn_at, d.redeemed_at
         FROM students s
         LEFT JOIN draw_results d ON d.student_id = s.student_id
        WHERE s.student_id = ? AND s.deleted_at IS NULL LIMIT 1`,
      [studentId]
    );
    const student = rows[0];
    if (!student || normalizeName(student.student_name) !== studentName) {
      return res.status(404).json({ error: 'STUDENT_NOT_FOUND', message: '姓名或学员 ID 不正确，请检查后重试。' });
    }
    if (!student.is_active) return res.status(403).json({ error: 'STUDENT_DISABLED', message: '该学员 ID 已停用，请联系老师。' });

    const accessToken = signToken({ type: 'student', studentId }, 30 * 60);
    res.json({
      accessToken,
      student: { id: student.student_id, name: student.student_name, className: student.class_name },
      draw: drawPayload(student)
    });
  } catch (error) { next(error); }
});

app.post('/api/student/draw', drawLimiter, studentAuth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [students] = await connection.execute(
      'SELECT student_id, student_name, is_active, deleted_at FROM students WHERE student_id = ? FOR UPDATE',
      [req.student.studentId]
    );
    const student = students[0];
    if (!student || student.deleted_at || !student.is_active) {
      await connection.rollback();
      return res.status(403).json({ error: 'DRAW_NOT_ALLOWED', message: '该学员当前没有抽奖资格。' });
    }

    const [existing] = await connection.execute(
      'SELECT prize_id, drawn_at, redeemed_at FROM draw_results WHERE student_id = ? LIMIT 1',
      [student.student_id]
    );
    if (existing[0]) {
      await connection.commit();
      return res.status(409).json({ error: 'ALREADY_DRAWN', message: '每位学员只能抽取一次。', draw: drawPayload(existing[0]) });
    }

    const prizeId = crypto.randomInt(prizeNames.length);
    await connection.execute('INSERT INTO draw_results (student_id, prize_id) VALUES (?, ?)', [student.student_id, prizeId]);
    await addLog(connection, req, 'COMPLETE_DRAW', student.student_id, prizeNames[prizeId]);
    const [created] = await connection.execute('SELECT prize_id, drawn_at, redeemed_at FROM draw_results WHERE student_id = ?', [student.student_id]);
    await connection.commit();
    res.status(201).json({ draw: drawPayload(created[0]) });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      const [rows] = await pool.execute('SELECT prize_id, drawn_at, redeemed_at FROM draw_results WHERE student_id = ?', [req.student.studentId]);
      return res.status(409).json({ error: 'ALREADY_DRAWN', message: '每位学员只能抽取一次。', draw: drawPayload(rows[0]) });
    }
    next(error);
  } finally { connection.release(); }
});

app.post('/api/admin/login', adminLoginLimiter, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || '');
    if (!username || !password) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: '请输入管理员账号和密码。' });
    }

    const [rows] = await pool.execute(
      'SELECT username, display_name, password_hash, is_active FROM admin_users WHERE username = ? LIMIT 1',
      [username]
    );
    const admin = rows[0];
    const passwordMatches = admin ? await bcrypt.compare(password, admin.password_hash) : false;
    if (!admin || !admin.is_active || !passwordMatches) {
      return res.status(401).json({ error: 'INVALID_ADMIN_CREDENTIALS', message: '管理员账号或密码不正确。' });
    }

    const hours = Number(process.env.ADMIN_COOKIE_HOURS || 12);
    const token = signToken({ type: 'admin', username: admin.username, name: admin.display_name }, hours * 3600);
    await pool.execute('UPDATE admin_users SET last_login_at = NOW() WHERE username = ?', [admin.username]);
    res.cookie('admin_session', token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: hours * 3600 * 1000, path: '/' });
    res.json({ ok: true, admin: { username: admin.username, name: admin.display_name } });
  } catch (error) { next(error); }
});

app.post('/api/admin/logout', adminAuth, (req, res) => {
  res.clearCookie('admin_session', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/session', adminAuth, (req, res) => res.json({ authenticated: true, username: req.admin.username, name: req.admin.name }));

app.get('/api/admin/students', adminAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.student_id AS id, s.student_name AS name, s.class_name AS className,
              s.is_active AS isActive, d.prize_id AS prizeId, d.drawn_at AS drawnAt,
              d.redeemed_at AS redeemedAt
         FROM students s LEFT JOIN draw_results d ON d.student_id = s.student_id
        WHERE s.deleted_at IS NULL ORDER BY s.created_at DESC`
    );
    res.json({ students: rows.map(row => ({ ...row, isActive: Boolean(row.isActive), prizeName: row.prizeId === null ? null : prizeNames[row.prizeId], redeemed: Boolean(row.redeemedAt) })) });
  } catch (error) { next(error); }
});

app.post('/api/admin/students', adminAuth, async (req, res, next) => {
  const studentId = normalizeStudentId(req.body.studentId);
  const studentName = normalizeName(req.body.studentName);
  const className = normalizeName(req.body.className) || null;
  if (!studentId || !studentName) return res.status(400).json({ error: 'INVALID_INPUT', message: '学员 ID 和姓名为必填项。' });
  try {
    await pool.execute('INSERT INTO students (student_id, student_name, class_name) VALUES (?, ?, ?)', [studentId, studentName, className]);
    const connection = await pool.getConnection();
    try { await addLog(connection, req, 'CREATE_STUDENT', studentId, studentName); } finally { connection.release(); }
    res.status(201).json({ ok: true });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'STUDENT_EXISTS', message: '该学员 ID 已存在。' });
    next(error);
  }
});

app.post('/api/admin/students/import', adminAuth, async (req, res, next) => {
  const records = Array.isArray(req.body.records) ? req.body.records.slice(0, 2000) : [];
  if (!records.length) return res.status(400).json({ error: 'EMPTY_IMPORT', message: '没有可导入的数据。' });
  const connection = await pool.getConnection();
  let added = 0;
  let skipped = 0;
  try {
    await connection.beginTransaction();
    for (const record of records) {
      const studentId = normalizeStudentId(record.studentId);
      const studentName = normalizeName(record.studentName);
      const className = normalizeName(record.className) || null;
      if (!studentId || !studentName) { skipped += 1; continue; }
      const [result] = await connection.execute(
        `INSERT INTO students (student_id, student_name, class_name) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE student_id = student_id`,
        [studentId, studentName, className]
      );
      if (result.affectedRows === 1) added += 1; else skipped += 1;
    }
    await addLog(connection, req, 'IMPORT_STUDENTS', null, `added=${added}, skipped=${skipped}`);
    await connection.commit();
    res.json({ added, skipped });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

app.patch('/api/admin/students/:studentId/status', adminAuth, async (req, res, next) => {
  const studentId = normalizeStudentId(req.params.studentId);
  const isActive = Boolean(req.body.isActive);
  try {
    const [result] = await pool.execute('UPDATE students SET is_active = ? WHERE student_id = ? AND deleted_at IS NULL', [isActive, studentId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'STUDENT_NOT_FOUND', message: '未找到该学员 ID。' });
    const connection = await pool.getConnection();
    try { await addLog(connection, req, isActive ? 'ENABLE_STUDENT' : 'DISABLE_STUDENT', studentId, null); } finally { connection.release(); }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/api/admin/students/:studentId/reset', adminAuth, async (req, res, next) => {
  const studentId = normalizeStudentId(req.params.studentId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM draw_results WHERE student_id = ?', [studentId]);
    await addLog(connection, req, 'RESET_DRAW', studentId, null);
    await connection.commit();
    res.json({ ok: true });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

app.patch('/api/admin/students/:studentId/redeem', adminAuth, async (req, res, next) => {
  const studentId = normalizeStudentId(req.params.studentId);
  const redeemed = Boolean(req.body.redeemed);
  try {
    const [result] = await pool.execute(
      'UPDATE draw_results SET redeemed_at = ?, redeemed_by = ? WHERE student_id = ?',
      [redeemed ? new Date() : null, redeemed ? req.admin.name : null, studentId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'DRAW_NOT_FOUND', message: '该学员尚未抽取。' });
    const connection = await pool.getConnection();
    try { await addLog(connection, req, redeemed ? 'REDEEM_DRAW' : 'UNREDEEM_DRAW', studentId, null); } finally { connection.release(); }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.delete('/api/admin/students/:studentId', adminAuth, async (req, res, next) => {
  const studentId = normalizeStudentId(req.params.studentId);
  try {
    const [result] = await pool.execute('UPDATE students SET is_active = 0, deleted_at = NOW() WHERE student_id = ? AND deleted_at IS NULL', [studentId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'STUDENT_NOT_FOUND', message: '未找到该学员 ID。' });
    const connection = await pool.getConnection();
    try { await addLog(connection, req, 'DELETE_STUDENT', studentId, 'soft delete'); } finally { connection.release(); }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/api/admin/logs', adminAuth, async (req, res, next) => {
  try {
    const [logs] = await pool.query('SELECT admin_name AS admin, action, student_id AS studentId, detail, created_at AS createdAt FROM admin_logs ORDER BY id DESC LIMIT 300');
    res.json({ logs });
  } catch (error) { next(error); }
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: isProduction ? '1h' : 0 }));

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: '服务器暂时无法处理请求，请稍后重试。' });
});

async function start() {
  await pool.query('SELECT 1');
  app.listen(port, '127.0.0.1', () => console.log(`Surprise draw server listening on http://127.0.0.1:${port}`));
}

start().catch(error => {
  console.error('Unable to start server:', error);
  process.exit(1);
});
