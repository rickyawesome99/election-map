// National popular vote aggregates by race type and year.
// margin: rep_pct - dem_pct (positive = Rep wins, negative = Dem wins)
// voteMargin: rep_votes - dem_votes (same sign convention)
// presMargin: net presidential approval (app - disapp) at time of election

export type PopVoteRow = {
  year: number;
  type: "President" | "House" | "Senate" | "Governor";
  totalRaces: number;
  demPct: number;
  repPct: number;
  margin: number;
  demVotes: number;
  repVotes: number;
  voteMargin: number;
  totalVotes: number;
  rcpFinal: number | null;
  presInc: "Obama" | "Trump" | "Biden";
  presApp: number;
  presDisapp: number;
  presMargin: number;
};

// presInc party: Obama/Biden = Dem, Trump = Rep
export function presIncParty(presInc: PopVoteRow["presInc"]): "dem" | "rep" {
  return presInc === "Trump" ? "rep" : "dem";
}

export const popVoteData: PopVoteRow[] = [
  // President
  { year: 2016, type: "President", totalRaces: 50,  demPct: 48.2, repPct: 46.1, margin: -2.1,  demVotes: 65853514, repVotes: 62984828, voteMargin:  -2868686, totalVotes: 136669276, rcpFinal: -3.2, presInc: "Obama", presApp: 52.4, presDisapp: 44.6, presMargin:   7.8 },
  { year: 2020, type: "President", totalRaces: 50,  demPct: 51.3, repPct: 46.8, margin: -4.5,  demVotes: 81283501, repVotes: 74223975, voteMargin:  -7059526, totalVotes: 158429631, rcpFinal: -7.2, presInc: "Trump", presApp: 45.9, presDisapp: 52.5, presMargin:  -6.6 },
  { year: 2024, type: "President", totalRaces: 50,  demPct: 48.3, repPct: 49.8, margin:  1.5,  demVotes: 75017613, repVotes: 77302580, voteMargin:   2284967, totalVotes: 155238302, rcpFinal: -0.1, presInc: "Biden", presApp: 41.0, presDisapp: 56.2, presMargin: -15.2 },

  // House
  { year: 2016, type: "House", totalRaces: 435, demPct: 47.3, repPct: 48.3, margin:  1.0, demVotes: 61417454, repVotes: 62772225, voteMargin:   1354771, totalVotes: 129833250, rcpFinal: -0.6, presInc: "Obama", presApp: 52.4, presDisapp: 44.6, presMargin:   7.8 },
  { year: 2018, type: "House", totalRaces: 435, demPct: 53.4, repPct: 44.8, margin: -8.6, demVotes: 60572245, repVotes: 50861970, voteMargin:  -9710275, totalVotes: 113412989, rcpFinal: -7.3, presInc: "Trump", presApp: 43.5, presDisapp: 53.2, presMargin:  -9.7 },
  { year: 2020, type: "House", totalRaces: 435, demPct: 50.3, repPct: 47.2, margin: -3.0, demVotes: 77122690, repVotes: 72466576, voteMargin:  -4656114, totalVotes: 153431405, rcpFinal: -6.8, presInc: "Trump", presApp: 45.9, presDisapp: 52.5, presMargin:  -6.6 },
  { year: 2022, type: "House", totalRaces: 435, demPct: 47.3, repPct: 50.0, margin:  2.7, demVotes: 51280463, repVotes: 54227992, voteMargin:   2947529, totalVotes: 108443387, rcpFinal:  2.5, presInc: "Biden", presApp: 42.1, presDisapp: 54.6, presMargin: -12.5 },
  { year: 2024, type: "House", totalRaces: 435, demPct: 47.2, repPct: 49.7, margin:  2.6, demVotes: 70571330, repVotes: 74390864, voteMargin:   3819534, totalVotes: 149543421, rcpFinal:  0.3, presInc: "Biden", presApp: 41.0, presDisapp: 56.2, presMargin: -15.2 },

  // Senate
  { year: 2016, type: "Senate", totalRaces: 34, demPct: 53.0, repPct: 42.2, margin: -10.8, demVotes: 51315969, repVotes: 40841717, voteMargin: -10474252, totalVotes:  96866509, rcpFinal: null, presInc: "Obama", presApp: 52.4, presDisapp: 44.6, presMargin:   7.8 },
  { year: 2018, type: "Senate", totalRaces: 35, demPct: 57.7, repPct: 38.4, margin: -19.3, demVotes: 52224867, repVotes: 34722926, voteMargin: -17501941, totalVotes:  90473222, rcpFinal: null, presInc: "Trump", presApp: 43.5, presDisapp: 53.2, presMargin:  -9.7 },
  { year: 2020, type: "Senate", totalRaces: 35, demPct: 47.0, repPct: 49.3, margin:   2.3, demVotes: 38011916, repVotes: 39834647, voteMargin:   1822731, totalVotes:  80821083, rcpFinal: null, presInc: "Trump", presApp: 45.9, presDisapp: 52.5, presMargin:  -6.6 },
  { year: 2022, type: "Senate", totalRaces: 35, demPct: 50.0, repPct: 47.4, margin:  -2.5, demVotes: 46208845, repVotes: 43850241, voteMargin:  -2358604, totalVotes:  92507402, rcpFinal: null, presInc: "Biden", presApp: 42.1, presDisapp: 54.6, presMargin: -12.5 },
  { year: 2024, type: "Senate", totalRaces: 34, demPct: 49.1, repPct: 47.7, margin:  -1.3, demVotes: 55934606, repVotes: 54402269, voteMargin:  -1532337, totalVotes: 113998179, rcpFinal: null, presInc: "Biden", presApp: 41.0, presDisapp: 56.2, presMargin: -15.2 },

  // Governor
  { year: 2016, type: "Governor", totalRaces: 12, demPct: 47.4,  repPct: 49.5,  margin:   2.0,  demVotes:  9288363, repVotes:  9688153, voteMargin:    399790, totalVotes:  19579201, rcpFinal: null, presInc: "Obama", presApp: 52.4, presDisapp: 44.6, presMargin:   7.8  },
  { year: 2017, type: "Governor", totalRaces:  2, demPct: 54.9,  repPct: 43.6,  margin: -11.3,  demVotes:  2612285, repVotes:  2075314, voteMargin:   -536971, totalVotes:   4761697, rcpFinal: null, presInc: "Trump", presApp: 38.7, presDisapp: 56.6, presMargin: -17.9  },
  { year: 2018, type: "Governor", totalRaces: 36, demPct: 50.3,  repPct: 47.3,  margin:  -3.0,  demVotes: 46253757, repVotes: 43452881, voteMargin:  -2800876, totalVotes:  91918835, rcpFinal: null, presInc: "Trump", presApp: 43.5, presDisapp: 53.2, presMargin:  -9.7  },
  { year: 2019, type: "Governor", totalRaces:  3, demPct: 49.49, repPct: 49.48, margin:  -0.01, demVotes:  1898756, repVotes:  1898436, voteMargin:      -320, totalVotes:   3836772, rcpFinal: null, presInc: "Trump", presApp: 43.5, presDisapp: 54.3, presMargin: -10.8  },
  { year: 2020, type: "Governor", totalRaces: 11, demPct: 44.0,  repPct: 52.3,  margin:   8.3,  demVotes:  9001081, repVotes: 10698657, voteMargin:   1697576, totalVotes:  20468296, rcpFinal: null, presInc: "Trump", presApp: 45.9, presDisapp: 52.5, presMargin:  -6.6  },
  { year: 2021, type: "Governor", totalRaces:  2, demPct: 49.8,  repPct: 49.4,  margin:  -0.4,  demVotes:  2939475, repVotes:  2918691, voteMargin:    -20784, totalVotes:   5903213, rcpFinal: null, presInc: "Biden", presApp: 43.0, presDisapp: 51.0, presMargin:  -8.0  },
  { year: 2022, type: "Governor", totalRaces: 36, demPct: 49.2,  repPct: 49.0,  margin:  -0.2,  demVotes: 43336108, repVotes: 43126140, voteMargin:   -209968, totalVotes:  88021140, rcpFinal: null, presInc: "Biden", presApp: 42.1, presDisapp: 54.6, presMargin: -12.5  },
  { year: 2023, type: "Governor", totalRaces:  3, demPct: 43.3,  repPct: 54.3,  margin:  11.0,  demVotes:  1389283, repVotes:  1741855, voteMargin:    352572, totalVotes:   3205519, rcpFinal: null, presInc: "Biden", presApp: 40.9, presDisapp: 55.6, presMargin: -14.7  },
  { year: 2024, type: "Governor", totalRaces: 11, demPct: 45.9,  repPct: 49.8,  margin:   3.9,  demVotes:  9242906, repVotes: 10031977, voteMargin:    789071, totalVotes:  20150527, rcpFinal: null, presInc: "Biden", presApp: 41.0, presDisapp: 56.2, presMargin: -15.2  },
  { year: 2025, type: "Governor", totalRaces:  2, demPct: 57.2,  repPct: 42.4,  margin: -14.9,  demVotes:  3873467, repVotes:  2867291, voteMargin:  -1006176, totalVotes:   6767699, rcpFinal: null, presInc: "Trump", presApp: 43.4, presDisapp: 54.4, presMargin: -11.0  },
];
