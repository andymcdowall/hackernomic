# HTTP Game Server

## Overview

Extract the game loop from the CLI into a standalone Express HTTP server. The server is the single authority on game state and turn order. `NomicEngine` stays untouched — the server is an HTTP facade over it. Clients pass `playerId` in the request body (trust-based identity). State is persisted to a JSON file after every write action.

Started with `nomic server <game-file> [--port 3000]`.

## Bruno Collection

A Bruno API collection lives at `bruno/nomic-server/`. Each ticket that adds endpoints also creates the corresponding `.bru` request files. The collection uses a `local` environment with `baseUrl` set to `http://localhost:3000`.

---

## Tickets

### Ticket 01 — Server bootstrap & CLI command
**Branch:** ticket/http-game-server/01
**Depends on:** none
**Can run in parallel with:** none

**Scope:**
- Add `express` dependency
- Create `src/server/app.ts` — factory function that creates and configures an Express app, accepts a `NomicEngine` instance
- Create `src/server/server.ts` — loads game file, instantiates engine, starts listening on configured port
- Add `nomic server <game-file> [--port <n>]` subcommand to the CLI entry point

**Acceptance criteria:**
- `nomic server <file> --port 3000` starts without error
- `GET /state` returns 200 with JSON body (engine state)
- Unit test: app factory returns an Express app that responds 200 to `GET /state` with a minimal engine state injected
- Bruno: `bruno/nomic-server/` collection scaffolded with `bruno.json`, `environments/local.bru`, and `get-state.bru`

---

### Ticket 02 — GET endpoints
**Branch:** ticket/http-game-server/02
**Depends on:** ticket 01
**Can run in parallel with:** ticket 03

**Scope:**
- `GET /state` — returns full `GameState`
- `GET /rules` — returns `state.rules` array
- `GET /proposals` — returns active (unresolved) proposals from `state.proposals`

**Acceptance criteria:**
- Each endpoint returns the correct slice of game state as JSON with status 200
- Unit tests cover each endpoint with a mocked/seeded engine state
- `GET /proposals` filters to only unresolved proposals
- Bruno: `get-rules.bru`, `get-proposals.bru` added to the collection

---

### Ticket 03 — Setup endpoints
**Branch:** ticket/http-game-server/03
**Depends on:** ticket 01
**Can run in parallel with:** ticket 02

**Scope:**
- `POST /players` — body: `{ name: string }`, adds a player, returns `{ playerId }`
- `POST /start` — starts the game (calls `engine.start()`), returns updated state

**Acceptance criteria:**
- `POST /players` with a valid name adds the player and returns their ID
- `POST /players` with a missing/empty name returns 400
- `POST /start` transitions the game to started state and returns 200
- `POST /start` when game is already started returns 409
- Unit tests cover all above cases with a real or stubbed engine
- Bruno: `post-players.bru`, `post-start.bru` added to the collection

---

### Ticket 04 — Gameplay endpoints
**Branch:** ticket/http-game-server/04
**Depends on:** ticket 01, ticket 03
**Can run in parallel with:** ticket 02

**Scope:**
- `POST /propose` — body: `{ playerId, description, ruleText }`, creates a proposal
- `POST /vote` — body: `{ playerId, proposalId, value: 'yes' | 'no' }`, records a vote; server auto-resolves when all players have voted
- `POST /end-turn` — body: `{ playerId }`, advances to the next player's turn

**Acceptance criteria:**
- `POST /propose` creates a proposal and returns `{ proposalId }`
- `POST /vote` records the vote; if all players have voted, the proposal is auto-resolved before responding
- `POST /vote` is not turn-gated — any player can vote at any time
- `POST /end-turn` advances turn and returns updated state
- Unit tests cover: successful propose, vote from each player, auto-resolve on final vote, end-turn
- Bruno: `post-propose.bru`, `post-vote.bru`, `post-end-turn.bru` added to the collection

---

### Ticket 05 — Turn validation & error handling
**Branch:** ticket/http-game-server/05
**Depends on:** ticket 04
**Can run in parallel with:** ticket 06

**Scope:**
- Middleware or per-handler guard: write endpoints that are turn-gated (`POST /propose`, `POST /end-turn`) reject requests from a non-current player with 409
- `POST /vote` explicitly bypasses this check (any player may vote)
- 400 for malformed/missing required body fields on all write endpoints
- 404 for unknown `proposalId` on `POST /vote`

**Acceptance criteria:**
- `POST /propose` from a non-current player returns 409 with an explanatory message
- `POST /end-turn` from a non-current player returns 409
- `POST /vote` from any player (including non-current) returns 200 when valid
- Missing required fields return 400 on all write endpoints
- Unknown `proposalId` on `POST /vote` returns 404
- Unit tests cover every 4xx case above
- Bruno: no new request files; existing `.bru` files updated with example error-case bodies where helpful

---

### Ticket 06 — Persistence
**Branch:** ticket/http-game-server/06
**Depends on:** ticket 04
**Can run in parallel with:** ticket 05

**Scope:**
- After every successful write action (`POST /players`, `POST /start`, `POST /propose`, `POST /vote`, `POST /end-turn`), persist the current engine state to the game file via `GameStorage`
- On server startup, load existing state from file if it exists (resume mid-game)
- Errors during save are logged but do not fail the HTTP response (best-effort persistence)

**Acceptance criteria:**
- After each write endpoint succeeds, the game file on disk reflects the updated state
- Starting the server with a pre-existing game file resumes from that state (correct turn, rules, proposals)
- If save fails, the endpoint still returns 2xx and the error is logged
- Unit tests: mock `GameStorage`, verify `save()` is called after each write action; verify engine is seeded from `storage.load()` on startup
- Bruno: no new request files needed (persistence is transparent to the HTTP interface)
