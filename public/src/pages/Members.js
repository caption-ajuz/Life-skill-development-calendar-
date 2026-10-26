import api from '../services/api.js';
import { currentUser } from '../store/auth.js';
import { formatCurrency, formatNumber, formatDate } from '../utils/format.js';
import { compressImage } from '../utils/image.js';

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

  // Filters
  const [filterRole, setFilterRole] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'active' | 'inactive'
  const [searchTerm, setSearchTerm] = useState('');

  // Add Member / User Modal State
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState('team_member');
  const [newTeamId, setNewTeamId] = useState('');
  const [newPhotoData, setNewPhotoData] = useState(null);
  const [newPhotoUploading, setNewPhotoUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Quick photo upload state per member
  const [uploadingMemberPhotoId, setUploadingMemberPhotoId] = useState(null);

  // One-time Credential Sharing Modal
  const [oneTimeCreds, setOneTimeCreds] = useState(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Edit User Modal (Name, Phone, Role, Team, Collection Target)
  const [editingUser, setEditingUser] = useState(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState('team_member');
  const [editTeamId, setEditTeamId] = useState('');
  const [editCollectionTarget, setEditCollectionTarget] = useState(25000);
  const [savingEdit, setSavingEdit] = useState(false);

  // Overall Member Target Modal State
  const [showOverallTargetModal, setShowOverallTargetModal] = useState(false);
  const [overallTargetAmount, setOverallTargetAmount] = useState(25000);
  const [savingOverallTarget, setSavingOverallTarget] = useState(false);

  // Reset Password Modal
  const [resetPassUser, setResetPassUser] = useState(null);
  const [customTempPass, setCustomTempPass] = useState('');
  const [resettingPass, setResettingPass] = useState(false);

  // Reset PIN Modal
  const [resetPinUser, setResetPinUser] = useState(null);
  const [customTempPin, setCustomTempPin] = useState('');
  const [resettingPin, setResettingPin] = useState(false);

  // Eye toggle for viewing passwords & PINs per user card
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [visiblePins, setVisiblePins] = useState({});

  const toggleShowPassword = (id) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleShowPin = (id) => {
    setVisiblePins((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyMemberCreds = async (m) => {
    const lines = [
      `*Life Skill Course — Login Credentials*`,
      `• User: ${m.fullName}`,
      `• Username: @${m.username}`,
      `• Password: ${m.passwordHint || '(Temporary password not generated yet - Click Reset Pass)'}`,
      m.pinHint ? `• Quick PIN: ${m.pinHint}` : null,
      `• Role: ${m.role.replace('_', ' ')}`
    ].filter(Boolean);

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(lines.join('\n'));
      }
      if (window.showToast) window.showToast(`Login credentials for @${m.username} copied! ✓`, 'success');
    } catch (_) {
      if (window.showToast) window.showToast('Failed to copy to clipboard.', 'error');
    }
  };

  // Stock Allocation Modal
  const [selectedMember, setSelectedMember] = useState(null);
  const [allocQty, setAllocQty] = useState('');
  const [allocating, setAllocating] = useState(false);

  const loadData = async () => {
    try {
      const [usersRes, teamsRes] = await Promise.all([
        api.get('/api/users'),
        api.get('/api/teams')
      ]);

      if (usersRes && usersRes.success && usersRes.data) {
        setMembers(usersRes.data.users || []);
      }
      if (teamsRes && teamsRes.success && teamsRes.data) {
        setTeams(teamsRes.data || []);
      }
    } catch (err) {
      console.warn('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle Add Member (Super Admin or Team Leader)
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (newPin && !/^\d{4,6}$/.test(newPin.trim())) {
      if (window.showToast) window.showToast('PIN must be 4 or 6 numeric digits.', 'error');
      return;
    }
    setSubmitting(true);

    try {
      const payload = {
        username: newUsername.trim(),
        password: newPassword,
        fullName: newFullName.trim(),
        phone: newPhone.trim(),
        pin: newPin ? newPin.trim() : undefined,
        role: isLeader ? 'team_member' : newRole,
        teamId: isLeader ? (user.teamId ? (user.teamId._id || user.teamId) : null) : (newTeamId || null),
        profilePhoto: newPhotoData || null
      };

      const res = await api.post('/api/users', payload);
      if (res && res.success) {
        if (window.showToast) window.showToast(`Account created for ${newFullName}!`, 'success');
        setShowAddUser(false);
        setNewUsername('');
        setNewPassword('');
        setNewFullName('');
        setNewPhone('');
        setNewPin('');
        setNewPhotoData(null);

        // Show one-time credential modal
        if (res.initialCredentials) {
          setOneTimeCreds(res.initialCredentials);
        }
        loadData();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to create account.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewUserPhotoPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setNewPhotoUploading(true);
    try {
      const compressedBlob = await compressImage(file, 250, 0.75);
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewPhotoData(reader.result);
        setNewPhotoUploading(false);
      };
      reader.readAsDataURL(compressedBlob);
    } catch (err) {
      console.error('Photo compress error:', err);
      setNewPhotoUploading(false);
    }
  };

  // Upload or replace any member's photo directly via Cloudinary
  const handleMemberPhotoUpload = async (e, memberId) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setUploadingMemberPhotoId(memberId);
    try {
      const compressedBlob = await compressImage(file, 250, 0.75);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result;
        try {
          const res = await api.post('/api/uploads/profile-photo', {
            photoData: base64Data,
            targetUserId: memberId
          });
          if (res && res.success) {
            setMembers((prev) =>
              prev.map((m) => (m._id === memberId ? { ...m, profilePhoto: res.photoUrl } : m))
            );
            if (currentUser.value && currentUser.value._id === memberId) {
              currentUser.value = { ...currentUser.value, profilePhoto: res.photoUrl };
            }
            if (window.showToast) window.showToast('Photo uploaded to Cloudinary! ✓', 'success');
          }
        } catch (postErr) {
          if (window.showToast) window.showToast(postErr.message || 'Failed to upload photo.', 'error');
        } finally {
          setUploadingMemberPhotoId(null);
        }
      };
      reader.readAsDataURL(compressedBlob);
    } catch (err) {
      console.error('Photo compress error:', err);
      setUploadingMemberPhotoId(null);
    }
  };

  // Open Edit User Modal
  const openEditUser = (m) => {
    setEditingUser(m);
    setEditFullName(m.fullName || '');
    setEditPhone(m.phone || '');
    setEditRole(m.role || 'team_member');
    setEditTeamId(m.teamId ? (m.teamId._id || m.teamId) : '');
    setEditCollectionTarget(m.collectionTarget !== undefined && m.collectionTarget !== null ? m.collectionTarget : 25000);
  };

  const handleSaveEditUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);

    try {
      const payload = {
        fullName: editFullName.trim(),
        phone: editPhone.trim()
      };
      if (isSuperAdmin) {
        payload.role = editRole;
        payload.teamId = editTeamId || null;
        payload.collectionTarget = parseFloat(editCollectionTarget) || 0;
      }
      const res = await api.put(`/api/users/${editingUser._id}`, payload);
      if (res && res.success) {
        if (window.showToast) window.showToast('Account details updated! ✓', 'success');
        setEditingUser(null);
        loadData();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to update account.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveOverallTarget = async (e) => {
    e.preventDefault();
    const amt = parseFloat(overallTargetAmount);
    if (isNaN(amt) || amt < 0) {
      if (window.showToast) window.showToast('Please enter a valid positive target amount.', 'error');
      return;
    }
    setSavingOverallTarget(true);
    try {
      const res = await api.post('/api/users/batch-target', { targetAmount: amt });
      if (res && res.success) {
        if (window.showToast) window.showToast(`Updated collection target for ${res.modifiedCount || 'all'} members to ₹${amt.toLocaleString('en-IN')}! ✓`, 'success');
        setShowOverallTargetModal(false);
        loadData();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to update member targets.', 'error');
    } finally {
      setSavingOverallTarget(false);
    }
  };

  // Toggle Active / Deactivated
  const handleToggleActive = async (m) => {
    const action = m.isActive !== false ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} ${m.fullName}'s account?`)) return;

    try {
      const res = await api.put(`/api/users/${m._id}/toggle-active`);
      if (res && res.success) {
        if (window.showToast) window.showToast(`Account ${action}d successfully.`, 'success');
        loadData();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || `Failed to ${action} account.`, 'error');
    }
  };

  // Reset Password (generates temporary password)
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetPassUser) return;
    setResettingPass(true);

    try {
      const res = await api.put(`/api/users/${resetPassUser._id}/reset-password`, {
        newPassword: customTempPass.trim() || undefined
      });
      if (res && res.success) {
        const newPasswordValue = res.temporaryPassword || res.passwordHint || customTempPass.trim();
        setOneTimeCreds({
          username: resetPassUser.username,
          temporaryPassword: newPasswordValue,
          mustChangePassword: true,
          isReset: true
        });
        // Immediately update local member card state
        setMembers((prev) =>
          prev.map((m) =>
            m._id === resetPassUser._id
              ? { ...m, passwordHint: newPasswordValue, mustChangePassword: true }
              : m
          )
        );
        // Automatically reveal password for admin to inspect
        setVisiblePasswords((prev) => ({ ...prev, [resetPassUser._id]: true }));

        const targetName = resetPassUser.fullName;
        setResetPassUser(null);
        setCustomTempPass('');
        if (window.showToast) window.showToast(`Temporary password generated for ${targetName}! ✓`, 'success');
        loadData();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to reset password.', 'error');
    } finally {
      setResettingPass(false);
    }
  };

  // Reset PIN
  const handleResetPin = async (e) => {
    e.preventDefault();
    if (!resetPinUser) return;
    setResettingPin(true);

    try {
      const res = await api.put(`/api/users/${resetPinUser._id}/reset-pin`, {
        newPin: customTempPin.trim() || undefined
      });
      if (res && res.success) {
        const newPinValue = res.temporaryPin || res.pinHint || customTempPin.trim();
        setOneTimeCreds({
          username: resetPinUser.username,
          pin: newPinValue,
          isPinReset: true
        });
        // Immediately update local member card state
        setMembers((prev) =>
          prev.map((m) =>
            m._id === resetPinUser._id ? { ...m, pinHint: newPinValue } : m
          )
        );
        // Automatically reveal PIN for admin to inspect
        setVisiblePins((prev) => ({ ...prev, [resetPinUser._id]: true }));

        const targetName = resetPinUser.fullName;
        setResetPinUser(null);
        setCustomTempPin('');
        if (window.showToast) window.showToast(`PIN reset successfully for ${targetName}! ✓`, 'success');
        loadData();
      }
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Failed to reset PIN.', 'error');
    } finally {
      setResettingPin(false);
    }
  };

  // Allocate Stock
  const handleAllocateMember = async (e) => {
    e.preventDefault();
    const qty = parseInt(allocQty, 10);
    if (isNaN(qty) || qty <= 0) {
      if (window.showToast) window.showToast('Please enter a valid quantity greater than 0.', 'error');
      return;
    }

    setAllocating(true);
    const clientId = 'member-alloc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    try {
      await api.post('/api/stock/allocate-member', {
        memberId: selectedMember._id,
        quantity: qty,
        clientId
      });

      if (window.showToast) window.showToast(`✓ Successfully allocated ${qty} calendars to ${selectedMember.fullName}!`, 'success');
      setSelectedMember(null);
      setAllocQty('');
      loadData();
    } catch (err) {
      if (window.showToast) window.showToast(err.message || 'Allocation failed.', 'error');
    } finally {
      setAllocating(false);
    }
  };

  // Copy One-Time Credentials
  const copyCredentials = async () => {
    if (!oneTimeCreds) return;
    const text = `*Life Skill Course — Markazul Hidayathil Islamiyya*\n\n` +
      `Your account credentials:\n` +
      `• Username: ${oneTimeCreds.username}\n` +
      (oneTimeCreds.temporaryPassword ? `• Temporary Password: ${oneTimeCreds.temporaryPassword}\n` : '') +
      (oneTimeCreds.pin ? `• 4-Digit PIN: ${oneTimeCreds.pin}\n` : '') +
      (oneTimeCreds.mustChangePassword ? `\n_Note: You must set a new password upon your first login._` : '');

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      setCopiedCreds(true);
      setTimeout(() => setCopiedCreds(false), 2500);
      if (window.showToast) window.showToast('Credentials copied to clipboard! Ready to share. ✓', 'success');
    } catch (e) {
      if (window.showToast) window.showToast('Failed to copy.', 'error');
    }
  };

  // Filtering
  const filteredMembers = members.filter((m) => {
    if (filterRole !== 'all' && m.role !== filterRole) return false;
    if (filterTeam !== 'all') {
      const teamId = m.teamId ? (m.teamId._id || m.teamId) : null;
      if (teamId !== filterTeam) return false;
    }
    if (filterStatus === 'active' && m.isActive === false) return false;
    if (filterStatus === 'inactive' && m.isActive !== false) return false;

    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      const matchName = m.fullName && m.fullName.toLowerCase().includes(s);
      const matchUser = m.username && m.username.toLowerCase().includes(s);
      const matchPhone = m.phone && m.phone.includes(s);
      return matchName || matchUser || matchPhone;
    }
    return true;
  });

  return html`
    <div class="page">
      <!-- Page Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 0;">
            ${isLeader ? 'My Team Members' : 'Team Members & Accounts'}
          </h2>
          <p style="font-size: 13px; color: var(--text-secondary); margin: 2px 0 0;">
            ${isLeader
              ? `Add members to your team, reset credentials & track performance`
              : 'Super Admin account provisioning, role management & credential security'}
          </p>
        </div>

        <div style="display: flex; gap: 8px;">
          ${isSuperAdmin ? html`
            <button
              class="btn btn-secondary btn-sm"
              style="font-weight: 700; display: flex; align-items: center; gap: 4px; border-color: #10b981; color: #047857; background: #ecfdf5;"
              onClick=${() => setShowOverallTargetModal(true)}
              title="Set Overall Target for all members"
            >
              <span>🎯 Overall Target</span>
            </button>
          ` : ''}

          ${isSuperAdmin || isLeader ? html`
            <button
              class="btn btn-primary btn-sm"
              style="font-weight: 700; display: flex; align-items: center; gap: 4px;"
              onClick=${() => setShowAddUser(true)}
            >
              <span>+</span>
              <span>${isLeader ? 'Add Member' : 'New User'}</span>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Filters & Search Bar -->
      <div class="card" style="padding: 12px; margin-bottom: 14px;">
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <input
            type="text"
            class="form-input"
            placeholder="🔍 Search name, @username, phone..."
            value=${searchTerm}
            onInput=${(e) => setSearchTerm(e.target.value)}
            style="flex: 2; font-size: 13px;"
          />
          <select
            class="form-input"
            value=${filterStatus}
            onChange=${(e) => setFilterStatus(e.target.value)}
            style="flex: 1; font-size: 13px;"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Deactivated</option>
          </select>
        </div>

        ${isSuperAdmin ? html`
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <select
              class="form-input"
              value=${filterRole}
              onChange=${(e) => setFilterRole(e.target.value)}
              style="font-size: 12px; padding: 7px 8px;"
            >
              <option value="all">All Roles</option>
              <option value="team_member">Team Members</option>
              <option value="team_leader">Team Leaders</option>
              <option value="usthad">Supervisors / Usthad</option>
              <option value="super_admin">Super Admins</option>
            </select>

            <select
              class="form-input"
              value=${filterTeam}
              onChange=${(e) => setFilterTeam(e.target.value)}
              style="font-size: 12px; padding: 7px 8px;"
            >
              <option value="all">All Teams</option>
              ${teams.map((t) => html`<option key=${t._id} value=${t._id}>${t.name}</option>`)}
            </select>
          </div>
        ` : ''}
      </div>

      <!-- ONE-TIME CREDENTIAL SHARING MODAL -->
      ${oneTimeCreds ? html`
        <div class="modal-overlay" onClick=${() => setOneTimeCreds(null)}>
          <div class="modal" onClick=${(e) => e.stopPropagation()} style="border-top: 4px solid #10b981;">
            <div class="modal-header">
              <div class="modal-title" style="color: #065f46;">
                ${oneTimeCreds.isReset ? '🔑 Password Reset Successfully' : oneTimeCreds.isPinReset ? '🔢 PIN Reset Successfully' : '🎉 Account Created Successfully'}
              </div>
              <button onClick=${() => setOneTimeCreds(null)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
            </div>

            <div style="background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 12px; padding: 14px; margin-bottom: 14px;">
              <p style="font-size: 12px; color: #166534; margin: 0 0 10px; line-height: 1.4;">
                <b>Security Notice:</b> Passwords and PINs are securely hashed and will <u>never</u> be displayed again. Copy these credentials now to share with the user.
              </p>

              <div style="display: flex; flex-direction: column; gap: 6px; font-size: 13px;">
                <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed #bbf7d0; padding-bottom: 4px;">
                  <span style="color: #374151;">Username:</span>
                  <b style="font-family: monospace; color: #0f172a;">@${oneTimeCreds.username}</b>
                </div>

                ${oneTimeCreds.temporaryPassword ? html`
                  <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed #bbf7d0; padding-bottom: 4px;">
                    <span style="color: #374151;">Temporary Password:</span>
                    <b style="font-family: monospace; color: #0284c7; background: #e0f2fe; padding: 2px 6px; border-radius: 4px;">${oneTimeCreds.temporaryPassword}</b>
                  </div>
                ` : ''}

                ${oneTimeCreds.pin ? html`
                  <div style="display: flex; justify-content: space-between; padding-bottom: 4px;">
                    <span style="color: #374151;">4-Digit PIN:</span>
                    <b style="font-family: monospace; color: #059669; background: #dcfce7; padding: 2px 6px; border-radius: 4px; letter-spacing: 2px;">${oneTimeCreds.pin}</b>
                  </div>
                ` : ''}

                ${oneTimeCreds.mustChangePassword ? html`
                  <div style="font-size: 11px; color: #92400e; margin-top: 4px; font-weight: 600;">
                    ⚠️ User will be required to choose a new password upon first login.
                  </div>
                ` : ''}
              </div>
            </div>

            <div style="display: flex; gap: 8px;">
              <button
                type="button"
                class="btn btn-primary btn-full"
                onClick=${copyCredentials}
                style="display: flex; align-items: center; justify-content: center; gap: 6px;"
              >
                <span>${copiedCreds ? '✓ Copied!' : '📋 Copy Credentials'}</span>
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-full"
                onClick=${() => setOneTimeCreds(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- CREATE USER MODAL -->
      ${showAddUser ? html`
        <div class="modal-overlay" onClick=${() => setShowAddUser(false)}>
          <div class="modal" onClick=${(e) => e.stopPropagation()}>
            <div class="modal-header">
              <div class="modal-title">
                ${isLeader ? 'Add New Team Member' : 'Provision User Account'}
              </div>
              <button onClick=${() => setShowAddUser(false)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
            </div>

            <form onSubmit=${handleCreateUser}>
              <div class="form-group">
                <label class="form-label">Full Name *</label>
                <input
                  type="text"
                  class="form-input"
                  placeholder="e.g. Muhammed Rashid"
                  value=${newFullName}
                  onInput=${(e) => setNewFullName(e.target.value)}
                  required
                />
              </div>

              <div class="form-group">
                <label class="form-label">Username (Login ID) *</label>
                <input
                  type="text"
                  class="form-input"
                  placeholder="e.g. rashid12"
                  value=${newUsername}
                  onInput=${(e) => setNewUsername(e.target.value)}
                  required
                />
              </div>

              <div class="form-group">
                <label class="form-label">Initial / Temporary Password *</label>
                <input
                  type="text"
                  class="form-input"
                  placeholder="Min 4 characters (e.g. Temp@123)"
                  value=${newPassword}
                  onInput=${(e) => setNewPassword(e.target.value)}
                  required
                />
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                  User will be prompted to set their permanent password upon first login.
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Optional 4-Digit Quick PIN</label>
                <input
                  type="text"
                  maxlength="6"
                  class="form-input"
                  placeholder="e.g. 1234 (for bank-app keypad login)"
                  value=${newPin}
                  onInput=${(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style="font-family: monospace; font-size: 16px; letter-spacing: 2px; color: #0284c7;"
                />
              </div>

              <div class="form-group">
                <label class="form-label">Phone Number (Optional)</label>
                <input
                  type="tel"
                  class="form-input"
                  placeholder="10-digit mobile number"
                  value=${newPhone}
                  onInput=${(e) => setNewPhone(e.target.value)}
                />
              </div>

              <!-- Profile Photo for New User (Cloudinary) -->
              <div class="form-group">
                <label class="form-label">Profile Photo (Optional - Cloudinary)</label>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <div class="list-avatar" style="width: 44px; height: 44px; font-size: 18px; background: #e2e8f0; color: #64748b; border-radius: 50%; overflow: hidden; flex-shrink: 0;">
                    ${newPhotoData ? html`<img src="${newPhotoData}" alt="" style="width: 100%; height: 100%; object-fit: cover;" />` : '👤'}
                  </div>
                  <label class="btn btn-sm btn-outline" style="cursor: pointer; padding: 4px 10px; font-size: 12px;">
                    ${newPhotoUploading ? 'Processing...' : (newPhotoData ? 'Change Photo' : '📷 Choose Photo')}
                    <input type="file" accept="image/*" style="display: none;" onChange=${handleNewUserPhotoPick} disabled=${newPhotoUploading} />
                  </label>
                  ${newPhotoData ? html`
                    <button type="button" class="btn btn-sm btn-outline" onClick=${() => setNewPhotoData(null)} style="color: #dc2626; padding: 4px 8px; font-size: 11px;">
                      ✕ Remove
                    </button>
                  ` : ''}
                </div>
              </div>

              ${isSuperAdmin ? html`
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                  <div class="form-group">
                    <label class="form-label">Role</label>
                    <select class="form-input" value=${newRole} onChange=${(e) => setNewRole(e.target.value)}>
                      <option value="team_member">Team Member</option>
                      <option value="team_leader">Team Leader</option>
                      <option value="usthad">Supervisor / Usthad</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Assign to Team</label>
                    <select class="form-input" value=${newTeamId} onChange=${(e) => setNewTeamId(e.target.value)}>
                      <option value="">No Team</option>
                      ${teams.map((t) => html`<option key=${t._id} value=${t._id}>${t.name}</option>`)}
                    </select>
                  </div>
                </div>
              ` : html`
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 12px; color: #475569;">
                  <div><b>Role:</b> Team Member</div>
                  <div><b>Team:</b> ${user.teamId ? (user.teamId.name || 'Your Team') : 'Your Team'}</div>
                </div>
              `}

              <button type="submit" class="btn btn-primary btn-full" disabled=${submitting}>
                ${submitting ? 'Creating Account...' : 'Create & Show Credentials'}
              </button>
            </form>
          </div>
        </div>
      ` : ''}

      <!-- EDIT USER MODAL -->
      ${editingUser ? html`
        <div class="modal-overlay" onClick=${() => setEditingUser(null)}>
          <div class="modal" onClick=${(e) => e.stopPropagation()}>
            <div class="modal-header">
              <div class="modal-title">Edit Account: ${editingUser.fullName}</div>
              <button onClick=${() => setEditingUser(null)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
            </div>
            <form onSubmit=${handleSaveEditUser}>
              <div class="form-group">
                <label class="form-label">Full Name</label>
                <input
                  type="text"
                  class="form-input"
                  value=${editFullName}
                  onInput=${(e) => setEditFullName(e.target.value)}
                  required
                />
              </div>

              <div class="form-group">
                <label class="form-label">Phone Number</label>
                <input
                  type="tel"
                  class="form-input"
                  value=${editPhone}
                  onInput=${(e) => setEditPhone(e.target.value)}
                />
              </div>

              ${isSuperAdmin ? html`
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                  <div class="form-group">
                    <label class="form-label">Role</label>
                    <select class="form-input" value=${editRole} onChange=${(e) => setEditRole(e.target.value)}>
                      <option value="team_member">Team Member</option>
                      <option value="team_leader">Team Leader</option>
                      <option value="usthad">Supervisor / Usthad</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Team Assignment</label>
                    <select class="form-input" value=${editTeamId} onChange=${(e) => setEditTeamId(e.target.value)}>
                      <option value="">No Team</option>
                      ${teams.map((t) => html`<option key=${t._id} value=${t._id}>${t.name}</option>`)}
                    </select>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Individual Collection Target (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    class="form-input"
                    value=${editCollectionTarget}
                    onInput=${(e) => setEditCollectionTarget(e.target.value)}
                    placeholder="e.g. 25000"
                    style="font-size: 16px; font-weight: 700; color: #047857;"
                  />
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                    Personal collection target for this member. Updates member & leader dashboards and WhatsApp target report.
                  </div>
                </div>
              ` : ''}

              <button type="submit" class="btn btn-primary btn-full" disabled=${savingEdit}>
                ${savingEdit ? 'Saving Changes...' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      ` : ''}

      <!-- OVERALL MEMBER TARGET MODAL (Super Admin) -->
      ${showOverallTargetModal ? html`
        <div class="modal-overlay" onClick=${() => setShowOverallTargetModal(false)}>
          <div class="modal" onClick=${(e) => e.stopPropagation()}>
            <div class="modal-header">
              <div class="modal-title">🎯 Set Overall Target for All Members</div>
              <button onClick=${() => setShowOverallTargetModal(false)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
            </div>
            <form onSubmit=${handleSaveOverallTarget}>
              <p style="font-size: 13px; color: var(--text-secondary); margin: 0 0 12px;">
                Enter an overall monetary collection target. This target will automatically be set for all team members. You can still adjust individual targets individually as needed using the ✏️ Edit button on any member.
              </p>
              <div class="form-group">
                <label class="form-label">Target Amount Per Member (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  class="form-input"
                  style="font-size: 20px; font-weight: 700; color: #047857;"
                  value=${overallTargetAmount}
                  onInput=${(e) => setOverallTargetAmount(e.target.value)}
                  placeholder="25000"
                  required
                />
              </div>
              <div style="display: flex; gap: 8px; margin-top: 14px;">
                <button type="button" class="btn btn-secondary" style="flex: 1;" onClick=${() => setShowOverallTargetModal(false)}>Cancel</button>
                <button type="submit" class="btn btn-primary" style="flex: 2; background: #059669; border-color: #059669;" disabled=${savingOverallTarget}>
                  ${savingOverallTarget ? 'Saving...' : 'Apply Target to Members ✓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ` : ''}

      <!-- RESET PASSWORD MODAL -->
      ${resetPassUser ? html`
        <div class="modal-overlay" onClick=${() => setResetPassUser(null)}>
          <div class="modal" onClick=${(e) => e.stopPropagation()}>
            <div class="modal-header">
              <div class="modal-title">Reset Password: ${resetPassUser.fullName}</div>
              <button onClick=${() => setResetPassUser(null)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
            </div>
            <form onSubmit=${handleResetPassword}>
              <p style="font-size: 13px; color: var(--text-secondary); margin: 0 0 12px;">
                Generate a temporary password for <b>@${resetPassUser.username}</b>. The user will be required to choose a new password upon logging in.
              </p>

              <div class="form-group">
                <label class="form-label">Custom Temporary Password (optional)</label>
                <input
                  type="text"
                  class="form-input"
                  placeholder="Leave blank to auto-generate (e.g. LSC@5821)"
                  value=${customTempPass}
                  onInput=${(e) => setCustomTempPass(e.target.value)}
                />
              </div>

              <button type="submit" class="btn btn-primary btn-full" disabled=${resettingPass}>
                ${resettingPass ? 'Resetting...' : 'Generate & Show Temporary Password'}
              </button>
            </form>
          </div>
        </div>
      ` : ''}

      <!-- RESET PIN MODAL -->
      ${resetPinUser ? html`
        <div class="modal-overlay" onClick=${() => setResetPinUser(null)}>
          <div class="modal" onClick=${(e) => e.stopPropagation()}>
            <div class="modal-header">
              <div class="modal-title">Reset 4-Digit PIN: ${resetPinUser.fullName}</div>
              <button onClick=${() => setResetPinUser(null)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
            </div>
            <form onSubmit=${handleResetPin}>
              <div class="form-group">
                <label class="form-label">New 4-Digit PIN (optional)</label>
                <input
                  type="text"
                  maxlength="6"
                  class="form-input"
                  placeholder="Leave blank to auto-generate"
                  value=${customTempPin}
                  onInput=${(e) => setCustomTempPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style="font-family: monospace; font-size: 18px; letter-spacing: 2px; color: #0284c7;"
                />
              </div>

              <button type="submit" class="btn btn-primary btn-full" disabled=${resettingPin}>
                ${resettingPin ? 'Updating PIN...' : 'Reset PIN'}
              </button>
            </form>
          </div>
        </div>
      ` : ''}

      <!-- ALLOCATE STOCK MODAL -->
      ${selectedMember ? html`
        <div class="modal-overlay" onClick=${() => setSelectedMember(null)}>
          <div class="modal" onClick=${(e) => e.stopPropagation()}>
            <div class="modal-header">
              <div class="modal-title">Allocate Calendars to ${selectedMember.fullName}</div>
              <button onClick=${() => setSelectedMember(null)} style="background: none; border: none; font-size: 18px; cursor: pointer;">✕</button>
            </div>

            <!-- Current Stock Stats for Member -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; text-align: center;">
              <div>
                <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase;">Total Received</div>
                <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${formatNumber(selectedMember.allocatedStock || 0)}</div>
              </div>
              <div>
                <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase;">Distributed</div>
                <div style="font-size: 15px; font-weight: 700; color: var(--primary);">${formatNumber(selectedMember.distributedStock || 0)}</div>
              </div>
              <div>
                <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase;">In Hand</div>
                <div style="font-size: 15px; font-weight: 700; color: #059669;">${formatNumber(selectedMember.remainingStock || 0)}</div>
              </div>
            </div>

            <form onSubmit=${handleAllocateMember}>
              <div class="form-group">
                <label class="form-label">Number of Additional Calendars to Issue</label>
                <input
                  type="number"
                  min="1"
                  class="form-input"
                  placeholder="e.g. 25"
                  value=${allocQty}
                  onInput=${(e) => setAllocQty(e.target.value)}
                  style="font-size: 20px; font-weight: 700; color: var(--primary);"
                  required
                />
              </div>
              <button type="submit" class="btn btn-primary btn-full" disabled=${allocating}>
                ${allocating ? 'Processing Allocation...' : 'Confirm Stock Allocation ✓'}
              </button>
            </form>
          </div>
        </div>
      ` : ''}

      <!-- Members List -->
      ${loading ? html`
        <div style="height: 140px;" class="skeleton"></div>
      ` : filteredMembers.length === 0 ? html`
        <div class="empty-state">
          <p>No participants found matching the selected criteria.</p>
        </div>
      ` : html`
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${filteredMembers.map((m) => {
            const teamName = m.teamId ? (m.teamId.name || m.teamId) : 'Central';
            const isInactive = m.isActive === false;

            return html`
              <div
                key=${m._id}
                class="card"
                style="margin-bottom: 0; opacity: ${isInactive ? '0.75' : '1'}; border-left: 4px solid ${
                  m.role === 'super_admin'
                    ? '#f59e0b'
                    : m.role === 'usthad'
                    ? '#0284c7'
                    : m.role === 'team_leader'
                    ? '#10b981'
                    : '#64748b'
                };"
              >
                <!-- Top Row: Avatar, Name, Role & Status Badges -->
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                  <div style="position: relative;">
                    <div
                      class="list-avatar"
                      style="width: 46px; height: 46px; font-size: 18px; background: linear-gradient(135deg, #0284c7, #1d4ed8); color: white; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center;"
                    >
                      ${uploadingMemberPhotoId === m._id
                        ? html`<div class="spinner" style="width: 18px; height: 18px; border-width: 2px;"></div>`
                        : m.profilePhoto
                        ? html`<img src="${m.profilePhoto}" alt="" style="width: 100%; height: 100%; object-fit: cover;" />`
                        : m.fullName.charAt(0)}
                    </div>
                    ${isSuperAdmin || isLeader ? html`
                      <label
                        style="position: absolute; bottom: -3px; right: -3px; background: white; border-radius: 50%; padding: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.25); cursor: pointer; border: 1px solid #cbd5e1; display: flex; align-items: center; justify-content: center; width: 19px; height: 19px;"
                        title="Upload/change photo on Cloudinary"
                      >
                        <span style="font-size: 10px; line-height: 1;">📷</span>
                        <input
                          type="file"
                          accept="image/*"
                          style="display: none;"
                          onChange=${(e) => handleMemberPhotoUpload(e, m._id)}
                          disabled=${uploadingMemberPhotoId === m._id}
                        />
                      </label>
                    ` : ''}
                  </div>

                  <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                      <a
                        href="#/profile?id=${m._id}"
                        style="text-decoration: none; font-size: 15px; font-weight: 700; color: #0f172a;"
                      >
                        ${m.fullName}
                      </a>
                      <span class="badge ${isInactive ? 'badge-error' : 'badge-success'}" style="font-size: 10px;">
                        ${isInactive ? 'Inactive' : 'Active'}
                      </span>
                      ${m.mustChangePassword ? html`
                        <span class="badge badge-warning" style="font-size: 10px;">Must Change Pass</span>
                      ` : ''}
                    </div>

                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 1px;">
                      <b>@${m.username}</b> · <span style="text-transform: capitalize;">${m.role.replace('_', ' ')}</span> · 🏷️ ${teamName}
                    </div>

                    <div style="font-size: 11px; margin-top: 3px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                      <span style="background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; padding: 1px 6px; border-radius: 4px; font-weight: 600;">
                        🎯 Target: ${formatCurrency(m.collectionTarget !== undefined && m.collectionTarget !== null ? m.collectionTarget : 25000)}
                      </span>
                      <span style="color: #334155;">In Hand: <b style="color: #059669;">${formatNumber(m.remainingStock || 0)}</b></span>
                      <span style="color: var(--text-secondary);">• Rec: <b>${formatNumber(m.allocatedStock || 0)}</b></span>
                      <span style="color: var(--text-secondary);">• Dist: <b>${formatNumber(m.distributedStock || 0)}</b></span>
                    </div>
                  </div>

                  <!-- Profile Link Button -->
                  <a
                    href="#/profile?id=${m._id}"
                    class="btn btn-outline btn-sm"
                    style="padding: 4px 10px; font-size: 12px;"
                    title="View Profile"
                  >
                    👤 Profile
                  </a>
                </div>

                <!-- Admin & Leader Credentials Inspector (Show / Hide Password & PIN) -->
                ${isSuperAdmin || isUsthad || isLeader ? html`
                  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 10px; margin-bottom: 8px; font-size: 12px; display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <span style="color: #475569; font-weight: 600;">🔑 Password:</span>
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-family: monospace; font-size: 13px; font-weight: 700; color: #0f172a; letter-spacing: ${visiblePasswords[m._id] ? '0' : '2px'};">
                          ${visiblePasswords[m._id]
                            ? (m.passwordHint || '(Password not set)')
                            : (m.passwordHint ? '••••••••' : '(Not set)')}
                        </span>
                        <button
                          type="button"
                          onClick=${() => toggleShowPassword(m._id)}
                          style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 7px; font-size: 11px; cursor: pointer; color: #334155; font-weight: 600;"
                          title="${visiblePasswords[m._id] ? 'Hide Password' : 'Show Password'}"
                        >
                          ${visiblePasswords[m._id] ? '🙈 Hide' : '👁️ Show'}
                        </button>
                      </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <span style="color: #475569; font-weight: 600;">🔢 4-Digit PIN:</span>
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-family: monospace; font-size: 13px; font-weight: 700; color: #0284c7; letter-spacing: ${visiblePins[m._id] ? '1px' : '3px'};">
                          ${visiblePins[m._id]
                            ? (m.pinHint || '(PIN not set)')
                            : (m.pinHint ? '••••' : '(Not set)')}
                        </span>
                        <button
                          type="button"
                          onClick=${() => toggleShowPin(m._id)}
                          style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 7px; font-size: 11px; cursor: pointer; color: #334155; font-weight: 600;"
                          title="${visiblePins[m._id] ? 'Hide PIN' : 'Show PIN'}"
                        >
                          ${visiblePins[m._id] ? '🙈 Hide' : '👁️ Show'}
                        </button>
                      </div>
                    </div>

                    <div style="display: flex; justify-content: flex-end; margin-top: 2px; padding-top: 3px; border-top: 1px dashed #e2e8f0;">
                      <button
                        type="button"
                        onClick=${() => copyMemberCreds(m)}
                        style="background: none; border: none; font-size: 11px; color: #0284c7; font-weight: 600; cursor: pointer; padding: 0;"
                      >
                        📋 Copy Login ID & Password
                      </button>
                    </div>
                  </div>
                ` : ''}

                <!-- Secondary Row: Action Buttons for Admin & Leader -->
                <div style="display: flex; flex-wrap: wrap; gap: 6px; padding-top: 8px; border-top: 1px solid #f1f5f9;">
                  ${isSuperAdmin || isLeader ? html`
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      style="font-size: 11px; padding: 4px 8px;"
                      onClick=${() => setResetPassUser(m)}
                      title="Reset Password"
                    >
                      🔑 Reset Pass
                    </button>

                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      style="font-size: 11px; padding: 4px 8px;"
                      onClick=${() => setResetPinUser(m)}
                      title="Reset PIN"
                    >
                      🔢 Reset PIN
                    </button>

                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      style="font-size: 11px; padding: 4px 8px;"
                      onClick=${() => openEditUser(m)}
                    >
                      ✏️ Edit
                    </button>

                    <button
                      type="button"
                      class="btn btn-outline btn-sm"
                      style="font-size: 11px; padding: 4px 8px; color: ${isInactive ? '#059669' : '#dc2626'}; border-color: ${isInactive ? '#a7f3d0' : '#fca5a5'};"
                      onClick=${() => handleToggleActive(m)}
                    >
                      ${isInactive ? 'Activate' : 'Deactivate'}
                    </button>
                  ` : ''}

                  ${isSuperAdmin || isLeader ? html`
                    <button
                      type="button"
                      class="btn btn-outline btn-sm"
                      style="font-size: 11px; padding: 4px 8px; margin-left: auto;"
                      onClick=${() => {
                        setSelectedMember(m);
                        setAllocQty('');
                      }}
                    >
                      📦 Allocate Stock
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          })}
        </div>
      `}
    </div>
  `;
}
