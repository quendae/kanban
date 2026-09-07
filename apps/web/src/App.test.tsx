import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';

describe('App bootstrap integration', () => {
  it('renders the rules-engine smoke state', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('KANBAN_AR_2014');
    expect(markup).toContain('4');
    expect(markup).toContain('SETUP');
    expect(markup).toContain('START_GAME');
  });
});
