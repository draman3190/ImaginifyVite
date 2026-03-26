interface Tab {
  id: string;
  label: string;
}

interface TabNavigationProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function TabNavigation({ tabs, activeTab, onTabChange }: TabNavigationProps) {
  return (
    <div className="border-b border-border-subtle">
      <nav className="mx-auto flex max-w-6xl px-4 sm:px-6" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative px-6 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'text-ethereal-400'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-ethereal-400 to-cosmic-400" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
