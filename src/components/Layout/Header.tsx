import { Sun, Moon } from 'lucide-react';
import MemberSelector from '../Family/MemberSelector';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export default function Header({ theme, onToggleTheme }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        <MemberSelector />
      </div>
      <div className="header-right">
        <button className="btn btn-ghost btn-sm" onClick={onToggleTheme} title="Toggle theme">
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>
    </header>
  );
}
