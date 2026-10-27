# Twelve teacher personas for issue #118

This pack rehearses a two-week teacher study with 12 fictional roles. Every session, event, and minute is synthetic. No teacher recruitment or classroom observation occurs.

Read the [results](report.md) for the constructed outcomes. Read the [protocol](protocol.md) for the assumptions and assigned obstacles.

## Choose a role

The ten core roles teach English Grade 4 equivalent fractions. Two boundary roles request a different language or subject. Personality traits come from authored profiles, not from demographic assumptions.

| Agent | Context and personality | Assumed tool use | Scope |
| --- | --- | --- | --- |
| [T01](agents/T01.md) | Maya: early-career planner | Neither | core |
| [T02](agents/T02.md) | Daniel: experienced material reuser | Neither | core |
| [T03](agents/T03.md) | Ruth: teacher with limited connectivity | Neither | core |
| [T04](agents/T04.md) | Lina: frequent llm user | LLM | core |
| [T05](agents/T05.md) | Owen: mathematics reviewer | LLM | core |
| [T06](agents/T06.md) | Iris: keyboard-first teacher | LLM | core |
| [T07](agents/T07.md) | Elena: curriculum coordinator | Assumed Jev | core |
| [T08](agents/T08.md) | Sam: teacher with shared devices | Assumed Jev | core |
| [T09](agents/T09.md) | Noor: intervention specialist | Assumed Jev | core |
| [T10](agents/T10.md) | Alex: school technology champion | LLM + assumed Jev | core |
| [T11](agents/T11.md) | Hana: arabic-output boundary case | LLM + assumed Jev | boundary |
| [T12](agents/T12.md) | Victor: adjacent-grade boundary case | LLM + assumed Jev | boundary |

Jev is an assumed objective-matching service inside a planning workflow. Its inclusion does not establish teacher adoption or provider access. The personas use an LLM for draft text, Jev for matching, both, or neither. The role-play agents themselves use the model inherited from this session.

## Run a role again

1. Start a separate agent or a fresh model conversation.
2. Give the agent the shared protocol and one linked role card.
3. Ask the agent to follow the card's start instruction.
4. Keep the output separate from every other role.
5. Review the output against the protocol before comparison.

Use the same protocol and source profiles for a repeated run. Agent decisions and invented times can change between runs. This is not a deterministic forecast. The [source profiles](personas.json) contain the assumptions used to create the role cards. No production model, Jev API, or application session is part of this rehearsal.

## Read the records

- [Protocol](protocol.md): common task, product assumptions, session schedule, and output contract.
- [Role profiles](personas.json): the 12 authored backgrounds and decision rules.
- [Raw runs](runs/): one synthetic JSON record per persona.
- [Session table](sessions.csv): all four sessions, including blocked, declined, and missing sessions.
- [Report](report.md): per-persona comparisons, reasons, and next real checks.

All time fields use minutes. Total effort includes setup, preparation, review, correction, sharing, and follow-up. Researcher help is included once in setup. A missing measurement stays empty in the session table. Only completed comparable tasks contribute to a time comparison.

## Limits and real next step

The assigned obstacles and times drive these outcomes. Twelve role outputs from the same model are not 12 independent teacher observations. They cannot estimate demand, retention, savings, learning gains, provider quality, or market size.

[Issue #118](https://github.com/abodacs/edu-canvas/issues/118) still requires five confirmed real teachers, permissions, scheduled sessions, actual workflow comparisons, and follow-up records. No acceptance box or evidence gate changes because this pack exists. [V12](../../../../hackathon/meta-global-2026/validation-tracker.md) remains pending.

Use this rehearsal to improve the real study's questions. Test the assumptions with real teachers when outreach is authorized. Do not present invented lesson use as student participation.
