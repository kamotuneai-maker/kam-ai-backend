require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const { scanPrompt, getOverallRiskLevel } = require('./riskEngine');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'kam-ai-dev-secret-change-in-production';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
  next();
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/', (req, res) => {
  res.json({ 
    service: 'KAM AI Backend',
    status: 'running',
    version: '1.0.0',
    phase: 'Phase 1 - Detection'
  });
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

// ============================================
// AUTH MIDDLEWARE
// ============================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
}

// ============================================
// ORGANIZATION SETUP
// ============================================
app.post('/api/org/register', async (req, res) => {
  const { name, domain, admin_email, admin_password, admin_name } = req.body;
  
  try {
    // Check if org already exists
    const existingOrg = await pool.query(
      'SELECT id FROM organizations WHERE domain = $1',
      [domain]
    );
    
    if (existingOrg.rows.length > 0) {
      return res.status(400).json({ error: 'Organization already registered' });
    }
    
    // Create organization
    const orgResult = await pool.query(
      'INSERT INTO organizations (name, domain) VALUES ($1, $2) RETURNING id',
      [name, domain]
    );
    const orgId = orgResult.rows[0].id;
    
    // Create admin user
    const passwordHash = await bcrypt.hash(admin_password, 10);
    await pool.query(
      'INSERT INTO admins (org_id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)',
      [orgId, admin_email, passwordHash, admin_name, 'admin']
    );
    
    // Generate token
    const token = jwt.sign({ orgId, email: admin_email, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    
    res.status(201).json({
      message: 'Organization registered successfully',
      org_id: orgId,
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const result = await pool.query(
      'SELECT a.*, o.name as org_name, o.domain FROM admins a JOIN organizations o ON a.org_id = o.id WHERE a.email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const admin = result.rows[0];
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { orgId: admin.org_id, email: admin.email, role: admin.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      org: { id: admin.org_id, name: admin.org_name, domain: admin.domain },
      admin: { email: admin.email, name: admin.name, role: admin.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ============================================
// PROMPT CAPTURE (from Chrome Extension)
// ============================================
app.post('/api/capture', async (req, res) => {
  const { org_id, user_email, ai_tool, prompt_text, url, session_id } = req.body;
  
  // Basic validation
  if (!org_id || !user_email || !ai_tool || !prompt_text) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    // Get or create user
    let userResult = await pool.query(
      'SELECT id FROM users WHERE org_id = $1 AND email = $2',
      [org_id, user_email]
    );
    
    let userId;
    if (userResult.rows.length === 0) {
      // Auto-create user on first prompt
      const newUser = await pool.query(
        'INSERT INTO users (org_id, email, last_active) VALUES ($1, $2, NOW()) RETURNING id',
        [org_id, user_email]
      );
      userId = newUser.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
      // Update last active
      await pool.query('UPDATE users SET last_active = NOW() WHERE id = $1', [userId]);
    }
    
    // Insert prompt
    const promptResult = await pool.query(
      `INSERT INTO prompts (user_id, org_id, ai_tool, prompt_text, prompt_preview, char_count, url, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [userId, org_id, ai_tool, prompt_text, prompt_text.substring(0, 100), prompt_text.length, url, session_id]
    );
    const promptId = promptResult.rows[0].id;
    
    // Scan for risks
    const risks = scanPrompt(prompt_text);
    
    // Insert risk flags
    for (const risk of risks) {
      await pool.query(
        `INSERT INTO risk_flags (prompt_id, risk_type, risk_level, matched_pattern, masked_value)
         VALUES ($1, $2, $3, $4, $5)`,
        [promptId, risk.risk_type, risk.risk_level, risk.matched_pattern, risk.masked_value]
      );
    }
    
    res.status(201).json({
      prompt_id: promptId,
      risks_detected: risks.length,
      overall_risk: getOverallRiskLevel(risks)
    });
  } catch (err) {
    console.error('Capture error:', err);
    res.status(500).json({ error: 'Failed to capture prompt' });
  }
});

// ============================================
// DASHBOARD APIs (requires auth)
// ============================================

// Get usage summary
app.get('/api/dashboard/summary', authenticateToken, async (req, res) => {
  const { orgId } = req.user;
  const { days = 30 } = req.query;
  
  try {
    // Total prompts
    const totalResult = await pool.query(
      `SELECT COUNT(*) as total FROM prompts WHERE org_id = $1 AND captured_at > NOW() - INTERVAL '${parseInt(days)} days'`,
      [orgId]
    );
    
    // Risk breakdown
    const riskResult = await pool.query(
      `SELECT rf.risk_level, COUNT(DISTINCT p.id) as count
       FROM prompts p
       LEFT JOIN risk_flags rf ON p.id = rf.prompt_id
       WHERE p.org_id = $1 AND p.captured_at > NOW() - INTERVAL '${parseInt(days)} days'
       GROUP BY rf.risk_level`,
      [orgId]
    );
    
    // By AI tool
    const toolResult = await pool.query(
      `SELECT ai_tool, COUNT(*) as count FROM prompts WHERE org_id = $1 AND captured_at > NOW() - INTERVAL '${parseInt(days)} days' GROUP BY ai_tool`,
      [orgId]
    );
    
    // Active users
    const usersResult = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as active_users FROM prompts WHERE org_id = $1 AND captured_at > NOW() - INTERVAL '${parseInt(days)} days'`,
      [orgId]
    );
    
    res.json({
      total_prompts: parseInt(totalResult.rows[0].total),
      risk_breakdown: riskResult.rows.reduce((acc, r) => {
        acc[r.risk_level || 'none'] = parseInt(r.count);
        return acc;
      }, {}),
      by_tool: toolResult.rows.reduce((acc, r) => {
        acc[r.ai_tool] = parseInt(r.count);
        return acc;
      }, {}),
      active_users: parseInt(usersResult.rows[0].active_users),
      period_days: parseInt(days)
    });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Get daily trend
app.get('/api/dashboard/trend', authenticateToken, async (req, res) => {
  const { orgId } = req.user;
  const { days = 30 } = req.query;
  
  try {
    const result = await pool.query(
      `SELECT DATE(captured_at) as date, COUNT(*) as prompts,
              COUNT(DISTINCT CASE WHEN rf.risk_level IN ('critical', 'high') THEN p.id END) as high_risk
       FROM prompts p
       LEFT JOIN risk_flags rf ON p.id = rf.prompt_id
       WHERE p.org_id = $1 AND p.captured_at > NOW() - INTERVAL '${parseInt(days)} days'
       GROUP BY DATE(captured_at)
       ORDER BY date`,
      [orgId]
    );
    
    res.json({ trend: result.rows });
  } catch (err) {
    console.error('Trend error:', err);
    res.status(500).json({ error: 'Failed to fetch trend' });
  }
});

// Get flagged prompts
app.get('/api/dashboard/risks', authenticateToken, async (req, res) => {
  const { orgId } = req.user;
  const { level, limit = 50, offset = 0 } = req.query;
  
  try {
    let query = `
      SELECT p.id, p.prompt_preview, p.ai_tool, p.captured_at, u.email as user_email,
             rf.risk_type, rf.risk_level, rf.masked_value
      FROM prompts p
      JOIN users u ON p.user_id = u.id
      JOIN risk_flags rf ON p.id = rf.prompt_id
      WHERE p.org_id = $1
    `;
    const params = [orgId];
    
    if (level) {
      query += ` AND rf.risk_level = $${params.length + 1}`;
      params.push(level);
    }
    
    query += ` ORDER BY p.captured_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, params);
    
    res.json({ risks: result.rows, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    console.error('Risks error:', err);
    res.status(500).json({ error: 'Failed to fetch risks' });
  }
});

// Get user activity
app.get('/api/dashboard/users', authenticateToken, async (req, res) => {
  const { orgId } = req.user;
  
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.department, u.last_active,
              COUNT(p.id) as total_prompts,
              COUNT(DISTINCT CASE WHEN rf.risk_level IN ('critical', 'high') THEN p.id END) as high_risk_count
       FROM users u
       LEFT JOIN prompts p ON u.id = p.user_id
       LEFT JOIN risk_flags rf ON p.id = rf.prompt_id
       WHERE u.org_id = $1
       GROUP BY u.id
       ORDER BY total_prompts DESC`,
      [orgId]
    );
    
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single prompt details (for investigation)
app.get('/api/prompts/:id', authenticateToken, async (req, res) => {
  const { orgId } = req.user;
  const { id } = req.params;
  
  try {
    const promptResult = await pool.query(
      `SELECT p.*, u.email as user_email FROM prompts p JOIN users u ON p.user_id = u.id WHERE p.id = $1 AND p.org_id = $2`,
      [id, orgId]
    );
    
    if (promptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    
    const risksResult = await pool.query(
      'SELECT * FROM risk_flags WHERE prompt_id = $1',
      [id]
    );
    
    res.json({
      prompt: promptResult.rows[0],
      risks: risksResult.rows
    });
  } catch (err) {
    console.error('Prompt detail error:', err);
    res.status(500).json({ error: 'Failed to fetch prompt' });
  }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║           KAM AI Backend v1.0             ║
║         Phase 1: Detection Mode           ║
╠═══════════════════════════════════════════╣
║  Server running on port ${PORT}              ║
║  Ready to capture AI usage data           ║
╚═══════════════════════════════════════════╝
  `);
});
