import { useState, useEffect, useRef } from 'react';
import { Plus, Building2, FolderOpen, Trash2, Users, User as UserIcon, Settings, CreditCard as Edit2, FileDown, Upload, Search, Image, RefreshCw } from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import ClientAssignment from './ClientAssignment';
import ClientStatusPill from './ClientStatusPill';
import MultiSelectStatusFilter from './MultiSelectStatusFilter';
import { readExcelToJson, writeExcelFile } from '../../../lib/excel';
import {
  getClientHealthStats, getOrgFlowCurrentUser, getOrgFlowClients,
  getOrgFlowUsers, updateOrgFlowClient, uploadClientLogo, removeClientLogo,
  createOrgFlowClient, deleteOrgFlowClient, importOrgFlowClients,
  syncBullhornClients,
} from '../../../lib/api';

const STATUS_OPTIONS = [
  { value: 'Unqualified', label: 'Unqualified' },
  { value: 'Qualified Lead', label: 'Qualified Lead' },
  { value: 'Proposal', label: 'Proposal' },
  { value: 'Negotiation', label: 'Negotiation' },
  { value: 'Active Account', label: 'Active Account' },
  { value: 'Passive Account', label: 'Passive Account' },
  { value: 'DNC', label: 'DNC' },
  { value: 'Archive', label: 'Archive' },
];

// STATUS_OPTIONS doubles as the canonical pipeline order — sort by status
// uses array index as the rank so cards group by stage in lifecycle order
// rather than alphabetical (which would scatter Active/Archive/DNC).
const STATUS_RANK = new Map(STATUS_OPTIONS.map((opt, idx) => [opt.value, idx]));
const statusRank = (s) => {
  const r = STATUS_RANK.get(s);
  return r === undefined ? Number.MAX_SAFE_INTEGER : r;
};

export default function OrgFlowDashboard({ onSelectClient }) {
  const { accounts } = useMsal();
  const currentUserEmail = accounts[0]?.username || '';

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('all');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [assignmentClient, setAssignmentClient] = useState(null);
  const [editManagerClient, setEditManagerClient] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [newManagerId, setNewManagerId] = useState('');
  const fileInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');
  const [statusFilter, setStatusFilter] = useState(() => new Set());
  const [logoUploadClient, setLogoUploadClient] = useState(null);
  const [failedLogos, setFailedLogos] = useState(new Set());
  const [logoFile, setLogoFile] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [clientHealthStats, setClientHealthStats] = useState({});
  const [healthModal, setHealthModal] = useState(null);
  const [alliesModal, setAlliesModal] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // Resolve MSAL email to Supabase user_profiles ID on mount
  useEffect(() => {
    if (currentUserEmail) {
      getOrgFlowCurrentUser()
        .then((data) => {
          if (data) setCurrentUserId(data.id);
        })
        .catch(() => {});
    }
  }, [currentUserEmail]);

  useEffect(() => {
    loadClients();
    getClientHealthStats()
      .then(stats => setClientHealthStats(stats || {}))
      .catch(() => {});
  }, [viewMode, currentUserId]);

  const loadClients = async () => {
    try {
      const data = await getOrgFlowClients(viewMode, currentUserId);
      setClients(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAllUsers = async () => {
    const data = await getOrgFlowUsers();
    setAllUsers(data || []);
  };

  const handleUpdateManager = async () => {
    if (!editManagerClient || !newManagerId) return;

    try {
      await updateOrgFlowClient(editManagerClient.id, { created_by: newManagerId });
      setEditManagerClient(null);
      setNewManagerId('');
      loadClients();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateStatus = async (clientId, newStatus) => {
    const prev = clients;
    setClients((cs) => cs.map((c) => (c.id === clientId ? { ...c, status: newStatus } : c)));
    try {
      const result = await updateOrgFlowClient(clientId, { status: newStatus });
      if (result?.bullhornSync && result.bullhornSync.ok === false) {
        setError(`Saved to Org Flow, but Bullhorn write-back failed: ${result.bullhornSync.error || 'unknown error'}`);
      }
      loadClients();
    } catch (err) {
      setClients(prev);
      setError(err.message);
    }
  };

  const handleLogoUpload = async () => {
    if (!logoUploadClient || !logoFile) return;

    setUploadingLogo(true);
    try {
      await uploadClientLogo(logoUploadClient.id, logoFile);
      setLogoUploadClient(null);
      setLogoFile(null);
      loadClients();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!logoUploadClient) return;

    setUploadingLogo(true);
    try {
      await removeClientLogo(logoUploadClient.id);
      setLogoUploadClient(null);
      setLogoFile(null);
      loadClients();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleAddClient = async (e) => {
    e.preventDefault();
    if (!newClientName.trim()) return;

    try {
      await createOrgFlowClient(newClientName, currentUserId);
      setNewClientName('');
      setShowAddModal(false);
      loadClients();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteClient = async (clientId) => {
    try {
      await deleteOrgFlowClient(clientId);
      setDeleteConfirmId(null);
      loadClients();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDownloadClientTemplate = async () => {
    const templateData = [
      { ClientName: 'Acme Corporation', AccountManager: 'John Smith', AccountManagerEmail: 'john@example.com' },
      { ClientName: 'TechStart Inc', AccountManager: 'Jane Doe', AccountManagerEmail: 'jane@example.com' },
      { ClientName: 'Global Solutions Ltd', AccountManager: 'John Smith', AccountManagerEmail: 'john@example.com' },
    ];

    await writeExcelFile(templateData, 'Clients', 'clients_template.xlsx');
  };

  const handleImportClients = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonData = await readExcelToJson(event.target?.result);

        if (!jsonData || jsonData.length === 0) {
          setError('The file is empty or has no valid data.');
          return;
        }

        // Send parsed rows to server — server handles user resolution and insert/update logic
        const result = await importOrgFlowClients(jsonData, currentUserId);

        loadClients();
        setError('');

        let message = `Successfully imported ${result.inserted} new client(s)`;
        if (result.updated > 0) {
          message += ` and updated ${result.updated} existing client(s)`;
        }
        if (result.skippedRows?.length > 0) {
          message += `\n\nSkipped ${result.skippedRows.length} row(s):\n${result.skippedRows.slice(0, 5).join('\n')}`;
          if (result.skippedRows.length > 5) {
            message += `\n... and ${result.skippedRows.length - 5} more`;
          }
        }
        if (result.warnings?.length > 0) {
          message += `\n\nWarnings:\n${result.warnings.slice(0, 3).join('\n')}`;
          if (result.warnings.length > 3) {
            message += `\n... and ${result.warnings.length - 3} more`;
          }
        }

        alert(message);
      } catch (err) {
        console.error('Error importing clients:', err);
        setError(`Error importing file. Please check the format. Details: ${err?.message || err}`);
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSyncBullhorn = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await syncBullhornClients();
      if (result?.skipped === 'already-running') {
        alert('A sync is already running — try again in a moment.');
      } else {
        const { inserted = 0, linked = 0, updated = 0, contactsInserted = 0 } = result || {};
        alert(
          `Bullhorn sync complete:\n` +
          `• ${inserted} new client(s)\n` +
          `• ${linked} linked to existing card(s)\n` +
          `• ${updated} updated\n` +
          `• ${contactsInserted} new contact(s)`
        );
      }
      await loadClients();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const isMyClient = (client) => client.created_by === currentUserId;

  const filteredAndSortedClients = clients
    .filter((client) => {
      if (statusFilter.size > 0 && !statusFilter.has(client.status || 'Unqualified')) return false;
      if (!searchQuery.trim()) return true;

      const query = searchQuery.toLowerCase();
      const clientName = client.name.toLowerCase();
      const managerName = (client.account_manager?.full_name || '').toLowerCase();
      const managerEmail = (client.account_manager?.email || '').toLowerCase();

      return (
        clientName.includes(query) ||
        managerName.includes(query) ||
        managerEmail.includes(query)
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'date-asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'date-desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'updated-asc':
          return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        case 'updated-desc':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case 'status-asc': {
          const diff = statusRank(a.status) - statusRank(b.status);
          return diff !== 0 ? diff : a.name.localeCompare(b.name);
        }
        case 'status-desc': {
          const diff = statusRank(b.status) - statusRank(a.status);
          return diff !== 0 ? diff : a.name.localeCompare(b.name);
        }
        default:
          return 0;
      }
    });

  return (
    <div className="of-dashboard">
      <header className="of-module-toolbar">
        <div className="of-module-toolbar-left">
          <img src="/apt-logo.jpg" alt="APT" className="of-module-toolbar-logo" />
          <h2 className="of-module-toolbar-title">Org Flow</h2>
        </div>
      </header>

      <main className="of-main">
        <div className="of-toolbar">
          <div className="of-toolbar-left">
            <h2 className="of-page-title">
              {viewMode === 'my' ? 'My Clients' : 'All Clients'}
            </h2>
            <div className="of-view-toggle">
              <button
                onClick={() => setViewMode('my')}
                className={`of-toggle-btn ${viewMode === 'my' ? 'of-toggle-btn-active' : ''}`}
              >
                <UserIcon className="of-icon-sm" />
                <span>My Clients</span>
              </button>
              <button
                onClick={() => setViewMode('all')}
                className={`of-toggle-btn ${viewMode === 'all' ? 'of-toggle-btn-active' : ''}`}
              >
                <Users className="of-icon-sm" />
                <span>All Clients</span>
              </button>
            </div>
          </div>
          <div className="of-toolbar-right">
            <button
              onClick={handleDownloadClientTemplate}
              className="of-btn of-btn-success"
            >
              <FileDown className="of-icon" />
              <span>Download Template</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportClients}
              className="of-hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="of-btn of-btn-import"
            >
              <Upload className="of-icon" />
              <span>Import Clients</span>
            </button>
            <button
              onClick={handleSyncBullhorn}
              disabled={syncing}
              className="of-btn of-btn-secondary"
              title="Pull active clients from Bullhorn into Org Flow"
            >
              <RefreshCw className={`of-icon ${syncing ? 'of-spin' : ''}`} />
              <span>{syncing ? 'Syncing…' : 'Sync from Bullhorn'}</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="of-btn of-btn-primary"
            >
              <Plus className="of-icon" />
              <span>Add Client</span>
            </button>
          </div>
        </div>

        <div className="of-search-bar">
          <div className="of-search-input-wrapper">
            <Search className="of-search-icon" />
            <input
              type="text"
              placeholder="Search by client name or account manager..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="of-search-input"
            />
          </div>
          <MultiSelectStatusFilter
            options={STATUS_OPTIONS}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="of-sort-select"
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="updated-desc">Recently Updated</option>
            <option value="updated-asc">Least Recently Updated</option>
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="status-asc">Status (Lead → Archive)</option>
            <option value="status-desc">Status (Archive → Lead)</option>
          </select>
        </div>

        {error && (
          <div className="of-error-banner">
            {error}
          </div>
        )}

        {loading ? (
          <div className="of-empty-state">
            <div className="of-loading-text">Loading clients...</div>
          </div>
        ) : clients.length === 0 ? (
          <div className="of-empty-state of-empty-state-card">
            <FolderOpen className="of-empty-icon" />
            <h3 className="of-empty-title">No clients yet</h3>
            <p className="of-empty-text">Get started by adding your first client</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="of-btn of-btn-primary"
            >
              Add Your First Client
            </button>
          </div>
        ) : filteredAndSortedClients.length === 0 ? (
          <div className="of-empty-state of-empty-state-card">
            <Search className="of-empty-icon" />
            <h3 className="of-empty-title">No clients found</h3>
            <p className="of-empty-text">Try adjusting your search criteria</p>
            <button
              onClick={() => setSearchQuery('')}
              className="of-btn of-btn-primary"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div className="of-client-grid">
            {filteredAndSortedClients.map((client) => (
              <div
                key={client.id}
                className="of-client-card"
              >
                <div className="of-card-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLogoUploadClient(client);
                      setLogoFile(null);
                    }}
                    className="of-card-action-btn of-card-action-logo"
                    title="Upload logo"
                  >
                    <Image className="of-icon-sm" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssignmentClient(client);
                    }}
                    className="of-card-action-btn of-card-action-settings"
                    title="Manage user access"
                  >
                    <Settings className="of-icon-sm" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(client.id);
                    }}
                    className="of-card-action-btn of-card-action-delete"
                    title="Delete client"
                  >
                    <Trash2 className="of-icon-sm" />
                  </button>
                </div>
                <ClientStatusPill
                  value={client.status || 'Unqualified'}
                  options={STATUS_OPTIONS}
                  onSave={(newStatus) => handleUpdateStatus(client.id, newStatus)}
                />
                <button
                  onClick={() => onSelectClient(client.id)}
                  className="of-card-body"
                >
                  <div className="of-card-header">
                    {client.logo_url && !failedLogos.has(client.id) ? (
                      <div className="of-client-logo-wrapper">
                        <img
                          src={client.logo_url}
                          alt={`${client.name} logo`}
                          className="of-client-logo-img"
                          onError={() => setFailedLogos(prev => new Set(prev).add(client.id))}
                        />
                      </div>
                    ) : (
                      <div className="of-client-icon">
                        <Building2 className="of-client-icon-building" />
                      </div>
                    )}
                  </div>
                  <h3 className="of-client-name">{client.name}</h3>
                  {clientHealthStats[client.id] && (
                    <>
                      <div
                        className="of-healthy-managers of-healthy-clickable"
                        title="Healthy = has 1+ active Apt placement. People Manager = has direct reports, FTEs, contractors, or active placements."
                        onClick={(e) => {
                          e.stopPropagation();
                          setHealthModal({ clientName: client.name, ...clientHealthStats[client.id] });
                        }}
                      >
                        <span className="of-healthy-label">Healthy Managers:</span>
                        <span className={`of-healthy-value ${clientHealthStats[client.id].percentage >= 80 ? 'of-healthy-good' : clientHealthStats[client.id].percentage >= 50 ? 'of-healthy-warn' : 'of-healthy-low'}`}>
                          {clientHealthStats[client.id].percentage}%
                        </span>
                        <span className="of-healthy-detail">({clientHealthStats[client.id].healthyManagers}/{clientHealthStats[client.id].totalManagers})</span>
                      </div>
                      <div
                        className="of-allies-row of-allies-clickable"
                        title="Click to see active placements at this client"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAlliesModal({ clientName: client.name, ...clientHealthStats[client.id] });
                        }}
                      >
                        <span className="of-allies-label">Apt Allies:</span>
                        <span className="of-allies-value">{clientHealthStats[client.id].totalAllies || 0}</span>
                      </div>
                    </>
                  )}
                  <div className="of-client-details">
                    <div className="of-detail-row">
                      <span className="of-detail-label">Account Manager:</span>
                      <div className="of-detail-value-group">
                        <span className="of-detail-value-bold">
                          {client.account_manager?.full_name || client.account_manager?.email || 'Unknown'}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditManagerClient(client);
                            setNewManagerId(client.created_by);
                            loadAllUsers();
                          }}
                          className="of-edit-manager-btn"
                          title="Change account manager"
                        >
                          <Edit2 className="of-icon-xs" />
                        </button>
                      </div>
                    </div>
                    <div className="of-detail-row">
                      <span className="of-detail-label-light">Created:</span>
                      <span className="of-detail-value">{new Date(client.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="of-detail-row">
                      <span className="of-detail-label-light">Last Updated:</span>
                      <span className="of-detail-value-medium">{new Date(client.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {showAddModal && (
        <div className="of-modal-overlay">
          <div className="of-modal">
            <h3 className="of-modal-title">Add New Client</h3>
            <form onSubmit={handleAddClient}>
              <div className="of-form-group">
                <label htmlFor="clientName" className="of-form-label">
                  Client Name
                </label>
                <input
                  id="clientName"
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="of-form-input"
                  placeholder="e.g., TechCorp"
                  autoFocus
                  required
                />
              </div>
              <div className="of-modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setNewClientName('');
                  }}
                  className="of-btn of-btn-cancel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="of-btn of-btn-primary"
                >
                  Add Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="of-modal-overlay">
          <div className="of-modal">
            <h3 className="of-modal-title">Delete Client</h3>
            <p className="of-modal-text">
              Are you sure you want to delete this client? This will permanently delete all
              employees and organizational data associated with this client. This action cannot be
              undone.
            </p>
            <div className="of-modal-actions">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="of-btn of-btn-cancel"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteClient(deleteConfirmId)}
                className="of-btn of-btn-danger"
              >
                Delete Client
              </button>
            </div>
          </div>
        </div>
      )}

      {assignmentClient && (
        <ClientAssignment
          client={assignmentClient}
          onClose={() => {
            setAssignmentClient(null);
            loadClients();
          }}
        />
      )}

      {editManagerClient && (
        <div className="of-modal-overlay">
          <div className="of-modal">
            <h3 className="of-modal-title">Change Account Manager</h3>
            <p className="of-modal-text">
              Client: <span className="of-text-bold">{editManagerClient.name}</span>
            </p>
            <div className="of-form-group">
              <label className="of-form-label">
                New Account Manager
              </label>
              <select
                value={newManagerId}
                onChange={(e) => setNewManagerId(e.target.value)}
                className="of-form-select"
              >
                <option value="">Select a user...</option>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email} {u.full_name && `(${u.email})`}
                  </option>
                ))}
              </select>
            </div>
            <div className="of-modal-actions">
              <button
                onClick={() => {
                  setEditManagerClient(null);
                  setNewManagerId('');
                }}
                className="of-btn of-btn-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateManager}
                disabled={!newManagerId}
                className="of-btn of-btn-primary"
              >
                Update Manager
              </button>
            </div>
          </div>
        </div>
      )}

      {logoUploadClient && (
        <div className="of-modal-overlay">
          <div className="of-modal">
            <h3 className="of-modal-title">Upload Client Logo</h3>
            <p className="of-modal-text">
              Client: <span className="of-text-bold">{logoUploadClient.name}</span>
            </p>
            <div className="of-form-group">
              <label className="of-form-label">
                Select Logo Image
              </label>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 5 * 1024 * 1024) {
                      setError('File size must be less than 5MB');
                      e.target.value = '';
                      return;
                    }
                    setLogoFile(file);
                    setError('');
                  }
                }}
                className="of-hidden"
              />
              <div
                onClick={() => logoInputRef.current?.click()}
                className="of-upload-dropzone"
              >
                {logoFile ? (
                  <div>
                    <Image className="of-upload-icon of-upload-icon-active" />
                    <p className="of-upload-filename">{logoFile.name}</p>
                    <p className="of-upload-filesize">
                      {(logoFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div>
                    <Upload className="of-upload-icon" />
                    <p className="of-upload-placeholder">Click to select image</p>
                    <p className="of-upload-hint">
                      JPG, PNG, GIF, WebP, or SVG (max 5MB)
                    </p>
                  </div>
                )}
              </div>
              {logoFile && (
                <div className="of-logo-preview">
                  <p className="of-preview-label">Preview:</p>
                  <div className="of-preview-image-wrapper">
                    <img
                      src={URL.createObjectURL(logoFile)}
                      alt="Logo preview"
                      className="of-preview-image"
                    />
                  </div>
                </div>
              )}
              {logoUploadClient.logo_url && (
                <button
                  onClick={handleRemoveLogo}
                  disabled={uploadingLogo}
                  className="of-btn of-btn-remove-logo"
                >
                  Remove Current Logo
                </button>
              )}
            </div>
            <div className="of-modal-actions">
              <button
                onClick={() => {
                  setLogoUploadClient(null);
                  setLogoFile(null);
                }}
                disabled={uploadingLogo}
                className="of-btn of-btn-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleLogoUpload}
                disabled={!logoFile || uploadingLogo}
                className="of-btn of-btn-primary"
              >
                {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Healthy Managers Modal */}
      {healthModal && (
        <div className="of-modal-overlay" onClick={() => setHealthModal(null)}>
          <div className="of-modal of-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="of-modal-header-row">
              <h3 className="of-modal-title">
                {healthModal.clientName} — Healthy Managers ({healthModal.healthyManagers}/{healthModal.totalManagers})
              </h3>
              <button className="of-btn-close" onClick={() => setHealthModal(null)}>&times;</button>
            </div>
            <div className="of-health-modal-body">
              <table className="of-health-modal-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Apt Contractors</th>
                    <th>Apt Perm</th>
                    <th>FTEs</th>
                    <th>Contractors</th>
                    <th>Direct Reports</th>
                  </tr>
                </thead>
                <tbody>
                  {(healthModal.managers || []).map((m, i) => (
                    <tr key={i} className={m.healthy ? 'of-health-row-good' : 'of-health-row-bad'}>
                      <td>
                        <span className={`of-health-dot ${m.healthy ? 'of-health-dot-green' : 'of-health-dot-red'}`} />
                        {m.healthy ? 'Healthy' : 'Needs Placement'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{m.name}</td>
                      <td>{m.role || '—'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: m.activeContractors > 0 ? '#16a34a' : '#991b1b' }}>{m.activeContractors}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: (m.activePerm || 0) > 0 ? '#2563eb' : 'var(--text-light)' }}>{m.activePerm || 0}</td>
                      <td style={{ textAlign: 'center' }}>{m.ftes}</td>
                      <td style={{ textAlign: 'center' }}>{m.contractors}</td>
                      <td style={{ textAlign: 'center' }}>{m.directReports ? 'Yes' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Apt Allies Modal */}
      {alliesModal && (
        <div className="of-modal-overlay" onClick={() => setAlliesModal(null)}>
          <div className="of-modal of-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="of-modal-header-row">
              <h3 className="of-modal-title">
                {alliesModal.clientName} — Apt Allies ({alliesModal.totalAllies || 0})
              </h3>
              <button className="of-btn-close" onClick={() => setAlliesModal(null)}>&times;</button>
            </div>
            <div className="of-health-modal-body">
              {(alliesModal.allies || []).length > 0 ? (
                <table className="of-health-modal-table">
                  <thead>
                    <tr>
                      <th>Client Contact</th>
                      <th>Contact Role</th>
                      <th>Candidate</th>
                      <th>Job Title</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(alliesModal.allies || []).map((a, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{a.contactName || '—'}</td>
                        <td>{a.contactRole || '—'}</td>
                        <td style={{ fontWeight: 600 }}>{a.candidateName || '—'}</td>
                        <td>{a.jobTitle || '—'}</td>
                        <td>
                          <span className={`of-allies-type-badge ${a.type === 'Perm' ? 'of-allies-type-perm' : 'of-allies-type-contractor'}`}>
                            {a.type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>No active placements at this client.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
