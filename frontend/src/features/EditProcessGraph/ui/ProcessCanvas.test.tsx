import {MobileProvider} from '@gravity-ui/uikit';
import {fireEvent, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  return {...actual, saveTechnologicalProcessDraft: vi.fn()};
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
    vi.clearAllMocks();
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
    expect(node).toHaveAttribute('draggable', 'true');
    if (!node) return;

    fireEvent.doubleClick(node);

    expect(screen.getByRole('link', {name: 'Открыть выпуск продукции'})).toBeInTheDocument();
    expect(screen.getByText('Активная версия')).toBeInTheDocument();

    fireEvent.dragStart(node, {
      clientX: 520,
      clientY: 220,
      dataTransfer: {effectAllowed: 'none'},
    });
    fireEvent.dragEnd(node, {clientX: 260, clientY: 160});
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
