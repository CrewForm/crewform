# Collaboration Teams

Collaboration mode lets multiple agents participate in a **shared discussion thread**, taking turns to contribute ideas, critique, build on each other's points, and reach a consensus. Unlike Pipeline (sequential handoffs) or Orchestrator (brain + workers), Collaboration is a peer-to-peer discussion — no hierarchy, just agents talking.

## How It Works

```
User Input (Discussion Topic)
         │
         ▼
  ┌─────────────────────────────────────────┐
  │           Discussion Thread              │
  │                                          │
  │  Turn 1: Agent A — opens the discussion  │
  │  Turn 2: Agent B — responds, builds on   │
  │  Turn 3: Agent C — critiques, adds more  │
  │  Turn 4: Agent A — responds to critique  │
  │  Turn 5: Agent B — "I agree, ..."        │ ← consensus phrase detected
  │  Turn 6: Agent C — "I agree, ..."        │ ← consensus reached → stop
  │                                          │
  └─────────────────────────────────────────┘
         │
         ▼
  Final Output (full thread + last contribution)
```

Each agent sees the full conversation history before contributing. The run ends when a termination condition is met (max turns, consensus, or facilitator decision).

## Creating a Collaboration Team

1. Navigate to **Teams → New Team**
2. Give it a name and description
3. Select **Collaboration** as the team mode
4. Add at least 2 participant agents
5. Configure speaker selection, termination, and turn limits

## Configuration

### Participant Agents

Add at least 2 agents to participate in the discussion. Each agent brings its own system prompt — their expertise, perspective, or role in the conversation.

**Example: Strategy Review Team**

- **Alex (Optimist)** — "You look for opportunities, upside, and growth potential. You challenge conservative assumptions."
- **Jordan (Devil's Advocate)** — "You stress-test ideas by identifying risks, edge cases, and potential failures."
- **Sam (Pragmatist)** — "You focus on feasibility, implementation, and resource constraints."

### Speaker Selection

Determines how the next speaker is chosen each turn.

| Strategy | Description | Best For |
|----------|-------------|----------|
| **Round Robin** | Agents take turns in order (A → B → C → A → ...) | Structured discussions, equal contribution |
| **LLM Selects** | An LLM picks the most relevant next speaker based on the conversation so far | Dynamic discussions where expertise varies by topic |
| **Facilitator** | A designated facilitator agent decides who speaks next | Moderated panels, interview-style discussions |

#### Round Robin
Simple and predictable. Each agent speaks in the order they were added.

#### LLM Selects
After each turn, a meta-LLM call reads the recent conversation and picks the agent whose expertise is most relevant to respond next. Falls back to round robin if the LLM returns an invalid agent ID.

> **Note:** LLM Select adds one extra LLM call per turn for speaker selection. Factor this into cost estimates.

#### Facilitator
One agent is designated as the **facilitator**. The facilitator speaks on the first turn (to set the stage) and then directs the discussion by choosing who speaks next. 

Requires selecting a **Facilitator Agent** from the participant list. The facilitator receives additional context about the available participants and is asked to select the next speaker after every turn.

### Termination Condition

Determines when the discussion ends.

| Condition | Description |
|-----------|-------------|
| **Max Turns** | Discussion ends after a fixed number of turns |
| **Consensus** | Discussion ends when the majority of recent speakers include the consensus phrase |
| **Facilitator Decision** | Discussion ends when the facilitator says `DISCUSSION COMPLETE` |

#### Max Turns
The simplest option. Set a turn limit and the discussion runs until it's reached. Good for open-ended brainstorms where you want a fixed amount of output.

#### Consensus
Each agent is instructed to include a configurable **consensus phrase** in their response when they agree with the group's direction. When a majority of recent speakers include the phrase, the discussion terminates.

Configure the consensus phrase (default: `"I agree with this approach"`). Keep it distinctive enough that agents won't say it accidentally.

```
Good:  "I agree with this approach"   — specific, unlikely to appear casually
Avoid: "yes"                          — too common, will trigger false positives
```

#### Facilitator Decision
The facilitator can end the discussion at any time by including `DISCUSSION COMPLETE` in their message. Use this when you want a human-readable signal for when consensus or sufficient exploration has been reached.

### Configuration Fields

| Field | Description | Default |
|-------|-------------|---------|
| **Participant Agents** | Agents in the discussion (min 2) | Required |
| **Speaker Selection** | How the next speaker is chosen | `round_robin` |
| **Max Turns** | Maximum number of speaking turns before the discussion ends | 10 |
| **Termination Condition** | What stops the discussion early | `max_turns` |
| **Consensus Phrase** | Text agents include to signal agreement | `"I agree with this approach"` |
| **Facilitator Agent** | Agent who directs the discussion (Facilitator mode only) | Optional |

## Output

Collaboration runs produce two things:

1. **Final Contribution** — the last agent's message, treated as the primary output
2. **Full Discussion Thread** — every turn, labelled by agent name

This means you get both a concise final thought *and* the full deliberation history. The full thread is useful for:
- Understanding how the conclusion was reached
- Reviewing dissenting views that were considered
- Using the discussion as research material

## Team Memory

Like orchestration teams, collaboration teams persist memory across runs. After each completed run, the output is stored. On the next run covering a similar topic, relevant past discussions are surfaced in context on the first turn.

This allows teams to build on previous sessions — a strategy review team, for example, will remember past conclusions and avoid re-covering ground.

## Example: Architecture Review

A 3-agent collaboration team for reviewing technical architecture proposals:

**Participants:**
1. **Alex (Security)** — "You are a security engineer. You review designs for attack vectors, data exposure risks, and compliance gaps."
2. **Jordan (Performance)** — "You are a performance engineer. You review for bottlenecks, scalability limits, and latency concerns."
3. **Sam (Practicality)** — "You are a senior engineer. You assess whether the proposed design is actually buildable with the team's current skills and stack."

**Settings:**
- Speaker Selection: **Round Robin**
- Max Turns: **9** (3 full rounds)
- Termination: **Consensus** (`"I approve this architecture"`)

**Typical run:**
1. Alex opens: security concerns about the proposed auth design
2. Jordan responds: performance implications of the auth overhead
3. Sam: "the team can implement this — we already have JWT middleware"
4. Alex: "agreed on JWT, but we need rate limiting — I approve this architecture"
5. Jordan: "rate limiting noted, adding to non-functional requirements — I approve this architecture"
6. Sam: "I approve this architecture" → **Consensus reached, discussion ends**

## Tips

- **Give agents distinct perspectives.** The discussion is only valuable if agents genuinely disagree and challenge each other. Agents with identical system prompts will produce repetitive turns.
- **Max turns × average tokens ≈ your cost.** A 10-turn discussion with 3 agents will generate 10 LLM calls, each with a growing conversation history (every agent sees all previous turns). Watch out for token costs on long discussions.
- **Consensus phrase needs to be intentional.** Agents include the phrase deliberately when they agree. Make it specific and natural enough that a reasonable agent would say it, but not so common that it fires by accident.
- **Facilitator Decision is great for open-ended exploration.** Let the discussion run freely and have the facilitator close it when they judge that enough ground has been covered.
- **Use LLM Select for expert panels.** When agents have narrow specialisations, LLM Select routes questions to the most relevant expert rather than forcing everyone to respond to everything.

## Related

- [Pipeline Teams](./pipeline-teams.md) — Sequential steps with fixed agent handoffs
- [Orchestration Teams](./orchestration-teams.md) — Brain agent delegates to workers dynamically
