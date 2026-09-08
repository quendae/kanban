import { createShellGame, getLegalCommands } from '@kanban/rules';

const state = createShellGame({ seed: 'development', playerCount: 4 });

export function App() {
  const legalCommands = getLegalCommands(state, 'player:0');

  return (
    <main className="boot-shell">
      <section className="boot-card" aria-labelledby="app-title">
        <p className="eyebrow">Digital adaptation bootstrap</p>
        <h1 id="app-title">Kanban: Automotive Revolution</h1>
        <p className="intro">Deterministic Original 2014 rules kernel is connected.</p>

        <dl className="boot-state">
          <div>
            <dt>Ruleset</dt>
            <dd>{state.ruleset}</dd>
          </div>
          <div>
            <dt>Players</dt>
            <dd>{state.playerCount}</dd>
          </div>
          <div>
            <dt>Phase</dt>
            <dd>{state.phase}</dd>
          </div>
          <div>
            <dt>Legal commands</dt>
            <dd>
              {legalCommands.length > 0
                ? legalCommands.map((command) => command.type).join(', ')
                : 'None'}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
