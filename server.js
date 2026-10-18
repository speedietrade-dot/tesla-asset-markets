const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
        console.log("DATABASE_URL not set. Running without PostgreSQL for now.");
        return;  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      balance NUMERIC(18,2) DEFAULT 0,
      investment NUMERIC(18,2) DEFAULT 0,
      profit NUMERIC(18,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS holdings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      units NUMERIC(18,8) DEFAULT 0,
      investment NUMERIC(18,2) DEFAULT 0,
      current_value NUMERIC(18,2) DEFAULT 0,
      profit NUMERIC(18,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Additive migrations: preserve existing customer and transaction data.
  await pool.query(`
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS customer_reference TEXT;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_reference TEXT;
    ALTER TABLE holdings ADD COLUMN IF NOT EXISTS customer_reference TEXT;

    CREATE TABLE IF NOT EXISTS withdrawal_tokens (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      used_at TIMESTAMP,
      revoked_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS investment_plans (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id BIGSERIAL PRIMARY KEY,
      action TEXT NOT NULL,
      subject_user_id INTEGER,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;
    ALTER TABLE transactions ADD CONSTRAINT transactions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE holdings DROP CONSTRAINT IF EXISTS holdings_user_id_fkey;
    ALTER TABLE holdings ADD CONSTRAINT holdings_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  `);

  const plans = [
    ['Starter Plan', 1420], ['Bronze Plan', 2308], ['Silver Plan', 5381],
    ['Gold Plan', 8160], ['Platinum Plan', 10270], ['Diamond Plan', 13509],
    ['Premium Plan', 15681], ['Elite Plan', 20110], ['VIP Plan', 25610]
  ];
  const planCount = await pool.query('SELECT COUNT(*)::int AS count FROM investment_plans');
  if (planCount.rows[0].count === 0) {
    for (const [name, amount] of plans) {
      await pool.query('INSERT INTO investment_plans (name, amount) VALUES ($1, $2)', [name, amount]);
    }
  }

  console.log("Database ready.");
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role || "customer"
    },
    process.env.JWT_SECRET || "change-this-secret",
    { expiresIn: "7d" }
  );
}

function requireAuth(req, res, next) {
  try {
    const token = req.cookies.auth_token;

    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET || "change-this-secret"
    );

    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }

  next();
}

/* ---------- AUTH ---------- */

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Name, email and password are required"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail]
    );

    if (existing.rows.length) {
      return res.status(409).json({
        error: "An account with that email already exists"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, balance, investment, profit`,
      [name.trim(), normalizedEmail, passwordHash]
    );

    const user = result.rows[0];

    const token = createToken({
      ...user,
      role: "customer"
    });

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [normalizedEmail]
    );

    if (!result.rows.length) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!valid) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    const token = createToken({
      id: user.id,
      email: user.email,
      role: "customer"
    });

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        balance: user.balance,
        investment: user.investment,
        profit: user.profit
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("auth_token");
  res.json({ success: true });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, balance, investment, profit
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      user: result.rows[0],
      role: req.user.role
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load account" });
  }
});

/* ---------- CUSTOMER ---------- */

app.get("/api/customer/holdings", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, symbol, units, investment, current_value, profit
       FROM holdings
       WHERE user_id = $1
       ORDER BY id DESC`,
      [req.user.id]
    );

    res.json({ holdings: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load holdings" });
  }
});

app.get("/api/customer/transactions", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, type, amount, status, description, created_at
       FROM transactions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ transactions: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load transactions" });
  }
});

app.post("/api/customer/funding-request", requireAuth, async (req, res) => 
{
  try {
    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Enter a valid amount"
      });
    }

    const reference = String(req.body.reference || '').trim();
    if (!reference || reference.length > 180) {
      return res.status(400).json({ error: "Enter a valid payment reference" });
    }

    await pool.query(
      `INSERT INTO transactions (user_id, type, amount, status, description, customer_reference)
       VALUES ($1, 'funding', $2, 'pending', 'Funding request submitted', $3)`,
      [req.user.id, amount, reference]
    );

    res.json({
      success: true,
      message: "Funding request submitted"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Unable to submit funding request"
    });
  }
});

app.post("/api/customer/withdrawal", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const amount = Number(req.body.amount);
    const token = String(req.body.token || '');
    const method = String(req.body.method || 'Withdrawal').trim().slice(0, 40);
    const destination = String(req.body.destination || '').trim().slice(0, 180);
    if (!destination) return res.status(400).json({ error: 'Withdrawal destination is required' });
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Enter a valid amount" });
    }
    if (!token) return res.status(400).json({ error: "Withdrawal token is required" });

    await client.query('BEGIN');
    const userResult = await client.query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    if (!userResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Account no longer exists' });
    }
    if (amount > Number(userResult.rows[0].balance || 0)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient available balance' });
    }
    const tokenResult = await client.query(
      'SELECT token_hash, used_at, revoked_at FROM withdrawal_tokens WHERE user_id = $1 FOR UPDATE',
      [req.user.id]
    );
    if (!tokenResult.rows.length || tokenResult.rows[0].used_at || tokenResult.rows[0].revoked_at || !(await bcrypt.compare(token, tokenResult.rows[0].token_hash))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid, used, or revoked withdrawal token' });
    }
    await client.query('UPDATE withdrawal_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1', [req.user.id]);
    await client.query(`INSERT INTO transactions (user_id, type, amount, status, description) VALUES ($1, 'withdrawal', $2, 'pending', $3)`, [req.user.id, amount, `${method}: ${destination}`]);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Withdrawal request submitted for review' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error(error);
    res.status(500).json({ error: "Unable to submit withdrawal" });
  } finally { client.release(); }
});

/* ---------- CUSTOMER REQUESTS ---------- */
app.post('/api/customer/investment-plan-request', requireAuth, async (req, res) => {
  try {
    const planId = Number(req.body.planId);
    const paymentReference = String(req.body.paymentReference || '').trim().slice(0, 180);
    if (!Number.isInteger(planId) || planId <= 0 || !paymentReference) return res.status(400).json({ error: 'Select a plan and provide the Bitcoin transaction reference' });
    const plan = await pool.query('SELECT id, name, amount FROM investment_plans WHERE id=$1 AND active=TRUE', [planId]);
    if (!plan.rows.length) return res.status(404).json({ error: 'Investment plan is unavailable' });
    const setting = await pool.query("SELECT value FROM app_settings WHERE key='bitcoin_payment_address'");
    if (!setting.rows[0]?.value) return res.status(400).json({ error: 'The admin has not configured a Bitcoin payment address yet' });
    const p = plan.rows[0];
    const r = await pool.query(`INSERT INTO transactions(user_id,type,amount,status,description,payment_reference)
      VALUES($1,'investment_plan',$2,'pending',$3,$4) RETURNING id,type,amount,status,description,payment_reference,created_at`,
      [req.user.id, p.amount, `Investment plan: ${p.name}`, paymentReference]);
    res.status(201).json({ success:true, transaction:r.rows[0], message:'Request submitted for payment review. The reference is not proof of confirmed payment.' });
  } catch(e) { console.error(e); res.status(500).json({ error:'Unable to submit investment plan request' }); }
});

app.post('/api/customer/asset-order', requireAuth, async (req, res) => {
  try {
    const kind = String(req.body.kind || '').toLowerCase();
    const name = String(req.body.name || '').trim().slice(0, 80);
    const symbol = String(req.body.symbol || '').trim().toUpperCase().slice(0, 15);
    const amount = Number(req.body.amount);
    const note = String(req.body.note || '').trim().slice(0, 120);
    if (!['stock','vehicle'].includes(kind) || !name || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error:'A valid asset and amount are required' });
    const type = kind === 'stock' ? 'stock_order' : 'vehicle_order';
    const description = `${kind === 'stock' ? `Stock ${symbol || name}` : `Vehicle ${name}`}${note ? ` — ${note}` : ''}`;
    const r = await pool.query(`INSERT INTO transactions(user_id,type,amount,status,description)
      VALUES($1,$2,$3,'pending',$4) RETURNING id,type,amount,status,description,created_at`, [req.user.id,type,amount,description]);
    res.status(201).json({ success:true, transaction:r.rows[0], message:'Simulated order request submitted for admin review; no real trade or vehicle purchase was made.' });
  } catch(e) { console.error(e); res.status(500).json({ error:'Unable to submit asset request' }); }
});

/* ---------- ADMIN ---------- */

app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      !process.env.ADMIN_EMAIL ||
      !process.env.ADMIN_PASSWORD
    ) {
      return res.status(500).json({
        error: "Admin credentials are not configured"
      });
    }

    if (
      email.trim().toLowerCase() !==
        process.env.ADMIN_EMAIL.trim().toLowerCase() ||
      password !== process.env.ADMIN_PASSWORD
    ) {
      return res.status(401).json({
        error: "Invalid admin credentials"
      });
    }

    const token = jwt.sign(
      {
        email: process.env.ADMIN_EMAIL,
        role: "admin"
      },
      process.env.JWT_SECRET || "change-this-secret",
      { expiresIn: "7d" }
    );

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Admin login failed" });
  }
});

app.get(
  "/api/admin/customers",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, name, email, balance, investment, profit, created_at
         FROM users
         ORDER BY created_at DESC`
      );

      res.json({ customers: result.rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "Unable to load customers"
      });
    }
  }
);

app.patch(
  "/api/admin/customers/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { balance, investment, profit, reason } = req.body;

      if (balance !== undefined && (!Number.isFinite(Number(balance)) || Number(balance) < 0)) return res.status(400).json({ error: 'Balance must be a non-negative number' });
      if (investment !== undefined && (!Number.isFinite(Number(investment)) || Number(investment) < 0)) return res.status(400).json({ error: 'Investment must be a non-negative number' });
      if (profit !== undefined && !Number.isFinite(Number(profit))) return res.status(400).json({ error: 'Profit must be a valid number' });
      const cleanReason = String(reason || '').trim().slice(0, 180);
      if (!cleanReason) return res.status(400).json({ error: 'A reason is required for account adjustments' });

      const result = await pool.query(
        `UPDATE users
         SET balance = COALESCE($1, balance),
             investment = COALESCE($2, investment),
             profit = COALESCE($3, profit)
         WHERE id = $4
         RETURNING id, name, email, balance, investment, profit`,
        [
          balance === undefined ? null : Number(balance),
          investment === undefined ? null : Number(investment),
          profit === undefined ? null : Number(profit),
          id
        ]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          error: "Customer not found"
        });
      }

      await pool.query(
        'INSERT INTO admin_audit_log(action, subject_user_id, details) VALUES($1,$2,$3)',
        ['customer_financial_values_updated', id, JSON.stringify({
          balanceChanged: balance !== undefined,
          investmentChanged: investment !== undefined,
          profitChanged: profit !== undefined,
          reason: cleanReason
        })]
      );
      res.json({
        success: true,
        customer: result.rows[0]
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "Unable to update customer"
      });
    }
  }
);

/* ---------- ADMIN MANAGEMENT ADDITIONS ---------- */
app.get('/api/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query("SELECT key, value FROM app_settings WHERE key = 'bitcoin_payment_address'");
    res.json({ bitcoinAddress: r.rows[0]?.value || '' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Unable to load settings' }); }
});

app.put('/api/admin/settings/bitcoin-address', requireAuth, requireAdmin, async (req, res) => {
  try {
    const address = String(req.body.address || '').trim();
    if (address.length > 150 || (address && !/^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address))) {
      return res.status(400).json({ error: 'Enter a valid Bitcoin mainnet address, or leave it blank to clear it.' });
    }
    await pool.query(`INSERT INTO app_settings(key,value) VALUES('bitcoin_payment_address',$1)
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=CURRENT_TIMESTAMP`, [address]);
    await pool.query("INSERT INTO admin_audit_log(action,details) VALUES('bitcoin_address_updated',$1)", [JSON.stringify({ configured: !!address })]);
    res.json({ success: true, bitcoinAddress: address });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Unable to save Bitcoin address' }); }
});

app.get('/api/customer/investment-plans', requireAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, name, amount FROM investment_plans WHERE active = TRUE ORDER BY amount ASC');
    const setting = await pool.query("SELECT value FROM app_settings WHERE key='bitcoin_payment_address'");
    res.json({ plans: r.rows, bitcoinAddress: setting.rows[0]?.value || '' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Unable to load investment plans' }); }
});

app.get('/api/admin/investment-plans', requireAuth, requireAdmin, async (req, res) => {
  try { const r = await pool.query('SELECT id, name, amount, active FROM investment_plans ORDER BY amount ASC'); res.json({ plans: r.rows }); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Unable to load plans' }); }
});

app.patch('/api/admin/investment-plans/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id), name = String(req.body.name || '').trim(), amount = Number(req.body.amount), active = req.body.active;
    if (!Number.isInteger(id) || !name || name.length > 80 || !Number.isFinite(amount) || amount <= 0 || typeof active !== 'boolean') return res.status(400).json({ error: 'Valid name, positive amount, and active flag are required' });
    const r = await pool.query('UPDATE investment_plans SET name=$1, amount=$2, active=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING id,name,amount,active', [name, amount, active, id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Plan not found' });
    await pool.query('INSERT INTO admin_audit_log(action,details) VALUES($1,$2)', ['investment_plan_updated', JSON.stringify({ planId:id, name, amount, active })]);
    res.json({ success:true, plan:r.rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Unable to update plan' }); }
});

app.put('/api/admin/customers/:id/withdrawal-token', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id), token = String(req.body.token || '').trim();
    if (!Number.isInteger(id) || id <= 0 || token.length < 8 || token.length > 128) return res.status(400).json({ error: 'Use a token between 8 and 128 characters' });
    const user = await pool.query('SELECT id FROM users WHERE id=$1', [id]);
    if (!user.rows.length) return res.status(404).json({ error: 'Customer not found' });
    const hash = await bcrypt.hash(token, 12);
    await pool.query(`INSERT INTO withdrawal_tokens(user_id,token_hash,used_at,revoked_at,created_at) VALUES($1,$2,NULL,NULL,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash, used_at=NULL, revoked_at=NULL, created_at=CURRENT_TIMESTAMP`, [id, hash]);
    await pool.query('INSERT INTO admin_audit_log(action,subject_user_id,details) VALUES($1,$2,$3)', ['withdrawal_token_set',id,JSON.stringify({ tokenSet:true })]);
    res.json({ success:true, message:'Single-use withdrawal token set. Store it securely and share it directly with the customer.' });
  } catch (e) { console.error(e); res.status(500).json({ error:'Unable to set withdrawal token' }); }
});

app.delete('/api/admin/customers/:id/withdrawal-token', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await pool.query('UPDATE withdrawal_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND used_at IS NULL AND revoked_at IS NULL RETURNING user_id', [id]);
    if (!r.rows.length) return res.status(404).json({ error:'No active unused token was found for this customer' });
    await pool.query('INSERT INTO admin_audit_log(action,subject_user_id,details) VALUES($1,$2,$3)', ['withdrawal_token_revoked',id,JSON.stringify({ revoked:true })]);
    res.json({ success:true, message:'Withdrawal token revoked.' });
  } catch(e) { console.error(e); res.status(500).json({ error:'Unable to revoke withdrawal token' }); }
});

app.delete('/api/admin/customers/:id', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error:'Invalid customer id' });
    await client.query('BEGIN');
    const user = await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [id]);
    if (!user.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error:'Customer not found' }); }
    const reference = `deleted-customer-${id}`;
    await client.query('UPDATE transactions SET customer_reference=COALESCE(customer_reference,$1), user_id=NULL, description=NULL WHERE user_id=$2', [reference,id]);
    await client.query('UPDATE holdings SET customer_reference=COALESCE(customer_reference,$1), user_id=NULL WHERE user_id=$2', [reference,id]);
    await client.query('DELETE FROM users WHERE id=$1', [id]);
    await client.query('INSERT INTO admin_audit_log(action,subject_user_id,details) VALUES($1,$2,$3)', ['customer_account_deleted',id,JSON.stringify({ customerReference:reference, personalDataDeleted:true, financialRecordsRetained:true })]);
    await client.query('COMMIT');
    res.json({ success:true, message:'Account and eligible personal data deleted; associated financial records retained under an anonymous reference.' });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error(e); res.status(500).json({ error:'Unable to delete customer account' });
  } finally { client.release(); }
});

app.post('/api/admin/customers/:id/holdings', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const id=Number(req.params.id), symbol=String(req.body.symbol||'').trim().toUpperCase();
    const units=Number(req.body.units), investment=Number(req.body.investment), currentValue=Number(req.body.currentValue), profit=Number(req.body.profit);
    if (!Number.isInteger(id)||id<=0||!/^[A-Z0-9.^-]{1,15}$/.test(symbol)||![units,investment,currentValue,profit].every(Number.isFinite)||units<0||investment<0||currentValue<0) return res.status(400).json({error:'Enter a valid stock symbol and non-negative units, investment, and current value.'});
    await client.query('BEGIN');
    const user=await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[id]);
    if(!user.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Customer not found'});}
    const h=await client.query('INSERT INTO holdings(user_id,symbol,units,investment,current_value,profit) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,symbol,units,investment,current_value,profit',[id,symbol,units,investment,currentValue,profit]);
    await client.query('UPDATE users SET investment=investment+$1, profit=profit+$2 WHERE id=$3',[investment,profit,id]);
    await client.query('INSERT INTO admin_audit_log(action,subject_user_id,details) VALUES($1,$2,$3)',['holding_added',id,JSON.stringify({symbol,units,investment,currentValue,profit})]);
    await client.query('COMMIT');
    res.json({success:true,holding:h.rows[0]});
  } catch(e){try{await client.query('ROLLBACK')}catch(_){};console.error(e);res.status(500).json({error:'Unable to add invested stock'});} finally{client.release();}
});

app.get('/api/admin/customers/:id/holdings', requireAuth, requireAdmin, async (req,res)=>{
  try {const id=Number(req.params.id);const r=await pool.query('SELECT id,symbol,units,investment,current_value,profit,created_at FROM holdings WHERE user_id=$1 ORDER BY id DESC',[id]);res.json({holdings:r.rows});}
  catch(e){console.error(e);res.status(500).json({error:'Unable to load holdings'});}
});

app.get(
  "/api/admin/transactions",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
           t.id,
           t.type,
           t.amount,
           t.status,
           t.description,
           t.payment_reference,
           t.created_at,
           t.customer_reference,
           COALESCE(u.name, t.customer_reference, 'Deleted customer') AS name,
           u.email
         FROM transactions t
         LEFT JOIN users u ON u.id = t.user_id
         ORDER BY t.created_at DESC`
      );

      res.json({ transactions: result.rows });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "Unable to load transactions"
      });
    }
  }
);

app.patch(
  "/api/admin/transactions/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({
          error: "Invalid transaction status"
        });
      }

      const result = await pool.query(
        `WITH updated AS (
           UPDATE transactions
           SET status = $1
           WHERE id = $2 AND status = 'pending'
           RETURNING *
         ),
         credited AS (
           UPDATE users
           SET balance = COALESCE(balance, 0) + updated.amount
           FROM updated
           WHERE $1 = 'approved'
             AND updated.type = 'funding'
             AND users.id = updated.user_id
           RETURNING users.id
         )
         SELECT updated.* FROM updated CROSS JOIN (SELECT COUNT(*) FROM credited) AS credit_effect`,
        [status, id]
      );

      if (!result.rows.length) {
        const exists = await pool.query('SELECT id, status FROM transactions WHERE id=$1', [id]);
        if (!exists.rows.length) return res.status(404).json({ error: "Transaction not found" });
        return res.status(409).json({ error: `This request is already ${exists.rows[0].status}; only pending requests can be changed.` });
      }
      await pool.query('INSERT INTO admin_audit_log(action,details) VALUES($1,$2)', ['transaction_status_updated', JSON.stringify({ transactionId:id, status })]);
      res.json({ success: true, transaction: result.rows[0] });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "Unable to update transaction"
      });
    }
  }
);

/* ---------- WEBSITE ---------- */

app.get('/health', (_req, res) => res.json({ ok:true, service:'tesla-asset-markets' }));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.static(path.join(__dirname, 'customer')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'customer', 'index.html')));
app.get('/customer', (_req, res) => res.sendFile(path.join(__dirname, 'customer', 'index.html')));
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error:'API endpoint not found' });
  return res.sendFile(path.join(__dirname, 'customer', 'index.html'));
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Tesla Asset Markets running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Startup failed:", error);
    process.exit(1);
  });
