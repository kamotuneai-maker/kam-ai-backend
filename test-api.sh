#!/bin/bash
# KAM AI Backend Test Script
# Run this after deploying to Railway

BASE_URL="${1:-http://localhost:3000}"

echo "🧪 Testing KAM AI Backend at $BASE_URL"
echo "========================================"

# Test 1: Health check
echo -e "\n1️⃣ Health Check..."
curl -s "$BASE_URL/health" | head -c 200
echo ""

# Test 2: Register organization
echo -e "\n2️⃣ Registering Test Organization..."
REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/org/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo Corp",
    "domain": "democorp.com",
    "admin_email": "ciso@democorp.com",
    "admin_password": "demo123secure",
    "admin_name": "Demo CISO"
  }')
echo $REGISTER_RESPONSE | head -c 300
ORG_ID=$(echo $REGISTER_RESPONSE | grep -o '"org_id":"[^"]*"' | cut -d'"' -f4)
TOKEN=$(echo $REGISTER_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo -e "\n   ORG_ID: $ORG_ID"

# Test 3: Capture prompts with sensitive data
echo -e "\n3️⃣ Capturing Test Prompts..."

# Prompt with SSN (Critical)
curl -s -X POST "$BASE_URL/api/capture" \
  -H "Content-Type: application/json" \
  -d "{
    \"org_id\": \"$ORG_ID\",
    \"user_email\": \"john@democorp.com\",
    \"ai_tool\": \"chatgpt\",
    \"prompt_text\": \"Can you help me update this employee record? SSN: 123-45-6789\",
    \"url\": \"https://chat.openai.com\"
  }" | head -c 200
echo ""

# Prompt with credit card (Critical)
curl -s -X POST "$BASE_URL/api/capture" \
  -H "Content-Type: application/json" \
  -d "{
    \"org_id\": \"$ORG_ID\",
    \"user_email\": \"jane@democorp.com\",
    \"ai_tool\": \"claude\",
    \"prompt_text\": \"Process this payment: 4111-1111-1111-1111 exp 12/25\",
    \"url\": \"https://claude.ai\"
  }" | head -c 200
echo ""

# Prompt with email (High)
curl -s -X POST "$BASE_URL/api/capture" \
  -H "Content-Type: application/json" \
  -d "{
    \"org_id\": \"$ORG_ID\",
    \"user_email\": \"bob@democorp.com\",
    \"ai_tool\": \"gemini\",
    \"prompt_text\": \"Write an email to sarah.johnson@competitor.com about our Q4 strategy\",
    \"url\": \"https://gemini.google.com\"
  }" | head -c 200
echo ""

# Clean prompt (No risk)
curl -s -X POST "$BASE_URL/api/capture" \
  -H "Content-Type: application/json" \
  -d "{
    \"org_id\": \"$ORG_ID\",
    \"user_email\": \"alice@democorp.com\",
    \"ai_tool\": \"copilot\",
    \"prompt_text\": \"What are some good team building activities for remote workers?\",
    \"url\": \"https://copilot.microsoft.com\"
  }" | head -c 200
echo ""

# Test 4: Get dashboard summary
echo -e "\n4️⃣ Fetching Dashboard Summary..."
curl -s "$BASE_URL/api/dashboard/summary" \
  -H "Authorization: Bearer $TOKEN" | head -c 400
echo ""

# Test 5: Get flagged risks
echo -e "\n5️⃣ Fetching Flagged Risks..."
curl -s "$BASE_URL/api/dashboard/risks?level=critical" \
  -H "Authorization: Bearer $TOKEN" | head -c 500
echo ""

echo -e "\n========================================"
echo "✅ Tests complete!"
echo ""
echo "📋 Save these for later:"
echo "   ORG_ID: $ORG_ID"
echo "   Admin Email: ciso@democorp.com"
echo "   Admin Password: demo123secure"
echo ""
echo "🚀 Next step: Deploy to Railway!"
