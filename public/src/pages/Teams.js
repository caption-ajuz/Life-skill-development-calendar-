import api from '../services/api.js';
import { currentUser } from '../store/auth.js';
import { formatCurrency, formatNumber } from '../utils/format.js';

const html = window.html;
const { useState, useEffect, useRef } = window.hooks;

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

  // Add Member Modal State (Existing Member vs Create New)
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberAddTab, setMemberAddTab] = useState('existing'); // 'existing' | 'new'

  // Existing member search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [assigningId, setAssigningId] = useState(null);

  // Create new user state
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPin, setNewPin] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [oneTimeCreds, setOneTimeCreds] = useState(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Change Leader state
  const [showLeaderModal, setShowLeaderModal] = useState(false);
  const [selectedLeaderId, setSelectedLeaderId] = useState('');
  const [savingLeader, setSavingLeader] = useState(false);

  // Archive Team state
  const [archiving, setArchiving] = useState(false);

  // Debounce search timer ref
  const searchTimerRef = useRef(null);

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
        if (res.data.team && res.data.team.leaderId) {
          setSelectedLeaderId(res.data.team.leaderId._id || res.data.team.leaderId);
        }
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

  // Debounced search for existing members
  const handleSearchChange = (q) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q || !q.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/api/users/search?q=${encodeURIComponent(q.trim())}&limit=20`);
        if (res && res.success && res.data) {
          setSearchResults(res.data);
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.warn('Search error:', err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
  };

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

  // Assign existing member to current team
  const handleAssignExistingMember = async (targetMember) => {
    if (!selectedTeam) return;
    setAssigningId(targetMember._id);
    try {
      const res = await api.post(`/api/teams/${selectedTeam._id}/members`, {
        memberIds: [targetMember._id]
      });
      if (res && res.success) {
        if (window.showToast) window.showToast(`${targetMember.fullName} assigned to ${selectedTeam.name}!`, 'success');
        setSearchQuery('');
        setSearchResults([]);
        loadTeamDetail(selectedTeam._id);
        loadTeams();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to assign member.', 'error');
    } finally {
      setAssigningId(null);
    }
  };

  // Remove member from team (demote to independent)
  const handleRemoveMember = async (m) => {
    if (!selectedTeam) return;
    // Remove confirmed directly

    try {
      const res = await api.delete(`/api/teams/${selectedTeam._id}/members/${m._id}`);
      if (res && res.success) {
        if (window.showToast) window.showToast(`${m.fullName} removed from team (now independent).`, 'success');
        loadTeamDetail(selectedTeam._id);
        loadTeams();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to remove member.', 'error');
    }
  };

  // Change or assign Team Leader
  const handleChangeLeader = async () => {
    if (!selectedTeam || !selectedLeaderId) return;
    setSavingLeader(true);
    try {
      const res = await api.put(`/api/teams/${selectedTeam._id}/leader`, {
        leaderId: selectedLeaderId
      });
      if (res && res.success) {
        if (window.showToast) window.showToast('Team Leader updated successfully!', 'success');
        setShowLeaderModal(false);
        loadTeamDetail(selectedTeam._id);
        loadTeams();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to update leader.', 'error');
    } finally {
      setSavingLeader(false);
    }
  };

    // Permanently Delete Team
  const handleDeleteTeam = async () => {
    if (!selectedTeam) return;
    // Delete confirmed directly

    setArchiving(true);
    try {
      const res = await api.delete(`/api/teams/${selectedTeam._id}?permanent=true`);
      if (res && res.success) {
        if (window.showToast) window.showToast(`Team "${selectedTeam.name}" permanently deleted.`, 'success');
        setSelectedTeam(null);
        setTeamDetail(null);
        loadTeams();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to delete team.', 'error');
    } finally {
      setArchiving(false);
    }
  };
  // Archive Team safely
  const handleArchiveTeam = async () => {
    if (!selectedTeam) return;
    // Archive confirmed directly

    setArchiving(true);
    try {
      const res = await api.post(`/api/teams/${selectedTeam._id}/archive`);
      if (res && res.success) {
        if (window.showToast) window.showToast(`Team "${selectedTeam.name}" archived safely.`, 'success');
        setSelectedTeam(null);
        setTeamDetail(null);
        loadTeams();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to archive team.', 'error');
    } finally {
      setArchiving(false);
    }
  };

  // Create brand new user
  const handleCreateNewMember = async (e) => {
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
        if (window.showToast) window.showToast(`New member "${newFullName}" created & assigned!`, 'success');
        setNewFullName('');
        setNewUsername('');
        setNewPassword('');
        setNewPhone('');
        setNewPin('');
        if (res.initialCredentials) {
          setOneTimeCreds(res.initialCredentials);
        } else {
          setShowAddMember(false);
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
          <p style="font-size: 12px; color: var(--text-secondary); margin-top: 1px;">Manage campaign teams, leader assignments, and independent members</p>
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

      ${loading
        ? html`<div class="empty-state"><p>Loading teams...</p></div>`
        : teams.length === 0
        ? html`
            <div class="empty-state">
              <div class="empty-icon">👥</div>
              <p>No active teams found for this campaign.</p>
              ${isSuperAdmin
                ? html`
                    <button
                      class="btn btn-primary btn-sm"
                      style="margin-top: 12px;"
                      onClick=${() => setShowAddModal(true)}
                    >
                      Create First Team
                    </button>
                  `
                : ''}
            </div>
          `
        : html`
            <div class="card-list">
              ${teams.map((t) => {
                const leader = t.leader || t.leaderId;
                const leaderName = (leader && leader.fullName) ? leader.fullName : 'No Leader Assigned';
                return html`
                  <div
                    class="card"
                    key=${t._id}
                    style="cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; border-left: 4px solid var(--primary);"
                    onClick=${() => {
                      setSelectedTeam(t);
                      loadTeamDetail(t._id);
                    }}
                  >
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                      <div>
                        <div style="font-size: 15px; font-weight: 700; color: var(--text);">${t.name}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">
                          👤 Leader: <strong>${leaderName}</strong>
                        </div>
                      </div>
                      <span class="badge badge-primary">${t.memberCount || 0} members</span>
                    </div>

                    <div style="display: flex; justify-content: space-between; font-size: 12px; padding-top: 8px; border-top: 1px solid var(--border);">
                      <span style="color: var(--text-secondary);">Allocated: <strong>${formatNumber(t.stockAllocated || 0)}</strong></span>
                      <span style="color: var(--primary); font-weight: 600;">${formatCurrency(t.totalCollected || 0)}</span>
                    </div>
                  </div>
                `;
              })}
            </div>
          `}

      <!-- Team Detail Modal -->
      ${selectedTeam && teamDetail
        ? html`
            <div class="modal-overlay" onClick=${() => { setSelectedTeam(null); setTeamDetail(null); }}>
              <div class="modal" style="max-width: 520px; max-height: 85vh; overflow-y: auto;" onClick=${(e) => e.stopPropagation()}>
                <div class="modal-header">
                  <div>
                    <div class="modal-title">${teamDetail.team.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">
                      👤 Leader: <strong>${(teamDetail.team?.leader?.fullName || teamDetail.team?.leaderId?.fullName || teamDetail.members?.find(m => m.role === 'team_leader')?.fullName) || 'No Leader Assigned'}</strong>
                    </div>
                  </div>
                  <button
                    onClick=${() => { setSelectedTeam(null); setTeamDetail(null); }}
                    style="background: none; border: none; font-size: 18px; cursor: pointer;"
                  >
                    ✕
                  </button>
                </div>

                <!-- Admin Action Toolbar -->
                ${isSuperAdmin ? html`
                  <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
                    <button
                      class="btn btn-outline btn-sm"
                      style="font-size: 11px; padding: 4px 10px;"
                      onClick=${() => setShowLeaderModal(true)}
                    >
                      👑 Change / Assign Leader
                    </button>
                    <button
                      class="btn btn-outline btn-sm"
                      style="font-size: 11px; padding: 4px 10px; color: #dc2626; border-color: #fca5a5;"
                      onClick=${handleArchiveTeam}
                      disabled=${archiving}
                    >
                      📦 ${archiving ? 'Archiving...' : 'Archive Team'}
                    </button>
                  </div>
                ` : ''}

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
                      onClick=${() => {
                        setShowAddMember(true);
                        setMemberAddTab('existing');
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                    >
                      + Add Member
                    </button>
                  ` : ''}
                </div>

                ${teamDetail.members && teamDetail.members.length > 0
                  ? teamDetail.members.map(
                      (m) => {
                        const isLeaderOfThisTeam = teamDetail.team.leaderId && (teamDetail.team.leaderId._id === m._id || teamDetail.team.leaderId === m._id);
                        return html`
                          <div class="list-item" key=${m._id} style="align-items: center;">
                            <div class="list-avatar">
                              ${m.profilePhoto ? html`<img src="${m.profilePhoto}" alt="" />` : m.fullName.charAt(0)}
                            </div>
                            <div class="list-content">
                              <div class="list-title">
                                <a href="#/profile?id=${m._id}" style="color: inherit; text-decoration: none;">
                                  ${m.fullName}
                                </a>
                                ${isLeaderOfThisTeam ? html` <span class="badge badge-primary" style="font-size: 10px; padding: 1px 5px;">Leader</span>` : ''}
                              </div>
                              <div class="list-subtitle">${m.username} • ${m.phone || 'No phone'}</div>
                            </div>
                            <div style="text-align: right; font-size: 12px; margin-right: 6px;">
                              <div style="font-weight: 700; color: var(--primary);">${m.totalDistributed || 0} dist.</div>
                              <div style="color: #059669; font-weight: 600;">${formatCurrency(m.totalCollected || 0)}</div>
                            </div>
                            ${isSuperAdmin && !isLeaderOfThisTeam ? html`
                              <button
                                title="Remove from team (demote to independent)"
                                onClick=${() => handleRemoveMember(m)}
                                style="background: none; border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px; font-size: 11px; color: #dc2626; cursor: pointer;"
                              >
                                ✕
                              </button>
                            ` : ''}
                          </div>
                        `;
                      }
                    )
                  : html`<div class="empty-state"><p>No members assigned to this team yet.</p></div>`}
              </div>
            </div>
          `
        : ''}

      <!-- Add Member to Team Modal (Tabs: Existing Search vs Create New) -->
      ${showAddMember && selectedTeam ? html`
        <div class="modal-overlay" onClick=${() => setShowAddMember(false)}>
          <div class="modal" style="max-width: 500px; max-height: 85vh; overflow-y: auto;" onClick=${(e) => e.stopPropagation()}>
            <div class="modal-header">
              <div>
                <div class="modal-title">Add Member to ${selectedTeam.name}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">Assign existing member or create a new user account</div>
              </div>
              <button
                onClick=${() => setShowAddMember(false)}
                style="background: none; border: none; font-size: 18px; cursor: pointer;"
              >
                ✕
              </button>
            </div>

            <!-- Tab Switcher -->
            <div style="display: flex; border-bottom: 2px solid var(--border); margin-bottom: 14px;">
              <button
                type="button"
                onClick=${() => setMemberAddTab('existing')}
                style="flex: 1; padding: 8px 12px; font-size: 13px; font-weight: 600; background: none; border: none; cursor: pointer; border-bottom: 2px solid ${memberAddTab === 'existing' ? 'var(--primary)' : 'transparent'}; color: ${memberAddTab === 'existing' ? 'var(--primary)' : 'var(--text-secondary)'}; margin-bottom: -2px;"
              >
                🔍 Assign Existing Member
              </button>
              <button
                type="button"
                onClick=${() => setMemberAddTab('new')}
                style="flex: 1; padding: 8px 12px; font-size: 13px; font-weight: 600; background: none; border: none; cursor: pointer; border-bottom: 2px solid ${memberAddTab === 'new' ? 'var(--primary)' : 'transparent'}; color: ${memberAddTab === 'new' ? 'var(--primary)' : 'var(--text-secondary)'}; margin-bottom: -2px;"
              >
                ➕ Create New User
              </button>
            </div>

            ${memberAddTab === 'existing' ? html`
              <!-- Existing Member Fast Search Tab -->
              <div>
                <div class="form-group">
                  <label class="form-label">Search Existing Member</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="Search by name, phone number, or username..."
                    value=${searchQuery}
                    onInput=${(e) => handleSearchChange(e.target.value)}
                    autoFocus
                  />
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 3px;">
                    Search finds independent collectors and active camp participants.
                  </div>
                </div>

                ${searching ? html`
                  <div style="text-align: center; padding: 14px; font-size: 13px; color: var(--text-secondary);">Searching members...</div>
                ` : searchQuery.trim() && searchResults.length === 0 ? html`
                  <div class="empty-state" style="padding: 16px;">
                    <p style="font-size: 13px;">No existing members found matching "<strong>${searchQuery}</strong>".</p>
                    <button
                      class="btn btn-outline btn-sm"
                      style="margin-top: 8px;"
                      onClick=${() => {
                        setMemberAddTab('new');
                        setNewFullName(searchQuery.trim());
                      }}
                    >
                      ➕ Create New User Instead
                    </button>
                  </div>
                ` : searchResults.length > 0 ? html`
                  <div style="max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;">
                    ${searchResults.map((m) => {
                      const isAlreadyInThisTeam = selectedTeam && m.teamId && m.teamId.toString() === selectedTeam._id.toString();
                      const isIndependent = !m.teamId;
                      return html`
                        <div
                          key=${m._id}
                          style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px;"
                        >
                          <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="list-avatar" style="width: 32px; height: 32px; font-size: 13px;">
                              ${m.profilePhoto ? html`<img src="${m.profilePhoto}" alt="" />` : m.fullName.charAt(0)}
                            </div>
                            <div>
                              <div style="font-size: 13px; font-weight: 600; color: var(--text);">${m.fullName}</div>
                              <div style="font-size: 11px; color: var(--text-secondary);">
                                ${m.username} • ${m.phone || 'No phone'}
                              </div>
                              <div style="margin-top: 2px;">
                                ${isIndependent ? html`
                                  <span class="badge" style="background: #ecfdf5; color: #047857; font-size: 10px; padding: 1px 5px;">Independent Member</span>
                                ` : html`
                                  <span class="badge" style="background: #f1f5f9; color: #475569; font-size: 10px; padding: 1px 5px;">Team: ${m.teamName || 'Assigned'}</span>
                                `}
                              </div>
                            </div>
                          </div>

                          <div>
                            ${isAlreadyInThisTeam ? html`
                              <span style="font-size: 11px; color: var(--text-secondary); font-weight: 500;">Already in Team</span>
                            ` : html`
                              <button
                                class="btn btn-primary btn-sm"
                                style="font-size: 11px; padding: 4px 8px;"
                                disabled=${assigningId === m._id}
                                onClick=${() => handleAssignExistingMember(m)}
                              >
                                ${assigningId === m._id ? 'Assigning...' : 'Assign to Team'}
                              </button>
                            `}
                          </div>
                        </div>
                      `;
                    })}
                  </div>
                ` : html`
                  <div style="font-size: 12px; color: var(--text-secondary); text-align: center; padding: 12px;">
                    Type above to search existing participant accounts.
                  </div>
                `}
              </div>
            ` : html`
              <!-- Create New User Tab -->
              <form onSubmit=${handleCreateNewMember}>
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
                  <label class="form-label">Initial Password * (At least 4 chars)</label>
                  <input
                    type="password"
                    class="form-input"
                    placeholder="Set temporary password"
                    value=${newPassword}
                    onInput=${(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Phone Number (Optional, 10 digits)</label>
                  <input
                    type="tel"
                    class="form-input"
                    placeholder="e.g. 9876543210"
                    value=${newPhone}
                    onInput=${(e) => setNewPhone(e.target.value)}
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Quick Login PIN (Optional, 4 or 6 digits)</label>
                  <input
                    type="password"
                    class="form-input"
                    placeholder="e.g. 1234"
                    maxLength="6"
                    value=${newPin}
                    onInput=${(e) => setNewPin(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  class="btn btn-primary"
                  style="width: 100%; margin-top: 8px;"
                  disabled=${addingMember}
                >
                  ${addingMember ? 'Creating...' : 'Create & Assign Member'}
                </button>
              </form>
            `}

            <!-- One-time credentials display modal overlay -->
            ${oneTimeCreds ? html`
              <div style="margin-top: 14px; padding: 12px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px;">
                <div style="font-weight: 700; color: #065f46; font-size: 13px; margin-bottom: 6px;">
                  ✓ Member Account Created Successfully
                </div>
                <div style="font-size: 12px; color: #047857; margin-bottom: 8px;">
                  <div><strong>Username:</strong> ${oneTimeCreds.username}</div>
                  <div><strong>Password:</strong> ${oneTimeCreds.temporaryPassword}</div>
                  ${oneTimeCreds.pin ? html`<div><strong>PIN:</strong> ${oneTimeCreds.pin}</div>` : ''}
                </div>
                <div style="display: flex; gap: 8px;">
                  <button
                    class="btn btn-primary btn-sm"
                    style="background: #059669; border-color: #059669; font-size: 11px;"
                    onClick=${copyCredsToClipboard}
                  >
                    ${copiedCreds ? '✓ Copied!' : '📋 Copy Credentials'}
                  </button>
                  <button
                    class="btn btn-outline btn-sm"
                    style="font-size: 11px;"
                    onClick=${() => {
                      setOneTimeCreds(null);
                      setShowAddMember(false);
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Change Leader Modal -->
      ${showLeaderModal && selectedTeam && teamDetail ? html`
        <div class="modal-overlay" onClick=${() => setShowLeaderModal(false)}>
          <div class="modal" onClick=${(e) => e.stopPropagation()}>
            <div class="modal-header">
              <div>
                <div class="modal-title">Assign / Change Team Leader</div>
                <div style="font-size: 12px; color: var(--text-secondary);">Team: ${selectedTeam.name}</div>
              </div>
              <button
                onClick=${() => setShowLeaderModal(false)}
                style="background: none; border: none; font-size: 18px; cursor: pointer;"
              >
                ✕
              </button>
            </div>

            <div class="form-group">
              <label class="form-label">Select Team Leader</label>
              <select
                class="form-input"
                value=${selectedLeaderId}
                onChange=${(e) => setSelectedLeaderId(e.target.value)}
              >
                <option value="">-- Select Member to Lead --</option>
                ${teamDetail.members ? teamDetail.members.map(m => html`
                  <option value="${m._id}">${m.fullName} (@${m.username})</option>
                `) : ''}
              </select>
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                Selecting a leader promotes them to Team Leader. If replacing an existing leader, the former leader will smoothly return to regular team member status.
              </div>
            </div>

            <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px;">
              <button class="btn btn-outline btn-sm" onClick=${() => setShowLeaderModal(false)}>Cancel</button>
              <button
                class="btn btn-primary btn-sm"
                disabled=${!selectedLeaderId || savingLeader}
                onClick=${handleChangeLeader}
              >
                ${savingLeader ? 'Saving...' : 'Set as Leader'}
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Create Team Modal -->
      ${showAddModal
        ? html`
            <div class="modal-overlay" onClick=${() => setShowAddModal(false)}>
              <div class="modal" onClick=${(e) => e.stopPropagation()}>
                <div class="modal-header">
                  <div class="modal-title">Create Campaign Team</div>
                  <button
                    onClick=${() => setShowAddModal(false)}
                    style="background: none; border: none; font-size: 18px; cursor: pointer;"
                  >
                    ✕
                  </button>
                </div>
                <form onSubmit=${handleCreateTeam}>
                  <div class="form-group">
                    <label class="form-label">Team Name *</label>
                    <input
                      type="text"
                      class="form-input"
                      placeholder="e.g. Team Al-Falah"
                      value=${teamName}
                      onInput=${(e) => setTeamName(e.target.value)}
                      required
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Description (Optional)</label>
                    <input
                      type="text"
                      class="form-input"
                      placeholder="e.g. Area zone or camp group"
                      value=${teamDesc}
                      onInput=${(e) => setTeamDesc(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    class="btn btn-primary"
                    style="width: 100%; margin-top: 8px;"
                    disabled=${submitting}
                  >
                    ${submitting ? 'Creating...' : 'Create Team'}
                  </button>
                </form>
              </div>
            </div>
          `
        : ''}
    </div>
  `;
}
