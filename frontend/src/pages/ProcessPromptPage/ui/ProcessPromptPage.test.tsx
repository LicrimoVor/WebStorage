import {screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Route, Routes} from 'react-router-dom';
import {describe, expect, it, vi} from 'vitest';

import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {PROCESS_LLM_PROMPT} from '../model/processLlmPrompt';
import {ProcessPromptPage} from './ProcessPromptPage';

describe('ProcessPromptPage', () => {
  it('contains the import contract and copies the complete Markdown prompt', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    renderWithProviders(
      <Routes>
        <Route path="/processes/prompt" element={<ProcessPromptPage />} />
      </Routes>,
      '/processes/prompt',
    );

    const prompt = screen.getByLabelText('Markdown-промпт для LLM');
    expect(prompt).toHaveValue(PROCESS_LLM_PROMPT);
    expect(PROCESS_LLM_PROMPT).toContain('"schemaVersion": 1');
    expect(PROCESS_LLM_PROMPT).toContain('manufactured_item');
    expect(PROCESS_LLM_PROMPT).toContain('Не придумывай UUID');
    expect(PROCESS_LLM_PROMPT).toContain('изображений и чертежей');

    await user.click(screen.getByRole('button', {name: 'Скопировать промпт'}));

    expect(writeText).toHaveBeenCalledWith(PROCESS_LLM_PROMPT);
    expect(screen.getByText('Скопировано')).toBeInTheDocument();
  });
});
