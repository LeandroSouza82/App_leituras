import { LayoutDashboard, Building2, PlusCircle } from 'lucide-react';
import './Navigation.css';

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'leituras', label: 'Leituras', icon: Building2 },
  { id: 'cadastrar', label: 'Cadastrar', icon: PlusCircle },
];

const Navigation = ({ activeTab, onChange }) => {
  return (
    <nav className="navigation-bar">
      <ul className="nav-list">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <li key={tab.id} className="nav-item">
              <button
                type="button"
                className={`nav-button ${isActive ? 'active' : ''}`}
                onClick={() => onChange(tab.id)}
              >
                <Icon size={20} />
                <span>{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default Navigation;
