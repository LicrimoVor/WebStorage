import {screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type * as AnalyticsExports from '@/entities/Analytics';
import {useAnalyticsDashboardQuery} from '@/entities/Analytics';
import {analyticsDashboardFixture} from '@/entities/Analytics/testing';
import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {AnalyticsPage} from './AnalyticsPage';

vi.mock('@/entities/Analytics', async (importOriginal) => {
  const actual = await importOriginal<typeof AnalyticsExports>();
  return {...actual, useAnalyticsDashboardQuery: vi.fn()};
});

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.mocked(useAnalyticsDashboardQuery).mockReturnValue({
      data: analyticsDashboardFixture,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAnalyticsDashboardQuery>);
  });

  it('shows period controls and all analytics sections', () => {
    renderWithProviders(<AnalyticsPage />, '/analytics?period=month');
    expect(screen.getByRole('heading', {name: 'Аналитика'})).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Производство'})).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Продажи'})).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Склад'})).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Персонал'})).toBeInTheDocument();
    expect(screen.getByText('Готовое изделие')).toBeInTheDocument();
    expect(screen.getByText('Анна Смирнова')).toBeInTheDocument();
    expect(screen.getAllByText(/12.*500/).length).toBeGreaterThan(0);
  });
});
