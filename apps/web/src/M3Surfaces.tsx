import {
  getActiveDemands,
  getAssemblyCars,
  getAssemblyParts,
  getClaimCostSnapshot,
  getPlayerGarageCars,
  getTestTrackCars,
  planAssemblyPush,
  type AssemblyNodeId,
  type CarId,
  type GameState,
  type ModelId,
  type PartId,
  type UpgradeSpaceId,
} from '@kanban/rules';
import './m3.css';

function modelLabel(model: ModelId): string {
  return `Model ${Number(model.split(':')[1]) + 1}`;
}

function partTypeLabel(partType: string): string {
  return `Type ${Number(partType.split(':')[1]) + 1}`;
}

function carAtNode(state: GameState, nodeId: AssemblyNodeId): CarId | null {
  const area = `assembly-node:${nodeId}`;
  const match = Object.entries(state.board.cars)
    .filter(([, location]) => location?.kind === 'BOARD' && location.area === area)
    .map(([id]) => id as CarId)
    .sort((a, b) => a.localeCompare(b))[0];
  return match ?? null;
}

function upgradeSpaceOccupant(state: GameState, upgradeSpaceId: UpgradeSpaceId): PartId | null {
  const match = Object.entries(state.board.parts)
    .filter(([, location]) => location?.kind === 'BOARD' && location.area === upgradeSpaceId)
    .map(([id]) => id as PartId)
    .sort((a, b) => a.localeCompare(b))[0];
  return match ?? null;
}

function garageBenefitLabel(state: GameState, slot: number): string {
  const benefit = state.content.garageBenefits?.[slot];
  if (!benefit || benefit.kind === 'NONE') return 'No benefit';
  return `${benefit.kind.replaceAll('_', ' ')} +${benefit.amount}`;
}

function assemblyPreview(state: GameState, model: ModelId): string {
  const plan = planAssemblyPush(state, model, []);
  if (!plan.ok) return `Preview blocked · ${plan.reason.replaceAll('_', ' ')}`;
  if (plan.moves.length === 0) return 'Preview · no car movement';
  return `Preview · ${plan.moves
    .map((move) => `${move.carId} ${move.reason.replaceAll('_', ' ').toLowerCase()}`)
    .join(' → ')}`;
}

export function AssemblyOperatingSurface({ state }: { readonly state: GameState }) {
  return (
    <section className="m3-surface assembly-operating" aria-label="Assembly operating surface">
      <header className="m3-heading">
        <div>
          <span className="m3-kicker">B · Production flow</span>
          <h2>Assembly Line · Operating Surface</h2>
        </div>
        <span className="m3-readout">5 model lanes</span>
      </header>

      <div className="assembly-model-grid">
        {state.content.models.map((model) => {
          const graph = state.content.assemblyGraph.models[model];
          const cars = getAssemblyCars(state, model);
          const parts = getAssemblyParts(state, model);
          const nodes = graph ? Object.values(graph.nodes).filter((node) => node !== undefined) : [];

          return (
            <article className="assembly-model-lane" data-assembly-model={model} key={model}>
              <header>
                <div>
                  <strong>{modelLabel(model)}</strong>
                  <span>{model}</span>
                </div>
                <b>{parts.length}/{graph?.assemblySlots ?? 0} parts</b>
              </header>

              <div className="assembly-node-track" aria-label={`${modelLabel(model)} car flow`}>
                {nodes.map((node, index) => {
                  const car = carAtNode(state, node.id);
                  return (
                    <div className="assembly-node" data-node-kind={node.kind} key={node.id}>
                      <span>{index + 1}</span>
                      <strong>{node.kind}</strong>
                      <small>{car ?? 'empty'}</small>
                    </div>
                  );
                })}
              </div>

              <div className="assembly-part-rack" aria-label={`${modelLabel(model)} installed parts`}>
                {parts.length === 0 ? (
                  <span className="m3-empty">No parts installed</span>
                ) : (
                  parts.map((partId) => {
                    const type = state.content.parts[partId]?.type;
                    return (
                      <span className="assembly-part" key={partId}>
                        {type ? partTypeLabel(type) : 'Unknown'} · {partId}
                      </span>
                    );
                  })
                )}
              </div>

              <p className="assembly-preview" data-preview-kind="car-push">
                {assemblyPreview(state, model)}
              </p>
              <span className="assembly-car-count">Tracked cars: {cars.length}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TestTrack({ state }: { readonly state: GameState }) {
  const cars = getTestTrackCars(state);
  const costs = getClaimCostSnapshot(state);
  const capacity = state.content.testingRules.testTrackCapacity;

  return (
    <section className="testing-panel test-track-panel" aria-labelledby="test-track-title">
      <header>
        <div>
          <span className="m3-kicker">Vehicle queue</span>
          <h3 id="test-track-title">Test Track</h3>
        </div>
        <strong>{cars.length}/{capacity}</strong>
      </header>
      <div className="test-track-slots">
        {Array.from({ length: capacity }, (_, slot) => {
          const carId = cars[slot];
          const model = carId ? state.content.cars[carId]?.model : undefined;
          return (
            <div className="track-slot" data-track-slot={slot} key={slot}>
              <span>#{slot + 1}</span>
              <strong>{carId ?? 'empty'}</strong>
              <small>{model ? modelLabel(model) : 'Open position'}</small>
              <b>{carId ? `${costs[carId] ?? '—'} Shift claim` : '—'}</b>
            </div>
          );
        })}
      </div>
      <div className="pace-car-readout">
        <span>Pace Car</span>
        <strong>{state.board.paceCarPosition}</strong>
        <small>Next Meeting threshold {state.board.nextMeetingThreshold}</small>
      </div>
    </section>
  );
}

function DemandStatus({ state }: { readonly state: GameState }) {
  const demands = getActiveDemands(state);
  return (
    <section className="testing-panel demand-panel" aria-labelledby="demand-status-title">
      <header>
        <div>
          <span className="m3-kicker">Assembly pull</span>
          <h3 id="demand-status-title">Demand status</h3>
        </div>
        <strong>{demands.length} active</strong>
      </header>
      <div className="demand-grid">
        {demands.map((demand) => {
          const definition = state.content.demands[demand.demandId];
          return (
            <article className="demand-chip" key={demand.demandId}>
              <span>{demand.demandId}</span>
              <strong>{definition ? modelLabel(definition.model) : 'Unknown model'}</strong>
              <small>Red seats {demand.redSeatsRemaining}</small>
            </article>
          );
        })}
      </div>
      <p className="m3-footnote">Deck {state.board.demandDeck.length} · discard {state.board.demandDiscard.length}</p>
    </section>
  );
}

function PlayerGarages({ state }: { readonly state: GameState }) {
  return (
    <section className="testing-panel garage-panel" aria-labelledby="player-garages-title">
      <header>
        <div>
          <span className="m3-kicker">Ownership</span>
          <h3 id="player-garages-title">Player garages</h3>
        </div>
      </header>
      <div className="garage-grid">
        {state.players.map((player) => {
          const cars = getPlayerGarageCars(state, player.id);
          return (
            <article className="garage-strip" data-garage-player={player.id} key={player.id}>
              <strong>{player.id === 'player:0' ? 'You' : player.id}</strong>
              <div>
                {Array.from({ length: player.garageCapacity }, (_, slot) => {
                  const carId = cars.find((candidate) => {
                    const location = state.board.cars[candidate];
                    return location?.kind === 'PLAYER' && location.area === 'garage' && location.slot === slot;
                  });
                  return (
                    <span className="garage-slot" data-garage-slot={slot} key={slot}>
                      <b>{carId ?? 'open'}</b>
                      <small>{garageBenefitLabel(state, slot)}</small>
                    </span>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function InnovationStatus({ state }: { readonly state: GameState }) {
  const spaceIds = Object.keys(state.content.upgradeSpaces) as UpgradeSpaceId[];
  return (
    <section className="testing-panel innovation-panel" aria-labelledby="innovation-values-title">
      <header>
        <div>
          <span className="m3-kicker">Upgrade control</span>
          <h3 id="innovation-values-title">Innovation · Part Values</h3>
        </div>
        <strong>Max {state.content.testingRules.maxPartValue}</strong>
      </header>

      <div className="part-value-grid">
        {state.content.partTypes.map((type) => (
          <div className="part-value" data-part-value={type} key={type}>
            <span>{partTypeLabel(type)}</span>
            <strong>{state.board.partValues[type]}</strong>
            <small>{state.board.doubleUpgradedPartTypes[type] ? `reserved · ${state.board.doubleUpgradedPartTypes[type]}` : 'available'}</small>
          </div>
        ))}
      </div>

      <div className="upgrade-space-grid" aria-label="Innovation upgrade spaces">
        {spaceIds.map((id) => {
          const definition = state.content.upgradeSpaces[id];
          const occupant = upgradeSpaceOccupant(state, id);
          return (
            <div className="upgrade-space" data-upgrade-space={id} key={id}>
              <strong>{id}</strong>
              <span>{definition?.partType ? partTypeLabel(definition.partType) : 'Any part'}</span>
              <small>{occupant ?? 'open'}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function TestingInnovationSurface({ state }: { readonly state: GameState }) {
  return (
    <section className="m3-surface testing-operating" aria-label="Testing and Innovation operating surface">
      <header className="m3-heading">
        <div>
          <span className="m3-kicker">A · Quality &amp; innovation</span>
          <h2>Testing &amp; Innovation · Operating Surface</h2>
        </div>
        <span className="m3-readout">Pace {state.board.paceCarPosition}</span>
      </header>

      <div className="testing-grid">
        <TestTrack state={state} />
        <DemandStatus state={state} />
        <PlayerGarages state={state} />
        <InnovationStatus state={state} />
      </div>

      <output
        className="motion-fallback-status"
        data-motion-fallback="explicit"
        aria-live="polite"
      >
        Movement previews always include text status; reduced-motion mode skips causal transitions without hiding results.
      </output>
    </section>
  );
}
