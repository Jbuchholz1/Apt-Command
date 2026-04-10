import { memo, useState } from 'react';
import { Handle, Position } from 'reactflow';
import { User, Mail, Phone, Plus, Minus, Settings } from 'lucide-react';

function EmployeeNode({ data, selected }) {
  const [localFtes, setLocalFtes] = useState(data.numFtes);
  const [localContractors, setLocalContractors] = useState(data.numContractors);
  const [localAptContractors, setLocalAptContractors] = useState(data.numAptContractors);

  const handleIncrement = async (field) => {
    if (field === 'ftes') {
      const newValue = localFtes + 1;
      setLocalFtes(newValue);
      await data.onUpdateHeadcount(data.id, 'num_ftes', newValue);
    } else if (field === 'contractors') {
      const newValue = localContractors + 1;
      setLocalContractors(newValue);
      await data.onUpdateHeadcount(data.id, 'num_contractors', newValue);
    } else if (field === 'apt_contractors') {
      const newValue = localAptContractors + 1;
      setLocalAptContractors(newValue);
      await data.onUpdateHeadcount(data.id, 'num_apt_contractors', newValue);
    }
  };

  const handleDecrement = async (field) => {
    if (field === 'ftes') {
      const newValue = Math.max(0, localFtes - 1);
      setLocalFtes(newValue);
      await data.onUpdateHeadcount(data.id, 'num_ftes', newValue);
    } else if (field === 'contractors') {
      const newValue = Math.max(0, localContractors - 1);
      setLocalContractors(newValue);
      await data.onUpdateHeadcount(data.id, 'num_contractors', newValue);
    } else if (field === 'apt_contractors') {
      const newValue = Math.max(0, localAptContractors - 1);
      setLocalAptContractors(newValue);
      await data.onUpdateHeadcount(data.id, 'num_apt_contractors', newValue);
    }
  };

  const nodeClasses = [
    'of-employee-node',
    selected ? 'of-employee-node--selected' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={nodeClasses}>
      <Handle type="target" position={Position.Top} className="of-handle" />

      <div className="of-employee-body">
        <div className="of-employee-header">
          <div className="of-employee-avatar">
            <User className="of-employee-avatar-icon" />
          </div>
          <div className="of-employee-info">
            <h3 className="of-employee-name">{data.name}</h3>
            {data.role && <p className="of-employee-role">{data.role}</p>}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              data.onEdit();
            }}
            className="of-employee-edit-btn"
            title="Edit employee"
          >
            <Settings className="of-employee-edit-icon" />
          </button>
        </div>

        {data.department && (
          <div className="of-employee-department">
            {data.department}
          </div>
        )}

        <div className="of-employee-section">
          <div className="of-employee-counters">
            <div className="of-employee-counter-row">
              <label className="of-employee-counter-label">FTEs:</label>
              <div className="of-employee-counter-controls">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDecrement('ftes'); }}
                  className="of-employee-counter-btn"
                >
                  <Minus className="of-employee-counter-icon" />
                </button>
                <span className="of-employee-counter-value">{localFtes}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleIncrement('ftes'); }}
                  className="of-employee-counter-btn"
                >
                  <Plus className="of-employee-counter-icon" />
                </button>
              </div>
            </div>

            <div className="of-employee-counter-row">
              <label className="of-employee-counter-label">Contractors:</label>
              <div className="of-employee-counter-controls">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDecrement('contractors'); }}
                  className="of-employee-counter-btn"
                >
                  <Minus className="of-employee-counter-icon" />
                </button>
                <span className="of-employee-counter-value">{localContractors}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleIncrement('contractors'); }}
                  className="of-employee-counter-btn"
                >
                  <Plus className="of-employee-counter-icon" />
                </button>
              </div>
            </div>

            <div className="of-employee-counter-row">
              <label className="of-employee-counter-label">Apt Contractors:</label>
              <div className="of-employee-counter-controls">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDecrement('apt_contractors'); }}
                  className="of-employee-counter-btn"
                >
                  <Minus className="of-employee-counter-icon" />
                </button>
                <span className="of-employee-counter-value">{localAptContractors}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleIncrement('apt_contractors'); }}
                  className="of-employee-counter-btn"
                >
                  <Plus className="of-employee-counter-icon" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {(data.email || data.phone) && (
          <div className="of-employee-contact">
            {data.email && (
              <div className="of-employee-contact-row">
                <Mail className="of-employee-contact-icon" />
                <a
                  href={`mailto:${data.email}`}
                  onClick={(e) => e.stopPropagation()}
                  className="of-employee-email-link"
                >
                  {data.email}
                </a>
              </div>
            )}
            {data.phone && (
              <div className="of-employee-contact-row">
                <Phone className="of-employee-contact-icon" />
                <span>{data.phone}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="of-handle" />
    </div>
  );
}

export default memo(EmployeeNode);
