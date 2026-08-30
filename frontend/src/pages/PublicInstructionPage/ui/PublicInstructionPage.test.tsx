import {screen} from '@testing-library/react';
import {Route, Routes} from 'react-router-dom';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {usePublicOperationInstructionQuery} from '@/entities/OperationInstruction';
import type * as InstructionExports from '@/entities/OperationInstruction';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {PublicInstructionPage} from './PublicInstructionPage';

vi.mock('@/entities/OperationInstruction', async (importOriginal) => {
  const actual = await importOriginal<typeof InstructionExports>();
  return {...actual, usePublicOperationInstructionQuery: vi.fn()};
});

describe('PublicInstructionPage', () => {
  beforeEach(() => {
    vi.mocked(usePublicOperationInstructionQuery).mockReturnValue({
      data: {
        operation_id: '5d34095b-d0d5-4dc9-8335-9a16567ca58d',
        operation_name: 'Сверление',
        title: 'Безопасная работа на станке',
        content: '# Порядок работы',
        rendered_html:
          '<h1>Порядок работы</h1><p>Надеть защитные очки.</p>',
        version_number: 3,
        published_at: '2026-08-29T10:00:00Z',
      },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof usePublicOperationInstructionQuery>);
  });

  it('shows only the published instruction, version and its QR code', () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/public/instructions/:token"
          element={<PublicInstructionPage />}
        />
      </Routes>,
      '/public/instructions/secure-token',
    );

    expect(screen.getByRole('heading', {name: 'Сверление'})).toBeInTheDocument();
    expect(screen.getByText('Надеть защитные очки.')).toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByAltText('QR-код инструкции')).toHaveAttribute(
      'src',
      expect.stringContaining('/public/instructions/secure-token/qr.svg'),
    );
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
