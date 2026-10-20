import { demoSnapshotSchema } from "@/shared/demo-contract.schema";

import { readServerConfig } from "../config";
import { serverObservability } from "../observability.server";
import { createFoundationPersistence } from "../persistence";
import { demoSeed } from "../seed-data";

import { assertTenantAccess, getDemoSession } from "./policy";
import type { ServerObservability } from "../observability.server";
import type { DemoRole, DemoSnapshot } from "@/shared/demo-contract";

const DEMO_SNAPSHOT_OPERATION = "demo.snapshot";

export interface ReadDemoSnapshotOptions {
  observability?: ServerObservability;
}

export const readDemoSnapshot = async (
  role: DemoRole,
  environment: Record<string, string | undefined> = process.env,
  options: ReadDemoSnapshotOptions = {}
): Promise<DemoSnapshot> => {
  const config = readServerConfig(environment);
  const observability = options.observability ?? serverObservability;
  if (config.issues.length > 0) {
    observability.captureError(
      new Error("Demo environment configuration is invalid."),
      {
        operation: DEMO_SNAPSHOT_OPERATION,
        reason: "invalid_configuration",
        issueCodes: config.issues.map((issue) => issue.code),
      }
    );
    throw new Error("Demo environment configuration is invalid.");
  }

  let session;
  try {
    session = getDemoSession(role);
    assertTenantAccess(session, demoSeed.tenant.id);
  } catch (error) {
    observability.captureError(error, {
      operation: DEMO_SNAPSHOT_OPERATION,
      reason: "access_denied",
    });
    throw error;
  }

  const counts = await createFoundationPersistence(config, {
    observability,
  }).readDemoCounts();

  try {
    return demoSnapshotSchema.parse({
      environment: {
        appEnv: config.appEnv,
        persistence: config.mode,
        syntheticDataOnly: true,
      },
      session: {
        identityId: session.identityId,
        displayName: session.displayName,
        role: session.role,
        tenantId: session.tenantId,
        tenantName: session.tenantName,
        capabilities: session.capabilities,
      },
      curriculum: {
        id: demoSeed.standard.id,
        name: demoSeed.standard.name,
        graphVersion: demoSeed.activityVersion.graphVersion,
      },
      seededCounts: counts,
    });
  } catch (error) {
    observability.captureError(error, {
      operation: DEMO_SNAPSHOT_OPERATION,
      reason: "contract_violation",
    });
    throw error;
  }
};
