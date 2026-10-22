import api from '../services/api.js';
import db from '../services/db.js';
import { generateClientId, refreshPendingCount } from '../services/sync.js';
import { formatCurrency, formatDate } from '../utils/format.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Collections() {
  const [areas, setAreas] = useState([]);
  const [areaId, setAreaId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [sendThankYou, setSendThankYou] = useState(false);
  const [donorPhone, setDonorPhone] = useState('');
  const [donorName, setDonorName] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentEntries, setRecentEntries] = useState([]);

  const loadAreas = async () => {
    try {
      const res = await api.get('/api/areas');
      if (res && res.success && res.data) setAreas(res.data);
    } catch (err) {
      console.warn('Could not fetch areas:', err);
    }
  };

  const loadRecent = async () => {
    try {
      const res = await api.get('/api/collections', { limit: 10 });
      if (res && res.success && res.data) {
        setRecentEntries(res.data.collections || []);
      }
    } catch (err) {
      console.warn('Could not fetch collections:', err);
    }
  };

  useEffect(() => {
    loadAreas();
    loadRecent();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      if (window.showToast) window.showToast('Please enter a valid collection amount.', 'error');
      return;
    }

    setLoading(true);

    try {
      const clientId = generateClientId();
      const entryData = {
        clientId,
        amount: amt,
        areaId: areaId || null,
        date,
        notes: notes.trim()
      };

      if (navigator.onLine) {
        await api.post('/api/collections', entryData);
        if (window.showToast) window.showToast('Collection recorded successfully! ✓', 'success');
      } else {
        await db.addPending('pendingCollections', entryData);
        await refreshPendingCount();
        if (window.showToast) window.showToast('Offline: Collection saved locally. ⚡', 'info');
      }

      // If user enabled thank-you message, open WhatsApp link
      if (sendThankYou && donorPhone) {
        const cleanPhone = donorPhone.replace(/[^0-9]/g, '');
        const message = `Assalamu Alaikum${donorName ? ' ' + donorName : ''},\n\nThank you for contributing ${formatCurrency(amt)} towards Markazul Hidayathil Islamiyya Calendar Campaign.\nMay Allah accept and reward your noble deed.`;
        const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}&text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
      }

      setAmount('');
      setNotes('');
      setSendThankYou(false);
      setDonorPhone('');
      setDonorName('');
      loadRecent();
    } catch (err) {
      console.warn('Error recording collection, saving offline:', err);
      const clientId = generateClientId();
      await db.addPending('pendingCollections', {
        clientId,
        amount: amt,
        areaId: areaId || null,
        date,
        notes: notes.trim()
      });
      await refreshPendingCount();
      if (window.showToast) window.showToast('Saved offline. Will sync automatically.', 'warning');
    } finally {
      setLoading(false);
    }
  };

  const todayTotal = recentEntries
    .filter((e) => e.date && e.date.startsWith(date))
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  return html`
    <div class="page">
      <!-- Collection Entry Form -->
      <div class="card">
        <div class="card-title">Record Money Collection</div>
        <form onSubmit=${handleSubmit}>
          <!-- Amount -->
          <div class="form-group">
            <label class="form-label">Collection Amount (₹)</label>
            <input
              type="tel"
              pattern="[0-9]*"
              class="form-input"
              placeholder="e.g. 500"
              value=${amount}
              onInput=${(e) => setAmount(e.target.value)}
              required
              style="font-size: 24px; font-weight: 700; color: #059669;"
            />
          </div>

          <!-- Area -->
          <div class="form-group">
            <label class="form-label">Area (Optional)</label>
            <select
              class="form-input"
              value=${areaId}
              onChange=${(e) => setAreaId(e.target.value)}
            >
              <option value="">Select an area</option>
              ${areas.map(
                (a) => html`<option key=${a._id} value=${a._id}>${a.name}</option>`
              )}
            </select>
          </div>

          <!-- Date -->
          <div class="form-group">
            <label class="form-label">Date</label>
            <input
              type="date"
              class="form-input"
              value=${date}
              onInput=${(e) => setDate(e.target.value)}
              required
            />
          </div>

          <!-- Notes -->
          <div class="form-group">
            <label class="form-label">Notes / Donor Name (Optional)</label>
            <input
              type="text"
              class="form-input"
              placeholder="e.g. Ibrahim Haji, shop collection"
              value=${notes}
              onInput=${(e) => setNotes(e.target.value)}
            />
          </div>

          <!-- Optional Thank-You WhatsApp Message Switch -->
          <div style="background: var(--bg); padding: 12px; border-radius: var(--radius); margin-bottom: 16px; border: 1px solid var(--border);">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; font-weight: 600; color: var(--text);">
              <input
                type="checkbox"
                checked=${sendThankYou}
                onChange=${(e) => setSendThankYou(e.target.checked)}
                style="width: 18px; height: 18px;"
              />
              <span>Send WhatsApp Thank-You Note</span>
            </label>

            ${sendThankYou
              ? html`
                  <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
                    <input
                      type="text"
                      class="form-input"
                      placeholder="Donor Name"
                      value=${donorName}
                      onInput=${(e) => setDonorName(e.target.value)}
                    />
                    <input
                      type="tel"
                      class="form-input"
                      placeholder="WhatsApp Mobile Number"
                      value=${donorPhone}
                      onInput=${(e) => setDonorPhone(e.target.value)}
                    />
                    <p style="font-size: 11px; color: var(--text-secondary); margin: 0;">
                      Opens WhatsApp message for you to manually review and send.
                    </p>
                  </div>
                `
              : ''}
          </div>

          <button
            type="submit"
            class="btn btn-success btn-full"
            disabled=${loading}
          >
            ${loading ? 'Recording...' : 'Save Collection ✓'}
          </button>
        </form>
      </div>

      <!-- Recent Records -->
      ${recentEntries.length > 0
        ? html`
            <div class="card">
              <div class="card-title">Recent Collections</div>
              ${recentEntries.map(
                (col) => html`
                  <div class="list-item" key=${col._id}>
                    <div class="list-content">
                      <div class="list-title">
                        ${col.areaId ? col.areaId.name : (col.notes || 'Collection')}
                      </div>
                      <div class="list-subtitle">${formatDate(col.date)}</div>
                    </div>
                    <div style="font-weight: 700; color: #059669; font-size: 15px;">
                      ${formatCurrency(col.amount)}
                    </div>
                  </div>
                `
              )}
            </div>
          `
        : ''}
    </div>
  `;
}
