import {useEffect} from 'react';

const APP_NAME = 'Веб-склад';

function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
}

export function usePageMetadata(title: string, description: string) {
  useEffect(() => {
    const fullTitle = `${title} — ${APP_NAME}`;
    document.title = fullTitle;
    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[name="robots"]', 'name', 'robots', 'noindex, nofollow, noarchive');
    setMeta('meta[name="googlebot"]', 'name', 'googlebot', 'noindex, nofollow, noarchive');
    setMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
  }, [description, title]);
}
