# KAM AI Backend

**The Grammarly of AI Compliance** - Backend API for monitoring AI tool usage and detecting sensitive data leaks.

## Phase 1: Detection Mode

This backend captures prompts from the Chrome extension, scans for sensitive data (SSN, credit cards, emails, code, etc.), and provides dashboard APIs for compliance reporting.

## Quick Deploy to Railway

### Step 1: Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### Step 2: Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Connect your GitHub and select this repo

### Step 3: Add PostgreSQL
1. In your Railway project, click "New"
2. Select "Database" → "Add PostgreSQL"
3. Railway auto-connects DATABASE_URL

### Step 4: Set Environment Variables
In Railway dashboard → Variables:
```
JWT_SECRET=generate-a-random-32-char-string
NODE_ENV=production
```

### Step 5: Run Database Schema
1. Click on your PostgreSQL service in Railway
2. Go to "Query" tab
3. Paste contents of `schema.sql` and run

### Step 6: Get Your API URL
Railway gives you a URL like: `https://kam-ai-backend-production.up.railway.app`

## API Endpoints

### Public
- `GET /` - Service info
- `GET /health` - Health check

### Auth
- `POST /api/org/register` - Register new organization
- `POST /api/auth/login` - Admin login

### Capture (from Chrome Extension)
- `POST /api/capture` - Capture a prompt

### Dashboard (requires JWT)
- `GET /api/dashboard/summary` - Usage summary
- `GET /api/dashboard/trend` - Daily trend data
- `GET /api/dashboard/risks` - Flagged prompts
- `GET /api/dashboard/users` - User activity
- `GET /api/prompts/:id` - Prompt details

## Test Locally

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env

# Start PostgreSQL (Docker)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password -e POSTGRES_DB=kamai postgres:15

# Update .env with local DB URL
DATABASE_URL=postgresql://postgres:password@localhost:5432/kamai

# Run schema
psql $DATABASE_URL -f schema.sql

# Start server
npm run dev
```

## Test API

```bash
# Register org
curl -X POST http://localhost:3000/api/org/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Corp",
    "domain": "testcorp.com",
    "admin_email": "admin@testcorp.com",
    "admin_password": "securepass123",
    "admin_name": "Test Admin"
  }'

# Capture a test prompt
curl -X POST http://localhost:3000/api/capture \
  -H "Content-Type: application/json" \
  -d '{
    "org_id": "YOUR_ORG_ID",
    "user_email": "employee@testcorp.com",
    "ai_tool": "chatgpt",
    "prompt_text": "My SSN is 123-45-6789 and my email is john@company.com",
    "url": "https://chat.openai.com"
  }'
```

## Risk Detection Patterns

| Type | Level | Example |
|------|-------|---------|
| SSN | Critical | 123-45-6789 |
| Credit Card | Critical | 4111-1111-1111-1111 |
| Email | High | user@domain.com |
| Phone | Medium | (555) 123-4567 |
| API Key | High | api_key=abc123... |
| Code | Medium | function foo() {} |

## Next Steps

1. ✅ Backend deployed
2. 🔲 Build Chrome extension (Week 2)
3. 🔲 Build React dashboard (Week 6-9)
4. 🔲 Add Phase 2 prevention features (Week 12+)

---

Built for Founders Institute Spring 2026 cohort.
