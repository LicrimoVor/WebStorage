import {useLayoutEffect, useRef} from 'react';
import styles from './ProcessCanvas.module.scss';

export function FitNodeText({children, maxFontSize}: {children: string; maxFontSize: number}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fit = () => {
      if (!element.clientWidth || !element.parentElement?.clientHeight) return;
      element.style.fontSize = `${maxFontSize}px`;
      let size = maxFontSize;
      while (size > 8 && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1)) {
        element.style.fontSize = `${--size}px`;
      }
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    if (element.parentElement) observer.observe(element.parentElement);
    return () => observer.disconnect();
  }, [children, maxFontSize]);
  return <span ref={ref} className={styles.nodeLabel} title={children} style={{fontSize: maxFontSize}}>{children}</span>;
}
