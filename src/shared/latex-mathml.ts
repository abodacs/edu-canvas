// #116 MathText: a bounded LaTeX subset parsed into a MathML descriptor tree.
// The subset covers equivalent-fraction notation (\frac, basic operators,
// digits, latin variables). Anything outside the subset fails closed so
// untrusted markup never reaches the renderer. Pure and browser-safe: the
// contract validates with it, the compiler produces the blocking diagnostic
// with it, and the renderer maps the tree onto native MathML elements.

export type MathMLNode =
  | { readonly kind: "row"; readonly children: readonly MathMLNode[] }
  | {
      readonly kind: "frac";
      readonly numerator: readonly MathMLNode[];
      readonly denominator: readonly MathMLNode[];
    }
  | { readonly kind: "number"; readonly value: string }
  | { readonly kind: "identifier"; readonly value: string }
  | { readonly kind: "operator"; readonly value: string };

export type LatexMathResult =
  | { ok: true; root: MathMLNode }
  | { ok: false; code: "INVALID_MATH"; message: string };

// Characters a MathText value may contain at all. The contract schema uses
// this allowlist before any structural parsing happens.
const allowedLatexCharacters = /^[A-Za-z0-9\s{}()[\]/+.=,<>×÷≤≥≠·\\-]+$/u;

const commandNamePattern = /\\(?<name>[A-Za-z]+)/gu;

const commandTranslations = {
  times: "×",
  div: "÷",
  cdot: "·",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  neq: "≠",
} as const satisfies Record<string, string>;

const allowedCommandNames = new Set<string>([
  "frac",
  ...Object.keys(commandTranslations),
]);

const maximumNestingDepth = 16;

const spaceCharacters = [" ", "\n", "\t"] as const;

const isSpace = (character: string): boolean =>
  (spaceCharacters as readonly string[]).includes(character);

const isDigit = (character: string): boolean =>
  character >= "0" && character <= "9";

const isLatinLetter = (character: string): boolean => {
  return (
    (character >= "a" && character <= "z") ||
    (character >= "A" && character <= "Z")
  );
};

const operatorCharacters = new Set<string>([
  "+",
  "-",
  "=",
  "<",
  ">",
  "(",
  ")",
  "[",
  "]",
  "/",
  ".",
  ",",
  "×",
  "÷",
  "≤",
  "≥",
  "≠",
  "·",
]);

export const isAllowedLatexInput = (value: string): boolean => {
  if (!allowedLatexCharacters.test(value)) {
    return false;
  }
  for (const match of value.matchAll(commandNamePattern)) {
    if (!allowedCommandNames.has(match.groups?.name ?? "")) {
      return false;
    }
  }
  return true;
};

// The parser helpers are mutually recursive: brace groups contain
// sequences and sequences contain commands and groups.
/* eslint-disable @typescript-eslint/no-use-before-define -- mutual recursion */

interface ParseState {
  readonly input: string;
  position: number;
}

type ParseOutcome =
  { ok: true; nodes: MathMLNode[] } | { ok: false; message: string };

const failure = (message: string): ParseOutcome => ({ ok: false, message });

const invalidCharacter = (character: string): string =>
  `Math text contains the unsupported character "${character}".`;

const parseBraceGroup = (
  state: ParseState,
  depth: number
): ParseOutcome | { ok: true; nodes: MathMLNode[]; closed: boolean } => {
  // Consume the opening brace before the group body.
  state.position += 1;
  const inner = parseSequence(state, depth + 1);
  if (!inner.ok) {
    return inner;
  }
  if (state.input[state.position] !== "}") {
    return failure("Math text has an unclosed brace group.");
  }
  state.position += 1;
  return { ...inner, closed: true };
};

const parseCommand = (
  state: ParseState,
  depth: number
): ParseOutcome | { ok: true; nodes: MathMLNode[] } => {
  // Consume the backslash before the command name.
  state.position += 1;
  const start = state.position;
  while (
    state.position < state.input.length &&
    isLatinLetter(state.input[state.position] ?? "")
  ) {
    state.position += 1;
  }
  const name = state.input.slice(start, state.position);
  if (name.length === 0) {
    return failure("Math text has a backslash without a command name.");
  }

  if (name === "frac") {
    if (state.input[state.position] !== "{") {
      return failure("Math text \\frac needs a brace group for the numerator.");
    }
    const numerator = parseBraceGroup(state, depth);
    if (!numerator.ok) {
      return numerator;
    }
    if (state.input[state.position] !== "{") {
      return failure(
        "Math text \\frac needs a brace group for the denominator."
      );
    }
    const denominator = parseBraceGroup(state, depth);
    if (!denominator.ok) {
      return denominator;
    }
    return {
      ok: true,
      nodes: [
        {
          kind: "frac",
          numerator: numerator.nodes,
          denominator: denominator.nodes,
        },
      ],
    };
  }

  const translated =
    commandTranslations[name as keyof typeof commandTranslations];
  return translated
    ? { ok: true, nodes: [{ kind: "operator", value: translated }] }
    : failure(`Math text contains the unsupported command \\${name}.`);
};

const consumeSpaces = (state: ParseState): void => {
  while (isSpace(state.input[state.position] ?? "")) {
    state.position += 1;
  }
};

const parseNumberRun = (state: ParseState): MathMLNode => {
  const start = state.position;
  let hasDecimalPoint = false;
  while (state.position < state.input.length) {
    const next = state.input[state.position] ?? "";
    if (!isDigit(next) && (next !== "." || hasDecimalPoint)) {
      break;
    }
    hasDecimalPoint = next === "." ? true : hasDecimalPoint;
    state.position += 1;
  }
  return { kind: "number", value: state.input.slice(start, state.position) };
};

type NodeParse =
  { ok: true; nodes: MathMLNode[] } | { ok: false; message: string };

const parseNextNode = (state: ParseState, depth: number): NodeParse => {
  const character = state.input[state.position] ?? "";
  if (character === "\\") {
    return parseCommand(state, depth);
  }
  if (character === "{") {
    const group = parseBraceGroup(state, depth);
    return group.ok
      ? { ok: true, nodes: [{ kind: "row", children: group.nodes }] }
      : group;
  }
  if (isDigit(character)) {
    return { ok: true, nodes: [parseNumberRun(state)] };
  }
  if (isLatinLetter(character)) {
    state.position += 1;
    return { ok: true, nodes: [{ kind: "identifier", value: character }] };
  }
  if (operatorCharacters.has(character)) {
    state.position += 1;
    return { ok: true, nodes: [{ kind: "operator", value: character }] };
  }
  return { ok: false, message: invalidCharacter(character) };
};

const isAtStop = (state: ParseState): boolean => {
  const character = state.input[state.position];
  return character === undefined || character === "}";
};

const parseSequence = (state: ParseState, depth: number): ParseOutcome => {
  if (depth > maximumNestingDepth) {
    return failure("Math text nests its groups too deeply.");
  }

  const nodes: MathMLNode[] = [];
  while (!isAtStop(state)) {
    consumeSpaces(state);
    if (isAtStop(state)) {
      break;
    }
    const next = parseNextNode(state, depth);
    if (!next.ok) {
      return next;
    }
    nodes.push(...next.nodes);
  }

  return nodes.length === 0
    ? failure("Math text is empty after parsing.")
    : { ok: true, nodes };
};

/* eslint-enable @typescript-eslint/no-use-before-define -- mutual recursion */

export const parseLatexToMathML = (input: string): LatexMathResult => {
  const state: ParseState = { input, position: 0 };
  const parsed = parseSequence(state, 0);
  if (!parsed.ok) {
    return { ok: false, code: "INVALID_MATH", message: parsed.message };
  }
  if (state.position < state.input.length) {
    return {
      ok: false,
      code: "INVALID_MATH",
      message: "Math text has an extra closing brace.",
    };
  }
  return { ok: true, root: { kind: "row", children: parsed.nodes } };
};
