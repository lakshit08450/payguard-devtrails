import bcrypt from 'bcryptjs';
import { all, get, run } from '../db.js';

const DEFAULT_USER = {
  phone: '',
  name: '',
  email: '',
  password: '',
  isPhoneVerified: false,
  isKycVerified: false,
  kyc: {
    aadhaarLast4: '',
    pan: '',
    verifiedAt: null,
    sandboxRef: '',
  },
  platform: {
    linked: [],
    linkedAt: null,
  },
  zone: {
    city: '',
    area: '',
    riskScore: 0,
    lat: null,
    lng: null,
  },
  policy: {
    plan: null,
    status: null,
    premium: null,
    coverage: null,
    activatedAt: null,
    renewsAt: null,
  },
  language: 'en',
  theme: 'dark',
  createdAt: null,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyPatch(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (key.includes('.')) {
      const parts = key.split('.');
      let cursor = target;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const part = parts[i];
        if (cursor[part] == null || typeof cursor[part] !== 'object') cursor[part] = {};
        cursor = cursor[part];
      }
      cursor[parts[parts.length - 1]] = value;
    } else if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      applyPatch(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : clone(fallback);
  } catch {
    return clone(fallback);
  }
}

function normalizeUser(row) {
  if (!row) return null;
  return new UserRecord({
    _id: row.id,
    phone: row.phone,
    name: row.name || '',
    email: row.email || '',
    password: row.password || '',
    isPhoneVerified: Boolean(row.isPhoneVerified),
    isKycVerified: Boolean(row.isKycVerified),
    kyc: parseJson(row.kyc, DEFAULT_USER.kyc),
    platform: parseJson(row.platform, DEFAULT_USER.platform),
    zone: parseJson(row.zone, DEFAULT_USER.zone),
    policy: parseJson(row.policy, DEFAULT_USER.policy),
    language: row.language || 'en',
    theme: row.theme || 'dark',
    createdAt: row.createdAt,
  });
}

class UserRecord {
  constructor(data) {
    Object.assign(this, clone(DEFAULT_USER), data);
    this._originalPassword = this.password || '';
  }

  async save() {
    let passwordToSave = this.password || '';
    if (passwordToSave && passwordToSave !== this._originalPassword) {
      passwordToSave = await bcrypt.hash(passwordToSave, 12);
      this.password = passwordToSave;
    }

    if (this._id) {
      await run(
        `UPDATE users SET
          phone = ?, name = ?, email = ?, password = ?, isPhoneVerified = ?, isKycVerified = ?,
          kyc = ?, platform = ?, zone = ?, policy = ?, language = ?, theme = ?
         WHERE id = ?`,
        [
          this.phone,
          this.name || '',
          this.email || '',
          passwordToSave,
          this.isPhoneVerified ? 1 : 0,
          this.isKycVerified ? 1 : 0,
          JSON.stringify(this.kyc || DEFAULT_USER.kyc),
          JSON.stringify(this.platform || DEFAULT_USER.platform),
          JSON.stringify(this.zone || DEFAULT_USER.zone),
          JSON.stringify(this.policy || DEFAULT_USER.policy),
          this.language || 'en',
          this.theme || 'dark',
          this._id,
        ],
      );
    } else {
      const createdAt = this.createdAt || new Date().toISOString();
      const result = await run(
        `INSERT INTO users
          (phone, name, email, password, isPhoneVerified, isKycVerified, kyc, platform, zone, policy, language, theme, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.phone,
          this.name || '',
          this.email || '',
          passwordToSave,
          this.isPhoneVerified ? 1 : 0,
          this.isKycVerified ? 1 : 0,
          JSON.stringify(this.kyc || DEFAULT_USER.kyc),
          JSON.stringify(this.platform || DEFAULT_USER.platform),
          JSON.stringify(this.zone || DEFAULT_USER.zone),
          JSON.stringify(this.policy || DEFAULT_USER.policy),
          this.language || 'en',
          this.theme || 'dark',
          createdAt,
        ],
      );
      this._id = result.lastID;
      this.createdAt = createdAt;
    }

    this._originalPassword = this.password || '';
    return this;
  }

  async comparePassword(pass) {
    return bcrypt.compare(pass, this.password || '');
  }
}

async function listUsers() {
  const rows = await all(`SELECT * FROM users`);
  return rows.map(normalizeUser);
}

async function findMatchingUser(filter = {}) {
  if (filter.phone && Object.keys(filter).length === 1) {
    return normalizeUser(await get(`SELECT * FROM users WHERE phone = ? LIMIT 1`, [filter.phone]));
  }

  const users = await listUsers();
  return users.find(user => Object.entries(filter).every(([key, expected]) => {
    const parts = key.split('.');
    let current = user;
    for (const part of parts) current = current?.[part];
    return current === expected;
  })) || null;
}

const User = {
  async find(filter = {}) {
    const users = await listUsers();
    if (!filter || Object.keys(filter).length === 0) return users;

    return users.filter((user) => Object.entries(filter).every(([key, expected]) => {
      const parts = key.split('.');
      let current = user;
      for (const part of parts) current = current?.[part];
      return current === expected;
    }));
  },

  async findOne(filter) {
    return findMatchingUser(filter);
  },

  async findById(id) {
    return normalizeUser(await get(`SELECT * FROM users WHERE id = ? LIMIT 1`, [id]));
  },

  async findOneAndUpdate(filter, update, options = {}) {
    let user = await findMatchingUser(filter);
    if (!user && options.upsert) {
      user = new UserRecord({ ...clone(DEFAULT_USER), ...filter, createdAt: new Date().toISOString() });
    }
    if (!user) return null;
    applyPatch(user, update);
    await user.save();
    return options.new === false ? null : user;
  },

  async findByIdAndUpdate(id, update, options = {}) {
    const user = await User.findById(id);
    if (!user) return null;
    applyPatch(user, update);
    await user.save();
    return options.new === false ? null : user;
  },

  async countDocuments() {
    const row = await get(`SELECT COUNT(*) AS total FROM users`);
    return row?.total || 0;
  },
};

export default User;
