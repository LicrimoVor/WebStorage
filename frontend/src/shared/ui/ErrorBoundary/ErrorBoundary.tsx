import {Button, Text} from '@gravity-ui/uikit';
import {Component, type PropsWithChildren} from 'react';

import styles from './ErrorBoundary.module.scss';

export class ErrorBoundary extends Component<PropsWithChildren, {hasError: boolean}> {
  state = {hasError: false};

  static getDerivedStateFromError() {
    return {hasError: true};
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className={styles.root}>
          <div role="alert">
            <Text as="h1" variant="header-2">Не удалось открыть страницу</Text>
            <Text as="p">Обновите страницу. Несохранённые изменения могут быть потеряны.</Text>
            <Button view="action" onClick={() => window.location.reload()}>
              Обновить страницу
            </Button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
