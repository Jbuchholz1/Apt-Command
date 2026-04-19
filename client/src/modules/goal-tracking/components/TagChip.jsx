import { Globe, User } from 'lucide-react';

export default function TagChip({ kind }) {
  if (kind === 'company') {
    return (
      <span className="gt-tag gt-tag-company">
        <Globe size={10} />
        <span>Company Priority</span>
      </span>
    );
  }
  if (kind === 'mine') {
    return (
      <span className="gt-tag gt-tag-mine">
        <User size={10} />
        <span>My Priority</span>
      </span>
    );
  }
  return null;
}
