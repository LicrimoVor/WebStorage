import {render, screen} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import {FitNodeText} from './FitNodeText';

it('shrinks overflowing text and restores font size after a shorter label is set', () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(60);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(100);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.textContent === 'Short' ? 20 : Math.ceil(Number.parseFloat(this.style.fontSize) / 10) * 30;
  });
  const {rerender} = render(<div><FitNodeText maxFontSize={24}>Long label</FitNodeText></div>);
  expect(screen.getByText('Long label')).toHaveStyle({fontSize: '20px'});
  rerender(<div><FitNodeText maxFontSize={24}>Short</FitNodeText></div>);
  expect(screen.getByText('Short')).toHaveStyle({fontSize: '24px'});
  vi.restoreAllMocks();
});
