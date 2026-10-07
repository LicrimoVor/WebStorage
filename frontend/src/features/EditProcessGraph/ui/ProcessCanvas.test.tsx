import {MobileProvider} from '@gravity-ui/uikit';
import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {useInventoryGroupsQuery} from '@/entities/InventoryGroup';
import type * as GroupExports from '@/entities/InventoryGroup';
import {useManufacturedItemsQuery} from '@/entities/ManufacturedItem';
import type * as ManufacturedItemExports from '@/entities/ManufacturedItem';
import {useMaterialsQuery} from '@/entities/Material';
import type * as MaterialExports from '@/entities/Material';
import {useOperationsQuery} from '@/entities/Operation';
import type * as OperationExports from '@/entities/Operation';
import {
  saveTechnologicalProcessDraft,
  useItemProcessRecipeQuery,
  type ProcessVersion,
} from '@/entities/TechnologicalProcess';
import type * as ProcessExports from '@/entities/TechnologicalProcess';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {calculateDroppedNodePosition} from '../model/geometry';
import {ProcessCanvas} from './ProcessCanvas';

vi.mock('@/entities/InventoryGroup', async (importOriginal) => {
  const actual = await importOriginal<typeof GroupExports>();
  return {...actual, useInventoryGroupsQuery: vi.fn()};
});
vi.mock('@/entities/Material', async (importOriginal) => {
  const actual = await importOriginal<typeof MaterialExports>();
  return {...actual, useMaterialsQuery: vi.fn()};
});
vi.mock('@/entities/ManufacturedItem', async (importOriginal) => {
  const actual = await importOriginal<typeof ManufacturedItemExports>();
  return {...actual, useManufacturedItemsQuery: vi.fn()};
});
vi.mock('@/entities/Operation', async (importOriginal) => {
  const actual = await importOriginal<typeof OperationExports>();
  return {...actual, useOperationsQuery: vi.fn()};
});
vi.mock('@/entities/TechnologicalProcess', async (importOriginal) => {
  const actual = await importOriginal<typeof ProcessExports>();
  return {...actual, saveTechnologicalProcessDraft: vi.fn(), useItemProcessRecipeQuery: vi.fn()};
});

const version: ProcessVersion = {
  id: 'eb31a260-5595-42fc-9854-944b21f4f8a2',
  process_id: '4e2171ab-0a79-4bd4-b012-2233bf0f15d2',
  version_number: 1,
  status: 'draft',
  schema_version: 1,
  revision: 0,
  created_by: 'local-development',
  activated_at: null,
  created_at: '2026-08-28T05:00:00Z',
  updated_at: '2026-08-28T05:00:00Z',
  graph: {
    schemaVersion: 1,
    name: 'Редуктор',
    outputItemId: '98a218fd-4698-4913-9fa7-48a18386dd3a',
    nodes: [
      {
        id: 'output',
        type: 'output',
        referenceId: '98a218fd-4698-4913-9fa7-48a18386dd3a',
        label: 'Редуктор',
        position: {x: 500, y: 200},
      },
    ],
    edges: [],
  },
};

function mockCatalogs() {
  const emptyList = {items: [], page: 1, page_size: 100, total: 0, pages: 0};
  vi.mocked(useMaterialsQuery).mockReturnValue({
    data: emptyList,
  } as unknown as ReturnType<typeof useMaterialsQuery>);
  vi.mocked(useManufacturedItemsQuery).mockReturnValue({
    data: emptyList,
  } as unknown as ReturnType<typeof useManufacturedItemsQuery>);
  vi.mocked(useOperationsQuery).mockReturnValue({
    data: emptyList,
  } as unknown as ReturnType<typeof useOperationsQuery>);
}

function mockDraftSave(draft: ProcessVersion) {
  vi.mocked(saveTechnologicalProcessDraft).mockImplementation(
    async (_processId, _versionId, payload) => ({
      ...draft,
      revision: draft.revision + 1,
      graph: payload.graph as ProcessVersion['graph'],
    }),
  );
}

describe('ProcessCanvas', () => {
  beforeEach(() => {
    vi.mocked(useItemProcessRecipeQuery).mockReturnValue({data: null, isPending: false, isError: false} as unknown as ReturnType<typeof useItemProcessRecipeQuery>);
    vi.clearAllMocks();
    vi.stubGlobal('PointerEvent', MouseEvent);
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {configurable: true, value: vi.fn()});
    mockCatalogs();
    vi.mocked(useInventoryGroupsQuery).mockReturnValue({data: []} as unknown as ReturnType<typeof useInventoryGroupsQuery>);
  });

  it('keeps a save error visible and stops autosaving an unchanged rejected graph', async () => {
    const draft: ProcessVersion = {...version, graph: {...version.graph, nodes: [
      ...(version.graph.nodes ?? []), {id: 'steel', type: 'material', referenceId: null, label: 'Сталь'},
    ]}};
    let finish: ((saved: ProcessVersion) => void) | undefined;
    vi.mocked(saveTechnologicalProcessDraft).mockRejectedValueOnce(new Error('Ошибка рецепта'))
      .mockImplementationOnce((_processId, _versionId, payload) => new Promise((resolve) => {
        finish = () => resolve({...draft, revision: 1, graph: payload.graph as ProcessVersion['graph']});
      }));
    renderWithProviders(<ProcessCanvas processId={version.process_id} version={draft} editable onVersionUpdate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', {name: 'Создать копию материала Сталь'}));
    expect(await screen.findByText('Черновик не сохранён', {}, {timeout: 3000})).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(saveTechnologicalProcessDraft).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', {name: 'Сохранить сейчас'}));
    await waitFor(() => expect(saveTechnologicalProcessDraft).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Черновик не сохранён')).toBeInTheDocument();
    finish?.(draft);
    await waitFor(() => expect(screen.queryByText('Черновик не сохранён')).not.toBeInTheDocument());
  });

  it('moves nodes in world coordinates at a different zoom and snaps with Ctrl', async () => {
    mockDraftSave(version);
    renderWithProviders(<ProcessCanvas processId={version.process_id} version={version} editable onVersionUpdate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', {name: '+'}));
    const node = document.querySelector<HTMLElement>('[data-process-node-id="output"]')!;
    fireEvent.pointerDown(node, {clientX: 100, clientY: 100, button: 0});
    fireEvent.pointerMove(node, {clientX: 144, clientY: 122});
    fireEvent.pointerUp(node);
    expect(node.style.transform).toBe('translate(540px, 220px)');
    fireEvent.pointerDown(node, {clientX: 100, clientY: 100, button: 0});
    fireEvent.pointerMove(node, {clientX: 112, clientY: 112, ctrlKey: true});
    fireEvent.pointerUp(node);
    expect(node.style.transform).toBe('translate(552px, 240px)');
  });

  it('duplicates a material with Alt drag while keeping the original in place', async () => {
    const draft = {...version, graph: {...version.graph, nodes: [...(version.graph.nodes ?? []),
      {id: 'steel', type: 'material' as const, referenceId: null, label: 'Сталь', position: {x: 0, y: 0}}]}};
    mockDraftSave(draft);
    renderWithProviders(<ProcessCanvas processId={version.process_id} version={draft} editable onVersionUpdate={vi.fn()} />);
    const node = document.querySelector<HTMLElement>('[data-process-node-id="steel"]')!;
    fireEvent.pointerDown(node, {clientX: 100, clientY: 100, button: 0, altKey: true});
    fireEvent.pointerMove(node, {clientX: 160, clientY: 140, altKey: true});
    fireEvent.pointerUp(node);
    expect(node.style.transform).toBe('translate(0px, 0px)');
    expect(document.querySelectorAll('[data-process-node]')).toHaveLength(3);
    await waitFor(() => expect(saveTechnologicalProcessDraft).toHaveBeenCalledWith(version.process_id, version.id,
      expect.objectContaining({graph: expect.objectContaining({nodes: expect.arrayContaining([
        expect.objectContaining({type: 'material', position: {x: 60, y: 40}}),
      ])})})), {timeout: 3000});
  });

  it('selects an area with Shift and moves all selected nodes together', () => {
    const draft = {...version, graph: {...version.graph, nodes: [...(version.graph.nodes ?? []),
      {id: 'steel', type: 'material' as const, referenceId: null, label: 'Сталь', position: {x: 0, y: 0}}]}};
    mockDraftSave(draft);
    renderWithProviders(<ProcessCanvas processId={version.process_id} version={draft} editable onVersionUpdate={vi.fn()} />);
    const canvas = screen.getByLabelText('Полотно технологического процесса');
    fireEvent.pointerDown(canvas, {clientX: 70, clientY: 60, button: 0, shiftKey: true});
    fireEvent.pointerMove(canvas, {clientX: 900, clientY: 500, shiftKey: true});
    fireEvent.pointerUp(canvas);
    expect([...document.querySelectorAll('[data-process-node]')].filter((node) => node.className.includes('selected'))).toHaveLength(2);
    expect(screen.queryByText(/Выбрано:/)).not.toBeInTheDocument();
    const node = document.querySelector<HTMLElement>('[data-process-node-id="steel"]')!;
    fireEvent.pointerDown(node, {clientX: 100, clientY: 100, button: 0});
    fireEvent.pointerMove(node, {clientX: 140, clientY: 120});
    fireEvent.pointerUp(node);
    expect(node.style.transform).toBe('translate(40px, 20px)');
    expect(document.querySelector<HTMLElement>('[data-process-node-id="output"]')!.style.transform).toBe('translate(540px, 220px)');
  });

  it('blocks incoming connections to a semi-finished item with an existing recipe', () => {
    const draft = {...version, graph: {...version.graph, nodes: [...(version.graph.nodes ?? []),
      {id: 'steel', type: 'material' as const, referenceId: null, label: 'Сталь', position: {x: 0, y: 0}},
      {id: 'semi', type: 'manufactured_item' as const, referenceId: 'semi-id', label: 'Узел', position: {x: 300, y: 0}}]}};
    renderWithProviders(<ProcessCanvas processId={version.process_id} version={draft} editable lockedInputIds={['semi-id']} onVersionUpdate={vi.fn()} />);
    const target = document.querySelector<HTMLElement>('[data-process-node-id="semi"]')!;
    Object.defineProperty(document, 'elementFromPoint', {configurable: true, value: vi.fn().mockReturnValue(target)});
    const connector = screen.getByRole('button', {name: 'Потянуть связь из Сталь'});
    fireEvent.pointerDown(connector, {clientX: 100, clientY: 100, button: 0});
    fireEvent.pointerUp(connector, {clientX: 300, clientY: 100});
    expect(screen.getByText(/Входящие связи запрещены/)).toBeInTheDocument();
    expect(document.querySelectorAll('[data-process-edge]')).toHaveLength(0);
    expect(screen.getByRole('button', {name: 'Потянуть связь из Узел'})).toBeInTheDocument();
  });

  it.each(['material', 'operation'] as const)('blocks incoming connections to %s nodes', (type) => {
    const draft = {...version, graph: {...version.graph, nodes: [...(version.graph.nodes ?? []),
      {id: 'source', type: 'material' as const, referenceId: null, label: 'Источник', position: {x: 0, y: 0}},
      {id: 'leaf', type, referenceId: null, label: 'Лист', position: {x: 300, y: 0}}]}};
    renderWithProviders(<ProcessCanvas processId={version.process_id} version={draft} editable onVersionUpdate={vi.fn()} />);
    const target = document.querySelector('[data-process-node-id="leaf"]')!;
    Object.defineProperty(document, 'elementFromPoint', {configurable: true, value: vi.fn().mockReturnValue(target)});
    const connector = screen.getByRole('button', {name: 'Потянуть связь из Источник'});
    fireEvent.pointerDown(connector, {clientX: 100, clientY: 100, button: 0});
    fireEvent.pointerUp(connector, {clientX: 300, clientY: 100});
    expect(screen.getByText('Материалы и операции не могут иметь входящие связи.')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-process-edge]')).toHaveLength(0);
  });

  it('toggles the grid icon and applies undo and redo hotkeys outside inputs', async () => {
    mockDraftSave(version);
    renderWithProviders(<ProcessCanvas processId={version.process_id} version={version} editable onVersionUpdate={vi.fn()} />);
    const grid = screen.getByRole('button', {name: 'Привязка к сетке'});
    expect(grid).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(grid);
    expect(grid).toHaveAttribute('aria-pressed', 'true');
    const node = document.querySelector<HTMLElement>('[data-process-node-id="output"]')!;
    fireEvent.pointerDown(node, {clientX: 100, clientY: 100, button: 0});
    fireEvent.pointerMove(node, {clientX: 150, clientY: 150});
    fireEvent.pointerUp(node);
    const moved = node.style.transform;
    fireEvent.keyDown(document.body, {key: 'z', ctrlKey: true});
    expect(node.style.transform).toBe('translate(500px, 200px)');
    fireEvent.keyDown(document.body, {key: 'y', ctrlKey: true});
    expect(node.style.transform).toBe(moved);
    expect(screen.getByRole('button', {name: 'Отменить (Ctrl+Z)'})).toHaveAttribute('title', 'Отменить (Ctrl+Z)');
    expect(screen.getByRole('button', {name: 'Импорт Excalidraw'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Экспорт Excalidraw'})).toBeInTheDocument();
  });

  it('shows the local recipe and selects all its ancestors excluding other branches', async () => {
    const draft = {...version, graph: {...version.graph, nodes: [...(version.graph.nodes ?? []),
      {id: 'steel', type: 'material' as const, referenceId: null, label: 'Сталь', position: {x: 0, y: 0}},
      {id: 'semi', type: 'manufactured_item' as const, referenceId: 'semi-id', label: 'Узел', position: {x: 300, y: 0}},
      {id: 'other', type: 'operation' as const, referenceId: null, label: 'Другая ветка', position: {x: 300, y: 300}}],
      edges: [{id: 'steel-semi', source: 'steel', target: 'semi', quantity: '2.5'},
        {id: 'semi-output', source: 'semi', target: 'output', quantity: '3'}]}};
    renderWithProviders(<ProcessCanvas processId={version.process_id} version={draft} editable onVersionUpdate={vi.fn()} />);
    fireEvent.doubleClick(document.querySelector('[data-process-node-id="semi"]')!);
    await userEvent.click(screen.getByRole('tab', {name: 'Состав'}));
    expect(screen.getByRole('cell', {name: 'Сталь'})).toBeInTheDocument();
    expect(screen.getByRole('cell', {name: '2,5'})).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Выделить'}));
    expect(document.querySelector('[data-process-node-id="steel"]')!.className).toContain('selected');
    expect(document.querySelector('[data-process-node-id="semi"]')!.className).toContain('selected');
    expect(document.querySelector('[data-process-node-id="output"]')!.className).not.toContain('selected');
    expect(document.querySelector('[data-process-node-id="other"]')!.className).not.toContain('selected');
  });

  it('shows an external recipe with a link to its exact version', async () => {
    const externalVersion = {...version, graph: {...version.graph, nodes: [...(version.graph.nodes ?? []),
      {id: 'material', type: 'material' as const, label: 'Внешний материал', position: {x: 0, y: 0}}],
      edges: [{id: 'external-edge', source: 'material', target: 'output', quantity: '4'}]}};
    vi.mocked(useItemProcessRecipeQuery).mockReturnValue({data: {process_id: 'external-process', process_name: 'Другая карта',
      target_node_id: 'output', version: externalVersion}, isPending: false, isError: false} as unknown as ReturnType<typeof useItemProcessRecipeQuery>);
    const draft = {...version, graph: {...version.graph, nodes: [...(version.graph.nodes ?? []),
      {id: 'semi', type: 'manufactured_item' as const, referenceId: 'semi-id', label: 'Внешний узел', position: {x: 0, y: 0}}]}};
    renderWithProviders(<ProcessCanvas processId={version.process_id} version={draft} editable={false} onVersionUpdate={vi.fn()} />);
    fireEvent.doubleClick(document.querySelector('[data-process-node-id="semi"]')!);
    await userEvent.click(screen.getByRole('tab', {name: 'Состав'}));
    expect(screen.getByRole('cell', {name: 'Внешний материал'})).toBeInTheDocument();
    expect(screen.getByRole('cell', {name: '4'})).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Перейти в другой техпроцесс'})).toHaveAttribute('href', `/processes/external-process?version=${externalVersion.id}`);
    expect(screen.queryByRole('button', {name: 'Выделить'})).not.toBeInTheDocument();
    expect(useItemProcessRecipeQuery).toHaveBeenCalledWith('semi-id', version.process_id, true);
  });

  it('dims saved disconnected nodes and restores participation after connecting them', async () => {
    const disconnected = {...version, graph: {...version.graph, nodes: [...(version.graph.nodes ?? []),
      {id: 'island', type: 'material' as const, referenceId: null, label: 'Отдельный узел', position: {x: 0, y: 0}}]}};
    const props = {processId: version.process_id, version: disconnected, editable: true, onVersionUpdate: vi.fn()};
    function Harness() {
      const [saved, setSaved] = useState(disconnected);
      return <>
        <button onClick={() => setSaved({...disconnected, graph: {...disconnected.graph, edges: [
          {id: 'connected', source: 'island', target: 'output', quantity: '1'},
        ]}})}>Подключить сохранённый узел</button>
        <ProcessCanvas {...props} version={saved} />
      </>;
    }
    renderWithProviders(<Harness />);
    const node = document.querySelector<HTMLElement>('[data-process-node-id="island"]')!;
    expect(node).toHaveAttribute('data-process-participating', 'false');
    expect(node.className).toMatch(/inactive/);
    await userEvent.click(screen.getByRole('button', {name: 'Подключить сохранённый узел'}));
    expect(node).toHaveAttribute('data-process-participating', 'true');
    expect(node.className).not.toMatch(/inactive/);
  });

  it('allows manually resaving an unchanged version with errors', async () => {
    const draft = {...version, status: 'error' as const, validation_errors: ['Ошибка схемы']};
    mockDraftSave(draft);
    renderWithProviders(<ProcessCanvas processId={version.process_id} version={draft} editable onVersionUpdate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', {name: 'Сохранить сейчас'}));
    await waitFor(() => expect(saveTechnologicalProcessDraft).toHaveBeenCalledOnce());
  });

  it('initializes the node group filter from the process and includes subgroups', async () => {
    vi.mocked(useInventoryGroupsQuery).mockReturnValue({data: [
      {id: 'main', name: 'Металл', parent_id: null}, {id: 'child', name: 'Сталь', parent_id: 'main'},
    ]} as unknown as ReturnType<typeof useInventoryGroupsQuery>);
    vi.mocked(useMaterialsQuery).mockReturnValue({data: {items: [
      {id: 'inside', name: 'Лист', unit: 'шт', groups: [{id: 'child'}]},
      {id: 'outside', name: 'Пластик', unit: 'шт', groups: []},
    ]}} as unknown as ReturnType<typeof useMaterialsQuery>);
    renderWithProviders(<MobileProvider mobile><ProcessCanvas processId={version.process_id} defaultGroupId="main" version={version} editable onVersionUpdate={vi.fn()} /></MobileProvider>);
    await userEvent.click(screen.getByRole('button', {name: 'Добавить узел'}));
    expect(screen.getByRole('combobox', {name: 'Группа узла'})).toHaveTextContent('Металл');
    await userEvent.click(screen.getByRole('combobox', {name: 'Сущность узла'}));
    expect(await screen.findByRole('option', {name: 'Лист · шт'})).toBeInTheDocument();
    expect(document.querySelector('.g-select-popup')).toBeInTheDocument();
    expect(document.querySelector('.g-sheet')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', {name: 'Пластик · шт'})).not.toBeInTheDocument();
  });

  it('copies materials as independent nodes with the same catalog reference', async () => {
    const draft: ProcessVersion = {...version, graph: {...version.graph, nodes: [
      ...(version.graph.nodes ?? []),
      {id: 'material', type: 'material', referenceId: 'material-id', label: 'Сталь', position: {x: 10, y: 20}},
    ]}};
    mockDraftSave(draft);
    renderWithProviders(<ProcessCanvas processId={version.process_id} version={draft} editable onVersionUpdate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', {name: 'Создать копию материала Сталь'}));
    await waitFor(() => {
      const nodes = vi.mocked(saveTechnologicalProcessDraft).mock.calls[0]?.[2].graph.nodes;
      const copies = nodes?.filter((node) => node.type === 'material');
      expect(copies).toHaveLength(2);
      expect(copies?.map((node) => node.referenceId)).toEqual(['material-id', 'material-id']);
      expect(new Set(copies?.map((node) => node.id)).size).toBe(2);
      expect(copies?.[1]?.position).toEqual({x: 50, y: 60});
    }, {timeout: 3000});
  });

  it('adds a multiline comment without a catalog reference or production connectors', async () => {
    mockDraftSave(version);
    renderWithProviders(<ProcessCanvas processId={version.process_id} version={version} editable onVersionUpdate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', {name: 'Добавить узел'}));
    await userEvent.click(screen.getByRole('radio', {name: 'Комментарий'}));
    const text = await screen.findByRole('textbox', {name: 'Текст комментария'}, {timeout: 5000});
    expect(screen.queryByRole('combobox', {name: 'Сущность узла'})).not.toBeInTheDocument();
    await userEvent.type(text, 'Проверить размер{Enter}перед сборкой');
    await userEvent.click(screen.getByRole('button', {name: 'Готово'}));
    await waitFor(() => expect(saveTechnologicalProcessDraft).toHaveBeenCalledWith(version.process_id, version.id,
      expect.objectContaining({graph: expect.objectContaining({nodes: expect.arrayContaining([
        expect.objectContaining({type: 'comment', referenceId: null, label: 'Проверить размер\nперед сборкой'}),
      ])})})), {timeout: 3000});
    expect(screen.queryByRole('button', {name: 'Потянуть связь из Проверить размер\nперед сборкой'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Потянуть связь из Редуктор'})).not.toBeInTheDocument();
    expect(screen.getByText('Проверить размер перед сборкой')).toBeInTheDocument();
  });

  it('excludes an already used operation from the node picker', async () => {
    vi.mocked(useOperationsQuery).mockReturnValue({data: {items: [
      {id: 'used', name: 'Резка'}, {id: 'available', name: 'Сборка'},
    ]}} as unknown as ReturnType<typeof useOperationsQuery>);
    const draft: ProcessVersion = {...version, graph: {...version.graph, nodes: [
      ...(version.graph.nodes ?? []), {id: 'op', type: 'operation', referenceId: 'used', label: 'Резка'},
    ]}};
    renderWithProviders(<ProcessCanvas processId={version.process_id} version={draft} editable onVersionUpdate={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', {name: 'Добавить узел'}));
    await userEvent.click(screen.getByRole('radio', {name: 'Операция'}));
    await userEvent.click(screen.getByRole('combobox', {name: 'Сущность узла'}));
    expect(screen.queryByRole('option', {name: 'Резка'})).not.toBeInTheDocument();
    expect(await screen.findByRole('option', {name: 'Сборка'}, {timeout: 5000})).toBeInTheDocument();
  });

  it('adds a node and autosaves it with the expected revision', async () => {
    mockDraftSave(version);
    const user = userEvent.setup();
    renderWithProviders(
      <ProcessCanvas
        processId={version.process_id}
        version={version}
        editable
        onVersionUpdate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Добавить узел'}));
    await user.click(screen.getByRole('button', {name: 'Готово'}));

    await waitFor(
      () => {
        expect(saveTechnologicalProcessDraft).toHaveBeenCalledWith(
          version.process_id,
          version.id,
          expect.objectContaining({
            expected_revision: 0,
            graph: expect.objectContaining({
              nodes: expect.arrayContaining([
                expect.objectContaining({label: null, type: 'material'}),
              ]),
            }),
          }),
        );
      },
      {timeout: 3000},
    );
    expect(await screen.findByText('Сохранено')).toBeInTheDocument();
    expect(screen.getByText('rev. 1')).toBeInTheDocument();
  });

  it('keeps negative node coordinates after dragging', () => {
    expect(
      calculateDroppedNodePosition(
        {x: -40, y: -30},
        {left: 0, top: 0},
        {x: 80, y: 70, zoom: 1},
        {x: 10, y: 10},
      ),
    ).toEqual({x: -130, y: -110});
  });

  it('creates a connection by dragging the node connector', async () => {
    const sourceVersion: ProcessVersion = {
      ...version,
      graph: {
        ...version.graph,
        nodes: [
          {
            id: 'material',
            type: 'material',
            referenceId: null,
            label: 'Лист стали',
            position: {x: 100, y: 200},
          },
          ...(version.graph.nodes ?? []),
        ],
      },
    };
    mockDraftSave(sourceVersion);
    renderWithProviders(
      <ProcessCanvas
        processId={sourceVersion.process_id}
        version={sourceVersion}
        editable
        onVersionUpdate={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', {name: 'Связать'})).not.toBeInTheDocument();
    expect(
      screen.queryByText('Выберите второй узел для создания связи'),
    ).not.toBeInTheDocument();
    const connector = screen.getByRole('button', {
      name: 'Потянуть связь из Лист стали',
    });
    const target = screen.getByText('Редуктор').closest<HTMLElement>(
      '[data-process-node-id]',
    );
    expect(target).not.toBeNull();
    if (!target) return;
    Object.defineProperty(connector, 'setPointerCapture', {value: vi.fn()});
    const originalPointerEvent = window.PointerEvent;
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(window, 'PointerEvent', {
      configurable: true,
      value: MouseEvent,
    });
    const hitTest = vi.fn(() => target);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: hitTest,
    });

    fireEvent.pointerDown(connector, {pointerId: 1, clientX: 320, clientY: 258});
    fireEvent.pointerUp(connector, {pointerId: 1, clientX: 500, clientY: 258});

    await waitFor(
      () =>
        expect(saveTechnologicalProcessDraft).toHaveBeenCalledWith(
          sourceVersion.process_id,
          sourceVersion.id,
          expect.objectContaining({
            graph: expect.objectContaining({
              edges: expect.arrayContaining([
                expect.objectContaining({
                  source: 'material',
                  target: 'output',
                  quantity: '1',
                }),
              ]),
            }),
          }),
        ),
      {timeout: 3000},
    );
    expect(hitTest).toHaveBeenCalled();
    if (originalPointerEvent) {
      Object.defineProperty(window, 'PointerEvent', {
        configurable: true,
        value: originalPointerEvent,
      });
    } else {
      Reflect.deleteProperty(window, 'PointerEvent');
    }
    if (originalElementFromPoint) {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint,
      });
    } else {
      Reflect.deleteProperty(document, 'elementFromPoint');
    }
  });

  it('opens node editing on double click', () => {
    renderWithProviders(
      <ProcessCanvas
        processId={version.process_id}
        version={version}
        editable
        onVersionUpdate={vi.fn()}
      />,
    );

    fireEvent.doubleClick(screen.getByText('Редуктор'));

    expect(screen.getByText('Изменить узел')).toBeInTheDocument();
    expect(screen.getByLabelText('Подпись узла')).toHaveValue('Редуктор');
    expect(
      screen.getByText(/тип и сопоставление зафиксированы/),
    ).toBeInTheDocument();
  });

  it('opens production and allows local node movement in an active version', async () => {
    renderWithProviders(
      <ProcessCanvas
        processId={version.process_id}
        version={{...version, status: 'active'}}
        editable={false}
        onVersionUpdate={vi.fn()}
      />,
    );

    const node = document.querySelector<HTMLElement>(
      '[data-process-node-id="output"]',
    );
    expect(node).not.toBeNull();
    expect(node).not.toHaveAttribute('draggable');
    if (!node) return;

    fireEvent.doubleClick(node);

    expect(screen.getByRole('link', {name: 'Открыть выпуск продукции'})).toBeInTheDocument();
    expect(screen.getByText('Активная версия')).toBeInTheDocument();

    fireEvent.pointerDown(node, {clientX: 520, clientY: 220, button: 0});
    fireEvent.pointerMove(node, {clientX: 260, clientY: 160});
    fireEvent.pointerUp(node, {clientX: 260, clientY: 160});
    expect(node.style.transform).toBe('translate(240px, 140px)');
    await new Promise((resolve) => window.setTimeout(resolve, 800));
    expect(saveTechnologicalProcessDraft).not.toHaveBeenCalled();
  });

  it('rounds connection quantities and edits them on double click', async () => {
    const versionWithEdge: ProcessVersion = {
      ...version,
      graph: {
        ...version.graph,
        nodes: [
          {
            id: 'material',
            type: 'material',
            referenceId: null,
            label: 'Лист стали',
            position: {x: 100, y: 200},
          },
          ...(version.graph.nodes ?? []),
        ],
        edges: [
          {
            id: 'material-output',
            source: 'material',
            target: 'output',
            quantity: '5.126',
          },
        ],
      },
    };
    mockDraftSave(versionWithEdge);
    const user = userEvent.setup();
    renderWithProviders(
      <ProcessCanvas
        processId={versionWithEdge.process_id}
        version={versionWithEdge}
        editable
        onVersionUpdate={vi.fn()}
      />,
    );
    expect(screen.getByText('5,126', {selector: 'text'})).toBeInTheDocument();
    const edgeTitle = screen.getByText('Двойной клик — изменить соединение');
    const edgeGroup = edgeTitle.parentElement;
    expect(edgeGroup).not.toBeNull();
    if (!edgeGroup) return;

    fireEvent.doubleClick(edgeGroup);

    expect(screen.getByText('Изменить соединение')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: 'Удалить соединение'}),
    ).toBeInTheDocument();
    const quantity = screen.getByLabelText('Количество соединения');
    expect(quantity).toHaveValue('5.13');
    await user.clear(quantity);
    await user.type(quantity, '7.125');
    await user.click(screen.getByRole('button', {name: 'Сохранить'}));

    await waitFor(
      () => {
        const payload = vi.mocked(saveTechnologicalProcessDraft).mock.calls[0]?.[2];
        expect(payload?.graph.edges).toEqual([
          expect.objectContaining({
            id: 'material-output',
            quantity: '7.13',
          }),
        ]);
      },
      {timeout: 3000},
    );
    expect(screen.getByText('7,13', {selector: 'text'})).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('rev. 1')).toBeInTheDocument());
    const updatedTitle = screen.getByText('Двойной клик — изменить соединение');
    const updatedGroup = updatedTitle.parentElement;
    expect(updatedGroup).not.toBeNull();
    if (!updatedGroup) return;
    fireEvent.doubleClick(updatedGroup);
    await user.click(screen.getByRole('button', {name: 'Удалить соединение'}));

    expect(
      screen.queryByText('7.13', {selector: 'text'}),
    ).not.toBeInTheDocument();
    await waitFor(
      () => {
        const secondPayload = vi.mocked(saveTechnologicalProcessDraft).mock
          .calls[1]?.[2];
        expect(secondPayload?.graph.edges).toEqual([]);
      },
      {timeout: 3000},
    );
  });

  it('prevents page scrolling for wheel gestures over the canvas', () => {
    renderWithProviders(
      <ProcessCanvas
        processId={version.process_id}
        version={version}
        editable={false}
        onVersionUpdate={vi.fn()}
      />,
    );
    const canvas = screen.getByLabelText('Полотно технологического процесса');
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 200,
      deltaY: 100,
    });

    fireEvent(canvas, wheel);

    expect(wheel.defaultPrevented).toBe(true);
  });
});
