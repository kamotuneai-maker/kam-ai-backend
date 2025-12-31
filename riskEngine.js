/**
 * KAM AI Risk Detection Engine
 * Scans prompts for sensitive data patterns
 */

const RISK_PATTERNS = {
  // Critical - immediate data breach risk
  ssn: {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    level: 'critical',
    description: 'Social Security Number'
  },
  credit_card: {
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    level: 'critical',
    description: 'Credit Card Number'
  },
  
  // High - PII exposure
  email: {
    pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    level: 'high',
    description: 'Email Address'
  },
  phone: {
    pattern: /\b\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    level: 'medium',
    description: 'Phone Number'
  },
  
  // High - PHI (healthcare)
  medical_record: {
    pattern: /\b(MRN|medical record|patient id)[:\s]?\d+\b/gi,
    level: 'critical',
    description: 'Medical Record Number'
  },
  
  // High - Financial
  bank_account: {
    pattern: /\b(account|routing)[:\s#]?\d{8,17}\b/gi,
    level: 'critical',
    description: 'Bank Account/Routing Number'
  },
  
  // Medium - Code detection (proprietary info)
  code_block: {
    pattern: /(function\s+\w+|const\s+\w+\s*=|import\s+.*from|class\s+\w+|def\s+\w+|public\s+class)/g,
    level: 'medium',
    description: 'Source Code'
  },
  
  // Medium - API keys and secrets
  api_key: {
    pattern: /(api[_-]?key|secret[_-]?key|access[_-]?token)[:\s=]["']?[\w-]{20,}["']?/gi,
    level: 'high',
    description: 'API Key or Secret'
  },
  
  // Low - Names (context dependent)
  person_name: {
    pattern: /\b(Mr\.|Mrs\.|Ms\.|Dr\.)\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,
    level: 'low',
    description: 'Person Name with Title'
  }
};

/**
 * Mask sensitive data for display
 */
function maskValue(value, type) {
  if (!value) return null;
  
  switch (type) {
    case 'ssn':
      return `***-**-${value.slice(-4)}`;
    case 'credit_card':
      return `****-****-****-${value.replace(/\D/g, '').slice(-4)}`;
    case 'email':
      const [user, domain] = value.split('@');
      return `${user[0]}***@${domain}`;
    case 'phone':
      return `(***) ***-${value.replace(/\D/g, '').slice(-4)}`;
    default:
      return value.length > 10 ? `${value.slice(0, 4)}...${value.slice(-4)}` : '****';
  }
}

/**
 * Scan prompt text for sensitive data
 * @param {string} text - The prompt to scan
 * @returns {Array} - Array of detected risks
 */
function scanPrompt(text) {
  const risks = [];
  
  for (const [type, config] of Object.entries(RISK_PATTERNS)) {
    const matches = text.match(config.pattern);
    
    if (matches) {
      matches.forEach(match => {
        risks.push({
          risk_type: type,
          risk_level: config.level,
          matched_pattern: config.description,
          masked_value: maskValue(match, type)
        });
      });
    }
  }
  
  return risks;
}

/**
 * Get overall risk level for a prompt
 */
function getOverallRiskLevel(risks) {
  if (risks.length === 0) return 'none';
  
  const levels = ['critical', 'high', 'medium', 'low'];
  for (const level of levels) {
    if (risks.some(r => r.risk_level === level)) {
      return level;
    }
  }
  return 'low';
}

module.exports = {
  scanPrompt,
  getOverallRiskLevel,
  RISK_PATTERNS
};
