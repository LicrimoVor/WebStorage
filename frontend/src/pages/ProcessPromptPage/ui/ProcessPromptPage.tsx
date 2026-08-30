import {Button, Card, Label, Text} from '@gravity-ui/uikit';
import {useState} from 'react';
import {useNavigate} from 'react-router-dom';

import {routes} from '@/shared/routes';

import {PROCESS_LLM_PROMPT} from '../model/processLlmPrompt';
import styles from './ProcessPromptPage.module.scss';

function downloadPrompt() {
  const url = URL.createObjectURL(
    new Blob([PROCESS_LLM_PROMPT], {type: 'text/markdown;charset=utf-8'}),
  );
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = 'webstorage-technological-process-prompt.md';
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ProcessPromptPage() {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(PROCESS_LLM_PROMPT);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Button view="flat" onClick={() => navigate(routes.processes)}>
            ← Техпроцессы
          </Button>
          <Text as="h1" variant="display-1">
            Промпт для генерации техпроцесса
          </Text>
          <Text color="secondary">
            Передайте этот Markdown вместе с описанием, изображениями, чертежами
            или таблицами. LLM должна вернуть JSON, который можно вставить в
            «Импорт JSON».
          </Text>
        </div>
        <div className={styles.actions}>
          {copied ? <Label theme="success">Скопировано</Label> : null}
          <Button view="outlined" size="l" onClick={downloadPrompt}>
            Скачать .md
          </Button>
          <Button view="action" size="l" onClick={() => void copyPrompt()}>
            Скопировать промпт
          </Button>
        </div>
      </header>

      <Card view="outlined" className={styles.card}>
        <div className={styles.cardHeading}>
          <div>
            <Text as="h2" variant="header-2">
              webstorage-technological-process-prompt.md
            </Text>
            <Text color="secondary" variant="caption-2">
              Готовый системный промпт · формат Markdown
            </Text>
          </div>
          <Text color="secondary" variant="caption-2">
            {PROCESS_LLM_PROMPT.length.toLocaleString('ru-RU')} символов
          </Text>
        </div>
        <textarea
          className={styles.prompt}
          value={PROCESS_LLM_PROMPT}
          readOnly
          spellCheck={false}
          aria-label="Markdown-промпт для LLM"
        />
      </Card>
    </main>
  );
}
