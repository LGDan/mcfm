import { useCallback, useEffect, useRef, type DragEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type IsValidConnection,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useModelStore } from '../../store/modelStore';
import type { ModelNode, ModelNodeType } from '../../types/model';
import { canConnectNodes } from '../../sim/validate';
import { StartNode } from '../nodes/StartNode';
import { QuestionNode } from '../nodes/QuestionNode';
import { OutcomeNode } from '../nodes/OutcomeNode';
import { EndNode } from '../nodes/EndNode';

const nodeTypes: NodeTypes = {
  start: StartNode,
  question: QuestionNode,
  outcome: OutcomeNode,
  end: EndNode,
};

function FlowCanvasInner() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const nodes = useModelStore((s) => s.nodes);
  const edges = useModelStore((s) => s.edges);
  const layoutVersion = useModelStore((s) => s.layoutVersion);
  const onNodesChange = useModelStore((s) => s.onNodesChange);
  const onEdgesChange = useModelStore((s) => s.onEdgesChange);
  const onConnect = useModelStore((s) => s.onConnect);
  const selectNode = useModelStore((s) => s.selectNode);
  const selectEdge = useModelStore((s) => s.selectEdge);
  const addNode = useModelStore((s) => s.addNode);
  const connectionError = useModelStore((s) => s.connectionError);
  const clearConnectionError = useModelStore((s) => s.clearConnectionError);

  useEffect(() => {
    if (layoutVersion === 0) return;
    const timer = window.setTimeout(() => {
      fitView({ padding: 0.18, duration: 300 });
    }, 30);
    return () => window.clearTimeout(timer);
  }, [layoutVersion, fitView]);

  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      const check = canConnectNodes(
        nodes,
        edges,
        connection.source,
        connection.target
      );
      return check.allowed;
    },
    [nodes, edges]
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const rawType = event.dataTransfer.getData(
        'application/mc-modeller-node'
      ) as ModelNodeType;
      if (!rawType) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addNode(rawType, position);
    },
    [screenToFlowPosition, addNode]
  );

  return (
    <div className="canvas-container" ref={wrapperRef}>
      {connectionError && (
        <div className="canvas-toast-error" role="alert">
          <span>{connectionError}</span>
          <button type="button" onClick={clearConnectionError}>
            Dismiss
          </button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={(_, node) => selectNode(node.id)}
        onEdgeClick={(_, edge) => selectEdge(edge.id)}
        onPaneClick={() => {
          selectNode(null);
          selectEdge(null);
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        deleteKeyCode={['Backspace', 'Delete']}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
          color="#334155"
        />
        <Controls position="bottom-left" />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeColor={(node: ModelNode) => {
            if (node.type === 'start') return '#10b981';
            if (node.type === 'question') return '#6366f1';
            if (node.type === 'outcome') return '#0ea5e9';
            return '#64748b';
          }}
        />
      </ReactFlow>
    </div>
  );
}

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
