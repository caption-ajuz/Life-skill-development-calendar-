import api from '../services/api.js';
import db from '../services/db.js';
import { generateClientId, refreshPendingCount, syncStatus } from '../services/sync.js';
import { formatDate } from '../utils/format.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Distribution() {
  const [areas, setAreas] = useState([]);
  const [areaId, setAreaId] = useState('');
  const [newAreaName, setNewAreaName] = useState('');
  const [showNewArea, setShowNewArea] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentEntries, setRecentEntries] = useState([]);

  const loadAreas = async () => {
    try {
      const res = await api.get('/api/areas');
      if (res && res.success && res.data) {
        setAreas(res.data);
      }
    } catch (err) {
      console.warn('Could not fetch areas from network:', err);
    }
  };

  const loadRecent = async () => {
    try {
      const res = await api.get('/api/distributions', { limit: 10 });
      if (res && res.success && res.data) {
        setRecentEntries(res.data.distributions || []);
      }
    } catch (err) {
      console.warn('Could not fetch recent distributions:', err);
    }
  };

  useEffect(() => {
    loadAreas();
    loadRecent();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) {
      if (window.showToast) window.showToast('Please enter a valid quantity of calendars.', 'error');
      return;
    }

    setLoading(true);

    try {
      let finalAreaId = areaId;

      // Handle new area creation if specified
      if (showNewArea && newAreaName.trim()) {
        if (navigator.onLine) {
          const areaRes = await api.post('/api/areas', { name: newAreaName.trim() });
          if (areaRes && areaRes.data) {
            finalAreaId = areaRes.data._id;
            setAreas((prev) => [...prev, areaRes.data]);
          }
        } else {
          // Save area offline
          const tempAreaClientId = generateClientId();
          await db.addPending('pendingAreas', {
            clientId: tempAreaClientId,
            name: newAreaName.trim(),
            district: 'Palakkad'
          });
        }
      }

      const clientId = generateClientId();
      const entryData = {
        clientId,
        quantity: qty,
        areaId: finalAreaId || null,
        date,
        notes: notes.trim()
      };

      if (navigator.onLine) {
        await api.post('/api/distributions', entryData);
        if (window.showToast) window.showToast('Distribution recorded successfully! ✓', 'success');
      } else {
        // Save to IndexedDB queue
        await db.addPending('pendingDistributions', entryData);
        await refreshPendingCount();
        if (window.showToast) window.showToast('Offline: Entry saved locally and queued for sync. ⚡', 'info');
      }

      // Reset form
      setQuantity('1');
      setNotes('');
      setShowNewArea(false);
      setNewAreaName('');
      loadRecent();
    } catch (err) {
      // In case of unexpected network failure during POST
      console.warn('POST failed, fallback to offline storage:', err);
      const clientId = generateClientId();
      await db.addPending('pendingDistributions', {
        clientId,
        quantity: qty,
        areaId: areaId || null,
        date,
        notes: notes.trim()
      });
      await refreshPendingCount();
      if (window.showToast) window.showToast('Network issue: Entry saved offline and queued.', 'warning');
    } finally {
      setLoading(false);
    }
  };

  return html`
    <div class="page">
      <div class="card">
        <div class="card-title">Record Calendar Distribution</div>
        <form onSubmit=${handleSubmit}>
          <!-- Area Selection -->
          <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label class="form-label" style="margin-bottom: 0;">Area / Locality</label>
              <button
                type="button"
                onClick=${() => setShowNewArea(!showNewArea)}
                style="background: none; border: none; color: var(--primary); font-size: 13px; font-weight: 600; cursor: pointer;"
              >
                ${showNewArea ? 'Select Existing Area' : '+ Add New Area'}
              </button>
            </div>

            ${showNewArea
              ? html`
                  <input
                    type="text"
                    class="form-input"
                    placeholder="Enter locality / village name"
                    value=${newAreaName}
                    onInput=${(e) => setNewAreaName(e.target.value)}
                    required
                  />
                `
              : html`
                  <select
                    class="form-input"
                    value=${areaId}
                    onChange=${(e) => setAreaId(e.target.value)}
                  >
                    <option value="">Select an area (optional)</option>
                    ${areas.map(
                      (a) => html`<option key=${a._id} value=${a._id}>${a.name} (${a.district || 'Palakkad'})</option>`
                    )}
                  </select>
                `}
          </div>

          <!-- Quantity -->
          <div class="form-group">
            <label class="form-label">Quantity (Calendars)</label>
            <input
              type="tel"
              pattern="[0-9]*"
              class="form-input"
              value=${quantity}
              onInput=${(e) => setQuantity(e.target.value)}
              required
              min="1"
              style="font-size: 20px; font-weight: 700; color: var(--primary);"
            />
          </div>

          <!-- Date -->
          <div class="form-group">
            <label class="form-label">Distribution Date</label>
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
            <label class="form-label">Notes (Optional)</label>
            <input
              type="text"
              class="form-input"
              placeholder="e.g. Mosque committee, shops, house visit"
              value=${notes}
              onInput=${(e) => setNotes(e.target.value)}
            />
          </div>

          <button
            type="submit"
            class="btn btn-primary"
            disabled=${loading}
          >
            ${loading ? 'Saving...' : 'Save Distribution ✓'}
          </button>
        </form>
      </div>

      <!-- Recent Entries -->
      ${recentEntries.length > 0
        ? html`
            <div class="card">
              <div class="card-title">Recent Records</div>
              ${recentEntries.map(
                (item) => html`
                  <div class="list-item" key=${item._id}>
                    <div class="list-content">
                      <div class="list-title">
                        ${item.areaId ? item.areaId.name : 'Area unrecorded'}
                      </div>
                      <div class="list-subtitle">
                        ${formatDate(item.date)} • ${item.notes || 'Routine distribution'}
                      </div>
                    </div>
                    <div class="badge badge-success" style="font-weight: 700; font-size: 14px;">
                      ${item.quantity}
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
