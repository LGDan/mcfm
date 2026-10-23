import { useModelStore } from './store/modelStore';
import { Toolbar } from './components/Toolbar';
import { Toolbox } from './components/Toolbox';
import { FlowCanvas } from './components/Canvas/FlowCanvas';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ResultsView } from './components/ResultsView';
import './app.css';

export function App() {
  const activeTab = useModelStore((s) => s.activeTab);

  return (
    <div className="app-shell">
      <Toolbar />
      {activeTab === 'editor' ? (
        <div className="editor-workspace">
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
