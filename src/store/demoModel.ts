import type { ProjectModel } from '../types/model';

export const DEMO_MODEL: ProjectModel = {
  version: 1,
  name: 'Cloud Platform & Compliance Programme',
  currency: 'GBP',
  nodes: [
    {
      id: 'start-1',
      type: 'start',
      position: { x: 40, y: 270 },
      data: { label: 'Project Start' },
    },
    {
      id: 'q-arch',
      type: 'question',
      position: { x: 250, y: 120 },
      data: {
        label: 'Cloud Migration Strategy',
        description: 'Will legacy workloads be lifted-and-shifted, refactored, or fully rebuilt?',
      },
    },
    {
      id: 'o-lift',
      type: 'outcome',
      position: { x: 560, y: 20 },
      data: {
        label: 'Lift & Shift VMs',
        description: 'Rehost existing VMs onto cloud IaaS with minimal code changes.',
        probabilityPct: 45,
        cost: 65000,
      },
    },
    {
      id: 'o-refactor',
      type: 'outcome',
      position: { x: 560, y: 145 },
      data: {
        label: 'Containerize Core Services',
        description: 'Package core apps into Kubernetes; keep existing relational DB.',
        probabilityPct: 35,
        cost: 145000,
      },
    },
    {
      id: 'o-rebuild',
      type: 'outcome',
      position: { x: 560, y: 270 },
      data: {
        label: 'Cloud-Native Re-architecture',
        description: 'Full serverless & managed database rewrite; retires legacy DB.',
        probabilityPct: 20,
        cost: 260000,
      },
    },
    {
      id: 'q-db',
      type: 'question',
      position: { x: 860, y: 60 },
      data: {
        label: 'Legacy Database Licensing',
        description: 'Triggered if we keep legacy DB engine; both outcomes proceed to Security Audit.',
      },
    },
    {
      id: 'o-db-renew',
      type: 'outcome',
      position: { x: 1170, y: 10 },
      data: {
        label: 'Standard License Renewal',
        description: 'Existing core-count license covers cloud vCPUs.',
        probabilityPct: 60,
        cost: 40000,
      },
    },
    {
      id: 'o-db-enterprise',
      type: 'outcome',
      position: { x: 1170, y: 135 },
      data: {
        label: 'Enterprise HA Add-on Required',
        description: 'Vendor audit requires multi-AZ active-passive licensing tier.',
        probabilityPct: 40,
        cost: 110000,
      },
    },
    {
      id: 'q-sec',
      type: 'question',
      position: { x: 860, y: 380 },
      data: {
        label: 'Security & Compliance Audit',
        description: 'Mandatory compliance stage following migration and database decisions.',
      },
    },
    {
      id: 'o-sec-std',
      type: 'outcome',
      position: { x: 1170, y: 345 },
      data: {
        label: 'Automated SOC2 Assessment',
        description: 'Compliance platform + internal security review.',
        probabilityPct: 65,
        cost: 30000,
      },
    },
    {
      id: 'o-sec-pen',
      type: 'outcome',
      position: { x: 1170, y: 470 },
      data: {
        label: 'External Red-Team & Remediation',
        description: 'Full adversarial penetration test by accredited CREST consultancy.',
        probabilityPct: 35,
        cost: 85000,
      },
    },
    {
      id: 'q-remed',
      type: 'question',
      position: { x: 1470, y: 465 },
      data: {
        label: 'Critical Findings Hardware HSM?',
        description: 'If Red-Team identifies key-management gaps, dedicated HSMs may be needed.',
      },
    },
    {
      id: 'o-hsm-no',
      type: 'outcome',
      position: { x: 1780, y: 400 },
      data: {
        label: 'Software KMS Sufficient',
        description: 'Standard cloud KMS key rotation satisfies auditors.',
        probabilityPct: 70,
        cost: 15000,
      },
    },
    {
      id: 'o-hsm-yes',
      type: 'outcome',
      position: { x: 1780, y: 525 },
      data: {
        label: 'Dedicated CloudHSM Cluster',
        description: 'FIPS 140-3 Level 3 dedicated hardware security modules required.',
        probabilityPct: 30,
        cost: 75000,
      },
    },
    {
      id: 'end-1',
      type: 'end',
      position: { x: 2090, y: 290 },
      data: { label: 'Project Complete' },
    },
  ],
  edges: [
    {
      id: 'e-start-arch',
      source: 'start-1',
      target: 'q-arch',
      data: { kind: 'start-to-question' },
    },
    // Cloud Migration Strategy outcomes (Outcome-level routing)
    {
      id: 'e-arch-lift',
      source: 'q-arch',
      target: 'o-lift',
      data: { kind: 'question-to-outcome' },
    },
    {
      id: 'e-arch-refactor',
      source: 'q-arch',
      target: 'o-refactor',
      data: { kind: 'question-to-outcome' },
    },
    {
      id: 'e-arch-rebuild',
      source: 'q-arch',
      target: 'o-rebuild',
      data: { kind: 'question-to-outcome' },
    },
    // Lift & Shift and Refactor both lead to Legacy DB Licensing question
    {
      id: 'e-lift-db',
      source: 'o-lift',
      target: 'q-db',
      data: { kind: 'outcome-to-question' },
    },
    {
      id: 'e-refactor-db',
      source: 'o-refactor',
      target: 'q-db',
      data: { kind: 'outcome-to-question' },
    },
    // Rebuild bypasses Legacy DB Licensing and goes straight to Security Audit
    {
      id: 'e-rebuild-sec',
      source: 'o-rebuild',
      target: 'q-sec',
      data: { kind: 'outcome-to-question' },
    },
    // DB outcomes + Question-level aggregate link from q-db -> q-sec
    {
      id: 'e-db-renew',
      source: 'q-db',
      target: 'o-db-renew',
      data: { kind: 'question-to-outcome' },
    },
    {
      id: 'e-db-ent',
      source: 'q-db',
      target: 'o-db-enterprise',
      data: { kind: 'question-to-outcome' },
    },
    {
      id: 'e-db-to-sec',
      source: 'q-db',
      target: 'q-sec',
      data: { kind: 'question-to-question' },
    },
    // Security outcomes (Outcome-level routing)
    {
      id: 'e-sec-std',
      source: 'q-sec',
      target: 'o-sec-std',
      data: { kind: 'question-to-outcome' },
    },
    {
      id: 'e-sec-pen',
      source: 'q-sec',
      target: 'o-sec-pen',
      data: { kind: 'question-to-outcome' },
    },
    {
      id: 'e-sec-std-end',
      source: 'o-sec-std',
      target: 'end-1',
      data: { kind: 'outcome-to-end' },
    },
    {
      id: 'e-sec-pen-remed',
      source: 'o-sec-pen',
      target: 'q-remed',
      data: { kind: 'outcome-to-question' },
    },
    // Remediation outcomes + Question-level aggregate link from q-remed -> end-1
    {
      id: 'e-remed-no',
      source: 'q-remed',
      target: 'o-hsm-no',
      data: { kind: 'question-to-outcome' },
    },
    {
      id: 'e-remed-yes',
      source: 'q-remed',
      target: 'o-hsm-yes',
      data: { kind: 'question-to-outcome' },
    },
    {
      id: 'e-remed-to-end',
      source: 'q-remed',
      target: 'end-1',
      data: { kind: 'question-to-end' },
    },
  ],
};
