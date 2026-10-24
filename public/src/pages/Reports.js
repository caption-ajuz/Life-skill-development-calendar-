import api from '../services/api.js';
import db from '../services/db.js';
import { currentUser } from '../store/auth.js';
import { formatCurrency, formatDate, formatNumber } from '../utils/format.js';

const html = window.html;
const { useState, useEffect } = window.hooks;

export default function Reports() {
  const user = currentUser.value;
  const isSuperOrUsthad = user && ['super_admin', 'usthad'].includes(user.role);
  const isTeamLeader = user && user.role === 'team_leader';
  const isTeamMember = user && user.role === 'team_member';

  // Active top-level mode: 'whatsapp' (default) vs 'table'
  const [activeTab, setActiveTab] = useState('whatsapp');

  // WhatsApp Report Controls
  const [reportType, setReportType] = useState('daily'); // 'daily' | 'overall' | 'team' | 'member' | 'area' | 'handover'
  const [dateScope, setDateScope] = useState('today'); // 'today' | 'yesterday' | 'specific_date' | 'date_range' | 'all_time'
  const [singleDate, setSingleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [targetMemberId, setTargetMemberId] = useState('');
  const [selectedAreaId, setSelectedAreaId] = useState('');

  // Granular Section Checkboxes
  const [includeHeader, setIncludeHeader] = useState(true);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeProgressBar, setIncludeProgressBar] = useState(false);
  const [includeTopPerformers, setIncludeTopPerformers] = useState(true);
  const [includeBreakdown, setIncludeBreakdown] = useState(true);
  const [includeCollectionRanking, setIncludeCollectionRanking] = useState(false);
  const [includeHandoverStatus, setIncludeHandoverStatus] = useState(isSuperOrUsthad || isTeamLeader);
  const [includeZeroActivity, setIncludeZeroActivity] = useState(false);
  const [includeOfflineNotice, setIncludeOfflineNotice] = useState(true);
  const [includeFooter, setIncludeFooter] = useState(true);
  const [customNote, setCustomNote] = useState('');

  // WhatsApp Preview state
  const [whatsappText, setWhatsappText] = useState('');
  const [reportMetadata, setReportMetadata] = useState(null);
  const [loadingWa, setLoadingWa] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reference lists for filters
  const [teams, setTeams] = useState([]);
  const [areas, setAreas] = useState([]);
  const [membersList, setMembersList] = useState([]);

  // Table, PDF & Excel Export state
  const [type, setType] = useState('distribution');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('');
  const [tableTeamId, setTableTeamId] = useState('');
  const [tableAreaId, setTableAreaId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const [records, setRecords] = useState([]);
  const [loadingTable, setLoadingTable] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Load reference teams, areas and users once
  useEffect(() => {
    api.get('/api/teams').then((res) => {
      if (res && res.success && res.data) setTeams(res.data);
    }).catch(() => {});

    api.get('/api/areas').then((res) => {
      if (res && res.success && res.data) setAreas(res.data);
    }).catch(() => {});

    api.get('/api/users').then((res) => {
      if (res && res.success && res.data) setMembersList(res.data.users || []);
    }).catch(() => {});
  }, []);

  // Quick Preset Handler
  const applyPreset = (presetName) => {
    if (presetName === 'default') {
      setIncludeHeader(true);
      setIncludeSummary(true);
      setIncludeProgressBar(reportType === 'overall');
      setIncludeTopPerformers(reportType === 'daily' || reportType === 'overall');
      setIncludeBreakdown(true);
      setIncludeHandoverStatus(isSuperOrUsthad || isTeamLeader);
      setIncludeZeroActivity(false);
      setIncludeOfflineNotice(true);
      setIncludeFooter(true);
    } else if (presetName === 'executive') {
      setIncludeHeader(true);
      setIncludeSummary(true);
      setIncludeProgressBar(true);
      setIncludeTopPerformers(false);
      setIncludeBreakdown(false);
      setIncludeHandoverStatus(isSuperOrUsthad || isTeamLeader);
      setIncludeZeroActivity(false);
      setIncludeOfflineNotice(false);
      setIncludeFooter(true);
    } else if (presetName === 'detailed') {
      setIncludeHeader(true);
      setIncludeSummary(true);
      setIncludeProgressBar(true);
      setIncludeTopPerformers(true);
      setIncludeBreakdown(true);
      setIncludeHandoverStatus(isSuperOrUsthad || isTeamLeader);
      setIncludeZeroActivity(true);
      setIncludeOfflineNotice(true);
      setIncludeFooter(true);
    } else if (presetName === 'minimal') {
      setIncludeHeader(false);
      setIncludeSummary(true);
      setIncludeProgressBar(false);
      setIncludeTopPerformers(false);
      setIncludeBreakdown(true);
      setIncludeHandoverStatus(false);
      setIncludeZeroActivity(false);
      setIncludeOfflineNotice(false);
      setIncludeFooter(false);
    }
  };

  // Set date preset handler
  const handleDatePreset = (preset) => {
    setDateScope(preset);
    const now = new Date();
    if (preset === 'today') {
      setSingleDate(now.toISOString().split('T')[0]);
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      setSingleDate(y.toISOString().split('T')[0]);
    }
  };

  // Generate / Fetch Dynamic WhatsApp Summary
  const generateWhatsAppReport = async () => {
    setLoadingWa(true);
    try {
      let offlineCount = 0;
      try {
        offlineCount = await db.getPendingCount();
      } catch (e) {
        offlineCount = 0;
      }

      const activeReportType = isTeamLeader ? 'team' : reportType;
      const params = {
        reportType: activeReportType,
        dateScope,
        includeHeader: includeHeader ? 'true' : 'false',
        includeSummary: includeSummary ? 'true' : 'false',
        includeProgressBar: includeProgressBar ? 'true' : 'false',
        includeTopPerformers: includeTopPerformers ? 'true' : 'false',
        includeBreakdown: includeBreakdown ? 'true' : 'false',
        includeLeaderboard: includeBreakdown ? 'true' : 'false',
        includeCollectionRanking: includeCollectionRanking ? 'true' : 'false',
        includeHandoverStatus: includeHandoverStatus ? 'true' : 'false',
        includeZeroActivity: includeZeroActivity ? 'true' : 'false',
        includeOfflineNotice: includeOfflineNotice ? 'true' : 'false',
        includeFooter: includeFooter ? 'true' : 'false',
        offlineCount
      };

      if (customNote && customNote.trim()) {
        params.customNote = customNote.trim();
      }

      if (dateScope === 'specific_date' || dateScope === 'today' || dateScope === 'yesterday') {
        params.date = singleDate;
      }
      if (dateScope === 'date_range') {
        if (rangeFrom) params.dateFrom = rangeFrom;
        if (rangeTo) params.dateTo = rangeTo;
      }

      if (isTeamLeader) {
        params.teamId = user && user.teamId ? (user.teamId._id || user.teamId) : '';
      } else {
        if (selectedTeamId) params.teamId = selectedTeamId;
      }

      if (targetMemberId) params.targetMemberId = targetMemberId;
      if (selectedAreaId) params.targetAreaId = selectedAreaId;

      const res = await api.get('/api/reports/whatsapp-summary', params);
      if (res && res.success && res.text) {
        setWhatsappText(res.text);
        setReportMetadata(res.metadata || null);
      } else {
        setWhatsappText('Failed to generate summary.');
      }
    } catch (err) {
      console.error('WhatsApp report generation error:', err);
      if (window.showToast) window.showToast('Failed to load WhatsApp report.', 'error');
    } finally {
      setLoadingWa(false);
    }
  };

  // Automatically update preview when WhatsApp options change
  useEffect(() => {
    if (activeTab === 'whatsapp') {
      generateWhatsAppReport();
    }
  }, [
    reportType,
    dateScope,
    singleDate,
    rangeFrom,
    rangeTo,
    selectedTeamId,
    targetMemberId,
    selectedAreaId,
    includeHeader,
    includeSummary,
    includeProgressBar,
    includeTopPerformers,
    includeBreakdown,
    includeCollectionRanking,
    includeHandoverStatus,
    includeZeroActivity,
    includeOfflineNotice,
    includeFooter,
    customNote,
    activeTab
  ]);

  // Share on WhatsApp
  const handleShareWhatsApp = async () => {
    if (!whatsappText) return;

    // Use Web Share API if supported on mobile
    if (navigator.share) {
      try {
        await navigator.share({
          title: reportFormat === 'daily' ? 'Daily Campaign Report' : 'Overall Progress Report',
          text: whatsappText
        });
        if (window.showToast) window.showToast('Shared successfully! ✓', 'success');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    // Direct WhatsApp link fallback
    const encoded = encodeURIComponent(whatsappText);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(waUrl, '_blank');
    if (window.showToast) window.showToast('Opening WhatsApp...', 'info');
  };

  // Copy report to clipboard
  const handleCopyReport = async () => {
    if (!whatsappText) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(whatsappText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = whatsappText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      if (window.showToast) window.showToast('Report copied! Ready to paste into WhatsApp. ✓', 'success');
    } catch (err) {
      if (window.showToast) window.showToast('Failed to copy to clipboard.', 'error');
    }
  };

  // Table Data Loader
  const loadReportData = async () => {
    setLoadingTable(true);
    setCurrentPage(1);
    try {
      const params = { type };
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (status) params.status = status;
      if (tableTeamId) params.teamId = tableTeamId;
      if (tableAreaId) params.areaId = tableAreaId;

      const res = await api.get('/api/reports/data', params);
      if (res && res.success && res.data) {
        let filtered = res.data;
        if (tableTeamId) {
          filtered = filtered.filter(r => (r.teamId ? (r.teamId._id || r.teamId) : null) === tableTeamId);
        }
        if (tableAreaId) {
          filtered = filtered.filter(r => (r.areaId ? (r.areaId._id || r.areaId) : null) === tableAreaId);
        }
        setRecords(filtered);
      }
    } catch (err) {
      if (window.showToast) window.showToast('Failed to load table data.', 'error');
    } finally {
      setLoadingTable(false);
    }
  };

  const handlePrintPDF = () => {
    if (!records.length) {
      if (window.showToast) window.showToast('No records to print or export.', 'warning');
      return;
    }
    window.print();
  };

  useEffect(() => {
    if (activeTab === 'table') {
      loadReportData();
    }
  }, [type, status, tableTeamId, tableAreaId, activeTab]);

  // Excel Export
  const exportExcel = async () => {
    if (!records.length) {
      if (window.showToast) window.showToast('No records to export.', 'warning');
      return;
    }

    setExporting(true);
    try {
      const XLSX = await import('https://esm.sh/xlsx@0.18.5?bundle');

      const rows = records.map((r, idx) => {
        if (type === 'distribution') {
          return {
            '#': idx + 1,
            Date: formatDate(r.date),
            Member: r.memberId ? r.memberId.fullName : '',
            Team: r.teamId ? r.teamId.name : '',
            Area: r.areaId ? r.areaId.name : '',
            Quantity: r.quantity,
            Status: r.status,
            Notes: r.notes || ''
          };
        } else if (type === 'collection') {
          return {
            '#': idx + 1,
            Date: formatDate(r.date),
            Member: r.memberId ? r.memberId.fullName : '',
            Team: r.teamId ? r.teamId.name : '',
            Area: r.areaId ? r.areaId.name : '',
            'Amount (₹)': r.amount,
            Status: r.status,
            Notes: r.notes || ''
          };
        } else {
          return {
            '#': idx + 1,
            Date: formatDate(r.transferDate),
            'From Member': r.fromUserId ? r.fromUserId.fullName : '',
            Team: r.teamId ? r.teamId.name : '',
            'Handed To': r.toDescription,
            'Amount (₹)': r.amount,
            Status: r.status,
            'Confirmed By': r.confirmedBy ? r.confirmedBy.fullName : '',
            Notes: r.notes || ''
          };
        }
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, type.toUpperCase());
      XLSX.writeFile(wb, `LifeSkill_${type}_Report_${new Date().toISOString().split('T')[0]}.xlsx`);

      if (window.showToast) window.showToast('Excel file downloaded! ✓', 'success');
    } catch (err) {
      console.error('Export Excel error:', err);
      if (window.showToast) window.showToast('Failed to export Excel file.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const totalQuantity = type === 'distribution' ? records.reduce((s, r) => s + (r.quantity || 0), 0) : null;
  const totalAmount = type !== 'distribution' ? records.reduce((s, r) => s + (r.amount || 0), 0) : null;

  return html`
    <div class="page">
      <!-- Page Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 700; color: var(--text);">Campaign Reports & Sharing</h2>
          <p style="font-size: 13px; color: var(--text-secondary);">Dynamic WhatsApp bulletins, summaries & exports</p>
        </div>
      </div>

      <!-- Main Navigation Tabs -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px;">
        <button
          type="button"
          onClick=${() => setActiveTab('whatsapp')}
          style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: ${activeTab === 'whatsapp' ? '2px solid #25D366' : '1px solid var(--border)'}; background: ${activeTab === 'whatsapp' ? '#F0FDF4' : 'var(--bg-card)'}; color: ${activeTab === 'whatsapp' ? '#15803D' : 'var(--text)'}; box-shadow: ${activeTab === 'whatsapp' ? '0 2px 4px rgba(37,211,102,0.15)' : 'none'};"
        >
          <span style="font-size: 18px;">📱</span>
          <span>WhatsApp Reports</span>
        </button>

        <button
          type="button"
          onClick=${() => setActiveTab('table')}
          style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: ${activeTab === 'table' ? '2px solid var(--primary)' : '1px solid var(--border)'}; background: ${activeTab === 'table' ? '#EFF6FF' : 'var(--bg-card)'}; color: ${activeTab === 'table' ? 'var(--primary)' : 'var(--text)'}; box-shadow: ${activeTab === 'table' ? '0 2px 4px rgba(8,145,178,0.15)' : 'none'};"
        >
          <span style="font-size: 18px;">📊</span>
          <span>Detailed Records</span>
        </button>
      </div>

      ${activeTab === 'whatsapp' ? html`
        <!-- WHATSAPP REPORT GENERATOR SECTION -->
        <div class="card" style="border-top: 4px solid #25D366;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="display: inline-flex; width: 28px; height: 28px; border-radius: 50%; background: #25D366; color: white; align-items: center; justify-content: center; font-size: 15px; font-weight: bold;">
                ✓
              </span>
              <span style="font-size: 15px; font-weight: 700; color: #0F172A;">WhatsApp Bulletin Generator</span>
            </div>
            <span class="badge badge-success" style="font-size: 11px;">SSF Report Style</span>
          </div>

          <!-- 1. Report Type Selection -->
          <div style="margin-bottom: 14px;">
            <label class="form-label" style="font-size: 13px; font-weight: 700; color: var(--text);">
              1. Choose Report Type
            </label>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px;">
              <button
                type="button"
                onClick=${() => {
                  setReportType('daily');
                  setDateScope('today');
                  applyPreset('default');
                }}
                style="padding: 10px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left; border: ${reportType === 'daily' ? '2px solid #25D366' : '1px solid var(--border)'}; background: ${reportType === 'daily' ? '#DCFCE7' : 'var(--bg)'}; color: ${reportType === 'daily' ? '#166534' : 'var(--text)'};"
              >
                <div style="font-weight: 700;">📅 Daily Campaign</div>
                <div style="font-size: 10.5px; opacity: 0.8; margin-top: 1px;">Day summary & rankings</div>
              </button>

              <button
                type="button"
                onClick=${() => {
                  setReportType('overall');
                  setDateScope('all_time');
                  applyPreset('default');
                }}
                style="padding: 10px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left; border: ${reportType === 'overall' ? '2px solid #25D366' : '1px solid var(--border)'}; background: ${reportType === 'overall' ? '#DCFCE7' : 'var(--bg)'}; color: ${reportType === 'overall' ? '#166534' : 'var(--text)'};"
              >
                <div style="font-weight: 700;">🏆 Overall Progress</div>
                <div style="font-size: 10.5px; opacity: 0.8; margin-top: 1px;">Cumulative target % & ranks</div>
              </button>

              <button
                type="button"
                onClick=${() => {
                  setReportType('team');
                  applyPreset('default');
                }}
                style="padding: 10px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left; border: ${reportType === 'team' ? '2px solid #25D366' : '1px solid var(--border)'}; background: ${reportType === 'team' ? '#DCFCE7' : 'var(--bg)'}; color: ${reportType === 'team' ? '#166534' : 'var(--text)'};"
              >
                <div style="font-weight: 700;">👥 Team Report</div>
                <div style="font-size: 10.5px; opacity: 0.8; margin-top: 1px;">Specific team performance</div>
              </button>

              <button
                type="button"
                onClick=${() => {
                  setReportType('member');
                  applyPreset('default');
                }}
                style="padding: 10px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left; border: ${reportType === 'member' ? '2px solid #25D366' : '1px solid var(--border)'}; background: ${reportType === 'member' ? '#DCFCE7' : 'var(--bg)'}; color: ${reportType === 'member' ? '#166534' : 'var(--text)'};"
              >
                <div style="font-weight: 700;">👤 Member Report</div>
                <div style="font-size: 10.5px; opacity: 0.8; margin-top: 1px;">Individual member metrics</div>
              </button>

              <button
                type="button"
                onClick=${() => {
                  setReportType('area');
                  applyPreset('default');
                }}
                style="padding: 10px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left; border: ${reportType === 'area' ? '2px solid #25D366' : '1px solid var(--border)'}; background: ${reportType === 'area' ? '#DCFCE7' : 'var(--bg)'}; color: ${reportType === 'area' ? '#166534' : 'var(--text)'};"
              >
                <div style="font-weight: 700;">📍 Area Report</div>
                <div style="font-size: 10.5px; opacity: 0.8; margin-top: 1px;">Geographic distribution</div>
              </button>

              ${(isSuperOrUsthad || isTeamLeader) ? html`
                <button
                  type="button"
                  onClick=${() => {
                    setReportType('handover');
                    applyPreset('default');
                  }}
                  style="padding: 10px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left; border: ${reportType === 'handover' ? '2px solid #25D366' : '1px solid var(--border)'}; background: ${reportType === 'handover' ? '#DCFCE7' : 'var(--bg)'}; color: ${reportType === 'handover' ? '#166534' : 'var(--text)'};"
                >
                  <div style="font-weight: 700;">💰 Handover Report</div>
                  <div style="font-size: 10.5px; opacity: 0.8; margin-top: 1px;">Cash transfer audit & bank</div>
                </button>
              ` : ''}
            </div>
          </div>

          <!-- 2. Date & Scope Filters -->
          <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px; margin-bottom: 14px;">
            <label class="form-label" style="font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 6px;">
              2. Date & Scope Selection
            </label>

            <!-- Date Preset Tabs -->
            <div style="display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap;">
              <button
                type="button"
                class="btn btn-sm ${dateScope === 'today' ? 'btn-primary' : 'btn-secondary'}"
                style="padding: 5px 9px; font-size: 11px;"
                onClick=${() => handleDatePreset('today')}
              >
                Today
              </button>
              <button
                type="button"
                class="btn btn-sm ${dateScope === 'yesterday' ? 'btn-primary' : 'btn-secondary'}"
                style="padding: 5px 9px; font-size: 11px;"
                onClick=${() => handleDatePreset('yesterday')}
              >
                Yesterday
              </button>
              <button
                type="button"
                class="btn btn-sm ${dateScope === 'specific_date' ? 'btn-primary' : 'btn-secondary'}"
                style="padding: 5px 9px; font-size: 11px;"
                onClick=${() => setDateScope('specific_date')}
              >
                Specific Date
              </button>
              <button
                type="button"
                class="btn btn-sm ${dateScope === 'date_range' ? 'btn-primary' : 'btn-secondary'}"
                style="padding: 5px 9px; font-size: 11px;"
                onClick=${() => setDateScope('date_range')}
              >
                Date Range
              </button>
              <button
                type="button"
                class="btn btn-sm ${dateScope === 'all_time' ? 'btn-primary' : 'btn-secondary'}"
                style="padding: 5px 9px; font-size: 11px;"
                onClick=${() => setDateScope('all_time')}
              >
                Entire Campaign
              </button>
            </div>

            <!-- Conditional Date Pickers -->
            ${dateScope === 'specific_date' || dateScope === 'today' || dateScope === 'yesterday' ? html`
              <div style="margin-bottom: 8px;">
                <input
                  type="date"
                  class="form-input"
                  style="padding: 7px 10px; font-size: 13px;"
                  value=${singleDate}
                  onInput=${(e) => {
                    setSingleDate(e.target.value);
                    setDateScope('specific_date');
                  }}
                />
              </div>
            ` : dateScope === 'date_range' ? html`
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                <div>
                  <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 2px;">From Date</span>
                  <input
                    type="date"
                    class="form-input"
                    style="padding: 7px 10px; font-size: 12px;"
                    value=${rangeFrom}
                    onInput=${(e) => setRangeFrom(e.target.value)}
                  />
                </div>
                <div>
                  <span style="font-size: 11px; color: var(--text-secondary); display: block; margin-bottom: 2px;">To Date</span>
                  <input
                    type="date"
                    class="form-input"
                    style="padding: 7px 10px; font-size: 12px;"
                    value=${rangeTo}
                    onInput=${(e) => setRangeTo(e.target.value)}
                  />
                </div>
              </div>
            ` : ''}

            <!-- Scope Targets based on Report Type -->
            ${isTeamLeader ? html`
              <div style="margin-top: 8px; padding: 10px 12px; background: rgba(8,145,178,0.08); border-radius: 8px; border: 1px solid var(--border);">
                <div style="font-size: 11px; font-weight: 700; color: var(--text-light); text-transform: uppercase;">Team Leader Scope</div>
                <div style="font-size: 13.5px; font-weight: 700; color: var(--primary); margin-top: 2px;">
                  👥 ${user.teamId && (user.teamId.name || user.teamId) ? (user.teamId.name || user.teamId) : 'My Team'}
                </div>
                <div style="font-size: 11px; color: var(--text-light); margin-top: 2px;">
                  Authorized to generate and share WhatsApp report for your own team only.
                </div>
              </div>
            ` : ((reportType === 'team' || isSuperOrUsthad) ? html`
              <div style="margin-top: 6px;">
                <label style="font-size: 11.5px; font-weight: 600; color: var(--text); display: block; margin-bottom: 3px;">
                  ${reportType === 'team' ? 'Select Target Team *' : 'Team Filter (Optional)'}
                </label>
                <select
                  class="form-input"
                  style="padding: 7px 10px; font-size: 13px;"
                  value=${selectedTeamId}
                  onChange=${(e) => setSelectedTeamId(e.target.value)}
                >
                  <option value="">${reportType === 'team' ? '-- Choose Team --' : 'All Teams'}</option>
                  ${teams.map((t) => html`<option key=${t._id} value=${t._id}>${t.name}</option>`)}
                </select>
              </div>
            ` : '')}

            ${reportType === 'member' ? html`
              <div style="margin-top: 6px;">
                <label style="font-size: 11.5px; font-weight: 600; color: var(--text); display: block; margin-bottom: 3px;">
                  Select Target Member *
                </label>
                <select
                  class="form-input"
                  style="padding: 7px 10px; font-size: 13px;"
                  value=${targetMemberId}
                  onChange=${(e) => setTargetMemberId(e.target.value)}
                >
                  <option value="">-- Choose Member --</option>
                  ${membersList.map((m) => html`
                    <option key=${m._id} value=${m._id}>
                      ${m.fullName} (${m.role.replace('_', ' ')})
                    </option>
                  `)}
                </select>
              </div>
            ` : ''}

            ${reportType === 'area' || isSuperOrUsthad ? html`
              <div style="margin-top: 6px;">
                <label style="font-size: 11.5px; font-weight: 600; color: var(--text); display: block; margin-bottom: 3px;">
                  ${reportType === 'area' ? 'Select Target Area *' : 'Area Filter (Optional)'}
                </label>
                <select
                  class="form-input"
                  style="padding: 7px 10px; font-size: 13px;"
                  value=${selectedAreaId}
                  onChange=${(e) => setSelectedAreaId(e.target.value)}
                >
                  <option value="">${reportType === 'area' ? '-- Choose Area --' : 'All Areas'}</option>
                  ${areas.map((a) => html`<option key=${a._id} value=${a._id}>${a.name}</option>`)}
                </select>
              </div>
            ` : ''}
          </div>

          <!-- 3. Granular Report Sections (Checkboxes) -->
          <div style="margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <label class="form-label" style="font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 0;">
                3. Customize Sections
              </label>
              <!-- Quick Presets -->
              <div style="display: flex; gap: 4px;">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  style="padding: 3px 7px; font-size: 10.5px;"
                  onClick=${() => applyPreset('default')}
                  title="Reset to recommended sections for this report"
                >
                  Default
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  style="padding: 3px 7px; font-size: 10.5px;"
                  onClick=${() => applyPreset('executive')}
                  title="Top-level summary and progress bar only"
                >
                  Executive
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  style="padding: 3px 7px; font-size: 10.5px;"
                  onClick=${() => applyPreset('detailed')}
                  title="Include all available breakdowns and metrics"
                >
                  Detailed
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  style="padding: 3px 7px; font-size: 10.5px;"
                  onClick=${() => applyPreset('minimal')}
                  title="Compact minimal summary"
                >
                  Minimal
                </button>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12.5px;">
              <label style="display: flex; align-items: center; gap: 7px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; background: var(--bg-card);">
                <input
                  type="checkbox"
                  checked=${includeHeader}
                  onChange=${(e) => setIncludeHeader(e.target.checked)}
                />
                <span>Header & Logo</span>
              </label>

              <label style="display: flex; align-items: center; gap: 7px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; background: var(--bg-card);">
                <input
                  type="checkbox"
                  checked=${includeSummary}
                  onChange=${(e) => setIncludeSummary(e.target.checked)}
                />
                <span>Key Summary Totals</span>
              </label>

              <label style="display: flex; align-items: center; gap: 7px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; background: var(--bg-card);">
                <input
                  type="checkbox"
                  checked=${includeProgressBar}
                  onChange=${(e) => setIncludeProgressBar(e.target.checked)}
                />
                <span>Target Progress Bar [▓▓░░]</span>
              </label>

              <label style="display: flex; align-items: center; gap: 7px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; background: var(--bg-card);">
                <input
                  type="checkbox"
                  checked=${includeTopPerformers}
                  onChange=${(e) => setIncludeTopPerformers(e.target.checked)}
                />
                <span>Top Performers 🥇🥈🥉</span>
              </label>

              <label style="display: flex; align-items: center; gap: 7px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; background: var(--bg-card);">
                <input
                  type="checkbox"
                  checked=${includeBreakdown}
                  onChange=${(e) => setIncludeBreakdown(e.target.checked)}
                />
                <span>Calendar Leaderboard (Highest to Lowest)</span>
              </label>

              ${(isSuperOrUsthad || isTeamLeader) ? html`
                <label style="display: flex; align-items: center; gap: 7px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; background: var(--bg-card);">
                  <input
                    type="checkbox"
                    checked=${includeCollectionRanking}
                    onChange=${(e) => setIncludeCollectionRanking(e.target.checked)}
                  />
                  <span>Collection Ranking (₹ Highest to Lowest)</span>
                </label>
              ` : ''}

              ${(isSuperOrUsthad || isTeamLeader) ? html`
                <label style="display: flex; align-items: center; gap: 7px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; background: var(--bg-card);">
                  <input
                    type="checkbox"
                    checked=${includeHandoverStatus}
                    onChange=${(e) => setIncludeHandoverStatus(e.target.checked)}
                  />
                  <span>Handover & Cash Status</span>
                </label>
              ` : ''}

              <label style="display: flex; align-items: center; gap: 7px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; background: var(--bg-card);">
                <input
                  type="checkbox"
                  checked=${includeZeroActivity}
                  onChange=${(e) => setIncludeZeroActivity(e.target.checked)}
                />
                <span>Include Zero-Activity Units</span>
              </label>

              <label style="display: flex; align-items: center; gap: 7px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; background: var(--bg-card);">
                <input
                  type="checkbox"
                  checked=${includeOfflineNotice}
                  onChange=${(e) => setIncludeOfflineNotice(e.target.checked)}
                />
                <span>Offline Sync Notice</span>
              </label>

              <label style="display: flex; align-items: center; gap: 7px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; background: var(--bg-card);">
                <input
                  type="checkbox"
                  checked=${includeFooter}
                  onChange=${(e) => setIncludeFooter(e.target.checked)}
                />
                <span>Islamic Dua & Footer</span>
              </label>
            </div>
          </div>

          <!-- 4. Custom Closing Note -->
          <div style="margin-bottom: 14px;">
            <label class="form-label" style="font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 4px;">
              4. Custom Closing Announcement (Optional)
            </label>
            <input
              type="text"
              class="form-input"
              placeholder="e.g. Camp review meeting tomorrow 8 PM at Markaz auditorium"
              value=${customNote}
              onInput=${(e) => setCustomNote(e.target.value)}
            />
          </div>

          <!-- Direct Primary Action Buttons -->
          <div style="display: grid; grid-template-columns: 1.3fr 1fr auto; gap: 8px; margin-top: 8px;">
            <button
              type="button"
              class="btn btn-success"
              style="background: #25D366; color: white; font-weight: 700; border: none; font-size: 14px; box-shadow: 0 2px 4px rgba(37,211,102,0.3);"
              onClick=${handleShareWhatsApp}
              disabled=${loadingWa || !whatsappText}
            >
              <span>🚀 Share on WhatsApp</span>
            </button>

            <button
              type="button"
              class="btn btn-secondary"
              style="font-weight: 600; font-size: 13px;"
              onClick=${handleCopyReport}
              disabled=${loadingWa || !whatsappText}
            >
              <span>${copied ? '✓ Copied!' : '📋 Copy Report'}</span>
            </button>

            <button
              type="button"
              class="btn btn-secondary"
              style="padding: 0 12px; font-size: 14px;"
              onClick=${generateWhatsAppReport}
              title="Refresh Preview"
            >
              🔄
            </button>
          </div>
        </div>

        <!-- LIVE WHATSAPP MESSAGE BUBBLE PREVIEW -->
        <div class="card" style="padding: 0; overflow: hidden; border: 1px solid #CBD5E1; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08);">
          <!-- WhatsApp Mock Top Bar -->
          <div style="background: #075E54; color: white; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px;">💬</span>
              <div>
                <div style="font-size: 13px; font-weight: 700; line-height: 1.2;">WhatsApp Message Preview</div>
                <div style="font-size: 11px; opacity: 0.85;">
                  ${reportType === 'daily' ? 'Daily Campaign Bulletin' : reportType === 'overall' ? 'Cumulative Progress Report' : reportType === 'team' ? 'Team Performance Report' : reportType === 'member' ? 'Individual Member Report' : reportType === 'area' ? 'Area-wise Report' : 'Financial Handover Report'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick=${handleCopyReport}
              style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;"
            >
              ${copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          <!-- WhatsApp Chat Surface -->
          <div style="background: #ECE5DD; padding: 14px 12px; min-height: 240px; background-image: radial-gradient(#d3c7b8 10%, transparent 11%); background-size: 16px 16px;">
            ${loadingWa ? html`
              <div style="text-align: center; padding: 40px 10px; color: #475569;">
                <div class="spinner" style="border-top-color: #075E54; margin: 0 auto 12px;"></div>
                <div style="font-size: 13px; font-weight: 600;">Generating dynamic report...</div>
              </div>
            ` : html`
              <!-- Message Bubble -->
              <div style="max-width: 95%; margin: 0 auto; background: #FFFFFF; border-radius: 10px 10px 10px 0; padding: 12px 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.18); position: relative; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <pre style="white-space: pre-wrap; word-break: break-word; font-family: inherit; font-size: 13px; line-height: 1.55; color: #111827; margin: 0;">
${whatsappText}
                </pre>
                <div style="text-align: right; margin-top: 8px; font-size: 10px; color: #64748B; font-weight: 500;">
                  ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓
                </div>
              </div>

              <!-- Quick action banner under bubble -->
              <div style="display: flex; justify-content: center; gap: 8px; margin-top: 12px;">
                <button
                  type="button"
                  onClick=${handleShareWhatsApp}
                  style="background: #25D366; color: white; border: none; border-radius: 20px; padding: 8px 18px; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.15);"
                >
                  <span>Forward to WhatsApp</span>
                  <span>↗</span>
                </button>
                <button
                  type="button"
                  onClick=${handleCopyReport}
                  style="background: #FFFFFF; color: #0F172A; border: 1px solid #CBD5E1; border-radius: 20px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer;"
                >
                  ${copied ? '✓ Copied' : 'Copy Text'}
                </button>
              </div>
            `}
          </div>
        </div>
      ` : html`
        <!-- DETAILED TABLE, PDF & EXPORT VIEW -->
        <div class="card">
          <div class="tabs" style="margin-bottom: 10px;">
            <button class="tab ${type === 'distribution' ? 'active' : ''}" onClick=${() => setType('distribution')}>Distributions</button>
            <button class="tab ${type === 'collection' ? 'active' : ''}" onClick=${() => setType('collection')}>Collections</button>
            <button class="tab ${type === 'transfer' ? 'active' : ''}" onClick=${() => setType('transfer')}>Transfers</button>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
            <div>
              <label class="form-label" style="font-size: 11px;">From Date</label>
              <input type="date" class="form-input" style="padding: 6px 8px; font-size: 12px;" value=${dateFrom} onInput=${(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label class="form-label" style="font-size: 11px;">To Date</label>
              <input type="date" class="form-input" style="padding: 6px 8px; font-size: 12px;" value=${dateTo} onInput=${(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
            <div>
              <label class="form-label" style="font-size: 11px;">Team Filter</label>
              <select class="form-input" style="padding: 6px 8px; font-size: 12px;" value=${tableTeamId} onChange=${(e) => setTableTeamId(e.target.value)}>
                <option value="">All Teams</option>
                ${teams.map(t => html`<option key=${t._id} value=${t._id}>${t.name}</option>`)}
              </select>
            </div>
            <div>
              <label class="form-label" style="font-size: 11px;">Area Filter</label>
              <select class="form-input" style="padding: 6px 8px; font-size: 12px;" value=${tableAreaId} onChange=${(e) => setTableAreaId(e.target.value)}>
                <option value="">All Areas</option>
                ${areas.map(a => html`<option key=${a._id} value=${a._id}>${a.name}</option>`)}
              </select>
            </div>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            <button class="btn btn-primary btn-sm" style="flex: 1;" onClick=${loadReportData}>
              Apply Filters
            </button>
            <button class="btn btn-secondary btn-sm" onClick=${handlePrintPDF} title="Print or Save as PDF" style="background: #1e293b; color: white; border: none;">
              📄 Print / PDF
            </button>
            <button class="btn btn-secondary btn-sm" onClick=${exportExcel} disabled=${exporting}>
              📥 Excel
            </button>
            <button class="btn btn-secondary btn-sm" onClick=${() => setActiveTab('whatsapp')} style="background: #25D366; color: white; border: none;">
              📱 WhatsApp
            </button>
          </div>
        </div>

        <!-- Large Dataset Warning (> 1,000 records) -->
        ${records.length > 1000 ? html`
          <div class="card" style="border-left: 4px solid #f59e0b; background: #fffbeb; padding: 10px 14px; margin-bottom: 10px;">
            <div style="font-size: 13px; font-weight: 700; color: #b45309;">
              ⚠️ High-Volume Dataset (${formatNumber(records.length)} total records)
            </div>
            <div style="font-size: 12px; color: #92400e; margin-top: 2px;">
              Dataset exceeds 1,000 entries. Displaying in high-performance 50-row chunks to prevent device memory exhaustion.
            </div>
          </div>
        ` : ''}

        <!-- Summary Stat -->
        <div class="card" style="background: #f1f5f9; padding: 10px 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 13px; font-weight: 600; color: var(--text-secondary);">
              Total Records: <b>${formatNumber(records.length)}</b>
            </span>
            <span style="font-size: 15px; font-weight: 700; color: var(--primary);">
              ${type === 'distribution' ? `${formatNumber(totalQuantity)} Calendars` : formatCurrency(totalAmount)}
            </span>
          </div>
        </div>

        <!-- Scrollable Data Table -->
        <div class="card" style="padding: 0; overflow: hidden;">
          ${loadingTable
            ? html`<div style="height: 120px;" class="skeleton"></div>`
            : records.length === 0
            ? html`<div class="empty-state"><p>No records found for the selected filter.</p></div>`
            : html`
                <div class="table-wrap" style="margin: 0; padding: 0;">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Member</th>
                        <th>Team</th>
                        ${type !== 'transfer' ? html`<th>Area</th>` : html`<th>To</th>`}
                        <th class="text-right">${type === 'distribution' ? 'Qty' : 'Amount'}</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${records.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(
                        (r) => html`
                          <tr key=${r._id}>
                            <td style="white-space: nowrap; font-size: 12px;">
                              ${formatDate(type === 'transfer' ? r.transferDate : r.date)}
                            </td>
                            <td style="font-weight: 500; font-size: 13px;">
                              ${(type === 'transfer' ? (r.fromUserId && r.fromUserId.fullName) : (r.memberId && r.memberId.fullName)) || '-'}
                            </td>
                            <td style="font-size: 12px; color: var(--text-secondary);">
                              ${r.teamId ? (r.teamId.name || r.teamId) : '-'}
                            </td>
                            <td style="font-size: 12px;">
                              ${type === 'transfer' ? r.toDescription : (r.areaId ? (r.areaId.name || r.areaId) : '-')}
                            </td>
                            <td class="text-right" style="font-weight: 700; color: ${type === 'distribution' ? 'var(--primary)' : '#059669'};">
                              ${type === 'distribution' ? r.quantity : formatCurrency(r.amount)}
                            </td>
                            <td>
                              <span class="badge badge-${r.status === 'confirmed' || r.status === 'active' ? 'success' : r.status === 'disputed' ? 'error' : 'warning'}" style="font-size: 10px;">
                                ${r.status}
                              </span>
                            </td>
                          </tr>
                        `
                      )}
                    </tbody>
                  </table>
                </div>

                <!-- Pagination Controls for large datasets -->
                ${records.length > pageSize ? html`
                  <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px;">
                    <div>
                      Page <b>${currentPage}</b> of <b>${Math.ceil(records.length / pageSize)}</b>
                    </div>
                    <div style="display: flex; gap: 6px;">
                      <button
                        class="btn btn-secondary btn-sm"
                        disabled=${currentPage <= 1}
                        onClick=${() => setCurrentPage(p => Math.max(1, p - 1))}
                        style="padding: 2px 8px; font-size: 11px;"
                      >
                        ← Prev
                      </button>
                      <button
                        class="btn btn-secondary btn-sm"
                        disabled=${currentPage >= Math.ceil(records.length / pageSize)}
                        onClick=${() => setCurrentPage(p => p + 1)}
                        style="padding: 2px 8px; font-size: 11px;"
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                ` : ''}
              `}
        </div>
      `}
    </div>
  `;
}
