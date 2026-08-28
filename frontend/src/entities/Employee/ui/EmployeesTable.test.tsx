import {screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {renderWithProviders} from '@/shared/lib/testing/renderWithProviders';

import {employeeFixture} from '../testing';
import {EmployeesTable} from './EmployeesTable';

describe('EmployeesTable', () => {
  it('renders employee status and payroll placeholders', () => {
    renderWithProviders(
      <EmployeesTable
        items={[employeeFixture]}
        renderActions={() => <button type="button">Действие</button>}
      />,
    );
    expect(screen.getByText('Иванов Иван Иванович')).toBeInTheDocument();
    expect(screen.getByText('Активен')).toBeInTheDocument();
    expect(screen.getAllByText('0 ₽')).toHaveLength(3);
    expect(screen.getByText('Сварочный участок')).toBeInTheDocument();
  });
});
