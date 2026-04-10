import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { ArrowLeft, Plus, Download, Upload, Save, Search, CreditCard as Edit, Trash2, X, LayoutGrid, FileDown, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import EmployeeNode from './EmployeeNode';
import { getLayoutedElements } from '../lib/layoutUtils';
import * as XLSX from 'xlsx';

const nodeTypes = {
  employee: EmployeeNode,
};

function OrgChartContent({ clientId, onBack }) {
  // TODO: Replace with MSAL auth integration
  const user = { id: 'temp-user-id' };

  const [client, setClient] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState([]);
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
  }, [clientId]);

  useEffect(() => {
    if (employees.length > 0) {
      updateNodesAndEdges();
    }
  }, [employees]);

  const loadClient = async () => {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .maybeSingle();
    setClient(data);
  };

  const loadEmployees = async () => {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('client_id', clientId);

    if (!error && data) {
      setEmployees(data);
    }
  };

  const handleUpdateHeadcount = async (id, field, value) => {
    try {
      const updates = { [field]: value };

      // If updating apt_contractors and health status is not manually overridden, update health status
      if (field === 'num_apt_contractors') {
        const employee = employees.find(emp => emp.id === id);
        if (employee && !employee.health_status_override) {
          const getAutoHealthStatus = (aptContractors) => {
            if (aptContractors >= 3) return 'healthy';
            if (aptContractors >= 1) return 'needs_attention';
            return 'unhealthy';
          };
          updates.health_status = getAutoHealthStatus(value);
        }
      }

      await supabase
        .from('employees')
        .update(updates)
        .eq('id', id);

      setEmployees(prev =>
        prev.map(emp =>
          emp.id === id ? { ...emp, ...updates } : emp
        )
      );
    } catch (error) {
      console.error('Error updating headcount:', error);
    }
  };

  const handleUpdateHealthStatus = async (id, status) => {
    try {
      // Mark as manually overridden
      await supabase
        .from('employees')
        .update({ health_status: status, health_status_override: true })
        .eq('id', id);

      setEmployees(prev =>
        prev.map(emp =>
          emp.id === id ? { ...emp, health_status: status, health_status_override: true } : emp
        )
      );
    } catch (error) {
      console.error('Error updating health status:', error);
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

    const getAutoHealthStatus = (aptContractors) => {
      if (aptContractors >= 3) return 'healthy';
      if (aptContractors >= 1) return 'needs_attention';
      return 'unhealthy';
    };

    const newNodes = employees.map((emp) => {
      const directReportsCount = directReportsMap.get(emp.id) || 0;
      const fteValue = emp.num_ftes !== null && emp.num_ftes !== undefined
        ? emp.num_ftes
        : directReportsCount;

      // Calculate health status: use manual override if set, otherwise auto-calculate
      const healthStatus = emp.health_status_override
        ? emp.health_status
        : getAutoHealthStatus(emp.num_apt_contractors || 0);

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
          healthStatus: healthStatus,
          healthStatusOverride: emp.health_status_override || false,
          onEdit: () => handleSelectEmployee(emp),
          onUpdateHeadcount: handleUpdateHeadcount,
          onUpdateHealthStatus: handleUpdateHealthStatus,
          depth: depthMap.get(emp.id) || 0,
          directReportsCount: directReportsCount,
        },
      };
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

    if (hasUnpositionedNodes && newNodes.length > 0) {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        newNodes,
        newEdges
      );
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);

      setTimeout(async () => {
        for (const node of layoutedNodes) {
          const emp = employees.find((e) => e.id === node.id);
          if (emp && (emp.position_x === null || emp.position_x === 0)) {
            await supabase
              .from('employees')
              .update({
                position_x: node.position.x,
                position_y: node.position.y,
              })
              .eq('id', node.id);
          }
        }
      }, 100);
    } else {
      const { edges: styledEdges } = getLayoutedElements(newNodes, newEdges);
      setNodes(newNodes);
      setEdges(styledEdges);
    }
  }, [employees]);

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
        await supabase
          .from('employees')
          .update({
            name: editForm.name,
            role: editForm.role,
            department: editForm.department,
            email: editForm.email,
            phone: editForm.phone,
            reports_to_id: editForm.reports_to_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', selectedEmployee.id);
      } else {
        await supabase.from('employees').insert([
          {
            client_id: clientId,
            name: editForm.name,
            role: editForm.role,
            department: editForm.department,
            email: editForm.email,
            phone: editForm.phone,
            reports_to_id: editForm.reports_to_id || null,
          },
        ]);
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
      // Find all employees who report to this employee
      const directReports = employees.filter(emp => emp.reports_to_id === selectedEmployee.id);

      // Reassign them to the deleted employee's manager (or null if at top level)
      if (directReports.length > 0) {
        await supabase
          .from('employees')
          .update({ reports_to_id: selectedEmployee.reports_to_id })
          .in('id', directReports.map(emp => emp.id));
      }

      // Delete the employee
      await supabase.from('employees').delete().eq('id', selectedEmployee.id);

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

      // For each employee being deleted, reassign their direct reports
      for (const node of selectedNodes) {
        const employee = employees.find(emp => emp.id === node.id);
        if (!employee) continue;

        const directReports = employees.filter(emp => emp.reports_to_id === employee.id);

        if (directReports.length > 0) {
          await supabase
            .from('employees')
            .update({ reports_to_id: employee.reports_to_id })
            .in('id', directReports.map(emp => emp.id));
        }
      }

      // Delete all selected employees
      await supabase
        .from('employees')
        .delete()
        .in('id', selectedIds);

      setSelectedNodes([]);
      loadEmployees();
    } catch (error) {
      console.error('Error deleting employees:', error);
      alert('Failed to delete employees. Please try again.');
    }
  };

  const handleSelectionChange = useCallback((params) => {
    setSelectedNodes(params.nodes);
  }, []);

  const handleAutoLayout = () => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);

    setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 0);
  };

  const handleSavePositions = async () => {
    setSaving(true);
    try {
      const updates = nodes.map((node) => ({
        id: node.id,
        position_x: node.position.x,
        position_y: node.position.y,
      }));

      for (const update of updates) {
        await supabase
          .from('employees')
          .update({
            position_x: update.position_x,
            position_y: update.position_y,
          })
          .eq('id', update.id);
      }
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
      await supabase
        .from('employees')
        .update({ position_x: 0, position_y: 0 })
        .eq('client_id', clientId);

      await loadEmployees();

      setTimeout(() => {
        fitView({ padding: 0.2 });
      }, 100);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadTemplate = () => {
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

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, `${client?.name || 'orgchart'}_template.xlsx`);
  };

  const handleExportExcel = () => {
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

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, `${client?.name || 'orgchart'}_employees.xlsx`);
  };

  const handleImportExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log('No file selected');
      return;
    }

    console.log('File selected:', file.name, 'Size:', file.size);
    const reader = new FileReader();
    reader.onload = async (event) => {
      console.log('FileReader onload triggered');
      try {
        const data = new Uint8Array(event.target?.result);
        console.log('Data read, length:', data.length);
        const workbook = XLSX.read(data, { type: 'array' });
        console.log('Workbook parsed, sheets:', workbook.SheetNames);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

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

        console.log('Raw columns from Excel:', Object.keys(jsonData[0] || {}));
        console.log('First 3 raw rows:', jsonData.slice(0, 3));

        console.log('Starting Excel import...');
        console.log('Raw data rows:', jsonData.length);
        console.log('First row sample:', jsonData[0]);

        // Validate required columns exist - need at least Name OR Email
        const firstRow = normalizedData[0];
        const hasName = firstRow.Name !== undefined;
        const hasEmail = firstRow.Email !== undefined;

        console.log('Normalized first row:', firstRow);
        console.log('Has Name column:', hasName, 'Has Email column:', hasEmail);

        if (!hasName && !hasEmail) {
          const columns = Object.keys(jsonData[0] || {}).join(', ');
          alert(`Invalid file format.\n\nRequired: At least one of Name or Email columns\nFound columns: ${columns}\n\nPlease download the template and use it as a guide.`);
          return;
        }

        // Get existing employees for this client to handle updates
        const { data: existingEmployees } = await supabase
          .from('employees')
          .select('id, email, name')
          .eq('client_id', clientId);

        const existingEmailMap = new Map(
          existingEmployees?.map(e => [e.email.toLowerCase().trim(), e.id]) || []
        );

        const existingNameMap = new Map(
          existingEmployees?.map(e => [e.name.toLowerCase().trim(), e.id]) || []
        );

        const skippedRows = [];
        const warnings = [];
        const validRows = [];

        // Validate and prepare data
        normalizedData.forEach((row, index) => {
          const rowNumber = index + 2;

          // Skip rows with missing both name AND email
          const hasRowName = row.Name && row.Name.trim();
          const hasRowEmail = row.Email && row.Email.trim();

          if (!hasRowName && !hasRowEmail) {
            skippedRows.push(`Row ${rowNumber}: Missing both Name and Email`);
            return;
          }

          validRows.push({
            ...row,
            rowNumber,
          });
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

          // Try to find existing employee by email first, then by name
          let existingId = email ? existingEmailMap.get(email.toLowerCase()) : null;
          if (!existingId && name) {
            existingId = existingNameMap.get(name.toLowerCase());
          }

          const employeeData = {
            client_id: clientId,
            name: name,
            role: row.Role?.trim() || '',
            department: row.Department?.trim() || '',
            email: email,
            phone: row.Phone?.trim() || '',
            position_x: 0,
            position_y: 0,
            num_contractors: parseInt(row.Contractors) || 0,
            num_apt_contractors: parseInt(row.AptContractors) || 0,
          };

          if (existingId) {
            employeesToUpdate.push({
              ...employeeData,
              id: existingId,
            });
          } else {
            employeesToInsert.push(employeeData);
          }
        });

        let processedCount = 0;

        // Update existing employees
        for (const emp of employeesToUpdate) {
          const { error } = await supabase
            .from('employees')
            .update({
              name: emp.name,
              email: emp.email,
              role: emp.role,
              department: emp.department,
              phone: emp.phone,
              num_contractors: emp.num_contractors,
              num_apt_contractors: emp.num_apt_contractors,
            })
            .eq('id', emp.id);

          if (!error) processedCount++;
        }

        // Insert new employees
        const { data: insertedEmployees, error: insertError } = await supabase
          .from('employees')
          .insert(employeesToInsert)
          .select();

        if (insertError) throw insertError;
        processedCount += insertedEmployees?.length || 0;

        // Re-fetch all employees to get the most current data after updates and inserts
        const { data: allEmployees, error: fetchError } = await supabase
          .from('employees')
          .select('*')
          .eq('client_id', clientId);

        if (fetchError) throw fetchError;

        // Create mapping from email and name to actual database ID
        const emailToDbId = new Map();
        const nameToDbId = new Map();

        allEmployees?.forEach((emp) => {
          if (emp.email && emp.email.trim()) {
            emailToDbId.set(emp.email.trim().toLowerCase(), emp.id);
          }
          if (emp.name && emp.name.trim()) {
            nameToDbId.set(emp.name.trim().toLowerCase(), emp.id);
          }
        });

        console.log('Email to ID map:', Object.fromEntries(emailToDbId));
        console.log('Name to ID map:', Object.fromEntries(nameToDbId));

        // Second pass: Update reports_to_id based on ReportsToEmail (or name)
        console.log('Starting second pass for reporting relationships...');
        console.log('Valid rows count:', validRows.length);
        console.log('First 3 valid rows:', JSON.stringify(validRows.slice(0, 3), null, 2));
        let relationshipsUpdated = 0;

        for (let i = 0; i < validRows.length; i++) {
          const row = validRows[i];
          const reportsToField = row.ReportsToEmail || row.reportToEmail || row.ReportsTo || '';

          if (reportsToField && reportsToField.trim()) {
            const reportsToValue = reportsToField.trim();
            const reportsToLower = reportsToValue.toLowerCase();

            // Find current employee by email or name
            const employeeEmail = row.Email?.trim().toLowerCase() || '';
            const employeeName = row.Name?.trim().toLowerCase() || '';

            console.log(`Processing row ${row.rowNumber}: ${row.Name} reports to ${reportsToValue}`);
            console.log(`  Employee email: "${employeeEmail}", name: "${employeeName}"`);

            let employeeId = employeeEmail ? emailToDbId.get(employeeEmail) : null;
            if (!employeeId && employeeName) {
              employeeId = nameToDbId.get(employeeName);
            }

            if (!employeeId) {
              const msg = `Row ${row.rowNumber}: Could not find employee "${row.Name}" in database`;
              console.warn(msg);
              warnings.push(msg);
              continue;
            }

            console.log(`  Found employee ID: ${employeeId}`);

            // Try to find manager by email first, then by name
            // Check if reportsToValue looks like an email (contains @)
            let managerId = null;

            if (reportsToValue.includes('@')) {
              // Likely an email
              managerId = emailToDbId.get(reportsToLower);
              console.log(`  Looking up manager by email "${reportsToLower}": ${managerId}`);
            } else {
              // Likely a name, try name first
              managerId = nameToDbId.get(reportsToLower);
              console.log(`  Looking up manager by name "${reportsToLower}": ${managerId}`);
              // If not found by name, try email as fallback
              if (!managerId) {
                managerId = emailToDbId.get(reportsToLower);
                console.log(`  Fallback to email lookup: ${managerId}`);
              }
            }

            if (!managerId) {
              const msg = `Row ${row.rowNumber}: Manager "${reportsToValue}" not found in import data`;
              console.warn(msg);
              warnings.push(msg);
              continue;
            }

            console.log(`  Found manager ID: ${managerId}`);

            if (employeeId && managerId && employeeId !== managerId) {
              const { error: updateError } = await supabase
                .from('employees')
                .update({ reports_to_id: managerId })
                .eq('id', employeeId);

              if (updateError) {
                console.error(`  Error updating relationship: ${updateError.message}`);
              } else {
                console.log(`  Updated: ${row.Name} now reports to ${reportsToValue}`);
                relationshipsUpdated++;
              }
            }
          }
        }

        console.log(`Updated ${relationshipsUpdated} reporting relationships`);

        loadEmployees();

        let message = `Successfully imported ${processedCount} employee(s)`;
        if (relationshipsUpdated > 0) {
          message += `\nUpdated ${relationshipsUpdated} reporting relationship(s)`;
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
        <div className="of-header-inner">
          <div className="of-header-top-row">
            <div className="of-header-left">
              <button
                onClick={onBack}
                className="of-btn-back"
              >
                <ArrowLeft className="of-icon-sm" />
              </button>
              <div>
                <h1 className="of-header-title">{client?.name}</h1>
                <p className="of-header-subtitle">Organization Chart</p>
              </div>
            </div>
            <div className="of-header-actions">
              <button
                onClick={handleAddEmployee}
                className="of-btn-primary"
              >
                <Plus className="of-icon-xs" />
                <span>Add Employee</span>
              </button>
              <button
                onClick={handleAutoLayout}
                className="of-btn-secondary"
              >
                <LayoutGrid className="of-icon-xs" />
                <span>Auto Layout</span>
              </button>
              <button
                onClick={handleResetLayout}
                disabled={saving}
                className="of-btn-warning"
              >
                <RotateCcw className="of-icon-xs" />
                <span>Reset Layout</span>
              </button>
              <button
                onClick={handleSavePositions}
                disabled={saving}
                className="of-btn-success"
              >
                <Save className="of-icon-xs" />
                <span>{saving ? 'Saving...' : 'Save Layout'}</span>
              </button>
              {selectedNodes.length > 0 && (
                <button
                  onClick={handleDeleteSelectedNodes}
                  className="of-btn-danger"
                >
                  <Trash2 className="of-icon-xs" />
                  <span>Delete Selected ({selectedNodes.length})</span>
                </button>
              )}
            </div>
          </div>

          <div className="of-header-bottom-row">
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
              <button
                onClick={handleSearch}
                className="of-btn-search"
              >
                Search
              </button>
            </div>

            <div className="of-import-export-group">
              <button
                onClick={handleDownloadTemplate}
                className="of-btn-template"
              >
                <FileDown className="of-icon-xs" />
                <span>Download Template</span>
              </button>
              <label htmlFor="excel-import-input" className="of-btn-import">
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
              <button
                onClick={handleExportExcel}
                className="of-btn-export"
              >
                <Download className="of-icon-xs" />
                <span>Export</span>
              </button>
            </div>
          </div>
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
