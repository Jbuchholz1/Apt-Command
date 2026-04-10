import { useState, useEffect, useRef } from 'react';
import { Plus, Building2, FolderOpen, Trash2, Users, User as UserIcon, Settings, CreditCard as Edit2, FileDown, Upload, Search, Image } from 'lucide-react';
import { useMsal } from '@azure/msal-react';
import { supabase } from '../lib/supabase';
import ClientAssignment from './ClientAssignment';
import * as XLSX from 'xlsx';
import { getClientHealthStats } from '../../../lib/api';

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
  const [logoUploadClient, setLogoUploadClient] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [clientHealthStats, setClientHealthStats] = useState({});
  const [healthModal, setHealthModal] = useState(null);

  // Resolve MSAL email to Supabase user_profiles ID on mount
  useEffect(() => {
    if (currentUserEmail) {
      supabase
        .from('user_profiles')
        .select('id')
        .ilike('email', currentUserEmail)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setCurrentUserId(data.id);
        });
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
      let query = supabase
        .from('clients')
        .select('*, account_manager:user_profiles!created_by(email, full_name)');

      if (viewMode === 'my' && currentUserId) {
        const { data: assignments } = await supabase
          .from('client_assignments')
          .select('client_id')
          .eq('user_id', currentUserId);

        const assignedClientIds = assignments?.map(a => a.client_id) || [];

        if (assignedClientIds.length > 0) {
          query = query.or(`created_by.eq.${currentUserId},id.in.(${assignedClientIds.join(',')})`);
        } else {
          query = query.eq('created_by', currentUserId);
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setClients(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAllUsers = async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('is_active', true)
      .order('full_name', { nullsFirst: false });
    setAllUsers(data || []);
  };

  const handleUpdateManager = async () => {
    if (!editManagerClient || !newManagerId) return;

    try {
      const { error } = await supabase
        .from('clients')
        .update({ created_by: newManagerId })
        .eq('id', editManagerClient.id);

      if (error) throw error;

      setEditManagerClient(null);
      setNewManagerId('');
      loadClients();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogoUpload = async () => {
    if (!logoUploadClient || !logoFile) return;

    setUploadingLogo(true);
    try {
      if (logoUploadClient.logo_url) {
        const oldPath = logoUploadClient.logo_url.split('/').pop();
        if (oldPath) {
          await supabase.storage
            .from('client-logos')
            .remove([`${logoUploadClient.id}/${oldPath}`]);
        }
      }

      const fileExt = logoFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${logoUploadClient.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('client-logos')
        .upload(filePath, logoFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('client-logos')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('clients')
        .update({ logo_url: publicUrl })
        .eq('id', logoUploadClient.id);

      if (updateError) throw updateError;

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
      if (logoUploadClient.logo_url) {
        const oldPath = logoUploadClient.logo_url.split('/').pop();
        if (oldPath) {
          await supabase.storage
            .from('client-logos')
            .remove([`${logoUploadClient.id}/${oldPath}`]);
        }
      }

      const { error } = await supabase
        .from('clients')
        .update({ logo_url: null })
        .eq('id', logoUploadClient.id);

      if (error) throw error;

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
      const { error } = await supabase
        .from('clients')
        .insert([{ name: newClientName, created_by: currentUserId }]);

      if (error) throw error;

      setNewClientName('');
      setShowAddModal(false);
      loadClients();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteClient = async (clientId) => {
    try {
      const { error } = await supabase.from('clients').delete().eq('id', clientId);

      if (error) throw error;

      setDeleteConfirmId(null);
      loadClients();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDownloadClientTemplate = () => {
    const templateData = [
      { ClientName: 'Acme Corporation', AccountManager: 'John Smith', AccountManagerEmail: 'john@example.com' },
      { ClientName: 'TechStart Inc', AccountManager: 'Jane Doe', AccountManagerEmail: 'jane@example.com' },
      { ClientName: 'Global Solutions Ltd', AccountManager: 'John Smith', AccountManagerEmail: 'john@example.com' },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clients');
    XLSX.writeFile(wb, 'clients_template.xlsx');
  };

  const handleImportClients = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (!jsonData || jsonData.length === 0) {
          setError('The file is empty or has no valid data.');
          return;
        }

        const { data: allUsers, error: usersError } = await supabase
          .from('user_profiles')
          .select('id, email')
          .eq('is_active', true);

        if (usersError) throw usersError;

        const emailToIdMap = new Map(allUsers?.map(u => [u.email.toLowerCase(), u.id]) || []);

        const { data: existingClients } = await supabase
          .from('clients')
          .select('id, name');

        const existingClientMap = new Map(
          existingClients?.map(c => [c.name.toLowerCase().trim(), c.id]) || []
        );

        const clientsToInsert = [];
        const clientsToUpdate = [];
        const skippedRows = [];
        const warnings = [];

        jsonData.forEach((row, index) => {
          const rowNumber = index + 2;

          if (!row.ClientName || !row.ClientName.trim()) {
            skippedRows.push(`Row ${rowNumber}: Missing ClientName`);
            return;
          }

          const clientName = row.ClientName.trim();
          const accountManager = row.AccountManager?.trim() || '';
          let managerId;

          const managerEmailField = row.AccountManagerEmail || row.reportToEmail || row.ReportToEmail || '';

          if (managerEmailField && managerEmailField.trim()) {
            const email = managerEmailField.trim().toLowerCase();
            const userId = emailToIdMap.get(email);

            if (!userId) {
              warnings.push(`Row ${rowNumber}: Email "${managerEmailField}" not found, using current user`);
              managerId = currentUserId;
            } else {
              managerId = userId;
            }
          } else {
            managerId = currentUserId;
          }

          const existingClientId = existingClientMap.get(clientName.toLowerCase());

          if (existingClientId) {
            clientsToUpdate.push({
              id: existingClientId,
              name: clientName,
              created_by: managerId,
              account_manager: accountManager,
            });
          } else {
            clientsToInsert.push({
              name: clientName,
              created_by: managerId,
              account_manager: accountManager,
            });
          }
        });

        if (clientsToInsert.length === 0 && clientsToUpdate.length === 0) {
          setError('No valid clients to import. Please check your file format.');
          return;
        }

        if (clientsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('clients')
            .insert(clientsToInsert);

          if (insertError) throw insertError;
        }

        for (const client of clientsToUpdate) {
          const { error: updateError } = await supabase
            .from('clients')
            .update({ name: client.name, created_by: client.created_by, account_manager: client.account_manager })
            .eq('id', client.id);

          if (updateError) {
            console.error(`Failed to update client ${client.name}:`, updateError);
          }
        }

        loadClients();
        setError('');

        let message = `Successfully imported ${clientsToInsert.length} new client(s)`;
        if (clientsToUpdate.length > 0) {
          message += ` and updated ${clientsToUpdate.length} existing client(s)`;
        }
        if (skippedRows.length > 0) {
          message += `\n\nSkipped ${skippedRows.length} row(s):\n${skippedRows.slice(0, 5).join('\n')}`;
          if (skippedRows.length > 5) {
            message += `\n... and ${skippedRows.length - 5} more`;
          }
        }
        if (warnings.length > 0) {
          message += `\n\nWarnings:\n${warnings.slice(0, 3).join('\n')}`;
          if (warnings.length > 3) {
            message += `\n... and ${warnings.length - 3} more`;
          }
        }

        alert(message);
      } catch (err) {
        console.error('Error importing clients:', err);
        setError('Error importing file. Please check the format.');
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isMyClient = (client) => client.created_by === currentUserId;

  const filteredAndSortedClients = clients
    .filter((client) => {
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
                <button
                  onClick={() => onSelectClient(client.id)}
                  className="of-card-body"
                >
                  <div className="of-card-header">
                    {client.logo_url ? (
                      <div className="of-client-logo-wrapper">
                        <img
                          src={client.logo_url}
                          alt={`${client.name} logo`}
                          className="of-client-logo-img"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement.innerHTML = '<div class="of-client-icon-fallback"><svg class="of-client-icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg></div>';
                          }}
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
                    <th>Active Contractors</th>
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
    </div>
  );
}
