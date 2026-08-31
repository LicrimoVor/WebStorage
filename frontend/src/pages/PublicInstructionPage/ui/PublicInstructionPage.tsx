import {CircleQuestion} from '@gravity-ui/icons';
import {Button, Label, PlaceholderContainer, Skeleton, Text} from '@gravity-ui/uikit';
import {useParams} from 'react-router-dom';

import {
  publicInstructionQrUrl,
  usePublicOperationInstructionQuery,
} from '@/entities/OperationInstruction';
import {formatDateTime, usePageMetadata} from '@/shared/lib';

import styles from './PublicInstructionPage.module.scss';

export function PublicInstructionPage() {
  const {token = ''} = useParams();
  const query = usePublicOperationInstructionQuery(token);
  usePageMetadata(
    query.data?.operation_name ?? 'Производственная инструкция',
    query.data?.title ?? 'Опубликованная производственная инструкция.',
  );

  if (query.isPending) {
    return (
      <main className={styles.page}>
        <Skeleton className={styles.skeleton} />
      </main>
    );
  }
  if (query.isError || !query.data) {
    return (
      <main className={styles.page}>
        <PlaceholderContainer
          image={<CircleQuestion width={100} height={100} />}
          title="Инструкция недоступна"
          description="Ссылка отключена, истекла или инструкция ещё не опубликована."
        />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Text color="secondary" variant="subheader-1">
            Производственная инструкция
          </Text>
          <Text as="h1" variant="display-2">
            {query.data.operation_name}
          </Text>
          <Text as="h2" variant="header-1">
            {query.data.title}
          </Text>
        </div>
        <div className={styles.meta}>
          <Label theme="success">v{query.data.version_number}</Label>
          <Text color="secondary">
            Опубликовано {formatDateTime(query.data.published_at)}
          </Text>
        </div>
      </header>

      <article
        className={styles.markdown}
        // HTML is produced by the backend renderer with raw HTML disabled.
        dangerouslySetInnerHTML={{__html: query.data.rendered_html}}
      />

      <footer className={styles.footer}>
        <div>
          <Text as="h2" variant="header-2">Открыть на другом устройстве</Text>
          <Text color="secondary">QR-код всегда ведёт на актуальную опубликованную версию.</Text>
        </div>
        <img src={publicInstructionQrUrl(token)} alt="QR-код инструкции" />
        <Button view="outlined" size="l" onClick={() => window.print()}>
          Распечатать
        </Button>
      </footer>
    </main>
  );
}
