import {
  Alert,
  Button,
  Card,
  Label,
  Select,
  Skeleton,
  Text,
} from "@gravity-ui/uikit";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  activateTechnologicalProcessVersion,
  createTechnologicalProcessVersion,
  exportTechnologicalProcessVersion,
  technologicalProcessKeys,
  useTechnologicalProcessQuery,
  useTechnologicalProcessVersionQuery,
  useTechnologicalProcessVersionsQuery,
  type ProcessStatus,
  type ProcessVersion,
} from "@/entities/TechnologicalProcess";
import {
  ProcessCanvas,
  type ProcessCanvasHandle,
} from "@/features/EditProcessGraph";
import { getErrorMessage } from "@/shared/api";
import { formatDateTime } from "@/shared/lib";
import { routes } from "@/shared/routes";

import styles from "./ProcessEditorPage.module.scss";

const statusView: Record<
  ProcessStatus,
  { text: string; theme: "info" | "success" | "normal" }
> = {
  draft: { text: "Черновик", theme: "info" },
  active: { text: "Активен", theme: "success" },
  archived: { text: "Архив", theme: "normal" },
};

function downloadJson(document: object, name: string) {
  const blob = new Blob([JSON.stringify(document, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ProcessEditorPage() {
  const { processId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canvasRef = useRef<ProcessCanvasHandle>(null);
  const processQuery = useTechnologicalProcessQuery(processId);
  const versionsQuery = useTechnologicalProcessVersionsQuery(processId);
  const [selectedVersionOverride, setSelectedVersionOverride] = useState("");
  const defaultVersionId =
    processQuery.data?.latest_version.id ??
    versionsQuery.data?.items[0]?.id ??
    "";
  const selectedVersionId = versionsQuery.data?.items.some(
    (version) => version.id === selectedVersionOverride,
  )
    ? selectedVersionOverride
    : defaultVersionId;
  const versionQuery = useTechnologicalProcessVersionQuery(
    processId,
    selectedVersionId,
  );

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: technologicalProcessKeys.all }),
      queryClient.invalidateQueries({
        queryKey: technologicalProcessKeys.detail(processId),
      }),
      queryClient.invalidateQueries({
        queryKey: technologicalProcessKeys.versions(processId),
      }),
    ]);
  };
  const onVersionUpdate = useCallback(
    (version: ProcessVersion) => {
      queryClient.setQueryData(
        technologicalProcessKeys.version(processId, version.id),
        version,
      );
      void queryClient.invalidateQueries({
        queryKey: technologicalProcessKeys.versions(processId),
      });
    },
    [processId, queryClient],
  );
  const activateMutation = useMutation({
    mutationFn: async () => {
      await canvasRef.current?.save();
      return activateTechnologicalProcessVersion(processId, selectedVersionId);
    },
    onSuccess: async (version) => {
      queryClient.setQueryData(
        technologicalProcessKeys.version(processId, version.id),
        version,
      );
      await refresh();
    },
  });
  const createVersionMutation = useMutation({
    mutationFn: async () => {
      await canvasRef.current?.save();
      return createTechnologicalProcessVersion(
        processId,
        selectedVersionId || undefined,
      );
    },
    onSuccess: async (version) => {
      await refresh();
      setSelectedVersionOverride(version.id);
    },
  });
  const exportMutation = useMutation({
    mutationFn: async () => {
      await canvasRef.current?.save();
      return exportTechnologicalProcessVersion(processId, selectedVersionId);
    },
    onSuccess: (document) =>
      downloadJson(
        document,
        `technological-process-v${versionQuery.data?.version_number ?? 1}.json`,
      ),
  });

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
  const editable = version?.status === "draft" && !process.archived;
  const versionOptions = versionsQuery.data.items.map((item) => ({
    value: item.id,
    content: `v${item.version_number} · ${statusView[item.status].text}`,
  }));
  const mutationError =
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
              Результат: {process.output_item_name ?? "не сопоставлен"}
            </Text>
          </div>
        </div>
        <Card view="outlined" className={styles.metric}>
          <Text color="secondary">Автор версии</Text>
          <Text variant="body-2">{version?.created_by ?? "—"}</Text>
        </Card>
        <Card view="outlined" className={styles.metric}>
          <Text color="secondary">Изменена</Text>
          <Text variant="body-2">
            {version ? formatDateTime(version.updated_at) : "—"}
          </Text>
        </Card>
        <div className={styles.toolbar}>
          <Select
            options={versionOptions}
            value={selectedVersionId ? [selectedVersionId] : []}
            onUpdate={(values) => setSelectedVersionOverride(values[0] ?? "")}
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

      {versionQuery.isPending ? (
        <Skeleton className={styles.editorSkeleton} />
      ) : version ? (
        <ProcessCanvas
          key={version.id}
          ref={canvasRef}
          processId={processId}
          version={version}
          editable={editable}
          onVersionUpdate={onVersionUpdate}
        />
      ) : (
        <Alert
          className={styles.alert}
          theme="warning"
          title="Версия не найдена"
          message="Выберите существующую версию или создайте новую."
        />
      )}
    </main>
  );
}
