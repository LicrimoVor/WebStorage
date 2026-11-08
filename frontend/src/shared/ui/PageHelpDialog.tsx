import {Button, Dialog} from '@gravity-ui/uikit';
import {Link} from 'react-router-dom';
import {chapterForPath} from '@/shared/lib/help/chapters';

export default function PageHelpDialog({path, onClose}: {path: string; onClose: () => void}) {
  const chapter = chapterForPath(path);
  return <Dialog open onClose={onClose} size="m">
    <Dialog.Header caption={chapter.title} />
    <Dialog.Body><h3>Для чего</h3><p>{chapter.purpose}</p><h3>Когда пользоваться</h3><p>{chapter.when}</p>
      <h3>Как пользоваться</h3><ol>{chapter.steps.map((step) => <li key={step} style={{marginBlock: 8, lineHeight: 1.6}}>{step}</li>)}</ol>
      <p>{chapter.result}</p><Button component={Link} to={`/help/${chapter.id}`} onClick={onClose}>Открыть главу инструкции</Button>
    </Dialog.Body>
    <Dialog.Footer textButtonCancel="Понятно" onClickButtonCancel={onClose} />
  </Dialog>;
}
