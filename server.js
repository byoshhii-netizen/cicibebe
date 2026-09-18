const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const multer = require('multer');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

function generateRankTable(step = 12, totalRanks = 100) {
  const icons = [
    'fas fa-seedling', 'fas fa-leaf', 'fas fa-clover', 'fas fa-spa', 'fas fa-sun',
    'fas fa-moon', 'fas fa-star', 'fas fa-gem', 'fas fa-bolt', 'fas fa-fire',
    'fas fa-crown', 'fas fa-trophy', 'fas fa-medal', 'fas fa-shield-halved', 'fas fa-feather',
    'fas fa-wand-magic-sparkles', 'fas fa-heart', 'fas fa-rocket', 'fas fa-satellite', 'fas fa-dragon'
  ];
  const table = [];

  for (let index = 0; index < totalRanks; index += 1) {
    const threshold = index === 0 ? 0 : index * step;
    const label = index === 0 ? '1. Başlangıç' : `Rütbe ${index + 1}`;
    const icon = icons[Math.min(icons.length - 1, Math.floor(index / 10))];
    table.push({
      id: index + 1,
      title: label,
      label,
      icon,
      threshold,
      color: index % 2 === 0 ? '#f9d5ff' : '#dfe5ff'
    });
  }

  return table;
}

function getDefaultCicibebeSettings() {
  const rankStep = 12;
  return {
    title: 'CiciBebe',
    subtitle: '',
    rankStep,
    backgroundColor: '#2a0d35',
    ranks: generateRankTable(rankStep, 100),
    buttons: [
      {
        id: 'belinay',
        label: 'Belinay',
        emoji: '✨',
        image: '',
        color: '#f9d5ff',
        count: 0,
        lastClickedAt: null
      },
      {
        id: 'iso',
        label: 'İso',
        emoji: '💫',
        image: '',
        color: '#dfe5ff',
        count: 0,
        lastClickedAt: null
      }
    ],
    lastClicked: {
      buttonId: null,
      label: null,
      time: null
    }
  };
}

function normalizePlayerName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/[^a-z]/g, '');
}

function getCicibebeButtonByName(settings, name) {
  const normalized = normalizePlayerName(name);
  return (settings.buttons || []).find((button) => normalizePlayerName(button.id) === normalized || normalizePlayerName(button.label) === normalized) || null;
}

function readCicibebeSettings() {
  const filePath = path.join(dataDir, 'cicibebe-settings.json');
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(getDefaultCicibebeSettings(), null, 2));
    return getDefaultCicibebeSettings();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const defaults = getDefaultCicibebeSettings();
    const rankStep = Number(parsed.rankStep) > 0 ? Number(parsed.rankStep) : defaults.rankStep;
    const ranks = Array.isArray(parsed.ranks) && parsed.ranks.length > 0
      ? parsed.ranks.map((rank, index) => ({
          ...defaults.ranks[index],
          ...rank,
          id: rank.id || index + 1,
          threshold: Number.isFinite(Number(rank.threshold)) ? Math.max(0, Number(rank.threshold)) : index * rankStep,
          label: rank.label || defaults.ranks[index]?.label || (index === 0 ? '1. Başlangıç' : `Rütbe ${index + 1}`),
          icon: rank.icon || defaults.ranks[index]?.icon || '✨'
        }))
      : generateRankTable(rankStep, 100);

    return {
      ...defaults,
      ...parsed,
      subtitle: '',
      rankStep,
      ranks,
      backgroundColor: /^#[0-9a-f]{6}$/i.test(parsed.backgroundColor) ? parsed.backgroundColor : defaults.backgroundColor,
      buttons: Array.isArray(parsed.buttons) && parsed.buttons.length >= 2
        ? parsed.buttons.map((button, index) => ({
            ...(defaults.buttons[index] || {
              id: `kisi-${index + 1}`,
              label: `Kişi ${index + 1}`,
              emoji: '💖',
              color: '#f9d5ff',
              count: 0,
              lastClickedAt: null
            }),
            ...button,
            id: button.id || `kisi-${index + 1}`,
            label: button.label || `Kişi ${index + 1}`,
            image: button.image || '',
            emoji: button.emoji || '💖',
            count: Number(button.count) || 0,
            lastClickedAt: button.lastClickedAt || null
          }))
        : defaults.buttons,
      lastClicked: parsed.lastClicked || defaults.lastClicked
    };
  } catch (error) {
    fs.writeFileSync(filePath, JSON.stringify(getDefaultCicibebeSettings(), null, 2));
    return getDefaultCicibebeSettings();
  }
}

function writeCicibebeSettings(settings) {
  const filePath = path.join(dataDir, 'cicibebe-settings.json');
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
  return settings;
}

function readCicibebeAuditLog() {
  const filePath = path.join(dataDir, 'cicibebe-audit.json');
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ entries: [] }, null, 2));
    return { entries: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed.entries) ? { entries: parsed.entries } : { entries: [] };
  } catch (error) {
    fs.writeFileSync(filePath, JSON.stringify({ entries: [] }, null, 2));
    return { entries: [] };
  }
}

function writeCicibebeAuditLog(entries) {
  const filePath = path.join(dataDir, 'cicibebe-audit.json');
  fs.writeFileSync(filePath, JSON.stringify({ entries }, null, 2));
}

function readCicibebeNotes() {
  const filePath = path.join(dataDir, 'cicibebe-notes.json');
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ notes: [] }, null, 2));
    return { notes: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed.notes) ? { notes: parsed.notes } : { notes: [] };
  } catch (error) {
    fs.writeFileSync(filePath, JSON.stringify({ notes: [] }, null, 2));
    return { notes: [] };
  }
}

function writeCicibebeNotes(notes) {
  const filePath = path.join(dataDir, 'cicibebe-notes.json');
  fs.writeFileSync(filePath, JSON.stringify({ notes }, null, 2));
}

function getButtonRankState(buttonCount, settings = null) {
  const resolved = settings || readCicibebeSettings();
  const rankTable = Array.isArray(resolved.ranks) && resolved.ranks.length ? resolved.ranks : generateRankTable(resolved.rankStep || 12, 100);
  let currentRank = rankTable[0];
  let nextRank = rankTable[1] || rankTable[rankTable.length - 1];

  for (let index = rankTable.length - 1; index >= 0; index -= 1) {
    if (buttonCount >= Number(rankTable[index].threshold)) {
      currentRank = rankTable[index];
      nextRank = rankTable[Math.min(index + 1, rankTable.length - 1)] || rankTable[rankTable.length - 1];
      break;
    }
  }

  const currentIndex = rankTable.findIndex((rank) => rank.id === currentRank.id);
  const progressBase = nextRank.threshold - currentRank.threshold || 1;
  const progress = Math.min(100, Math.max(0, ((buttonCount - currentRank.threshold) / progressBase) * 100));
  const remaining = Math.max(0, nextRank.threshold - buttonCount);

  return {
    currentRank,
    nextRank,
    currentIndex: currentIndex >= 0 ? currentIndex + 1 : 1,
    totalRanks: rankTable.length,
    progress,
    remaining,
    hasNextRank: nextRank && nextRank.id !== currentRank.id
  };
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cicibebe.html'));
});

app.use(express.static('public'));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Çok fazla deneme. Lütfen daha sonra tekrar deneyin.' }
});

// Railway Volume veya lokal data klasörü
// Railway'de RAILWAY_VOLUME_MOUNT_PATH env var set edilir
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'data')
  : path.join(__dirname, 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Veritabanı bağlantısı
const databaseUrl = process.env.DATABASE_URL;
let db;
let isPostgres = false;

function normalizeSqlForPostgres(sql) {
  let normalized = sql;
  normalized = normalized.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY');
  normalized = normalized.replace(/BOOLEAN DEFAULT 0/gi, 'BOOLEAN DEFAULT FALSE');
  normalized = normalized.replace(/BOOLEAN DEFAULT 1/gi, 'BOOLEAN DEFAULT TRUE');
  normalized = normalized.replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/gi, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
  normalized = normalized.replace(/EDITED BOOLEAN DEFAULT 0/gi, 'EDITED BOOLEAN DEFAULT FALSE');
  normalized = normalized.replace(/read BOOLEAN DEFAULT 0/gi, 'read BOOLEAN DEFAULT FALSE');
  normalized = normalized.replace(/notifications BOOLEAN DEFAULT 1/gi, 'notifications BOOLEAN DEFAULT TRUE');
  normalized = normalized.replace(/sound BOOLEAN DEFAULT 1/gi, 'sound BOOLEAN DEFAULT TRUE');
  normalized = normalized.replace(/CREATE TABLE IF NOT EXISTS/gi, 'CREATE TABLE IF NOT EXISTS');
  return normalized;
}

function postgresizeQuery(sql, params = []) {
  let index = 0;
  const text = sql.replace(/\?/g, () => `$${++index}`);
  return { text, values: params };
}

if (databaseUrl) {
  isPostgres = true;
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.RAILWAY_ENV ? { rejectUnauthorized: false } : false
  });
  db = pool;
  console.log('📊 Veritabanı: PostgreSQL via DATABASE_URL');
} else {
  const dbPath = path.join(dataDir, 'teatube.db');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Veritabanı bağlantı hatası:', err);
      process.exit(1);
    }
    console.log(`📊 Veritabanı: ${dbPath}`);
  });
}

function dbRun(sql, params = []) {
  if (isPostgres) {
    const safeSql = normalizeSqlForPostgres(sql);
    const { text, values } = postgresizeQuery(safeSql, params);
    return db.query(text, values).then((result) => {
      const lastRow = result.rows && result.rows[0];
      const lastId = result.rows && result.rows.length ? (lastRow.id || result.rowCount || null) : null;
      return { lastID: lastId, changes: result.rowCount || 0, rowCount: result.rowCount || 0 };
    });
  }

  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  if (isPostgres) {
    const safeSql = normalizeSqlForPostgres(sql);
    const { text, values } = postgresizeQuery(safeSql, params);
    return db.query(text, values).then((result) => result.rows[0] || null);
  }

  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  if (isPostgres) {
    const safeSql = normalizeSqlForPostgres(sql);
    const { text, values } = postgresizeQuery(safeSql, params);
    return db.query(text, values).then((result) => result.rows || []);
  }

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initializeDatabase() {
  if (isPostgres) {
    const tableDefinitions = [
      `CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        display_name TEXT,
        avatar TEXT,
        status TEXT DEFAULT 'offline',
        bio TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS channels (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT DEFAULT 'text',
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        type TEXT DEFAULT 'text',
        attachment TEXT,
        reply_to INTEGER,
        edited BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (channel_id) REFERENCES channels(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (reply_to) REFERENCES messages(id)
      )`,
      `CREATE TABLE IF NOT EXISTS direct_messages (
        id SERIAL PRIMARY KEY,
        from_user_id INTEGER NOT NULL,
        to_user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        type TEXT DEFAULT 'text',
        attachment TEXT,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_user_id) REFERENCES users(id),
        FOREIGN KEY (to_user_id) REFERENCES users(id)
      )`,
      `CREATE TABLE IF NOT EXISTS channel_members (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (channel_id) REFERENCES channels(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(channel_id, user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS reactions (
        id SERIAL PRIMARY KEY,
        message_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        emoji TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(message_id, user_id, emoji)
      )`,
      `CREATE TABLE IF NOT EXISTS user_settings (
        user_id INTEGER PRIMARY KEY,
        theme TEXT DEFAULT 'dark',
        notifications BOOLEAN DEFAULT TRUE,
        sound BOOLEAN DEFAULT TRUE,
        language TEXT DEFAULT 'tr',
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      `CREATE TABLE IF NOT EXISTS follows (
        id SERIAL PRIMARY KEY,
        follower_id INTEGER NOT NULL,
        following_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (follower_id) REFERENCES users(id),
        FOREIGN KEY (following_id) REFERENCES users(id),
        UNIQUE(follower_id, following_id)
      )`,
      `CREATE TABLE IF NOT EXISTS blocks (
        id SERIAL PRIMARY KEY,
        blocker_id INTEGER NOT NULL,
        blocked_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (blocker_id) REFERENCES users(id),
        FOREIGN KEY (blocked_id) REFERENCES users(id),
        UNIQUE(blocker_id, blocked_id)
      )`
    ];

    for (const statement of tableDefinitions) {
      await db.query(statement).catch(() => {});
    }

    const channel = await dbGet('SELECT id FROM channels WHERE name = ?', ['genel']);
    if (!channel) {
      await dbRun('INSERT INTO channels (name, description, type) VALUES (?, ?, ?)', ['genel', 'Genel sohbet kanalı', 'text']);
    }
    return;
  }

  db.serialize(() => {
    db.run('PRAGMA journal_mode = WAL');

    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT,
      avatar TEXT,
      status TEXT DEFAULT 'offline',
      bio TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'text',
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      attachment TEXT,
      reply_to INTEGER,
      edited BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (reply_to) REFERENCES messages(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS direct_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      attachment TEXT,
      read BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (from_user_id) REFERENCES users(id),
      FOREIGN KEY (to_user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS channel_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(channel_id, user_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES messages(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(message_id, user_id, emoji)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER PRIMARY KEY,
      theme TEXT DEFAULT 'dark',
      notifications BOOLEAN DEFAULT 1,
      sound BOOLEAN DEFAULT 1,
      language TEXT DEFAULT 'tr',
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS follows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follower_id INTEGER NOT NULL,
      following_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (follower_id) REFERENCES users(id),
      FOREIGN KEY (following_id) REFERENCES users(id),
      UNIQUE(follower_id, following_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blocker_id INTEGER NOT NULL,
      blocked_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (blocker_id) REFERENCES users(id),
      FOREIGN KEY (blocked_id) REFERENCES users(id),
      UNIQUE(blocker_id, blocked_id)
    )`);

    db.get('SELECT id FROM channels WHERE name = ?', ['genel'], (err, row) => {
      if (!row) {
        db.run('INSERT INTO channels (name, description, type) VALUES (?, ?, ?)',
          ['genel', 'Genel sohbet kanalı', 'text']);
      }
    });
  });
}

initializeDatabase().catch((err) => {
  console.error('Veritabanı kurulumu hatası:', err);
  process.exit(1);
});

// Multer yapılandırması
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExt = /\.(jpeg|jpg|png|gif|webp|mp4|webm|pdf|doc|docx|txt)$/i;
    const allowedMime = /^(image\/|video\/(mp4|webm)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|text\/plain)/;
    if (allowedExt.test(path.extname(file.originalname)) || allowedMime.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Geçersiz dosya türü!'));
    }
  }
});

// ── ROUTES ──────────────────────────────────────────────

// Kayıt
app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password, display_name } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Tüm alanlar gereklidir' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Şifre en az 4 karakter olmalı' });
    }
    const existing = await dbGet(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username.trim(), email.trim()]
    );
    if (existing) {
      return res.status(409).json({ error: 'Bu kullanıcı adı veya e-posta zaten kullanılıyor' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await dbRun(
      'INSERT INTO users (username, email, password, display_name) VALUES (?, ?, ?, ?)',
      [username.trim(), email.trim(), hashedPassword, (display_name || username).trim()]
    );
    await dbRun('INSERT INTO user_settings (user_id) VALUES (?)', [result.lastID]);
    const genelChannel = await dbGet('SELECT id FROM channels WHERE name = ?', ['genel']);
    if (genelChannel) {
      await dbRun(
        'INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, ?)',
        [genelChannel.id, result.lastID, 'member']
      );
    }
    res.json({ success: true, userId: result.lastID, message: 'Kayıt başarılı' });
  } catch (error) {
    console.error('Kayıt hatası:', error);
    res.status(500).json({ error: 'Kayıt başarısız: ' + error.message });
  }
});

// Giriş
app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await dbGet('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
    if (!user) return res.status(401).json({ error: 'Kullanıcı bulunamadı' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Hatalı şifre' });

    await dbRun('UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?', ['online', user.id]);
    delete user.password;
    res.json({ success: true, user, message: 'Giriş başarılı' });
  } catch (error) {
    console.error('Giriş hatası:', error);
    res.status(500).json({ error: 'Giriş başarısız' });
  }
});

// Çıkış
app.post('/api/logout/:userId', async (req, res) => {
  try {
    await dbRun('UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?', ['offline', req.params.userId]);
    res.json({ success: true, message: 'Çıkış başarılı' });
  } catch (error) {
    console.error('Çıkış hatası:', error);
    res.status(500).json({ error: 'Çıkış başarısız' });
  }
});

// Kullanıcı profili
app.get('/api/users/:userId', async (req, res) => {
  try {
    const user = await dbGet(
      'SELECT id, username, email, display_name, avatar, status, bio, created_at, last_seen FROM users WHERE id = ?',
      [req.params.userId]
    );
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json(user);
  } catch (error) {
    console.error('Profil hatası:', error);
    res.status(500).json({ error: 'Profil yüklenemedi' });
  }
});

// Profil güncelleme
app.put('/api/users/:userId', async (req, res) => {
  try {
    const { display_name, bio, avatar } = req.body;
    await dbRun('UPDATE users SET display_name = ?, bio = ?, avatar = ? WHERE id = ?',
      [display_name, bio, avatar, req.params.userId]);
    res.json({ success: true, message: 'Profil güncellendi' });
  } catch (error) {
    console.error('Profil güncelleme hatası:', error);
    res.status(500).json({ error: 'Profil güncellenemedi' });
  }
});

// Tüm kullanıcılar
app.get('/api/users', async (req, res) => {
  try {
    const users = await dbAll('SELECT id, username, display_name, avatar, status, last_seen FROM users ORDER BY username');
    res.json(users);
  } catch (error) {
    console.error('Kullanıcı listesi hatası:', error);
    res.status(500).json({ error: 'Kullanıcılar yüklenemedi' });
  }
});

// Kanallar
app.get('/api/channels', async (req, res) => {
  try {
    const channels = await dbAll(`
      SELECT c.*, u.username as creator_name,
             (SELECT COUNT(*) FROM channel_members WHERE channel_id = c.id) as member_count
      FROM channels c
      LEFT JOIN users u ON c.created_by = u.id
      ORDER BY c.created_at DESC
    `);
    res.json(channels);
  } catch (error) {
    console.error('Kanal listesi hatası:', error);
    res.status(500).json({ error: 'Kanallar yüklenemedi' });
  }
});

// Kanal oluştur
app.post('/api/channels', async (req, res) => {
  try {
    const { name, description, type, created_by } = req.body;
    const result = await dbRun(
      'INSERT INTO channels (name, description, type, created_by) VALUES (?, ?, ?, ?)',
      [name, description, type || 'text', created_by]
    );
    await dbRun('INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, ?)',
      [result.lastID, created_by, 'admin']);
    res.json({ success: true, channelId: result.lastID, message: 'Kanal oluşturuldu' });
  } catch (error) {
    console.error('Kanal oluşturma hatası:', error);
    res.status(500).json({ error: 'Kanal oluşturulamadı' });
  }
});

// Kanal mesajları
app.get('/api/channels/:channelId/messages', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const messages = await dbAll(`
      SELECT m.*, u.username, u.display_name, u.avatar,
             (SELECT COUNT(*) FROM reactions WHERE message_id = m.id) as reaction_count
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.channel_id = ?
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `, [req.params.channelId, limit, offset]);
    res.json(messages.reverse());
  } catch (error) {
    console.error('Mesaj getirme hatası:', error);
    res.status(500).json({ error: 'Mesajlar yüklenemedi' });
  }
});

// Mesaj gönder
app.post('/api/channels/:channelId/messages', async (req, res) => {
  try {
    const { userId, content, type, attachment, reply_to } = req.body;
    if (!content && !attachment) return res.status(400).json({ error: 'Mesaj içeriği gerekli' });
    // Kanal mesajlarında engel kontrolü: engellenen kişi mesaj atamaz
    // (Burada basit: eğer userId engellenmişse kanalda da mesaj atamasın - opsiyonel, kanal genelinde uygulanmaz)
    // Sadece DM'de engel uygulanır, kanal mesajları herkese açık

    const result = await dbRun(
      'INSERT INTO messages (channel_id, user_id, content, type, attachment, reply_to) VALUES (?, ?, ?, ?, ?, ?)',
      [req.params.channelId, userId, content || '', type || 'text', attachment || null, reply_to || null]
    );
    const message = await dbGet(`
      SELECT m.*, u.username, u.display_name, u.avatar
      FROM messages m JOIN users u ON m.user_id = u.id
      WHERE m.id = ?
    `, [result.lastID]);
    res.json({ success: true, message });
  } catch (error) {
    console.error('Mesaj gönderme hatası:', error);
    res.status(500).json({ error: 'Mesaj gönderilemedi' });
  }
});

// Mesaj düzenle
app.put('/api/messages/:messageId', async (req, res) => {
  try {
    const { content, userId } = req.body;
    const message = await dbGet('SELECT * FROM messages WHERE id = ?', [req.params.messageId]);
    if (!message) return res.status(404).json({ error: 'Mesaj bulunamadı' });
    if (message.user_id !== userId) return res.status(403).json({ error: 'Yetkiniz yok' });
    await dbRun('UPDATE messages SET content = ?, edited = 1 WHERE id = ?', [content, req.params.messageId]);
    res.json({ success: true, message: 'Mesaj düzenlendi' });
  } catch (error) {
    console.error('Mesaj düzenleme hatası:', error);
    res.status(500).json({ error: 'Mesaj düzenlenemedi' });
  }
});

// Mesaj sil
app.delete('/api/messages/:messageId', async (req, res) => {
  try {
    const { userId } = req.body;
    const message = await dbGet('SELECT * FROM messages WHERE id = ?', [req.params.messageId]);
    if (!message) return res.status(404).json({ error: 'Mesaj bulunamadı' });
    if (message.user_id !== userId) return res.status(403).json({ error: 'Yetkiniz yok' });
    await dbRun('DELETE FROM reactions WHERE message_id = ?', [req.params.messageId]);
    await dbRun('DELETE FROM messages WHERE id = ?', [req.params.messageId]);
    res.json({ success: true, message: 'Mesaj silindi' });
  } catch (error) {
    console.error('Mesaj silme hatası:', error);
    res.status(500).json({ error: 'Mesaj silinemedi' });
  }
});

// ── SEARCH ──────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  try {
    const { q, userId } = req.query;
    if (!q || q.trim().length < 1) return res.json({ users: [], channels: [] });

    const term = `%${q.trim()}%`;

    // Engelleme filtresi: userId varsa engellediğimiz ve bizi engelleyenleri çıkar
    let blockedIds = [];
    if (userId) {
      const blockedByMe = await dbAll('SELECT blocked_id FROM blocks WHERE blocker_id = ?', [userId]);
      const blockedMe = await dbAll('SELECT blocker_id FROM blocks WHERE blocked_id = ?', [userId]);
      blockedIds = [
        ...blockedByMe.map(r => r.blocked_id),
        ...blockedMe.map(r => r.blocker_id)
      ];
    }

    const blockedFilter = blockedIds.length
      ? `AND id NOT IN (${blockedIds.map(() => '?').join(',')})`
      : '';
    const userRows = await dbAll(
      `SELECT id, username, display_name, avatar, status FROM users
       WHERE (username LIKE ? OR display_name LIKE ?)
       ${blockedFilter}
       LIMIT 20`,
      blockedIds.length ? [term, term, ...blockedIds] : [term, term]
    );

    const channelRows = await dbAll(
      `SELECT id, name, description FROM channels WHERE name LIKE ? LIMIT 10`,
      [term]
    );

    res.json({ users: userRows, channels: channelRows });
  } catch (error) {
    console.error('Arama hatası:', error);
    res.status(500).json({ error: 'Arama başarısız' });
  }
});

// ── FOLLOW ──────────────────────────────────────────────
// Takip et
app.post('/api/follow', async (req, res) => {
  try {
    const { followerId, followingId } = req.body;
    if (followerId === followingId) return res.status(400).json({ error: 'Kendinizi takip edemezsiniz' });
    // Engel varsa takip edilemez
    const block = await dbGet(
      'SELECT id FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)',
      [followerId, followingId, followingId, followerId]
    );
    if (block) return res.status(403).json({ error: 'Engel nedeniyle takip edilemiyor' });
    await dbRun('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)', [followerId, followingId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Takip başarısız' });
  }
});

// Takibi bırak
app.delete('/api/follow', async (req, res) => {
  try {
    const { followerId, followingId } = req.body;
    await dbRun('DELETE FROM follows WHERE follower_id=? AND following_id=?', [followerId, followingId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Takip bırakma başarısız' });
  }
});

// Takip durumu
app.get('/api/follow/status', async (req, res) => {
  try {
    const { followerId, followingId } = req.query;
    const row = await dbGet('SELECT id FROM follows WHERE follower_id=? AND following_id=?', [followerId, followingId]);
    res.json({ following: !!row });
  } catch (error) {
    res.status(500).json({ error: 'Durum alınamadı' });
  }
});

// Takipçiler / takip edilenler
app.get('/api/users/:userId/followers', async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT u.id, u.username, u.display_name, u.avatar, u.status
       FROM follows f JOIN users u ON f.follower_id = u.id
       WHERE f.following_id = ?`, [req.params.userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Takipçiler alınamadı' });
  }
});

app.get('/api/users/:userId/following', async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT u.id, u.username, u.display_name, u.avatar, u.status
       FROM follows f JOIN users u ON f.following_id = u.id
       WHERE f.follower_id = ?`, [req.params.userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Takip edilenler alınamadı' });
  }
});

// ── BLOCK ──────────────────────────────────────────────
// Engelle
app.post('/api/block', async (req, res) => {
  try {
    const { blockerId, blockedId } = req.body;
    if (blockerId === blockedId) return res.status(400).json({ error: 'Kendinizi engelleyemezsiniz' });
    await dbRun('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)', [blockerId, blockedId]);
    // Karşılıklı takibi kaldır
    await dbRun('DELETE FROM follows WHERE (follower_id=? AND following_id=?) OR (follower_id=? AND following_id=?)',
      [blockerId, blockedId, blockedId, blockerId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Engelleme başarısız' });
  }
});

// Engeli kaldır
app.delete('/api/block', async (req, res) => {
  try {
    const { blockerId, blockedId } = req.body;
    await dbRun('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?', [blockerId, blockedId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Engel kaldırma başarısız' });
  }
});

// Engellenenler listesi
app.get('/api/users/:userId/blocks', async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT u.id, u.username, u.display_name, u.avatar
       FROM blocks b JOIN users u ON b.blocked_id = u.id
       WHERE b.blocker_id = ?`, [req.params.userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Engellenenler alınamadı' });
  }
});

// Mesaj gönderirken engel kontrolü (DM için)
app.post('/api/dm', async (req, res) => {
  try {
    const { fromUserId, toUserId, content, type, attachment } = req.body;
    if (!content && !attachment) return res.status(400).json({ error: 'Mesaj boş olamaz' });
    const block = await dbGet(
      'SELECT id FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)',
      [toUserId, fromUserId, fromUserId, toUserId]
    );
    if (block) return res.status(403).json({ error: 'Bu kullanıcıya mesaj gönderemezsiniz' });
    const result = await dbRun(
      'INSERT INTO direct_messages (from_user_id, to_user_id, content, type, attachment) VALUES (?, ?, ?, ?, ?)',
      [fromUserId, toUserId, content || '', type || 'text', attachment || null]
    );
    const message = await dbGet(`
      SELECT dm.*, u.username, u.display_name, u.avatar
      FROM direct_messages dm JOIN users u ON dm.from_user_id = u.id
      WHERE dm.id = ?
    `, [result.lastID]);
    res.json({ success: true, message });
  } catch (error) {
    res.status(500).json({ error: 'Mesaj gönderilemedi' });
  }
});

// DM konuşma listesi
app.get('/api/dm/conversations/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const rows = await dbAll(`
      SELECT u.id, u.username, u.display_name, u.avatar, u.status,
             MAX(dm.created_at) as last_message_at,
             (SELECT content FROM direct_messages dm2
              WHERE ((dm2.from_user_id = ? AND dm2.to_user_id = u.id) OR (dm2.from_user_id = u.id AND dm2.to_user_id = ?))
              ORDER BY dm2.created_at DESC LIMIT 1) as last_message
      FROM direct_messages dm
      JOIN users u ON u.id = CASE WHEN dm.from_user_id = ? THEN dm.to_user_id ELSE dm.from_user_id END
      WHERE dm.from_user_id = ? OR dm.to_user_id = ?
      AND u.id NOT IN (
        SELECT blocked_id FROM blocks WHERE blocker_id = ?
        UNION SELECT blocker_id FROM blocks WHERE blocked_id = ?
      )
      GROUP BY u.id
      ORDER BY last_message_at DESC
      LIMIT 50
    `, [userId, userId, userId, userId, userId, userId, userId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Konuşmalar alınamadı' });
  }
});

// DM listesi (engellenenler hariç)
app.get('/api/dm/:userId/:otherId', async (req, res) => {
  try {
    const { userId, otherId } = req.params;
    // Engel varsa boş döndür
    const block = await dbGet(
      'SELECT id FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)',
      [userId, otherId, otherId, userId]
    );
    if (block) return res.json([]);
    const rows = await dbAll(
      `SELECT dm.*, u.username, u.display_name FROM direct_messages dm
       JOIN users u ON dm.from_user_id = u.id
       WHERE (from_user_id=? AND to_user_id=?) OR (from_user_id=? AND to_user_id=?)
       ORDER BY dm.created_at ASC LIMIT 100`,
      [userId, otherId, otherId, userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Mesajlar alınamadı' });
  }
});

app.get('/api/cicibebe/settings', (req, res) => {
  try {
    const settings = readCicibebeSettings();
    res.json({ success: true, settings });
  } catch (error) {
    console.error('CiciBebe ayarları okunamadı:', error);
    res.status(500).json({ error: 'Ayarlar yüklenemedi' });
  }
});

app.get('/api/cicibebe/logs', (req, res) => {
  try {
    const logData = readCicibebeAuditLog();
    res.json({ success: true, entries: logData.entries.slice(-200).reverse() });
  } catch (error) {
    console.error('CiciBebe logları okunamadı:', error);
    res.status(500).json({ error: 'Loglar yüklenemedi' });
  }
});

app.post('/api/cicibebe/login', (req, res) => {
  try {
    const settings = readCicibebeSettings();
    const normalizedName = normalizePlayerName(req.body?.name);
    const button = getCicibebeButtonByName(settings, normalizedName);
    if (!button) return res.status(403).json({ error: 'Bu isimle kayıtlı bir kişi bulunamadı.' });

    const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown')
      .toString().split(',')[0].trim();
    const auditLog = readCicibebeAuditLog();
    auditLog.entries.push({
      id: Date.now() + Math.random(),
      type: 'login',
      when: new Date().toISOString(),
      player: normalizedName,
      buttonId: button.id,
      ip,
      userAgent: req.headers['user-agent'] || 'unknown'
    });
    writeCicibebeAuditLog(auditLog.entries.slice(-500));
    res.json({ success: true });
  } catch (error) {
    console.error('CiciBebe giriş logu yazılamadı:', error);
    res.status(500).json({ error: 'Giriş kaydedilemedi' });
  }
});

app.get('/api/cicibebe/notes', (req, res) => {
  try {
    const settings = readCicibebeSettings();
    const playerButton = getCicibebeButtonByName(settings, req.query.name);
    if (!playerButton) return res.status(403).json({ error: 'Geçersiz kişi.' });
    const player = playerButton.id;

    const noteData = readCicibebeNotes();
    let changed = false;
    const notes = noteData.notes
      .filter((note) => note.sender === player || note.recipient === player)
      .map((note) => {
        if (note.recipient === player && !note.viewedAt) {
          note.viewedAt = new Date().toISOString();
          changed = true;
        }
        return note;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (changed) writeCicibebeNotes(noteData.notes.slice(-200));
    res.json({ success: true, notes });
  } catch (error) {
    console.error('CiciBebe notları okunamadı:', error);
    res.status(500).json({ error: 'Notlar yüklenemedi' });
  }
});

app.post('/api/cicibebe/notes', (req, res) => {
  try {
    const settings = readCicibebeSettings();
    const senderButton = getCicibebeButtonByName(settings, req.body?.sender);
    const recipientButton = getCicibebeButtonByName(settings, req.body?.recipient);
    const sender = senderButton?.id;
    const recipient = recipientButton?.id;
    const content = String(req.body?.content || '').trim();
    if (!sender || !recipient || sender === recipient) return res.status(403).json({ error: 'Geçersiz kişi.' });
    if (!content) return res.status(400).json({ error: 'Not boş olamaz.' });
    if (content.length > 500) return res.status(400).json({ error: 'Not en fazla 500 karakter olabilir.' });

    const note = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sender,
      recipient,
      content,
      createdAt: new Date().toISOString(),
      viewedAt: null
    };
    const noteData = readCicibebeNotes();
    noteData.notes.push(note);
    writeCicibebeNotes(noteData.notes.slice(-200));
    res.json({ success: true, note });
  } catch (error) {
    console.error('CiciBebe notu kaydedilemedi:', error);
    res.status(500).json({ error: 'Not kaydedilemedi' });
  }
});

app.delete('/api/cicibebe/notes/:id', (req, res) => {
  try {
    const settings = readCicibebeSettings();
    const senderButton = getCicibebeButtonByName(settings, req.body?.sender || req.query.sender);
    const sender = senderButton?.id;
    const noteData = readCicibebeNotes();
    const note = noteData.notes.find((item) => item.id === req.params.id);
    if (!note) return res.status(404).json({ error: 'Not bulunamadı' });
    if (note.sender !== sender) return res.status(403).json({ error: 'Bu notu yalnızca gönderen silebilir.' });

    writeCicibebeNotes(noteData.notes.filter((item) => item.id !== req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error('CiciBebe notu silinemedi:', error);
    res.status(500).json({ error: 'Not silinemedi' });
  }
});

app.post('/api/cicibebe/settings', (req, res) => {
  try {
    const { buttons, title, subtitle, rankStep, backgroundColor } = req.body || {};
    if (!Array.isArray(buttons) || buttons.length < 2) {
      return res.status(400).json({ error: 'En az iki kişi bilgisi gerekli' });
    }

    const current = readCicibebeSettings();
    const newRankStep = Number(rankStep) > 0 ? Number(rankStep) : current.rankStep || 12;
    const nextRanks = Array.isArray(req.body.ranks) && req.body.ranks.length
      ? req.body.ranks.map((rank, index) => ({
          ...current.ranks[index],
          ...rank,
          id: rank.id || index + 1,
          threshold: Number.isFinite(Number(rank.threshold)) ? Math.max(0, Number(rank.threshold)) : index * newRankStep,
          label: rank.label || current.ranks[index]?.label || `Rütbe ${index + 1}`,
          icon: rank.icon || current.ranks[index]?.icon || '✨'
        }))
      : generateRankTable(newRankStep, 100);

    const next = {
      ...current,
      title: title || current.title || 'CiciBebe',
      subtitle: '',
      backgroundColor: /^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : current.backgroundColor,
      rankStep: newRankStep,
      ranks: nextRanks,
      buttons: buttons.map((button, index) => ({
        ...current.buttons[index],
        ...button,
        id: button.id || `kisi-${index + 1}`,
        label: button.label || `Kişi ${index + 1}`,
        emoji: button.emoji || current.buttons[index].emoji || '',
        image: button.image || current.buttons[index].image || '',
        color: button.color || current.buttons[index].color || '#f9d5ff',
        count: Number.isFinite(Number(button.count)) ? Math.max(0, Number(button.count)) : Number(current.buttons[index].count || 0),
        lastClickedAt: button.lastClickedAt || current.buttons[index].lastClickedAt || null
      }))
    };

    writeCicibebeSettings(next);
    res.json({ success: true, settings: next });
  } catch (error) {
    console.error('CiciBebe ayarları kaydedilemedi:', error);
    res.status(500).json({ error: 'Ayarlar kaydedilemedi' });
  }
});

app.post('/api/cicibebe/vote', (req, res) => {
  try {
    const settings = readCicibebeSettings();
    const { buttonId, name } = req.body || {};
    const allowedButton = getCicibebeButtonByName(settings, name);

    if (!allowedButton) {
      return res.status(403).json({ error: 'Bu isimle kayıtlı bir kişi bulunamadı.' });
    }

    if (buttonId !== allowedButton.id) {
      return res.status(403).json({ error: 'Bu tuşa basma yetkin yok.' });
    }

    const button = settings.buttons.find(item => item.id === buttonId);

    if (!button) {
      return res.status(404).json({ error: 'Buton bulunamadı' });
    }

    const previousCount = Number(button.count || 0);
    const previousRank = getButtonRankState(previousCount, settings);
    button.count = previousCount + 1;
    button.lastClickedAt = new Date().toISOString();
    settings.lastClicked = {
      buttonId: button.id,
      label: button.label,
      time: button.lastClickedAt
    };

    const rankState = getButtonRankState(button.count, settings);
    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
    const logEntry = {
      id: Date.now() + Math.random(),
      when: new Date().toISOString(),
      player: allowedButton.id,
      buttonId: button.id,
      buttonLabel: button.label,
      count: button.count,
      ip: clientIp,
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    const auditLog = readCicibebeAuditLog();
    auditLog.entries.push(logEntry);
    writeCicibebeAuditLog(auditLog.entries.slice(-500));
    writeCicibebeSettings(settings);

    res.json({
      success: true,
      button,
      settings,
      rankState,
      previousRank,
      logEntry
    });
  } catch (error) {
    console.error('CiciBebe oy kaydı yapılamadı:', error);
    res.status(500).json({ error: 'Oyun kaydı yapılamadı' });
  }
});

// Dosya yükleme
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Dosya yüklenmedi' });
    res.json({
      success: true,
      url: `/uploads/${req.file.filename}`,
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (error) {
    console.error('Dosya yükleme hatası:', error);
    res.status(500).json({ error: 'Dosya yüklenemedi' });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Dosya 10MB\'dan büyük olamaz' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'İstek işlenemedi' });
  }
  next();
});

app.use('/uploads', express.static(uploadsDir));

// Health check (Railway için)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Sunucuyu başlat
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 DEMLİK sunucusu http://0.0.0.0:${PORT} adresinde çalışıyor`);
  console.log(`📁 Yüklemeler: ${uploadsDir}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM alındı, sunucu kapatılıyor...');
  db.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 Sunucu kapatılıyor...');
  db.close();
  process.exit(0);
});
