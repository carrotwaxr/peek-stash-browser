# Development Quality Initiative

**Status**: Phases 1-3 complete
**Date**: 2026-02-26

## Problem Statement

Peek has grown significantly over months of development, built primarily by Claude with human guidance. The current development workflow suffers from:

- **Whack-a-mole regressions**: Pushing a fix for one issue frequently introduces another, or doesn't address the original issue correctly on the first attempt. Multiple GitHub issues demonstrate this pattern.
- **Insufficient automated testing**: Tests exist but aren't exhaustive enough, and don't cover the app in the right ways. They catch some things but miss real-world regressions.
- **Poor feedback loop**: Relying on low-frequency, poor-quality, unreliable user reports to discover regressions. No internal QA process.
- **Context window limitations**: Claude has a finite context window and can't hold the entire app in memory. Session quality depends heavily on what gets loaded and how well the human prompts. This is the single largest hurdle.
- **Slowing velocity**: The compounding effect of all the above makes the project less fun and drastically slower to develop.

The goal: an extremely modern development environment where a session can start with minimal human guidance and produce a PR that is legitimately solid and worth the human's extremely limited time to manually review and test.

Put another way: Claude today is a short-term intern — capable but with no long-term memory, no accumulated expertise, and total dependence on the human to provide context and catch mistakes. The goal is to turn Claude into a true dev partner — a constantly-improving expert on Peek, Stash, and Stash-Box the same way a human teammate would grow over months and years of working on the project. A partner who learns from past sessions, remembers what broke last time, knows the domain deeply, and can be trusted to ship quality work with minimal supervision.

### Scope: Multi-Project Framework

While Peek is the starting point and most important project, the development methodology and infrastructure should be **portable across projects with different tech stacks**. The framework itself (lifecycle, brain architecture, CI patterns, QA workflow, Skills structure) should be general-purpose, with project-specific content (Skills, brain entries, test configs, CLAUDE.md) layered on top per-project. Peek is the proving ground; the system is the product.

---

## Notes & Ideas

### 1. TypeScript Strictness as a Foundation

With coding agents, the value of excellent TypeScript has increased dramatically. Strong types allow:

- **Self-documenting code**: The agent can understand contracts, relationships, and constraints by reading types alone, without needing to load extensive documentation into context.
- **Strict client-API contracts**: Shared types between server and client ensure changes on one side are immediately flagged on the other. No silent breakage.
- **Intellisense and type inspection**: When building client interfaces and components, proper types guide correct usage and catch errors at compile time rather than runtime.
- **Test data generation**: Well-typed interfaces make it straightforward to generate mock data, factory functions, and test fixtures that stay in sync with the actual data shapes.

To get maximum value, TypeScript must be composed with discipline:
- **DRY**: Single source of truth for types. No duplicated interfaces.
- **Modular/composable**: Types built from smaller, reusable pieces.
- **Strict mode**: No `any` escapes, no type assertions without justification.

### 2. Consistent Patterns and Reusable Code

Beyond TypeScript specifically, consistent architecture reduces the surface area for agent errors:

- **Uniform API structure**: Every endpoint follows the same patterns for request validation, response shaping, error handling, and pagination.
- **Reusable patterns**: When every query builder, controller, and service follows the same conventions, the agent can work on any part of the codebase with equal confidence.
- **Reduced cognitive load**: Fewer unique patterns means less context needed per session to do correct work.

### 3. Knowledge Architecture — CLAUDE.md as Orchestration Index

CLAUDE.md is uniquely powerful: it's the only artifact that is **always loaded** into every session, automatically, with no invocation step. This makes it the ideal thin orchestration layer, not a reference manual.

Current problem: CLAUDE.md tries to be both index *and* encyclopedia (database schemas, service inventories, env vars). In the new model, it becomes a bootstrap file that:
- Orients Claude on what the project is (brief)
- Declares what knowledge systems exist and when to reach for each
- Establishes lifecycle rules ("every branch must pass X before PR")
- Points to the right Skill for each phase of work

The knowledge stack:

```
CLAUDE.md (always loaded — orchestration index)
  │
  ├── Brain/MCP (on-demand, queryable project memory)
  │     Architecture decisions, entity relationships,
  │     known pitfalls, pattern inventories, change rationale
  │
  ├── Skills (on-demand, invoked per task phase)
  │     How to write tests, do releases, review code, etc.
  │
  └── MkDocs (human-facing docs, also queryable by agent)
        Feature documentation, user guides
```

Each layer has a distinct role:
- **CLAUDE.md**: "What tools do you have and when to use them" (always present)
- **Brain**: "What do we know about this project" (queryable on demand)
- **Skills**: "How to do things in this project" (invoked per task)
- **MkDocs**: "What does the app do for users" (reference)

### 4. Context Window Strategies

The limited context window is the biggest challenge. Potential solutions span a spectrum:

#### A Persistent "Brain" — Beyond Docs
- The public MkDocs documentation is vital and must be part of every branch lifecycle, but it's written for human users, not for Claude. It explains *what the app does* but not the deeper architectural knowledge, patterns, conventions, gotchas, and decision history that Claude needs to work effectively.
- What's needed is a separate, agent-oriented knowledge store — a "brain" with better memory than Claude has natively. This could be:
  - A local SQLite database that Claude maintains and queries, storing structured information about the app: architecture decisions, entity relationships, known pitfalls, pattern inventories, change history rationale, etc.
  - An MCP server to interact with this knowledge base, allowing Claude to pull relevant context on-demand rather than relying on what fits in the prompt or what the human remembers to provide.
  - Something that grows smarter over time as Claude adds learnings from each session, unlike static docs that only get updated during explicit documentation tasks.
- This is distinct from CLAUDE.md and Skills (which are instructions/checklists) and from MkDocs (which is user-facing). The brain is Claude's own structured memory of the project.

#### Enhanced Skills and Instructions
- More comprehensive, well-maintained Skills that encode patterns, conventions, and checklists.
- Skills that are specific enough to guide correct implementation without requiring full codebase context.
- Skills and the brain are complementary: Skills say "how to do things," the brain says "what we know about this project."

#### Rigid Workflow Lifecycle
- Strict ticket/branch lifecycle with rigid checks at multiple points.
- Each phase (planning, implementation, testing, review) has explicit gates and validation.
- Automated checks that catch issues before they reach human review.

### 5. Testing Strategy Overhaul

Current tests are insufficient. The vision is closer to a team of QA agents:

#### Exhaustive Automated Coverage
- Vastly improved unit and integration test coverage.
- Tests that cover the app "the right way" - not just happy paths but edge cases, error states, and interaction patterns that actually break in production.

#### Headless Browser Testing
- An actual headless client that browses the app like a real user.
- Navigate pages, interact with UI elements, verify visual state, test flows end-to-end.
- Could potentially even test video playback behavior.

#### Realistic Test Environments
- Spin up a fresh container and database for each test run.
- Copy the actual production Peek database from unRaid to run tests against real data shapes and volumes.
- Long-running test databases that maintain state for various scenario testing.

#### CI Integration
- **Free CI confirmed.** The repo is public, so GitHub Actions is completely free with unlimited minutes. We should run full test suites in CI on every PR — no reason not to. Claude should also run tests locally before creating a PR (belt and suspenders), but CI provides the authoritative, reproducible gate.
- No PR merges without passing test suites (whether CI or local).
- Coverage thresholds that prevent regression in test quality.

#### Minimal Manual Testing
- The goal is an extremely minimal list of things requiring personal manual testing before release.
- Automate everything that can be automated, even things that seem hard (video playback, drag-and-drop, complex UI interactions).

---

## Research: 2026 Landscape (February 2026)

The "Knowledge & Memory" category is the single largest in the MCP ecosystem (283+ servers as of Jan 2026). This space is moving fast.

### Agent Memory / Brain — MCP Servers

| Project | Type | Key Feature | Maturity |
|---------|------|-------------|----------|
| **[agent-recall](https://github.com/mnardit/agent-recall)** | MCP + SQLite | Scoped knowledge graph with bitemporal storage (old values archived, queryable). Battle-tested with 30+ Claude Code agents in production daily. | Production-proven, most polished for Claude Code |
| **[OpenMemory (Mem0)](https://mem0.ai/openmemory)** | MCP, local-first | Cross-tool memory sharing (Claude + Cursor share memories). Tags by type (preference, decision, etc.) | Backed by Mem0 (established company) |
| **[MemCP](https://github.com/maydali28/memcp)** | MCP for Claude Code | Implements MIT CSAIL RLM framework. 4-graph model (semantic, temporal, causal, entity). Independent context windows for sub-agents. 3-zone retention. | Research-backed, ambitious |
| **[Subcog](https://github.com/zircote/subcog)** | MCP (Rust) | Hybrid search (semantic + BM25), 97% factual recall accuracy. *Proactive* memory surfacing — pushes relevant memories without being asked. | Newer but strong benchmarks |
| **[Mnemograph](https://github.com/tm42/mnemograph)** | MCP | Event-sourced knowledge graph with git-based version control of the graph itself. | Lightweight, focused |
| **[Recall](https://github.com/joseairosa/recall)** | MCP (cloud or self-hosted) | Semantic search via vector embeddings (7 providers: Voyage AI, Cohere, OpenAI, Deepseek, Grok, Anthropic, Ollama). Auto-consolidation clusters and deduplicates similar memories. Workspace isolation. Team sharing. | Polished, most advanced search |
| **[Anthropic's official memory server](https://github.com/modelcontextprotocol/servers)** | MCP (reference) | Knowledge graph as local JSON. Simple and reliable. Good starting point. | Official reference impl |

### Codebase Knowledge Graph / Code Intelligence

| Project | Type | Key Feature | Maturity |
|---------|------|-------------|----------|
| **[GitNexus](https://github.com/abhigyanpatwari/GitNexus)** | CLI + MCP + visualizer | Indexes codebase into knowledge graph with blast radius analysis, git-diff impact mapping. TypeScript/JS/Python/Go/Rust/Java/C support. | Trending on GitHub (1,200+ stars, Feb 2026) |
| **[Augment Code](https://www.augmentcode.com/)** | IDE plugin + MCP | Semantic dependency graph of entire codebase. 30-80% quality improvement when paired with other agents. Now available as MCP server (Feb 2026). | Commercial, enterprise-grade |
| **[Cognee](https://github.com/topoteretes/cognee)** | Library + MCP | Extract-Cognify-Load pipelines, builds interconnected knowledge graphs automatically. Connects to Claude Agent SDK over MCP. | Open source + commercial backing |
| **[Code-Graph-RAG](https://github.com/vitali87/code-graph-rag)** | Open source | Tree-sitter based codebase analysis, natural language querying of code structure. | Active development |

### AI QA Testing Agents

| Project | Type | Key Feature | Maturity |
|---------|------|-------------|----------|
| **[Playwright MCP (Microsoft)](https://playwright.dev/)** | Official MCP server | Connects AI agents to Playwright browser automation. Uses accessibility tree (not screenshots). Built into GitHub Copilot. | Production-ready, industry standard |
| **[Momentic](https://momentic.ai/)** | SaaS | AI explores app, finds critical flows, generates tests. Intent-based locators that survive DOM changes. Used by Notion, Quora, Webflow. | Commercial, well-funded (YC W24) |
| **[Bug0](https://bug0.com/)** | SaaS + managed QA | Playwright-based AI QA. "Managed" tier provides a dedicated QA pod (engineers + AI) that owns release sign-offs. | Commercial |
| **[mcp-playwright (community)](https://github.com/executeautomation/mcp-playwright)** | MCP server | Community Playwright MCP for Claude Desktop/Cursor/Cline. Browser + API automation. | Active community |

### CI/CD Code Review

| Project | Type | Key Feature | Maturity |
|---------|------|-------------|----------|
| **[Greptile](https://www.greptile.com/)** | SaaS + GitHub/GitLab | Full-codebase graph understanding (not just diff-level). Multi-hop investigation across files. ~3 min review time. Uses Claude Agent SDK. | YC-backed, production |
| **Claude Code Desktop** | CLI/Desktop | As of Feb 2026: automated code review, live app preview, background CI failure triage. Can read CI logs, propose patches, open PRs. | First-party Anthropic |
| **[Bito](https://docs.bito.ai/)** | CI/CD integration | AI review agent that integrates into Jenkins, GitLab CI, Argo CD. Triggers on every code change. | Commercial, established |

### Coding Agents with Built-in Memory

| Project | Type | Key Feature | Maturity |
|---------|------|-------------|----------|
| **[Amp (Sourcegraph)](https://ampcode.com/)** | CLI/IDE agent | "Persistent Threads" as living memory. Sub-agents for specialized tasks. `.AGENT.md` config files. Remembered naming conventions and patterns during large refactors. | Commercial, from Sourcegraph |

### Temporal Knowledge Frameworks

| Project | Type | Key Feature | Maturity |
|---------|------|-------------|----------|
| **[Graphiti (Zep)](https://github.com/getzep/graphiti)** | Open source framework | Temporally-aware knowledge graph. 300ms P95 retrieval, zero LLM calls during retrieval. Outperforms MemGPT on Deep Memory Retrieval benchmarks. Published arXiv paper. | Well-established, research-backed |

### Synthesized Assessment for Peek

#### Recommended Toolchain

**1. agent-recall — Project Memory Brain**
- *Role*: Persistent knowledge store for architecture decisions, conventions, known pitfalls, domain expertise (Stash API quirks, StashDB edit workflows, HLS proxy gotchas).
- *How it works*: SQLite-backed knowledge graph with entities, typed relations, scoped key-value slots (with version history), and freeform observations. 9 MCP tools. Claude gets behavioral instructions to proactively save important info. Session-start hook injects a "briefing" summarizing project knowledge.
- *Setup*: `pip install 'agent-recall[mcp]'`, MCP config entry, Claude Code hooks config. ~5 minutes.
- *Multi-project*: Each project dir becomes its own scope automatically. Global scope for cross-project knowledge (e.g., "user prefers conventional commits").
- *Concerns*: Very new (v0.2.4, Feb 2026). No semantic search (LIKE-based). Agent doesn't always save without nudging. Python dependency alongside Node/TS. Briefing generation uses an LLM call.
- *Mitigation*: Could build our own tighter integration if needed. Or adopt and contribute fixes. The concept is proven even if this specific implementation is young.

**2. GitNexus — Code Structure Intelligence**
- *Role*: Understands what code is connected to what. Blast radius analysis before changes. Impact mapping of git diffs. Execution flow tracing.
- *How it works*: Tree-sitter AST parsing into KuzuDB graph database. Indexes functions, classes, interfaces, call chains, imports, inheritance. Auto-detects functional clusters. 7 MCP tools including `impact` (blast radius), `detect_changes` (git-diff risk), `context` (360-degree symbol view), `cypher` (raw graph queries).
- *Setup*: `npx gitnexus analyze`, `npx gitnexus setup`. ~5 minutes. Re-index after code changes (full rebuild, 30s-2min for our size).
- *TypeScript*: Solid support — tsconfig path aliases, barrel exports, PascalCase components, Express controller detection.
- *Blind spots*: JSX composition (`<Component />` not traced as a call), Express middleware chains, dynamic dispatch, no `node_modules` resolution, 512KB file size limit (may skip generated graphql.ts).
- *Concerns*: **Non-commercial license** (PolyForm Noncommercial 1.0.0) — fine for Peek as open source but constraining if ever commercialized. No incremental indexing. 8GB heap for analyzer.

**How they complement each other:**
- GitNexus: "There are 23 callers of `proxyStashStream()` and 3 execution flows through `video.ts`. Changing this function is HIGH risk."
- agent-recall: "The video proxy deliberately strips API keys from segment URLs for security. HLS playlist URL rewriting is fragile — always test with multi-instance configurations. Last time we touched this (Jan 2026), it broke playlist sharing."

**3. Playwright MCP — Browser QA**
- *Role*: Claude live-browses the running app for smoke testing AND writes proper `.spec.ts` test files for CI.
- *How it works*: 22 MCP tools for navigation, interaction, observation. Uses accessibility tree (not screenshots) — deterministic, low-token, works headless. Claude reads structured text describing the page and acts on ref-numbered elements.
- *Setup*: One MCP config entry with `npx -y @playwright/mcp@latest`. No npm install needed. Zero config.
- *Two modes*: (A) Interactive QA via MCP — Claude browses the app in real time. (B) Written test suite — Claude writes `.spec.ts` files informed by browsing, runs via `npx playwright test`.
- *For our app specifically*:
  - **Auth**: HTTP-only JWT cookies handled natively. Login once, save `storageState`, reuse.
  - **Video**: Can test player init, playback start, no console errors. Can't verify HLS segment-level correctness (integration tests cover that).
  - **Proxied images**: Can assert loaded (`naturalWidth > 0`), network hits proxy. Don't do visual regression.
  - **Multi-instance**: UI flows testable. Routing logic covered by existing integration tests.

**4. GitHub Actions CI — Free Quality Gate**
- *Role*: Authoritative, reproducible test gate on every PR.
- *Cost*: Free (public repo, unlimited minutes).
- *Runs*: Unit tests (Vitest), integration tests, Playwright E2E tests, TypeScript compilation, linting.
- *Artifacts*: HTML test reports, Playwright traces on failure.
- *Belt and suspenders*: Claude also runs tests locally before creating PRs (enforced by Skills).

#### What This Stack Looks Like in Practice

```
Session Start
  │
  ├── agent-recall injects briefing: project decisions, patterns, known issues
  ├── CLAUDE.md loaded: lifecycle rules, tool pointers, conventions
  ├── Skills available: testing, reviewing, releasing, etc.
  │
  ▼
Working on a Ticket
  │
  ├── GitNexus: "What's the blast radius of this change?" (before coding)
  ├── agent-recall: "What do we know about this area?" (before coding)
  ├── Implementation (guided by Types, patterns, conventions)
  ├── Playwright MCP: smoke test the change in the running app
  ├── Write/run Playwright + Vitest tests
  ├── agent-recall: save new learnings from this session
  │
  ▼
Creating PR
  │
  ├── Local: all tests pass, lint clean, TS compiles
  ├── Self-review via Skill
  ├── Push + create PR
  ├── GitHub Actions: full test suite runs in CI
  ├── Human: reviews diff, does minimal manual testing
  │
  ▼
Post-Merge
  ├── agent-recall: update brain with outcomes, gotchas discovered
  ├── GitNexus: re-index on next session
```

---

## Key Insight: Discipline as Encoded Process

The single most important realization from this initiative's brainstorming: **discipline is not an inherent agent quality — it's process infrastructure that constrains the agent's degrees of freedom.**

The concern that tooling alone won't guarantee quality (because "the most vital layer is discipline") was initially framed as if discipline must come from the agent itself. But discipline can be encoded through structure:

- The existing superpowers skill system is living proof. `using-superpowers` uses "even a 1% chance" language, a red flags table anticipating rationalization patterns, and mandatory invocation before any response. That *is* encoded discipline — it works because it operates at the system prompt layer, before the agent starts thinking.
- Skills, lifecycle gates, and session commands don't require the agent to *choose* to be disciplined. They make undisciplined behavior structurally difficult.

### The Enforcement Hierarchy

Each layer catches what the layer above misses:

```
1. Session initialization commands    ← sets rails before work begins
2. CLAUDE.md as orchestration index   ← always loaded, always enforced
3. Skills (properly named/keyworded)  ← triggered by pattern matching
4. Strict branch/ticket lifecycle     ← gates at every phase transition
5. Brain/memory (whatever tool)       ← context that prevents repeat mistakes
```

- **Layer 1** prevents the "cold start" problem — agent jumping into code without context.
- **Layer 2** prevents skipping lifecycle phases.
- **Layer 3** encodes *how* to do each phase correctly.
- **Layer 4** prevents bad work from advancing.
- **Layer 5** prevents repeating past mistakes.

### What This Means for Implementation Order

The brain (Layer 5) should be the **last** piece added, not the first. The layers above it provide more immediate, concrete value and don't depend on new tooling. The brain amplifies the value of a well-structured system but can't compensate for a poorly-structured one.

### Realistic Goal

The goal is **not** full agent autonomy producing magic. The goal is **preventing mistakes from lack of context and session randomness**. This is achievable through process infrastructure. The human still reviews, still makes judgment calls, still directs — but the agent arrives at each session with guard-rails already in place and relevant context already loaded.

---

## Skill Architecture: Current State

### Four-Tier Structure

```
~/.agents/skills/              ← Master definitions for shared generic skills (17 files)
    │
    ├── (symlinked into)
    ▼
~/.claude/skills/              ← Global access point (16 symlinks + 21 originals)
    │                             Includes stash ecosystem skills as originals
    │
    ├── (visible to all projects)
    ▼
~/code/<project>/.claude/skills/  ← Project-specific skills (release, testing, etc.)
    │
    └── superpowers plugin         ← 14 skills + 3 commands (cached plugin)
```

### Current Inventory

| Location | Count | Contents |
|----------|-------|----------|
| `~/.agents/skills/` | 17 | Generic tech skills (Vite, Vitest, Prisma, React, Tailwind, etc.) |
| `~/.claude/skills/` (symlinks) | 16 | Point to `~/.agents/skills/` via relative paths |
| `~/.claude/skills/` (originals) | 21 | Stash ecosystem (6), backend patterns (4), DB/perf (4), workflow (4), other (3) |
| `peek-stash-browser/.claude/skills/` | 8 | Release workflows, testing, docs, visual style, self-review |
| `stash-sense/.claude/skills/` | 4 | Context, DB ops, releases |
| `stash-sense-trainer/.claude/skills/` | 3 | DB ops, releases |
| `stash-plugins/.claude/skills/` | 1 | Self-review |
| `~/code/.claude/skills/` | 1 | docker-publish (cross-project) |
| Superpowers plugin | 14+3 | Brainstorming, planning, execution, debugging, TDD, review, etc. |

### Scoping Decision: Project-First with Symlinked Shared Skills

**Principle**: Skills should be project-scoped by default. Shared skills (stash, stash-box, unraid, etc.) should exist as a single source of truth and be symlinked wherever needed — no drifting copies.

**Current gap**: The `~/.agents/skills/` → `~/.claude/skills/` symlink pattern works well for generic tech skills (Vite, Prisma, etc.), but the 6 Stash ecosystem skills (stash, stash-box, stash-plugin-dev, deploy-dev-plugin, unraid, xxx-scrapers) are originals in `~/.claude/skills/`, not symlinked from a master location. These should follow the same pattern.

**Proposed structure**:
- Move Stash ecosystem skills to `~/.agents/skills/` as the master location
- Symlink them into `~/.claude/skills/` (same pattern as existing 16 symlinks)
- Project-specific skills stay in `<project>/.claude/skills/`
- No skill should exist as a copy in multiple locations

---

## Test Case: User Restrictions (Issue #412)

### Why This Issue

User content restrictions is a recurring, high-stakes bug — the perfect validation case for the improved development process:

- **#200** (2026-01-01): "Scenes with excluded tags being shown when sorting" — exclusion filtering failure
- **#378** (2026-02-18): "Fix integration test failures: SQLite contention in ExclusionComputationService" — concurrency issues in the same service
- **#412** (2026-02-23): "User Based Content Restrictions Are Being Ignored" — instance-scoped exclusion filtering completely broken

### Known Root Causes (from #412)

1. **Field name mismatch**: `ExclusionComputationService` checked for `stashInstanceId` but normalized entities use `instanceId`. Instance-scoped exclusions were silently ignored in minimal endpoints, playlists, and carousels.
2. **Race condition**: Stash sync triggering recompute while restrictions are being saved → restriction-triggered recompute returns early with stale results.
3. **Stale UI cache**: Admin group filter dropdown showing 4 deleted groups instead of existing groups.

### How We'll Use It

After the infrastructure improvements (Phases 1-3) are in place, we'll pick up this issue using the new process:
1. `/start-session` loads context about the ExclusionComputationService, past failures, known gotchas
2. Skill-guided investigation and fix
3. Comprehensive test coverage (unit, integration, E2E) specifically for exclusion filtering
4. CI validates the fix
5. Brain records the learnings: field naming gotcha, race condition pattern, which endpoints are affected

This validates the entire system: did the improved process prevent the kind of mistakes that caused this bug to recur three times?

### Related Enhancement

**#411** (open): "View As..." feature — allow admins to browse as a specific user without logging in. Would make restriction testing dramatically easier for the human reviewer.

---

## Areas to Explore in Brainstorming

### 1. Session Initialization Command Design

The most impactful missing piece. Currently, session start is entirely passive:
1. CLAUDE.md loads (passive)
2. Auto-memory loads (passive, currently empty)
3. Superpowers skill checks (reactive — waits for first message)

What's needed is an **active orientation phase** — a `/start-session` or `/init` command that:
- Reads the current branch name and infers the ticket/task context
- Queries the brain (when available) for relevant knowledge about the area being worked on
- Checks git status for any in-progress work
- Loads the relevant plan document if one exists
- Presents a briefing: "You're on branch `fix/video-proxy-multiinstance`. Here's what the brain knows about video proxying. Last session on this area broke playlist sharing. There's an open plan doc at X."

This is the equivalent of a developer reading their notes before starting work. It eliminates the #1 source of session randomness: the agent starting with zero project-specific context and depending entirely on prompt quality.

**Design questions:**
- Should this be a single `/init` command or split into `/init` (start fresh work) and `/resume` (continue existing branch)?
- Should it be mandatory (enforced by CLAUDE.md rules) or opt-in?
- What information sources should it pull from? (branch name, git log, plan docs, brain, ticket system)
- Should it produce a structured briefing that the human confirms before work begins?

### 2. Skill Triggering Audit

There are 50+ skills. Skill matching relies on keyword/description matching against the user's message. A skill named `express5-api-patterns` won't trigger if the user says "add a new route handler" unless the description catches that phrasing.

**Questions:**
- Which skills fail to trigger on natural phrasings? (Requires systematic testing)
- Are there skills that overlap and compete? (Causing wrong skill selection)
- Are there gaps — common tasks with no skill?
- Should skills have explicit trigger aliases beyond the description field?
- Is the 50+ count too many? Should some be merged or retired?

### 3. CLAUDE.md Restructuring

Current CLAUDE.md contains reference material (database schemas, service inventories, env vars) that should live in skills or docs. It needs to become a thin orchestration index.

**Questions:**
- What's the minimum CLAUDE.md content that still orients the agent effectively?
- Which current CLAUDE.md sections should become skills vs. brain entries vs. MkDocs pages?
- How do we ensure the orchestration index doesn't drift back into an encyclopedia over time?

### 4. Lifecycle Gate Definition

What must be true at each phase transition?

**Gates to define:**
- Before creating a branch (ticket exists? plan reviewed?)
- Before writing code (blast radius understood? relevant context loaded?)
- Before creating a PR (tests pass? lint clean? self-review done? docs updated?)
- Before merging (CI passes? human review done?)
- After merging (brain updated? release notes drafted?)

### 5. Brain Tool Selection

Deferred to Phase 5, but initial assessment:

| Tool | Pros | Cons | Infrastructure |
|------|------|------|----------------|
| **Recall** | Best search (semantic vectors), auto-consolidation, workspace isolation | Requires Redis/Valkey, cloud dependency option | Self-host Redis on unraid |
| **agent-recall** | Simplest (SQLite), zero deps, scoped by project dir | Weak search (LIKE-based), very new, Python dep | None — runs locally |
| **Built-in auto-memory** | Already works, zero setup | Unstructured, no query capability | None |
| **Custom MCP** | Exactly what we need, no compromises | Build & maintain effort | SQLite locally or on unraid |

The value isn't in sophisticated retrieval — it's in the **discipline of writing and reading the brain at specific lifecycle points**, enforced by skills and commands. A simple store with explicit read/write points in the workflow gets 80% of the value. Infrastructure isn't a constraint — Redis, Valkey, or any dependency can run on the unraid server or locally on the dev VM.

---

## Decisions

### D1: Implementation order — tighten existing infrastructure first, brain last

**Rationale**: The enforcement hierarchy makes clear that Layers 1-4 (session init, CLAUDE.md, skills, lifecycle gates) provide more immediate value and don't depend on new tooling. The brain amplifies a well-structured system but can't compensate for a poorly-structured one.

### D2: Brain tool choice deferred to Phase 5

**Rationale**: The specific tool matters less than the lifecycle integration. Any of the options (Recall, agent-recall, custom) would work. We can make a better decision after the rest of the infrastructure is in place and we understand the actual read/write patterns. Infrastructure (Redis, etc.) can be spun up on unraid or locally when needed.

### D3: GitHub Actions CI is a no-brainer — set up early

**Rationale**: Free (public repo), immediate concrete value, no controversial decisions. The most tangible quality improvement with the least effort.

### D4: Session initialization is the highest-impact new capability

**Rationale**: Eliminates the #1 source of session randomness (cold starts with no context). Everything else we build feeds into making the session init briefing more complete and useful.

### D5: Skill audit before skill expansion

**Rationale**: No point adding more skills if existing ones don't trigger reliably. Audit first, fix gaps, then expand.

---

## Implementation Phases

### Phase 1: Audit and Tighten Existing Infrastructure

**Goal**: Maximize value from what we already have before adding anything new.

**Tasks:**
1. **Skill triggering audit** — Test every skill against natural phrasings. Document which trigger reliably and which don't. Fix descriptions, keywords, and naming.
2. **Skill gap analysis** — Identify common tasks with no skill, overlapping skills, and skills that should be merged or retired.
3. **CLAUDE.md restructuring** — Slim it down to a true orchestration index. Move reference material (database schemas, service inventories, env vars) into appropriate skills or docs.
4. **Review existing lifecycle skills** — Evaluate `work-ticket`, `finishing-a-development-branch`, `self-review`, `verification-before-completion`, etc. Are they correctly sequenced? Do they enforce the right things?

**Output**: Reliable skill system, clean CLAUDE.md, documented gaps.

### Phase 2: Lifecycle Enforcement and Session Init

**Goal**: Encode the development lifecycle as structural constraints.

**Tasks:**
1. **Design `/start-session` command** — Branch detection, plan loading, context briefing, in-progress work detection. Decide on single command vs. `/init` + `/resume` split.
2. **Define lifecycle gates** — Explicit requirements at each phase transition (branch creation → implementation → PR → merge → post-merge).
3. **Build/extend lifecycle skills** — Encode gates into skills. Extend `work-ticket`, `finishing-a-development-branch`, or create new phase-transition skills.
4. **Ticket integration** — Wire up the GitHub Project board so `/start-session` can pull ticket context.
5. **CLAUDE.md lifecycle rules** — Add mandatory lifecycle rules to the orchestration index ("every branch must pass X before PR").

**Output**: Session init command, lifecycle gates enforced by skills, ticket-branch-PR flow.

### Phase 3: CI/CD Pipeline

**Goal**: Authoritative, reproducible quality gate on every PR.

**Tasks:**
1. **GitHub Actions setup** — Workflow file with unit tests (Vitest), TypeScript compilation, linting.
2. **Integration test stage** — Run against test Stash instance (`stash-test` on unraid). Handle credentials via GitHub Secrets.
3. **Playwright E2E stage** — Headless browser tests in CI. Playwright MCP for local interactive QA during development.
4. **Branch protection rules** — Require CI pass before merge. No direct pushes to main.
5. **Artifact collection** — HTML test reports, Playwright traces on failure, coverage reports.
6. **Wire into lifecycle skills** — Skills enforce "CI must pass" as a gate before merge.

**Output**: Full CI pipeline, branch protection, Playwright MCP available for development.

### Phase 4: Testing Coverage Expansion

**Goal**: Tests that catch real-world regressions, not just happy paths.

**Tasks:**
1. **Playwright E2E test suite** — Critical user flows: login, browse library, play video, manage playlists, multi-instance switching.
2. **Unit/integration coverage for high-risk areas** — Video proxy, HLS rewriting, multi-instance routing, sync service, query builders.
3. **Test data fixtures** — Reliable, reproducible test environments. Fresh container + database per run where needed.
4. **Coverage thresholds** — Prevent regression in test quality. Enforce in CI.
5. **Identify remaining manual-only tests** — Minimal list of things that genuinely require human eyes.

**Output**: Comprehensive test suite, coverage thresholds in CI, minimal manual testing list.

### Phase 5: Brain Integration

**Goal**: Persistent project memory that grows smarter over time.

**Tasks:**
1. **Select tool** — Evaluate Recall, agent-recall, or custom MCP based on actual needs observed during Phases 1-4. Spin up any required infrastructure (Redis/Valkey on unraid, or SQLite locally).
2. **Wire into session init** — Brain briefing injected at session start via `/start-session`.
3. **Wire into lifecycle** — Save learnings on PR merge, record decisions, capture gotchas.
4. **Seed with existing knowledge** — Populate brain with architecture decisions, known pitfalls, domain expertise from existing docs and plan history.
5. **Cross-project scoping** — Ensure the brain architecture supports multiple projects (Peek, stash-sense, xxx-scrapers) with shared and project-specific knowledge.

**Output**: Persistent brain, integrated into session lifecycle, seeded with project knowledge.

---

## Appendix: Brain Tool Research (Additional Findings)

Additional tools discovered during expanded research (Feb 2026):

| Project | Type | Key Feature | Maturity |
|---------|------|-------------|----------|
| **[MCP Memory Service](https://github.com/doobidoo/mcp-memory-service)** | MCP | Knowledge graph + autonomous consolidation. REST API for integration with LangGraph, CrewAI, AutoGen. | Active, multi-framework |
| **[MCP Memory Keeper](https://github.com/mkreyman/mcp-memory-keeper)** | MCP | Persistent context management specifically for AI coding assistants. | Focused on coding |
| **[Memory-MCP](https://github.com/yuvalsuede/memory-mcp)** | MCP | Auto-updates a memory summary in CLAUDE.md on session start. Full searchable memory store in `.memory/` directory. | Simple, clever approach |

The "Knowledge & Memory" category remains the largest in the MCP ecosystem (283+ servers as of Jan 2026). The space is maturing rapidly — by the time we reach Phase 5, the landscape may look quite different. This reinforces the decision to defer tool selection.
