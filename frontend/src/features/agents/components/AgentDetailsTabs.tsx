type TabKey = 'general' | 'printers' | 'events' | 'commands';

type AgentDetailsTabsProps = {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
};

const tabs: Array<{ key: TabKey; label: string; description: string }> = [
  {
    key: 'general',
    label: 'Geral',
    description: 'Informações principais do agente.',
  },
  {
    key: 'printers',
    label: 'Impressoras',
    description: 'Preparado para listar impressoras vinculadas.',
  },
  {
    key: 'events',
    label: 'Eventos',
    description: 'Preparado para eventos enviados pelo agente.',
  },
  {
    key: 'commands',
    label: 'Comandos',
    description: 'Preparado para histórico de comandos.',
  },
];

export type { TabKey };

export function AgentDetailsTabs({ activeTab, onChange }: AgentDetailsTabsProps) {
  return (
    <div className="border-b border-slate-200">
      <nav className="-mb-px flex flex-wrap gap-4">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={[
                'border-b-2 px-1 py-3 text-sm font-semibold transition',
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
              ].join(' ')}
              title={tab.description}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
