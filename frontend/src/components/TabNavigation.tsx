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
              className={`relative px-6 py-3 text-sm font-medium transition-all cursor-pointer ${
                isActive
                  ? 'text-ethereal-300 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                  : 'text-text-muted hover:text-cosmic-300 hover:shadow-[0_0_10px_rgba(139,92,246,0.2)]'
              }`}
            >
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-ethereal-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
