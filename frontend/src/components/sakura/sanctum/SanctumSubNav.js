import React from 'react';
import { NavLink } from 'react-router-dom';

const TABS = [
  { label: 'Overview', path: '/sanctum' },
  { label: 'Sound Vault', path: '/sanctum/sounds' },
  { label: 'LoRA Archive', path: '/sanctum/lora' },
];

export default function SanctumSubNav() {
  return (
    <nav className="skr-sanctum-tabs">
      {TABS.map(t => (
        <NavLink
          key={t.path}
          to={t.path}
          end={t.path === '/sanctum'}
          className={({ isActive }) => `skr-sanctum-tab${isActive ? ' is-active' : ''}`}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
