# Twelve fictional teacher personas — v2

This pack supports product and study design for US Common Core Grade 4 equivalent fractions. It contains ten core teachers and two boundary roles. All identities, qualifications, resources and constraints are authored assignments. **V2 contains no simulated outcomes, measured effort or teacher evidence.**

Start with the [protocol](protocol.md), then use a [role card](agents/) and the [capability ledger](capabilities.md). The [twelve-persona gap audit](gap-audit.md) turns each assignment into questions for real teachers. The [design review](report.md) explains the revision and its remaining limits.

## Choose a role

The [canonical profiles](personas.json) and all role cards share profile/protocol version **2.0**. Update them together. The JSON is documentation data, not an application API contract.

| Role | Age; gender; ethnicity | School; teaching experience; caregiving | Focus | Assigned planning tools |
| --- | --- | --- | --- | --- |
| [T01 Maya](agents/T01.md) | 25–29; woman; White | Urban public; 2 years; none assigned | Uneven maths confidence; may miss errors | Neither |
| [T02 Daniel](agents/T02.md) | 55–59; man; Black | Suburban public; 18 years, second career; eldercare | Better teaching decisions can justify switching | Neither |
| [T03 Ruth](agents/T03.md) | 35–39; woman; Asian American | Rural public; 11 years; none assigned | Online preparation, offline teaching | Neither |
| [T04 Lina](agents/T04.md) | 30–34; woman; Latina | Urban charter; 8 years; parent | Approved tools; no personal budget | LLM |
| [T05 Owen](agents/T05.md) | 40–44; man; Black | Suburban public; 16 years; parent | Reviews shared department materials | LLM |
| [T06 Iris](agents/T06.md) | 35–39; nonbinary; White | Suburban public; 10 years; none assigned | Low vision; keyboard and zoom | LLM |
| [T07 Elena](agents/T07.md) | 45–49; woman; Latina | Urban public; 20 years; eldercare | Recommends; district purchases | Hypothetical Jev |
| [T08 Sam](agents/T08.md) | 30–34; man; White | Urban public; 7 years; parent | Separate individual and group evidence | Hypothetical Jev |
| [T09 Noor](agents/T09.md) | 40–44; woman; Arab American | Urban public; 15 years; eldercare | Uneven maths prerequisites | Hypothetical Jev |
| [T10 Alex](agents/T10.md) | 35–39; nonbinary; Asian American | Suburban public; 12 years; parent | Limited preparation slots; genuine choice | LLM + hypothetical Jev |
| [T11 Hana](agents/T11.md) | 30–34; woman; Arab American | Public dual-language; 7 years; none assigned | Arabic-output boundary | LLM + hypothetical Jev |
| [T12 Victor](agents/T12.md) | 50–54; man; Multiracial | Rural private; 25 years; none assigned | Grade 5 multiplication boundary | LLM + hypothetical Jev |

All are US-born except Lina (immigrated as a teenager), Elena and Hana (immigrated as adults). No country of origin is assigned. Skills, attitudes, languages and support needs are assigned independently of identity. These contrasts do not describe demographic groups or a representative US sample. School use of Common Core is a scenario assumption, including the private-school boundary role.

The core tool groups are deliberately uneven: three neither, three LLM only, three hypothetical Jev only, one both. Boundary roles are additional cases, not extra observations for the both-tools group. No tool-group comparison is justified. Jev is a hypothetical objective-matching condition, not established teacher adoption or provider access.

## Use the pack

1. Read the capability ledger and choose either documented-current discussion or explicitly hypothetical target-loop discussion.
2. Read one version-matched profile and card. Start with neutral prompts before showing stress conditions.
3. Keep the same objective and quality requirements for core comparisons. Use screening and one rejection probe for each boundary role.
4. Record qualitative burden, help, trade-offs and unknowns. A role discussion may expose questions; it cannot supply observed choices or future use.
5. Keep any future authorized study or rehearsal in a separately versioned artifact. Do not write v2 output into v1 runs.

This revision does not execute agents, providers, the application or a study. It changes no application API.

## Original rehearsal

The [legacy index](legacy/README.md) retains the complete original v1 pack, including its original profiles, return rules, protocol, raw JSON/CSV and results. Raw values are preserved. V1's constructed events and minutes belong only to those original profiles and procedure. The v2 names and IDs are continuity labels, not permission to transfer old results to revised people.

[Issue #118](https://github.com/abodacs/edu-canvas/issues/118) and [V12](../../hackathon/meta-global-2026/validation-tracker.md) remain pending. This pack establishes no real recruitment, teacher usefulness, learning gain, accessibility compliance, retention or purchase willingness. Real-study evidence and outreach authorization remain separate work.
