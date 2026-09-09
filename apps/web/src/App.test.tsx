import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';

describe('workstation alley development UI', () => {
  it('renders the factory departments and verified workstation Shift values', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('Kanban: Automotive Revolution');
    expect(markup).toContain('Testing &amp; Innovation');
    expect(markup).toContain('Assembly Line');
    expect(markup).toContain('Logistics');
    expect(markup).toContain('Design');
    expect(markup).toContain('Administration');
    expect(markup).toContain('Sandra');
    expect(markup).toContain('1 Shift');
    expect(markup).toContain('2 Shifts');
    expect(markup).toContain('3 Shifts');
  });

  it('exposes phase, active actor and engine-command workstation controls', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('Phase');
    expect(markup).toContain('Active actor');
    expect(markup).toContain('SETUP');
    expect(markup).toContain('Start game');
    expect(markup).toContain('data-command-type="SELECT_WORKSTATION"');
    expect(markup).toContain('data-workstation="A_LEFT"');
    expect(markup).toContain('data-workstation="E_RIGHT"');
  });

  it('renders the Design, Logistics and Recycling operating surfaces with explicit development-content provenance', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('Design Studio');
    expect(markup).toContain('Logistics Floor');
    expect(markup).toContain('Recycling Bay');
    expect(markup).toContain('Synthetic development content');
    expect(markup).toContain('Blueprints');
    expect(markup).toContain('Parts');
    expect(markup).toContain('Kanban Orders');
    expect(markup).toContain('aria-live="polite"');
  });
});
