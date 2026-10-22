import api from '../services/api.js';
import { currentUser } from '../store/auth.js';
import { formatCurrency, formatNumber } from '../utils/format.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Teams() {
  const user = currentUser.value;
  const isSuperAdmin = user && user.role === 'super_admin';

  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamDetail, setTeamDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadTeams = async () => {
    try {
      const res = await api.get('/api/teams');
      if (res && res.success && res.data) {
        setTeams(res.data);
      }
    } catch (err) {
      console.warn('Failed to load teams:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadTeamDetail = async (id) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/api/teams/${id}`);
      if (res && res.success && res.data) {
        setTeamDetail(res.data);
      }
    } catch (err) {
      if (window.showToast) window.showToast('Failed to load team details.', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadTeams();
  }, []);

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    setSubmitting(true);
    try {
      const res = await api.post('/api/teams', {
        name: teamName.trim(),
        description: teamDesc.trim()
      });
      if (res && res.success) {
        if (window.showToast) window.showToast(`Team "${teamName}" created!`, 'success');
        setTeamName('');
        setTeamDesc('');
        setShowAddModal(false);
        loadTeams();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to create team.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return html`
    <div class="page">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <div>
          <h2 style="font-size: 19px; font-weight: 700; color: var(--text);">Camp Teams</h2>
          <p style="font-size: 12px; color: var(--text-secondary); margin-top: 1px;">Manage teams and member distribution</p>
        </div>
        ${isSuperAdmin
          ? html`
              <button
                class="btn btn-primary btn-sm"
                onClick=${() => setShowAddModal(true)}
              >
                + Add Team
              </button>
            `
          : ''}
      </div>

      <!-- Add Team Modal -->
      ${showAddModal
        ? html`
            <div class="modal-overlay" onClick=${() => setShowAddModal(false)}>
              <div class="modal" onClick=${(e) => e.stopPropagation()}>
                <div class="modal-header">
                  <div class="modal-title">Create New Team</div>
                  <button
                    onClick=${() => setShowAddModal(false)}
                    style="background: none; border: none; font-size: 18px; cursor: pointer;"
                  >
                    ✕
                  </button>
                </div>
                <form onSubmit=${handleCreateTeam}>
                  <div class="form-group">
                    <label class="form-label">Team Name</label>
                    <input
                      type="text"
                      class="form-input"
                      placeholder="e.g. Team Badr, Team Uhud"
                      value=${teamName}
                      onInput=${(e) => setTeamName(e.target.value)}
                      required
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Description / Zone</label>
                    <input
                      type="text"
                      class="form-input"
                      placeholder="e.g. Mannarkkad North zone"
                      value=${teamDesc}
                      onInput=${(e) => setTeamDesc(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    class="btn btn-primary btn-full"
                    disabled=${submitting}
                  >
                    ${submitting ? 'Creating...' : 'Create Team'}
                  </button>
                </form>
              </div>
            </div>
          `
        : ''}

      <!-- Team Detail Sheet -->
      ${selectedTeam && teamDetail
        ? html`
            <div class="modal-overlay" onClick=${() => { setSelectedTeam(null); setTeamDetail(null); }}>
              <div class="modal" onClick=${(e) => e.stopPropagation()}>
                <div class="modal-header">
                  <div>
                    <div class="modal-title">${teamDetail.team.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${teamDetail.team.description || 'Campaign Team'}</div>
                  </div>
                  <button
                    onClick=${() => { setSelectedTeam(null); setTeamDetail(null); }}
                    style="background: none; border: none; font-size: 18px; cursor: pointer;"
                  >
                    ✕
                  </button>
                </div>

                <div class="stats-grid" style="margin-bottom: 12px;">
                  <div class="stat-card">
                    <div class="stat-value">${formatNumber(teamDetail.stockAllocation || 0)}</div>
                    <div class="stat-label">Stock Allocated</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value" style="color: var(--primary);">${teamDetail.members ? teamDetail.members.length : 0}</div>
                    <div class="stat-label">Total Members</div>
                  </div>
                </div>

                <div class="card-title">Team Members</div>
                ${teamDetail.members && teamDetail.members.length > 0
                  ? teamDetail.members.map(
                      (m) => html`
                        <div class="list-item" key=${m._id}>
                          <div class="list-avatar">
                            ${m.profilePhoto ? html`<img src="${m.profilePhoto}" alt="" />` : m.fullName.charAt(0)}
                          </div>
                          <div class="list-content">
                            <div class="list-title">${m.fullName}</div>
                            <div class="list-subtitle">${m.role.replace('_', ' ')} • ${m.phone || 'No phone'}</div>
                          </div>
                          <div style="text-align: right; font-size: 12px;">
                            <div style="font-weight: 700; color: var(--primary);">${m.totalDistributed} dist.</div>
                            <div style="color: #059669; font-weight: 600;">${formatCurrency(m.totalCollected)}</div>
                          </div>
                        </div>
                      `
                    )
                  : html`<div class="empty-state"><p>No members assigned to this team yet.</p></div>`}
              </div>
            </div>
          `
        : ''}

      <!-- Teams List -->
      ${loading
        ? html`<div style="height: 120px;" class="skeleton"></div>`
        : teams.length === 0
        ? html`
            <div class="empty-state">
              <p>No teams created yet.</p>
            </div>
          `
        : html`
            <div>
              ${teams.map(
                (t) => html`
                  <div
                    class="card"
                    key=${t._id}
                    style="cursor: pointer; transition: transform 0.1s;"
                    onClick=${() => {
                      setSelectedTeam(t);
                      loadTeamDetail(t._id);
                    }}
                  >
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                      <div>
                        <div style="font-size: 16px; font-weight: 700; color: var(--text);">
                          ${t.name}
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                          ${t.memberCount} members • Stock: <b>${formatNumber(t.allocatedStock)}</b>
                        </div>
                      </div>
                      <div class="badge badge-info">
                        ${formatNumber(t.totalDistributed)} Given
                      </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border); font-size: 13px;">
                      <span style="color: var(--text-secondary);">Collections:</span>
                      <b style="color: #059669;">${formatCurrency(t.totalCollected)}</b>
                    </div>
                  </div>
                `
              )}
            </div>
          `}
    </div>
  `;
}
