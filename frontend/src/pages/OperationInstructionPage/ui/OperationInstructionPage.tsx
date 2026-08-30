import {
  Alert,
  Button,
  Card,
  Dialog,
  Label,
  Select,
  Skeleton,
  Tab,
  TabList,
  Text,
  TextArea,
  TextInput,
} from '@gravity-ui/uikit';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react';
import {useNavigate, useParams} from 'react-router-dom';

import {
  createOperationInstructionPublicLink,
  deleteOperationInstructionAsset,
  getOperationInstructionVersion,
  listOperationInstructionAssets,
  listOperationInstructionPublicLinks,
  operationInstructionExportUrl,
  operationInstructionKeys,
  publicInstructionQrUrl,
  publishOperationInstruction,
  revokeOperationInstructionPublicLink,
  saveOperationInstructionDraft,
  uploadOperationInstructionAsset,
  useOperationInstructionQuery,
  type InstructionAsset,
  type InstructionExportFormat,
  type InstructionVersion,
  type PublicLink,
} from '@/entities/OperationInstruction';
import {getErrorMessage} from '@/shared/api';
import {formatDateTime} from '@/shared/lib';
import {routes} from '@/shared/routes';

import styles from './OperationInstructionPage.module.scss';

const exportFormats: InstructionExportFormat[] = ['md', 'txt', 'docx', 'pdf'];
const expirationOptions = [
  {value: 'none', content: 'Без ограничения'},
  {value: '1', content: '1 день'},
  {value: '7', content: '7 дней'},
  {value: '30', content: '30 дней'},
  {value: 'custom', content: 'До указанной даты'},
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

function expirationDate(mode: string, custom: string): string | null {
  if (mode === 'none') return null;
  if (mode === 'custom') return custom ? new Date(custom).toISOString() : null;
  const result = new Date();
  result.setDate(result.getDate() + Number(mode));
  return result.toISOString();
}

export function OperationInstructionPage() {
  const {operationId = ''} = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useOperationInstructionQuery(operationId);
  const assetsQuery = useQuery({
    queryKey: operationInstructionKeys.assets(operationId),
    queryFn: () => listOperationInstructionAssets(operationId),
    enabled: Boolean(operationId),
  });
  const linksQuery = useQuery({
    queryKey: operationInstructionKeys.links(operationId),
    queryFn: () => listOperationInstructionPublicLinks(operationId),
    enabled: Boolean(operationId),
  });
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [savedSignature, setSavedSignature] = useState('');
  const [renderedHtml, setRenderedHtml] = useState('');
  const [editorTab, setEditorTab] = useState('editor');
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [expiration, setExpiration] = useState('none');
  const [customExpiration, setCustomExpiration] = useState('');
  const [newLink, setNewLink] = useState<PublicLink>();
  const [historyVersion, setHistoryVersion] = useState<InstructionVersion>();
  const [previewImage, setPreviewImage] = useState('');
  const initializedId = useRef('');
  const fileInput = useRef<HTMLInputElement>(null);
  const signature = JSON.stringify({title, content});

  useEffect(() => {
    if (!query.data || initializedId.current === operationId) return;
    const source = query.data.draft ?? query.data.published;
    const nextTitle = source?.title ?? `Инструкция: ${query.data.operation_name}`;
    const nextContent = source?.content ?? '';
    setTitle(nextTitle);
    setContent(nextContent);
    setSavedSignature(JSON.stringify({title: nextTitle, content: nextContent}));
    setRenderedHtml(source?.rendered_html ?? '');
    initializedId.current = operationId;
  }, [operationId, query.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveOperationInstructionDraft(operationId, {
        title,
        content,
        expected_revision: query.data?.draft?.revision ?? null,
      }),
    onMutate: () => setSaveState('saving'),
    onSuccess: async (version) => {
      setSavedSignature(JSON.stringify({title: version.title, content: version.content}));
      setRenderedHtml(version.rendered_html);
      setSaveState('saved');
      await queryClient.invalidateQueries({
        queryKey: operationInstructionKeys.detail(operationId),
      });
    },
    onError: () => setSaveState('error'),
  });

  useEffect(() => {
    if (!initializedId.current || signature === savedSignature || saveMutation.isPending) {
      return undefined;
    }
    setSaveState('dirty');
    const timer = window.setTimeout(() => saveMutation.mutate(), 900);
    return () => window.clearTimeout(timer);
  }, [saveMutation, savedSignature, signature]);

  const publishMutation = useMutation({
    mutationFn: () => publishOperationInstruction(operationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: operationInstructionKeys.detail(operationId)}),
        queryClient.invalidateQueries({queryKey: operationInstructionKeys.links(operationId)}),
      ]);
    },
  });
  const assetMutation = useMutation({
    mutationFn: async (file: File) =>
      uploadOperationInstructionAsset(operationId, {
        filename: file.name,
        content_type: file.type,
        content_base64: await fileToBase64(file),
      }),
    onSuccess: async (asset) => {
      const markdown = `\n![${asset.filename}](${asset.url})\n`;
      setContent((current) => `${current.replace(/\s*$/, '')}${markdown}`);
      await queryClient.invalidateQueries({queryKey: operationInstructionKeys.assets(operationId)});
    },
  });
  const deleteAssetMutation = useMutation({
    mutationFn: (asset: InstructionAsset) =>
      deleteOperationInstructionAsset(operationId, asset.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: operationInstructionKeys.assets(operationId)});
    },
  });
  const linkMutation = useMutation({
    mutationFn: () =>
      createOperationInstructionPublicLink(operationId, {
        expires_at: expirationDate(expiration, customExpiration),
        revoke_existing: false,
      }),
    onSuccess: async (link) => {
      setNewLink(link);
      await queryClient.invalidateQueries({queryKey: operationInstructionKeys.links(operationId)});
    },
  });
  const revokeMutation = useMutation({
    mutationFn: (linkId: string) => revokeOperationInstructionPublicLink(operationId, linkId),
    onSuccess: async (_link, linkId) => {
      if (newLink?.id === linkId) setNewLink(undefined);
      await queryClient.invalidateQueries({queryKey: operationInstructionKeys.links(operationId)});
    },
  });
  const historyMutation = useMutation({
    mutationFn: (versionId: string) =>
      getOperationInstructionVersion(operationId, versionId),
    onSuccess: setHistoryVersion,
  });

  const handleFiles = (files: FileList | File[]) => {
    const image = Array.from(files).find((file) => file.type.startsWith('image/'));
    if (image) assetMutation.mutate(image);
  };
  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) handleFiles(event.target.files);
    event.target.value = '';
  };
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith('image/'),
    );
    if (images.length) {
      event.preventDefault();
      handleFiles(images);
    }
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    handleFiles(event.dataTransfer.files);
  };

  const saveView = useMemo(() => {
    if (saveState === 'saving') return {text: 'Сохранение…', theme: 'info' as const};
    if (saveState === 'error') return {text: 'Ошибка сохранения', theme: 'danger' as const};
    if (saveState === 'dirty') return {text: 'Есть изменения', theme: 'warning' as const};
    return {text: 'Черновик сохранён', theme: 'success' as const};
  }, [saveState]);
  const error = query.error ?? saveMutation.error ?? publishMutation.error ?? assetMutation.error ?? linkMutation.error ?? revokeMutation.error;

  if (query.isPending) {
    return <main className={styles.page}><Skeleton className={styles.pageSkeleton} /></main>;
  }
  if (query.isError || !query.data) {
    return (
      <main className={styles.page}>
        <Alert theme="danger" title="Инструкция не открыта" message={getErrorMessage(query.error)} />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Button view="flat" onClick={() => navigate(routes.operations)}>← Операции</Button>
          <Text as="h1" variant="display-1">{query.data.operation_name}</Text>
          <Text color="secondary">Техническая инструкция по выполнению операции</Text>
        </div>
        <div className={styles.headerActions}>
          <Label theme={saveView.theme}>{saveView.text}</Label>
          <Button
            view="outlined"
            loading={saveMutation.isPending}
            disabled={signature === savedSignature || !title.trim()}
            onClick={() => saveMutation.mutate()}
          >
            Сохранить
          </Button>
          <Button
            view="action"
            loading={publishMutation.isPending}
            disabled={!query.data.draft || signature !== savedSignature || !content.trim()}
            onClick={() => publishMutation.mutate()}
          >
            Опубликовать
          </Button>
        </div>
      </header>

      {error ? <Alert theme="danger" message={getErrorMessage(error)} /> : null}

      <div className={styles.layout}>
        <Card view="outlined" className={styles.editorCard}>
          <TextInput label="Название документа" value={title} onUpdate={setTitle} size="l" />
          <TabList value={editorTab} onUpdate={setEditorTab}>
            <Tab value="editor">Markdown</Tab>
            <Tab value="preview">Предпросмотр</Tab>
          </TabList>
          {editorTab === 'editor' ? (
            <div
              className={styles.dropZone}
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
            >
              <div className={styles.editorToolbar}>
                <Button view="outlined" loading={assetMutation.isPending} onClick={() => fileInput.current?.click()}>
                  Загрузить изображение
                </Button>
                <Text color="secondary" variant="caption-2">
                  Можно перетащить файл или вставить изображение из буфера
                </Text>
              </div>
              <input ref={fileInput} className={styles.fileInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={onFileChange} />
              <TextArea
                value={content}
                onUpdate={setContent}
                minRows={24}
                maxRows={40}
                placeholder="# Порядок работы\n\n1. Подготовьте инструмент…"
                controlProps={{onPaste, 'aria-label': 'Markdown инструкции'}}
              />
            </div>
          ) : renderedHtml ? (
            <article
              className={styles.markdown}
              onClick={(event) => {
                const image = (event.target as Element).closest('img');
                if (image) setPreviewImage(image.getAttribute('src') ?? '');
              }}
              // HTML is produced by the backend renderer with raw HTML disabled.
              dangerouslySetInnerHTML={{__html: renderedHtml}}
            />
          ) : (
            <Text color="secondary">Сохраните черновик, чтобы увидеть безопасный предпросмотр.</Text>
          )}
        </Card>

        <aside className={styles.sidebar}>
          <Card view="outlined" className={styles.panel}>
            <Text as="h2" variant="header-2">Экспорт</Text>
            <div className={styles.inlineActions}>
              {exportFormats.map((format) => (
                <Button key={format} view="outlined" onClick={() => window.open(operationInstructionExportUrl(operationId, format), '_blank')}>
                  .{format}
                </Button>
              ))}
            </div>
          </Card>

          <Card view="outlined" className={styles.panel}>
            <Text as="h2" variant="header-2">Изображения</Text>
            {(assetsQuery.data ?? []).length ? (
              <div className={styles.assets}>
                {assetsQuery.data?.map((asset) => (
                  <div className={styles.asset} key={asset.id}>
                    <button type="button" onClick={() => setPreviewImage(asset.url)}>
                      <img src={asset.url} alt={asset.filename} />
                    </button>
                    <Text variant="caption-2" ellipsis>{asset.filename}</Text>
                    <Button view="flat-danger" size="s" onClick={() => deleteAssetMutation.mutate(asset)}>Удалить</Button>
                  </div>
                ))}
              </div>
            ) : <Text color="secondary">Изображений пока нет.</Text>}
          </Card>

          <Card view="outlined" className={styles.panel}>
            <Text as="h2" variant="header-2">Публичная ссылка</Text>
            <Select options={expirationOptions} value={[expiration]} onUpdate={(values) => setExpiration(values[0] ?? 'none')} width="max" />
            {expiration === 'custom' ? (
              <input
                className={styles.dateInput}
                type="datetime-local"
                value={customExpiration}
                aria-label="Срок действия публичной ссылки"
                onChange={(event) => setCustomExpiration(event.target.value)}
              />
            ) : null}
            <Button view="action" loading={linkMutation.isPending} disabled={!query.data.published} onClick={() => linkMutation.mutate()}>
              Создать ссылку
            </Button>
            {newLink?.public_url ? (
              <div className={styles.newLink}>
                <img src={publicInstructionQrUrl(newLink.public_url.split('/').at(-1) ?? '')} alt="QR-код публичной инструкции" />
                <TextInput value={newLink.public_url} readOnly />
                <Button view="outlined" onClick={() => navigator.clipboard.writeText(newLink.public_url ?? '')}>Скопировать</Button>
              </div>
            ) : null}
            {(linksQuery.data ?? []).map((link) => (
              <div className={styles.linkRow} key={link.id}>
                <div>
                  <Label theme={link.active ? 'success' : 'normal'}>{link.active ? 'Активна' : 'Отключена'}</Label>
                  <Text variant="caption-2" color="secondary">{formatDateTime(link.created_at)}</Text>
                </div>
                {link.active ? <Button view="flat-danger" size="s" onClick={() => revokeMutation.mutate(link.id)}>Отключить</Button> : null}
              </div>
            ))}
          </Card>

          <Card view="outlined" className={styles.panel}>
            <Text as="h2" variant="header-2">История версий</Text>
            {query.data.versions.map((version) => (
              <button className={styles.version} type="button" key={version.id} onClick={() => historyMutation.mutate(version.id)}>
                <span>v{version.version_number} · {version.title}</span>
                <Label theme={version.status === 'published' ? 'success' : version.status === 'draft' ? 'info' : 'normal'}>{version.status}</Label>
              </button>
            ))}
          </Card>
        </aside>
      </div>

      <Dialog open={Boolean(historyVersion)} onClose={() => setHistoryVersion(undefined)} maxWidth="l" fullWidth>
        <Dialog.Header caption={historyVersion ? `Версия ${historyVersion.version_number}: ${historyVersion.title}` : ''} />
        <Dialog.Body>
          {historyVersion ? <article className={styles.markdown} dangerouslySetInnerHTML={{__html: historyVersion.rendered_html}} /> : null}
        </Dialog.Body>
        <Dialog.Footer textButtonCancel="Закрыть" onClickButtonCancel={() => setHistoryVersion(undefined)} />
      </Dialog>
      <Dialog open={Boolean(previewImage)} onClose={() => setPreviewImage('')} maxWidth="l" fullWidth>
        <Dialog.Header caption="Изображение инструкции" />
        <Dialog.Body>{previewImage ? <img className={styles.largeImage} src={previewImage} alt="Изображение инструкции" /> : null}</Dialog.Body>
        <Dialog.Footer textButtonCancel="Закрыть" onClickButtonCancel={() => setPreviewImage('')} />
      </Dialog>
    </main>
  );
}
