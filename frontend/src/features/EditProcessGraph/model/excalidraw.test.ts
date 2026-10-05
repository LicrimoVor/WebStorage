import {describe, expect, it} from 'vitest';

import {
  excalidrawToGraph,
  graphToExcalidraw,
  normalizeGraph,
} from './excalidraw';

describe('Excalidraw process adapter', () => {
  it('round-trips domain nodes, references, edges and quantities', () => {
    const graph = normalizeGraph({
      schemaVersion: 1,
      name: 'Корпус',
      outputItemId: '2ecf3319-78bf-4af7-aad9-44b61778ef40',
      nodes: [
        {
          id: 'material',
          type: 'material',
          referenceId: '6da7e219-cd70-4611-bca1-833c46e6d219',
          label: 'Лист стали',
          position: {x: 40, y: 80},
        },
        {
          id: 'output',
          type: 'output',
          referenceId: '2ecf3319-78bf-4af7-aad9-44b61778ef40',
          label: 'Корпус',
          position: {x: 400, y: 80},
        },
      ],
      edges: [
        {
          id: 'material-output',
          source: 'material',
          target: 'output',
          quantity: '2.500000',
        },
      ],
    });
    const restored = excalidrawToGraph(graphToExcalidraw(graph), {
      name: graph.name,
      outputItemId: graph.outputItemId ?? null,
    });
    expect(restored).toEqual(graph);
  });

  it('partially imports arbitrary rectangles and bound arrows', () => {
    const graph = excalidrawToGraph(
      {
        type: 'excalidraw',
        elements: [
          {id: 'a', type: 'rectangle', x: 10, y: 20},
          {id: 'b', type: 'rectangle', x: 300, y: 20},
          {id: 'a-text', type: 'text', containerId: 'a', text: 'Пластина'},
          {
            id: 'arrow',
            type: 'arrow',
            startBinding: {elementId: 'a'},
            endBinding: {elementId: 'b'},
          },
        ],
      },
      {name: 'Импорт', outputItemId: null},
    );
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[0]?.label).toBe('Пластина');
    expect(graph.nodes[0]?.referenceId).toBeNull();
    expect(graph.edges).toEqual([
      {id: 'arrow', source: 'a', target: 'b', quantity: null},
    ]);
  });

  it('preserves separate material copies and a parallelogram comment', () => {
    const graph = normalizeGraph({schemaVersion: 1, name: 'Схема', nodes: [
      {id: 'm1', type: 'material', referenceId: 'material', label: 'Сталь'},
      {id: 'm2', type: 'material', referenceId: 'material', label: 'Сталь'},
      {id: 'note', type: 'comment', label: 'Проверить размер\nперед сборкой'},
    ], edges: []});
    const exported = graphToExcalidraw(graph);
    const shape = exported.elements.find((element) => element.id === 'note');
    expect(shape).toMatchObject({type: 'line', strokeColor: '#29975a'});
    expect(shape?.points).toHaveLength(5);
    expect(excalidrawToGraph(exported, {name: graph.name, outputItemId: null})).toEqual(graph);
  });
});
