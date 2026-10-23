import { useModelStore } from './store/modelStore';
import { Toolbar } from './components/Toolbar';
import { Toolbox } from './components/Toolbox';
import { FlowCanvas } from './components/Canvas/FlowCanvas';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ResultsView } from './components/ResultsView';
import './app.css';

export function App() {
  const activeTab = useModelStore((s) => s.activeTab);
  const toolboxCollapsed = useModelStore((s) => s.toolboxCollapsed);
  const propertiesCollapsed = useModelStore((s) => s.propertiesCollapsed);

  const gridTemplateColumns = `${toolboxCollapsed ? '42px' : '248px'} 1fr ${
    propertiesCollapsed ? '42px' : '316px'
  }`;

  return (
    <div className="app-shell">
      <Toolbar />
      {activeTab === 'editor' ? (
        <div
          className="editor-workspace"
          style={{ gridTemplateColumns }}
        >
          <Toolbox />
          <FlowCanvas />
          <PropertiesPanel />
        </div>
      ) : (
        <ResultsView />
      )}
    </div>
  );
}

export default App;
