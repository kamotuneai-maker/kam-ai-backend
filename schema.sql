-- KAM AI Database Schema
-- Phase 1: Detection & Audit Trail

-- Organizations (your customers)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users within organizations (employees being monitored)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    department VARCHAR(100),
    role VARCHAR(50) DEFAULT 'employee',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP,
    UNIQUE(org_id, email)
);

-- Admin users (CISOs who access dashboard)
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Captured prompts (the core data)
CREATE TABLE IF NOT EXISTS prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    ai_tool VARCHAR(50) NOT NULL, -- 'chatgpt', 'claude', 'gemini', 'copilot'
    prompt_text TEXT NOT NULL,
    prompt_preview VARCHAR(100), -- First 100 chars for quick display
    char_count INTEGER,
    captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    url VARCHAR(500),
    session_id VARCHAR(100)
);

-- Risk flags (detected sensitive data)
CREATE TABLE IF NOT EXISTS risk_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id UUID REFERENCES prompts(id) ON DELETE CASCADE,
    risk_type VARCHAR(50) NOT NULL, -- 'ssn', 'credit_card', 'email', 'phone', 'code', 'pii', 'phi'
    risk_level VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'critical'
    matched_pattern VARCHAR(255), -- What regex matched
    masked_value VARCHAR(255), -- e.g., "***-**-1234" for SSN
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_prompts_org_id ON prompts(org_id);
CREATE INDEX IF NOT EXISTS idx_prompts_user_id ON prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_prompts_captured_at ON prompts(captured_at);
CREATE INDEX IF NOT EXISTS idx_prompts_ai_tool ON prompts(ai_tool);
CREATE INDEX IF NOT EXISTS idx_risk_flags_prompt_id ON risk_flags(prompt_id);
CREATE INDEX IF NOT EXISTS idx_risk_flags_risk_level ON risk_flags(risk_level);
CREATE INDEX IF NOT EXISTS idx_users_org_id ON users(org_id);

-- View for dashboard summary
CREATE OR REPLACE VIEW prompt_risk_summary AS
SELECT 
    p.org_id,
    p.ai_tool,
    DATE(p.captured_at) as date,
    COUNT(DISTINCT p.id) as total_prompts,
    COUNT(DISTINCT CASE WHEN rf.risk_level = 'critical' THEN p.id END) as critical_count,
    COUNT(DISTINCT CASE WHEN rf.risk_level = 'high' THEN p.id END) as high_count,
    COUNT(DISTINCT CASE WHEN rf.risk_level = 'medium' THEN p.id END) as medium_count,
    COUNT(DISTINCT CASE WHEN rf.risk_level = 'low' THEN p.id END) as low_count
FROM prompts p
LEFT JOIN risk_flags rf ON p.id = rf.prompt_id
GROUP BY p.org_id, p.ai_tool, DATE(p.captured_at);
