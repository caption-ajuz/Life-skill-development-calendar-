import api from '../services/api.js';
import { currentUser } from '../store/auth.js';
import { formatCurrency, formatNumber } from '../utils/format.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Teams() {
  const user = currentUser.value;
  const isSuperAdmin = user && user.role === 'super_admin';
  const isLeader = user && user.role === 'team_leader';

  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [teamDetail, setTeamDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Add Team Member state
  const [showAddMember, setShowAddMember] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPin, setNewPin] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [oneTimeCreds, setOneTimeCreds] = useState(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

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

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!selectedTeam) return;
    if (newPin && !/^\d{4,6}$/.test(newPin.trim())) {
      if (window.showToast) window.showToast('PIN must be 4 or 6 numeric digits.', 'error');
      return;
    }
    setAddingMember(true);
    try {
      const payload = {
        fullName: newFullName.trim(),
        username: newUsername.trim(),
        password: newPassword,
        phone: newPhone.trim(),
        pin: newPin ? newPin.trim() : undefined,
        role: 'team_member',
        teamId: selectedTeam._id
      };
      const res = await api.post('/api/users', payload);
      if (res && res.success) {
        if (window.showToast) window.showToast(`Team member "${newFullName}" added successfully!`, 'success');
        setShowAddMember(false);
        setNewFullName('');
        setNewUsername('');
        setNewPassword('');
        setNewPhone('');
        setNewPin('');
        if (res.initialCredentials) {
          setOneTimeCreds(res.initialCredentials);
        }
        loadTeamDetail(selectedTeam._id);
        loadTeams();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to add member.', 'error');
    } finally {
      setAddingMember(false);
    }
  };

  const copyCredsToClipboard = async () => {
    if (!oneTimeCreds) return;
    const msg = `Markazul Hidayathil Islamiyya — Life Skill Course\nMember Login Credentials:\nUsername: ${oneTimeCreds.username}\nTemp Password: ${oneTimeCreds.temporaryPassword}\n${oneTimeCreds.pin ? `PIN: ${oneTimeCreds.pin}\n` : ''}Login URL: ${window.location.origin}/#/login`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(msg);
      }
      setCopiedCreds(true);
      if (window.showToast) window.showToast('Credentials copied to clipboard! ✓', 'success');
      setTimeout(() => setCopiedCreds(false), 2500);
    } catch (e) {
      if (window.showToast) window.showToast('Failed to copy credentials.', 'error');
    }
  };

  const canAddMember = selectedTeam && (isSuperAdmin || (isLeader && (user && (user.teamId === selectedTeam._id || (user.teamId && user.teamId._id === selectedTeam._id)))));

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

                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <div class="card-title" style="margin-bottom: 0;">Team Members</div>
                  ${canAddMember ? html`
                    <button
                      class="btn btn-primary btn-sm"
                      onClick=${() => setShowAddMember(true)}
                    >
                      + Add Member
                    </button>
                  ` : ''}
                </div>

                ${teamDetail.members && teamDetail.members.length > 0
                  ? teamDetail.members.map(
                      (m) => html`
                        <div class="list-item" key=${m._id}>
                          <div class="list-avatar">
                            ${m.profilePhoto ? html`<img src="${m.profilePhoto}" alt="" />` : m.fullName.charAt(0)}
                          </div>
                          <div class="list-content">
                            <div class="list-title">
                              <a href="#/profile?id=${m._id}" style="color: inherit; text-decoration: none;">
                                ${m.fullName}
                              </a>
                            </div>
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

      <!-- Add Member to Team Modal -->
      ${showAddMember && selectedTeam ? html`
        <div class="modal-overlay" onClick=${() => setShowAddMember(false)}>
          <div class="modal" onClick=${(e) => e.stopPropagation()}>
            <div class="modal-header">
              <div>
                <div class="modal-title">Add Member to ${selectedTeam.name}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">Role: Team Member • Team locked to ${selectedTeam.name}</div>
              </div>
              <button
                onClick=${() => setShowAddMember(false)}
                style="background: none; border: none; font-size: 18px; cursor: pointer;"
              >
                ✕
              </button>
            </div>
            <form onSubmit=${handleAddMember}>
              <div class="form-group">
                <label class="form-label">Full Name *</label>
                <input
                  type="text"
                  class="form-input"
                  placeholder="e.g. Salman Faris"
                  value=${newFullName}
                  onInput=${(e) => setNewFullName(e.target.value)}
                  required
                />
              </div>
              <div class="form-group">
                <label class="form-label">Username * (Unique login handle)</label>
                <input
                  type="text"
                  class="form-input"
                  placeholder="e.g. salman.faris"
                  value=${newUsername}
                  onInput=${(e) => setNewUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  required
                />
              </div>
              <div class="form-group">
                <label class="form-label">Initial Password (leave blank to auto-generate)</label>
                <input
                  type="password"
                  class="form-input"
                  placeholder="Enter or leave blank for secure temp pass"
                  value=${newPassword}
                  onInput=${(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div class="form-group">
                <label class="form-label">Quick 4-Digit PIN (optional)</label>
                <input
                  type="password"
                  inputmode="numeric"
                  maxlength="6"
                  class="form-input"
                  placeholder="e.g. 5566"
                  value=${newPin}
                  onInput=${(e) => setNewPin(e.target.value)}
                />
              </div>
              <div class="form-group">
                <label class="form-label">Mobile Number (optional)</label>
                <input
                  type="tel"
                  class="form-input"
                  placeholder="e.g. +91 98765 43210"
                  value=${newPhone}
                  onInput=${(e) => setNewPhone(e.target.value)}
                />
              </div>
              <button
                type="submit"
                class="btn btn-primary btn-full"
                disabled=${addingMember}
              >
                ${addingMember ? 'Adding Member...' : 'Create Member Account'}
              </button>
            </form>
          </div>
        </div>
      ` : ''}

      <!-- One-Time Credential Modal -->
      ${oneTimeCreds ? html`
        <div class="modal-overlay" onClick=${() => setOneTimeCreds(null)}>
          <div class="modal" onClick=${(e) => e.stopPropagation()}>
            <div class="modal-header">
              <div class="modal-title" style="color: #059669;">✓ Account Created Successfully</div>
              <button
                onClick=${() => setOneTimeCreds(null)}
                style="background: none; border: none; font-size: 18px; cursor: pointer;"
              >
                ✕
              </button>
            </div>
            <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 12px; padding: 14px; margin-bottom: 14px;">
              <p style="font-size: 12.5px; color: #166534; font-weight: 600; margin-bottom: 10px;">
                ⚠️ <b>Important:</b> These one-time credentials are shown once. The member will be required to change their temporary password upon first login.
              </p>
              <div style="font-size: 13px; line-height: 1.8; color: var(--text);">
                <div>Username: <b style="font-family: monospace; font-size: 14px;">${oneTimeCreds.username}</b></div>
                <div>Temp Password: <b style="font-family: monospace; font-size: 14px; color: #dc2626;">${oneTimeCreds.temporaryPassword}</b></div>
                ${oneTimeCreds.pin ? html`<div>PIN: <b style="font-family: monospace; font-size: 14px; color: var(--primary);">${oneTimeCreds.pin}</b></div>` : ''}
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button
                class="btn btn-primary"
                style="flex: 1;"
                onClick=${copyCredsToClipboard}
              >
                ${copiedCreds ? '✓ Copied!' : '📋 Copy Credentials'}
              </button>
              <button
                class="btn btn-secondary"
                onClick=${() => {
                  const msg = `Markazul Hidayathil Islamiyya — Life Skill Course\nUsername: ${oneTimeCreds.username}\nTemp Password: ${oneTimeCreds.temporaryPassword}\n${oneTimeCreds.pin ? `PIN: ${oneTimeCreds.pin}\n` : ''}Login: ${window.location.origin}/#/login`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                }}
              >
                📱 WhatsApp
              </button>
            </div>
          </div>
        </div>
      ` : ''}

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
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="color: var(--text-secondary);">Collections:</span>
                        ${t.leaderEntersOverallCollection ? html`
                          <span class="badge badge-success" style="font-size: 10px; padding: 2px 6px;">⚡ Overall Mode</span>
                        ` : ''}
                      </div>
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
