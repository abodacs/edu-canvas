import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Moon,
  RotateCcw,
  Sparkles,
  Sun,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: LandingPage })

type Language = 'en' | 'ar'
type RoleView = 'teacher' | 'student'
type Phase = 'shape' | 'match' | 'adapt'

const shaderVertexSource = `
  attribute vec2 a_position;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const shaderFragmentSource = `
  precision highp float;

  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec2 u_pointer;
  uniform float u_dark;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 point = uv * 2.0 - 1.0;
    point.x *= u_resolution.x / u_resolution.y;

    float time = u_time * 0.08;
    float grain = noise(point * 2.8 + vec2(time, -time * 0.65));
    float drift = sin((point.x * 1.6 + point.y * 0.8) * 3.0 + grain * 2.4 + time * 4.0);
    float distanceFromPointer = distance(point, vec2(u_pointer.x * 1.15, -u_pointer.y * 0.9));
    float touch = smoothstep(0.85, 0.0, distanceFromPointer);
    float ring = smoothstep(0.035, 0.0, abs(distance(point, vec2(-0.14, 0.08)) - 0.44));

    vec3 paper = mix(
      vec3(0.90, 0.82, 0.69),
      vec3(0.13, 0.12, 0.10),
      u_dark
    );
    vec3 ink = mix(
      vec3(0.30, 0.16, 0.10),
      vec3(0.75, 0.48, 0.32),
      u_dark
    );
    vec3 paprika = mix(
      vec3(0.75, 0.24, 0.12),
      vec3(0.86, 0.45, 0.26),
      u_dark
    );

    vec3 color = paper;
    color = mix(color, ink, 0.08 + 0.06 * (drift * 0.5 + 0.5));
    color += paprika * (touch * 0.10 + ring * 0.16);
    color += vec3(0.08, 0.055, 0.025) * grain * 0.12;

    gl_FragColor = vec4(color, 0.62);
  }
`

const copy = {
  en: {
    languageLabel: 'العربية',
    brandTagline: 'learning, made legible',
    nav: {
      idea: 'The idea',
      lesson: 'Try the lesson',
      trust: 'Trust, built in',
    },
    heroEyebrow: 'Edu-Canvas · a learning instrument',
    heroTitleStart: 'Make the moment of',
    heroTitleAccent: 'understanding',
    heroTitleEnd: 'visible.',
    heroDescription:
      'Turn a teacher’s plain-language idea into a focused, standards-aligned matching lesson — then give a learner the exact next step that helps the idea settle.',
    heroPrimary: 'Try the matching moment',
    heroSecondary: 'Follow the loop',
    heroMeta: ['Grades 3–6', 'Equivalent fractions', 'English · العربية'],
    stageLabel: 'A lesson in motion',
    stageDescription: 'Different names. One portion of a whole.',
    stageSource: 'one-half',
    stageTarget: 'same portion',
    stageDistractor: 'not the same portion',
    lessonKicker: '01 · The student moment',
    lessonTitle: 'One idea. Three names. One pattern.',
    lessonDescription:
      'Start with the source, then choose every fraction that represents the same portion of the whole. This preview is ungraded — it is here to make the “aha” visible.',
    lessonInstruction: 'Which fractions still mean one-half?',
    lessonSourceLabel: 'Source',
    lessonSourceFraction: '1/2',
    lessonSourceWords: 'one-half',
    lessonTargetLabel: 'Choose the matching fractions',
    lessonHint: 'A hint: imagine each fraction as part of a shaded whole.',
    lessonHintAction: 'Open hint',
    lessonRevealAction: 'Show the connection',
    lessonResetAction: 'Try another path',
    lessonEmptyStatus: 'Choose at least one name to begin.',
    lessonSelectedStatus: 'selected — keep looking for the same portion.',
    lessonRevealedStatus:
      'There it is: the names change, but the portion stays the same.',
    lessonRevealTitle: 'The denominator changes the cut, not the amount.',
    lessonRevealDescription:
      'Two fourths, three sixths, and four eighths each cover the same half. The next activity can now build from that relationship.',
    lessonPreviewNote: 'No score is saved in this preview.',
    journeyKicker: '02 · The loop',
    journeyTitle: 'A short path from “make something” to “I see it.”',
    journeyDescription:
      'The system carries the busywork. People keep the judgment, the context, and the care.',
    phases: [
      {
        id: 'shape' as const,
        number: '01',
        label: 'Teacher shapes',
        title: 'A prompt becomes a lesson worth teaching.',
        body: 'A teacher starts with intent — in English or Arabic — and reviews a small set of safe, standards-aligned variants before anything reaches a learner.',
        note: 'Teacher-approved before publish',
      },
      {
        id: 'match' as const,
        number: '02',
        label: 'Student matches',
        title: 'The learner gets one clear next step.',
        body: 'The activity keeps attention on the idea: source-first selection, a quiet board, immediate feedback, and a connection reveal that explains why the answer works.',
        note: 'Semantic, keyboard-ready, touch-friendly',
      },
      {
        id: 'adapt' as const,
        number: '03',
        label: 'The path adapts',
        title: 'The next activity has a reason.',
        body: 'A deterministic mastery signal points toward the next approved activity — forward when the idea is ready, back to a prerequisite when it is not.',
        note: 'Explainable, teacher-visible, reversible',
      },
    ],
    roleKicker: '03 · The human boundary',
    roleTitle:
      'AI can accelerate the draft. It cannot take the teacher’s seat.',
    roleDescription:
      'Edu-Canvas is designed around a simple division of labor: people decide what matters; the system makes the route through it clearer.',
    teacherTab: 'For teachers',
    studentTab: 'For students',
    teacherQuote:
      '“I can start with the way I already think about the lesson, then spend my time on the choice that matters: is this right for my class?”',
    teacherPoint: 'A reviewable pack, not a black-box publish button.',
    studentQuote:
      '“I know what to do next — and when I get it, I can see why the names belong together.”',
    studentPoint:
      'One focused activity, with a next step that earns its place.',
    trustKicker: '04 · Trust, built in',
    trustTitle:
      'The magic is allowed to be visible. The sensitive parts stay behind the curtain.',
    trustItems: [
      [
        'Teacher approval',
        'Every generated variant is reviewed before a learner sees it.',
      ],
      [
        'Server-side scoring',
        'The answer key and mastery decision never live in the browser.',
      ],
      [
        'Synthetic by default',
        'The demo uses safe fixtures; real student data stays gated until the right approvals are in place.',
      ],
    ],
    footerLine: 'A calm interface for the hard work of learning.',
    footerAction: 'Open the lesson moment',
    themeToDark: 'Use dark theme',
    themeToLight: 'Use light theme',
  },
  ar: {
    languageLabel: 'English',
    brandTagline: 'التعلّم بوضوح',
    nav: {
      idea: 'الفكرة',
      lesson: 'جرّب الدرس',
      trust: 'الثقة أولاً',
    },
    heroEyebrow: 'Edu-Canvas · أداة للتعلّم',
    heroTitleStart: 'لنجعل لحظة',
    heroTitleAccent: 'الفهم',
    heroTitleEnd: 'مرئية.',
    heroDescription:
      'حوّل فكرة المعلّم كما يعبّر عنها بلغته الطبيعية إلى نشاط مطابقة واضح ومتوافق مع المعايير، ثم امنح المتعلّم الخطوة التالية التي تساعده على ترسيخ الفكرة.',
    heroPrimary: 'جرّب لحظة المطابقة',
    heroSecondary: 'تتبّع المسار',
    heroMeta: ['الصفوف 3–6', 'الكسور المتكافئة', 'العربية · English'],
    stageLabel: 'درس يتحرّك',
    stageDescription: 'أسماء مختلفة. جزء واحد من الكل.',
    stageSource: 'النصف',
    stageTarget: 'الجزء نفسه',
    stageDistractor: 'جزء مختلف',
    lessonKicker: '01 · لحظة المتعلّم',
    lessonTitle: 'فكرة واحدة. ثلاثة أسماء. نمط واحد.',
    lessonDescription:
      'ابدأ بالمصدر، ثم اختر كل كسر يمثّل الجزء نفسه من الكل. هذه معاينة بلا درجات — هدفها أن تجعل لحظة الفهم مرئية.',
    lessonInstruction: 'أيّ الكسور تمثّل النصف؟',
    lessonSourceLabel: 'المصدر',
    lessonSourceFraction: '1/2',
    lessonSourceWords: 'النصف',
    lessonTargetLabel: 'اختر الكسور المطابقة',
    lessonHint: 'تلميح: تخيّل كل كسر جزءاً مظلّلاً من شكل كامل.',
    lessonHintAction: 'افتح التلميح',
    lessonRevealAction: 'أظهر العلاقة',
    lessonResetAction: 'ابدأ من جديد',
    lessonEmptyStatus: 'اختر اسماً واحداً على الأقل للبدء.',
    lessonSelectedStatus: 'تم الاختيار — واصل البحث عن الجزء نفسه.',
    lessonRevealedStatus: 'ها هي العلاقة: تتغيّر الأسماء، لكن الجزء يبقى نفسه.',
    lessonRevealTitle: 'المقام يغيّر عدد الأجزاء، لا الكمية التي نمثّلها.',
    lessonRevealDescription:
      'جزآن من أربعة، وثلاثة أجزاء من ستة، وأربعة أجزاء من ثمانية تمثّل النصف نفسه. يمكن للنشاط التالي أن يبني على هذه العلاقة.',
    lessonPreviewNote: 'لا تُحفظ أي درجة في هذه المعاينة.',
    journeyKicker: '02 · المسار',
    journeyTitle: 'طريق قصير من «اصنع شيئاً» إلى «الآن أراه».',
    journeyDescription:
      'يتولى النظام الأعمال المتكررة. ويحتفظ البشر بالقرار والسياق والعناية.',
    phases: [
      {
        id: 'shape' as const,
        number: '01',
        label: 'المعلّم يصوغ',
        title: 'يتحوّل الطلب إلى درس جاهز للتدريس.',
        body: 'يبدأ المعلّم بفكرته — بالعربية أو بالإنجليزية — ثم يراجع مجموعة صغيرة من البدائل الآمنة والمتوافقة مع المعايير قبل أن تصل إلى المتعلّم.',
        note: 'اعتماد المعلّم قبل النشر',
      },
      {
        id: 'match' as const,
        number: '02',
        label: 'المتعلّم يطابق',
        title: 'يحصل المتعلّم على خطوة واضحة واحدة.',
        body: 'يبقى النشاط مركزاً على الفكرة: اختيار المصدر أولاً، لوحة هادئة، استجابة فورية، وكشف للعلاقة يشرح لماذا تنجح الإجابة.',
        note: 'دلالي، ملائم للوحة المفاتيح، مناسب للمس',
      },
      {
        id: 'adapt' as const,
        number: '03',
        label: 'المسار يتكيّف',
        title: 'للنشاط التالي سبب واضح.',
        body: 'تشير إشارة إتقان واضحة إلى النشاط المعتمد التالي — إلى الأمام عندما تكون الفكرة جاهزة، أو إلى متطلب سابق عندما لا تكون كذلك.',
        note: 'قابل للتفسير، ظاهر للمعلّم، قابل للتراجع',
      },
    ],
    roleKicker: '03 · دور الإنسان',
    roleTitle:
      'يمكن للذكاء الاصطناعي تسريع المسودة. لكنه لا يأخذ مكان المعلّم.',
    roleDescription:
      'بُني Edu-Canvas على تقسيم بسيط للعمل: يقرر البشر ما المهم، ويجعل النظام الطريق إليه أوضح.',
    teacherTab: 'للمعلّمين',
    studentTab: 'للمتعلّمين',
    teacherQuote:
      '«أبدأ بالطريقة التي أفكر بها في الدرس، ثم أركّز وقتي على القرار المهم: هل هذا مناسب لصفّي؟»',
    teacherPoint: 'حزمة قابلة للمراجعة، لا زر نشر غامض.',
    studentQuote:
      '«أعرف ما الذي أفعله بعد ذلك — وعندما أجيب بشكل صحيح، أرى لماذا تنتمي الكسور معاً.»',
    studentPoint: 'نشاط واحد مركز، وخطوة تالية تستحق مكانها.',
    trustKicker: '04 · الثقة أولاً',
    trustTitle: 'يظهر السحر، وتبقى الأجزاء الحساسة خلف الستار.',
    trustItems: [
      ['اعتماد المعلّم', 'تُراجع كل صيغة مولّدة قبل أن يراها المتعلّم.'],
      [
        'التقييم على الخادم',
        'لا يخرج مفتاح الإجابة وقرار الإتقان من الخادم إلى المتصفح.',
      ],
      [
        'بيانات اصطناعية افتراضياً',
        'تستخدم المعاينة بيانات آمنة؛ ولا تُستخدم بيانات المتعلمين الحقيقية حتى تكتمل الموافقات المناسبة.',
      ],
    ],
    footerLine: 'واجهة هادئة للعمل الصعب الذي يتطلبه التعلّم.',
    footerAction: 'افتح لحظة الدرس',
    themeToDark: 'استخدم المظهر الداكن',
    themeToLight: 'استخدم المظهر الفاتح',
  },
} as const

const targetCards = [
  { id: 'two-four', fraction: '2/4', en: 'two-fourths', ar: 'جزآن من أربعة' },
  {
    id: 'three-six',
    fraction: '3/6',
    en: 'three-sixths',
    ar: 'ثلاثة أجزاء من ستة',
  },
  {
    id: 'four-eight',
    fraction: '4/8',
    en: 'four-eighths',
    ar: 'أربعة أجزاء من ثمانية',
  },
  { id: 'two-three', fraction: '2/3', en: 'two-thirds', ar: 'جزآن من ثلاثة' },
] as const

const phases: Phase[] = ['shape', 'match', 'adapt']

function LandingPage() {
  const [language, setLanguage] = useState<Language>('en')
  const [isDark, setIsDark] = useState(false)
  const [selectedTargets, setSelectedTargets] = useState<string[]>([])
  const [isRevealed, setIsRevealed] = useState(false)
  const [hintVisible, setHintVisible] = useState(false)
  const [activePhase, setActivePhase] = useState<Phase>('shape')
  const [roleView, setRoleView] = useState<RoleView>('teacher')
  const activeCopy = copy[language]

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  }, [language])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        'content',
        isDark ? 'oklch(0.19 0.028 55)' : 'oklch(0.965 0.022 78)',
      )
  }, [isDark])

  function toggleTarget(id: string) {
    setIsRevealed(false)
    setSelectedTargets((current) =>
      current.includes(id)
        ? current.filter((targetId) => targetId !== id)
        : [...current, id],
    )
  }

  function resetLesson() {
    setSelectedTargets([])
    setIsRevealed(false)
    setHintVisible(false)
  }

  const selectionStatus = isRevealed
    ? activeCopy.lessonRevealedStatus
    : selectedTargets.length > 0
      ? language === 'en'
        ? `${selectedTargets.length} ${selectedTargets.length === 1 ? 'name' : 'names'} selected — keep looking for the same portion.`
        : `تم اختيار ${selectedTargets.length === 1 ? 'كسر واحد' : selectedTargets.length === 2 ? 'كسرين' : `${selectedTargets.length} كسور`} — واصل البحث عن الجزء نفسه.`
      : activeCopy.lessonEmptyStatus

  return (
    <main className="experience" data-language={language} id="top">
      <a className="skip-link" href="#lesson">
        {language === 'en'
          ? 'Skip to the lesson moment'
          : 'انتقل إلى لحظة الدرس'}
      </a>
      <div className="page-progress" aria-hidden="true">
        <span />
      </div>

      <header className="masthead page-width">
        <a className="brand-lockup" href="#top" aria-label="Edu-Canvas home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" role="presentation">
              <path d="M8 11.5 20 6l12 5.5v17L20 34 8 28.5v-17Z" />
              <path d="m8 11.5 12 6 12-6M20 17.5V34" />
              <circle cx="20" cy="17.5" r="2.1" />
            </svg>
          </span>
          <span className="brand-copy">
            <span className="brand-name">Edu-Canvas</span>
            <span className="brand-tagline">{activeCopy.brandTagline}</span>
          </span>
        </a>

        <nav
          className="site-nav"
          aria-label={
            language === 'en' ? 'Primary navigation' : 'التنقّل الرئيسي'
          }
        >
          <a href="#idea">{activeCopy.nav.idea}</a>
          <a href="#lesson">{activeCopy.nav.lesson}</a>
          <a href="#trust">{activeCopy.nav.trust}</a>
        </nav>

        <div className="masthead-actions">
          <button
            className="language-switch"
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            aria-label={activeCopy.languageLabel}
          >
            <span aria-hidden="true">{language === 'en' ? 'ع' : 'EN'}</span>
            <span className="sr-only">{activeCopy.languageLabel}</span>
          </button>
          <button
            className="theme-switch"
            type="button"
            onClick={() => setIsDark((current) => !current)}
            aria-label={
              isDark ? activeCopy.themeToLight : activeCopy.themeToDark
            }
            aria-pressed={isDark}
          >
            {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </div>
      </header>

      <section
        className="hero page-width story-block"
        id="idea"
        aria-labelledby="hero-title"
      >
        <div className="hero-copy">
          <p className="eyebrow">{activeCopy.heroEyebrow}</p>
          <h1 id="hero-title">
            {activeCopy.heroTitleStart}{' '}
            <span className="hero-title-accent">
              {activeCopy.heroTitleAccent}
            </span>{' '}
            {activeCopy.heroTitleEnd}
          </h1>
          <p className="hero-description">{activeCopy.heroDescription}</p>
          <div className="hero-actions">
            <a className="button button--primary" href="#lesson">
              {activeCopy.heroPrimary}
              <ArrowDownRight aria-hidden="true" />
            </a>
            <a className="button button--quiet" href="#loop">
              {activeCopy.heroSecondary}
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
          <ul
            className="hero-meta"
            aria-label={language === 'en' ? 'Lesson details' : 'تفاصيل الدرس'}
          >
            {activeCopy.heroMeta.map((item) => (
              <li key={item}>
                <span className="meta-dot" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div
          className="hero-stage"
          role="img"
          aria-label={`${activeCopy.stageLabel}. ${activeCopy.stageDescription}`}
        >
          <InkField isDark={isDark} />
          <div className="stage-noise" aria-hidden="true" />
          <div className="stage-caption">
            <span>{activeCopy.stageLabel}</span>
            <span>01 / 04</span>
          </div>
          <div className="stage-diagram">
            <div
              className="stage-orbit stage-orbit--outer"
              aria-hidden="true"
            />
            <div
              className="stage-orbit stage-orbit--inner"
              aria-hidden="true"
            />
            <div className="stage-source">
              <span className="fraction fraction--large">1/2</span>
              <span>{activeCopy.stageSource}</span>
            </div>
            <svg
              className="stage-connections"
              viewBox="0 0 480 440"
              aria-hidden="true"
            >
              <path d="M226 219C287 170 315 125 354 96" />
              <path d="M226 219c84 5 125 22 168 42" />
              <path d="M226 219c54 61 88 98 140 125" />
            </svg>
            <div className="stage-target stage-target--one">
              <span className="fraction">2/4</span>
              <span>{activeCopy.stageTarget}</span>
            </div>
            <div className="stage-target stage-target--two">
              <span className="fraction">3/6</span>
              <span>{activeCopy.stageTarget}</span>
            </div>
            <div className="stage-target stage-target--three">
              <span className="fraction">4/8</span>
              <span>{activeCopy.stageTarget}</span>
            </div>
            <div className="stage-distractor">
              <span className="fraction">2/3</span>
              <span>{activeCopy.stageDistractor}</span>
            </div>
          </div>
          <p className="stage-description">{activeCopy.stageDescription}</p>
          <div className="stage-index" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>

      <section
        className="lesson-section page-width story-block"
        id="lesson"
        aria-labelledby="lesson-title"
      >
        <div className="section-lead">
          <p className="eyebrow">{activeCopy.lessonKicker}</p>
          <h2 id="lesson-title">{activeCopy.lessonTitle}</h2>
          <p>{activeCopy.lessonDescription}</p>
        </div>

        <div className="lesson-layout">
          <aside
            className="lesson-brief"
            aria-label={
              language === 'en' ? 'Lesson instructions' : 'تعليمات الدرس'
            }
          >
            <div className="lesson-brief__topline">
              <span className="step-count">01</span>
              <span>
                {language === 'en' ? 'Find the relationship' : 'اكتشف العلاقة'}
              </span>
            </div>
            <h3>{activeCopy.lessonInstruction}</h3>
            <div className="lesson-source-card">
              <span className="lesson-card-label">
                {activeCopy.lessonSourceLabel}
              </span>
              <span className="fraction fraction--hero">
                {activeCopy.lessonSourceFraction}
              </span>
              <span className="lesson-source-words">
                {activeCopy.lessonSourceWords}
              </span>
              <span className="source-slice" aria-hidden="true">
                <span />
              </span>
            </div>
            <div className="lesson-brief__footer">
              <button
                className="hint-button"
                type="button"
                onClick={() => setHintVisible((current) => !current)}
                aria-expanded={hintVisible}
              >
                <CircleHelp aria-hidden="true" />
                {activeCopy.lessonHintAction}
              </button>
              {hintVisible && (
                <p className="hint-copy">{activeCopy.lessonHint}</p>
              )}
              <span className="preview-note">
                {activeCopy.lessonPreviewNote}
              </span>
            </div>
          </aside>

          <div className={`lesson-board${isRevealed ? ' is-revealed' : ''}`}>
            <div className="lesson-board__header">
              <div>
                <span className="board-label">
                  {activeCopy.lessonTargetLabel}
                </span>
                <p className="board-status" aria-live="polite">
                  {selectionStatus}
                </p>
              </div>
              <span
                className="board-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={4}
                aria-valuenow={selectedTargets.length}
                aria-label={
                  language === 'en'
                    ? `${selectedTargets.length} of 4 fractions selected`
                    : `تم اختيار ${selectedTargets.length} من 4 كسور`
                }
              >
                <span
                  style={
                    {
                      '--selection-progress': selectedTargets.length / 4,
                    } as CSSProperties
                  }
                />
              </span>
            </div>
            <div className="target-grid">
              {targetCards.map((target) => {
                const isSelected = selectedTargets.includes(target.id)
                const isConnected = isRevealed && target.id !== 'two-three'
                const words = language === 'en' ? target.en : target.ar
                return (
                  <button
                    className={`target-card${isSelected ? ' is-selected' : ''}${isConnected ? ' is-connected' : ''}${target.id === 'two-three' ? ' is-distractor' : ''}`}
                    type="button"
                    key={target.id}
                    onClick={() => toggleTarget(target.id)}
                    aria-pressed={isSelected}
                    aria-label={`${target.fraction}, ${words}`}
                  >
                    <span className="target-card__topline">
                      <span className="target-card__number">
                        {target.id === 'two-three'
                          ? '04'
                          : target.id === 'two-four'
                            ? '01'
                            : target.id === 'three-six'
                              ? '02'
                              : '03'}
                      </span>
                      <span className="target-card__state" aria-hidden="true">
                        {isConnected || isSelected ? (
                          <Check />
                        ) : (
                          <ChevronRight />
                        )}
                      </span>
                    </span>
                    <span className="fraction fraction--target">
                      {target.fraction}
                    </span>
                    <span className="target-card__words">{words}</span>
                    <span className="target-card__measure" aria-hidden="true">
                      <span className="measure-fill" />
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="lesson-board__actions">
              <button
                className="button button--primary button--compact"
                type="button"
                onClick={() => setIsRevealed(true)}
                disabled={selectedTargets.length === 0 || isRevealed}
              >
                <Sparkles aria-hidden="true" />
                {activeCopy.lessonRevealAction}
              </button>
              <button
                className="button button--quiet button--compact"
                type="button"
                onClick={resetLesson}
              >
                <RotateCcw aria-hidden="true" />
                {activeCopy.lessonResetAction}
              </button>
            </div>
            {isRevealed && (
              <div className="connection-reveal" role="status">
                <div className="connection-reveal__diagram" aria-hidden="true">
                  <span className="reveal-node reveal-node--source">1/2</span>
                  <span className="reveal-line reveal-line--one" />
                  <span className="reveal-line reveal-line--two" />
                  <span className="reveal-line reveal-line--three" />
                  <span className="reveal-node reveal-node--one">2/4</span>
                  <span className="reveal-node reveal-node--two">3/6</span>
                  <span className="reveal-node reveal-node--three">4/8</span>
                </div>
                <div className="connection-reveal__copy">
                  <span className="eyebrow">
                    {language === 'en' ? 'The connection' : 'العلاقة'}
                  </span>
                  <h3>{activeCopy.lessonRevealTitle}</h3>
                  <p>{activeCopy.lessonRevealDescription}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section
        className="loop-section page-width story-block"
        id="loop"
        aria-labelledby="loop-title"
      >
        <div className="section-lead section-lead--wide">
          <p className="eyebrow">{activeCopy.journeyKicker}</p>
          <h2 id="loop-title">{activeCopy.journeyTitle}</h2>
          <p>{activeCopy.journeyDescription}</p>
        </div>
        <div className="phase-layout">
          <div
            className="phase-rail"
            role="group"
            aria-label={
              language === 'en' ? 'Lesson loop steps' : 'خطوات مسار الدرس'
            }
          >
            {phases.map((phase, index) => {
              const phaseCopy = activeCopy.phases[index]
              const isActive = activePhase === phase
              return (
                <button
                  key={phase}
                  className={`phase-tab${isActive ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setActivePhase(phase)}
                  aria-pressed={isActive}
                >
                  <span className="phase-tab__number">{phaseCopy.number}</span>
                  <span>{phaseCopy.label}</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              )
            })}
          </div>
          <div className="phase-panel" aria-live="polite">
            {(() => {
              const phaseIndex = phases.indexOf(activePhase)
              const phaseCopy = activeCopy.phases[phaseIndex]
              return (
                <>
                  <div className="phase-panel__stamp">
                    <span>{phaseCopy.number}</span>
                    <span>{activeCopy.journeyKicker.replace('02 · ', '')}</span>
                  </div>
                  <h3>{phaseCopy.title}</h3>
                  <p>{phaseCopy.body}</p>
                  <div className="phase-panel__note">
                    <span className="note-check">
                      <Check aria-hidden="true" />
                    </span>
                    {phaseCopy.note}
                  </div>
                  <div className="phase-panel__line" aria-hidden="true">
                    <span className="phase-panel__line-dot" />
                    <span className="phase-panel__line-stroke" />
                    <span className="phase-panel__line-dot" />
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      </section>

      <section
        className="roles-section page-width story-block"
        aria-labelledby="roles-title"
      >
        <div className="roles-heading">
          <div className="section-lead">
            <p className="eyebrow">{activeCopy.roleKicker}</p>
            <h2 id="roles-title">{activeCopy.roleTitle}</h2>
            <p>{activeCopy.roleDescription}</p>
          </div>
          <div
            className="role-switch"
            role="group"
            aria-label={
              language === 'en' ? 'Choose a perspective' : 'اختر منظوراً'
            }
          >
            <button
              type="button"
              onClick={() => setRoleView('teacher')}
              aria-pressed={roleView === 'teacher'}
            >
              {activeCopy.teacherTab}
            </button>
            <button
              type="button"
              onClick={() => setRoleView('student')}
              aria-pressed={roleView === 'student'}
            >
              {activeCopy.studentTab}
            </button>
          </div>
        </div>
        <div className="role-story" data-role={roleView}>
          <div className="role-story__index" aria-hidden="true">
            <span>0{roleView === 'teacher' ? '1' : '2'}</span>
            <span className="role-story__rule" />
            <span>{roleView === 'teacher' ? 'review' : 'reveal'}</span>
          </div>
          <blockquote>
            {roleView === 'teacher'
              ? activeCopy.teacherQuote
              : activeCopy.studentQuote}
          </blockquote>
          <p className="role-story__point">
            <Sparkles aria-hidden="true" />
            {roleView === 'teacher'
              ? activeCopy.teacherPoint
              : activeCopy.studentPoint}
          </p>
        </div>
      </section>

      <section
        className="trust-section page-width story-block"
        id="trust"
        aria-labelledby="trust-title"
      >
        <div className="trust-intro">
          <p className="eyebrow">{activeCopy.trustKicker}</p>
          <h2 id="trust-title">{activeCopy.trustTitle}</h2>
        </div>
        <ul className="trust-list">
          {activeCopy.trustItems.map(([title, description], index) => (
            <li key={title}>
              <span className="trust-number">0{index + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <footer className="site-footer page-width">
        <a className="brand-lockup" href="#top" aria-label="Edu-Canvas home">
          <span className="brand-mark brand-mark--small" aria-hidden="true">
            <svg viewBox="0 0 40 40" role="presentation">
              <path d="M8 11.5 20 6l12 5.5v17L20 34 8 28.5v-17Z" />
              <path d="m8 11.5 12 6 12-6M20 17.5V34" />
              <circle cx="20" cy="17.5" r="2.1" />
            </svg>
          </span>
          <span className="brand-copy">
            <span className="brand-name">Edu-Canvas</span>
            <span className="brand-tagline">{activeCopy.footerLine}</span>
          </span>
        </a>
        <a className="footer-action" href="#lesson">
          {activeCopy.footerAction}
          <ArrowUpRight aria-hidden="true" />
        </a>
      </footer>
    </main>
  )
}

function InkField({ isDark }: { isDark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const contextAttributes: WebGLContextAttributes = {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    }
    const webgl2 = canvas.getContext('webgl2', contextAttributes)
    const gl = webgl2 ?? canvas.getContext('webgl', contextAttributes)

    if (!gl) {
      canvas.dataset.renderer = 'css-fallback'
      return
    }

    const surface = canvas
    const renderer = gl
    const vertexShader = renderer.createShader(renderer.VERTEX_SHADER)
    const fragmentShader = renderer.createShader(renderer.FRAGMENT_SHADER)
    if (!vertexShader || !fragmentShader) return

    renderer.shaderSource(vertexShader, shaderVertexSource)
    renderer.shaderSource(fragmentShader, shaderFragmentSource)
    renderer.compileShader(vertexShader)
    renderer.compileShader(fragmentShader)

    if (
      !renderer.getShaderParameter(vertexShader, renderer.COMPILE_STATUS) ||
      !renderer.getShaderParameter(fragmentShader, renderer.COMPILE_STATUS)
    ) {
      surface.dataset.renderer = 'css-fallback'
      return
    }

    const program = renderer.createProgram()
    renderer.attachShader(program, vertexShader)
    renderer.attachShader(program, fragmentShader)
    renderer.linkProgram(program)

    if (!renderer.getProgramParameter(program, renderer.LINK_STATUS)) {
      surface.dataset.renderer = 'css-fallback'
      return
    }

    const buffer = renderer.createBuffer()
    const positionLocation = renderer.getAttribLocation(program, 'a_position')
    const timeLocation = renderer.getUniformLocation(program, 'u_time')
    const resolutionLocation = renderer.getUniformLocation(
      program,
      'u_resolution',
    )
    const pointerLocation = renderer.getUniformLocation(program, 'u_pointer')
    const darkLocation = renderer.getUniformLocation(program, 'u_dark')
    if (
      positionLocation < 0 ||
      !timeLocation ||
      !resolutionLocation ||
      !pointerLocation ||
      !darkLocation
    )
      return

    renderer.bindBuffer(renderer.ARRAY_BUFFER, buffer)
    renderer.bufferData(
      renderer.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      renderer.STATIC_DRAW,
    )
    renderer.useProgram(program)
    renderer.enableVertexAttribArray(positionLocation)
    renderer.vertexAttribPointer(
      positionLocation,
      2,
      renderer.FLOAT,
      false,
      0,
      0,
    )
    renderer.disable(renderer.DEPTH_TEST)
    renderer.enable(renderer.BLEND)
    renderer.blendFunc(renderer.SRC_ALPHA, renderer.ONE_MINUS_SRC_ALPHA)

    let width = 0
    let height = 0
    let frame = 0
    let isVisible = true
    const pointer = { x: 0, y: 0 }
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    function resize() {
      const rect = surface.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, Math.floor(rect.width * pixelRatio))
      height = Math.max(1, Math.floor(rect.height * pixelRatio))
      if (surface.width !== width || surface.height !== height) {
        surface.width = width
        surface.height = height
        renderer.viewport(0, 0, width, height)
      }
    }

    function render(time: number) {
      if (!isVisible) return
      renderer.clearColor(0, 0, 0, 0)
      renderer.clear(renderer.COLOR_BUFFER_BIT)
      renderer.uniform1f(timeLocation, time)
      renderer.uniform2f(resolutionLocation, width, height)
      renderer.uniform2f(pointerLocation, pointer.x, pointer.y)
      renderer.uniform1f(darkLocation, isDark ? 1 : 0)
      renderer.drawArrays(renderer.TRIANGLES, 0, 3)
      if (!reducedMotion) frame = requestAnimationFrame(render)
    }

    function handlePointerMove(event: PointerEvent) {
      const rect = surface.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1
    }

    const resizeObserver = new ResizeObserver(resize)
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting
      if (isVisible && !reducedMotion && !frame)
        frame = requestAnimationFrame(render)
    })
    resizeObserver.observe(surface)
    visibilityObserver.observe(surface)
    surface.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    })
    resize()
    render(0)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      visibilityObserver.disconnect()
      surface.removeEventListener('pointermove', handlePointerMove)
      renderer.deleteBuffer(buffer)
      renderer.deleteProgram(program)
      renderer.deleteShader(vertexShader)
      renderer.deleteShader(fragmentShader)
    }
  }, [isDark])

  return <canvas className="ink-field" ref={canvasRef} aria-hidden="true" />
}
