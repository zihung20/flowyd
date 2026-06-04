import { Link, useParams, Navigate } from 'react-router-dom';
import { SiteNav } from '../components/SiteNav';
import { SingleRunner } from '../runner/SingleRunner';
import { purchaseOrderWorkflow } from '../workflows/purchase-order';
import { predepartureWorkflow } from '../workflows/predeparture';
import { incidentWorkflow } from '../workflows/incident';
import { releasePipelineWorkflow } from '../workflows/release-pipeline';

const EXAMPLES = [
  {
    id: 'purchase-order',
    label: 'Purchase Order',
    tags: ['linear', 'branching'],
    desc: 'Linear approval with approve / reject terminal split',
  },
  {
    id: 'predeparture',
    label: 'Pre-Departure',
    tags: ['fork', 'join', 'parallel'],
    desc: '3 parallel inspection branches that must all complete before sign-off',
  },
  {
    id: 'incident',
    label: 'IT Incident',
    tags: ['context', 'fork/join', 'wait', 'guard.and'],
    desc: 'Parallel investigation tracks, vendor WaitState, context-aware guards, three terminal states',
  },
  {
    id: 'release-pipeline',
    label: 'Release Pipeline',
    tags: ['50 states', 'context', '8× fork/join', 'wait'],
    desc: '50-state multi-environment release: 8 parallel phases, WaitState observation, Guard.and CTO gate',
  },
] as const;

type ExampleId = (typeof EXAMPLES)[number]['id'];

function makePoInstance() {
  return purchaseOrderWorkflow.createInstance(`po-${Date.now()}`);
}

function makePdInstance() {
  return predepartureWorkflow.createInstance(`pd-${Date.now()}`);
}

function makeReleasePipelineInstance() {
  const inst = releasePipelineWorkflow.createInstance(`rel-${Date.now()}`, {
    version: '2.4.0',
    releaseType: 'minor',
    isEmergency: false,
    teamId: 'platform-eng',
  });
  // All director / lead guards auto-approve in the demo
  for (const name of [
    'qa-lead',
    'engineering-director',
    'security-director',
    'product-director',
    'cto',
  ]) {
    inst.injectGuard(name, () => true);
  }
  return inst;
}

function makeIncidentInstance() {
  const inst = incidentWorkflow.createInstance(`inc-${Date.now()}`, {
    severity: 'P2',
    isDataBreach: false,
    affectedSystem: 'payments-api',
  });
  inst.injectGuard('incident-manager', () => true);
  return inst;
}

const VALID_IDS = new Set<string>(EXAMPLES.map((e) => e.id));

export default function ExamplesPage() {
  const { id } = useParams<{ id: string }>();

  const exId = (id && VALID_IDS.has(id) ? id : 'purchase-order') as ExampleId;

  if (id && !VALID_IDS.has(id)) {
    return <Navigate to="/examples/purchase-order" replace />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 font-sans">
      <SiteNav />

      {/* Example tab bar */}
      <nav className="flex shrink-0 items-stretch gap-0 border-b border-slate-700 bg-slate-900 px-2">
        {EXAMPLES.map((ex) => (
          <Link
            key={ex.id}
            to={`/examples/${ex.id}`}
            className={[
              'flex flex-col items-start border-b-2 px-4 py-2 text-left transition-colors',
              exId === ex.id
                ? 'border-blue-400 bg-slate-800 text-white'
                : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200',
            ].join(' ')}
          >
            <span className="text-sm leading-tight font-semibold">{ex.label}</span>
            <span className="mt-0.5 flex gap-1">
              {ex.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-slate-700 px-1 py-px text-[10px] leading-none text-slate-300"
                >
                  {t}
                </span>
              ))}
            </span>
          </Link>
        ))}

        <div className="ml-auto flex items-center px-4">
          <span className="hidden max-w-xs text-xs text-slate-500 lg:block">
            {EXAMPLES.find((e) => e.id === exId)?.desc}
          </span>
        </div>
      </nav>

      <div className="min-h-0 flex-1">
        {exId === 'purchase-order' && (
          <SingleRunner
            key="po"
            title="Purchase Order Approval"
            subtitle="Linear workflow with approve / reject branching"
            definition={purchaseOrderWorkflow.getDefinition()}
            makeInstance={makePoInstance}
          />
        )}
        {exId === 'predeparture' && (
          <SingleRunner
            key="pd"
            title="Engineer Pre-Departure Checklist"
            subtitle="Fork → 3 parallel inspections → Join → sign-off"
            definition={predepartureWorkflow.getDefinition()}
            makeInstance={makePdInstance}
          />
        )}
        {exId === 'incident' && (
          <SingleRunner
            key="inc"
            title="IT Incident Response"
            subtitle="Inline payload guards + injected management sign-off guard"
            definition={incidentWorkflow.getDefinition()}
            makeInstance={makeIncidentInstance}
          />
        )}
        {exId === 'release-pipeline' && (
          <SingleRunner
            key="rel"
            title="Production Release Pipeline"
            subtitle="50 states · 8 parallel phases · WaitState observation · Guard.and CTO gate"
            definition={releasePipelineWorkflow.getDefinition()}
            makeInstance={makeReleasePipelineInstance}
          />
        )}
      </div>
    </div>
  );
}
