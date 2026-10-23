import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  useUpdateNodeInternals,
  type IsValidConnection,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useModelStore } from '../../store/modelStore';
import type { ModelEdge, ModelNode, ModelNodeType } from '../../types/model';
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

interface ContextMenuState {
  clientX: number;
  clientY: number;
  flowX: number;
  flowY: number;
  targetNodeId: string | null;
}

function FlowCanvasInner() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const nodes = useModelStore((s) => s.nodes);
  const edges = useModelStore((s) => s.edges);
  const outcomeDisplayMode = useModelStore((s) => s.outcomeDisplayMode);
  const clipboard = useModelStore((s) => s.clipboard);
  const layoutVersion = useModelStore((s) => s.layoutVersion);
  const onNodesChange = useModelStore((s) => s.onNodesChange);
  const onEdgesChange = useModelStore((s) => s.onEdgesChange);
  const onConnect = useModelStore((s) => s.onConnect);
  const selectNode = useModelStore((s) => s.selectNode);
  const selectEdge = useModelStore((s) => s.selectEdge);
  const selectAllNodes = useModelStore((s) => s.selectAllNodes);
  const addNode = useModelStore((s) => s.addNode);
  const copyNodes = useModelStore((s) => s.copyNodes);
  const cutNodes = useModelStore((s) => s.cutNodes);
  const pasteClipboard = useModelStore((s) => s.pasteClipboard);
  const duplicateNodes = useModelStore((s) => s.duplicateNodes);
  const deleteSelected = useModelStore((s) => s.deleteSelected);
  const deleteNodesByIds = useModelStore((s) => s.deleteNodesByIds);
  const connectionError = useModelStore((s) => s.connectionError);
  const clearConnectionError = useModelStore((s) => s.clearConnectionError);

  // Map each parented outcomeId -> parentQuestionId
  const parentQuestionByOutcome = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of edges) {
      if (e.data?.kind === 'question-to-outcome') {
        map.set(e.target, e.source);
      }
    }
    return map;
  }, [edges]);

  // Project nodes & edges when in 'nested' mode so parented outcomes are hidden on canvas
  // and their outgoing links originate from their embedded handle (`outcome:<id>`) on the Question card.
  const displayNodes = useMemo<ModelNode[]>(() => {
    if (outcomeDisplayMode !== 'nested') return nodes;
    return nodes.map((n) => {
      if (n.type === 'outcome' && parentQuestionByOutcome.has(n.id)) {
        return { ...n, hidden: true };
      }
      return n.hidden ? { ...n, hidden: false } : n;
    });
  }, [nodes, outcomeDisplayMode, parentQuestionByOutcome]);

  const displayEdges = useMemo<ModelEdge[]>(() => {
    if (outcomeDisplayMode !== 'nested') {
      return edges.map((e) => (e.hidden ? { ...e, hidden: false } : e));
    }
    return edges.map((e) => {
      if (
        e.data?.kind === 'question-to-outcome' &&
        parentQuestionByOutcome.has(e.target)
      ) {
        return { ...e, hidden: true };
      }
      const parentQId = parentQuestionByOutcome.get(e.source);
      if (parentQId) {
        const srcOutcome = nodes.find(
          (n) => n.id === e.source && n.type === 'outcome'
        );
        const probLabel =
          srcOutcome && srcOutcome.type === 'outcome'
            ? `${srcOutcome.data.probabilityPct}%`
            : e.label;
        return {
          ...e,
          hidden: false,
          source: parentQId,
          sourceHandle: `outcome:${e.source}`,
          label: probLabel,
          zIndex: 10,
        };
      }
      return {
        ...e,
        hidden: false,
        sourceHandle: null,
        zIndex: 10,
      };
    });
  }, [edges, nodes, outcomeDisplayMode, parentQuestionByOutcome]);

  // Whenever display mode or question outcomes change, refresh ReactFlow handle positions
  useEffect(() => {
    const questionIds = nodes
      .filter((n) => n.type === 'question')
      .map((n) => n.id);
    if (questionIds.length === 0) return;

    updateNodeInternals(questionIds);
    const raf = window.requestAnimationFrame(() => {
      updateNodeInternals(questionIds);
    });
    const timer = window.setTimeout(() => {
      updateNodeInternals(questionIds);
    }, 60);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [outcomeDisplayMode, nodes, edges, updateNodeInternals]);

  useEffect(() => {
    if (layoutVersion === 0) return;
    const timer = window.setTimeout(() => {
      fitView({ padding: 0.18, duration: 300 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [layoutVersion, fitView]);

  // Global keyboard shortcuts for Copy / Cut / Paste / Duplicate / Select All
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      const key = e.key.toLowerCase();
      if (key === 'c') {
        e.preventDefault();
        copyNodes();
      } else if (key === 'x') {
        e.preventDefault();
        cutNodes();
      } else if (key === 'v') {
        e.preventDefault();
        pasteClipboard();
      } else if (key === 'd') {
        e.preventDefault();
        duplicateNodes();
      } else if (key === 'a') {
        e.preventDefault();
        selectAllNodes();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copyNodes, cutNodes, pasteClipboard, duplicateNodes, selectAllNodes]);

  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      let actualSource = connection.source;
      if (connection.sourceHandle?.startsWith('outcome:')) {
        actualSource = connection.sourceHandle.slice('outcome:'.length);
      }
      const check = canConnectNodes(
        nodes,
        edges,
        actualSource,
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

  const handleNodeContextMenu = useCallback(
    (event: ReactMouseEvent, node: ModelNode) => {
      event.preventDefault();
      event.stopPropagation();

      const currentlySelected = nodes.filter((n) => n.selected);
      const isAlreadySelected = currentlySelected.some((n) => n.id === node.id);
      if (!isAlreadySelected) {
        selectNode(node.id, false);
      }

      const flowPos = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      setContextMenu({
        clientX: event.clientX,
        clientY: event.clientY,
        flowX: flowPos.x,
        flowY: flowPos.y,
        targetNodeId: node.id,
      });
    },
    [nodes, selectNode, screenToFlowPosition]
  );

  const handlePaneContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      event.preventDefault();
      const flowPos = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setContextMenu({
        clientX: event.clientX,
        clientY: event.clientY,
        flowX: flowPos.x,
        flowY: flowPos.y,
        targetNodeId: null,
      });
    },
    [screenToFlowPosition]
  );

  const selectedNodes = nodes.filter((n) => n.selected);
  const contextTargetIds: string[] =
    selectedNodes.length > 0
      ? selectedNodes.map((n) => n.id)
      : contextMenu?.targetNodeId
        ? [contextMenu.targetNodeId]
        : [];

  const deletableContextIds = contextTargetIds.filter((id) => {
    const n = nodes.find((node) => node.id === id);
    return n?.type !== 'start';
  });

  const hasClipboard = Boolean(clipboard && clipboard.nodes.length > 0);

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

      {selectedNodes.length > 1 && (
        <div className="canvas-selection-pill">
          <span>{selectedNodes.length} nodes selected</span>
          <button
            type="button"
            onClick={() => copyNodes()}
            title="Copy selected (Cmd/Ctrl+C)"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => cutNodes()}
            title="Cut selected (Cmd/Ctrl+X)"
          >
            Cut
          </button>
          <button
            type="button"
            className="pill-danger"
            onClick={() => deleteSelected()}
            title="Delete selected (Delete/Backspace)"
          >
            Delete
          </button>
        </div>
      )}

      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={(e, node) => {
          setContextMenu(null);
          selectNode(node.id, e.shiftKey || e.metaKey || e.ctrlKey);
        }}
        onEdgeClick={(_, edge) => {
          setContextMenu(null);
          selectEdge(edge.id);
        }}
        onPaneClick={() => {
          setContextMenu(null);
          selectNode(null);
          selectEdge(null);
        }}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneContextMenu={handlePaneContextMenu}
        onMoveStart={() => setContextMenu(null)}
        onDrop={onDrop}
        onDragOver={onDragOver}
        selectionOnDrag
        panOnDrag={[1, 2]}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        elevateEdgesOnSelect
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

      {contextMenu && (
        <div
          className="canvas-context-menu"
          style={{
            left: Math.min(window.innerWidth - 220, contextMenu.clientX),
            top: Math.min(window.innerHeight - 260, contextMenu.clientY),
          }}
          role="menu"
        >
          <div className="context-menu-header">
            {contextTargetIds.length > 1
              ? `${contextTargetIds.length} Nodes Selected`
              : contextTargetIds.length === 1
                ? nodes.find((n) => n.id === contextTargetIds[0])?.data.label ||
                  'Node Actions'
                : 'Canvas Actions'}
          </div>

          {contextTargetIds.length > 0 && (
            <>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  cutNodes(contextTargetIds);
                  setContextMenu(null);
                }}
              >
                <span>Cut</span>
                <kbd>⌘X</kbd>
              </button>

              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  copyNodes(contextTargetIds);
                  setContextMenu(null);
                }}
              >
                <span>Copy</span>
                <kbd>⌘C</kbd>
              </button>

              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  duplicateNodes(contextTargetIds);
                  setContextMenu(null);
                }}
              >
                <span>Duplicate</span>
                <kbd>⌘D</kbd>
              </button>
            </>
          )}

          <button
            type="button"
            className="context-menu-item"
            disabled={!hasClipboard}
            onClick={() => {
              pasteClipboard({ x: contextMenu.flowX, y: contextMenu.flowY });
              setContextMenu(null);
            }}
          >
            <span>
              Paste
              {clipboard && clipboard.nodes.length > 1
                ? ` (${clipboard.nodes.length})`
                : ''}
            </span>
            <kbd>⌘V</kbd>
          </button>

          {contextTargetIds.length === 0 && (
            <>
              <div className="context-menu-divider" />
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  addNode('question', {
                    x: contextMenu.flowX,
                    y: contextMenu.flowY,
                  });
                  setContextMenu(null);
                }}
              >
                <span>+ Add Question Here</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  addNode('outcome', {
                    x: contextMenu.flowX,
                    y: contextMenu.flowY,
                  });
                  setContextMenu(null);
                }}
              >
                <span>+ Add Outcome Here</span>
              </button>
              <button
                type="button"
                className="context-menu-item"
                onClick={() => {
                  selectAllNodes();
                  setContextMenu(null);
                }}
              >
                <span>Select All Nodes</span>
                <kbd>⌘A</kbd>
              </button>
            </>
          )}

          {contextTargetIds.length > 0 && (
            <>
              <div className="context-menu-divider" />
              <button
                type="button"
                className="context-menu-item is-danger"
                disabled={deletableContextIds.length === 0}
                onClick={() => {
                  deleteNodesByIds(deletableContextIds);
                  setContextMenu(null);
                }}
              >
                <span>
                  Delete
                  {deletableContextIds.length > 1
                    ? ` (${deletableContextIds.length})`
                    : ''}
                </span>
                <kbd>⌫</kbd>
              </button>
            </>
          )}
        </div>
      )}
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
