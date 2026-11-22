# DAMNIT-web HZDR user guide

This short path is also available in the app under **Docs**.

1. Open **Workspace** (`/home`) and choose the campaign under **Sources**. Each
   campaign opens its source page (`/source/{source_key}`). If you do not see a
   campaign, ask the operator whether its catalog has been built; a missing
   campaign is not proof that its events were lost.
2. Use the **shot table** to filter and sort shots. Select a shot for its
   matched events, target and data previews. The target name opens its wiki
   page when LabFrog supplied a link. The campaign header has separate links
   to its SciCat dataset and campaign wiki when configured. The producer card
   summarizes events already in the catalog and links to **Flow Monitor**.
3. Open **Review matches** (`/review-matches`) for cases DAMNIT cannot settle.
   Every waiting event says **why it waits**. A shot marked *suggested* was
   picked by evidence other than raw time: shot-aligner paired it, the
   watchdog named it, or it is the only candidate without that instrument's
   file. Suggested shots, and triggers clearly closest in time, can be
   confirmed together. Files are never offered by time, because instrument
   clocks run minutes off. A file whose shot-aligner pairing a reviewer
   confirmed attaches by itself ("Confirmed in shot-aligner by a reviewer"),
   so reviewing a day in shot-aligner is the quickest way to clear its files.
   An **unassigned** shot has no reliable campaign yet. Assign it to the
   correct campaign; the builder moves it on its next run. For an **ambiguous**
   event, compare its trigger shot number, event time, candidate shot times,
   target, and existing match before confirming one candidate. If the evidence
   does not resolve it, leave it waiting.
4. An **unmatched** event has no candidate shot. Acknowledge it only when you
   have checked that it should remain unattached. Review decisions record who
   acted and when, and survive catalog rebuilds.

The trigger number and LabFrog's local Count are useful clues. The canonical
shot key identifies the actual record. A typed Count is not an authority shot
number, so do not confirm a match from the number alone.
