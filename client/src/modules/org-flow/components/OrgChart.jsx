import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { ArrowLeft, Plus, Download, Upload, Save, Search, CreditCard as Edit, Trash2, X, LayoutGrid, FileDown, RotateCcw } from 'lucide-react';
import EmployeeNode from './EmployeeNode';
import { getLayoutedElements } from '../lib/layoutUtils';
import { readExcelToJson, writeExcelFile } from '../../../lib/excel';
import {
  getContractorCounts, getOrgFlowClient, getClientEmployees,
  updateEmployee as apiUpdateEmployee, createEmployee, deleteOrgFlowEmployee,
  bulkDeleteEmployees, saveEmployeePositions, resetEmployeePositions, importEmployees,
} from '../../../lib/api';
import { useUserRole } from '../../../lib/UserRoleContext';

const BH_BASE = 'https://cls42.bullhornstaffing.com/BullhornSTAFFING/OpenWindow.cfm';
const ALLY_NODE_WIDTH = 220;
const ALLY_HORIZONTAL_GAP = 120;

const AptAllyNode = memo(({ data }) => {
  const handleBhClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    window.open(`${BH_BASE}?Entity=Candidate&id=${encodeURIComponent(data.candidateId)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`of-ally-node of-ally-node--${data.allyType}`}>
      <Handle type="target" position={Position.Top} className="of-handle" />
      <div className="of-ally-body">
        <div className="of-ally-name">{data.name}</div>
        <div className="of-ally-role">{data.role}</div>
        <div className={`of-ally-badge of-ally-badge--${data.allyType}`}>
          {data.allyType === 'contractor' ? 'Contractor' : 'Perm Placement'}
        </div>
        {data.candidateId && (
          <button
            className="of-ally-bh-link"
            onClick={handleBhClick}
            onMouseDown={(e) => e.stopPropagation()}
            title={`Open candidate ${data.candidateId} in Bullhorn`}
          >
            BH #{data.candidateId}
          </button>
        )}
      </div>
    </div>
  );
});
AptAllyNode.displayName = 'AptAllyNode';

const nodeTypes = {
  employee: EmployeeNode,
  aptAlly: AptAllyNode,
};

function OrgChartContent({ clientId, onBack }) {
  const { isManager } = useUserRole();

  const [client, setClient] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState([]);
  const [liveContractorCounts, setLiveContractorCounts] = useState({});
  const fileInputRef = useRef(null);
  const { fitView, setCenter, getZoom } = useReactFlow();

  const [editForm, setEditForm] = useState({
    name: '',
    role: '',
    department: '',
    email: '',
    phone: '',
    reports_to_id: '',
  });

  useEffect(() => {
    loadClient();
    loadEmployees();
    // Fetch live contractor counts from Bullhorn
    getContractorCounts()
      .then(counts => setLiveContractorCounts(counts || {}))
      .catch(() => {}); // Silently fail — live counts are a nice-to-have
  }, [clientId]);

  useEffect(() => {
    if (employees.length > 0) {
      updateNodesAndEdges();
    }
  }, [employees, liveContractorCounts]);

  const loadClient = async () => {
    const data = await getOrgFlowClient(clientId);
    setClient(data);
  };

  const loadEmployees = async () => {
    try {
      const data = await getClientEmployees(clientId);
      if (data) setEmployees(data);
    } catch (err) {
      console.error('Error loading employees:', err);
    }
  };

  const handleUpdateHeadcount = async (id, field, value) => {
    try {
      const updates = { [field]: value };
      await apiUpdateEmployee(id, updates);
      setEmployees(prev =>
        prev.map(emp =>
          emp.id === id ? { ...emp, ...updates } : emp
        )
      );
    } catch (error) {
      console.error('Error updating headcount:', error);
    }
  };

  const updateNodesAndEdges = useCallback(() => {
    const depthMap = new Map();

    const calculateDepth = (empId, visited = new Set()) => {
      if (depthMap.has(empId)) {
        return depthMap.get(empId);
      }

      if (visited.has(empId)) {
        return 0;
      }
      visited.add(empId);

      const emp = employees.find(e => e.id === empId);
      if (!emp || !emp.reports_to_id) {
        depthMap.set(empId, 0);
        return 0;
      }

      const parentDepth = calculateDepth(emp.reports_to_id, visited);
      const depth = parentDepth + 1;
      depthMap.set(empId, depth);
      return depth;
    };

    employees.forEach(emp => calculateDepth(emp.id));

    // Calculate direct reports for each employee
    const directReportsMap = new Map();
    employees.forEach(emp => {
      if (emp.reports_to_id) {
        const currentCount = directReportsMap.get(emp.reports_to_id) || 0;
        directReportsMap.set(emp.reports_to_id, currentCount + 1);
      }
    });

    const newNodes = employees.map((emp) => {
      const directReportsCount = directReportsMap.get(emp.id) || 0;
      const fteValue = emp.num_ftes !== null && emp.num_ftes !== undefined
        ? emp.num_ftes
        : directReportsCount;

      // Extract counts from new data shape (object with contractors/permPlacements)
      const empCounts = emp.email ? (liveContractorCounts[emp.email.toLowerCase()] || null) : null;
      const liveContractors = empCounts ? empCounts.contractors : 0;
      const livePermPlacements = empCounts ? empCounts.permPlacements : 0;

      return {
        id: emp.id,
        type: 'employee',
        position: { x: emp.position_x || 0, y: emp.position_y || 0 },
        data: {
          id: emp.id,
          name: emp.name,
          role: emp.role,
          department: emp.department,
          email: emp.email,
          phone: emp.phone,
          numFtes: fteValue,
          numContractors: emp.num_contractors || 0,
          numAptContractors: emp.num_apt_contractors || 0,
          liveContractors,
          livePermPlacements,
          onEdit: () => handleSelectEmployee(emp),
          onUpdateHeadcount: handleUpdateHeadcount,
          depth: depthMap.get(emp.id) || 0,
          directReportsCount: directReportsCount,
        },
      };
    });

    // Create virtual Apt Ally nodes (contractors + perm placements) under their managers
    const allyNodes = [];
    const allyEdges = [];
    employees.forEach((emp) => {
      if (!emp.email) return;
      const empCounts = liveContractorCounts[emp.email.toLowerCase()];
      if (!empCounts || !empCounts.placements) return;

      const empPos = { x: emp.position_x || 0, y: emp.position_y || 0 };
      const totalAllies = empCounts.placements.length;

      empCounts.placements.forEach((placement, idx) => {
        const allyId = `ally-${placement.id}`;
        const allyStep = ALLY_NODE_WIDTH + ALLY_HORIZONTAL_GAP;
        const offsetX = (idx - (totalAllies - 1) / 2) * allyStep;
        allyNodes.push({
          id: allyId,
          type: 'aptAlly',
          draggable: false,
          position: { x: empPos.x + offsetX, y: empPos.y + 600 },
          data: {
            name: placement.candidateName,
            role: placement.jobTitle,
            allyType: placement.type,
            candidateId: placement.candidateId,
          },
        });
        allyEdges.push({
          id: `${emp.id}-${allyId}`,
          source: emp.id,
          target: allyId,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#16a34a', strokeWidth: 2, strokeDasharray: '6 3' },
        });
      });
    });

    const newEdges = employees
      .filter((emp) => emp.reports_to_id)
      .map((emp) => {
        const sourceDepth = depthMap.get(emp.reports_to_id) || 0;
        const color = sourceDepth % 2 === 0 ? '#D3BF30' : '#04144F';
        return {
          id: `${emp.reports_to_id}-${emp.id}`,
          source: emp.reports_to_id,
          target: emp.id,
          type: 'smoothstep',
          animated: false,
          style: { stroke: color, strokeWidth: 2 },
        };
      });

    // Check if any nodes have default (0,0) position - indicating they need layout
    const hasUnpositionedNodes = employees.some(
      (emp) => emp.position_x === null || emp.position_x === 0
    );

    // Reposition ally nodes relative to their parent's final position
    const repositionAllies = (finalNodes) => {
      const nodeMap = new Map(finalNodes.map(n => [n.id, n]));
      return allyNodes.map((ally) => {
        // Find the parent edge to get the source employee
        const parentEdge = allyEdges.find(e => e.target === ally.id);
        if (parentEdge) {
          const parentNode = nodeMap.get(parentEdge.source);
          if (parentNode) {
            const parentPlacementData = employees.find(e => e.id === parentEdge.source);
            const email = parentPlacementData?.email?.toLowerCase();
            const empCounts = email ? liveContractorCounts[email] : null;
            const totalAllies = empCounts?.placements?.length || 1;
            const allyIdx = empCounts?.placements?.findIndex(p => `ally-${p.id}` === ally.id) ?? 0;
            const offsetX = (allyIdx - (totalAllies - 1) / 2) * (ALLY_NODE_WIDTH + ALLY_HORIZONTAL_GAP);
            return {
              ...ally,
              position: {
                x: parentNode.position.x + offsetX,
                y: parentNode.position.y + 600,
              },
            };
          }
        }
        return ally;
      });
    };

    if (hasUnpositionedNodes && newNodes.length > 0) {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        newNodes,
        newEdges
      );
      const positionedAllies = repositionAllies(layoutedNodes);
      setNodes([...layoutedNodes, ...positionedAllies]);
      setEdges([...layoutedEdges, ...allyEdges]);

      setTimeout(async () => {
        const posUpdates = layoutedNodes
          .filter(node => {
            const emp = employees.find(e => e.id === node.id);
            return emp && (emp.position_x === null || emp.position_x === 0);
          })
          .map(node => ({
            id: node.id,
            position_x: node.position.x,
            position_y: node.position.y,
          }));
        if (posUpdates.length > 0) {
          await saveEmployeePositions(clientId, posUpdates);
        }
      }, 100);
    } else {
      const { edges: styledEdges } = getLayoutedElements(newNodes, newEdges);
      const positionedAllies = repositionAllies(newNodes);
      setNodes([...newNodes, ...positionedAllies]);
      setEdges([...styledEdges, ...allyEdges]);
    }
  }, [employees, liveContractorCounts]);

  const handleSelectEmployee = (emp) => {
    setSelectedEmployee(emp);
    setEditForm({
      name: emp.name,
      role: emp.role,
      department: emp.department,
      email: emp.email,
      phone: emp.phone,
      reports_to_id: emp.reports_to_id || '',
    });
    setShowEditPanel(true);
  };

  const handleAddEmployee = () => {
    setSelectedEmployee(null);
    setEditForm({
      name: '',
      role: '',
      department: '',
      email: '',
      phone: '',
      reports_to_id: '',
    });
    setShowEditPanel(true);
  };

  const handleSaveEmployee = async () => {
    setSaving(true);
    try {
      if (selectedEmployee) {
        await apiUpdateEmployee(selectedEmployee.id, {
          name: editForm.name,
          role: editForm.role,
          department: editForm.department,
          email: editForm.email,
          phone: editForm.phone,
          reports_to_id: editForm.reports_to_id || null,
          updated_at: new Date().toISOString(),
        });
      } else {
        await createEmployee(clientId, {
          name: editForm.name,
          role: editForm.role,
          department: editForm.department,
          email: editForm.email,
          phone: editForm.phone,
          reports_to_id: editForm.reports_to_id || null,
        });
      }
      setShowEditPanel(false);
      loadEmployees();
    } catch (error) {
      console.error('Error saving employee:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!selectedEmployee) return;
    if (!confirm(`Delete ${selectedEmployee.name}?`)) return;

    try {
      await deleteOrgFlowEmployee(selectedEmployee.id, clientId);
      setShowEditPanel(false);
      loadEmployees();
    } catch (error) {
      console.error('Error deleting employee:', error);
      alert('Failed to delete employee. Please try again.');
    }
  };

  const handleDeleteSelectedNodes = async () => {
    if (selectedNodes.length === 0) return;

    const employeeNames = selectedNodes
      .map(node => node.data.name)
      .join(', ');

    if (!confirm(`Delete ${selectedNodes.length} employee(s)?\n\n${employeeNames}\n\nTheir direct reports will be reassigned to their managers.`)) {
      return;
    }

    try {
      const selectedIds = selectedNodes.map(node => node.id);
      await bulkDeleteEmployees(selectedIds, clientId);
      setSelectedNodes([]);
      loadEmployees();
    } catch (error) {
      console.error('Error deleting employees:', error);
      alert('Failed to delete employees. Please try again.');
    }
  };

  const handleSelectionChange = useCallback((params) => {
    // Only track real employee nodes for selection (not virtual ally nodes)
    setSelectedNodes(params.nodes.filter(n => n.type === 'employee'));
  }, []);

  const handleAutoLayout = () => {
    // Separate employee nodes from ally nodes for layout
    const empNodes = nodes.filter(n => n.type === 'employee');
    const allyNodesInState = nodes.filter(n => n.type === 'aptAlly');
    const empEdges = edges.filter(e => !e.id.includes('ally-'));
    const allyEdgesInState = edges.filter(e => e.id.includes('ally-'));

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(empNodes, empEdges);

    // Reposition ally nodes relative to their newly-layouted parents
    const nodeMap = new Map(layoutedNodes.map(n => [n.id, n]));
    const repositionedAllies = allyNodesInState.map((ally) => {
      const parentEdge = allyEdgesInState.find(e => e.target === ally.id);
      if (parentEdge) {
        const parentNode = nodeMap.get(parentEdge.source);
        if (parentNode) {
          const parentEmp = employees.find(e => e.id === parentEdge.source);
          const email = parentEmp?.email?.toLowerCase();
          const empCounts = email ? liveContractorCounts[email] : null;
          const totalAllies = empCounts?.placements?.length || 1;
          const allyIdx = empCounts?.placements?.findIndex(p => `ally-${p.id}` === ally.id) ?? 0;
          const offsetX = (allyIdx - (totalAllies - 1) / 2) * (ALLY_NODE_WIDTH + ALLY_HORIZONTAL_GAP);
          return { ...ally, position: { x: parentNode.position.x + offsetX, y: parentNode.position.y + 600 } };
        }
      }
      return ally;
    });

    setNodes([...layoutedNodes, ...repositionedAllies]);
    setEdges([...layoutedEdges, ...allyEdgesInState]);

    setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 0);
  };

  const handleSavePositions = async () => {
    setSaving(true);
    try {
      const updates = nodes
        .filter((node) => node.type === 'employee')
        .map((node) => ({
          id: node.id,
          position_x: node.position.x,
          position_y: node.position.y,
        }));
      await saveEmployeePositions(clientId, updates);
    } finally {
      setSaving(false);
    }
  };

  const handleResetLayout = async () => {
    if (!confirm('Reset all positions and recalculate layout? This will override any manual positioning.')) {
      return;
    }

    setSaving(true);
    try {
      await resetEmployeePositions(clientId);
      await loadEmployees();

      setTimeout(() => {
        fitView({ padding: 0.2 });
      }, 100);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadTemplate = async () => {
    let templateData;

    if (employees.length > 0) {
      // Use current employee data
      const emailMap = new Map(employees.map((emp) => [emp.id, emp.email]));
      const nameMap = new Map(employees.map((emp) => [emp.id, emp.name]));

      templateData = employees.map((emp) => {
        let reportsToValue = '';
        if (emp.reports_to_id) {
          // Prefer email if available, otherwise use name
          const managerEmail = emailMap.get(emp.reports_to_id);
          const managerName = nameMap.get(emp.reports_to_id);
          reportsToValue = (managerEmail && managerEmail.trim()) ? managerEmail : (managerName || '');
        }

        return {
          Name: emp.name,
          Role: emp.role,
          Department: emp.department,
          Email: emp.email,
          Phone: emp.phone,
          ReportsToEmail: reportsToValue,
          Contractors: emp.num_contractors || 0,
          AptContractors: emp.num_apt_contractors || 0,
        };
      });
    } else {
      // Use example data if no employees exist
      templateData = [
        {
          Name: 'Jane Smith',
          Role: 'CEO',
          Department: 'Executive',
          Email: 'jane.smith@example.com',
          Phone: '(555) 100-0001',
          ReportsToEmail: '',
          Contractors: 0,
          AptContractors: 0,
        },
        {
          Name: 'John Doe',
          Role: 'VP of Engineering',
          Department: 'Engineering',
          Email: 'john.doe@example.com',
          Phone: '(555) 100-0002',
          ReportsToEmail: 'jane.smith@example.com',
          Contractors: 2,
          AptContractors: 1,
        },
        {
          Name: 'Sarah Johnson',
          Role: 'Senior Engineer',
          Department: 'Engineering',
          Email: 'sarah.johnson@example.com',
          Phone: '(555) 100-0003',
          ReportsToEmail: 'John Doe',
          Contractors: 0,
          AptContractors: 0,
        },
      ];
    }

    await writeExcelFile(templateData, 'Employees', `${client?.name || 'orgchart'}_template.xlsx`);
  };

  const handleExportExcel = async () => {
    const emailMap = new Map(employees.map((emp) => [emp.id, emp.email]));

    const exportData = employees.map((emp) => ({
      Name: emp.name,
      Role: emp.role,
      Department: emp.department,
      Email: emp.email,
      Phone: emp.phone,
      ReportsToEmail: emp.reports_to_id ? emailMap.get(emp.reports_to_id) || '' : '',
      Contractors: emp.num_contractors || 0,
      AptContractors: emp.num_apt_contractors || 0,
    }));

    await writeExcelFile(exportData, 'Employees', `${client?.name || 'orgchart'}_employees.xlsx`);
  };

  const handleImportExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonData = await readExcelToJson(event.target?.result);

        if (!jsonData || jsonData.length === 0) {
          alert('The file is empty or has no valid data.');
          return;
        }

        // Normalize column names to be case-insensitive
        const normalizedData = jsonData.map(row => {
          const normalizedRow = {};
          Object.keys(row).forEach(key => {
            const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '');
            if (normalizedKey === 'name') normalizedRow.Name = row[key];
            else if (normalizedKey === 'role') normalizedRow.Role = row[key];
            else if (normalizedKey === 'department') normalizedRow.Department = row[key];
            else if (normalizedKey === 'email') normalizedRow.Email = row[key] || '';
            else if (normalizedKey === 'phone') normalizedRow.Phone = row[key];
            else if (normalizedKey === 'reportstoemail' || normalizedKey === 'reporttoemail' || normalizedKey === 'reportsto') {
              normalizedRow.ReportsToEmail = row[key];
            }
            else if (normalizedKey === 'contractors') normalizedRow.Contractors = row[key];
            else if (normalizedKey === 'aptcontractors') normalizedRow.AptContractors = row[key];
          });
          return normalizedRow;
        });

        // Validate required columns exist - need at least Name OR Email
        const firstRow = normalizedData[0];
        const hasName = firstRow.Name !== undefined;
        const hasEmail = firstRow.Email !== undefined;

        if (!hasName && !hasEmail) {
          const columns = Object.keys(jsonData[0] || {}).join(', ');
          alert(`Invalid file format.\n\nRequired: At least one of Name or Email columns\nFound columns: ${columns}\n\nPlease download the template and use it as a guide.`);
          return;
        }

        // Get existing employees from server to handle updates
        const existingEmployees = await getClientEmployees(clientId);
        const existingEmailMap = new Map(
          (existingEmployees || []).filter(e => e.email).map(e => [e.email.toLowerCase().trim(), e.id])
        );
        const existingNameMap = new Map(
          (existingEmployees || []).filter(e => e.name).map(e => [e.name.toLowerCase().trim(), e.id])
        );

        const skippedRows = [];
        const validRows = [];

        normalizedData.forEach((row, index) => {
          const rowNumber = index + 2;
          const hasRowName = row.Name && row.Name.trim();
          const hasRowEmail = row.Email && row.Email.trim();

          if (!hasRowName && !hasRowEmail) {
            skippedRows.push(`Row ${rowNumber}: Missing both Name and Email`);
            return;
          }
          validRows.push({ ...row, rowNumber });
        });

        if (validRows.length === 0) {
          alert('No valid employee data found in the file.');
          return;
        }

        // Separate new employees from existing ones
        const employeesToUpdate = [];
        const employeesToInsert = [];

        validRows.forEach((row) => {
          const email = row.Email?.trim() || '';
          const name = row.Name?.trim() || '';

          let existingId = email ? existingEmailMap.get(email.toLowerCase()) : null;
          if (!existingId && name) existingId = existingNameMap.get(name.toLowerCase());

          const employeeData = {
            client_id: clientId,
            name, role: row.Role?.trim() || '', department: row.Department?.trim() || '',
            email, phone: row.Phone?.trim() || '',
            position_x: 0, position_y: 0,
            num_contractors: parseInt(row.Contractors) || 0,
            num_apt_contractors: parseInt(row.AptContractors) || 0,
          };

          if (existingId) {
            employeesToUpdate.push({ ...employeeData, id: existingId });
          } else {
            employeesToInsert.push(employeeData);
          }
        });

        // Send to server — handles inserts, updates, and relationship resolution
        const result = await importEmployees(clientId, employeesToInsert, employeesToUpdate, validRows);

        loadEmployees();

        let message = `Successfully imported ${result.processedCount} employee(s)`;
        if (result.relationshipsUpdated > 0) {
          message += `\nUpdated ${result.relationshipsUpdated} reporting relationship(s)`;
        }
        if (skippedRows.length > 0) {
          message += `\n\nSkipped ${skippedRows.length} row(s):\n${skippedRows.slice(0, 5).join('\n')}`;
          if (skippedRows.length > 5) message += `\n... and ${skippedRows.length - 5} more`;
        }
        const allWarnings = [...(result.warnings || [])];
        if (allWarnings.length > 0) {
          message += `\n\nWarnings:\n${allWarnings.slice(0, 3).join('\n')}`;
          if (allWarnings.length > 3) message += `\n... and ${allWarnings.length - 3} more`;
        }
        alert(message);
      } catch (error) {
        console.error('Error importing Excel:', error);
        alert('Error importing file. Please check the format.');
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSearch = () => {
    if (!searchQuery) return;

    const employee = employees.find((emp) =>
      emp.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (employee) {
      const node = nodes.find((n) => n.id === employee.id);
      if (node) {
        setCenter(node.position.x + 140, node.position.y + 90, {
          zoom: 1.5,
          duration: 800,
        });
      }
    }
  };

  const filteredEmployees = useMemo(() => {
    return employees
      .filter((emp) => emp.id !== selectedEmployee?.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, selectedEmployee]);

  return (
    <div className="of-orgchart-container">
      <header className="of-orgchart-header">
        <div className="of-oc-toolbar">
          <div className="of-oc-toolbar-left">
            <button onClick={onBack} className="of-oc-back-btn">
              <ArrowLeft className="of-icon-sm" />
            </button>
            <h1 className="of-oc-toolbar-title">{client?.name}</h1>
            <span className="of-oc-toolbar-sep">—</span>
            <span className="of-oc-toolbar-subtitle">Organization Chart</span>
          </div>
          <div className="of-oc-toolbar-actions">
            <button onClick={handleAddEmployee} className="of-btn of-btn-import">
              <Plus className="of-icon-xs" />
              <span>Add Employee</span>
            </button>
            <button onClick={handleAutoLayout} className="of-btn of-btn-dark">
              <LayoutGrid className="of-icon-xs" />
              <span>Auto Layout</span>
            </button>
            <button onClick={handleResetLayout} disabled={saving} className="of-btn of-btn-orange">
              <RotateCcw className="of-icon-xs" />
              <span>Reset Layout</span>
            </button>
            <button onClick={handleSavePositions} disabled={saving} className="of-btn of-btn-success">
              <Save className="of-icon-xs" />
              <span>{saving ? 'Saving...' : 'Save Layout'}</span>
            </button>
            {selectedNodes.length > 0 && (
              <button onClick={handleDeleteSelectedNodes} className="of-btn of-btn-danger">
                <Trash2 className="of-icon-xs" />
                <span>Delete Selected ({selectedNodes.length})</span>
              </button>
            )}
          </div>
        </div>
        <div className="of-oc-toolbar-row2">
          <div className="of-search-group">
            <div className="of-search-input-wrapper">
              <Search className="of-search-icon" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search employee by name..."
                className="of-search-input"
              />
            </div>
            <button onClick={handleSearch} className="of-btn of-btn-primary">
              Search
            </button>
          </div>
          {isManager && (
            <div className="of-import-export-group">
              <button onClick={handleDownloadTemplate} className="of-btn of-btn-success">
                <FileDown className="of-icon-xs" />
                <span>Download Template</span>
              </button>
              <label htmlFor="excel-import-input" className="of-btn of-btn-blue">
                <Upload className="of-icon-xs" />
                <span>Import</span>
              </label>
              <input
                id="excel-import-input"
                name="excel-import"
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportExcel}
                className="of-hidden"
              />
              <button onClick={handleExportExcel} className="of-btn of-btn-orange">
                <Download className="of-icon-xs" />
                <span>Export</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="of-flow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onSelectionChange={handleSelectionChange}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          maxZoom={2}
          selectionOnDrag
          panOnDrag={[1, 2]}
          selectionMode="partial"
        >
          <Background color="#D3BF30" gap={16} />
          <Controls className="of-flow-controls" />
        </ReactFlow>

        {showEditPanel && (
          <div className="of-edit-panel">
            <div className="of-edit-panel-inner">
              <div className="of-edit-panel-header">
                <h2 className="of-edit-panel-title">
                  {selectedEmployee ? 'Edit Employee' : 'Add Employee'}
                </h2>
                <button
                  onClick={() => setShowEditPanel(false)}
                  className="of-btn-close"
                >
                  <X className="of-icon-sm" />
                </button>
              </div>

              <div className="of-edit-form">
                <div className="of-form-field">
                  <label className="of-form-label">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="of-form-input"
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div className="of-form-field">
                  <label className="of-form-label">Role</label>
                  <input
                    type="text"
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    className="of-form-input"
                    placeholder="Senior Manager"
                  />
                </div>

                <div className="of-form-field">
                  <label className="of-form-label">
                    Department
                  </label>
                  <input
                    type="text"
                    value={editForm.department}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                    className="of-form-input"
                    placeholder="Engineering"
                  />
                </div>

                <div className="of-form-field">
                  <label className="of-form-label">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="of-form-input"
                    placeholder="john@example.com"
                  />
                </div>

                <div className="of-form-field">
                  <label className="of-form-label">Phone</label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="of-form-input"
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div className="of-form-field">
                  <label className="of-form-label">
                    Reports To
                  </label>
                  <select
                    value={editForm.reports_to_id}
                    onChange={(e) =>
                      setEditForm({ ...editForm, reports_to_id: e.target.value })
                    }
                    className="of-form-select"
                  >
                    <option value="">None (Top Level)</option>
                    {filteredEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} {emp.role ? `- ${emp.role}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="of-edit-panel-actions">
                <button
                  onClick={handleSaveEmployee}
                  disabled={!editForm.name.trim() || saving}
                  className="of-btn-save-employee"
                >
                  {saving ? 'Saving...' : selectedEmployee ? 'Update Employee' : 'Add Employee'}
                </button>

                {selectedEmployee && (
                  <button
                    onClick={handleDeleteEmployee}
                    className="of-btn-delete-employee"
                  >
                    <Trash2 className="of-icon-xs" />
                    <span>Delete Employee</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrgChart(props) {
  return (
    <ReactFlowProvider>
      <OrgChartContent {...props} />
    </ReactFlowProvider>
  );
}
