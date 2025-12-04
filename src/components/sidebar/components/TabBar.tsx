/**
 * Tab Bar
 * Tab navigation bar for the sidebar.
 */

import type { SidebarTab, TabBarProps } from '../types';
import { TIMELINE_COLORS } from '../../../constants';

const tabs: { id: SidebarTab; label: string }[] = [
  { id: 'media', label: 'Media' },
  { id: 'subtitles', label: 'Subtitles' },
  { id: 'overlays', label: 'Overlays' },
];

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        borderBottom: `1px solid ${TIMELINE_COLORS.border}`,
        backgroundColor: TIMELINE_COLORS.background,
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            flex: 1,
            padding: '10px 8px',
            fontSize: 12,
            fontWeight: activeTab === tab.id ? 600 : 400,
            color: activeTab === tab.id ? '#fff' : '#888',
            backgroundColor: activeTab === tab.id ? TIMELINE_COLORS.trackHeaderBg : 'transparent',
            border: 'none',
            borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
