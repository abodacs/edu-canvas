import { cn } from "@/lib/utilities";
import { FractionDiagram } from "./fraction-diagram";
import { MathText } from "./math-text";
import type { ElementType, ReactNode } from "react";

import type { A2UIComponent } from "@/shared/a2ui-contract";
import type { A2UIRenderSurface } from "./renderer";

export interface SelectionState {
  source?: string;
  target?: string;
}

const renderLearningPath = (
  dataModel: A2UIRenderSurface["dataModel"],
  surfaceId: string
): ReactNode => {
  if (!dataModel || !("learningPath" in dataModel) || !dataModel.learningPath) {
    return null;
  }
  const { learningPath } = dataModel;

  const headingId = `a2ui-learning-path-heading-${surfaceId}`;
  const isArabic = dataModel.language === "ar";
  const copy = isArabic
    ? {
        eyebrow: "مسار التعلم",
        title: "لماذا يبدأ هذا الدرس من هنا؟",
        direction: "ترتيب المتطلبات",
        prerequisite: "متطلب سابق",
        target: "المفهوم المستهدف",
        rationale: "سبب هذا المسار",
        nextScreen: "سبب الشاشة التالية",
        draft: "المسودة",
        graph: "الرسم البياني",
        model: "النموذج",
        catalog: "الفهرس",
      }
    : {
        eyebrow: "Learning path",
        title: "Why this lesson starts here",
        direction: "Prerequisite order",
        prerequisite: "Prerequisite",
        target: "Target concept",
        rationale: "Why this path",
        nextScreen: "Next-screen rationale",
        draft: "Draft",
        graph: "Graph",
        model: "Model",
        catalog: "Catalog",
      };

  return (
    <section className="a2ui-learning-path" aria-labelledby={headingId}>
      <div className="a2ui-learning-path__header">
        <div>
          <p className="a2ui-text a2ui-text--label">{copy.eyebrow}</p>
          <h4 id={headingId} className="a2ui-learning-path__title">
            {copy.title}
          </h4>
        </div>
        <span className="a2ui-learning-path__direction">{copy.direction}</span>
      </div>

      <ol className="a2ui-learning-path__steps">
        {learningPath.steps.map((step, index) => {
          return (
            <li
              className={`a2ui-learning-path__step a2ui-learning-path__step--${step.role}`}
              key={step.nodeId}
            >
              <span className="a2ui-learning-path__number" aria-hidden="true">
                {index + 1}
              </span>
              <div className="a2ui-learning-path__step-copy">
                <span className="a2ui-learning-path__role">
                  {step.role === "prerequisite"
                    ? copy.prerequisite
                    : copy.target}
                </span>
                <strong>{step.label}</strong>
                <span>{step.screenPurpose}</span>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="a2ui-learning-path__notes">
        <div>
          <strong>{copy.rationale}</strong>
          <p>{learningPath.rationale}</p>
        </div>
        <div>
          <strong>{copy.nextScreen}</strong>
          <p>{learningPath.nextScreenRationale}</p>
        </div>
      </div>

      <dl className="a2ui-learning-path__pins">
        <div>
          <dt>{copy.draft}</dt>
          <dd>{learningPath.versionPins.draftId}</dd>
        </div>
        <div>
          <dt>{copy.graph}</dt>
          <dd>{learningPath.versionPins.graphVersion}</dd>
        </div>
        <div>
          <dt>{copy.model}</dt>
          <dd>{learningPath.versionPins.modelVersion}</dd>
        </div>
        <div>
          <dt>{copy.catalog}</dt>
          <dd>{learningPath.versionPins.catalogVersion}</dd>
        </div>
      </dl>
    </section>
  );
};

interface TextVariantSpec {
  readonly element: ElementType;
  readonly className: string;
}

const textVariants: Record<
  NonNullable<Extract<A2UIComponent, { component: "Text" }>["variant"]>,
  TextVariantSpec
> = {
  body: { element: "p", className: "a2ui-text" },
  heading: { element: "h4", className: "a2ui-text a2ui-text--heading" },
  subheading: { element: "h5", className: "a2ui-text a2ui-text--subheading" },
  label: { element: "p", className: "a2ui-text a2ui-text--label" },
  caption: { element: "span", className: "a2ui-text a2ui-text--caption" },
};

interface A2UIComponentRendererProperties {
  readonly surface: A2UIRenderSurface;
  readonly componentId: string;
  readonly surfaceId: string;
  readonly onAction: (
    surfaceId: string,
    action: string,
    itemId?: string
  ) => void;
  readonly selection?: SelectionState;
  readonly visited?: ReadonlySet<string>;
}

const MatchCard = ({
  component,
  surfaceId,
  onAction,
  selection,
}: Pick<
  A2UIComponentRendererProperties,
  "surfaceId" | "onAction" | "selection"
> & {
  readonly component: Extract<A2UIComponent, { component: "MatchCard" }>;
}): ReactNode => {
  const selectedItemId =
    component.group === "source" ? selection?.source : selection?.target;
  const isSelected = selectedItemId === component.itemId;
  return (
    <button
      className={cn("a2ui-match-card", `a2ui-match-card--${component.group}`, {
        "is-selected": isSelected,
      })}
      type="button"
      aria-pressed={isSelected}
      aria-label={`${component.label}. ${component.description ?? ""}`.trim()}
      onClick={() =>
        onAction(surfaceId, component.action.event.name, component.itemId)
      }
    >
      <span>{component.label}</span>
      <small>{component.group === "source" ? "Source" : "Candidate"}</small>
    </button>
  );
};

const emptyVisited: ReadonlySet<string> = new Set<string>();

export const A2UIComponentRenderer = ({
  surface,
  componentId,
  surfaceId,
  onAction,
  selection,
  visited = emptyVisited,
}: A2UIComponentRendererProperties): ReactNode => {
  if (visited.has(componentId)) {
    return null;
  }
  const component = surface.components[componentId];
  if (!component) {
    return null;
  }
  const nextVisited = new Set(visited);
  nextVisited.add(componentId);

  const renderChild = (childId: string): ReactNode => {
    return (
      <A2UIComponentRenderer
        key={childId}
        surface={surface}
        componentId={childId}
        surfaceId={surfaceId}
        onAction={onAction}
        selection={selection}
        visited={nextVisited}
      />
    );
  };

  switch (component.component) {
    case "Column":
    case "Row": {
      const className =
        component.component === "Column" ? "a2ui-column" : "a2ui-row";
      return (
        <div className={className}>{component.children.map(renderChild)}</div>
      );
    }
    case "Card": {
      return (
        <section
          className={`a2ui-card a2ui-card--${component.tone ?? "surface"}`}
        >
          {renderChild(component.child)}
        </section>
      );
    }
    case "Text": {
      const variant = textVariants[component.variant ?? "body"];
      const Element = variant.element;
      return <Element className={variant.className}>{component.text}</Element>;
    }
    case "MathText": {
      return <MathText component={component} />;
    }
    case "FractionDiagram": {
      return <FractionDiagram component={component} />;
    }
    case "MatchCard": {
      return (
        <MatchCard
          component={component}
          surfaceId={surfaceId}
          onAction={onAction}
          selection={selection}
        />
      );
    }

    case "Button": {
      return (
        <button
          className={`a2ui-action a2ui-action--${component.variant}`}
          type="button"
          onClick={() => onAction(surfaceId, component.action.event.name)}
        >
          {component.label}
        </button>
      );
    }
    case "LearningPath": {
      return renderLearningPath(surface.dataModel, surfaceId);
    }
    case "Status": {
      return (
        <output className={`a2ui-status a2ui-status--${component.kind}`}>
          {component.text}
        </output>
      );
    }
    default: {
      const exhaustive: never = component;
      return exhaustive;
    }
  }
};
