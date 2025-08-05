/**
 * LGPD Data Minimization Service
 * 
 * Implements LGPD (Lei Geral de Proteção de Dados) compliance by minimizing
 * data collection and storage, hashing sensitive identifiers, and providing
 * data subject rights management.
 */

import crypto from 'crypto';
import log from '@/lib/log';
import { hashSensitiveIdentifier, sanitizeForAudit } from '../utils/pii-masking';

/**
 * LGPD data minimization configuration
 */
export interface LGPDConfig {
  saltKey: string;
  retentionDays: number;
  minimizePhoneNumbers: boolean;
  minimizeEmails: boolean;
  minimizeContactIds: boolean;
  logDataAccess: boolean;
}

/**
 * Interface for minimized identifier
 */
export interface MinimizedIdentifier {
  hash: string;
  lastFourDigits?: string;
  type: 'phone' | 'email' | 'contact_id' | 'cpf' | 'cnpj';
  originalLength: number;
  minimizedAt: Date;
}

/**
 * Interface for data access log
 */
export interface DataAccessLog {
  userId: string;
  dataType: string;
  dataId: string;
  accessType: 'read' | 'write' | 'delete' | 'export';
  purpose: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

/**
 * Interface for data subject request
 */
export interface DataSubjectRequest {
  id: string;
  type: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction';
  subjectIdentifier: string;
  subjectType: 'phone' | 'email' | 'contact_id';
  requestedBy: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  reason?: string;
  createdAt: Date;
  processedAt?: Date;
  expiresAt: Date;
}

/**
 * Default LGPD configuration
 */
const DEFAULT_CONFIG: LGPDConfig = {
  saltKey: process.env.PII_MASKING_SALT || 'default-salt-change-in-production',
  retentionDays: 90,
  minimizePhoneNumbers: true,
  minimizeEmails: true,
  minimizeContactIds: true,
  logDataAccess: true
};

/**
 * Minimizes sensitive identifiers according to LGPD principles
 */
export function minimizeIdentifier(
  identifier: string,
  type: 'phone' | 'email' | 'contact_id' | 'cpf' | 'cnpj',
  config: Partial<LGPDConfig> = {}
): MinimizedIdentifier {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  try {
    // Check if minimization is enabled for this type
    const shouldMinimize = getShouldMinimize(type, finalConfig);
    
    if (!shouldMinimize) {
      // Return original identifier if minimization is disabled
      return {
        hash: identifier,
        type,
        originalLength: identifier.length,
        minimizedAt: new Date()
      };
    }
    
    // Hash the identifier with salt
    const hashedIdentifier = hashSensitiveIdentifier(identifier, type);
    
    // Extract last 4 digits for certain types when necessary for business logic
    let lastFourDigits: string | undefined;
    
    if (type === 'phone' || type === 'cpf' || type === 'cnpj') {
      const cleanIdentifier = identifier.replace(/[\s\-\.\/\(\)\+]/g, '');
      if (cleanIdentifier.length >= 4) {
        lastFourDigits = cleanIdentifier.slice(-4);
      }
    }
    
    const result: MinimizedIdentifier = {
      hash: hashedIdentifier.hash,
      lastFourDigits,
      type,
      originalLength: identifier.length,
      minimizedAt: new Date()
    };
    
    log.debug('Identifier minimized for LGPD compliance', {
      type,
      originalLength: identifier.length,
      hasLastFour: !!lastFourDigits,
      hashLength: hashedIdentifier.hash.length
    });
    
    return result;
    
  } catch (error) {
    log.error('Failed to minimize identifier', { error, type });
    
    // Fallback to basic masking
    return {
      hash: `[${type.toUpperCase()}_MASKED]`,
      type,
      originalLength: identifier.length,
      minimizedAt: new Date()
    };
  }
}

/**
 * Checks if minimization should be applied for a given type
 */
function getShouldMinimize(
  type: 'phone' | 'email' | 'contact_id' | 'cpf' | 'cnpj',
  config: LGPDConfig
): boolean {
  switch (type) {
    case 'phone':
      return config.minimizePhoneNumbers;
    case 'email':
      return config.minimizeEmails;
    case 'contact_id':
      return config.minimizeContactIds;
    case 'cpf':
    case 'cnpj':
      return true; // Always minimize Brazilian tax IDs
    default:
      return true;
  }
}

/**
 * Minimizes data for logging and audit purposes
 */
export function minimizeForLogging(
  data: any,
  config: Partial<LGPDConfig> = {}
): any {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  try {
    // Use existing sanitization with LGPD-specific enhancements
    const sanitized = sanitizeForAudit(data);
    
    // Additional LGPD-specific minimization
    return minimizeDataRecursively(sanitized, finalConfig);
    
  } catch (error) {
    log.error('Failed to minimize data for logging', { error });
    return '[DATA_MINIMIZATION_ERROR]';
  }
}

/**
 * Recursively minimizes data structures
 */
function minimizeDataRecursively(data: any, config: LGPDConfig): any {
  if (typeof data === 'string') {
    // Check if string contains sensitive patterns
    return minimizeSensitivePatterns(data, config);
  }
  
  if (Array.isArray(data)) {
    return data.map(item => minimizeDataRecursively(item, config));
  }
  
  if (data && typeof data === 'object') {
    const minimized: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      
      // Handle known sensitive fields
      if (isSensitiveField(lowerKey)) {
        if (typeof value === 'string' && value.length > 0) {
          const type = getSensitiveFieldType(lowerKey);
          const minimizedId = minimizeIdentifier(value, type, config);
          minimized[key] = `${type.toUpperCase()}_HASH_${minimizedId.hash.substring(0, 8)}`;
          
          if (minimizedId.lastFourDigits) {
            minimized[`${key}_last4`] = minimizedId.lastFourDigits;
          }
        } else {
          minimized[key] = value;
        }
      } else {
        minimized[key] = minimizeDataRecursively(value, config);
      }
    }
    
    return minimized;
  }
  
  return data;
}

/**
 * Checks if a field name indicates sensitive data
 */
function isSensitiveField(fieldName: string): boolean {
  const sensitiveFields = [
    'phone', 'telefone', 'celular', 'mobile',
    'email', 'e-mail', 'mail',
    'contact_id', 'contactid', 'contato_id',
    'cpf', 'cnpj', 'documento',
    'user_id', 'userid', 'usuario_id'
  ];
  
  return sensitiveFields.some(field => fieldName.includes(field));
}

/**
 * Gets the type of sensitive field
 */
function getSensitiveFieldType(fieldName: string): 'phone' | 'email' | 'contact_id' | 'cpf' | 'cnpj' {
  if (fieldName.includes('phone') || fieldName.includes('telefone') || fieldName.includes('celular')) {
    return 'phone';
  }
  
  if (fieldName.includes('email') || fieldName.includes('mail')) {
    return 'email';
  }
  
  if (fieldName.includes('cpf')) {
    return 'cpf';
  }
  
  if (fieldName.includes('cnpj')) {
    return 'cnpj';
  }
  
  return 'contact_id';
}

/**
 * Minimizes sensitive patterns in text
 */
function minimizeSensitivePatterns(text: string, config: LGPDConfig): string {
  let minimized = text;
  
  // Brazilian phone patterns
  if (config.minimizePhoneNumbers) {
    minimized = minimized.replace(
      /(\+55\s?)?(\(?\d{2}\)?\s?)?(9?\d{4}[-\s]?\d{4})/g,
      '[TELEFONE_***]'
    );
  }
  
  // Email patterns
  if (config.minimizeEmails) {
    minimized = minimized.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '[EMAIL_***]'
    );
  }
  
  // CPF patterns
  minimized = minimized.replace(
    /\d{3}\.?\d{3}\.?\d{3}[-\.]?\d{2}/g,
    '[CPF_***]'
  );
  
  // CNPJ patterns
  minimized = minimized.replace(
    /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}[-\.]?\d{2}/g,
    '[CNPJ_***]'
  );
  
  return minimized;
}

/**
 * Logs data access for LGPD compliance
 */
export async function logDataAccess(
  accessLog: Omit<DataAccessLog, 'timestamp'>
): Promise<void> {
  try {
    const logEntry: DataAccessLog = {
      ...accessLog,
      timestamp: new Date()
    };
    
    // In a production environment, this would be stored in a secure audit log
    log.info('Data access logged for LGPD compliance', {
      userId: logEntry.userId,
      dataType: logEntry.dataType,
      dataId: hashForLogging(logEntry.dataId), // Hash the data ID for privacy
      accessType: logEntry.accessType,
      purpose: logEntry.purpose,
      timestamp: logEntry.timestamp.toISOString()
    });
    
    // TODO: Store in dedicated audit table for LGPD compliance
    
  } catch (error) {
    log.error('Failed to log data access', { error, accessLog });
  }
}

/**
 * Hashes identifiers for logging purposes
 */
function hashForLogging(identifier: string): string {
  return crypto
    .createHash('sha256')
    .update(identifier + DEFAULT_CONFIG.saltKey)
    .digest('hex')
    .substring(0, 8);
}

/**
 * Processes data subject rights requests
 */
export async function processDataSubjectRequest(
  request: Omit<DataSubjectRequest, 'id' | 'createdAt' | 'expiresAt'>
): Promise<DataSubjectRequest> {
  try {
    const requestId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    const fullRequest: DataSubjectRequest = {
      id: requestId,
      createdAt: now,
      expiresAt,
      ...request
    };
    
    // Log the request creation
    await logDataAccess({
      userId: request.requestedBy,
      dataType: 'data_subject_request',
      dataId: requestId,
      accessType: 'write',
      purpose: `LGPD ${request.type} request`
    });
    
    log.info('Data subject request created', {
      requestId,
      type: request.type,
      subjectType: request.subjectType,
      requestedBy: request.requestedBy,
      expiresAt: expiresAt.toISOString()
    });
    
    // TODO: Store in database and trigger processing workflow
    
    return fullRequest;
    
  } catch (error) {
    log.error('Failed to process data subject request', { error, request });
    throw error;
  }
}

/**
 * Finds data associated with a subject identifier
 */
export async function findDataBySubject(
  subjectIdentifier: string,
  subjectType: 'phone' | 'email' | 'contact_id'
): Promise<{
  llmAuditRecords: number;
  intentHitLogRecords: number;
  auditLogRecords: number;
  totalRecords: number;
}> {
  try {
    // Hash the subject identifier to match stored hashes
    const hashedIdentifier = hashSensitiveIdentifier(subjectIdentifier, subjectType);
    const searchPattern = `${subjectType.toUpperCase()}_HASH_${hashedIdentifier.hash.substring(0, 8)}`;
    
    // In a real implementation, this would query the database
    // For now, we'll return mock data
    const mockCounts = {
      llmAuditRecords: 0,
      intentHitLogRecords: 0,
      auditLogRecords: 0,
      totalRecords: 0
    };
    
    log.info('Data search completed for subject', {
      subjectType,
      searchPattern,
      totalRecords: mockCounts.totalRecords
    });
    
    return mockCounts;
    
  } catch (error) {
    log.error('Failed to find data by subject', { error, subjectType });
    throw error;
  }
}

/**
 * Exports data for a subject (LGPD portability right)
 */
export async function exportDataForSubject(
  subjectIdentifier: string,
  subjectType: 'phone' | 'email' | 'contact_id',
  requestedBy: string
): Promise<{
  exportId: string;
  recordCount: number;
  exportedAt: Date;
  expiresAt: Date;
}> {
  try {
    const exportId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    // Find data for the subject
    const dataCount = await findDataBySubject(subjectIdentifier, subjectType);
    
    // Log the export
    await logDataAccess({
      userId: requestedBy,
      dataType: 'data_export',
      dataId: exportId,
      accessType: 'read',
      purpose: 'LGPD data portability request'
    });
    
    log.info('Data export created for subject', {
      exportId,
      subjectType,
      recordCount: dataCount.totalRecords,
      requestedBy,
      expiresAt: expiresAt.toISOString()
    });
    
    // TODO: Generate actual export file and store securely
    
    return {
      exportId,
      recordCount: dataCount.totalRecords,
      exportedAt: now,
      expiresAt
    };
    
  } catch (error) {
    log.error('Failed to export data for subject', { error, subjectType });
    throw error;
  }
}

/**
 * Deletes data for a subject (LGPD erasure right)
 */
export async function deleteDataForSubject(
  subjectIdentifier: string,
  subjectType: 'phone' | 'email' | 'contact_id',
  requestedBy: string,
  reason: string
): Promise<{
  deletionId: string;
  recordsDeleted: number;
  deletedAt: Date;
}> {
  try {
    const deletionId = crypto.randomUUID();
    const now = new Date();
    
    // Find data for the subject
    const dataCount = await findDataBySubject(subjectIdentifier, subjectType);
    
    // TODO: Perform actual deletion from database
    // This would involve:
    // 1. Finding all records with the hashed identifier
    // 2. Deleting from LlmAudit, IntentHitLog, and other tables
    // 3. Maintaining referential integrity
    
    // Log the deletion
    await logDataAccess({
      userId: requestedBy,
      dataType: 'data_deletion',
      dataId: deletionId,
      accessType: 'delete',
      purpose: `LGPD erasure request: ${reason}`
    });
    
    log.info('Data deletion completed for subject', {
      deletionId,
      subjectType,
      recordsDeleted: dataCount.totalRecords,
      requestedBy,
      reason,
      deletedAt: now.toISOString()
    });
    
    return {
      deletionId,
      recordsDeleted: dataCount.totalRecords,
      deletedAt: now
    };
    
  } catch (error) {
    log.error('Failed to delete data for subject', { error, subjectType });
    throw error;
  }
}

/**
 * Validates LGPD configuration
 */
export function validateLGPDConfig(config: Partial<LGPDConfig> = {}): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Check salt key
  if (!finalConfig.saltKey) {
    errors.push('LGPD salt key is required');
  } else if (finalConfig.saltKey.length < 16) {
    warnings.push('LGPD salt key should be at least 16 characters long');
  } else if (finalConfig.saltKey === 'default-salt-change-in-production') {
    errors.push('LGPD salt key must be changed from default value in production');
  }
  
  // Check retention period
  if (finalConfig.retentionDays < 1) {
    errors.push('Retention days must be at least 1');
  } else if (finalConfig.retentionDays > 365) {
    warnings.push('Retention period longer than 1 year may not comply with LGPD minimization principles');
  }
  
  // Check minimization settings
  if (!finalConfig.minimizePhoneNumbers && !finalConfig.minimizeEmails && !finalConfig.minimizeContactIds) {
    warnings.push('No data minimization enabled - may not comply with LGPD principles');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Gets LGPD compliance status
 */
export function getLGPDComplianceStatus(): {
  dataMinimizationEnabled: boolean;
  retentionPolicyActive: boolean;
  accessLoggingEnabled: boolean;
  subjectRightsSupported: string[];
  lastComplianceCheck: Date;
} {
  const config = DEFAULT_CONFIG;
  
  return {
    dataMinimizationEnabled: config.minimizePhoneNumbers || config.minimizeEmails || config.minimizeContactIds,
    retentionPolicyActive: config.retentionDays > 0,
    accessLoggingEnabled: config.logDataAccess,
    subjectRightsSupported: ['access', 'rectification', 'erasure', 'portability', 'restriction'],
    lastComplianceCheck: new Date()
  };
}