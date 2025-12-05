import express from 'express';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const DEFAULT_DB_PATH = path.resolve(__dirname, '../danmaku.db');

// Ensure the uploads directory exists
function openDb(dbPath) {
    // open sqlite db and log connection result
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error(`Failed to open DB at ${dbPath}:`, err.message);
        } else {
            console.log(`Connected to SQLite DB: ${dbPath}`);
        }
    });
    return db;
}

// Helper to run a SQL and return Promise
function all(dbPath, sql, params = []) {
    return new Promise((resolve, reject) => {
        // check file existence early and log
        try {
            if (!fs.existsSync(dbPath)) {
                const msg = `DB file not found: ${dbPath}`;
                console.error(msg);
                return reject(new Error(msg));
            }
        } catch (e) {
            console.error('Error checking DB file existence:', e.message);
            return reject(e);
        }

        const db = openDb(dbPath);
        db.all(sql, params, (err, rows) => {
            db.close((closeErr) => {
                if (closeErr) console.error(`Error closing DB ${dbPath}:`, closeErr.message);
                else console.log(`Closed DB: ${dbPath}`);
            });
            if (err) {
                console.error(`SQL error on DB ${dbPath}:`, err.message);
                return reject(err);
            }
            resolve(rows);
        });
    });
}

// Default DB path can be provided by env DB_PATH or by query param `db` (relative to server cwd)
function resolveDbPath() {
    const envPath = process.env.DB_PATH;
    if (envPath) return path.resolve(process.cwd(), envPath);
    return DEFAULT_DB_PATH;
}

function parseLimit(raw, fallback, max) {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
}

function parseHours(raw, fallback) {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function buildTimestampOrderClause() {
    return "COALESCE(timestamp, strftime('%s', created_at))";
}

// API Router
const apiRouter = express.Router();

apiRouter.get('/tables', async (req, res) => {
    try {
        const dbPath = resolveDbPath();
        if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'db not found', path: dbPath });
        const sql = "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name";
        const rows = await all(dbPath, sql);
        res.json({ path: dbPath, tables: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

apiRouter.get('/table/:name', async (req, res) => {
    try {
        const dbPath = resolveDbPath();
        const name = req.params.name;
        const limit = parseInt(req.query.limit || '100', 10);
        const offset = parseInt(req.query.offset || '0', 10);
        if (!fs.existsSync(dbPath)) return res.status(404).json({ error: 'db not found', path: dbPath });
        // protect against injection by only allowing identifier in quotes
        const safeName = name.replace(/"/g, '""');
        const sql = `SELECT * FROM "${safeName}" LIMIT ${limit} OFFSET ${offset}`;
        const rows = await all(dbPath, sql);
        res.json({ rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

apiRouter.get('/stats/history-count', async (req, res) => {
    try {
        const dbPath = resolveDbPath();
        const sql = 'SELECT COUNT(*) AS count FROM danmaku_messages';
        const rows = await all(dbPath, sql);
        res.json({ totalMessages: rows?.[0]?.count || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

apiRouter.get('/stats/unique-users', async (req, res) => {
    try {
        const dbPath = resolveDbPath();
        const sql = 'SELECT COUNT(DISTINCT open_id) AS count FROM danmaku_messages';
        const rows = await all(dbPath, sql);
        res.json({ uniqueUsers: rows?.[0]?.count || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

apiRouter.get('/stats/unique-users-24h', async (req, res) => {
    try {
        const dbPath = resolveDbPath();
        const hours = 24;
        const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
        const sql = `SELECT COUNT(DISTINCT open_id) AS count FROM danmaku_messages WHERE ${buildTimestampOrderClause()} >= ?`;
        const rows = await all(dbPath, sql, [cutoff]);
        res.json({ uniqueUsers24h: rows?.[0]?.count || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

apiRouter.get('/stats/top-users', async (req, res) => {
    try {
        const dbPath = resolveDbPath();
        const limit = parseLimit(req.query.limit || '10', 10, 100);
        const hours = parseHours(req.query.hours || '24', 24);
        const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;
        const sql = `
            SELECT uname, open_id, COUNT(*) AS messageCount
            FROM danmaku_messages
            WHERE ${buildTimestampOrderClause()} >= ?
            GROUP BY open_id, uname
            ORDER BY messageCount DESC
            LIMIT ?
        `;
        const rows = await all(dbPath, sql, [cutoff, limit]);
        res.json({ sinceHours: hours, limit, topUsers: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

apiRouter.get('/messages/recent', async (req, res) => {
    try {
        const dbPath = resolveDbPath();
        const limit = parseLimit(req.query.limit || '50', 50, 200);
        const roomId = req.query.roomId;
        const clauses = [];
        const params = [];
        if (roomId) {
            clauses.push('room_id = ?');
            params.push(roomId);
        }
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const sql = `
            SELECT *
            FROM danmaku_messages
            ${where}
            ORDER BY ${buildTimestampOrderClause()} DESC
            LIMIT ?
        `;
        params.push(limit);
        const rows = await all(dbPath, sql, params);
        res.json({ messages: rows, limit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

apiRouter.get('/messages/by-user', async (req, res) => {
    try {
        const dbPath = resolveDbPath();
        const limit = parseLimit(req.query.limit || '100', 100, 500);
        const { openId, uname } = req.query;
        if (!openId && !uname) {
            return res.status(400).json({ error: 'Provide openId or uname query parameter.' });
        }
        const params = [];
        let where;
        if (openId) {
            where = 'open_id = ?';
            params.push(openId);
        } else {
            where = 'uname LIKE ? COLLATE NOCASE';
            params.push(`%${uname}%`);
        }
        const sql = `
            SELECT *
            FROM danmaku_messages
            WHERE ${where}
            ORDER BY ${buildTimestampOrderClause()} DESC
            LIMIT ?
        `;
        params.push(limit);
        const rows = await all(dbPath, sql, params);
        res.json({ messages: rows, limit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

apiRouter.get('/messages/search', async (req, res) => {
    try {
        const dbPath = resolveDbPath();
        const limit = parseLimit(req.query.limit || '100', 100, 500);
        const keywordsRaw = req.query.keyword ?? req.query.keywords ?? req.query.q;
        let keywords = [];
        if (Array.isArray(keywordsRaw)) {
            keywords = keywordsRaw;
        } else if (typeof keywordsRaw === 'string') {
            keywords = keywordsRaw.split(',');
        }
        keywords = keywords.map((k) => k.trim()).filter(Boolean);
        if (!keywords.length) {
            return res.status(400).json({ error: 'Provide at least one keyword via keyword, keywords, or q query param.' });
        }
        const roomId = req.query.roomId;
        const clauses = keywords.map(() => 'msg LIKE ? COLLATE NOCASE');
        const params = keywords.map((k) => `%${k}%`);
        let where = `(${clauses.join(' OR ')})`;
        if (roomId) {
            where = `room_id = ? AND ${where}`;
            params.unshift(roomId);
        }
        const sql = `
            SELECT *
            FROM danmaku_messages
            WHERE ${where}
            ORDER BY ${buildTimestampOrderClause()} DESC
            LIMIT ?
        `;
        params.push(limit);
        const rows = await all(dbPath, sql, params);
        res.json({ keywords, limit, messages: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mount API router
app.use('/api', apiRouter);

// Serve static files from dist
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const port = process.env.PORT || 3000;
// Bind to 0.0.0.0 so the server is reachable from outside the container
app.listen(port, '0.0.0.0', () => {
    console.log(`SQLite server listening on http://localhost:${port}`);
    // On startup, resolve DB path and try a quick connect to show logs if a DB is present.
    try {
        // Input the desired path here for startup check

        const startupDb = resolveDbPath();
        console.log(`Resolved DB path at startup: ${startupDb}`);
        if (fs.existsSync(startupDb)) {
            console.log(`DB file exists at startup: ${startupDb} — attempting quick connect`);
            const _db = openDb(startupDb);
            // close after open (openDb already logs success/failure)
            _db.close((err) => {
                if (err) console.error(`Error closing startup DB ${startupDb}:`, err.message);
                else console.log(`Startup DB connection closed: ${startupDb}`);
            });
        } else {
            console.warn(`No DB file found at startup: ${startupDb} — supply ?db=path or set DB_PATH to use a DB`);
        }
    } catch (e) {
        console.error('Error during startup DB check:', e && e.message ? e.message : e);
    }
});
