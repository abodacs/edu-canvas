import type { ReactElement } from "react";

import { SyntheticDataMarker } from "@/components/ui/synthetic-data-marker";

/**
The Studio window that floats on the landing scene, ported from the approved
mock: one objective, four drafted variants, and the one authored moment —
each verdict lands in order, with variant C blocked before preview.

It is a static illustration of the seeded equivalent-fractions fixture
(mirrors only public fixture content, like the reveal it replaces), so the
check verdicts are hand-written copy, never server state.
*/

const StudioPreview = (): ReactElement => {
  return (
    <figure
      className="card lift studio"
      aria-label="Illustration of the Studio: one objective, four drafted variants and their checks"
    >
      <h2 className="sr-only">Studio illustration</h2>
      <div className="studio-bar">
        <span>
          <b>Studio</b>
          <span className="crumb"> · New lesson</span>
        </span>
        <SyntheticDataMarker as="span" className="pill">
          Illustration · synthetic data
        </SyntheticDataMarker>
      </div>
      <div className="objective">
        <div>
          <span className="label">Your objective</span>
          <q>
            Students explain why 2/4 and 1/2 name the same amount using fraction
            models.
          </q>
        </div>
        <div className="src">
          <span className="std-code">4.NF.A.1</span>
          <span>Grounded in Learning Commons</span>
        </div>
      </div>
      <ol className="variants">
        <li>
          <span className="kind">A · Worked example</span>
          <svg className="fig" viewBox="0 0 260 86" aria-hidden="true">
            <rect className="off" x="10" y="8" width="240" height="28" rx="4" />
            <rect className="on" x="10" y="8" width="120" height="28" rx="4" />
            <rect
              className="off"
              x="10"
              y="50"
              width="240"
              height="28"
              rx="4"
            />
            <rect className="on" x="10" y="50" width="120" height="28" rx="4" />
            <line className="cut" x1="70" y1="50" x2="70" y2="78" />
            <line className="cut" x1="190" y1="50" x2="190" y2="78" />
          </svg>
          <h3>Same bar, cut two ways</h3>
          <span className="verdict">
            <span className="pill checking">Checking…</span>
            <span className="pill" data-tone="ok">
              Ready to review
            </span>
          </span>
        </li>
        <li>
          <span className="kind">B · Guided activity</span>
          <svg className="fig" viewBox="0 0 260 86" aria-hidden="true">
            <line className="track" x1="14" y1="43" x2="246" y2="43" />
            <rect
              className="off"
              x="10"
              y="24"
              width="240"
              height="38"
              rx="4"
            />
            <rect className="on" x="10" y="24" width="120" height="38" rx="4" />
            <circle className="knob" cx="130" cy="43" r="10" />
          </svg>
          <h3>Slide to make an equal share</h3>
          <span className="verdict">
            <span className="pill checking">Checking…</span>
            <span className="pill" data-tone="warn">
              Ready · 1 warning
            </span>
          </span>
        </li>
        <li className="blocked">
          <span className="kind">C · Independent check</span>
          <svg className="fig" viewBox="0 0 260 86" aria-hidden="true">
            <rect className="off" x="10" y="8" width="240" height="28" rx="4" />
            <rect className="on" x="10" y="8" width="80" height="28" rx="4" />
            <rect
              className="off"
              x="10"
              y="50"
              width="240"
              height="28"
              rx="4"
            />
            <rect className="on" x="10" y="50" width="120" height="28" rx="4" />
          </svg>
          <h3>Answer key didn&rsquo;t match the diagram</h3>
          <span className="verdict">
            <span className="pill checking">Checking…</span>
            <span className="pill" data-tone="stop">
              Not shown to students
            </span>
          </span>
        </li>
        <li>
          <span className="kind">D · Matching</span>
          <svg className="fig" viewBox="0 0 260 86" aria-hidden="true">
            <rect className="off" x="10" y="10" width="70" height="28" rx="4" />
            <rect className="off" x="10" y="48" width="70" height="28" rx="4" />
            <rect
              className="off"
              x="180"
              y="10"
              width="70"
              height="28"
              rx="4"
            />
            <rect
              className="off"
              x="180"
              y="48"
              width="70"
              height="28"
              rx="4"
            />
            <line className="cut" x1="80" y1="24" x2="180" y2="62" />
            <line className="cut" x1="80" y1="62" x2="180" y2="24" />
          </svg>
          <h3>Pair each fraction with its twin</h3>
          <span className="verdict">
            <span className="pill checking">Checking…</span>
            <span className="pill" data-tone="ok">
              Ready to review
            </span>
          </span>
        </li>
      </ol>
      <div className="studio-foot">
        <span className="muted">
          3 ready to review · 1 warning to acknowledge · 1 blocked before you
          saw it
        </span>
        <span className="fake-btn" aria-hidden="true">
          Open review
        </span>
      </div>
    </figure>
  );
};

export { StudioPreview };
