import { createElement } from "react";
import { cn } from "@/lib/utilities";

import { parseLatexToMathML } from "@/shared/latex-mathml";
import type { ReactNode } from "react";
import type { A2UIComponent } from "@/shared/a2ui-contract";
import type { MathMLNode } from "@/shared/latex-mathml";

type MathTextComponent = Extract<A2UIComponent, { component: "MathText" }>;

// MathML element names are not in the project's JSX intrinsic set, so the
// tree mounts through createElement. React resolves the MathML namespace
// from the <math> root, and every name here comes from the trusted parser.
const renderMathMLNode = (node: MathMLNode, key: string): ReactNode => {
  switch (node.kind) {
    case "row": {
      return createElement(
        "mrow",
        { key },
        node.children.map((child, childIndex) =>
          renderMathMLNode(child, `${key}-${childIndex}`)
        )
      );
    }
    case "frac": {
      return createElement(
        "mfrac",
        { key },
        createElement(
          "mrow",
          { key: `${key}-numerator` },
          node.numerator.map((child, childIndex) =>
            renderMathMLNode(child, `${key}-n${childIndex}`)
          )
        ),
        createElement(
          "mrow",
          { key: `${key}-denominator` },
          node.denominator.map((child, childIndex) =>
            renderMathMLNode(child, `${key}-d${childIndex}`)
          )
        )
      );
    }
    case "number": {
      return createElement("mn", { key }, node.value);
    }
    case "identifier": {
      return createElement("mi", { key }, node.value);
    }
    case "operator": {
      return createElement("mo", { key }, node.value);
    }
  }
};

// #116: MathText renders the trusted LaTeX subset as native MathML. Contract
// validation blocks unparseable math upstream, so the fail-safe branch only
// guards a defense-in-depth path and never renders foreign markup.
export const MathText = ({
  component,
}: {
  readonly component: MathTextComponent;
}): ReactNode => {
  const parsed = parseLatexToMathML(component.latex);
  if (!parsed.ok) {
    return (
      <span className="a2ui-math-text a2ui-math-text--blocked">
        {component.latex}
      </span>
    );
  }

  return (
    <span className={cn("a2ui-math-text")}>
      {createElement(
        "math",
        {
          className: "a2ui-math-text__math",
          display: "block",
          "aria-label": component.textEquivalent,
        },
        renderMathMLNode(parsed.root, "root")
      )}
      {component.textEquivalent ? (
        <span className="sr-only">{component.textEquivalent}</span>
      ) : null}
    </span>
  );
};
