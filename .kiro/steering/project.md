# Frankenstein's Lovecraftian Village - Agent Steering

See also `agent.md` (working style), `product.md`, `tech.md`, `structure.md`, `mcp.md`.

## Project Mission

Build and maintain a Lovecraftian horror experience that combines:

- Unity 6
- Procedural village generation
- AI-assisted development
- Modular environment systems
- Browser-playable JavaScript demo
- Shared game logic between Unity and Web

The project prioritizes deterministic behavior, testability, reproducibility, and clear separation between verified and unverified functionality.

---

## Core Engineering Principles

### 1. Logic First

All gameplay rules belong in `Packages/com.michaelinzo.frankenstein-village/Core`.

Core systems must:

- Be deterministic
- Avoid Unity dependencies
- Be unit-testable
- Support JavaScript parity

Runtime and editor systems wrap Core logic rather than reimplement it.

### 2. Single Source of Truth

When a rule exists in Core:

- Unity code must use it
- Web demo must mirror it
- Tests must validate it

Never duplicate gameplay calculations across implementations.

### 3. Verification Before Claims

Always distinguish VERIFIED from UNVERIFIED (see `agent.md` for the three-tier labels).

Only mark functionality as verified when supported by:

- Automated tests
- Successful execution
- Recorded validation

Do not claim Unity functionality works if it has not been executed in Unity.

### 4. Deterministic Horror

Randomness must be seed-driven. Given the same seed, sanity value and configuration, the system generates identical outputs.

Examples:

- Village layouts
- Door omens
- Whisper selection
- Dread transitions

---

## Code Organization

### Core (`Packages/com.michaelinzo.frankenstein-village/Core`)

Contains VillageLayoutGenerator, dread systems, sanity systems, procedural generation, reports, policies and data models.

Must not reference `UnityEngine`, `MonoBehaviour` or `ScriptableObject`.

### Runtime (`Packages/com.michaelinzo.frankenstein-village/Runtime`)

Contains scene behavior, visual effects, audio, HDRP integration and AI narration integration. Runtime consumes Core.

### Web (`web/`)

Contains JavaScript ports of Core logic. Changes to Core behavior require:

1. Updating C# tests
2. Updating parity data
3. Updating JS implementation
4. Passing parity verification

---

## Testing Requirements

Before committing:

```bash
dotnet test tests/Frankenstein.Core.Tests
node --test "web/test/*.test.js"
python3 tools/validate_repo.py
```

All tests must pass before merge.

---

## AI Agent Behavior

When making changes:

- Read existing architecture first.
- Prefer extending existing systems.
- Avoid introducing parallel implementations.
- Minimize framework complexity.
- Preserve deterministic behavior.
- Maintain parity between Core and Web.
- Keep gameplay logic out of Unity-specific code.

When uncertain, ask whether functionality belongs in Core or Runtime. Default to Core.

## Documentation Requirements

Update documentation when changing public APIs, gameplay rules, file structure, build steps or testing procedures.

Relevant files: `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `docs/`, `.kiro/`.

## Performance Preferences

Favor predictable execution, readable code, testability and deterministic outputs.

Avoid premature optimization, hidden state, global mutable configuration and non-deterministic side effects.

## Asset Handling Rules

Third-party assets must not be committed, must remain gitignored, and must follow repository validation policies.

Never add Unity packages, downloaded marketplace content or large generated artifacts unless explicitly approved.

## Commit Style

Format: `type: message`

Examples:

- `feat: add omen event escalation`
- `fix: correct village seed parity`
- `docs: update verification status`
- `test: add dread threshold coverage`
- `refactor: simplify layout generation`

Keep commits small and focused.

## Horror Design Philosophy

The project focuses on cosmic horror, psychological tension, environmental storytelling and emergent exploration.

Prefer subtle dread, atmospheric escalation and narrative ambiguity.

Avoid jump scares as a primary mechanic, excessive UI intrusion, and random behavior without narrative purpose.

Every feature should strengthen the feeling that the village itself is observing the player.
