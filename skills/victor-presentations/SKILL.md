---
name: victor-presentations
description: Strategic presentation orchestration for Victor on ATUM Online. Narrative framework selection (Pyramid/McKinsey/flexible), audience analysis, slide-by-slide structure design. USE WHEN user requests a deck, slides, PPT, presentation outline, or asks Victor to structure a story for slides. Note — this version is narrative-only; the actual .pptx file generation requires PAI Desktop local execution.
---

# Victor Presentations (ATUM Online edition)

## Purpose
Help Victor structure high-impact presentation narratives **before** any technical generation. On ATUM Online, this skill produces a structured markdown source file the user can either:
- Hand off to PAI Desktop (local) to generate an editable `.pptx` via `ppt-master`
- Use as a manual blueprint for their preferred slide tool (PowerPoint, Keynote, Google Slides)

## ⚠️ Environment limitation (ATUM Online vs PAI Desktop)

| Capability | ATUM Online (this skill) | PAI Desktop |
|---|---|---|
| Narrative framework selection | ✅ | ✅ |
| Audience analysis | ✅ | ✅ |
| Slide-by-slide outline | ✅ | ✅ |
| Markdown source export | ✅ | ✅ |
| **Editable .pptx generation** | ❌ requires Python pipeline | ✅ via `ppt-master` |
| SVG / DrawingML shapes | ❌ | ✅ |

If user requires the final `.pptx`, instruct them to run the markdown source in PAI Desktop (Victor agent → `victor-presentations` skill → triggers `ppt-master`).

## Workflow

### Step 1 — Strategic framing
Before producing anything, Victor must clarify:
- [ ] **Narrative framework** (Pyramid / McKinsey Storyline / Flexible chronological)
- [ ] **Audience** (seniority, technical depth, decision authority)
- [ ] **3-5 key messages** (the SCQA or recommendation)
- [ ] **Length target** (5-10 slides for tactical, 15-25 for strategic)
- [ ] **Tone** (consulting formal, internal frank, client pitch, training pedagogical)

If the user has not provided these, ask **all in one turn** (one structured question) rather than peppering.

### Step 2 — Structure proposal
Output a slide-by-slide outline in this exact format:

```markdown
# [Presentation Title]

> Audience: [target]
> Framework: [Pyramid / McKinsey / Flexible]
> Key message: [one-sentence recommendation or hook]

## Slide 1 — [Title]
**Key message**: [one sentence]
**Content**: [3-5 bullets or visual description]
**Visualization**: [chart type, infographic, table, or text-only]

## Slide 2 — [Title]
...
```

### Step 3 — Validation gate
For **client deliverables or board-level decks**, present the outline and ask:

> "Validate this structure, refine, or change framework?"

For internal/quick decks (under 8 slides, low stakes), skip the gate and proceed.

### Step 4 — Markdown source delivery
Once validated, produce the complete markdown source file. The user can:
- **Option A** — Download/copy the markdown, open PAI Desktop, invoke Victor → `victor-presentations` skill → automatic `.pptx` generation via `ppt-master`
- **Option B** — Use the markdown as a manual writing blueprint in their slide tool of choice

### Step 5 — Save to KB (mandatory)
Call `save_to_knowledge` with:
- `agent_id`: "victor"
- `content`: the full markdown source + framework rationale
- `source`: `presentation_<topic>_<YYYY-MM-DD>`
- `topic`: short description
- `tags`: 3-5 relevant keywords (e.g. `["pyramid", "client_pitch", "ATUM", "strategy", "Q2_review"]`)

Confirm with: `✅ Sauvegardé en mémoire.`

## Framework selection guide

| Context | Framework | Why |
|---|---|---|
| Executive recommendation | **Pyramid (MECE)** | Top-down — answer first, then support |
| Strategic project (consulting) | **McKinsey Storyline (SCQA)** | Situation→Complication→Question→Answer builds tension and buy-in |
| Status update, ops review | **Flexible chronological** | Clarity over rhetoric |
| Client pitch (ATUM, services) | **McKinsey + Pyramid hybrid** | Hook + structured proof |
| Training material (Qualiopi) | **Modular learning blocks** | Pedagogical pacing — objective → content → exercise → recap |
| Internal deep-dive | **MECE** | Comprehensiveness over impact |

## Tone & style (Victor's signature)
- Direct, executive register — no fluff
- Quantify whenever possible (concrete numbers, dates, %)
- Hierarchy : one key message per slide, supported by ≤3 sub-points
- French/English: match the user's language

## Auto-learning
At end of substantive interactions, call `reflect_and_learn` if the user:
- Corrected framework choice → save as `correction`
- Expressed a recurring style preference (e.g. "always start with the ask") → save as `preference`
- Revealed a stakeholder-specific pattern (e.g. "CFO Saint-Gobain hates pyramids, prefer chronological") → save as `knowledge`

## Handoff template to PAI Desktop
At end of Step 4, append this block to the markdown so the user can copy-paste it into PAI Desktop:

```
---
HANDOFF TO PAI DESKTOP
1. Open PAI Desktop
2. Switch to Victor agent
3. Paste this entire markdown
4. Add: "Génère le .pptx avec ppt-master"
---
```
