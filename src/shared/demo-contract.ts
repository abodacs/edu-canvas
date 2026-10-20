import { demoRoles } from "./demo-contract.schema";
import type { DemoRole } from "./demo-contract.schema";

export { demoRoles } from "./demo-contract.schema";

export type {
  DemoCounts,
  DemoRole,
  DemoSnapshot,
} from "./demo-contract.schema";

export const isDemoRole = (value: string): value is DemoRole =>
  demoRoles.includes(value as DemoRole);
