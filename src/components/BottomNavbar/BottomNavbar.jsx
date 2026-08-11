import { Building2, LayoutDashboard, PlusCircle, UserRound } from 'lucide-react';
import './BottomNavbar.css';

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'leituras', label: 'Leituras', icon: Building2 },
  { id: 'cadastrar', label: 'Cadastro', icon: PlusCircle },
  { id: 'perfil', label: 'Perfil', icon: UserRound, disabled: true },
];

const BottomNavbar = ({ activeTab, onChange }) => (
  <nav className="bottom-navbar" aria-label="Navegacao principal">
    <ul className="bottom-navbar-list">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <li key={tab.id} className="bottom-navbar-item">
            <button
              type="button"
              className={`bottom-navbar-button ${isActive ? 'is-active' : ''}`}
              onClick={() => onChange(tab.id)}
              disabled={tab.disabled}
              aria-current={isActive ? 'page' : undefined}
              aria-label={tab.disabled ? `${tab.label} em breve` : tab.label}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span>{tab.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  </nav>
);

export default BottomNavbar;