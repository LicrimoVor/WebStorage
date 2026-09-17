import { Lock } from "@gravity-ui/icons";
import { Alert, Button, Card, Icon, Text, TextInput } from "@gravity-ui/uikit";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { login, type AuthSession } from "@/entities/Auth";
import { ApiError, getErrorMessage } from "@/shared/api";
import { usePageMetadata } from "@/shared/lib";

import styles from "./LoginPage.module.scss";

interface LoginPageProps {
  onAuthenticated: (session: AuthSession) => void;
}

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  usePageMetadata(
    "Вход",
    "Вход сотрудников в систему управления складом и производством.",
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (session) => onAuthenticated(session),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) return;
    mutation.mutate({ username: username.trim(), password });
  };
  const errorMessage =
    mutation.error instanceof ApiError && mutation.error.status === 401
      ? "Неверный логин или пароль."
      : mutation.error
        ? getErrorMessage(mutation.error)
        : undefined;

  return (
    <main className={styles.root}>
      <Card view="raised" className={styles.card}>
        <div className={styles.logo} aria-hidden="true">
          <Icon data={Lock} size={28} />
        </div>
        <div className={styles.heading}>
          <Text as="h1" variant="display-1">
            Вход в Веб-склад
          </Text>
        </div>
        <form className={styles.form} onSubmit={submit}>
          {errorMessage ? (
            <Alert theme="danger" message={errorMessage} />
          ) : null}
          <TextInput
            label="Логин"
            value={username}
            onUpdate={setUsername}
            autoComplete="username"
            controlProps={{
              "aria-label": "Логин",
            }}
            autoFocus
            size="xl"
          />
          <TextInput
            type="password"
            label="Пароль"
            value={password}
            onUpdate={setPassword}
            autoComplete="current-password"
            controlProps={{
              "aria-label": "Пароль",
            }}
            size="xl"
          />
          <Button
            type="submit"
            view="action"
            size="xl"
            width="max"
            loading={mutation.isPending}
            disabled={!username.trim() || !password}
          >
            Войти
          </Button>
        </form>
      </Card>
    </main>
  );
}
