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
      `SELECT id, type, amount, status, created_at
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

    await pool.query(
      `INSERT INTO transactions (user_id, type, amount, status)
       VALUES ($1, 'funding', $2, 'pending')`,
      [req.user.id, amount]
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
  try {
    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Enter a valid amount"
      });
    }

    const userResult = await pool.query(
      "SELECT balance FROM users WHERE id = $1",
      [req.user.id]
    );

    const balance = Number(userResult.rows[0]?.balance || 0);

    if (amount > balance) {
      return res.status(400).json({
        error: "Insufficient available balance"
      });
    }

    await pool.query(
      `INSERT INTO transactions (user_id, type, amount, status)
       VALUES ($1, 'withdrawal', $2, 'pending')`,
      [req.user.id, amount]
    );

    res.json({
      success: true,
      message: "Withdrawal request submitted"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Unable to submit withdrawal"
    });
  }
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
      const { balance, investment, profit } = req.body;

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
           t.created_at,
           u.name,
           u.email
         FROM transactions t
         JOIN users u ON u.id = t.user_id
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
        `UPDATE transactions
         SET status = $1
         WHERE id = $2
         RETURNING *`,
        [status, id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          error: "Transaction not found"
        });
      }

      res.json({
        success: true,
        transaction: result.rows[0]
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "Unable to update transaction"
      });
    }
  }
);

/* ---------- WEBSITE ---------- */

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "customer")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "customer", "index.html"));
});

app.get("/customer", (req, res) => {
  res.sendFile(path.join(__dirname, "customer", "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "index.html"));
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "customer", "index.html"));
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
