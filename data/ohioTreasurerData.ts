// Ohio State Treasurer GOP Primary Results
// Margin convention: positive = Roegner winning, negative = Edwards winning

export interface OhioCountyResult {
  county: string;
  winner: "Roegner" | "Edwards" | null;
  // % point margin: positive = Roegner, negative = Edwards, null = no data
  margin: number | null;
  marginLabel: string;
  voteTotal: number;
  reportingPct: number; // numeric 0–100; >95 entries stored as 97
}

// Derived helpers
export function roegnerPct(r: OhioCountyResult): number {
  if (r.margin === null || r.voteTotal === 0) return 0;
  return (100 + r.margin) / 2;
}
export function edwardsPct(r: OhioCountyResult): number {
  if (r.margin === null || r.voteTotal === 0) return 0;
  return (100 - r.margin) / 2;
}
export function roegnerVotes(r: OhioCountyResult): number {
  return Math.round(r.voteTotal * roegnerPct(r) / 100);
}
export function edwardsVotes(r: OhioCountyResult): number {
  return Math.round(r.voteTotal * edwardsPct(r) / 100);
}

export const ohioTreasurerData: OhioCountyResult[] = [
  { county: "Franklin",    winner: "Roegner", margin: 12,    marginLabel: "Roegner +12",   voteTotal: 22910,  reportingPct: 44  },
  { county: "Warren",      winner: "Roegner", margin: 30,    marginLabel: "Roegner +30",   voteTotal: 22284,  reportingPct: 77  },
  { county: "Lake",        winner: "Roegner", margin: 17,    marginLabel: "Roegner +17",   voteTotal: 19275,  reportingPct: 97  },
  { county: "Clermont",    winner: "Roegner", margin: 13,    marginLabel: "Roegner +13",   voteTotal: 18797,  reportingPct: 64  },
  { county: "Butler",      winner: "Roegner", margin: 19,    marginLabel: "Roegner +19",   voteTotal: 16760,  reportingPct: 49  },
  { county: "Montgomery",  winner: "Edwards", margin: -2,    marginLabel: "Edwards +2",    voteTotal: 16640,  reportingPct: 73  },
  { county: "Medina",      winner: "Edwards", margin: -9,    marginLabel: "Edwards +9",    voteTotal: 15782,  reportingPct: 83  },
  { county: "Licking",     winner: "Edwards", margin: -24,   marginLabel: "Edwards +24",   voteTotal: 15247,  reportingPct: 97  },
  { county: "Cuyahoga",    winner: "Roegner", margin: 3,     marginLabel: "Roegner +3",    voteTotal: 14989,  reportingPct: 27  },
  { county: "Mahoning",    winner: "Edwards", margin: -15,   marginLabel: "Edwards +15",   voteTotal: 14548,  reportingPct: 97  },
  { county: "Lorain",      winner: "Edwards", margin: -11,   marginLabel: "Edwards +11",   voteTotal: 13991,  reportingPct: 65  },
  { county: "Trumbull",    winner: "Edwards", margin: -5,    marginLabel: "Edwards +5",    voteTotal: 12940,  reportingPct: 97  },
  { county: "Delaware",    winner: "Roegner", margin: 9,     marginLabel: "Roegner +9",    voteTotal: 11914,  reportingPct: 49  },
  { county: "Summit",      winner: "Roegner", margin: 34,    marginLabel: "Roegner +34",   voteTotal: 11432,  reportingPct: 39  },
  { county: "Clark",       winner: "Edwards", margin: -1.5,  marginLabel: "Edwards +1.5",  voteTotal: 11339,  reportingPct: 97  },
  { county: "Preble",      winner: "Edwards", margin: -7,    marginLabel: "Edwards +7",    voteTotal: 11100,  reportingPct: 97  },
  { county: "Geauga",      winner: "Roegner", margin: 5,     marginLabel: "Roegner +5",    voteTotal: 10375,  reportingPct: 84  },
  { county: "Greene",      winner: "Edwards", margin: -1.4,  marginLabel: "Edwards +1.4",  voteTotal: 9802,   reportingPct: 50  },
  { county: "Miami",       winner: "Edwards", margin: -8,    marginLabel: "Edwards +8",    voteTotal: 9605,   reportingPct: 62  },
  { county: "Stark",       winner: "Edwards", margin: -3,    marginLabel: "Edwards +3",    voteTotal: 8938,   reportingPct: 26  },
  { county: "Allen",       winner: "Edwards", margin: -27,   marginLabel: "Edwards +27",   voteTotal: 8369,   reportingPct: 97  },
  { county: "Hamilton",    winner: "Edwards", margin: -11,   marginLabel: "Edwards +11",   voteTotal: 8103,   reportingPct: 18  },
  { county: "Columbiana",  winner: "Edwards", margin: -19,   marginLabel: "Edwards +19",   voteTotal: 8014,   reportingPct: 97  },
  { county: "Hancock",     winner: "Edwards", margin: -10,   marginLabel: "Edwards +10",   voteTotal: 7595,   reportingPct: 86  },
  { county: "Union",       winner: "Edwards", margin: -15,   marginLabel: "Edwards +15",   voteTotal: 7169,   reportingPct: 69  },
  { county: "Richland",    winner: "Edwards", margin: -6,    marginLabel: "Edwards +6",    voteTotal: 6906,   reportingPct: 37  },
  { county: "Washington",  winner: "Edwards", margin: -38,   marginLabel: "Edwards +38",   voteTotal: 6863,   reportingPct: 97  },
  { county: "Tuscarawas",  winner: "Edwards", margin: -25,   marginLabel: "Edwards +25",   voteTotal: 6831,   reportingPct: 83  },
  { county: "Knox",        winner: "Edwards", margin: -2,    marginLabel: "Edwards +2",    voteTotal: 6513,   reportingPct: 97  },
  { county: "Sandusky",    winner: "Edwards", margin: -19,   marginLabel: "Edwards +19",   voteTotal: 6410,   reportingPct: 97  },
  { county: "Putnam",      winner: "Edwards", margin: -20,   marginLabel: "Edwards +20",   voteTotal: 5951,   reportingPct: 97  },
  { county: "Shelby",      winner: "Roegner", margin: 1.1,   marginLabel: "Roegner +1.1",  voteTotal: 5677,   reportingPct: 97  },
  { county: "Auglaize",    winner: "Edwards", margin: -3,    marginLabel: "Edwards +3",    voteTotal: 5669,   reportingPct: 97  },
  { county: "Wood",        winner: "Edwards", margin: -10,   marginLabel: "Edwards +10",   voteTotal: 5626,   reportingPct: 57  },
  { county: "Muskingum",   winner: "Edwards", margin: -27,   marginLabel: "Edwards +27",   voteTotal: 5320,   reportingPct: 97  },
  { county: "Seneca",      winner: "Edwards", margin: -24,   marginLabel: "Edwards +24",   voteTotal: 5305,   reportingPct: 97  },
  { county: "Erie",        winner: "Edwards", margin: -19,   marginLabel: "Edwards +19",   voteTotal: 5274,   reportingPct: 97  },
  { county: "Belmont",     winner: "Edwards", margin: -17,   marginLabel: "Edwards +17",   voteTotal: 5273,   reportingPct: 70  },
  { county: "Scioto",      winner: "Roegner", margin: 0.76,  marginLabel: "Roegner +0.76", voteTotal: 5010,   reportingPct: 69  },
  { county: "Ashtabula",   winner: "Edwards", margin: -15,   marginLabel: "Edwards +15",   voteTotal: 4999,   reportingPct: 74  },
  { county: "Jefferson",   winner: "Edwards", margin: -19,   marginLabel: "Edwards +19",   voteTotal: 4774,   reportingPct: 66  },
  { county: "Darke",       winner: "Edwards", margin: -12,   marginLabel: "Edwards +12",   voteTotal: 4597,   reportingPct: 97  },
  { county: "Ross",        winner: "Edwards", margin: -31,   marginLabel: "Edwards +31",   voteTotal: 4539,   reportingPct: 97  },
  { county: "Logan",       winner: "Edwards", margin: -14,   marginLabel: "Edwards +14",   voteTotal: 4506,   reportingPct: 97  },
  { county: "Huron",       winner: "Edwards", margin: -11,   marginLabel: "Edwards +11",   voteTotal: 4464,   reportingPct: 97  },
  { county: "Fulton",      winner: "Edwards", margin: -13,   marginLabel: "Edwards +13",   voteTotal: 4210,   reportingPct: 97  },
  { county: "Coshocton",   winner: "Edwards", margin: -21,   marginLabel: "Edwards +21",   voteTotal: 4107,   reportingPct: 97  },
  { county: "Ottawa",      winner: "Edwards", margin: -18,   marginLabel: "Edwards +18",   voteTotal: 4004,   reportingPct: 97  },
  { county: "Fairfield",   winner: "Edwards", margin: -27,   marginLabel: "Edwards +27",   voteTotal: 3998,   reportingPct: 30  },
  { county: "Clinton",     winner: "Edwards", margin: -13,   marginLabel: "Edwards +13",   voteTotal: 3818,   reportingPct: 87  },
  { county: "Morrow",      winner: "Edwards", margin: -18,   marginLabel: "Edwards +18",   voteTotal: 3734,   reportingPct: 97  },
  { county: "Champaign",   winner: "Edwards", margin: -19,   marginLabel: "Edwards +19",   voteTotal: 3729,   reportingPct: 97  },
  { county: "Crawford",    winner: "Edwards", margin: -25,   marginLabel: "Edwards +25",   voteTotal: 3617,   reportingPct: 93  },
  { county: "Defiance",    winner: "Edwards", margin: -13,   marginLabel: "Edwards +13",   voteTotal: 3610,   reportingPct: 97  },
  { county: "Van Wert",    winner: "Edwards", margin: -9,    marginLabel: "Edwards +9",    voteTotal: 3579,   reportingPct: 97  },
  { county: "Portage",     winner: "Edwards", margin: -0.14, marginLabel: "Edwards +0.14", voteTotal: 3577,   reportingPct: 30  },
  { county: "Marion",      winner: "Edwards", margin: -24,   marginLabel: "Edwards +24",   voteTotal: 3453,   reportingPct: 54  },
  { county: "Williams",    winner: "Edwards", margin: -6,    marginLabel: "Edwards +6",    voteTotal: 3442,   reportingPct: 57  },
  { county: "Meigs",       winner: "Edwards", margin: -73,   marginLabel: "Edwards +73",   voteTotal: 3111,   reportingPct: 97  },
  { county: "Madison",     winner: "Edwards", margin: -10,   marginLabel: "Edwards +10",   voteTotal: 3087,   reportingPct: 53  },
  { county: "Lucas",       winner: "Edwards", margin: -5,    marginLabel: "Edwards +5",    voteTotal: 2979,   reportingPct: 14  },
  { county: "Gallia",      winner: "Edwards", margin: -43,   marginLabel: "Edwards +43",   voteTotal: 2941,   reportingPct: 97  },
  { county: "Henry",       winner: "Edwards", margin: -20,   marginLabel: "Edwards +20",   voteTotal: 2862,   reportingPct: 97  },
  { county: "Fayette",     winner: "Edwards", margin: -18,   marginLabel: "Edwards +18",   voteTotal: 2785,   reportingPct: 97  },
  { county: "Perry",       winner: "Edwards", margin: -45,   marginLabel: "Edwards +45",   voteTotal: 2749,   reportingPct: 97  },
  { county: "Lawrence",    winner: "Edwards", margin: -27,   marginLabel: "Edwards +27",   voteTotal: 2743,   reportingPct: 70  },
  { county: "Guernsey",    winner: "Edwards", margin: -32,   marginLabel: "Edwards +32",   voteTotal: 2636,   reportingPct: 97  },
  { county: "Adams",       winner: "Edwards", margin: -23,   marginLabel: "Edwards +23",   voteTotal: 2617,   reportingPct: 64  },
  { county: "Carroll",     winner: "Edwards", margin: -25,   marginLabel: "Edwards +25",   voteTotal: 2524,   reportingPct: 97  },
  { county: "Athens",      winner: "Edwards", margin: -59,   marginLabel: "Edwards +59",   voteTotal: 2494,   reportingPct: 97  },
  { county: "Mercer",      winner: "Edwards", margin: -10,   marginLabel: "Edwards +10",   voteTotal: 2487,   reportingPct: 47  },
  { county: "Ashland",     winner: "Edwards", margin: -15,   marginLabel: "Edwards +15",   voteTotal: 2406,   reportingPct: 43  },
  { county: "Hocking",     winner: "Edwards", margin: -59,   marginLabel: "Edwards +59",   voteTotal: 2386,   reportingPct: 97  },
  { county: "Wyandot",     winner: "Edwards", margin: -28,   marginLabel: "Edwards +28",   voteTotal: 2291,   reportingPct: 97  },
  { county: "Paulding",    winner: "Edwards", margin: -13,   marginLabel: "Edwards +13",   voteTotal: 2159,   reportingPct: 97  },
  { county: "Highland",    winner: "Edwards", margin: -19,   marginLabel: "Edwards +19",   voteTotal: 2116,   reportingPct: 43  },
  { county: "Holmes",      winner: "Edwards", margin: -17,   marginLabel: "Edwards +17",   voteTotal: 2109,   reportingPct: 97  },
  { county: "Pike",        winner: "Edwards", margin: -24,   marginLabel: "Edwards +24",   voteTotal: 1917,   reportingPct: 97  },
  { county: "Pickaway",    winner: "Edwards", margin: -28,   marginLabel: "Edwards +28",   voteTotal: 1838,   reportingPct: 27  },
  { county: "Morgan",      winner: "Edwards", margin: -57,   marginLabel: "Edwards +57",   voteTotal: 1675,   reportingPct: 97  },
  { county: "Brown",       winner: "Roegner", margin: 16,    marginLabel: "Roegner +16",   voteTotal: 1590,   reportingPct: 26  },
  { county: "Hardin",      winner: "Edwards", margin: -17,   marginLabel: "Edwards +17",   voteTotal: 1393,   reportingPct: 48  },
  { county: "Wayne",       winner: "Roegner", margin: 3,     marginLabel: "Roegner +3",    voteTotal: 1358,   reportingPct: 13  },
  { county: "Jackson",     winner: "Edwards", margin: -28,   marginLabel: "Edwards +28",   voteTotal: 1289,   reportingPct: 27  },
  { county: "Harrison",    winner: "Edwards", margin: -25,   marginLabel: "Edwards +25",   voteTotal: 1160,   reportingPct: 97  },
  { county: "Vinton",      winner: "Edwards", margin: -53,   marginLabel: "Edwards +53",   voteTotal: 1117,   reportingPct: 97  },
  { county: "Monroe",      winner: "Edwards", margin: -36,   marginLabel: "Edwards +36",   voteTotal: 1112,   reportingPct: 97  },
  { county: "Noble",       winner: "Edwards", margin: -32,   marginLabel: "Edwards +32",   voteTotal: 977,    reportingPct: 97  },
];

export const ohioTreasurerByCounty: Record<string, OhioCountyResult> =
  Object.fromEntries(ohioTreasurerData.map((r) => [r.county, r]));
