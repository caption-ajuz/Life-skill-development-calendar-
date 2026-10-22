// Formatting utilities for Indian locale

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function formatCurrency(n) {
  if (n == null || isNaN(n)) return '₹0';
  const num = Number(n);
  const isNeg = num < 0;
  const abs = Math.abs(num);
  const [intPart, decPart] = abs.toFixed(2).split('.');
  // Indian numbering: last 3 digits, then groups of 2
  let result = '';
  const len = intPart.length;
  if (len <= 3) {
    result = intPart;
  } else {
    result = intPart.slice(len - 3);
    let remaining = intPart.slice(0, len - 3);
    while (remaining.length > 2) {
      result = remaining.slice(remaining.length - 2) + ',' + result;
      remaining = remaining.slice(0, remaining.length - 2);
    }
    if (remaining.length > 0) {
      result = remaining + ',' + result;
    }
  }
  const formatted = decPart === '00' ? result : result + '.' + decPart;
  return (isNeg ? '-₹' : '₹') + formatted;
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h}:${min} ${ampm}`;
}

export function formatRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = now - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''} ago`;
  return formatDate(iso);
}

export function formatNumber(n) {
  if (n == null || isNaN(n)) return '0';
  const num = Number(n);
  const isNeg = num < 0;
  const abs = Math.abs(Math.floor(num));
  const str = String(abs);
  const len = str.length;
  if (len <= 3) return (isNeg ? '-' : '') + str;
  let result = str.slice(len - 3);
  let remaining = str.slice(0, len - 3);
  while (remaining.length > 2) {
    result = remaining.slice(remaining.length - 2) + ',' + result;
    remaining = remaining.slice(0, remaining.length - 2);
  }
  if (remaining.length > 0) {
    result = remaining + ',' + result;
  }
  return (isNeg ? '-' : '') + result;
}
