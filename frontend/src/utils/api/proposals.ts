const PROPOSALS = {
  2956: {
    path: "/gpfs/exfel/exp/SCS/202202/p002956/",
    number: 2956,
    instrument: "scs",
    cycle: 202202,
    description: "",
    principal_investigator: "Justine Schlappa",
    title:
      "Ultrafast relaxation dynamics of spin and orbital excitations in photoexcited 1D Heisenberg chain Sr2CuO3",
    start_date: "2022-10-06T07:00:00.000+02:00",
    end_date: "2022-10-10T07:00:00.000+02:00",
    damnit: ["/gpfs/exfel/exp/SCS/202202/p002956/usr/Shared/amore"],
    permissions: {
      "entry='staff' identifier='group:staff:exfel_da'": 7,
    },
  },
  5709: {
    path: "/gpfs/exfel/exp/SCS/202401/p005709",
    number: 5709,
    instrument: "scs",
    cycle: 202401,
    description: "",
    principal_investigator: "Benjamin van Kuiken",
    title:
      "Enabling synthetic control of intersystem crossing dynamics in photoluminescent chromium complexes",
    start_date: "2024-05-29T07:00:00.000+02:00",
    end_date: "2024-06-02T07:00:00.000+02:00",
    damnit: ["/gpfs/exfel/exp/SCS/202401/p005709/usr/Shared/amore"],
    permissions: {
      "entry='staff' identifier='group:staff:exfel_da'": 7,
    },
  },
}

export function getCycles() {
  const proposals = Object.values(PROPOSALS)
  const cycles = new Set(proposals.map((proposal) => proposal.cycle))
  return [...cycles]
    .sort((a, b) => b - a)
    .map((cycle) => ({
      cycle,
    }))
}

export function getProposals(cycle = null) {
  const proposals = Object.values(PROPOSALS)
  return (
    cycle ? proposals.filter((proposal) => proposal.cycle === cycle) : proposals
  ).map((proposal) => ({
    id: proposal.number,
    proposal: proposal.number,
    instrument: proposal.instrument,
    principal_investigator: proposal.principal_investigator,
    start_date: proposal.start_date,
  }))
}

export function getProposal(proposal_num) {
  return PROPOSALS[proposal_num]
}
