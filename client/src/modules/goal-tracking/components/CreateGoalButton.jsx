import { useState } from 'react';
import { Plus } from 'lucide-react';
import GoalForm from './GoalForm';
import { createGoal } from '../../../lib/api';

export default function CreateGoalButton({
  period,
  allGoals,
  canSetCompanyPriority,
  defaultOwnerEmail,
  defaultOwnerName,
  onCreated,
  label = 'New Goal',
}) {
  const [open, setOpen] = useState(false);

  const handleSave = async (payload) => {
    const res = await createGoal(payload);
    setOpen(false);
    onCreated?.(res.goal);
  };

  return (
    <>
      <button className="gt-btn-primary gt-btn-create" onClick={() => setOpen(true)}>
        <Plus size={14} />
        <span>{label}</span>
      </button>
      {open && (
        <GoalForm
          period={period}
          allGoals={allGoals}
          canSetCompanyPriority={canSetCompanyPriority}
          defaultOwnerEmail={defaultOwnerEmail}
          defaultOwnerName={defaultOwnerName}
          onSave={handleSave}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}
