import type { ReactElement } from "react";

/**
The landing artwork, ported from the approved mock
(.impeccable/mocks/screens/0-landing.html): a halftone-and-stipple dawn
landscape with a stoa, the place where scholé happened. Inline SVG only —
the CSP allows no remote image host — and every colour reads a --scene-*
token so the artwork shares one palette with the tokens layer.

The ids are namespaced `landing-*` because the closing scene's dusk gradient
reuses this component's dot patterns and stipple filter; both scenes are
always mounted on the page, so the references resolve.
*/

const HeroScene = (): ReactElement => {
  return (
    <svg
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMax slice"
      focusable="false"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="landing-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--scene-sky-hi)" />
          <stop offset="0.5" stopColor="var(--scene-sky-mid)" />
          <stop offset="0.78" stopColor="var(--scene-sky-lo)" />
          <stop offset="1" stopColor="var(--scene-sky-lo)" />
        </linearGradient>
        <linearGradient id="landing-dot-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="1" stopColor="white" stopOpacity="0.9" />
        </linearGradient>
        <mask id="landing-sky-mask">
          <rect
            x="0"
            y="320"
            width="1600"
            height="420"
            fill="url(#landing-dot-fade)"
          />
        </mask>
        <pattern
          id="landing-dots-clay"
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="3.5" cy="3.5" r="1.5" fill="var(--primary)" />
        </pattern>
        <pattern
          id="landing-dots-ink"
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="2.5" cy="2.5" r="1.1" fill="var(--foreground)" />
        </pattern>
        <pattern
          id="landing-dots-sun"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="3" cy="3" r="1.6" fill="var(--scene-sun)" />
        </pattern>
        <filter id="landing-stipple" x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.1"
            numOctaves="1"
            seed="7"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.12  0 0 0 0 0.11  0 0 0 0 0.1  -9 0 0 0 4.7"
          />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>

      <rect width="1600" height="900" fill="url(#landing-sky)" />
      <rect
        width="1600"
        height="900"
        fill="url(#landing-dots-clay)"
        mask="url(#landing-sky-mask)"
        opacity="0.55"
      />

      {/* Sun with halftone halo */}
      <circle
        cx="560"
        cy="610"
        r="210"
        fill="url(#landing-dots-sun)"
        opacity="0.9"
      />
      <circle cx="560" cy="610" r="120" fill="var(--scene-sun)" />

      {/* Far hills */}
      <path
        d="M0 640 C200 598 380 612 560 632 S900 588 1100 606 S1400 578 1600 598 V900 H0Z"
        fill="var(--scene-hill-far)"
      />
      <g fill="var(--scene-stone-deep)">
        <ellipse cx="760" cy="626" rx="14" ry="7" />
        <ellipse cx="792" cy="622" rx="11" ry="6" />
        <ellipse cx="820" cy="619" rx="13" ry="7" />
        <ellipse cx="300" cy="624" rx="12" ry="6" />
        <ellipse cx="330" cy="628" rx="10" ry="5" />
      </g>

      {/* Mid hills, with the plateau the stoa stands on */}
      <path
        id="landing-mid-hill"
        d="M0 708 C220 668 420 694 640 688 S960 650 1040 616 L1460 612 C1520 620 1560 632 1600 640 V900 H0Z"
        fill="var(--scene-hill-mid)"
      />
      <path
        d="M0 708 C220 668 420 694 640 688 S960 650 1040 616 L1460 612 C1520 620 1560 632 1600 640 V900 H0Z"
        fill="var(--foreground)"
        filter="url(#landing-stipple)"
        opacity="0.22"
      />

      {/* The stoa */}
      <g id="landing-stoa" transform="translate(90 0)">
        <rect
          x="1062"
          y="522"
          width="356"
          height="80"
          fill="var(--scene-stone-deep)"
        />
        <polygon
          points="1044,496 1240,462 1436,496"
          fill="var(--scene-stone)"
        />
        <polygon
          points="1044,496 1240,462 1240,468 1056,496"
          fill="var(--scene-stone-shade)"
        />
        <rect
          x="1050"
          y="494"
          width="380"
          height="12"
          fill="var(--scene-stone)"
        />
        <g fill="var(--scene-stone-shade)">
          <rect x="1070" y="496" width="5" height="10" />
          <rect x="1112" y="496" width="5" height="10" />
          <rect x="1154" y="496" width="5" height="10" />
          <rect x="1196" y="496" width="5" height="10" />
          <rect x="1238" y="496" width="5" height="10" />
          <rect x="1280" y="496" width="5" height="10" />
          <rect x="1322" y="496" width="5" height="10" />
          <rect x="1364" y="496" width="5" height="10" />
          <rect x="1406" y="496" width="5" height="10" />
        </g>
        <rect
          x="1056"
          y="506"
          width="368"
          height="16"
          fill="var(--scene-stone)"
        />
        <rect
          x="1056"
          y="518"
          width="368"
          height="4"
          fill="var(--scene-stone-shade)"
        />
        <g id="landing-column">
          <rect
            x="1066"
            y="522"
            width="22"
            height="6"
            fill="var(--scene-stone)"
          />
          <rect
            x="1069"
            y="528"
            width="16"
            height="72"
            fill="var(--scene-stone)"
          />
          <rect
            x="1080"
            y="528"
            width="5"
            height="72"
            fill="var(--scene-stone-shade)"
          />
        </g>
        <use href="#landing-column" x="42" />
        <use href="#landing-column" x="84" />
        <use href="#landing-column" x="126" />
        <use href="#landing-column" x="168" />
        <use href="#landing-column" x="210" />
        <use href="#landing-column" x="252" />
        <use href="#landing-column" x="294" />
        <use href="#landing-column" x="336" />
        <rect
          x="1048"
          y="600"
          width="384"
          height="10"
          fill="var(--scene-stone)"
        />
        <rect
          x="1038"
          y="610"
          width="404"
          height="8"
          fill="var(--scene-stone-shade)"
        />
      </g>
      <use href="#landing-stoa" filter="url(#landing-stipple)" opacity="0.18" />

      {/* Near hill */}
      <path
        d="M0 790 C260 736 520 764 780 772 S1220 748 1600 726 V900 H0Z"
        fill="var(--scene-hill-near)"
      />
      <path
        d="M0 790 C260 736 520 764 780 772 S1220 748 1600 726 V900 H0Z"
        fill="url(#landing-dots-ink)"
        opacity="0.28"
      />

      {/* Olive grove, foreground left */}
      <g id="landing-grove">
        <path
          d="M210 790 C214 760 200 742 212 716 M212 744 C224 734 232 728 240 714"
          stroke="var(--scene-bark)"
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
        <g fill="var(--scene-olive)">
          <ellipse cx="200" cy="700" rx="52" ry="30" />
          <ellipse cx="248" cy="690" rx="44" ry="28" />
          <ellipse cx="226" cy="668" rx="46" ry="26" />
        </g>
        <g fill="var(--scene-olive-hi)">
          <ellipse cx="214" cy="660" rx="18" ry="8" />
          <ellipse cx="256" cy="676" rx="14" ry="6" />
          <ellipse cx="184" cy="688" rx="12" ry="5" />
        </g>
        <path
          d="M410 772 C406 752 418 738 410 712"
          stroke="var(--scene-bark)"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
        <g fill="var(--scene-olive)">
          <ellipse cx="398" cy="702" rx="40" ry="24" />
          <ellipse cx="432" cy="694" rx="36" ry="22" />
          <ellipse cx="414" cy="676" rx="34" ry="20" />
        </g>
        <g fill="var(--scene-olive-hi)">
          <ellipse cx="408" cy="672" rx="13" ry="6" />
          <ellipse cx="440" cy="686" rx="10" ry="5" />
        </g>
        <path
          d="M80 800 C84 776 74 760 84 736"
          stroke="var(--scene-bark)"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
        <g fill="var(--scene-olive)">
          <ellipse cx="76" cy="726" rx="42" ry="24" />
          <ellipse cx="108" cy="716" rx="34" ry="22" />
        </g>
      </g>
      <use href="#landing-grove" filter="url(#landing-stipple)" opacity="0.3" />

      {/* Front ridge */}
      <path
        d="M0 850 C300 812 700 852 1000 836 S1400 818 1600 828 V900 H0Z"
        fill="var(--scene-hill-front)"
      />
      <path
        d="M0 850 C300 812 700 852 1000 836 S1400 818 1600 828 V900 H0Z"
        fill="url(#landing-dots-ink)"
        opacity="0.35"
      />
    </svg>
  );
};

/** The dusk echo of the hero scene behind the closing call to action. */
const ClosingScene = (): ReactElement => {
  return (
    <svg
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMax slice"
      focusable="false"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="landing-dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--scene-sky-mid)" />
          <stop offset="0.6" stopColor="var(--scene-sky-lo)" />
          <stop offset="1" stopColor="var(--scene-hill-far)" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#landing-dusk)" />
      <rect
        width="1600"
        height="900"
        fill="url(#landing-dots-clay)"
        mask="url(#landing-sky-mask)"
        opacity="0.45"
      />
      <g id="landing-dusk-land">
        <path
          d="M0 600 C260 560 520 580 800 590 S1300 560 1600 572 V900 H0Z"
          fill="var(--scene-hill-mid)"
        />
        {/* olive rows on the slope */}
        <g fill="var(--scene-olive)">
          <ellipse cx="180" cy="618" rx="34" ry="18" />
          <ellipse cx="300" cy="612" rx="30" ry="16" />
          <ellipse cx="420" cy="616" rx="34" ry="18" />
          <ellipse cx="1180" cy="604" rx="32" ry="17" />
          <ellipse cx="1300" cy="598" rx="28" ry="15" />
          <ellipse cx="1420" cy="602" rx="32" ry="17" />
        </g>
        <path
          d="M0 680 C300 640 640 676 960 664 S1400 640 1600 652 V900 H0Z"
          fill="var(--scene-hill-near)"
        />
        <path
          d="M0 680 C300 640 640 676 960 664 S1400 640 1600 652 V900 H0Z"
          fill="url(#landing-dots-ink)"
          opacity="0.3"
        />
        <path
          d="M0 740 C380 712 820 750 1200 730 S1500 720 1600 726 V900 H0Z"
          fill="var(--scene-hill-front)"
        />
      </g>
      <use
        href="#landing-dusk-land"
        filter="url(#landing-stipple)"
        opacity="0.22"
      />
    </svg>
  );
};

export { ClosingScene, HeroScene };
