import {Button} from '@gravity-ui/uikit';
import {useEffect, useRef} from 'react';
import {Link, NavLink, useParams} from 'react-router-dom';
import {chapters} from '@/shared/lib/help/chapters';
import {usePageMetadata} from '@/shared/lib';
import styles from './HelpPage.module.scss';

export function HelpPage() {
  const {chapterId = 'start'} = useParams();
  const index = Math.max(0, chapters.findIndex((chapter) => chapter.id === chapterId));
  const chapter = chapters[index];
  usePageMetadata(`${chapter.title} · Инструкция`, chapter.purpose);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {heading.current?.focus({preventScroll: true}); window.scrollTo(0, 0);}, [chapterId]);
  return <main className={styles.page}>
    <header><h1>Инструкция пользователя</h1><p>Порядок работы, заполнение форм и разбор ошибок.</p></header>
    <div className={styles.layout}>
      <nav className={styles.chapters} aria-label="Главы инструкции">
        {chapters.map((item, i) => <NavLink key={item.id} to={`/help/${item.id}`} aria-current={item.id === chapter.id ? 'page' : undefined}>{i + 1}. {item.title}</NavLink>)}
      </nav>
      <article className={styles.article}>
        <h2 ref={heading} tabIndex={-1}>{chapter.title}</h2>
        <p>{chapter.purpose}</p><h3>Когда пользоваться</h3><p>{chapter.when}</p>
        {chapter.image && <figure><a href={`/help/screenshots/${chapter.image}`} target="_blank" rel="noreferrer" aria-label={`Увеличить скриншот: ${chapter.title}`}><img src={`/help/screenshots/${chapter.image}`} alt={`Интерфейс раздела «${chapter.title}» на учебных данных`} width="1200" height="820" loading="lazy" /></a><figcaption>{chapter.imageCaption ?? `Раздел «${chapter.title}».`} Скриншот учебного примера; нажмите для увеличения.</figcaption></figure>}
        <h3>Порядок работы</h3><ol>{chapter.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        <h3>Что изменится после сохранения</h3><p>{chapter.result}</p>
        <aside className={styles.tips}><h3>Ошибки и нюансы</h3><ul>{chapter.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul></aside>
        <footer className={styles.footer}>
          {index > 0 && <Button component={Link} to={`/help/${chapters[index - 1].id}`}>← Предыдущая глава</Button>}
          <span>{index + 1} / {chapters.length}</span>
          {index < chapters.length - 1 && <Button component={Link} to={`/help/${chapters[index + 1].id}`}>Следующая глава →</Button>}
        </footer>
      </article>
    </div>
  </main>;
}
