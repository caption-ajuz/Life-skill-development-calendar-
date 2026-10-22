import api from '../services/api.js';
import { currentUser } from '../store/auth.js';
import { formatCurrency, formatNumber } from '../utils/format.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Members() {
  const user = currentUser.value;
  const isSuperAdmin = user && user.role === 'super_admin';
  const isUsthad = user && user.role === 'usthad';
  const isLeader = user && user.role === 'team_leader';

  const [members, setMembers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'credentials', 'usthads'
  const [filterTeam, setFilterTeam] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // New User Form State
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState('team_member');
  const [newTeamId, setNewTeamId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Stock Allocation Modal
  const [selectedMember, setSelectedMember] = useState(null);
  const [allocQty, setAllocQty] = useState('');
  const [allocating, setAllocating] = useState(false);

  // Admin Credential Editor Modal
  const [credUser, setCredUser] = useState(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editPin, setEditPin] = useState('');
  const [updatingCreds, setUpdatingCreds] = useState(false);

  const loadData = async () => {
    try {
      const [usersRes, teamsRes] = await Promise.all([
        api.get('/api/users'),
        api.get('/api/teams')
      ]);

      if (usersRes && usersRes.success) {
        setMembers(usersRes.data.users || []);
      }
      if (teamsRes && teamsRes.success) {
        setTeams(teamsRes.data || []);
      }
    } catch (err) {
      console.warn('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (newPin && !/^\d{4,6}$/.test(newPin)) {
      if (window.showToast) window.showToast('PIN must be 4 or 6 digits.', 'error');
      return;
    }
    setSubmitting(true);

    try {
      await api.post('/api/users', {
        username: newUsername.trim(),
        password: newPassword,
        fullName: newFullName.trim(),
        phone: newPhone.trim(),
        pin: newPin || undefined,
        role: newRole,
        teamId: newTeamId || null
      });

      if (window.showToast) window.showToast(`User "${newFullName}" created!`, 'success');
      setShowAddUser(false);
      setNewUsername('');
      setNewPassword('');
      setNewFullName('');
      setNewPhone('');
      setNewPin('');
      loadData();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to create user.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAllocateMember = async (e) => {
    e.preventDefault();
    const qty = parseInt(allocQty, 10);
    if (isNaN(qty) || qty < 0) return;

    setAllocating(true);
    try {
      await api.post('/api/stock/allocate-member', {
        memberId: selectedMember._id,
        quantity: qty
      });

      if (window.showToast) window.showToast(`Allocated ${qty} calendars to ${selectedMember.fullName}`, 'success');
      setSelectedMember(null);
      setAllocQty('');
      loadData();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Allocation failed.', 'error');
    } finally {
      setAllocating(false);
    }
  };

  const openCredEditor = (m) => {
    setCredUser(m);
    setEditUsername(m.username || '');
    setEditPassword(m.passwordHint || '');
    setEditPin(m.pinHint || '');
  };

  const handleSaveCredentials = async (e) => {
    e.preventDefault();
    if (!credUser) return;
    if (editPin && !/^\d{4,6}$/.test(editPin)) {
      if (window.showToast) window.showToast('PIN must be 4 or 6 numeric digits.', 'error');
      return;
    }

    setUpdatingCreds(true);
    try {
      await api.put(`/api/users/${credUser._id}/credentials`, {
        username: editUsername.trim(),
        password: editPassword || undefined,
        pin: editPin || undefined
      });
      if (window.showToast) window.showToast(`Updated credentials for @${editUsername.trim()}`, 'success');
      setCredUser(null);
      loadData();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to update credentials.', 'error');
    } finally {
      setUpdatingCreds(false);
    }
  };

  const handleDeletePassword = async (m) => {
    if (!confirm(`Are you sure you want to clear/delete the password for ${m.fullName}?`)) return;
    try {
      await api.delete(`/api/users/${m._id}/password`);
      if (window.showToast) window.showToast(`Password cleared for ${m.fullName}.`, 'info');
      loadData();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to clear password.', 'error');
    }
  };

  // Filtered members list
  const filteredMembers = members.filter((m) => {
    if (filterTeam !== 'all') {
      const teamId = m.teamId ? (m.teamId._id || m.teamId) : null;
      if (teamId !== filterTeam) return false;
    }
    if (activeTab === 'usthads' && m.role !== 'usthad') return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      const matchName = m.fullName && m.fullName.toLowerCase().includes(s);
      const matchUser = m.username && m.username.toLowerCase().includes(s);
      const matchPhone = m.phone && m.phone.includes(s);
      const matchRole = m.role && m.role.toLowerCase().includes(s);
      return matchName || matchUser || matchPhone || matchRole;
    }
    return true;
  });

  return html`
    <div class="page">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <div>
          <h2 style="font-size: 19px; font-weight: 700;">Teams, Usthad & Members</h2>
          <p style="font-size: 12px; color: var(--text-secondary);">Manage camp participants, roles, passwords & PINs</p>
        </div>
        ${isSuperAdmin
          ? html`
              <button
                class="btn btn-primary btn-sm"
                onClick=${() => setShowAddUser(true)}
              >
                + New User
              </button>
            `
          : ''}
      </div>

      <!-- Navigation Tabs for Super Admin -->
      ${isSuperAdmin ? html`
        <div style="display: flex; gap: 8px; margin-bottom: 12px; background: #e2e8f0; padding: 4px; border-radius: 10px;">
          <button
            class="btn btn-sm ${activeTab === 'all' ? 'btn-primary' : 'btn-outline'}"
            style="flex: 1; border: none; font-size: 12px;"
            onClick=${() => setActiveTab('all')}
          >
            👥 All Users (${members.length})
          </button>
          <button
            class="btn btn-sm ${activeTab === 'credentials' ? 'btn-primary' : 'btn-outline'}"
            style="flex: 1; border: none; font-size: 12px;"
            onClick=${() => setActiveTab('credentials')}
          >
            🔐 Admin Password & PIN Vault
          </button>
          <button
            class="btn btn-sm ${activeTab === 'usthads' ? 'btn-primary' : 'btn-outline'}"
            style="flex: 1; border: none; font-size: 12px;"
            onClick=${() => setActiveTab('usthads')}
          >
            🕌 Usthads (${members.filter(m => m.role === 'usthad').length})
          </button>
        </div>
      ` : ''}

      <!-- Filter Bar -->
      <div style="display: flex; gap: 8px; margin-bottom: 14px;">
        <input
          type="text"
          class="form-input"
          placeholder="Search by name, @username, phone..."
          value=${searchTerm}
          onInput=${(e) => setSearchTerm(e.target.value)}
          style="flex: 2; font-size: 13px;"
        />
        <select
          class="form-input"
          value=${filterTeam}
          onChange=${(e) => setFilterTeam(e.target.value)}
          style="flex: 1; font-size: 13px;"
        >
          <option value="all">All Teams</option>
          ${teams.map((t) => html`<option key=${t._id} value=${t._id}>${t.name}</option>`)}
        </select>
      </div>

      <!-- Admin Credential Editor Modal -->
      ${credUser
        ? html`
            <div class="modal-overlay" onClick=${() => setCredUser(null)}>
              <div class="modal" onClick=${(e) => e.stopPropagation()}>
                <div class="modal-header">
                  <div class="modal-title">Edit Credentials: ${credUser.fullName}</div>
                  <button onClick=${() => setCredUser(null)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
                </div>
                <form onSubmit=${handleSaveCredentials}>
                  <div style="padding: 10px; margin-bottom: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px;">
                    <div><b>Role:</b> <span style="text-transform: capitalize;">${credUser.role.replace('_', ' ')}</span></div>
                    <div><b>Team:</b> ${credUser.teamId ? (credUser.teamId.name || credUser.teamId) : 'No team assigned'}</div>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Username (Login ID)</label>
                    <input
                      type="text"
                      class="form-input"
                      value=${editUsername}
                      onInput=${(e) => setEditUsername(e.target.value)}
                      required
                    />
                  </div>

                  <div class="form-group">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <label class="form-label" style="margin-bottom: 0;">Password</label>
                      <button
                        type="button"
                        class="btn btn-outline btn-sm"
                        style="color: #dc2626; border-color: #fca5a5; padding: 2px 8px; font-size: 11px;"
                        onClick=${() => handleDeletePassword(credUser)}
                      >
                        🗑️ Delete / Clear Password
                      </button>
                    </div>
                    <input
                      type="text"
                      class="form-input"
                      placeholder="Enter new password"
                      value=${editPassword}
                      onInput=${(e) => setEditPassword(e.target.value)}
                    />
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 3px;">
                      Visible to Super Admin. You can set or change password anytime.
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label">4-Digit or 6-Digit PIN (for Quick PIN login)</label>
                    <input
                      type="text"
                      maxlength="6"
                      class="form-input"
                      placeholder="e.g. 1111, 2222, 1234"
                      value=${editPin}
                      onInput=${(e) => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      style="font-size: 18px; font-weight: 700; letter-spacing: 2px; color: #0891b2;"
                    />
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 3px;">
                      Enables Federal Bank-style 4-digit PIN sign-in for this user.
                    </div>
                  </div>

                  <div style="display: flex; gap: 8px; margin-top: 14px;">
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onClick=${() => setCredUser(null)}>
                      Cancel
                    </button>
                    <button type="submit" class="btn btn-primary" style="flex: 2;" disabled=${updatingCreds}>
                      ${updatingCreds ? 'Saving...' : 'Save Credentials'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          `
        : ''}

      <!-- Create User Modal -->
      ${showAddUser
        ? html`
            <div class="modal-overlay" onClick=${() => setShowAddUser(false)}>
              <div class="modal" onClick=${(e) => e.stopPropagation()}>
                <div class="modal-header">
                  <div class="modal-title">Create Account</div>
                  <button onClick=${() => setShowAddUser(false)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
                </div>
                <form onSubmit=${handleCreateUser}>
                  <div class="form-group">
                    <label class="form-label">Full Name</label>
                    <input type="text" class="form-input" placeholder="e.g. Abdulla K." value=${newFullName} onInput=${(e) => setNewFullName(e.target.value)} required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Username (Login ID)</label>
                    <input type="text" class="form-input" placeholder="e.g. abdulla123" value=${newUsername} onInput=${(e) => setNewUsername(e.target.value)} required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Password</label>
                    <input type="password" class="form-input" placeholder="Min 4 characters" value=${newPassword} onInput=${(e) => setNewPassword(e.target.value)} required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">4-Digit PIN (Optional quick sign-in)</label>
                    <input type="text" maxlength="6" class="form-input" placeholder="e.g. 1111" value=${newPin} onInput=${(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Role</label>
                    <select class="form-input" value=${newRole} onChange=${(e) => setNewRole(e.target.value)}>
                      <option value="team_member">Team Member</option>
                      <option value="team_leader">Team Leader</option>
                      <option value="usthad">Supervisor Usthad</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Phone Number</label>
                    <input type="tel" class="form-input" placeholder="10-digit mobile number" value=${newPhone} onInput=${(e) => setNewPhone(e.target.value)} />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Assign to Team</label>
                    <select class="form-input" value=${newTeamId} onChange=${(e) => setNewTeamId(e.target.value)}>
                      <option value="">No Team Assigned</option>
                      ${teams.map((t) => html`<option key=${t._id} value=${t._id}>${t.name}</option>`)}
                    </select>
                  </div>
                  <button type="submit" class="btn btn-primary btn-full" disabled=${submitting}>
                    ${submitting ? 'Creating...' : 'Create Account'}
                  </button>
                </form>
              </div>
            </div>
          `
        : ''}

      <!-- Allocate Stock Modal -->
      ${selectedMember
        ? html`
            <div class="modal-overlay" onClick=${() => setSelectedMember(null)}>
              <div class="modal" onClick=${(e) => e.stopPropagation()}>
                <div class="modal-header">
                  <div class="modal-title">Allocate Stock to ${selectedMember.fullName}</div>
                  <button onClick=${() => setSelectedMember(null)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
                </div>
                <form onSubmit=${handleAllocateMember}>
                  <div class="form-group">
                    <label class="form-label">Number of Calendars to Allocate</label>
                    <input type="tel" pattern="[0-9]*" class="form-input" placeholder="e.g. 50" value=${allocQty} onInput=${(e) => setAllocQty(e.target.value)} required style="font-size: 20px; font-weight: 700; color: var(--primary);" />
                  </div>
                  <button type="submit" class="btn btn-primary btn-full" disabled=${allocating}>
                    ${allocating ? 'Allocating...' : 'Confirm Allocation'}
                  </button>
                </form>
              </div>
            </div>
          `
        : ''}

      <!-- Members & Credentials List -->
      ${loading
        ? html`<div style="height: 120px;" class="skeleton"></div>`
        : filteredMembers.length === 0
        ? html`<div class="empty-state"><p>No participants found matching your criteria.</p></div>`
        : html`
            <div>
              ${filteredMembers.map(
                (m) => html`
                  <div class="card" key=${m._id} style="margin-bottom: 10px; border-left: 4px solid ${m.role === 'super_admin' ? '#f59e0b' : m.role === 'usthad' ? '#0891b2' : m.role === 'team_leader' ? '#10b981' : '#64748b'};">
                    <div style="display: flex; align-items: center; gap: 12px;">
                      <div class="list-avatar">
                        ${m.profilePhoto ? html`<img src="${m.profilePhoto}" alt="" />` : m.fullName.charAt(0)}
                      </div>
                      <div class="list-content" style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                          <span class="list-title">${m.fullName}</span>
                          ${m.role === 'usthad' ? html`<span class="badge" style="background: #e0f2fe; color: #0369a1; font-weight: 700;">🕌 Usthad</span>` : ''}
                          ${m.role === 'super_admin' ? html`<span class="badge" style="background: #fef3c7; color: #b45309; font-weight: 700;">👑 Admin</span>` : ''}
                        </div>
                        <div class="list-subtitle">
                          <b>@${m.username}</b> • ${m.teamId ? (m.teamId.name || m.teamId) : 'No team'} • <span style="text-transform: capitalize;">${m.role.replace('_', ' ')}</span>
                        </div>
                      </div>

                      <div style="display: flex; gap: 6px;">
                        ${isSuperAdmin
                          ? html`
                              <button
                                class="btn btn-primary btn-sm"
                                onClick=${() => openCredEditor(m)}
                                title="Edit Username, Password & PIN"
                                style="font-size: 11px; padding: 4px 8px;"
                              >
                                🔑 Edit Credentials
                              </button>
                            `
                          : ''}
                        ${isSuperAdmin || isLeader
                          ? html`
                              <button
                                class="btn btn-outline btn-sm"
                                onClick=${() => {
                                  setSelectedMember(m);
                                  setAllocQty('');
                                }}
                                style="font-size: 11px; padding: 4px 8px;"
                              >
                                📦 Stock
                              </button>
                            `
                          : ''}
                      </div>
                    </div>

                    <!-- Super Admin Credential Inspector Bar -->
                    ${isSuperAdmin
                      ? html`
                          <div style="margin-top: 10px; padding: 8px 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #f1f5f9; display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; align-items: center;">
                            <div>
                              <span style="color: var(--text-secondary);">Password: </span>
                              <b style="font-family: monospace; background: #fff; padding: 2px 6px; border-radius: 4px; border: 1px solid #e2e8f0; color: ${m.passwordHint ? '#0f172a' : '#94a3b8'};">
                                ${m.passwordHint || '(Encrypted / Set)'}
                              </b>
                            </div>
                            <div>
                              <span style="color: var(--text-secondary);">4-Digit PIN: </span>
                              <b style="font-family: monospace; background: #fff; padding: 2px 6px; border-radius: 4px; border: 1px solid #e2e8f0; color: #0891b2;">
                                ${m.pinHint || (m.role === 'super_admin' ? '1111' : m.role === 'usthad' ? '2222' : m.role === 'team_leader' ? '3333' : '4444')}
                              </b>
                            </div>
                            <div style="margin-left: auto; display: flex; gap: 8px;">
                              <button
                                style="background: none; border: none; color: #dc2626; cursor: pointer; font-size: 11px; text-decoration: underline;"
                                onClick=${() => handleDeletePassword(m)}
                              >
                                Clear Password
                              </button>
                            </div>
                          </div>
                        `
                      : ''}
                  </div>
                `
              )}
            </div>
          `}
    </div>
  `;
}
