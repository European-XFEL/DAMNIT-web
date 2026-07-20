---
date: 2026-07-08
---

# ADR-009 - Subscriptions: channel consumers, composition-selected publisher

## Context and Problem Statement

The frontend's live table updates use a GraphQL subscription (`latest_data`) over `graphql-transport-ws`. DAMNIT proposal databases are plain SQLite files written by an external process. There is no change feed to subscribe to today, so the server must produce one by polling.

That will not stay true. Candidate event sources exist on the horizon: the facility Kafka bus, or Postgres `LISTEN/NOTIFY` should the application database move to Postgres. The subscription design must not weld resolvers to any one change-detection mechanism.

Two forces shape the design. Naive per-client polling multiplies identical reads: N subscribers to one proposal would issue N queries per tick against a GPFS-hosted SQLite file. And any process-local coordination state is a deployment constraint that must be a recorded decision with a retirement path, not an accident.

## Considered Options

- Per-client polling loops inside the resolver.
- Subscribers consume a channel; a composition-selected publisher produces events.

## Decision Outcome

Chosen option: "subscribers consume a channel; a composition-selected publisher produces events", because it keeps subscribers stable while the event source changes and coalesces reads structurally.

- Subscribers consume a per-proposal channel on Litestar's `ChannelsPlugin` and fan events to their client. Resolvers hold no polling loops, no cursors, and no knowledge of how an event was produced.
- Exactly one publisher per deployment is chosen in the composition root, the same composition-root selection as [ADR-008](008-local-mode-composition.md). Today it is a SQLite poller; a Postgres `LISTEN/NOTIFY` consumer or a Kafka bridge can replace it behind the same contract without touching subscribers.
- The poller reads each watched proposal once per tick through the repository ([ADR-005](005-repository-pattern.md)) and publishes new rows, so one poll serves every subscriber. Its per-proposal high-water mark is publisher-internal state, deleted with the poller when a push publisher lands.
- Each client passes its own `timestamp`; the resolver filters the shared event per client, so late joiners receive neither stale rows nor duplicates.
- Persistent publisher failures publish an error event and terminate affected subscriptions with a typed error ([ADR-001](001-error-classes.md)), so clients resubscribe deliberately rather than silently receiving nothing.

### Consequences

- Good: subscriber code is stable across the polling to push migration; the Postgres-versus-Kafka choice is deferred without accruing rewrite cost.
- Good: under polling, load scales with the number of watched proposals, not connected clients; under a push publisher the per-tick GPFS reads disappear.
- Bad: the process-local channels backend forces single-worker deployment for now, a constraint that must stay loud until retired.

## Details

The single-worker retirement plan, in order: move sessions and tokens to a store-backed server-side session; move the channels backend to a shared backend; make the publisher push-based (deleting the poller and its cursors) or, if polling must persist, run it once per deployment with store-backed cursors. After those steps nothing process-local remains that is not a cache (the per-repository caches of [ADR-005](005-repository-pattern.md)), and the startup guard is removed.

The event contract is that every new run is published to its proposal's channel exactly once, in order. Push publishers satisfy it natively. The polling publisher satisfies it with the high-water mark, initialised from the proposal's current max timestamp and advanced as new rows are seen.
