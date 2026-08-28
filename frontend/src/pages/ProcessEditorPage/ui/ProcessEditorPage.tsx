import {
  Alert,
  Button,
  Card,
  Label,
  Select,
  Skeleton,
  Table,
  Text,
  TextArea,
  type TableColumnConfig,
} from '@gravity-ui/uikit';
import {useMutation, useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';

import {
  activateTechnologicalProcessVersion,
  createTechnologicalProcessVersion,
  exportTechnologicalProcessVersion,
  replaceTechnologicalProcessGraph,
  technologicalProcessKeys,
  useTechnologicalProcessQuery,
  useTechnologicalProcessVersionQuery,
  useTechnologicalProcessVersionsQuery,
  type ProcessEdge,
  type ProcessGraphInput,
  type ProcessNode,
  type ProcessStatus,
} from '@/entities/TechnologicalProcess';
import {getErrorMessage} from '@/shared/api';
import {formatDateTime} from '@/shared/lib';
import {routes} from '@/shared/routes';

import styles from './ProcessEditorPage.module.scss';

const statusView: Record<
  ProcessStatus,
  {text: string; theme: 'info' | 'success' | 'normal'}
> = {
  draft: {text: 'Черновик', theme: 'info'},
  active: {text: 'Активен', theme: 'success'},
  archived: {text: 'Архив', theme: 'normal'},
};

const nodeTypeNames: Record<ProcessNode['type'], string> = {
  material: 'Материал',
  manufactured_item: 'Полуфабрикат',
  operation: 'Операция',
  output: 'Результат',
};

function downloadJson(document: object, name: string) {
  const blob = new Blob([JSON.stringify(document, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ProcessEditorPage() {
  const {processId = ''} = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const processQuery = useTechnologicalProcessQuery(processId);
  const versionsQuery = useTechnologicalProcessVersionsQuery(processId);
  const [selectedVersionOverride, setSelectedVersionOverride] = useState('');
  const defaultVersionId =
    processQuery.data?.latest_version.id ?? versionsQuery.data?.items[0]?.id ?? '';
  const selectedVersionId = versionsQuery.data?.items.some(
    (version) => version.id === selectedVersionOverride,
  )
    ? selectedVersionOverride
    : defaultVersionId;
  const versionQuery = useTechnologicalProcessVersionQuery(
    processId,
    selectedVersionId,
  );
  const [sourceEdit, setSourceEdit] = useState<{
    versionId: string;
    value: string;
  }>();
  const [parseErrorState, setParseErrorState] = useState<{
    versionId: string;
    message: string;
  }>();
  const source =
    sourceEdit?.versionId === selectedVersionId
      ? sourceEdit.value
      : versionQuery.data
        ? JSON.stringify(versionQuery.data.graph, null, 2)
        : '';
  const parseError =
    parseErrorState?.versionId === selectedVersionId
      ? parseErrorState.message
      : undefined;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({queryKey: technologicalProcessKeys.all}),
      queryClient.invalidateQueries({
        queryKey: technologicalProcessKeys.detail(processId),
      }),
      queryClient.invalidateQueries({
        queryKey: technologicalProcessKeys.versions(processId),
      }),
    ]);
  };
  const saveMutation = useMutation({
    mutationFn: (document: ProcessGraphInput) =>
      replaceTechnologicalProcessGraph(processId, selectedVersionId, document),
    onSuccess: async (version) => {
      queryClient.setQueryData(
        technologicalProcessKeys.version(processId, version.id),
        version,
      );
      setSourceEdit({
        versionId: version.id,
        value: JSON.stringify(version.graph, null, 2),
      });
      setParseErrorState(undefined);
      await refresh();
    },
  });
  const activateMutation = useMutation({
    mutationFn: () =>
      activateTechnologicalProcessVersion(processId, selectedVersionId),
    onSuccess: async (version) => {
      queryClient.setQueryData(
        technologicalProcessKeys.version(processId, version.id),
        version,
      );
      await refresh();
    },
  });
  const createVersionMutation = useMutation({
    mutationFn: () =>
      createTechnologicalProcessVersion(processId, selectedVersionId || undefined),
    onSuccess: async (version) => {
      await refresh();
      setSelectedVersionOverride(version.id);
    },
  });
  const exportMutation = useMutation({
    mutationFn: () =>
      exportTechnologicalProcessVersion(processId, selectedVersionId),
    onSuccess: (document) =>
      downloadJson(
        document,
        `technological-process-v${versionQuery.data?.version_number ?? 1}.json`,
      ),
  });

  const save = () => {
    try {
      const parsed = JSON.parse(source) as ProcessGraphInput;
      setParseErrorState(undefined);
      saveMutation.mutate(parsed);
    } catch {
      setParseErrorState({
        versionId: selectedVersionId,
        message: 'JSON содержит синтаксическую ошибку',
      });
    }
  };

  if (processQuery.isPending || versionsQuery.isPending) {
    return (
      <main className={styles.root} aria-label="Загрузка редактора техпроцесса">
        <Skeleton className={styles.headerSkeleton} />
        <Skeleton className={styles.editorSkeleton} />
      </main>
    );
  }
  if (processQuery.isError || versionsQuery.isError) {
    return (
      <main className={styles.root}>
        <Alert
          theme="danger"
          title="Не удалось открыть технологический процесс"
          message={getErrorMessage(processQuery.error ?? versionsQuery.error)}
          actions={
            <Button onClick={() => navigate(routes.processes)}>К списку</Button>
          }
        />
      </main>
    );
  }

  const process = processQuery.data;
  const version = versionQuery.data;
  const nodes = version?.graph.nodes ?? [];
  const edges = version?.graph.edges ?? [];
  const editable = version?.status === 'draft' && !process.archived;
  const versionOptions = versionsQuery.data.items.map((item) => ({
    value: item.id,
    content: `v${item.version_number} · ${statusView[item.status].text}`,
  }));
  const nodeColumns: TableColumnConfig<ProcessNode>[] = [
    {id: 'id', name: 'ID', primary: true},
    {id: 'type', name: 'Тип', template: (node) => nodeTypeNames[node.type]},
    {id: 'label', name: 'Подпись', template: (node) => node.label ?? '—'},
    {
      id: 'reference',
      name: 'Ссылка',
      template: (node) => node.referenceId ?? 'Не сопоставлено',
    },
    {
      id: 'position',
      name: 'Позиция',
      template: (node) => `${node.position?.x ?? 0}; ${node.position?.y ?? 0}`,
    },
  ];
  const edgeColumns: TableColumnConfig<ProcessEdge>[] = [
    {id: 'id', name: 'ID', primary: true},
    {id: 'source', name: 'Источник'},
    {id: 'target', name: 'Назначение'},
    {id: 'quantity', name: 'Количество', template: (edge) => edge.quantity ?? '—'},
  ];
  const mutationError =
    saveMutation.error ??
    activateMutation.error ??
    createVersionMutation.error ??
    exportMutation.error;

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <Button view="flat" onClick={() => navigate(routes.processes)}>
            ← К списку
          </Button>
          <div>
            <div className={styles.titleLine}>
              <Text as="h1" variant="display-1">
                {process.name}
              </Text>
              {version ? (
                <Label theme={statusView[version.status].theme} size="m">
                  {statusView[version.status].text}
                </Label>
              ) : null}
            </div>
            <Text as="p" color="secondary" className={styles.description}>
              Результат: {process.output_item_name ?? 'не сопоставлен'}
            </Text>
          </div>
        </div>
        <div className={styles.toolbar}>
          <Select
            options={versionOptions}
            value={selectedVersionId ? [selectedVersionId] : []}
            onUpdate={(values) => setSelectedVersionOverride(values[0] ?? '')}
            width="max"
            size="l"
            aria-label="Версия техпроцесса"
          />
          <Button
            view="outlined"
            size="l"
            onClick={() => createVersionMutation.mutate()}
            loading={createVersionMutation.isPending}
            disabled={process.archived || !selectedVersionId}
          >
            Новая версия
          </Button>
          <Button
            view="outlined"
            size="l"
            onClick={() => exportMutation.mutate()}
            loading={exportMutation.isPending}
            disabled={!version}
          >
            Экспорт JSON
          </Button>
          {editable ? (
            <Button
              view="action"
              size="l"
              onClick={() => activateMutation.mutate()}
              loading={activateMutation.isPending}
            >
              Активировать
            </Button>
          ) : null}
        </div>
      </header>

      {mutationError ? (
        <Alert
          className={styles.alert}
          theme="danger"
          title="Операция не выполнена"
          message={getErrorMessage(mutationError)}
        />
      ) : null}

      <div className={styles.summary}>
        <Card view="outlined" className={styles.metric}>
          <Text color="secondary">Узлов</Text>
          <Text variant="header-2">{nodes.length}</Text>
        </Card>
        <Card view="outlined" className={styles.metric}>
          <Text color="secondary">Связей</Text>
          <Text variant="header-2">{edges.length}</Text>
        </Card>
        <Card view="outlined" className={styles.metric}>
          <Text color="secondary">Автор версии</Text>
          <Text variant="body-2">{version?.created_by ?? '—'}</Text>
        </Card>
        <Card view="outlined" className={styles.metric}>
          <Text color="secondary">Изменена</Text>
          <Text variant="body-2">
            {version ? formatDateTime(version.updated_at) : '—'}
          </Text>
        </Card>
      </div>

      <div className={styles.columns}>
        <Card view="outlined" className={styles.structureCard}>
          <div className={styles.cardHeading}>
            <div>
              <Text as="h2" variant="header-2">
                Структура
              </Text>
              <Text as="p" color="secondary" className={styles.description}>
                Узлы и зависимости выбранной версии
              </Text>
            </div>
          </div>
          <section className={styles.tableSection}>
            <Text as="h3" variant="subheader-2">
              Узлы
            </Text>
            <div className={styles.tableScroll}>
              <Table
                data={nodes}
                columns={nodeColumns}
                getRowId={(node) => node.id}
              />
            </div>
          </section>
          <section className={styles.tableSection}>
            <Text as="h3" variant="subheader-2">
              Связи
            </Text>
            <div className={styles.tableScroll}>
              <Table
                data={edges}
                columns={edgeColumns}
                getRowId={(edge) => edge.id}
              />
            </div>
          </section>
        </Card>

        <Card view="outlined" className={styles.jsonCard}>
          <div className={styles.cardHeading}>
            <div>
              <Text as="h2" variant="header-2">
                JSON-документ
              </Text>
              <Text as="p" color="secondary" className={styles.description}>
                {editable
                  ? 'Можно менять сопоставления, узлы, связи и количества.'
                  : 'Активные и архивные версии доступны только для чтения.'}
              </Text>
            </div>
            {editable ? (
              <Button
                view="action"
                onClick={save}
                loading={saveMutation.isPending}
              >
                Сохранить черновик
              </Button>
            ) : null}
          </div>
          {versionQuery.isPending ? (
            <Skeleton className={styles.sourceSkeleton} />
          ) : (
            <TextArea
              className={styles.source}
              value={source}
              onUpdate={(value) =>
                setSourceEdit({versionId: selectedVersionId, value})
              }
              readOnly={!editable}
              rows={32}
              controlProps={{
                'aria-label': 'JSON выбранной версии техпроцесса',
                spellCheck: false,
              }}
              {...(parseError
                ? {validationState: 'invalid' as const, errorMessage: parseError}
                : {})}
            />
          )}
        </Card>
      </div>
    </main>
  );
}
