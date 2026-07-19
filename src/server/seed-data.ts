import type { DemoCounts, DemoRole } from '@/shared/demo-contract'

export const demoSeed = {
  tenant: {
    id: 'tenant_demo_eu_synthetic',
    slug: 'eu-synthetic-demo',
    name: 'Edu-Canvas Synthetic Classroom',
    syntheticDataOnly: true,
  },
  identities: [
    {
      id: 'identity_demo_teacher',
      role: 'teacher' as const,
      displayName: 'Maya Hassan',
      demoHandle: 'teacher.demo',
    },
    {
      id: 'identity_demo_student',
      role: 'student' as const,
      displayName: 'Omar Nabil',
      demoHandle: 'student.demo',
    },
  ],
  standard: {
    id: 'standard_ccss_4_nf_a_01',
    code: '4.NF.A.1',
    name: 'Explain equivalent fractions',
    subject: 'Common Core Math',
    gradeBand: 'Grade 4',
  },
  graphNodes: [
    {
      id: 'graph_node_equal_parts',
      label: 'Understand equal parts',
      sequence: 1,
      screenPurposeId: 'screen_purpose_equal_parts',
      screenPurpose: 'Show how a whole is divided into equal parts.',
      labelAr: 'فهم الأجزاء المتساوية',
      screenPurposeAr: 'إظهار كيفية تقسيم الكل إلى أجزاء متساوية.',
    },
    {
      id: 'graph_node_equivalent_fractions',
      label: 'Recognize equivalent fractions',
      sequence: 2,
      screenPurposeId: 'screen_purpose_equivalent_fractions',
      screenPurpose: 'Match different names for the same part of a whole.',
      labelAr: 'التعرف على الكسور المكافئة',
      screenPurposeAr: 'مطابقة أسماء مختلفة للجزء نفسه من الكل.',
    },
  ],
  graphEdges: [
    {
      prerequisiteId: 'graph_node_equal_parts',
      successorId: 'graph_node_equivalent_fractions',
    },
  ],
  activity: {
    id: 'activity_demo_equivalent_fractions',
    slug: 'equivalent-fractions-seeded-demo',
    title: 'Equivalent fractions: name the same whole',
    status: 'published' as const,
  },
  activityVersion: {
    id: 'activity_version_demo_equivalent_fractions_v1',
    versionNumber: 1,
    catalogVersion: 'edu-canvas-matching-v0',
    graphVersion: 'equivalent-fractions-v1',
    publicContent: {
      source: '1/2',
      targets: ['2/4', '3/6', '4/8', '2/3'],
      prompt: 'Choose every fraction that names the same part of a whole.',
    },
    answerKey: {
      source: '1/2',
      correctTargets: ['2/4', '3/6', '4/8'],
    },
  },
  attempt: {
    id: 'attempt_demo_equivalent_fractions',
    studentId: 'identity_demo_student',
    score: 100,
    eventLog: [
      { type: 'selectSource', sourceId: '1/2' },
      { type: 'selectTarget', targetId: '2/4' },
      { type: 'selectTarget', targetId: '3/6' },
      { type: 'selectTarget', targetId: '4/8' },
      { type: 'submitAttempt' },
    ],
  },
} as const

export function assertSeedIntegrity(): void {
  const ids = [
    demoSeed.tenant.id,
    ...demoSeed.identities.map((identity) => identity.id),
    demoSeed.standard.id,
    ...demoSeed.graphNodes.map((node) => node.id),
    demoSeed.activity.id,
    demoSeed.activityVersion.id,
    demoSeed.attempt.id,
  ]

  if (new Set(ids).size !== ids.length) {
    throw new Error('Synthetic seed contains duplicate stable identifiers.')
  }
}

export function getDemoSeedCounts(): DemoCounts {
  assertSeedIntegrity()

  return {
    tenants: 1,
    identities: demoSeed.identities.length,
    standards: 1,
    graphNodes: demoSeed.graphNodes.length,
    graphEdges: demoSeed.graphEdges.length,
    activities: 1,
    activityVersions: 1,
    attempts: 1,
  }
}

export function getSeedIdentity(role: DemoRole) {
  const identity = demoSeed.identities.find(
    (candidate) => candidate.role === role,
  )

  if (!identity) {
    throw new Error('Requested seeded identity does not exist.')
  }

  return identity
}
