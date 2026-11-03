import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compileRawLessonPreview } from "@/server/a2ui/compiler";
import { createGenerationService } from "@/server/generation/service";
import { createDeterministicLessonDraftProvider } from "@/server/generation/provider";
import { parseTenantId } from "@/server/identity/identifiers";
import { syntheticTeacherActor } from "@/server/identity/test-actors";
import { createSeededGenerationLimitStore } from "@/server/persistence/limits-seeded";
import { createSeededPersistence } from "@/server/persistence/seeded";
import { seedFoundationDatabase } from "@/server/persistence/seed-postgres";
import { syntheticSeed } from "@/server/seed-data";
import {
  A2UI_CATALOG_VERSION,
  a2uiCatalogVersionForId,
  a2uiCatalogs,
} from "@/shared/a2ui-contract";

import {
  applyA2UIMessage,
  createA2UIRenderState,
} from "@/components/a2ui/renderer";
import { runDatabaseMigrations } from "../../scripts/database-migrate-runtime.mjs";
import type { LessonGenerationInput } from "@/shared/generation-contract";

// #110 round trip: migrate an empty database, seed it from scratch, read the
// persisted catalog identity back, and render the fixture through the same
// reader and renderer the live preview uses. The unit tests prove the seed
// matches the contract in memory; this proves the identity survives
// persistence and still resolves to a catalog a reader accepts.
//
// A scratch database rather than the shared test database: the round trip has
// to observe the row the current seed writes, and `activity_versions` is
// inserted with `on conflict do nothing`, so a database seeded before this
// change keeps the retired identifier by design.

const databaseUrl = process.env.DATABASE_URL;
const isEnabled = process.env.RUN_DATABASE_TESTS === "true";
const isRun = Boolean(databaseUrl && isEnabled);

const requireUrl = (): string => {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the seed round-trip test.");
  }
  return databaseUrl;
};

const scratchDatabaseName = `ec_seed_roundtrip_${process.pid}_${Date.now()}`;

const scratchUrl = (): string => {
  const url = new URL(requireUrl());
  url.pathname = `/${scratchDatabaseName}`;
  return url.href;
};

const connect = (url: string) => {
  return postgres(url, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    prepare: false,
  });
};

const teacherActor = syntheticTeacherActor({
  tenantId: parseTenantId(syntheticSeed.tenant.id),
});

const lessonInput: LessonGenerationInput = {
  prompt: "equivalent fractions for grade 4",
  grade: 4,
  standardId: syntheticSeed.standard.id,
  language: "en",
  difficulty: "on-level" as const,
};

describe.skipIf(!isRun)("seeded catalog round trip", () => {
  let scratch: ReturnType<typeof postgres> | undefined;

  beforeAll(async () => {
    const admin = connect(requireUrl());
    try {
      await admin.unsafe(`create database "${scratchDatabaseName}"`);
    } finally {
      await admin.end({ timeout: 3 });
    }

    await runDatabaseMigrations(scratchUrl());
    await seedFoundationDatabase(scratchUrl());
    scratch = connect(scratchUrl());
  }, 120_000);

  afterAll(async () => {
    await scratch?.end({ timeout: 3 });

    const admin = connect(requireUrl());
    try {
      await admin.unsafe(
        `drop database if exists "${scratchDatabaseName}" with (force)`
      );
    } finally {
      await admin.end({ timeout: 3 });
    }
  });

  const readStoredCatalogVersion = async (): Promise<string> => {
    if (!scratch) {
      throw new Error("Expected a seeded scratch database.");
    }

    const rows = await scratch.begin(async (transaction) => {
      await transaction`select set_config('app.tenant_id', ${syntheticSeed.tenant.id}, true)`;
      return transaction<{ catalog_version: string }[]>`
        select catalog_version
        from activity_versions
        where id = ${syntheticSeed.activityVersion.id}
      `;
    });

    expect(rows).toHaveLength(1);

    return rows[0]?.catalog_version ?? "";
  };

  it("persists the live catalog identity for the seeded activity version", async () => {
    const storedCatalog = await readStoredCatalogVersion();
    const { catalogId } = a2uiCatalogs[A2UI_CATALOG_VERSION];

    expect(storedCatalog).toBe(A2UI_CATALOG_VERSION);
    expect(a2uiCatalogVersionForId(catalogId)).toBe(storedCatalog);
    expect(Object.keys(a2uiCatalogs)).toContain(storedCatalog);
  });

  it("renders the fixture through the live reader and renderer", async () => {
    const storedCatalog = await readStoredCatalogVersion();
    const result = await createGenerationService({
      persistence: createSeededPersistence(),
      provider: createDeterministicLessonDraftProvider(),
      limits: createSeededGenerationLimitStore(),
    }).generate({ actor: teacherActor, input: lessonInput });
    if (!result.record.draft) {
      throw new Error("Expected the generated fixture to be reviewable.");
    }

    const preview = compileRawLessonPreview({
      ...lessonInput,
      grade: 4,
      requestId: result.record.requestId,
      draft: result.record.draft,
      learningPath: result.record.draft.learningPath,
    });

    expect(preview.catalogVersion).toBe(storedCatalog);

    let state = createA2UIRenderState();
    for (const message of preview.messages) {
      const applied = applyA2UIMessage(state, message);
      if (!applied.ok) {
        throw new Error(applied.message);
      }
      ({ state } = applied);
    }

    const surfaces = Object.values(state.surfaces).filter(
      (surface) => surface !== undefined
    );

    expect(surfaces.length).toBeGreaterThan(0);
    expect(
      surfaces.every((surface) => surface?.catalogVersion === storedCatalog)
    ).toBeTruthy();
  });
});
