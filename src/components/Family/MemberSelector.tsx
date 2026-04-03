import { useHealthStore } from '../../stores/healthStore';
import { getInitials, memberColor } from '../../lib/utils';
import { Plus } from 'lucide-react';

export default function MemberSelector() {
  const { familyMembers, activeMemberId, setActiveMember } = useHealthStore();

  return (
    <div className="member-selector">
      {familyMembers.map(member => {
        const name = `${member.first_name} ${member.last_name}`;
        const isActive = member.id === activeMemberId;
        const color = memberColor(member.id);

        return (
          <button
            key={member.id}
            className={`member-chip${isActive ? ' active' : ''}`}
            onClick={() => setActiveMember(member.id)}
            title={name}
          >
            <div className="member-chip-avatar" style={{ background: isActive ? color : 'var(--color-surface-offset)' }}>
              {getInitials(name)}
            </div>
            <span className="member-chip-name">{member.first_name}</span>
          </button>
        );
      })}
      {familyMembers.length === 0 && (
        <span style={{ color: 'var(--color-tx-muted)', fontSize: 'var(--text-sm)' }}>
          No family members yet
        </span>
      )}
      <NavButton />
    </div>
  );
}

function NavButton() {
  return (
    <a href="/family" className="member-chip add" title="Manage family">
      <Plus size={14} />
    </a>
  );
}
