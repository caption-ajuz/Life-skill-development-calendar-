import AuditLog from '../models/AuditLog.js';

export async function logAudit({
  entityType,
  entityId,
  action,
  oldValues = null,
  newValues = null,
  performedBy,
  ipAddress = ''
}) {
  try {
    return await AuditLog.create({
      entityType,
      entityId,
      action,
      oldValues,
      newValues,
      performedBy,
      ipAddress
    });
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
    return null;
  }
}
