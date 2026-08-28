import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import process from 'node:process';

const backendDirectory = resolve(import.meta.dirname, '../../backend');
const virtualenvPython = resolve(
  backendDirectory,
  process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
);
const python = existsSync(virtualenvPython) ? virtualenvPython : 'python';
const result = spawnSync(python, ['-m', 'scripts.export_openapi'], {
  cwd: backendDirectory,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
