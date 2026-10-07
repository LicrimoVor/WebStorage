interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>;
}
let registered = false;
let pending: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
export function registerInstallPrompt() {
  if (registered) return;
  registered = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pending = event as InstallPrompt;
    notify();
  });
  window.addEventListener('appinstalled', () => {pending = null; notify();});
}
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {listeners.delete(listener);};
}

export const getInstallPrompt = () => pending;
export function clearInstallPrompt() {pending = null; notify();}
