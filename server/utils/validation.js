import mongoose from 'mongoose';

export function validateRequired(obj, fields) {
  const missing = [];
  for (const field of fields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      missing.push(field);
    }
  }
  return {
    valid: missing.length === 0,
    missing,
    error: missing.length > 0 ? `Missing required fields: ${missing.join(', ')}` : null
  };
}

export function isPositiveNumber(val) {
  const num = Number(val);
  return !isNaN(num) && num > 0;
}

export function isValidDate(val) {
  if (!val) return false;
  const d = new Date(val);
  return !isNaN(d.getTime());
}

export function isValidObjectId(val) {
  if (!val) return false;
  return mongoose.Types.ObjectId.isValid(val);
}

export function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
}
