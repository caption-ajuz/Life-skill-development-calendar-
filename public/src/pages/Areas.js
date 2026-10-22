import api from '../services/api.js';
import { currentUser } from '../store/auth.js';
import { formatCurrency, formatNumber } from '../utils/format.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Areas() {
  const user = currentUser.value;
  const isSuperAdmin = user && user.role === 'super_admin';

  const [areas, setAreas] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [district, setDistrict] = useState('Palakkad');
  const [submitting, setSubmitting] = useState(false);

  // Merge tool for Super Admin
  const [showMerge, setShowMerge] = useState(false);
  const [sourceAreaId, setSourceAreaId] = useState('');
  const [targetAreaId, setTargetAreaId] = useState('');
  const [merging, setMerging] = useState(false);

  // Alias modal
  const [aliasArea, setAliasArea] = useState(null);
  const [newAliasText, setNewAliasText] = useState('');
  const [savingAlias, setSavingAlias] = useState(false);

  const loadAreas = async () => {
    try {
      const [areasRes, dupRes] = await Promise.all([
        api.get('/api/areas', search ? { search } : {}),
        api.get('/api/areas/duplicates')
      ]);

      if (areasRes && areasRes.success && areasRes.data) {
        setAreas(areasRes.data);
      }
      if (dupRes && dupRes.success && dupRes.data) {
        setDuplicates(dupRes.data || []);
      }
    } catch (err) {
      console.warn('Failed to load areas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAreas();
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const handleAddArea = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const res = await api.post('/api/areas', {
        name: name.trim(),
        district: district.trim()
      });

      if (res && res.success) {
        if (window.showToast) window.showToast(`Area "${name}" added!`, 'success');
        setName('');
        setShowAdd(false);
        loadAreas();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to add area.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAlias = async (e) => {
    e.preventDefault();
    if (!aliasArea || !newAliasText.trim()) return;

    setSavingAlias(true);
    try {
      await api.post(`/api/areas/${aliasArea._id}/aliases`, {
        alias: newAliasText.trim()
      });
      if (window.showToast) window.showToast(`Alias "${newAliasText}" added to ${aliasArea.name}!`, 'success');
      setAliasArea(null);
      setNewAliasText('');
      loadAreas();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to add alias.', 'error');
    } finally {
      setSavingAlias(false);
    }
  };

  const handleMergeAreas = async (e) => {
    e.preventDefault();
    if (!sourceAreaId || !targetAreaId || sourceAreaId === targetAreaId) {
      if (window.showToast) window.showToast('Please select two distinct areas to merge.', 'error');
      return;
    }

    if (!confirm('Are you sure you want to merge these areas? Historical distributions and collections will be reassigned.')) return;

    setMerging(true);
    try {
      const res = await api.post('/api/areas/merge', {
        sourceAreaId,
        targetAreaId
      });

      if (res && res.success) {
        if (window.showToast) window.showToast(res.message || 'Areas merged successfully! ✓', 'success');
        setShowMerge(false);
        setSourceAreaId('');
        setTargetAreaId('');
        loadAreas();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to merge areas.', 'error');
    } finally {
      setMerging(false);
    }
  };

  const quickMerge = (sourceId, targetId) => {
    setSourceAreaId(sourceId);
    setTargetAreaId(targetId);
    setShowMerge(true);
  };

  return html`
    <div class="page">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div>
          <h2 style="font-size: 19px; font-weight: 700;">Covered Areas & Localities</h2>
          <p style="font-size: 12px; color: var(--text-secondary);">Campaign distribution zones, aliases & deduplication</p>
        </div>
        <div style="display: flex; gap: 8px;">
          ${isSuperAdmin
            ? html`
                <button
                  class="btn btn-secondary btn-sm"
                  onClick=${() => setShowMerge(!showMerge)}
                >
                  Merge Dupes
                </button>
              `
            : ''}
          <button
            class="btn btn-primary btn-sm"
            onClick=${() => setShowAdd(true)}
          >
            + Add Area
          </button>
        </div>
      </div>

      <!-- Duplicate Detection Warning Banner -->
      ${duplicates.length > 0 ? html`
        <div class="card" style="border-left: 4px solid #f59e0b; background: #fffbeb; margin-bottom: 12px;">
          <div style="font-weight: 700; color: #b45309; font-size: 14px; margin-bottom: 4px;">
            ⚠️ Duplicate Area Detection (${duplicates.length} detected)
          </div>
          <p style="font-size: 12px; color: #92400e; margin-bottom: 8px;">
            Similar area spellings were identified. Consolidate them or add as aliases to keep analytics clean.
          </p>
          ${duplicates.map((dup, idx) => html`
            <div key=${idx} style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 8px 10px; border-radius: 6px; border: 1px solid #fde68a; margin-bottom: 6px; font-size: 12px;">
              <div>
                <b>${dup.primary.name}</b> vs <b>${dup.duplicate.name}</b>
                <span style="color: var(--text-secondary); margin-left: 6px;">(${dup.reason})</span>
              </div>
              ${isSuperAdmin ? html`
                <button
                  class="btn btn-outline btn-sm"
                  style="font-size: 11px; padding: 2px 8px;"
                  onClick=${() => quickMerge(dup.duplicate._id, dup.primary._id)}
                >
                  Merge into ${dup.primary.name}
                </button>
              ` : ''}
            </div>
          `)}
        </div>
      ` : ''}

      <!-- Add Area Modal -->
      ${showAdd
        ? html`
            <div class="modal-overlay" onClick=${() => setShowAdd(false)}>
              <div class="modal" onClick=${(e) => e.stopPropagation()}>
                <div class="modal-header">
                  <div class="modal-title">Register New Area</div>
                  <button onClick=${() => setShowAdd(false)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
                </div>
                <form onSubmit=${handleAddArea}>
                  <div class="form-group">
                    <label class="form-label">Locality / Area Name</label>
                    <input type="text" class="form-input" placeholder="e.g. Kombam, Kodakkad, Mannarkkad Town" value=${name} onInput=${(e) => setName(e.target.value)} required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">District</label>
                    <input type="text" class="form-input" placeholder="District name" value=${district} onInput=${(e) => setDistrict(e.target.value)} required />
                  </div>
                  <button type="submit" class="btn btn-primary btn-full" disabled=${submitting}>
                    ${submitting ? 'Adding...' : 'Add Area'}
                  </button>
                </form>
              </div>
            </div>
          `
        : ''}

      <!-- Add Alias Modal -->
      ${aliasArea
        ? html`
            <div class="modal-overlay" onClick=${() => setAliasArea(null)}>
              <div class="modal" onClick=${(e) => e.stopPropagation()}>
                <div class="modal-header">
                  <div class="modal-title">Add Alternate Name / Alias for "${aliasArea.name}"</div>
                  <button onClick=${() => setAliasArea(null)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
                </div>
                <form onSubmit=${handleAddAlias}>
                  <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
                    Aliases prevent duplicate area creation when field workers type informal names or different spellings (e.g. "Downtown", "Market Road", "City Center").
                  </p>
                  <div class="form-group">
                    <label class="form-label">Alternate Name / Alias</label>
                    <input
                      type="text"
                      class="form-input"
                      placeholder="e.g. Downtown Junction"
                      value=${newAliasText}
                      onInput=${(e) => setNewAliasText(e.target.value)}
                      required
                    />
                  </div>
                  <div style="display: flex; gap: 8px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onClick=${() => setAliasArea(null)}>Cancel</button>
                    <button type="submit" class="btn btn-primary" style="flex: 2;" disabled=${savingAlias}>
                      ${savingAlias ? 'Saving...' : 'Save Alias ✓'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          `
        : ''}

      <!-- Merge Areas Modal -->
      ${showMerge
        ? html`
            <div class="card" style="border: 2px solid var(--warning); margin-bottom: 14px;">
              <div class="card-title" style="color: var(--warning);">Consolidate Duplicate Areas</div>
              <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 10px;">
                Re-assign all historical distributions and collections from the duplicate spelling into the canonical area.
              </p>
              <form onSubmit=${handleMergeAreas}>
                <div class="form-group">
                  <label class="form-label">Duplicate / Misspelled Area (Source)</label>
                  <select class="form-input" value=${sourceAreaId} onChange=${(e) => setSourceAreaId(e.target.value)} required>
                    <option value="">Select duplicate...</option>
                    ${areas.map((a) => html`<option key=${a._id} value=${a._id}>${a.name} (${a.district})</option>`)}
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Correct Master Area (Target)</label>
                  <select class="form-input" value=${targetAreaId} onChange=${(e) => setTargetAreaId(e.target.value)} required>
                    <option value="">Select master area...</option>
                    ${areas.map((a) => html`<option key=${a._id} value=${a._id}>${a.name} (${a.district})</option>`)}
                  </select>
                </div>
                <button type="submit" class="btn btn-warning btn-full" disabled=${merging}>
                  ${merging ? 'Merging...' : 'Merge and Reassign Records'}
                </button>
              </form>
            </div>
          `
        : ''}

      <!-- Search Input -->
      <div class="form-group">
        <input
          type="text"
          class="form-input"
          placeholder="🔍 Search area name or alias..."
          value=${search}
          onInput=${(e) => setSearch(e.target.value)}
        />
      </div>

      <!-- Area Cards -->
      ${loading
        ? html`<div style="height: 100px;" class="skeleton"></div>`
        : areas.length === 0
        ? html`<div class="empty-state"><p>No matching areas found.</p></div>`
        : html`
            <div>
              ${areas.map(
                (a) => html`
                  <div class="card" key=${a._id} style="margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                      <div style="flex: 1;">
                        <div style="font-size: 15px; font-weight: 700;">${a.name}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${a.district || 'Palakkad'}</div>
                        ${a.aliases && a.aliases.length > 0 ? html`
                          <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;">
                            ${a.aliases.map((al) => html`
                              <span class="badge" style="background: #f1f5f9; color: #475569; font-size: 11px;">
                                🏷️ ${al}
                              </span>
                            `)}
                          </div>
                        ` : ''}
                      </div>

                      <div style="text-align: right; margin-left: 10px;">
                        <div class="badge badge-info">${formatNumber(a.totalDistributed || 0)} calendars</div>
                        <div style="font-size: 12px; font-weight: 600; color: #059669; margin-top: 2px;">
                          ${formatCurrency(a.totalCollected || 0)}
                        </div>
                        <button
                          class="btn btn-outline btn-sm"
                          style="font-size: 11px; padding: 2px 6px; margin-top: 6px;"
                          onClick=${() => {
                            setAliasArea(a);
                            setNewAliasText('');
                          }}
                        >
                          + Alias
                        </button>
                      </div>
                    </div>
                  </div>
                `
              )}
            </div>
          `}
    </div>
  `;
}
