import { get, run } from '../db.js';

class OTPRecord {
  constructor(data) {
    Object.assign(this, data);
  }

  async save() {
    this.updatedAt = new Date().toISOString();
    await run(
      `UPDATE otps SET otp = ?, attempts = ?, expiresAt = ?, verified = ?, purpose = ?, updatedAt = ? WHERE id = ?`,
      [
        this.otp,
        this.attempts || 0,
        this.expiresAt,
        this.verified ? 1 : 0,
        this.purpose || 'register',
        this.updatedAt,
        this.id,
      ],
    );
    return this;
  }
}

function normalizeOtp(row) {
  if (!row) return null;
  return new OTPRecord({
    id: row.id,
    phone: row.phone,
    otp: row.otp,
    attempts: row.attempts || 0,
    expiresAt: row.expiresAt,
    verified: Boolean(row.verified),
    purpose: row.purpose || 'register',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function buildWhere(filter = {}) {
  const clauses = [];
  const params = [];
  for (const [key, value] of Object.entries(filter)) {
    clauses.push(`${key} = ?`);
    params.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
  }
  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

const OTP = {
  async deleteMany(filter = {}) {
    await run(`DELETE FROM otps WHERE expiresAt < ?`, [new Date().toISOString()]);
    const { where, params } = buildWhere(filter);
    return run(`DELETE FROM otps ${where}`, params);
  },

  async create(data) {
    const now = new Date().toISOString();
    const result = await run(
      `INSERT INTO otps (phone, otp, attempts, expiresAt, verified, purpose, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.phone,
        data.otp,
        data.attempts || 0,
        data.expiresAt instanceof Date ? data.expiresAt.toISOString() : data.expiresAt,
        data.verified ? 1 : 0,
        data.purpose || 'register',
        now,
        now,
      ],
    );
    return normalizeOtp(await get(`SELECT * FROM otps WHERE id = ?`, [result.lastID]));
  },

  async findOne(filter = {}) {
    await run(`DELETE FROM otps WHERE expiresAt < ?`, [new Date().toISOString()]);
    const { where, params } = buildWhere(filter);
    return normalizeOtp(await get(`SELECT * FROM otps ${where} ORDER BY id DESC LIMIT 1`, params));
  },
};

export default OTP;
