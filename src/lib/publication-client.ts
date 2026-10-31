import { csrfHeaderName } from "@/shared/identity-contract";
import {
  publicationFindingSchema,
  publicationPublishResultSchema,
  reviewPackSchema,
} from "@/shared/publication-contract";

import type {
  PublicationApproveInput,
  PublicationFinding,
  PublicationPublishInput,
  PublicationPublishResult,
  PublicationReviseInput,
  ReviewPack,
} from "@/shared/publication-contract";

export interface PublicationClientError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly findings: readonly PublicationFinding[];
  readonly detail?: string;
}

export type PublicationClientResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: PublicationClientError };

const fallbackMessage =
  "The review could not reach the server. Check your connection and try again.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const readError = async (
  response: Response
): Promise<PublicationClientError> => {
  const body = await readJson(response);
  const record = isRecord(body) ? body : {};
  const findings: PublicationFinding[] = [];
  if (Array.isArray(record.findings)) {
    for (const candidate of record.findings) {
      const parsed = publicationFindingSchema.safeParse(candidate);
      if (parsed.success) {
        findings.push(parsed.data);
      }
    }
  }
  return {
    status: response.status,
    code:
      typeof record.code === "string" ? record.code : "PUBLICATION_UNAVAILABLE",
    message:
      typeof record.message === "string" ? record.message : fallbackMessage,
    findings,
    ...(typeof record.detail === "string" && { detail: record.detail }),
  };
};

const post = async <T>(
  path: string,
  csrf: string,
  body: unknown,
  parse: (value: unknown) => T
): Promise<PublicationClientResult<T>> => {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        [csrfHeaderName]: csrf,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      error: {
        status: 0,
        code: "PUBLICATION_UNAVAILABLE",
        message: fallbackMessage,
        findings: [],
      },
    };
  }

  if (!response.ok) {
    return { ok: false, error: await readError(response) };
  }

  const payload = await readJson(response);
  try {
    return { ok: true, value: parse(payload) };
  } catch {
    return {
      ok: false,
      error: {
        status: 502,
        code: "PUBLICATION_UNAVAILABLE",
        message: "The server returned an unexpected review. Reload the page.",
        findings: [],
      },
    };
  }
};

const parseReview = (value: unknown): ReviewPack =>
  reviewPackSchema.parse(value);

export const openPublicationReview = (
  requestId: string,
  csrf: string
): Promise<PublicationClientResult<ReviewPack>> =>
  post("/api/publications/review", csrf, { requestId }, parseReview);

export const approvePublicationTarget = (
  input: PublicationApproveInput,
  csrf: string
): Promise<PublicationClientResult<ReviewPack>> =>
  post("/api/publications/approvals", csrf, input, parseReview);

export const revisePublicationVersion = (
  input: PublicationReviseInput,
  csrf: string
): Promise<PublicationClientResult<ReviewPack>> =>
  post("/api/publications/revisions", csrf, input, parseReview);

export const publishPublication = (
  input: PublicationPublishInput,
  csrf: string
): Promise<PublicationClientResult<PublicationPublishResult>> => {
  return post("/api/publications", csrf, input, (value) =>
    publicationPublishResultSchema.parse(value)
  );
};
