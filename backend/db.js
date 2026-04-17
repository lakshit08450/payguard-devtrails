import path from 'path';
import sqlite3 from 'sqlite3';

const dbPath = process.env.SQLITE_PATH || path.resolve(process.cwd(), 'payguard.sqlite');
const db = new sqlite3.Database(dbPath);

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

export async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      name TEXT DEFAULT '',
      email TEXT DEFAULT '',
      password TEXT DEFAULT '',
      isPhoneVerified INTEGER DEFAULT 0,
      isKycVerified INTEGER DEFAULT 0,
      kyc TEXT NOT NULL,
      platform TEXT NOT NULL,
      zone TEXT NOT NULL,
      policy TEXT NOT NULL,
      language TEXT DEFAULT 'en',
      theme TEXT DEFAULT 'dark',
      createdAt TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      otp TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      expiresAt TEXT NOT NULL,
      verified INTEGER DEFAULT 0,
      purpose TEXT DEFAULT 'register',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_otps_phone_purpose ON otps(phone, purpose)`);
  await run(`DELETE FROM otps WHERE expiresAt < ?`, [new Date().toISOString()]);
}

export default db;
