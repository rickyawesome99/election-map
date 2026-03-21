// ⚠️  AUTO-GENERATED — do not edit by hand.
// Edit your Google Sheets, export CSVs to data-entry/, then run:
//   node data-entry/build.js

export type RaceType = "house" | "senate" | "governor";

export type Candidate = {
  name: string;
  party: "D" | "R" | "I";
  incumbent: boolean;
};

export type PastResult = {
  year: number;
  demPct: number;
  repPct: number;
  demCandidate?: string;
  repCandidate?: string;
  demVotes?: number;
  repVotes?: number;
  electionType?: string;
  demIncumbent?: boolean;
  repIncumbent?: boolean;
};

export type RaceForecast = {
  id: string;
  name: string;
  state: string;
  raceType: RaceType;
  probability: number;
  margin: number;
  rating: string;
  history: { date: string; value: number }[];
  termLength?: number;
  raceDesc?: string;
  kalshiDem?: number;
  kalshiRep?: number;
  rcpDem?: number;
  rcpRep?: number;
  polyDem?: number;
  polyRep?: number;
  candidates?: { dem: Candidate; rep: Candidate };
  pastResults?: PastResult[];
};

export type NoElectionEntry = {
  state: string;
  abbr: string;
  incumbent: string;
  party: "D" | "R" | "I";
  nextElection: number;
  termLength?: number;
  raceDesc?: string;
};

export const senateData: RaceForecast[] = [
  {
    "id": "AK",
    "name": "Alaska",
    "state": "Alaska",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "AL",
    "name": "Alabama",
    "state": "Alabama",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "AR",
    "name": "Arkansas",
    "state": "Arkansas",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "CO",
    "name": "Colorado",
    "state": "Colorado",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "DE",
    "name": "Delaware",
    "state": "Delaware",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "FL",
    "name": "Florida",
    "state": "Florida",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "GA",
    "name": "Georgia",
    "state": "Georgia",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "IA",
    "name": "Iowa",
    "state": "Iowa",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "ID",
    "name": "Idaho",
    "state": "Idaho",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "IL",
    "name": "Illinois",
    "state": "Illinois",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "KS",
    "name": "Kansas",
    "state": "Kansas",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "KY",
    "name": "Kentucky",
    "state": "Kentucky",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "LA",
    "name": "Louisiana",
    "state": "Louisiana",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "MA",
    "name": "Massachusetts",
    "state": "Massachusetts",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "ME",
    "name": "Maine",
    "state": "Maine",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "MI",
    "name": "Michigan",
    "state": "Michigan",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "MN",
    "name": "Minnesota",
    "state": "Minnesota",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "MS",
    "name": "Mississippi",
    "state": "Mississippi",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "MT",
    "name": "Montana",
    "state": "Montana",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "NC",
    "name": "North Carolina",
    "state": "North Carolina",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "NE",
    "name": "Nebraska",
    "state": "Nebraska",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "NH",
    "name": "New Hampshire",
    "state": "New Hampshire",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "NJ",
    "name": "New Jersey",
    "state": "New Jersey",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "NM",
    "name": "New Mexico",
    "state": "New Mexico",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "OH",
    "name": "Ohio",
    "state": "Ohio",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "OK",
    "name": "Oklahoma",
    "state": "Oklahoma",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "OR",
    "name": "Oregon",
    "state": "Oregon",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "RI",
    "name": "Rhode Island",
    "state": "Rhode Island",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "SC",
    "name": "South Carolina",
    "state": "South Carolina",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "SD",
    "name": "South Dakota",
    "state": "South Dakota",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "TN",
    "name": "Tennessee",
    "state": "Tennessee",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "TX",
    "name": "Texas",
    "state": "Texas",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "VA",
    "name": "Virginia",
    "state": "Virginia",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "WV",
    "name": "West Virginia",
    "state": "West Virginia",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "WY",
    "name": "Wyoming",
    "state": "Wyoming",
    "raceType": "senate",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  }
];

export const senateNoElection: NoElectionEntry[] = [
  {
    "state": "Arizona",
    "abbr": "AZ",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "California",
    "abbr": "CA",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Connecticut",
    "abbr": "CT",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Hawaii",
    "abbr": "HI",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Indiana",
    "abbr": "IN",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Maryland",
    "abbr": "MD",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Missouri",
    "abbr": "MO",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "North Dakota",
    "abbr": "ND",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Nevada",
    "abbr": "NV",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "New York",
    "abbr": "NY",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Pennsylvania",
    "abbr": "PA",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Utah",
    "abbr": "UT",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Vermont",
    "abbr": "VT",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Washington",
    "abbr": "WA",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Wisconsin",
    "abbr": "WI",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  }
];

export const senateHoldovers: NoElectionEntry[] = [
  {
    "state": "Alaska",
    "abbr": "AK",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Alabama",
    "abbr": "AL",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Arkansas",
    "abbr": "AR",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Arizona",
    "abbr": "AZ",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "California",
    "abbr": "CA",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  },
  {
    "state": "Colorado",
    "abbr": "CO",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Connecticut",
    "abbr": "CT",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Delaware",
    "abbr": "DE",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Florida",
    "abbr": "FL",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Georgia",
    "abbr": "GA",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Hawaii",
    "abbr": "HI",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Iowa",
    "abbr": "IA",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Idaho",
    "abbr": "ID",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Illinois",
    "abbr": "IL",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Indiana",
    "abbr": "IN",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Kansas",
    "abbr": "KS",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Kentucky",
    "abbr": "KY",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Louisiana",
    "abbr": "LA",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Massachusetts",
    "abbr": "MA",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  },
  {
    "state": "Maryland",
    "abbr": "MD",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Maine",
    "abbr": "ME",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  },
  {
    "state": "Michigan",
    "abbr": "MI",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  },
  {
    "state": "Minnesota",
    "abbr": "MN",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  },
  {
    "state": "Missouri",
    "abbr": "MO",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Mississippi",
    "abbr": "MS",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Montana",
    "abbr": "MT",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  },
  {
    "state": "North Carolina",
    "abbr": "NC",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "North Dakota",
    "abbr": "ND",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Nebraska",
    "abbr": "NE",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "New Hampshire",
    "abbr": "NH",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "New Jersey",
    "abbr": "NJ",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  },
  {
    "state": "New Mexico",
    "abbr": "NM",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  },
  {
    "state": "Nevada",
    "abbr": "NV",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  },
  {
    "state": "New York",
    "abbr": "NY",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Ohio",
    "abbr": "OH",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  },
  {
    "state": "Oklahoma",
    "abbr": "OK",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  },
  {
    "state": "Oregon",
    "abbr": "OR",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Pennsylvania",
    "abbr": "PA",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Rhode Island",
    "abbr": "RI",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  },
  {
    "state": "South Carolina",
    "abbr": "SC",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "South Dakota",
    "abbr": "SD",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  },
  {
    "state": "Tennessee",
    "abbr": "TN",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  },
  {
    "state": "Texas",
    "abbr": "TX",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  },
  {
    "state": "Utah",
    "abbr": "UT",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Virginia",
    "abbr": "VA",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Vermont",
    "abbr": "VT",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Washington",
    "abbr": "WA",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Wisconsin",
    "abbr": "WI",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "West Virginia",
    "abbr": "WV",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2028
  },
  {
    "state": "Wyoming",
    "abbr": "WY",
    "incumbent": "Incumbent TBD",
    "party": "R",
    "nextElection": 2030
  }
];

export const senateCurrent: Record<string, ["D" | "R" | "I", "D" | "R" | "I"]> = {
  "AK": [
    "R",
    "R"
  ],
  "AL": [
    "R",
    "R"
  ],
  "AR": [
    "R",
    "R"
  ],
  "AZ": [
    "R",
    "R"
  ],
  "CA": [
    "R",
    "R"
  ],
  "CO": [
    "R",
    "R"
  ],
  "CT": [
    "R",
    "R"
  ],
  "DE": [
    "R",
    "R"
  ],
  "FL": [
    "R",
    "R"
  ],
  "GA": [
    "R",
    "R"
  ],
  "HI": [
    "R",
    "R"
  ],
  "IA": [
    "R",
    "R"
  ],
  "ID": [
    "R",
    "R"
  ],
  "IL": [
    "R",
    "R"
  ],
  "IN": [
    "R",
    "R"
  ],
  "KS": [
    "R",
    "R"
  ],
  "KY": [
    "R",
    "R"
  ],
  "LA": [
    "R",
    "R"
  ],
  "MA": [
    "R",
    "R"
  ],
  "MD": [
    "R",
    "R"
  ],
  "ME": [
    "R",
    "R"
  ],
  "MI": [
    "R",
    "R"
  ],
  "MN": [
    "R",
    "R"
  ],
  "MO": [
    "R",
    "R"
  ],
  "MS": [
    "R",
    "R"
  ],
  "MT": [
    "R",
    "R"
  ],
  "NC": [
    "R",
    "R"
  ],
  "ND": [
    "R",
    "R"
  ],
  "NE": [
    "R",
    "R"
  ],
  "NH": [
    "R",
    "R"
  ],
  "NJ": [
    "R",
    "R"
  ],
  "NM": [
    "R",
    "R"
  ],
  "NV": [
    "R",
    "R"
  ],
  "NY": [
    "R",
    "R"
  ],
  "OH": [
    "R",
    "R"
  ],
  "OK": [
    "R",
    "R"
  ],
  "OR": [
    "R",
    "R"
  ],
  "PA": [
    "R",
    "R"
  ],
  "RI": [
    "R",
    "R"
  ],
  "SC": [
    "R",
    "R"
  ],
  "SD": [
    "R",
    "R"
  ],
  "TN": [
    "R",
    "R"
  ],
  "TX": [
    "R",
    "R"
  ],
  "UT": [
    "R",
    "R"
  ],
  "VA": [
    "R",
    "R"
  ],
  "VT": [
    "R",
    "R"
  ],
  "WA": [
    "R",
    "R"
  ],
  "WI": [
    "R",
    "R"
  ],
  "WV": [
    "R",
    "R"
  ],
  "WY": [
    "R",
    "R"
  ]
};

export const governorData: RaceForecast[] = [
  {
    "id": "AZ",
    "name": "Arizona",
    "state": "Arizona",
    "raceType": "governor",
    "probability": 0.71,
    "margin": 3,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 66
      },
      {
        "date": "Oct",
        "value": 68
      },
      {
        "date": "Nov",
        "value": 70
      },
      {
        "date": "Dec",
        "value": 71
      },
      {
        "date": "Jan",
        "value": 71
      },
      {
        "date": "Feb",
        "value": 71
      },
      {
        "date": "Mar",
        "value": 71
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Katie Hobbs is running for a second term in a state that Trump won back in 2024.",
    "kalshiDem": 0.71,
    "kalshiRep": 0.29,
    "candidates": {
      "dem": {
        "name": "Katie Hobbs",
        "party": "D",
        "incumbent": true
      },
      "rep": {
        "name": "Andy Biggs",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 50.32,
        "repPct": 49.65,
        "demCandidate": "Katie Hobbs",
        "repCandidate": "Kari Lake",
        "demVotes": 1287891,
        "repVotes": 1270774,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 41.84,
        "repPct": 56,
        "demCandidate": "David Garcia",
        "repCandidate": "Doug Ducey",
        "demVotes": 994341,
        "repVotes": 1330863,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2014,
        "demPct": 41.62,
        "repPct": 53.44,
        "demCandidate": "Fred DuVal",
        "repCandidate": "Doug Ducey",
        "demVotes": 626921,
        "repVotes": 805062,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      }
    ]
  },
  {
    "id": "CA",
    "name": "California",
    "state": "California",
    "raceType": "governor",
    "probability": 0.86,
    "margin": 20,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 81
      },
      {
        "date": "Oct",
        "value": 83
      },
      {
        "date": "Nov",
        "value": 85
      },
      {
        "date": "Dec",
        "value": 86
      },
      {
        "date": "Jan",
        "value": 86
      },
      {
        "date": "Feb",
        "value": 86
      },
      {
        "date": "Mar",
        "value": 86
      }
    ],
    "termLength": 4,
    "raceDesc": "California hasn't elected a Republican for Governor since Arnold Schwarzenegger in 2006.",
    "kalshiDem": 0.86,
    "kalshiRep": 0.14,
    "candidates": {
      "dem": {
        "name": "Katie Porter",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Chad Bianco",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 59.18,
        "repPct": 40.82,
        "demCandidate": "Gavin Newsom",
        "repCandidate": "Brian Dahle",
        "demVotes": 6470104,
        "repVotes": 4462914,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 61.95,
        "repPct": 38.05,
        "demCandidate": "Gavin Newsom",
        "repCandidate": "John H. Cox",
        "demVotes": 7721410,
        "repVotes": 4742825,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 59.97,
        "repPct": 40.03,
        "demCandidate": "Jerry Brown",
        "repCandidate": "Neel Kashkari",
        "demVotes": 4388368,
        "repVotes": 2929213,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      }
    ]
  },
  {
    "id": "CO",
    "name": "Colorado",
    "state": "Colorado",
    "raceType": "governor",
    "probability": 0.91,
    "margin": 20,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 86
      },
      {
        "date": "Oct",
        "value": 88
      },
      {
        "date": "Nov",
        "value": 90
      },
      {
        "date": "Dec",
        "value": 91
      },
      {
        "date": "Jan",
        "value": 91
      },
      {
        "date": "Feb",
        "value": 91
      },
      {
        "date": "Mar",
        "value": 91
      }
    ],
    "termLength": 4,
    "raceDesc": "Colorado is a reliable Democrat state and Republicans have not won a gubernatorial election in Colorado since Bill Owens was re-elected in 2002.",
    "kalshiDem": 0.91,
    "kalshiRep": 0.09,
    "candidates": {
      "dem": {
        "name": "Michael Bennet",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Barbara Kirkmeyer",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 58.53,
        "repPct": 39.18,
        "demCandidate": "Jared Polis",
        "repCandidate": "Heidi Ganahl",
        "demVotes": 1468481,
        "repVotes": 983040,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 53.42,
        "repPct": 42.8,
        "demCandidate": "Jared Polis",
        "repCandidate": "Walker Stapleton",
        "demVotes": 1348888,
        "repVotes": 1080801,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 49.3,
        "repPct": 45.95,
        "demCandidate": "John Hickenlooper",
        "repCandidate": "Bob Beauprez",
        "demVotes": 1006433,
        "repVotes": 938195,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      }
    ]
  },
  {
    "id": "CT",
    "name": "Connecticut",
    "state": "Connecticut",
    "raceType": "governor",
    "probability": 0.94,
    "margin": 11,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 89
      },
      {
        "date": "Oct",
        "value": 91
      },
      {
        "date": "Nov",
        "value": 93
      },
      {
        "date": "Dec",
        "value": 94
      },
      {
        "date": "Jan",
        "value": 94
      },
      {
        "date": "Feb",
        "value": 94
      },
      {
        "date": "Mar",
        "value": 94
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Governor Ned Lamont is running for a third term.",
    "kalshiDem": 0.94,
    "kalshiRep": 0.06,
    "candidates": {
      "dem": {
        "name": "Ned Lamont",
        "party": "D",
        "incumbent": true
      },
      "rep": {
        "name": "Ryan Fazio",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 55.97,
        "repPct": 43.05,
        "demCandidate": "Ned Lamont",
        "repCandidate": "Bob Stefanowski",
        "demVotes": 710186,
        "repVotes": 546209,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 49.37,
        "repPct": 46.21,
        "demCandidate": "Ned Lamont",
        "repCandidate": "Bob Stefanowski",
        "demVotes": 694510,
        "repVotes": 650138,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 50.73,
        "repPct": 48.16,
        "demCandidate": "Dannel Malloy",
        "repCandidate": "Thomas C. Foley",
        "demVotes": 554314,
        "repVotes": 526295,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      }
    ]
  },
  {
    "id": "HI",
    "name": "Hawaii",
    "state": "Hawaii",
    "raceType": "governor",
    "probability": 0.94,
    "margin": 30,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 89
      },
      {
        "date": "Oct",
        "value": 91
      },
      {
        "date": "Nov",
        "value": 93
      },
      {
        "date": "Dec",
        "value": 94
      },
      {
        "date": "Jan",
        "value": 94
      },
      {
        "date": "Feb",
        "value": 94
      },
      {
        "date": "Mar",
        "value": 94
      }
    ],
    "termLength": 4,
    "raceDesc": "Republicans have not won a gubernatorial election in Hawaii since Linda Lingle was re-elected in 2006.",
    "kalshiDem": 0.94,
    "kalshiRep": 0.06,
    "candidates": {
      "dem": {
        "name": "Josh Green",
        "party": "D",
        "incumbent": true
      },
      "rep": {
        "name": "TBD",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 63.21,
        "repPct": 36.79,
        "demCandidate": "Josh Green",
        "repCandidate": "Duke Aiona",
        "demVotes": 259901,
        "repVotes": 151258,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 62.67,
        "repPct": 33.7,
        "demCandidate": "David Ige",
        "repCandidate": "Andria Tupola",
        "demVotes": 244934,
        "repVotes": 131719,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 49.45,
        "repPct": 37.08,
        "demCandidate": "David Ige",
        "repCandidate": "Duke Aiona",
        "demVotes": 181106,
        "repVotes": 135775,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      }
    ]
  },
  {
    "id": "IL",
    "name": "Illinois",
    "state": "Illinois",
    "raceType": "governor",
    "probability": 0.9,
    "margin": 15,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 85
      },
      {
        "date": "Oct",
        "value": 87
      },
      {
        "date": "Nov",
        "value": 89
      },
      {
        "date": "Dec",
        "value": 90
      },
      {
        "date": "Jan",
        "value": 90
      },
      {
        "date": "Feb",
        "value": 90
      },
      {
        "date": "Mar",
        "value": 90
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Governor JB Pritzker is running for a third term.",
    "kalshiDem": 0.9,
    "kalshiRep": 0.1,
    "candidates": {
      "dem": {
        "name": "JB Pritzker",
        "party": "D",
        "incumbent": true
      },
      "rep": {
        "name": "Darren Bailey",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 54.91,
        "repPct": 42.37,
        "demCandidate": "J.B. Pritzker",
        "repCandidate": "Darren Bailey",
        "demVotes": 2253748,
        "repVotes": 1739095,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 54.53,
        "repPct": 38.83,
        "demCandidate": "J.B. Pritzker",
        "repCandidate": "Bruce Rauner",
        "demVotes": 2479746,
        "repVotes": 1765751,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2014,
        "demPct": 46.35,
        "repPct": 50.27,
        "demCandidate": "Pat Quinn",
        "repCandidate": "Bruce Rauner",
        "demVotes": 1681343,
        "repVotes": 1823627,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      }
    ]
  },
  {
    "id": "KS",
    "name": "Kansas",
    "state": "Kansas",
    "raceType": "governor",
    "probability": 0.29,
    "margin": -10,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 24
      },
      {
        "date": "Oct",
        "value": 26
      },
      {
        "date": "Nov",
        "value": 28
      },
      {
        "date": "Dec",
        "value": 29
      },
      {
        "date": "Jan",
        "value": 29
      },
      {
        "date": "Feb",
        "value": 29
      },
      {
        "date": "Mar",
        "value": 29
      }
    ],
    "termLength": 4,
    "raceDesc": "Democrat Governor Laura Kelly is term limited in this typically Republican state.",
    "kalshiDem": 0.29,
    "kalshiRep": 0.71,
    "candidates": {
      "dem": {
        "name": "Ethan Corson",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Jeff Colyer",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 49.54,
        "repPct": 47.33,
        "demCandidate": "Laura Kelly",
        "repCandidate": "Derek Schmidt",
        "demVotes": 499849,
        "repVotes": 477591,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 48.01,
        "repPct": 42.98,
        "demCandidate": "Laura Kelly",
        "repCandidate": "Kris Kobach",
        "demVotes": 506727,
        "repVotes": 453645,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 46.13,
        "repPct": 49.82,
        "demCandidate": "Paul Davis",
        "repCandidate": "Sam Brownback",
        "demVotes": 401100,
        "repVotes": 433196,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "ME",
    "name": "Maine",
    "state": "Maine",
    "raceType": "governor",
    "probability": 0.87,
    "margin": 10,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 82
      },
      {
        "date": "Oct",
        "value": 84
      },
      {
        "date": "Nov",
        "value": 86
      },
      {
        "date": "Dec",
        "value": 87
      },
      {
        "date": "Jan",
        "value": 87
      },
      {
        "date": "Feb",
        "value": 87
      },
      {
        "date": "Mar",
        "value": 87
      }
    ],
    "termLength": 4,
    "raceDesc": "Maine is a reliably Democrat state although it currently has one Republican senator.",
    "kalshiDem": 0.87,
    "kalshiRep": 0.13,
    "candidates": {
      "dem": {
        "name": "Hannah Pingree",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Robert Charles",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 55.69,
        "repPct": 42.45,
        "demCandidate": "Janet Mills",
        "repCandidate": "Paul LePage",
        "demVotes": 376934,
        "repVotes": 287304,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 50.89,
        "repPct": 43.18,
        "demCandidate": "Janet Mills",
        "repCandidate": "Shawn Moody",
        "demVotes": 320962,
        "repVotes": 272311,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 43.37,
        "repPct": 48.19,
        "demCandidate": "Mike Michaud",
        "repCandidate": "Paul LePage",
        "demVotes": 265114,
        "repVotes": 294519,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "MD",
    "name": "Maryland",
    "state": "Maryland",
    "raceType": "governor",
    "probability": 0.94,
    "margin": 30,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 89
      },
      {
        "date": "Oct",
        "value": 91
      },
      {
        "date": "Nov",
        "value": 93
      },
      {
        "date": "Dec",
        "value": 94
      },
      {
        "date": "Jan",
        "value": 94
      },
      {
        "date": "Feb",
        "value": 94
      },
      {
        "date": "Mar",
        "value": 94
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Governor Wes Moore is running for a second term.",
    "kalshiDem": 0.94,
    "kalshiRep": 0.06,
    "candidates": {
      "dem": {
        "name": "Wes Moore",
        "party": "D",
        "incumbent": true
      },
      "rep": {
        "name": "Dan Cox",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 64.53,
        "repPct": 32.12,
        "demCandidate": "Wes Moore",
        "repCandidate": "Dan Cox",
        "demVotes": 1293944,
        "repVotes": 644000,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 43.51,
        "repPct": 55.35,
        "demCandidate": "Ben Jealous",
        "repCandidate": "Larry Hogan",
        "demVotes": 1002639,
        "repVotes": 1275644,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2014,
        "demPct": 47.25,
        "repPct": 51.03,
        "demCandidate": "Anthony Brown",
        "repCandidate": "Larry Hogan",
        "demVotes": 818890,
        "repVotes": 884400,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      }
    ]
  },
  {
    "id": "MA",
    "name": "Massachusetts",
    "state": "Massachusetts",
    "raceType": "governor",
    "probability": 0.92,
    "margin": 30,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 87
      },
      {
        "date": "Oct",
        "value": 89
      },
      {
        "date": "Nov",
        "value": 91
      },
      {
        "date": "Dec",
        "value": 92
      },
      {
        "date": "Jan",
        "value": 92
      },
      {
        "date": "Feb",
        "value": 92
      },
      {
        "date": "Mar",
        "value": 92
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Governor Maura Healey is running for a second term.",
    "kalshiDem": 0.92,
    "kalshiRep": 0.08,
    "candidates": {
      "dem": {
        "name": "Maura Healey",
        "party": "D",
        "incumbent": true
      },
      "rep": {
        "name": "Brian Shortsleeve",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 63.74,
        "repPct": 34.57,
        "demCandidate": "Maura Healey",
        "repCandidate": "Geoff Diehl",
        "demVotes": 1584403,
        "repVotes": 859343,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 33.12,
        "repPct": 66.6,
        "demCandidate": "Jay Gonzalez",
        "repCandidate": "Charlie Baker",
        "demVotes": 885770,
        "repVotes": 1781341,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2014,
        "demPct": 46.54,
        "repPct": 48.39,
        "demCandidate": "Martha Coakley",
        "repCandidate": "Charlie Baker",
        "demVotes": 1004408,
        "repVotes": 1044573,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      }
    ]
  },
  {
    "id": "MI",
    "name": "Michigan",
    "state": "Michigan",
    "raceType": "governor",
    "probability": 0.61,
    "margin": 5,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 56
      },
      {
        "date": "Oct",
        "value": 58
      },
      {
        "date": "Nov",
        "value": 60
      },
      {
        "date": "Dec",
        "value": 61
      },
      {
        "date": "Jan",
        "value": 61
      },
      {
        "date": "Feb",
        "value": 61
      },
      {
        "date": "Mar",
        "value": 61
      }
    ],
    "termLength": 4,
    "raceDesc": "This race is unique as it features a decently strong Independent Candidate in former Detroit Mayor Mike Duggan.",
    "kalshiDem": 0.61,
    "kalshiRep": 0.39,
    "candidates": {
      "dem": {
        "name": "Jocelyn Benson",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "John James",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 54.47,
        "repPct": 43.94,
        "demCandidate": "Gretchen Whitmer",
        "repCandidate": "Tudor Dixon",
        "demVotes": 2430505,
        "repVotes": 1960635,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 53.31,
        "repPct": 43.75,
        "demCandidate": "Gretchen Whitmer",
        "repCandidate": "Bill Schuette",
        "demVotes": 2266193,
        "repVotes": 1859534,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 46.86,
        "repPct": 50.92,
        "demCandidate": "Mark Schauer",
        "repCandidate": "Rick Snyder",
        "demVotes": 1479057,
        "repVotes": 1607399,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "MN",
    "name": "Minnesota",
    "state": "Minnesota",
    "raceType": "governor",
    "probability": 0.91,
    "margin": 15,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 86
      },
      {
        "date": "Oct",
        "value": 88
      },
      {
        "date": "Nov",
        "value": 90
      },
      {
        "date": "Dec",
        "value": 91
      },
      {
        "date": "Jan",
        "value": 91
      },
      {
        "date": "Feb",
        "value": 91
      },
      {
        "date": "Mar",
        "value": 91
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Governor Tim Walz is not running for re-election, leaving the seat an open race in this reliably Democrat state.",
    "kalshiDem": 0.91,
    "kalshiRep": 0.09,
    "candidates": {
      "dem": {
        "name": "Amy Klobuchar",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Lisa Demuth",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 52.27,
        "repPct": 44.61,
        "demCandidate": "Tim Walz",
        "repCandidate": "Scott Jensen",
        "demVotes": 1312349,
        "repVotes": 1119941,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 53.84,
        "repPct": 42.43,
        "demCandidate": "Tim Walz",
        "repCandidate": "Jeff Johnson",
        "demVotes": 1393096,
        "repVotes": 1097705,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 50.07,
        "repPct": 44.51,
        "demCandidate": "Mark Dayton",
        "repCandidate": "Jeff Johnson",
        "demVotes": 989113,
        "repVotes": 879257,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      }
    ]
  },
  {
    "id": "NM",
    "name": "New Mexico",
    "state": "New Mexico",
    "raceType": "governor",
    "probability": 0.92,
    "margin": 12,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 87
      },
      {
        "date": "Oct",
        "value": 89
      },
      {
        "date": "Nov",
        "value": 91
      },
      {
        "date": "Dec",
        "value": 92
      },
      {
        "date": "Jan",
        "value": 92
      },
      {
        "date": "Feb",
        "value": 92
      },
      {
        "date": "Mar",
        "value": 92
      }
    ],
    "termLength": 4,
    "raceDesc": "New Mexico hasn't elected a Republican governor since 2014.",
    "kalshiDem": 0.92,
    "kalshiRep": 0.08,
    "candidates": {
      "dem": {
        "name": "Deb Haaland",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Gregg Hull",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 51.97,
        "repPct": 45.59,
        "demCandidate": "Michelle Lujan Grisham",
        "repCandidate": "Mark Ronchetti",
        "demVotes": 370168,
        "repVotes": 324701,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 57.2,
        "repPct": 42.8,
        "demCandidate": "Michelle Lujan Grisham",
        "repCandidate": "Steve Pearce",
        "demVotes": 398368,
        "repVotes": 298091,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 42.78,
        "repPct": 57.22,
        "demCandidate": "Gary King",
        "repCandidate": "Susana Martinez",
        "demVotes": 219362,
        "repVotes": 293443,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "NY",
    "name": "New York",
    "state": "New York",
    "raceType": "governor",
    "probability": 0.89,
    "margin": 14,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 84
      },
      {
        "date": "Oct",
        "value": 86
      },
      {
        "date": "Nov",
        "value": 88
      },
      {
        "date": "Dec",
        "value": 89
      },
      {
        "date": "Jan",
        "value": 89
      },
      {
        "date": "Feb",
        "value": 89
      },
      {
        "date": "Mar",
        "value": 89
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Governor Kathy Hochul is running for her second full term. Hochul took office after her predecessor Andrew Cuomo resigned in 2021.",
    "kalshiDem": 0.89,
    "kalshiRep": 0.11,
    "candidates": {
      "dem": {
        "name": "Kathy Hochul",
        "party": "D",
        "incumbent": true
      },
      "rep": {
        "name": "Bruce Blakeman",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 53.2,
        "repPct": 46.8,
        "demCandidate": "Kathy Hochul",
        "repCandidate": "Lee Zeldin",
        "demVotes": 3140415,
        "repVotes": 2762581,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 59.62,
        "repPct": 36.21,
        "demCandidate": "Andrew Cuomo",
        "repCandidate": "Marc Molinaro",
        "demVotes": 3635340,
        "repVotes": 2207602,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 54.28,
        "repPct": 40.31,
        "demCandidate": "Andrew Cuomo",
        "repCandidate": "Rob Astorino",
        "demVotes": 2069480,
        "repVotes": 1537077,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      }
    ]
  },
  {
    "id": "OR",
    "name": "Oregon",
    "state": "Oregon",
    "raceType": "governor",
    "probability": 0.88,
    "margin": 9,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 83
      },
      {
        "date": "Oct",
        "value": 85
      },
      {
        "date": "Nov",
        "value": 87
      },
      {
        "date": "Dec",
        "value": 88
      },
      {
        "date": "Jan",
        "value": 88
      },
      {
        "date": "Feb",
        "value": 88
      },
      {
        "date": "Mar",
        "value": 88
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Governor Tina Kotek is running for a second full term.",
    "kalshiDem": 0.88,
    "kalshiRep": 0.12,
    "candidates": {
      "dem": {
        "name": "Tina Kotek",
        "party": "D",
        "incumbent": true
      },
      "rep": {
        "name": "Christine Drazan",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 46.96,
        "repPct": 43.54,
        "demCandidate": "Tina Kotek",
        "repCandidate": "Christine Drazan",
        "demVotes": 917074,
        "repVotes": 850347,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 50.05,
        "repPct": 43.65,
        "demCandidate": "Kate Brown",
        "repCandidate": "Knute Buehler",
        "demVotes": 934498,
        "repVotes": 814988,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2016,
        "demPct": 50.6,
        "repPct": 43.5,
        "demCandidate": "Kate Brown",
        "repCandidate": "Bud Pierce",
        "demVotes": 985027,
        "repVotes": 845609,
        "electionType": "Special",
        "demIncumbent": true,
        "repIncumbent": false
      }
    ]
  },
  {
    "id": "PA",
    "name": "Pennsylvania",
    "state": "Pennsylvania",
    "raceType": "governor",
    "probability": 0.96,
    "margin": 18,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 91
      },
      {
        "date": "Oct",
        "value": 93
      },
      {
        "date": "Nov",
        "value": 95
      },
      {
        "date": "Dec",
        "value": 96
      },
      {
        "date": "Jan",
        "value": 96
      },
      {
        "date": "Feb",
        "value": 96
      },
      {
        "date": "Mar",
        "value": 96
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Governor Josh Shapiro is running for a second term.",
    "kalshiDem": 0.96,
    "kalshiRep": 0.04,
    "candidates": {
      "dem": {
        "name": "Josh Shapiro",
        "party": "D",
        "incumbent": true
      },
      "rep": {
        "name": "Stacy Garrity",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 56.49,
        "repPct": 41.71,
        "demCandidate": "Josh Shapiro",
        "repCandidate": "Doug Mastriano",
        "demVotes": 3031137,
        "repVotes": 2238477,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 57.77,
        "repPct": 40.7,
        "demCandidate": "Tom Wolf",
        "repCandidate": "Scott Wagner",
        "demVotes": 2895652,
        "repVotes": 2039882,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 54.93,
        "repPct": 45.07,
        "demCandidate": "Tom Wolf",
        "repCandidate": "Tom Corbett",
        "demVotes": 1920355,
        "repVotes": 1575511,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "RI",
    "name": "Rhode Island",
    "state": "Rhode Island",
    "raceType": "governor",
    "probability": 0.93,
    "margin": 25,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 88
      },
      {
        "date": "Oct",
        "value": 90
      },
      {
        "date": "Nov",
        "value": 92
      },
      {
        "date": "Dec",
        "value": 93
      },
      {
        "date": "Jan",
        "value": 93
      },
      {
        "date": "Feb",
        "value": 93
      },
      {
        "date": "Mar",
        "value": 93
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Governor Dan McKee is running for a second full term in office. McKee became governor in 2021 upon the resignation of Gina Raimondo.",
    "kalshiDem": 0.93,
    "kalshiRep": 0.07,
    "candidates": {
      "dem": {
        "name": "Dan McKee",
        "party": "D",
        "incumbent": true
      },
      "rep": {
        "name": "Aaron Guckian",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 57.92,
        "repPct": 38.86,
        "demCandidate": "Dan McKee",
        "repCandidate": "Ashley Kalus",
        "demVotes": 207166,
        "repVotes": 139001,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 52.64,
        "repPct": 37.18,
        "demCandidate": "Gina Raimondo",
        "repCandidate": "Allan Fung",
        "demVotes": 198122,
        "repVotes": 139932,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 40.7,
        "repPct": 36.24,
        "demCandidate": "Gina Raimondo",
        "repCandidate": "Allan Fung",
        "demVotes": 131899,
        "repVotes": 117428,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      }
    ]
  },
  {
    "id": "WI",
    "name": "Wisconsin",
    "state": "Wisconsin",
    "raceType": "governor",
    "probability": 0.75,
    "margin": 2,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 70
      },
      {
        "date": "Oct",
        "value": 72
      },
      {
        "date": "Nov",
        "value": 74
      },
      {
        "date": "Dec",
        "value": 75
      },
      {
        "date": "Jan",
        "value": 75
      },
      {
        "date": "Feb",
        "value": 75
      },
      {
        "date": "Mar",
        "value": 75
      }
    ],
    "termLength": 4,
    "raceDesc": "Wisconsin has an open race which will be closely watched after incumbent Governor Tony Evers decided not to run for re-election.",
    "kalshiDem": 0.75,
    "kalshiRep": 0.25,
    "candidates": {
      "dem": {
        "name": "Mandela Barnes",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Tom Tiffany",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 51.15,
        "repPct": 47.75,
        "demCandidate": "Tony Evers",
        "repCandidate": "Tim Michels",
        "demVotes": 1358774,
        "repVotes": 1268535,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 49.54,
        "repPct": 48.44,
        "demCandidate": "Tony Evers",
        "repCandidate": "Scott Walker",
        "demVotes": 1324307,
        "repVotes": 1295080,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2014,
        "demPct": 46.59,
        "repPct": 52.26,
        "demCandidate": "Mary Burke",
        "repCandidate": "Scott Walker",
        "demVotes": 1122913,
        "repVotes": 1259706,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "AL",
    "name": "Alabama",
    "state": "Alabama",
    "raceType": "governor",
    "probability": 0.06,
    "margin": -25,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 3
      },
      {
        "date": "Nov",
        "value": 5
      },
      {
        "date": "Dec",
        "value": 6
      },
      {
        "date": "Jan",
        "value": 6
      },
      {
        "date": "Feb",
        "value": 6
      },
      {
        "date": "Mar",
        "value": 6
      }
    ],
    "termLength": 4,
    "raceDesc": "Democrats have not won a gubernatorial election in Alabama since 1998.",
    "kalshiDem": 0.06,
    "kalshiRep": 0.94,
    "candidates": {
      "dem": {
        "name": "Doug Jones",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Tommy Tuberville",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 29.18,
        "repPct": 66.91,
        "demCandidate": "Yolanda Flowers",
        "repCandidate": "Kay Ivey",
        "demVotes": 412961,
        "repVotes": 946932,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2018,
        "demPct": 40.39,
        "repPct": 59.46,
        "demCandidate": "Walt Maddox",
        "repCandidate": "Kay Ivey",
        "demVotes": 694495,
        "repVotes": 1022457,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2014,
        "demPct": 36.24,
        "repPct": 63.56,
        "demCandidate": "Parker Griffith",
        "repCandidate": "Robert J. Bentley",
        "demVotes": 427787,
        "repVotes": 750231,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "AK",
    "name": "Alaska",
    "state": "Alaska",
    "raceType": "governor",
    "probability": 0.24,
    "margin": -10,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 19
      },
      {
        "date": "Oct",
        "value": 21
      },
      {
        "date": "Nov",
        "value": 23
      },
      {
        "date": "Dec",
        "value": 24
      },
      {
        "date": "Jan",
        "value": 24
      },
      {
        "date": "Feb",
        "value": 24
      },
      {
        "date": "Mar",
        "value": 24
      }
    ],
    "termLength": 4,
    "raceDesc": "Alaska has a very interesting race with Democrat Nick Begich, part of a well known family in Alaska, running for governor in this open seat.",
    "kalshiDem": 0.24,
    "kalshiRep": 0.76,
    "candidates": {
      "dem": {
        "name": "Nick Begich",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Dave Bronson",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 24.21,
        "repPct": 50.29,
        "demCandidate": "Les Gara",
        "repCandidate": "Mike Dunleavy",
        "demVotes": 63851,
        "repVotes": 132632,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2018,
        "demPct": 44.41,
        "repPct": 51.44,
        "demCandidate": "Mark Begich",
        "repCandidate": "Mike Dunleavy",
        "demVotes": 125739,
        "repVotes": 145631,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 48.1,
        "repPct": 45.88,
        "demCandidate": "Bill Walker",
        "repCandidate": "Sean Parnell",
        "demVotes": 134658,
        "repVotes": 128435,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "AR",
    "name": "Arkansas",
    "state": "Arkansas",
    "raceType": "governor",
    "probability": 0.06,
    "margin": -25,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 3
      },
      {
        "date": "Nov",
        "value": 5
      },
      {
        "date": "Dec",
        "value": 6
      },
      {
        "date": "Jan",
        "value": 6
      },
      {
        "date": "Feb",
        "value": 6
      },
      {
        "date": "Mar",
        "value": 6
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Governor Sarah Huckabee Sanders is seeking re-election to a second term.",
    "kalshiDem": 0.06,
    "kalshiRep": 0.94,
    "candidates": {
      "dem": {
        "name": "Fredrick Love",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Sarah Huckabee Sanders",
        "party": "R",
        "incumbent": true
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 35.2,
        "repPct": 63,
        "demCandidate": "Chris Jones",
        "repCandidate": "Sarah Huckabee Sanders",
        "demVotes": 319242,
        "repVotes": 571105,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 31.77,
        "repPct": 65.33,
        "demCandidate": "Jared Henderson",
        "repCandidate": "Asa Hutchinson",
        "demVotes": 283218,
        "repVotes": 582406,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2014,
        "demPct": 41.49,
        "repPct": 55.44,
        "demCandidate": "Mike Ross",
        "repCandidate": "Asa Hutchinson",
        "demVotes": 352115,
        "repVotes": 470429,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      }
    ]
  },
  {
    "id": "FL",
    "name": "Florida",
    "state": "Florida",
    "raceType": "governor",
    "probability": 0.15,
    "margin": -8,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 10
      },
      {
        "date": "Oct",
        "value": 12
      },
      {
        "date": "Nov",
        "value": 14
      },
      {
        "date": "Dec",
        "value": 15
      },
      {
        "date": "Jan",
        "value": 15
      },
      {
        "date": "Feb",
        "value": 15
      },
      {
        "date": "Mar",
        "value": 15
      }
    ],
    "termLength": 4,
    "raceDesc": "The race to succeed Incumbent Governor Ron DeSantis will be an interesting one in this once swing state now trending strongly towards Republicans.",
    "kalshiDem": 0.15,
    "kalshiRep": 0.85,
    "candidates": {
      "dem": {
        "name": "David Jolly",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Byron Donalds",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 39.97,
        "repPct": 59.37,
        "demCandidate": "Charlie Crist",
        "repCandidate": "Ron DeSantis",
        "demVotes": 3106313,
        "repVotes": 4614210,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2018,
        "demPct": 49.19,
        "repPct": 49.59,
        "demCandidate": "Andrew Gillum",
        "repCandidate": "Ron DeSantis",
        "demVotes": 4043723,
        "repVotes": 4076186,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 47.07,
        "repPct": 48.14,
        "demCandidate": "Charlie Crist",
        "repCandidate": "Rick Scott",
        "demVotes": 2801198,
        "repVotes": 2865343,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "GA",
    "name": "Georgia",
    "state": "Georgia",
    "raceType": "governor",
    "probability": 0.55,
    "margin": -1,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 50
      },
      {
        "date": "Oct",
        "value": 52
      },
      {
        "date": "Nov",
        "value": 54
      },
      {
        "date": "Dec",
        "value": 55
      },
      {
        "date": "Jan",
        "value": 55
      },
      {
        "date": "Feb",
        "value": 55
      },
      {
        "date": "Mar",
        "value": 55
      }
    ],
    "termLength": 4,
    "raceDesc": "Democrats have not won a gubernatorial election in Georgia since 1998. This year might be their best shot yet to break that streak.",
    "kalshiDem": 0.55,
    "kalshiRep": 0.45,
    "candidates": {
      "dem": {
        "name": "Keisha Lance Bottoms",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Rick Jackson",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 45.88,
        "repPct": 53.41,
        "demCandidate": "Stacey Abrams",
        "repCandidate": "Brian Kemp",
        "demVotes": 1813673,
        "repVotes": 2111572,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2018,
        "demPct": 48.83,
        "repPct": 50.22,
        "demCandidate": "Stacey Abrams",
        "repCandidate": "Brian Kemp",
        "demVotes": 1923685,
        "repVotes": 1978408,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 44.88,
        "repPct": 52.74,
        "demCandidate": "Jason Carter",
        "repCandidate": "Nathan Deal",
        "demVotes": 1144794,
        "repVotes": 1345237,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "ID",
    "name": "Idaho",
    "state": "Idaho",
    "raceType": "governor",
    "probability": 0.07,
    "margin": -30,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 2
      },
      {
        "date": "Oct",
        "value": 4
      },
      {
        "date": "Nov",
        "value": 6
      },
      {
        "date": "Dec",
        "value": 7
      },
      {
        "date": "Jan",
        "value": 7
      },
      {
        "date": "Feb",
        "value": 7
      },
      {
        "date": "Mar",
        "value": 7
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Governor Brad Little is running for a third term. Democrats have not won the governorship here since 1990.",
    "kalshiDem": 0.07,
    "kalshiRep": 0.93,
    "candidates": {
      "dem": {
        "name": "TBD",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Brad Little",
        "party": "R",
        "incumbent": true
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 20.28,
        "repPct": 60.52,
        "demCandidate": "Stephen Heidt",
        "repCandidate": "Brad Little",
        "demVotes": 120160,
        "repVotes": 358598,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2018,
        "demPct": 38.19,
        "repPct": 59.76,
        "demCandidate": "Paulette Jordan",
        "repCandidate": "Brad Little",
        "demVotes": 231081,
        "repVotes": 361661,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 38.55,
        "repPct": 53.52,
        "demCandidate": "A.J. Balukoff",
        "repCandidate": "Butch Otter",
        "demVotes": 169556,
        "repVotes": 235405,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "IA",
    "name": "Iowa",
    "state": "Iowa",
    "raceType": "governor",
    "probability": 0.49,
    "margin": -2,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 44
      },
      {
        "date": "Oct",
        "value": 46
      },
      {
        "date": "Nov",
        "value": 48
      },
      {
        "date": "Dec",
        "value": 49
      },
      {
        "date": "Jan",
        "value": 49
      },
      {
        "date": "Feb",
        "value": 49
      },
      {
        "date": "Mar",
        "value": 49
      }
    ],
    "termLength": 4,
    "raceDesc": "This is surprisingly the first open seat gubernatorial election in the state since 2006, which was also the last gubernatorial election in Iowa won by a Democrat.",
    "kalshiDem": 0.49,
    "kalshiRep": 0.51,
    "candidates": {
      "dem": {
        "name": "Rob Sand",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Randy Feenstra",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 39.53,
        "repPct": 58.04,
        "demCandidate": "Deidre DeJear",
        "repCandidate": "Kim Reynolds",
        "demVotes": 482950,
        "repVotes": 709198,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2018,
        "demPct": 47.53,
        "repPct": 50.26,
        "demCandidate": "Fred Hubbell",
        "repCandidate": "Kim Reynolds",
        "demVotes": 630986,
        "repVotes": 667275,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2014,
        "demPct": 37.27,
        "repPct": 58.99,
        "demCandidate": "Jack Hatch",
        "repCandidate": "Terry Branstad",
        "demVotes": 420787,
        "repVotes": 666032,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "NE",
    "name": "Nebraska",
    "state": "Nebraska",
    "raceType": "governor",
    "probability": 0.1,
    "margin": -15,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 5
      },
      {
        "date": "Oct",
        "value": 7
      },
      {
        "date": "Nov",
        "value": 9
      },
      {
        "date": "Dec",
        "value": 10
      },
      {
        "date": "Jan",
        "value": 10
      },
      {
        "date": "Feb",
        "value": 10
      },
      {
        "date": "Mar",
        "value": 10
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Governor Jim Pillen is seeking re-election to a second term. Democrats have not won a gubernatorial election in Nebraska since 1994.",
    "kalshiDem": 0.1,
    "kalshiRep": 0.9,
    "candidates": {
      "dem": {
        "name": "TBD",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Jim Pillen",
        "party": "R",
        "incumbent": true
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 36.29,
        "repPct": 59.74,
        "demCandidate": "Carol Blood",
        "repCandidate": "Jim Pillen",
        "demVotes": 242006,
        "repVotes": 398334,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 41,
        "repPct": 59,
        "demCandidate": "Bob Krist",
        "repCandidate": "Pete Ricketts",
        "demVotes": 286169,
        "repVotes": 411812,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2014,
        "demPct": 39.23,
        "repPct": 57.15,
        "demCandidate": "Chuck Hassebrook",
        "repCandidate": "Pete Ricketts",
        "demVotes": 211905,
        "repVotes": 308751,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      }
    ]
  },
  {
    "id": "NV",
    "name": "Nevada",
    "state": "Nevada",
    "raceType": "governor",
    "probability": 0.49,
    "margin": -3,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 44
      },
      {
        "date": "Oct",
        "value": 46
      },
      {
        "date": "Nov",
        "value": 48
      },
      {
        "date": "Dec",
        "value": 49
      },
      {
        "date": "Jan",
        "value": 49
      },
      {
        "date": "Feb",
        "value": 49
      },
      {
        "date": "Mar",
        "value": 49
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Governor Joe Lombardo is running for re-election to a second term in office in this swing state.",
    "kalshiDem": 0.49,
    "kalshiRep": 0.51,
    "candidates": {
      "dem": {
        "name": "Aaron Ford",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Joe Lombardo",
        "party": "R",
        "incumbent": true
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 47.3,
        "repPct": 48.81,
        "demCandidate": "Steve Sisolak",
        "repCandidate": "Joe Lombardo",
        "demVotes": 481991,
        "repVotes": 497377,
        "electionType": "Regular",
        "demIncumbent": true,
        "repIncumbent": false
      },
      {
        "year": 2018,
        "demPct": 49.39,
        "repPct": 45.31,
        "demCandidate": "Steve Sisolak",
        "repCandidate": "Adam Laxalt",
        "demVotes": 480007,
        "repVotes": 440320,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 23.88,
        "repPct": 70.58,
        "demCandidate": "Bob Goodman",
        "repCandidate": "Brian Sandoval",
        "demVotes": 130722,
        "repVotes": 386340,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "NH",
    "name": "New Hampshire",
    "state": "New Hampshire",
    "raceType": "governor",
    "probability": 0.29,
    "margin": -10,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 24
      },
      {
        "date": "Oct",
        "value": 26
      },
      {
        "date": "Nov",
        "value": 28
      },
      {
        "date": "Dec",
        "value": 29
      },
      {
        "date": "Jan",
        "value": 29
      },
      {
        "date": "Feb",
        "value": 29
      },
      {
        "date": "Mar",
        "value": 29
      }
    ],
    "termLength": 2,
    "raceDesc": "This is one of two Republican-held governorships up for election in a state that Kamala Harris won in the 2024 Presidential Election.",
    "kalshiDem": 0.29,
    "kalshiRep": 0.71,
    "candidates": {
      "dem": {
        "name": "Cinde Warmington",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Kelly Ayotte",
        "party": "R",
        "incumbent": true
      }
    },
    "pastResults": [
      {
        "year": 2024,
        "demPct": 44.27,
        "repPct": 53.61,
        "demCandidate": "Joyce Craig",
        "repCandidate": "Kelly Ayotte",
        "demVotes": 360149,
        "repVotes": 436122,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2022,
        "demPct": 41.47,
        "repPct": 56.98,
        "demCandidate": "Tom Sherman",
        "repCandidate": "Chris Sununu",
        "demVotes": 256766,
        "repVotes": 352813,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2020,
        "demPct": 33.36,
        "repPct": 65.12,
        "demCandidate": "Dan Feltes",
        "repCandidate": "Chris Sununu",
        "demVotes": 264639,
        "repVotes": 516609,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "OH",
    "name": "Ohio",
    "state": "Ohio",
    "raceType": "governor",
    "probability": 0.56,
    "margin": 1,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 51
      },
      {
        "date": "Oct",
        "value": 53
      },
      {
        "date": "Nov",
        "value": 55
      },
      {
        "date": "Dec",
        "value": 56
      },
      {
        "date": "Jan",
        "value": 56
      },
      {
        "date": "Feb",
        "value": 56
      },
      {
        "date": "Mar",
        "value": 56
      }
    ],
    "termLength": 4,
    "raceDesc": "Democrats have not won a gubernatorial election in Ohio since 2006. This race may be the Democrats best chance to break that streak this year.",
    "kalshiDem": 0.56,
    "kalshiRep": 0.44,
    "candidates": {
      "dem": {
        "name": "Amy Acton",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Vivek Ramaswamy",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 37.38,
        "repPct": 62.41,
        "demCandidate": "Nan Whaley",
        "repCandidate": "Mike DeWine",
        "demVotes": 1545489,
        "repVotes": 2580424,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2018,
        "demPct": 46.68,
        "repPct": 50.39,
        "demCandidate": "Richard Cordray",
        "repCandidate": "Mike DeWine",
        "demVotes": 2070046,
        "repVotes": 2235825,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 33.03,
        "repPct": 63.64,
        "demCandidate": "Ed FitzGerald",
        "repCandidate": "John Kasich",
        "demVotes": 1009359,
        "repVotes": 1944848,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "OK",
    "name": "Oklahoma",
    "state": "Oklahoma",
    "raceType": "governor",
    "probability": 0.11,
    "margin": -13,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 6
      },
      {
        "date": "Oct",
        "value": 8
      },
      {
        "date": "Nov",
        "value": 10
      },
      {
        "date": "Dec",
        "value": 11
      },
      {
        "date": "Jan",
        "value": 11
      },
      {
        "date": "Feb",
        "value": 11
      },
      {
        "date": "Mar",
        "value": 11
      }
    ],
    "termLength": 4,
    "raceDesc": "Oklahoma is a deeply red state where Democrats have not won statewide since 2006.",
    "kalshiDem": 0.11,
    "kalshiRep": 0.89,
    "candidates": {
      "dem": {
        "name": "TBD",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Genter Drummond",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 41.79,
        "repPct": 55.45,
        "demCandidate": "Joy Hofmeister",
        "repCandidate": "Kevin Stitt",
        "demVotes": 481904,
        "repVotes": 639484,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2018,
        "demPct": 42.23,
        "repPct": 54.33,
        "demCandidate": "Drew Edmondson",
        "repCandidate": "Kevin Stitt",
        "demVotes": 500973,
        "repVotes": 644579,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 41.01,
        "repPct": 55.8,
        "demCandidate": "Joe Dorman",
        "repCandidate": "Mary Fallin",
        "demVotes": 338239,
        "repVotes": 460298,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "SC",
    "name": "South Carolina",
    "state": "South Carolina",
    "raceType": "governor",
    "probability": 0.05,
    "margin": -15,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 2
      },
      {
        "date": "Nov",
        "value": 4
      },
      {
        "date": "Dec",
        "value": 5
      },
      {
        "date": "Jan",
        "value": 5
      },
      {
        "date": "Feb",
        "value": 5
      },
      {
        "date": "Mar",
        "value": 5
      }
    ],
    "termLength": 4,
    "raceDesc": "South Carolina has an open seat. Democrats have not won a gubernatorial election here since 1998.",
    "kalshiDem": 0.05,
    "kalshiRep": 0.95,
    "candidates": {
      "dem": {
        "name": "TBD",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Pamela Evette",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 40.67,
        "repPct": 58.04,
        "demCandidate": "Joe Cunningham",
        "repCandidate": "Henry McMaster",
        "demVotes": 692691,
        "repVotes": 988501,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2018,
        "demPct": 45.92,
        "repPct": 53.96,
        "demCandidate": "James Smith",
        "repCandidate": "Henry McMaster",
        "demVotes": 784182,
        "repVotes": 921342,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2014,
        "demPct": 41.42,
        "repPct": 55.9,
        "demCandidate": "Vincent Sheheen",
        "repCandidate": "Nikki Haley",
        "demVotes": 516166,
        "repVotes": 696645,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "SD",
    "name": "South Dakota",
    "state": "South Dakota",
    "raceType": "governor",
    "probability": 0.04,
    "margin": -25,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 3
      },
      {
        "date": "Dec",
        "value": 4
      },
      {
        "date": "Jan",
        "value": 4
      },
      {
        "date": "Feb",
        "value": 4
      },
      {
        "date": "Mar",
        "value": 4
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Governor Larry Rhoden, who ascended to the office in 2025 after Kristi Noem resigned to become Secretary of Homeland Security, is running for his first full term. Democrats have not won a gubernatorial election in South Dakota since 1974.",
    "kalshiDem": 0.04,
    "kalshiRep": 0.96,
    "candidates": {
      "dem": {
        "name": "TBD",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Larry Rhoden",
        "party": "R",
        "incumbent": true
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 35.17,
        "repPct": 61.98,
        "demCandidate": "Jamie Smith",
        "repCandidate": "Kristi Noem",
        "demVotes": 123148,
        "repVotes": 217035,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2018,
        "demPct": 47.6,
        "repPct": 50.97,
        "demCandidate": "Billie Sutton",
        "repCandidate": "Kristi Noem",
        "demVotes": 161454,
        "repVotes": 172912,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 25.43,
        "repPct": 70.47,
        "demCandidate": "Susan Wismer",
        "repCandidate": "Dennis Daugaard",
        "demVotes": 70549,
        "repVotes": 195477,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "TN",
    "name": "Tennessee",
    "state": "Tennessee",
    "raceType": "governor",
    "probability": 0.05,
    "margin": -15,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 2
      },
      {
        "date": "Nov",
        "value": 4
      },
      {
        "date": "Dec",
        "value": 5
      },
      {
        "date": "Jan",
        "value": 5
      },
      {
        "date": "Feb",
        "value": 5
      },
      {
        "date": "Mar",
        "value": 5
      }
    ],
    "termLength": 4,
    "raceDesc": "This deep red state has an open governor seat. Democrats have not won a statewide election in Tennessee since 2006.",
    "kalshiDem": 0.05,
    "kalshiRep": 0.95,
    "candidates": {
      "dem": {
        "name": "Jerri Green",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Marsha Blackburn",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 32.92,
        "repPct": 64.91,
        "demCandidate": "Jason Martin",
        "repCandidate": "Bill Lee",
        "demVotes": 572818,
        "repVotes": 1129390,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2018,
        "demPct": 38.55,
        "repPct": 59.56,
        "demCandidate": "Karl Dean",
        "repCandidate": "Bill Lee",
        "demVotes": 864863,
        "repVotes": 1336106,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 22.84,
        "repPct": 70.31,
        "demCandidate": "Charles Brown",
        "repCandidate": "Bill Haslam",
        "demVotes": 309237,
        "repVotes": 951796,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "TX",
    "name": "Texas",
    "state": "Texas",
    "raceType": "governor",
    "probability": 0.18,
    "margin": -12,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 13
      },
      {
        "date": "Oct",
        "value": 15
      },
      {
        "date": "Nov",
        "value": 17
      },
      {
        "date": "Dec",
        "value": 18
      },
      {
        "date": "Jan",
        "value": 18
      },
      {
        "date": "Feb",
        "value": 18
      },
      {
        "date": "Mar",
        "value": 18
      }
    ],
    "termLength": 4,
    "raceDesc": "Incumbent Governor Greg Abbott is running for a fourth term.",
    "kalshiDem": 0.18,
    "kalshiRep": 0.82,
    "candidates": {
      "dem": {
        "name": "Gina Hinojosa",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Greg Abbott",
        "party": "R",
        "incumbent": true
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 43.86,
        "repPct": 54.76,
        "demCandidate": "Beto O’Rourke",
        "repCandidate": "Greg Abbott",
        "demVotes": 3553656,
        "repVotes": 4437099,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2018,
        "demPct": 42.51,
        "repPct": 55.81,
        "demCandidate": "Lupe Valdez",
        "repCandidate": "Greg Abbott",
        "demVotes": 3546615,
        "repVotes": 4656196,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2014,
        "demPct": 38.9,
        "repPct": 59.27,
        "demCandidate": "Wendy Davis",
        "repCandidate": "Greg Abbott",
        "demVotes": 1835596,
        "repVotes": 2796547,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      }
    ]
  },
  {
    "id": "VT",
    "name": "Vermont",
    "state": "Vermont",
    "raceType": "governor",
    "probability": 0.25,
    "margin": -25,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 20
      },
      {
        "date": "Oct",
        "value": 22
      },
      {
        "date": "Nov",
        "value": 24
      },
      {
        "date": "Dec",
        "value": 25
      },
      {
        "date": "Jan",
        "value": 25
      },
      {
        "date": "Feb",
        "value": 25
      },
      {
        "date": "Mar",
        "value": 25
      }
    ],
    "termLength": 2,
    "raceDesc": "Phil Scott has been governor since 2016 and is currently the most popular state governor in the nation according to a Morning Consult poll.",
    "kalshiDem": 0.25,
    "kalshiRep": 0.75,
    "candidates": {
      "dem": {
        "name": "Amanda Janoo",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Phil Scott",
        "party": "R",
        "incumbent": true
      }
    },
    "pastResults": [
      {
        "year": 2024,
        "demPct": 21.83,
        "repPct": 73.43,
        "demCandidate": "Esther Charlestin",
        "repCandidate": "Phil Scott",
        "demVotes": 79217,
        "repVotes": 266439,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2022,
        "demPct": 23.94,
        "repPct": 70.91,
        "demCandidate": "Brenda Siegel",
        "repCandidate": "Phil Scott",
        "demVotes": 68248,
        "repVotes": 202147,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2020,
        "demPct": 27.4,
        "repPct": 68.5,
        "demCandidate": "David Zuckerman",
        "repCandidate": "Phil Scott",
        "demVotes": 99214,
        "repVotes": 248412,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  },
  {
    "id": "WY",
    "name": "Wyoming",
    "state": "Wyoming",
    "raceType": "governor",
    "probability": 0.07,
    "margin": -38,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 2
      },
      {
        "date": "Oct",
        "value": 4
      },
      {
        "date": "Nov",
        "value": 6
      },
      {
        "date": "Dec",
        "value": 7
      },
      {
        "date": "Jan",
        "value": 7
      },
      {
        "date": "Feb",
        "value": 7
      },
      {
        "date": "Mar",
        "value": 7
      }
    ],
    "termLength": 4,
    "raceDesc": "Democrats have not won statewide in Wyoming since 2006.",
    "kalshiDem": 0.07,
    "kalshiRep": 0.93,
    "candidates": {
      "dem": {
        "name": "TBD",
        "party": "D",
        "incumbent": false
      },
      "rep": {
        "name": "Megan Degenfelder",
        "party": "R",
        "incumbent": false
      }
    },
    "pastResults": [
      {
        "year": 2022,
        "demPct": 15.82,
        "repPct": 74.07,
        "demCandidate": "Theresa Livingston",
        "repCandidate": "Mark Gordon",
        "demVotes": 30686,
        "repVotes": 143696,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      },
      {
        "year": 2018,
        "demPct": 27.54,
        "repPct": 67.12,
        "demCandidate": "Mary Throne",
        "repCandidate": "Mark Gordon",
        "demVotes": 55965,
        "repVotes": 136412,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": false
      },
      {
        "year": 2014,
        "demPct": 27.25,
        "repPct": 59.39,
        "demCandidate": "Pete Gosar",
        "repCandidate": "Matt Mead",
        "demVotes": 45752,
        "repVotes": 99700,
        "electionType": "Regular",
        "demIncumbent": false,
        "repIncumbent": true
      }
    ]
  }
];

export const governorNoElection: NoElectionEntry[] = [
  {
    "state": "Kentucky",
    "abbr": "KY",
    "incumbent": "Andy Beshear",
    "party": "D",
    "nextElection": 2027,
    "termLength": 4,
    "raceDesc": "TBD"
  },
  {
    "state": "Louisiana",
    "abbr": "LA",
    "incumbent": "Jeff Landry",
    "party": "R",
    "nextElection": 2027,
    "termLength": 4,
    "raceDesc": "TBD"
  },
  {
    "state": "Mississippi",
    "abbr": "MS",
    "incumbent": "Tate Reeves",
    "party": "R",
    "nextElection": 2027,
    "termLength": 4,
    "raceDesc": "TBD"
  },
  {
    "state": "Utah",
    "abbr": "UT",
    "incumbent": "Spencer Cox",
    "party": "R",
    "nextElection": 2028,
    "termLength": 4,
    "raceDesc": "TBD"
  },
  {
    "state": "North Carolina",
    "abbr": "NC",
    "incumbent": "Josh Stein",
    "party": "D",
    "nextElection": 2028,
    "termLength": 4,
    "raceDesc": "TBD"
  },
  {
    "state": "Delaware",
    "abbr": "DE",
    "incumbent": "Matt Meyer",
    "party": "D",
    "nextElection": 2028,
    "termLength": 4,
    "raceDesc": "TBD"
  },
  {
    "state": "Washington",
    "abbr": "WA",
    "incumbent": "Bob Ferguson",
    "party": "D",
    "nextElection": 2028,
    "termLength": 4,
    "raceDesc": "TBD"
  },
  {
    "state": "Indiana",
    "abbr": "IN",
    "incumbent": "Mike Braun",
    "party": "R",
    "nextElection": 2028,
    "termLength": 4,
    "raceDesc": "TBD"
  },
  {
    "state": "Missouri",
    "abbr": "MO",
    "incumbent": "Mike Kehoe",
    "party": "R",
    "nextElection": 2028,
    "termLength": 4,
    "raceDesc": "TBD"
  },
  {
    "state": "Montana",
    "abbr": "MT",
    "incumbent": "Greg Gianforte",
    "party": "R",
    "nextElection": 2028,
    "termLength": 4,
    "raceDesc": "TBD"
  },
  {
    "state": "North Dakota",
    "abbr": "ND",
    "incumbent": "Kelly Armstrong",
    "party": "R",
    "nextElection": 2028,
    "termLength": 4,
    "raceDesc": "TBD"
  },
  {
    "state": "West Virginia",
    "abbr": "WV",
    "incumbent": "Patrick Morrisey",
    "party": "R",
    "nextElection": 2028,
    "termLength": 4,
    "raceDesc": "TBD"
  },
  {
    "state": "New Jersey",
    "abbr": "NJ",
    "incumbent": "Mikie Sherill",
    "party": "D",
    "nextElection": 2029,
    "termLength": 4,
    "raceDesc": "TBD"
  },
  {
    "state": "Virginia",
    "abbr": "VA",
    "incumbent": "Abigail Spanberger",
    "party": "D",
    "nextElection": 2029,
    "termLength": 4,
    "raceDesc": "TBD"
  }
];

export const houseData: RaceForecast[] = [
  {
    "id": "0101",
    "name": "AL-1",
    "state": "Alabama",
    "raceType": "house",
    "probability": 0.33,
    "margin": -7.1,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 28
      },
      {
        "date": "Oct",
        "value": 30
      },
      {
        "date": "Nov",
        "value": 32
      },
      {
        "date": "Dec",
        "value": 33
      },
      {
        "date": "Jan",
        "value": 33
      },
      {
        "date": "Feb",
        "value": 33
      },
      {
        "date": "Mar",
        "value": 33
      }
    ]
  },
  {
    "id": "0102",
    "name": "AL-2",
    "state": "Alabama",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "0103",
    "name": "AL-3",
    "state": "Alabama",
    "raceType": "house",
    "probability": 0.46,
    "margin": -1.5,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 41
      },
      {
        "date": "Oct",
        "value": 43
      },
      {
        "date": "Nov",
        "value": 45
      },
      {
        "date": "Dec",
        "value": 46
      },
      {
        "date": "Jan",
        "value": 46
      },
      {
        "date": "Feb",
        "value": 46
      },
      {
        "date": "Mar",
        "value": 46
      }
    ]
  },
  {
    "id": "0104",
    "name": "AL-4",
    "state": "Alabama",
    "raceType": "house",
    "probability": 0.1,
    "margin": -16.8,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 5
      },
      {
        "date": "Oct",
        "value": 7
      },
      {
        "date": "Nov",
        "value": 9
      },
      {
        "date": "Dec",
        "value": 10
      },
      {
        "date": "Jan",
        "value": 10
      },
      {
        "date": "Feb",
        "value": 10
      },
      {
        "date": "Mar",
        "value": 10
      }
    ]
  },
  {
    "id": "0105",
    "name": "AL-5",
    "state": "Alabama",
    "raceType": "house",
    "probability": 0.15,
    "margin": -14.6,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 10
      },
      {
        "date": "Oct",
        "value": 12
      },
      {
        "date": "Nov",
        "value": 14
      },
      {
        "date": "Dec",
        "value": 15
      },
      {
        "date": "Jan",
        "value": 15
      },
      {
        "date": "Feb",
        "value": 15
      },
      {
        "date": "Mar",
        "value": 15
      }
    ]
  },
  {
    "id": "0106",
    "name": "AL-6",
    "state": "Alabama",
    "raceType": "house",
    "probability": 0.44,
    "margin": -2.5,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 39
      },
      {
        "date": "Oct",
        "value": 41
      },
      {
        "date": "Nov",
        "value": 43
      },
      {
        "date": "Dec",
        "value": 44
      },
      {
        "date": "Jan",
        "value": 44
      },
      {
        "date": "Feb",
        "value": 44
      },
      {
        "date": "Mar",
        "value": 44
      }
    ]
  },
  {
    "id": "0107",
    "name": "AL-7",
    "state": "Alabama",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "0200",
    "name": "AK-AL",
    "state": "Alaska",
    "raceType": "house",
    "probability": 0.4,
    "margin": -4.3,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 35
      },
      {
        "date": "Oct",
        "value": 37
      },
      {
        "date": "Nov",
        "value": 39
      },
      {
        "date": "Dec",
        "value": 40
      },
      {
        "date": "Jan",
        "value": 40
      },
      {
        "date": "Feb",
        "value": 40
      },
      {
        "date": "Mar",
        "value": 40
      }
    ]
  },
  {
    "id": "0401",
    "name": "AZ-1",
    "state": "Arizona",
    "raceType": "house",
    "probability": 0.38,
    "margin": -4.8,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 33
      },
      {
        "date": "Oct",
        "value": 35
      },
      {
        "date": "Nov",
        "value": 37
      },
      {
        "date": "Dec",
        "value": 38
      },
      {
        "date": "Jan",
        "value": 38
      },
      {
        "date": "Feb",
        "value": 38
      },
      {
        "date": "Mar",
        "value": 38
      }
    ]
  },
  {
    "id": "0402",
    "name": "AZ-2",
    "state": "Arizona",
    "raceType": "house",
    "probability": 0.43,
    "margin": -3.1,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 38
      },
      {
        "date": "Oct",
        "value": 40
      },
      {
        "date": "Nov",
        "value": 42
      },
      {
        "date": "Dec",
        "value": 43
      },
      {
        "date": "Jan",
        "value": 43
      },
      {
        "date": "Feb",
        "value": 43
      },
      {
        "date": "Mar",
        "value": 43
      }
    ]
  },
  {
    "id": "0403",
    "name": "AZ-3",
    "state": "Arizona",
    "raceType": "house",
    "probability": 0.72,
    "margin": 9.3,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 67
      },
      {
        "date": "Oct",
        "value": 69
      },
      {
        "date": "Nov",
        "value": 71
      },
      {
        "date": "Dec",
        "value": 72
      },
      {
        "date": "Jan",
        "value": 72
      },
      {
        "date": "Feb",
        "value": 72
      },
      {
        "date": "Mar",
        "value": 72
      }
    ]
  },
  {
    "id": "0404",
    "name": "AZ-4",
    "state": "Arizona",
    "raceType": "house",
    "probability": 0.24,
    "margin": -10.7,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 19
      },
      {
        "date": "Oct",
        "value": 21
      },
      {
        "date": "Nov",
        "value": 23
      },
      {
        "date": "Dec",
        "value": 24
      },
      {
        "date": "Jan",
        "value": 24
      },
      {
        "date": "Feb",
        "value": 24
      },
      {
        "date": "Mar",
        "value": 24
      }
    ]
  },
  {
    "id": "0405",
    "name": "AZ-5",
    "state": "Arizona",
    "raceType": "house",
    "probability": 0.65,
    "margin": 6.5,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 60
      },
      {
        "date": "Oct",
        "value": 62
      },
      {
        "date": "Nov",
        "value": 64
      },
      {
        "date": "Dec",
        "value": 65
      },
      {
        "date": "Jan",
        "value": 65
      },
      {
        "date": "Feb",
        "value": 65
      },
      {
        "date": "Mar",
        "value": 65
      }
    ]
  },
  {
    "id": "0406",
    "name": "AZ-6",
    "state": "Arizona",
    "raceType": "house",
    "probability": 0.53,
    "margin": 1.2,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 48
      },
      {
        "date": "Oct",
        "value": 50
      },
      {
        "date": "Nov",
        "value": 52
      },
      {
        "date": "Dec",
        "value": 53
      },
      {
        "date": "Jan",
        "value": 53
      },
      {
        "date": "Feb",
        "value": 53
      },
      {
        "date": "Mar",
        "value": 53
      }
    ]
  },
  {
    "id": "0407",
    "name": "AZ-7",
    "state": "Arizona",
    "raceType": "house",
    "probability": 0.3,
    "margin": -8.2,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 25
      },
      {
        "date": "Oct",
        "value": 27
      },
      {
        "date": "Nov",
        "value": 29
      },
      {
        "date": "Dec",
        "value": 30
      },
      {
        "date": "Jan",
        "value": 30
      },
      {
        "date": "Feb",
        "value": 30
      },
      {
        "date": "Mar",
        "value": 30
      }
    ]
  },
  {
    "id": "0408",
    "name": "AZ-8",
    "state": "Arizona",
    "raceType": "house",
    "probability": 0.76,
    "margin": 10.9,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 71
      },
      {
        "date": "Oct",
        "value": 73
      },
      {
        "date": "Nov",
        "value": 75
      },
      {
        "date": "Dec",
        "value": 76
      },
      {
        "date": "Jan",
        "value": 76
      },
      {
        "date": "Feb",
        "value": 76
      },
      {
        "date": "Mar",
        "value": 76
      }
    ]
  },
  {
    "id": "0409",
    "name": "AZ-9",
    "state": "Arizona",
    "raceType": "house",
    "probability": 0.31,
    "margin": -7.9,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 26
      },
      {
        "date": "Oct",
        "value": 28
      },
      {
        "date": "Nov",
        "value": 30
      },
      {
        "date": "Dec",
        "value": 31
      },
      {
        "date": "Jan",
        "value": 31
      },
      {
        "date": "Feb",
        "value": 31
      },
      {
        "date": "Mar",
        "value": 31
      }
    ]
  },
  {
    "id": "0501",
    "name": "AR-1",
    "state": "Arkansas",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "0502",
    "name": "AR-2",
    "state": "Arkansas",
    "raceType": "house",
    "probability": 0.18,
    "margin": -13.3,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 13
      },
      {
        "date": "Oct",
        "value": 15
      },
      {
        "date": "Nov",
        "value": 17
      },
      {
        "date": "Dec",
        "value": 18
      },
      {
        "date": "Jan",
        "value": 18
      },
      {
        "date": "Feb",
        "value": 18
      },
      {
        "date": "Mar",
        "value": 18
      }
    ]
  },
  {
    "id": "0503",
    "name": "AR-3",
    "state": "Arkansas",
    "raceType": "house",
    "probability": 0.35,
    "margin": -6.2,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 30
      },
      {
        "date": "Oct",
        "value": 32
      },
      {
        "date": "Nov",
        "value": 34
      },
      {
        "date": "Dec",
        "value": 35
      },
      {
        "date": "Jan",
        "value": 35
      },
      {
        "date": "Feb",
        "value": 35
      },
      {
        "date": "Mar",
        "value": 35
      }
    ]
  },
  {
    "id": "0504",
    "name": "AR-4",
    "state": "Arkansas",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "0601",
    "name": "CA-1",
    "state": "California",
    "raceType": "house",
    "probability": 0.42,
    "margin": -3.2,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 37
      },
      {
        "date": "Oct",
        "value": 39
      },
      {
        "date": "Nov",
        "value": 41
      },
      {
        "date": "Dec",
        "value": 42
      },
      {
        "date": "Jan",
        "value": 42
      },
      {
        "date": "Feb",
        "value": 42
      },
      {
        "date": "Mar",
        "value": 42
      }
    ]
  },
  {
    "id": "0602",
    "name": "CA-2",
    "state": "California",
    "raceType": "house",
    "probability": 0.73,
    "margin": 9.7,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 68
      },
      {
        "date": "Oct",
        "value": 70
      },
      {
        "date": "Nov",
        "value": 72
      },
      {
        "date": "Dec",
        "value": 73
      },
      {
        "date": "Jan",
        "value": 73
      },
      {
        "date": "Feb",
        "value": 73
      },
      {
        "date": "Mar",
        "value": 73
      }
    ]
  },
  {
    "id": "0603",
    "name": "CA-3",
    "state": "California",
    "raceType": "house",
    "probability": 0.76,
    "margin": 10.8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 71
      },
      {
        "date": "Oct",
        "value": 73
      },
      {
        "date": "Nov",
        "value": 75
      },
      {
        "date": "Dec",
        "value": 76
      },
      {
        "date": "Jan",
        "value": 76
      },
      {
        "date": "Feb",
        "value": 76
      },
      {
        "date": "Mar",
        "value": 76
      }
    ]
  },
  {
    "id": "0604",
    "name": "CA-4",
    "state": "California",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.7,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "0605",
    "name": "CA-5",
    "state": "California",
    "raceType": "house",
    "probability": 0.9,
    "margin": 16.6,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 85
      },
      {
        "date": "Oct",
        "value": 87
      },
      {
        "date": "Nov",
        "value": 89
      },
      {
        "date": "Dec",
        "value": 90
      },
      {
        "date": "Jan",
        "value": 90
      },
      {
        "date": "Feb",
        "value": 90
      },
      {
        "date": "Mar",
        "value": 90
      }
    ]
  },
  {
    "id": "0606",
    "name": "CA-6",
    "state": "California",
    "raceType": "house",
    "probability": 0.53,
    "margin": 1.1,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 48
      },
      {
        "date": "Oct",
        "value": 50
      },
      {
        "date": "Nov",
        "value": 52
      },
      {
        "date": "Dec",
        "value": 53
      },
      {
        "date": "Jan",
        "value": 53
      },
      {
        "date": "Feb",
        "value": 53
      },
      {
        "date": "Mar",
        "value": 53
      }
    ]
  },
  {
    "id": "0607",
    "name": "CA-7",
    "state": "California",
    "raceType": "house",
    "probability": 0.59,
    "margin": 3.6,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 54
      },
      {
        "date": "Oct",
        "value": 56
      },
      {
        "date": "Nov",
        "value": 58
      },
      {
        "date": "Dec",
        "value": 59
      },
      {
        "date": "Jan",
        "value": 59
      },
      {
        "date": "Feb",
        "value": 59
      },
      {
        "date": "Mar",
        "value": 59
      }
    ]
  },
  {
    "id": "0608",
    "name": "CA-8",
    "state": "California",
    "raceType": "house",
    "probability": 0.87,
    "margin": 15.4,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 82
      },
      {
        "date": "Oct",
        "value": 84
      },
      {
        "date": "Nov",
        "value": 86
      },
      {
        "date": "Dec",
        "value": 87
      },
      {
        "date": "Jan",
        "value": 87
      },
      {
        "date": "Feb",
        "value": 87
      },
      {
        "date": "Mar",
        "value": 87
      }
    ]
  },
  {
    "id": "0609",
    "name": "CA-9",
    "state": "California",
    "raceType": "house",
    "probability": 0.39,
    "margin": -4.5,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 34
      },
      {
        "date": "Oct",
        "value": 36
      },
      {
        "date": "Nov",
        "value": 38
      },
      {
        "date": "Dec",
        "value": 39
      },
      {
        "date": "Jan",
        "value": 39
      },
      {
        "date": "Feb",
        "value": 39
      },
      {
        "date": "Mar",
        "value": 39
      }
    ]
  },
  {
    "id": "0610",
    "name": "CA-10",
    "state": "California",
    "raceType": "house",
    "probability": 0.81,
    "margin": 13.1,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 76
      },
      {
        "date": "Oct",
        "value": 78
      },
      {
        "date": "Nov",
        "value": 80
      },
      {
        "date": "Dec",
        "value": 81
      },
      {
        "date": "Jan",
        "value": 81
      },
      {
        "date": "Feb",
        "value": 81
      },
      {
        "date": "Mar",
        "value": 81
      }
    ]
  },
  {
    "id": "0611",
    "name": "CA-11",
    "state": "California",
    "raceType": "house",
    "probability": 0.67,
    "margin": 7.1,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 62
      },
      {
        "date": "Oct",
        "value": 64
      },
      {
        "date": "Nov",
        "value": 66
      },
      {
        "date": "Dec",
        "value": 67
      },
      {
        "date": "Jan",
        "value": 67
      },
      {
        "date": "Feb",
        "value": 67
      },
      {
        "date": "Mar",
        "value": 67
      }
    ]
  },
  {
    "id": "0612",
    "name": "CA-12",
    "state": "California",
    "raceType": "house",
    "probability": 0.46,
    "margin": -1.7,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 41
      },
      {
        "date": "Oct",
        "value": 43
      },
      {
        "date": "Nov",
        "value": 45
      },
      {
        "date": "Dec",
        "value": 46
      },
      {
        "date": "Jan",
        "value": 46
      },
      {
        "date": "Feb",
        "value": 46
      },
      {
        "date": "Mar",
        "value": 46
      }
    ]
  },
  {
    "id": "0613",
    "name": "CA-13",
    "state": "California",
    "raceType": "house",
    "probability": 0.91,
    "margin": 17.2,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 86
      },
      {
        "date": "Oct",
        "value": 88
      },
      {
        "date": "Nov",
        "value": 90
      },
      {
        "date": "Dec",
        "value": 91
      },
      {
        "date": "Jan",
        "value": 91
      },
      {
        "date": "Feb",
        "value": 91
      },
      {
        "date": "Mar",
        "value": 91
      }
    ]
  },
  {
    "id": "0614",
    "name": "CA-14",
    "state": "California",
    "raceType": "house",
    "probability": 0.46,
    "margin": -1.8,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 41
      },
      {
        "date": "Oct",
        "value": 43
      },
      {
        "date": "Nov",
        "value": 45
      },
      {
        "date": "Dec",
        "value": 46
      },
      {
        "date": "Jan",
        "value": 46
      },
      {
        "date": "Feb",
        "value": 46
      },
      {
        "date": "Mar",
        "value": 46
      }
    ]
  },
  {
    "id": "0615",
    "name": "CA-15",
    "state": "California",
    "raceType": "house",
    "probability": 0.68,
    "margin": 7.4,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 63
      },
      {
        "date": "Oct",
        "value": 65
      },
      {
        "date": "Nov",
        "value": 67
      },
      {
        "date": "Dec",
        "value": 68
      },
      {
        "date": "Jan",
        "value": 68
      },
      {
        "date": "Feb",
        "value": 68
      },
      {
        "date": "Mar",
        "value": 68
      }
    ]
  },
  {
    "id": "0616",
    "name": "CA-16",
    "state": "California",
    "raceType": "house",
    "probability": 0.81,
    "margin": 12.8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 76
      },
      {
        "date": "Oct",
        "value": 78
      },
      {
        "date": "Nov",
        "value": 80
      },
      {
        "date": "Dec",
        "value": 81
      },
      {
        "date": "Jan",
        "value": 81
      },
      {
        "date": "Feb",
        "value": 81
      },
      {
        "date": "Mar",
        "value": 81
      }
    ]
  },
  {
    "id": "0617",
    "name": "CA-17",
    "state": "California",
    "raceType": "house",
    "probability": 0.39,
    "margin": -4.4,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 34
      },
      {
        "date": "Oct",
        "value": 36
      },
      {
        "date": "Nov",
        "value": 38
      },
      {
        "date": "Dec",
        "value": 39
      },
      {
        "date": "Jan",
        "value": 39
      },
      {
        "date": "Feb",
        "value": 39
      },
      {
        "date": "Mar",
        "value": 39
      }
    ]
  },
  {
    "id": "0618",
    "name": "CA-18",
    "state": "California",
    "raceType": "house",
    "probability": 0.87,
    "margin": 15.6,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 82
      },
      {
        "date": "Oct",
        "value": 84
      },
      {
        "date": "Nov",
        "value": 86
      },
      {
        "date": "Dec",
        "value": 87
      },
      {
        "date": "Jan",
        "value": 87
      },
      {
        "date": "Feb",
        "value": 87
      },
      {
        "date": "Mar",
        "value": 87
      }
    ]
  },
  {
    "id": "0619",
    "name": "CA-19",
    "state": "California",
    "raceType": "house",
    "probability": 0.58,
    "margin": 3.3,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 53
      },
      {
        "date": "Oct",
        "value": 55
      },
      {
        "date": "Nov",
        "value": 57
      },
      {
        "date": "Dec",
        "value": 58
      },
      {
        "date": "Jan",
        "value": 58
      },
      {
        "date": "Feb",
        "value": 58
      },
      {
        "date": "Mar",
        "value": 58
      }
    ]
  },
  {
    "id": "0620",
    "name": "CA-20",
    "state": "California",
    "raceType": "house",
    "probability": 0.53,
    "margin": 1.4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 48
      },
      {
        "date": "Oct",
        "value": 50
      },
      {
        "date": "Nov",
        "value": 52
      },
      {
        "date": "Dec",
        "value": 53
      },
      {
        "date": "Jan",
        "value": 53
      },
      {
        "date": "Feb",
        "value": 53
      },
      {
        "date": "Mar",
        "value": 53
      }
    ]
  },
  {
    "id": "0621",
    "name": "CA-21",
    "state": "California",
    "raceType": "house",
    "probability": 0.89,
    "margin": 16.5,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 84
      },
      {
        "date": "Oct",
        "value": 86
      },
      {
        "date": "Nov",
        "value": 88
      },
      {
        "date": "Dec",
        "value": 89
      },
      {
        "date": "Jan",
        "value": 89
      },
      {
        "date": "Feb",
        "value": 89
      },
      {
        "date": "Mar",
        "value": 89
      }
    ]
  },
  {
    "id": "0622",
    "name": "CA-22",
    "state": "California",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.8,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "0623",
    "name": "CA-23",
    "state": "California",
    "raceType": "house",
    "probability": 0.76,
    "margin": 11.1,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 71
      },
      {
        "date": "Oct",
        "value": 73
      },
      {
        "date": "Nov",
        "value": 75
      },
      {
        "date": "Dec",
        "value": 76
      },
      {
        "date": "Jan",
        "value": 76
      },
      {
        "date": "Feb",
        "value": 76
      },
      {
        "date": "Mar",
        "value": 76
      }
    ]
  },
  {
    "id": "0624",
    "name": "CA-24",
    "state": "California",
    "raceType": "house",
    "probability": 0.72,
    "margin": 9.4,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 67
      },
      {
        "date": "Oct",
        "value": 69
      },
      {
        "date": "Nov",
        "value": 71
      },
      {
        "date": "Dec",
        "value": 72
      },
      {
        "date": "Jan",
        "value": 72
      },
      {
        "date": "Feb",
        "value": 72
      },
      {
        "date": "Mar",
        "value": 72
      }
    ]
  },
  {
    "id": "0625",
    "name": "CA-25",
    "state": "California",
    "raceType": "house",
    "probability": 0.43,
    "margin": -3.1,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 38
      },
      {
        "date": "Oct",
        "value": 40
      },
      {
        "date": "Nov",
        "value": 42
      },
      {
        "date": "Dec",
        "value": 43
      },
      {
        "date": "Jan",
        "value": 43
      },
      {
        "date": "Feb",
        "value": 43
      },
      {
        "date": "Mar",
        "value": 43
      }
    ]
  },
  {
    "id": "0626",
    "name": "CA-26",
    "state": "California",
    "raceType": "house",
    "probability": 0.9,
    "margin": 17,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 85
      },
      {
        "date": "Oct",
        "value": 87
      },
      {
        "date": "Nov",
        "value": 89
      },
      {
        "date": "Dec",
        "value": 90
      },
      {
        "date": "Jan",
        "value": 90
      },
      {
        "date": "Feb",
        "value": 90
      },
      {
        "date": "Mar",
        "value": 90
      }
    ]
  },
  {
    "id": "0627",
    "name": "CA-27",
    "state": "California",
    "raceType": "house",
    "probability": 0.5,
    "margin": -0.1,
    "rating": "Tilt R",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "0628",
    "name": "CA-28",
    "state": "California",
    "raceType": "house",
    "probability": 0.62,
    "margin": 5,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 57
      },
      {
        "date": "Oct",
        "value": 59
      },
      {
        "date": "Nov",
        "value": 61
      },
      {
        "date": "Dec",
        "value": 62
      },
      {
        "date": "Jan",
        "value": 62
      },
      {
        "date": "Feb",
        "value": 62
      },
      {
        "date": "Mar",
        "value": 62
      }
    ]
  },
  {
    "id": "0629",
    "name": "CA-29",
    "state": "California",
    "raceType": "house",
    "probability": 0.85,
    "margin": 14.6,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 80
      },
      {
        "date": "Oct",
        "value": 82
      },
      {
        "date": "Nov",
        "value": 84
      },
      {
        "date": "Dec",
        "value": 85
      },
      {
        "date": "Jan",
        "value": 85
      },
      {
        "date": "Feb",
        "value": 85
      },
      {
        "date": "Mar",
        "value": 85
      }
    ]
  },
  {
    "id": "0630",
    "name": "CA-30",
    "state": "California",
    "raceType": "house",
    "probability": 0.39,
    "margin": -4.6,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 34
      },
      {
        "date": "Oct",
        "value": 36
      },
      {
        "date": "Nov",
        "value": 38
      },
      {
        "date": "Dec",
        "value": 39
      },
      {
        "date": "Jan",
        "value": 39
      },
      {
        "date": "Feb",
        "value": 39
      },
      {
        "date": "Mar",
        "value": 39
      }
    ]
  },
  {
    "id": "0631",
    "name": "CA-31",
    "state": "California",
    "raceType": "house",
    "probability": 0.84,
    "margin": 14.1,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 79
      },
      {
        "date": "Oct",
        "value": 81
      },
      {
        "date": "Nov",
        "value": 83
      },
      {
        "date": "Dec",
        "value": 84
      },
      {
        "date": "Jan",
        "value": 84
      },
      {
        "date": "Feb",
        "value": 84
      },
      {
        "date": "Mar",
        "value": 84
      }
    ]
  },
  {
    "id": "0632",
    "name": "CA-32",
    "state": "California",
    "raceType": "house",
    "probability": 0.63,
    "margin": 5.6,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 58
      },
      {
        "date": "Oct",
        "value": 60
      },
      {
        "date": "Nov",
        "value": 62
      },
      {
        "date": "Dec",
        "value": 63
      },
      {
        "date": "Jan",
        "value": 63
      },
      {
        "date": "Feb",
        "value": 63
      },
      {
        "date": "Mar",
        "value": 63
      }
    ]
  },
  {
    "id": "0633",
    "name": "CA-33",
    "state": "California",
    "raceType": "house",
    "probability": 0.49,
    "margin": -0.6,
    "rating": "Tilt R",
    "history": [
      {
        "date": "Sep",
        "value": 44
      },
      {
        "date": "Oct",
        "value": 46
      },
      {
        "date": "Nov",
        "value": 48
      },
      {
        "date": "Dec",
        "value": 49
      },
      {
        "date": "Jan",
        "value": 49
      },
      {
        "date": "Feb",
        "value": 49
      },
      {
        "date": "Mar",
        "value": 49
      }
    ]
  },
  {
    "id": "0634",
    "name": "CA-34",
    "state": "California",
    "raceType": "house",
    "probability": 0.91,
    "margin": 17.1,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 86
      },
      {
        "date": "Oct",
        "value": 88
      },
      {
        "date": "Nov",
        "value": 90
      },
      {
        "date": "Dec",
        "value": 91
      },
      {
        "date": "Jan",
        "value": 91
      },
      {
        "date": "Feb",
        "value": 91
      },
      {
        "date": "Mar",
        "value": 91
      }
    ]
  },
  {
    "id": "0635",
    "name": "CA-35",
    "state": "California",
    "raceType": "house",
    "probability": 0.43,
    "margin": -2.8,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 38
      },
      {
        "date": "Oct",
        "value": 40
      },
      {
        "date": "Nov",
        "value": 42
      },
      {
        "date": "Dec",
        "value": 43
      },
      {
        "date": "Jan",
        "value": 43
      },
      {
        "date": "Feb",
        "value": 43
      },
      {
        "date": "Mar",
        "value": 43
      }
    ]
  },
  {
    "id": "0636",
    "name": "CA-36",
    "state": "California",
    "raceType": "house",
    "probability": 0.71,
    "margin": 8.8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 66
      },
      {
        "date": "Oct",
        "value": 68
      },
      {
        "date": "Nov",
        "value": 70
      },
      {
        "date": "Dec",
        "value": 71
      },
      {
        "date": "Jan",
        "value": 71
      },
      {
        "date": "Feb",
        "value": 71
      },
      {
        "date": "Mar",
        "value": 71
      }
    ]
  },
  {
    "id": "0637",
    "name": "CA-37",
    "state": "California",
    "raceType": "house",
    "probability": 0.78,
    "margin": 11.6,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 73
      },
      {
        "date": "Oct",
        "value": 75
      },
      {
        "date": "Nov",
        "value": 77
      },
      {
        "date": "Dec",
        "value": 78
      },
      {
        "date": "Jan",
        "value": 78
      },
      {
        "date": "Feb",
        "value": 78
      },
      {
        "date": "Mar",
        "value": 78
      }
    ]
  },
  {
    "id": "0638",
    "name": "CA-38",
    "state": "California",
    "raceType": "house",
    "probability": 0.4,
    "margin": -4.1,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 35
      },
      {
        "date": "Oct",
        "value": 37
      },
      {
        "date": "Nov",
        "value": 39
      },
      {
        "date": "Dec",
        "value": 40
      },
      {
        "date": "Jan",
        "value": 40
      },
      {
        "date": "Feb",
        "value": 40
      },
      {
        "date": "Mar",
        "value": 40
      }
    ]
  },
  {
    "id": "0639",
    "name": "CA-39",
    "state": "California",
    "raceType": "house",
    "probability": 0.89,
    "margin": 16.3,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 84
      },
      {
        "date": "Oct",
        "value": 86
      },
      {
        "date": "Nov",
        "value": 88
      },
      {
        "date": "Dec",
        "value": 89
      },
      {
        "date": "Jan",
        "value": 89
      },
      {
        "date": "Feb",
        "value": 89
      },
      {
        "date": "Mar",
        "value": 89
      }
    ]
  },
  {
    "id": "0640",
    "name": "CA-40",
    "state": "California",
    "raceType": "house",
    "probability": 0.55,
    "margin": 1.9,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 50
      },
      {
        "date": "Oct",
        "value": 52
      },
      {
        "date": "Nov",
        "value": 54
      },
      {
        "date": "Dec",
        "value": 55
      },
      {
        "date": "Jan",
        "value": 55
      },
      {
        "date": "Feb",
        "value": 55
      },
      {
        "date": "Mar",
        "value": 55
      }
    ]
  },
  {
    "id": "0641",
    "name": "CA-41",
    "state": "California",
    "raceType": "house",
    "probability": 0.57,
    "margin": 2.8,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 52
      },
      {
        "date": "Oct",
        "value": 54
      },
      {
        "date": "Nov",
        "value": 56
      },
      {
        "date": "Dec",
        "value": 57
      },
      {
        "date": "Jan",
        "value": 57
      },
      {
        "date": "Feb",
        "value": 57
      },
      {
        "date": "Mar",
        "value": 57
      }
    ]
  },
  {
    "id": "0642",
    "name": "CA-42",
    "state": "California",
    "raceType": "house",
    "probability": 0.88,
    "margin": 15.9,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 83
      },
      {
        "date": "Oct",
        "value": 85
      },
      {
        "date": "Nov",
        "value": 87
      },
      {
        "date": "Dec",
        "value": 88
      },
      {
        "date": "Jan",
        "value": 88
      },
      {
        "date": "Feb",
        "value": 88
      },
      {
        "date": "Mar",
        "value": 88
      }
    ]
  },
  {
    "id": "0643",
    "name": "CA-43",
    "state": "California",
    "raceType": "house",
    "probability": 0.4,
    "margin": -4.3,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 35
      },
      {
        "date": "Oct",
        "value": 37
      },
      {
        "date": "Nov",
        "value": 39
      },
      {
        "date": "Dec",
        "value": 40
      },
      {
        "date": "Jan",
        "value": 40
      },
      {
        "date": "Feb",
        "value": 40
      },
      {
        "date": "Mar",
        "value": 40
      }
    ]
  },
  {
    "id": "0644",
    "name": "CA-44",
    "state": "California",
    "raceType": "house",
    "probability": 0.79,
    "margin": 12.3,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 74
      },
      {
        "date": "Oct",
        "value": 76
      },
      {
        "date": "Nov",
        "value": 78
      },
      {
        "date": "Dec",
        "value": 79
      },
      {
        "date": "Jan",
        "value": 79
      },
      {
        "date": "Feb",
        "value": 79
      },
      {
        "date": "Mar",
        "value": 79
      }
    ]
  },
  {
    "id": "0645",
    "name": "CA-45",
    "state": "California",
    "raceType": "house",
    "probability": 0.69,
    "margin": 8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 64
      },
      {
        "date": "Oct",
        "value": 66
      },
      {
        "date": "Nov",
        "value": 68
      },
      {
        "date": "Dec",
        "value": 69
      },
      {
        "date": "Jan",
        "value": 69
      },
      {
        "date": "Feb",
        "value": 69
      },
      {
        "date": "Mar",
        "value": 69
      }
    ]
  },
  {
    "id": "0646",
    "name": "CA-46",
    "state": "California",
    "raceType": "house",
    "probability": 0.45,
    "margin": -2.2,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 40
      },
      {
        "date": "Oct",
        "value": 42
      },
      {
        "date": "Nov",
        "value": 44
      },
      {
        "date": "Dec",
        "value": 45
      },
      {
        "date": "Jan",
        "value": 45
      },
      {
        "date": "Feb",
        "value": 45
      },
      {
        "date": "Mar",
        "value": 45
      }
    ]
  },
  {
    "id": "0647",
    "name": "CA-47",
    "state": "California",
    "raceType": "house",
    "probability": 0.91,
    "margin": 17.2,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 86
      },
      {
        "date": "Oct",
        "value": 88
      },
      {
        "date": "Nov",
        "value": 90
      },
      {
        "date": "Dec",
        "value": 91
      },
      {
        "date": "Jan",
        "value": 91
      },
      {
        "date": "Feb",
        "value": 91
      },
      {
        "date": "Mar",
        "value": 91
      }
    ]
  },
  {
    "id": "0648",
    "name": "CA-48",
    "state": "California",
    "raceType": "house",
    "probability": 0.47,
    "margin": -1.2,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 42
      },
      {
        "date": "Oct",
        "value": 44
      },
      {
        "date": "Nov",
        "value": 46
      },
      {
        "date": "Dec",
        "value": 47
      },
      {
        "date": "Jan",
        "value": 47
      },
      {
        "date": "Feb",
        "value": 47
      },
      {
        "date": "Mar",
        "value": 47
      }
    ]
  },
  {
    "id": "0649",
    "name": "CA-49",
    "state": "California",
    "raceType": "house",
    "probability": 0.66,
    "margin": 6.5,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 61
      },
      {
        "date": "Oct",
        "value": 63
      },
      {
        "date": "Nov",
        "value": 65
      },
      {
        "date": "Dec",
        "value": 66
      },
      {
        "date": "Jan",
        "value": 66
      },
      {
        "date": "Feb",
        "value": 66
      },
      {
        "date": "Mar",
        "value": 66
      }
    ]
  },
  {
    "id": "0650",
    "name": "CA-50",
    "state": "California",
    "raceType": "house",
    "probability": 0.82,
    "margin": 13.5,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 77
      },
      {
        "date": "Oct",
        "value": 79
      },
      {
        "date": "Nov",
        "value": 81
      },
      {
        "date": "Dec",
        "value": 82
      },
      {
        "date": "Jan",
        "value": 82
      },
      {
        "date": "Feb",
        "value": 82
      },
      {
        "date": "Mar",
        "value": 82
      }
    ]
  },
  {
    "id": "0651",
    "name": "CA-51",
    "state": "California",
    "raceType": "house",
    "probability": 0.39,
    "margin": -4.6,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 34
      },
      {
        "date": "Oct",
        "value": 36
      },
      {
        "date": "Nov",
        "value": 38
      },
      {
        "date": "Dec",
        "value": 39
      },
      {
        "date": "Jan",
        "value": 39
      },
      {
        "date": "Feb",
        "value": 39
      },
      {
        "date": "Mar",
        "value": 39
      }
    ]
  },
  {
    "id": "0652",
    "name": "CA-52",
    "state": "California",
    "raceType": "house",
    "probability": 0.86,
    "margin": 15.1,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 81
      },
      {
        "date": "Oct",
        "value": 83
      },
      {
        "date": "Nov",
        "value": 85
      },
      {
        "date": "Dec",
        "value": 86
      },
      {
        "date": "Jan",
        "value": 86
      },
      {
        "date": "Feb",
        "value": 86
      },
      {
        "date": "Mar",
        "value": 86
      }
    ]
  },
  {
    "id": "0801",
    "name": "CO-1",
    "state": "Colorado",
    "raceType": "house",
    "probability": 0.29,
    "margin": -8.8,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 24
      },
      {
        "date": "Oct",
        "value": 26
      },
      {
        "date": "Nov",
        "value": 28
      },
      {
        "date": "Dec",
        "value": 29
      },
      {
        "date": "Jan",
        "value": 29
      },
      {
        "date": "Feb",
        "value": 29
      },
      {
        "date": "Mar",
        "value": 29
      }
    ]
  },
  {
    "id": "0802",
    "name": "CO-2",
    "state": "Colorado",
    "raceType": "house",
    "probability": 0.76,
    "margin": 10.8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 71
      },
      {
        "date": "Oct",
        "value": 73
      },
      {
        "date": "Nov",
        "value": 75
      },
      {
        "date": "Dec",
        "value": 76
      },
      {
        "date": "Jan",
        "value": 76
      },
      {
        "date": "Feb",
        "value": 76
      },
      {
        "date": "Mar",
        "value": 76
      }
    ]
  },
  {
    "id": "0803",
    "name": "CO-3",
    "state": "Colorado",
    "raceType": "house",
    "probability": 0.5,
    "margin": 0.2,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "0804",
    "name": "CO-4",
    "state": "Colorado",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.8,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "0805",
    "name": "CO-5",
    "state": "Colorado",
    "raceType": "house",
    "probability": 0.8,
    "margin": 12.6,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 75
      },
      {
        "date": "Oct",
        "value": 77
      },
      {
        "date": "Nov",
        "value": 79
      },
      {
        "date": "Dec",
        "value": 80
      },
      {
        "date": "Jan",
        "value": 80
      },
      {
        "date": "Feb",
        "value": 80
      },
      {
        "date": "Mar",
        "value": 80
      }
    ]
  },
  {
    "id": "0806",
    "name": "CO-6",
    "state": "Colorado",
    "raceType": "house",
    "probability": 0.32,
    "margin": -7.6,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 27
      },
      {
        "date": "Oct",
        "value": 29
      },
      {
        "date": "Nov",
        "value": 31
      },
      {
        "date": "Dec",
        "value": 32
      },
      {
        "date": "Jan",
        "value": 32
      },
      {
        "date": "Feb",
        "value": 32
      },
      {
        "date": "Mar",
        "value": 32
      }
    ]
  },
  {
    "id": "0807",
    "name": "CO-7",
    "state": "Colorado",
    "raceType": "house",
    "probability": 0.64,
    "margin": 5.8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 59
      },
      {
        "date": "Oct",
        "value": 61
      },
      {
        "date": "Nov",
        "value": 63
      },
      {
        "date": "Dec",
        "value": 64
      },
      {
        "date": "Jan",
        "value": 64
      },
      {
        "date": "Feb",
        "value": 64
      },
      {
        "date": "Mar",
        "value": 64
      }
    ]
  },
  {
    "id": "0808",
    "name": "CO-8",
    "state": "Colorado",
    "raceType": "house",
    "probability": 0.65,
    "margin": 6.3,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 60
      },
      {
        "date": "Oct",
        "value": 62
      },
      {
        "date": "Nov",
        "value": 64
      },
      {
        "date": "Dec",
        "value": 65
      },
      {
        "date": "Jan",
        "value": 65
      },
      {
        "date": "Feb",
        "value": 65
      },
      {
        "date": "Mar",
        "value": 65
      }
    ]
  },
  {
    "id": "0901",
    "name": "CT-1",
    "state": "Connecticut",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.8,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "0902",
    "name": "CT-2",
    "state": "Connecticut",
    "raceType": "house",
    "probability": 0.89,
    "margin": 16.5,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 84
      },
      {
        "date": "Oct",
        "value": 86
      },
      {
        "date": "Nov",
        "value": 88
      },
      {
        "date": "Dec",
        "value": 89
      },
      {
        "date": "Jan",
        "value": 89
      },
      {
        "date": "Feb",
        "value": 89
      },
      {
        "date": "Mar",
        "value": 89
      }
    ]
  },
  {
    "id": "0903",
    "name": "CT-3",
    "state": "Connecticut",
    "raceType": "house",
    "probability": 0.53,
    "margin": 1.3,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 48
      },
      {
        "date": "Oct",
        "value": 50
      },
      {
        "date": "Nov",
        "value": 52
      },
      {
        "date": "Dec",
        "value": 53
      },
      {
        "date": "Jan",
        "value": 53
      },
      {
        "date": "Feb",
        "value": 53
      },
      {
        "date": "Mar",
        "value": 53
      }
    ]
  },
  {
    "id": "0904",
    "name": "CT-4",
    "state": "Connecticut",
    "raceType": "house",
    "probability": 0.58,
    "margin": 3.4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 53
      },
      {
        "date": "Oct",
        "value": 55
      },
      {
        "date": "Nov",
        "value": 57
      },
      {
        "date": "Dec",
        "value": 58
      },
      {
        "date": "Jan",
        "value": 58
      },
      {
        "date": "Feb",
        "value": 58
      },
      {
        "date": "Mar",
        "value": 58
      }
    ]
  },
  {
    "id": "0905",
    "name": "CT-5",
    "state": "Connecticut",
    "raceType": "house",
    "probability": 0.87,
    "margin": 15.5,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 82
      },
      {
        "date": "Oct",
        "value": 84
      },
      {
        "date": "Nov",
        "value": 86
      },
      {
        "date": "Dec",
        "value": 87
      },
      {
        "date": "Jan",
        "value": 87
      },
      {
        "date": "Feb",
        "value": 87
      },
      {
        "date": "Mar",
        "value": 87
      }
    ]
  },
  {
    "id": "1000",
    "name": "DE-AL",
    "state": "Delaware",
    "raceType": "house",
    "probability": 0.5,
    "margin": 0,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "1201",
    "name": "FL-1",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.31,
    "margin": -8.1,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 26
      },
      {
        "date": "Oct",
        "value": 28
      },
      {
        "date": "Nov",
        "value": 30
      },
      {
        "date": "Dec",
        "value": 31
      },
      {
        "date": "Jan",
        "value": 31
      },
      {
        "date": "Feb",
        "value": 31
      },
      {
        "date": "Mar",
        "value": 31
      }
    ]
  },
  {
    "id": "1202",
    "name": "FL-2",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.6,
    "margin": 4.3,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 55
      },
      {
        "date": "Oct",
        "value": 57
      },
      {
        "date": "Nov",
        "value": 59
      },
      {
        "date": "Dec",
        "value": 60
      },
      {
        "date": "Jan",
        "value": 60
      },
      {
        "date": "Feb",
        "value": 60
      },
      {
        "date": "Mar",
        "value": 60
      }
    ]
  },
  {
    "id": "1203",
    "name": "FL-3",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.12,
    "margin": -15.8,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 7
      },
      {
        "date": "Oct",
        "value": 9
      },
      {
        "date": "Nov",
        "value": 11
      },
      {
        "date": "Dec",
        "value": 12
      },
      {
        "date": "Jan",
        "value": 12
      },
      {
        "date": "Feb",
        "value": 12
      },
      {
        "date": "Mar",
        "value": 12
      }
    ]
  },
  {
    "id": "1204",
    "name": "FL-4",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.53,
    "margin": 1.4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 48
      },
      {
        "date": "Oct",
        "value": 50
      },
      {
        "date": "Nov",
        "value": 52
      },
      {
        "date": "Dec",
        "value": 53
      },
      {
        "date": "Jan",
        "value": 53
      },
      {
        "date": "Feb",
        "value": 53
      },
      {
        "date": "Mar",
        "value": 53
      }
    ]
  },
  {
    "id": "1205",
    "name": "FL-5",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.9,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "1206",
    "name": "FL-6",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.18,
    "margin": -13.2,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 13
      },
      {
        "date": "Oct",
        "value": 15
      },
      {
        "date": "Nov",
        "value": 17
      },
      {
        "date": "Dec",
        "value": 18
      },
      {
        "date": "Jan",
        "value": 18
      },
      {
        "date": "Feb",
        "value": 18
      },
      {
        "date": "Mar",
        "value": 18
      }
    ]
  },
  {
    "id": "1207",
    "name": "FL-7",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.64,
    "margin": 5.9,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 59
      },
      {
        "date": "Oct",
        "value": 61
      },
      {
        "date": "Nov",
        "value": 63
      },
      {
        "date": "Dec",
        "value": 64
      },
      {
        "date": "Jan",
        "value": 64
      },
      {
        "date": "Feb",
        "value": 64
      },
      {
        "date": "Mar",
        "value": 64
      }
    ]
  },
  {
    "id": "1208",
    "name": "FL-8",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.19,
    "margin": -12.9,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 14
      },
      {
        "date": "Oct",
        "value": 16
      },
      {
        "date": "Nov",
        "value": 18
      },
      {
        "date": "Dec",
        "value": 19
      },
      {
        "date": "Jan",
        "value": 19
      },
      {
        "date": "Feb",
        "value": 19
      },
      {
        "date": "Mar",
        "value": 19
      }
    ]
  },
  {
    "id": "1209",
    "name": "FL-9",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.4,
    "margin": -4.3,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 35
      },
      {
        "date": "Oct",
        "value": 37
      },
      {
        "date": "Nov",
        "value": 39
      },
      {
        "date": "Dec",
        "value": 40
      },
      {
        "date": "Jan",
        "value": 40
      },
      {
        "date": "Feb",
        "value": 40
      },
      {
        "date": "Mar",
        "value": 40
      }
    ]
  },
  {
    "id": "1210",
    "name": "FL-10",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.54,
    "margin": 1.8,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 49
      },
      {
        "date": "Oct",
        "value": 51
      },
      {
        "date": "Nov",
        "value": 53
      },
      {
        "date": "Dec",
        "value": 54
      },
      {
        "date": "Jan",
        "value": 54
      },
      {
        "date": "Feb",
        "value": 54
      },
      {
        "date": "Mar",
        "value": 54
      }
    ]
  },
  {
    "id": "1211",
    "name": "FL-11",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.12,
    "margin": -15.8,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 7
      },
      {
        "date": "Oct",
        "value": 9
      },
      {
        "date": "Nov",
        "value": 11
      },
      {
        "date": "Dec",
        "value": 12
      },
      {
        "date": "Jan",
        "value": 12
      },
      {
        "date": "Feb",
        "value": 12
      },
      {
        "date": "Mar",
        "value": 12
      }
    ]
  },
  {
    "id": "1212",
    "name": "FL-12",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.6,
    "margin": 4.1,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 55
      },
      {
        "date": "Oct",
        "value": 57
      },
      {
        "date": "Nov",
        "value": 59
      },
      {
        "date": "Dec",
        "value": 60
      },
      {
        "date": "Jan",
        "value": 60
      },
      {
        "date": "Feb",
        "value": 60
      },
      {
        "date": "Mar",
        "value": 60
      }
    ]
  },
  {
    "id": "1213",
    "name": "FL-13",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.32,
    "margin": -7.7,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 27
      },
      {
        "date": "Oct",
        "value": 29
      },
      {
        "date": "Nov",
        "value": 31
      },
      {
        "date": "Dec",
        "value": 32
      },
      {
        "date": "Jan",
        "value": 32
      },
      {
        "date": "Feb",
        "value": 32
      },
      {
        "date": "Mar",
        "value": 32
      }
    ]
  },
  {
    "id": "1214",
    "name": "FL-14",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.26,
    "margin": -10.3,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 21
      },
      {
        "date": "Oct",
        "value": 23
      },
      {
        "date": "Nov",
        "value": 25
      },
      {
        "date": "Dec",
        "value": 26
      },
      {
        "date": "Jan",
        "value": 26
      },
      {
        "date": "Feb",
        "value": 26
      },
      {
        "date": "Mar",
        "value": 26
      }
    ]
  },
  {
    "id": "1215",
    "name": "FL-15",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.63,
    "margin": 5.3,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 58
      },
      {
        "date": "Oct",
        "value": 60
      },
      {
        "date": "Nov",
        "value": 62
      },
      {
        "date": "Dec",
        "value": 63
      },
      {
        "date": "Jan",
        "value": 63
      },
      {
        "date": "Feb",
        "value": 63
      },
      {
        "date": "Mar",
        "value": 63
      }
    ]
  },
  {
    "id": "1216",
    "name": "FL-16",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.14,
    "margin": -15,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 9
      },
      {
        "date": "Oct",
        "value": 11
      },
      {
        "date": "Nov",
        "value": 13
      },
      {
        "date": "Dec",
        "value": 14
      },
      {
        "date": "Jan",
        "value": 14
      },
      {
        "date": "Feb",
        "value": 14
      },
      {
        "date": "Mar",
        "value": 14
      }
    ]
  },
  {
    "id": "1217",
    "name": "FL-17",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.49,
    "margin": -0.6,
    "rating": "Tilt R",
    "history": [
      {
        "date": "Sep",
        "value": 44
      },
      {
        "date": "Oct",
        "value": 46
      },
      {
        "date": "Nov",
        "value": 48
      },
      {
        "date": "Dec",
        "value": 49
      },
      {
        "date": "Jan",
        "value": 49
      },
      {
        "date": "Feb",
        "value": 49
      },
      {
        "date": "Mar",
        "value": 49
      }
    ]
  },
  {
    "id": "1218",
    "name": "FL-18",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.46,
    "margin": -1.6,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 41
      },
      {
        "date": "Oct",
        "value": 43
      },
      {
        "date": "Nov",
        "value": 45
      },
      {
        "date": "Dec",
        "value": 46
      },
      {
        "date": "Jan",
        "value": 46
      },
      {
        "date": "Feb",
        "value": 46
      },
      {
        "date": "Mar",
        "value": 46
      }
    ]
  },
  {
    "id": "1219",
    "name": "FL-19",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.15,
    "margin": -14.6,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 10
      },
      {
        "date": "Oct",
        "value": 12
      },
      {
        "date": "Nov",
        "value": 14
      },
      {
        "date": "Dec",
        "value": 15
      },
      {
        "date": "Jan",
        "value": 15
      },
      {
        "date": "Feb",
        "value": 15
      },
      {
        "date": "Mar",
        "value": 15
      }
    ]
  },
  {
    "id": "1220",
    "name": "FL-20",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.63,
    "margin": 5.6,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 58
      },
      {
        "date": "Oct",
        "value": 60
      },
      {
        "date": "Nov",
        "value": 62
      },
      {
        "date": "Dec",
        "value": 63
      },
      {
        "date": "Jan",
        "value": 63
      },
      {
        "date": "Feb",
        "value": 63
      },
      {
        "date": "Mar",
        "value": 63
      }
    ]
  },
  {
    "id": "1221",
    "name": "FL-21",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.23,
    "margin": -11.1,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 18
      },
      {
        "date": "Oct",
        "value": 20
      },
      {
        "date": "Nov",
        "value": 22
      },
      {
        "date": "Dec",
        "value": 23
      },
      {
        "date": "Jan",
        "value": 23
      },
      {
        "date": "Feb",
        "value": 23
      },
      {
        "date": "Mar",
        "value": 23
      }
    ]
  },
  {
    "id": "1222",
    "name": "FL-22",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.34,
    "margin": -6.7,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 29
      },
      {
        "date": "Oct",
        "value": 31
      },
      {
        "date": "Nov",
        "value": 33
      },
      {
        "date": "Dec",
        "value": 34
      },
      {
        "date": "Jan",
        "value": 34
      },
      {
        "date": "Feb",
        "value": 34
      },
      {
        "date": "Mar",
        "value": 34
      }
    ]
  },
  {
    "id": "1223",
    "name": "FL-23",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.58,
    "margin": 3.4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 53
      },
      {
        "date": "Oct",
        "value": 55
      },
      {
        "date": "Nov",
        "value": 57
      },
      {
        "date": "Dec",
        "value": 58
      },
      {
        "date": "Jan",
        "value": 58
      },
      {
        "date": "Feb",
        "value": 58
      },
      {
        "date": "Mar",
        "value": 58
      }
    ]
  },
  {
    "id": "1224",
    "name": "FL-24",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.12,
    "margin": -15.9,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 7
      },
      {
        "date": "Oct",
        "value": 9
      },
      {
        "date": "Nov",
        "value": 11
      },
      {
        "date": "Dec",
        "value": 12
      },
      {
        "date": "Jan",
        "value": 12
      },
      {
        "date": "Feb",
        "value": 12
      },
      {
        "date": "Mar",
        "value": 12
      }
    ]
  },
  {
    "id": "1225",
    "name": "FL-25",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.56,
    "margin": 2.5,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 51
      },
      {
        "date": "Oct",
        "value": 53
      },
      {
        "date": "Nov",
        "value": 55
      },
      {
        "date": "Dec",
        "value": 56
      },
      {
        "date": "Jan",
        "value": 56
      },
      {
        "date": "Feb",
        "value": 56
      },
      {
        "date": "Mar",
        "value": 56
      }
    ]
  },
  {
    "id": "1226",
    "name": "FL-26",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.37,
    "margin": -5.3,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 32
      },
      {
        "date": "Oct",
        "value": 34
      },
      {
        "date": "Nov",
        "value": 36
      },
      {
        "date": "Dec",
        "value": 37
      },
      {
        "date": "Jan",
        "value": 37
      },
      {
        "date": "Feb",
        "value": 37
      },
      {
        "date": "Mar",
        "value": 37
      }
    ]
  },
  {
    "id": "1227",
    "name": "FL-27",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.21,
    "margin": -12.2,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 16
      },
      {
        "date": "Oct",
        "value": 18
      },
      {
        "date": "Nov",
        "value": 20
      },
      {
        "date": "Dec",
        "value": 21
      },
      {
        "date": "Jan",
        "value": 21
      },
      {
        "date": "Feb",
        "value": 21
      },
      {
        "date": "Mar",
        "value": 21
      }
    ]
  },
  {
    "id": "1228",
    "name": "FL-28",
    "state": "Florida",
    "raceType": "house",
    "probability": 0.64,
    "margin": 5.8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 59
      },
      {
        "date": "Oct",
        "value": 61
      },
      {
        "date": "Nov",
        "value": 63
      },
      {
        "date": "Dec",
        "value": 64
      },
      {
        "date": "Jan",
        "value": 64
      },
      {
        "date": "Feb",
        "value": 64
      },
      {
        "date": "Mar",
        "value": 64
      }
    ]
  },
  {
    "id": "1301",
    "name": "GA-1",
    "state": "Georgia",
    "raceType": "house",
    "probability": 0.44,
    "margin": -2.3,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 39
      },
      {
        "date": "Oct",
        "value": 41
      },
      {
        "date": "Nov",
        "value": 43
      },
      {
        "date": "Dec",
        "value": 44
      },
      {
        "date": "Jan",
        "value": 44
      },
      {
        "date": "Feb",
        "value": 44
      },
      {
        "date": "Mar",
        "value": 44
      }
    ]
  },
  {
    "id": "1302",
    "name": "GA-2",
    "state": "Georgia",
    "raceType": "house",
    "probability": 0.61,
    "margin": 4.7,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 56
      },
      {
        "date": "Oct",
        "value": 58
      },
      {
        "date": "Nov",
        "value": 60
      },
      {
        "date": "Dec",
        "value": 61
      },
      {
        "date": "Jan",
        "value": 61
      },
      {
        "date": "Feb",
        "value": 61
      },
      {
        "date": "Mar",
        "value": 61
      }
    ]
  },
  {
    "id": "1303",
    "name": "GA-3",
    "state": "Georgia",
    "raceType": "house",
    "probability": 0.18,
    "margin": -13.4,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 13
      },
      {
        "date": "Oct",
        "value": 15
      },
      {
        "date": "Nov",
        "value": 17
      },
      {
        "date": "Dec",
        "value": 18
      },
      {
        "date": "Jan",
        "value": 18
      },
      {
        "date": "Feb",
        "value": 18
      },
      {
        "date": "Mar",
        "value": 18
      }
    ]
  },
  {
    "id": "1304",
    "name": "GA-4",
    "state": "Georgia",
    "raceType": "house",
    "probability": 0.65,
    "margin": 6.3,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 60
      },
      {
        "date": "Oct",
        "value": 62
      },
      {
        "date": "Nov",
        "value": 64
      },
      {
        "date": "Dec",
        "value": 65
      },
      {
        "date": "Jan",
        "value": 65
      },
      {
        "date": "Feb",
        "value": 65
      },
      {
        "date": "Mar",
        "value": 65
      }
    ]
  },
  {
    "id": "1305",
    "name": "GA-5",
    "state": "Georgia",
    "raceType": "house",
    "probability": 0.39,
    "margin": -4.6,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 34
      },
      {
        "date": "Oct",
        "value": 36
      },
      {
        "date": "Nov",
        "value": 38
      },
      {
        "date": "Dec",
        "value": 39
      },
      {
        "date": "Jan",
        "value": 39
      },
      {
        "date": "Feb",
        "value": 39
      },
      {
        "date": "Mar",
        "value": 39
      }
    ]
  },
  {
    "id": "1306",
    "name": "GA-6",
    "state": "Georgia",
    "raceType": "house",
    "probability": 0.3,
    "margin": -8.2,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 25
      },
      {
        "date": "Oct",
        "value": 27
      },
      {
        "date": "Nov",
        "value": 29
      },
      {
        "date": "Dec",
        "value": 30
      },
      {
        "date": "Jan",
        "value": 30
      },
      {
        "date": "Feb",
        "value": 30
      },
      {
        "date": "Mar",
        "value": 30
      }
    ]
  },
  {
    "id": "1307",
    "name": "GA-7",
    "state": "Georgia",
    "raceType": "house",
    "probability": 0.69,
    "margin": 8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 64
      },
      {
        "date": "Oct",
        "value": 66
      },
      {
        "date": "Nov",
        "value": 68
      },
      {
        "date": "Dec",
        "value": 69
      },
      {
        "date": "Jan",
        "value": 69
      },
      {
        "date": "Feb",
        "value": 69
      },
      {
        "date": "Mar",
        "value": 69
      }
    ]
  },
  {
    "id": "1308",
    "name": "GA-8",
    "state": "Georgia",
    "raceType": "house",
    "probability": 0.21,
    "margin": -12.3,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 16
      },
      {
        "date": "Oct",
        "value": 18
      },
      {
        "date": "Nov",
        "value": 20
      },
      {
        "date": "Dec",
        "value": 21
      },
      {
        "date": "Jan",
        "value": 21
      },
      {
        "date": "Feb",
        "value": 21
      },
      {
        "date": "Mar",
        "value": 21
      }
    ]
  },
  {
    "id": "1309",
    "name": "GA-9",
    "state": "Georgia",
    "raceType": "house",
    "probability": 0.53,
    "margin": 1.4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 48
      },
      {
        "date": "Oct",
        "value": 50
      },
      {
        "date": "Nov",
        "value": 52
      },
      {
        "date": "Dec",
        "value": 53
      },
      {
        "date": "Jan",
        "value": 53
      },
      {
        "date": "Feb",
        "value": 53
      },
      {
        "date": "Mar",
        "value": 53
      }
    ]
  },
  {
    "id": "1310",
    "name": "GA-10",
    "state": "Georgia",
    "raceType": "house",
    "probability": 0.54,
    "margin": 1.5,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 49
      },
      {
        "date": "Oct",
        "value": 51
      },
      {
        "date": "Nov",
        "value": 53
      },
      {
        "date": "Dec",
        "value": 54
      },
      {
        "date": "Jan",
        "value": 54
      },
      {
        "date": "Feb",
        "value": 54
      },
      {
        "date": "Mar",
        "value": 54
      }
    ]
  },
  {
    "id": "1311",
    "name": "GA-11",
    "state": "Georgia",
    "raceType": "house",
    "probability": 0.21,
    "margin": -12.3,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 16
      },
      {
        "date": "Oct",
        "value": 18
      },
      {
        "date": "Nov",
        "value": 20
      },
      {
        "date": "Dec",
        "value": 21
      },
      {
        "date": "Jan",
        "value": 21
      },
      {
        "date": "Feb",
        "value": 21
      },
      {
        "date": "Mar",
        "value": 21
      }
    ]
  },
  {
    "id": "1312",
    "name": "GA-12",
    "state": "Georgia",
    "raceType": "house",
    "probability": 0.69,
    "margin": 8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 64
      },
      {
        "date": "Oct",
        "value": 66
      },
      {
        "date": "Nov",
        "value": 68
      },
      {
        "date": "Dec",
        "value": 69
      },
      {
        "date": "Jan",
        "value": 69
      },
      {
        "date": "Feb",
        "value": 69
      },
      {
        "date": "Mar",
        "value": 69
      }
    ]
  },
  {
    "id": "1313",
    "name": "GA-13",
    "state": "Georgia",
    "raceType": "house",
    "probability": 0.31,
    "margin": -8.2,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 26
      },
      {
        "date": "Oct",
        "value": 28
      },
      {
        "date": "Nov",
        "value": 30
      },
      {
        "date": "Dec",
        "value": 31
      },
      {
        "date": "Jan",
        "value": 31
      },
      {
        "date": "Feb",
        "value": 31
      },
      {
        "date": "Mar",
        "value": 31
      }
    ]
  },
  {
    "id": "1314",
    "name": "GA-14",
    "state": "Georgia",
    "raceType": "house",
    "probability": 0.39,
    "margin": -4.7,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 34
      },
      {
        "date": "Oct",
        "value": 36
      },
      {
        "date": "Nov",
        "value": 38
      },
      {
        "date": "Dec",
        "value": 39
      },
      {
        "date": "Jan",
        "value": 39
      },
      {
        "date": "Feb",
        "value": 39
      },
      {
        "date": "Mar",
        "value": 39
      }
    ]
  },
  {
    "id": "1501",
    "name": "HI-1",
    "state": "Hawaii",
    "raceType": "house",
    "probability": 0.97,
    "margin": 19.7,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 92
      },
      {
        "date": "Oct",
        "value": 94
      },
      {
        "date": "Nov",
        "value": 96
      },
      {
        "date": "Dec",
        "value": 97
      },
      {
        "date": "Jan",
        "value": 97
      },
      {
        "date": "Feb",
        "value": 97
      },
      {
        "date": "Mar",
        "value": 97
      }
    ]
  },
  {
    "id": "1502",
    "name": "HI-2",
    "state": "Hawaii",
    "raceType": "house",
    "probability": 0.85,
    "margin": 14.8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 80
      },
      {
        "date": "Oct",
        "value": 82
      },
      {
        "date": "Nov",
        "value": 84
      },
      {
        "date": "Dec",
        "value": 85
      },
      {
        "date": "Jan",
        "value": 85
      },
      {
        "date": "Feb",
        "value": 85
      },
      {
        "date": "Mar",
        "value": 85
      }
    ]
  },
  {
    "id": "1601",
    "name": "ID-1",
    "state": "Idaho",
    "raceType": "house",
    "probability": 0.36,
    "margin": -6,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 31
      },
      {
        "date": "Oct",
        "value": 33
      },
      {
        "date": "Nov",
        "value": 35
      },
      {
        "date": "Dec",
        "value": 36
      },
      {
        "date": "Jan",
        "value": 36
      },
      {
        "date": "Feb",
        "value": 36
      },
      {
        "date": "Mar",
        "value": 36
      }
    ]
  },
  {
    "id": "1602",
    "name": "ID-2",
    "state": "Idaho",
    "raceType": "house",
    "probability": 0.1,
    "margin": -16.6,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 5
      },
      {
        "date": "Oct",
        "value": 7
      },
      {
        "date": "Nov",
        "value": 9
      },
      {
        "date": "Dec",
        "value": 10
      },
      {
        "date": "Jan",
        "value": 10
      },
      {
        "date": "Feb",
        "value": 10
      },
      {
        "date": "Mar",
        "value": 10
      }
    ]
  },
  {
    "id": "1701",
    "name": "IL-1",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.84,
    "margin": 14.4,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 79
      },
      {
        "date": "Oct",
        "value": 81
      },
      {
        "date": "Nov",
        "value": 83
      },
      {
        "date": "Dec",
        "value": 84
      },
      {
        "date": "Jan",
        "value": 84
      },
      {
        "date": "Feb",
        "value": 84
      },
      {
        "date": "Mar",
        "value": 84
      }
    ]
  },
  {
    "id": "1702",
    "name": "IL-2",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.48,
    "margin": -0.8,
    "rating": "Tilt R",
    "history": [
      {
        "date": "Sep",
        "value": 43
      },
      {
        "date": "Oct",
        "value": 45
      },
      {
        "date": "Nov",
        "value": 47
      },
      {
        "date": "Dec",
        "value": 48
      },
      {
        "date": "Jan",
        "value": 48
      },
      {
        "date": "Feb",
        "value": 48
      },
      {
        "date": "Mar",
        "value": 48
      }
    ]
  },
  {
    "id": "1703",
    "name": "IL-3",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.53,
    "margin": 1.3,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 48
      },
      {
        "date": "Oct",
        "value": 50
      },
      {
        "date": "Nov",
        "value": 52
      },
      {
        "date": "Dec",
        "value": 53
      },
      {
        "date": "Jan",
        "value": 53
      },
      {
        "date": "Feb",
        "value": 53
      },
      {
        "date": "Mar",
        "value": 53
      }
    ]
  },
  {
    "id": "1704",
    "name": "IL-4",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.82,
    "margin": 13.4,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 77
      },
      {
        "date": "Oct",
        "value": 79
      },
      {
        "date": "Nov",
        "value": 81
      },
      {
        "date": "Dec",
        "value": 82
      },
      {
        "date": "Jan",
        "value": 82
      },
      {
        "date": "Feb",
        "value": 82
      },
      {
        "date": "Mar",
        "value": 82
      }
    ]
  },
  {
    "id": "1705",
    "name": "IL-5",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.34,
    "margin": -6.5,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 29
      },
      {
        "date": "Oct",
        "value": 31
      },
      {
        "date": "Nov",
        "value": 33
      },
      {
        "date": "Dec",
        "value": 34
      },
      {
        "date": "Jan",
        "value": 34
      },
      {
        "date": "Feb",
        "value": 34
      },
      {
        "date": "Mar",
        "value": 34
      }
    ]
  },
  {
    "id": "1706",
    "name": "IL-6",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.76,
    "margin": 10.8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 71
      },
      {
        "date": "Oct",
        "value": 73
      },
      {
        "date": "Nov",
        "value": 75
      },
      {
        "date": "Dec",
        "value": 76
      },
      {
        "date": "Jan",
        "value": 76
      },
      {
        "date": "Feb",
        "value": 76
      },
      {
        "date": "Mar",
        "value": 76
      }
    ]
  },
  {
    "id": "1707",
    "name": "IL-7",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.62,
    "margin": 5.2,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 57
      },
      {
        "date": "Oct",
        "value": 59
      },
      {
        "date": "Nov",
        "value": 61
      },
      {
        "date": "Dec",
        "value": 62
      },
      {
        "date": "Jan",
        "value": 62
      },
      {
        "date": "Feb",
        "value": 62
      },
      {
        "date": "Mar",
        "value": 62
      }
    ]
  },
  {
    "id": "1708",
    "name": "IL-8",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.9,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "1709",
    "name": "IL-9",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.86,
    "margin": 15.1,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 81
      },
      {
        "date": "Oct",
        "value": 83
      },
      {
        "date": "Nov",
        "value": 85
      },
      {
        "date": "Dec",
        "value": 86
      },
      {
        "date": "Jan",
        "value": 86
      },
      {
        "date": "Feb",
        "value": 86
      },
      {
        "date": "Mar",
        "value": 86
      }
    ]
  },
  {
    "id": "1710",
    "name": "IL-10",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.8,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "1711",
    "name": "IL-11",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.62,
    "margin": 5.1,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 57
      },
      {
        "date": "Oct",
        "value": 59
      },
      {
        "date": "Nov",
        "value": 61
      },
      {
        "date": "Dec",
        "value": 62
      },
      {
        "date": "Jan",
        "value": 62
      },
      {
        "date": "Feb",
        "value": 62
      },
      {
        "date": "Mar",
        "value": 62
      }
    ]
  },
  {
    "id": "1712",
    "name": "IL-12",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.76,
    "margin": 10.9,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 71
      },
      {
        "date": "Oct",
        "value": 73
      },
      {
        "date": "Nov",
        "value": 75
      },
      {
        "date": "Dec",
        "value": 76
      },
      {
        "date": "Jan",
        "value": 76
      },
      {
        "date": "Feb",
        "value": 76
      },
      {
        "date": "Mar",
        "value": 76
      }
    ]
  },
  {
    "id": "1713",
    "name": "IL-13",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.34,
    "margin": -6.6,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 29
      },
      {
        "date": "Oct",
        "value": 31
      },
      {
        "date": "Nov",
        "value": 33
      },
      {
        "date": "Dec",
        "value": 34
      },
      {
        "date": "Jan",
        "value": 34
      },
      {
        "date": "Feb",
        "value": 34
      },
      {
        "date": "Mar",
        "value": 34
      }
    ]
  },
  {
    "id": "1714",
    "name": "IL-14",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.82,
    "margin": 13.4,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 77
      },
      {
        "date": "Oct",
        "value": 79
      },
      {
        "date": "Nov",
        "value": 81
      },
      {
        "date": "Dec",
        "value": 82
      },
      {
        "date": "Jan",
        "value": 82
      },
      {
        "date": "Feb",
        "value": 82
      },
      {
        "date": "Mar",
        "value": 82
      }
    ]
  },
  {
    "id": "1715",
    "name": "IL-15",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.53,
    "margin": 1.4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 48
      },
      {
        "date": "Oct",
        "value": 50
      },
      {
        "date": "Nov",
        "value": 52
      },
      {
        "date": "Dec",
        "value": 53
      },
      {
        "date": "Jan",
        "value": 53
      },
      {
        "date": "Feb",
        "value": 53
      },
      {
        "date": "Mar",
        "value": 53
      }
    ]
  },
  {
    "id": "1716",
    "name": "IL-16",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.48,
    "margin": -0.9,
    "rating": "Tilt R",
    "history": [
      {
        "date": "Sep",
        "value": 43
      },
      {
        "date": "Oct",
        "value": 45
      },
      {
        "date": "Nov",
        "value": 47
      },
      {
        "date": "Dec",
        "value": 48
      },
      {
        "date": "Jan",
        "value": 48
      },
      {
        "date": "Feb",
        "value": 48
      },
      {
        "date": "Mar",
        "value": 48
      }
    ]
  },
  {
    "id": "1717",
    "name": "IL-17",
    "state": "Illinois",
    "raceType": "house",
    "probability": 0.84,
    "margin": 14.5,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 79
      },
      {
        "date": "Oct",
        "value": 81
      },
      {
        "date": "Nov",
        "value": 83
      },
      {
        "date": "Dec",
        "value": 84
      },
      {
        "date": "Jan",
        "value": 84
      },
      {
        "date": "Feb",
        "value": 84
      },
      {
        "date": "Mar",
        "value": 84
      }
    ]
  },
  {
    "id": "1801",
    "name": "IN-1",
    "state": "Indiana",
    "raceType": "house",
    "probability": 0.54,
    "margin": 1.7,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 49
      },
      {
        "date": "Oct",
        "value": 51
      },
      {
        "date": "Nov",
        "value": 53
      },
      {
        "date": "Dec",
        "value": 54
      },
      {
        "date": "Jan",
        "value": 54
      },
      {
        "date": "Feb",
        "value": 54
      },
      {
        "date": "Mar",
        "value": 54
      }
    ]
  },
  {
    "id": "1802",
    "name": "IN-2",
    "state": "Indiana",
    "raceType": "house",
    "probability": 0.1,
    "margin": -16.9,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 5
      },
      {
        "date": "Oct",
        "value": 7
      },
      {
        "date": "Nov",
        "value": 9
      },
      {
        "date": "Dec",
        "value": 10
      },
      {
        "date": "Jan",
        "value": 10
      },
      {
        "date": "Feb",
        "value": 10
      },
      {
        "date": "Mar",
        "value": 10
      }
    ]
  },
  {
    "id": "1803",
    "name": "IN-3",
    "state": "Indiana",
    "raceType": "house",
    "probability": 0.29,
    "margin": -8.9,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 24
      },
      {
        "date": "Oct",
        "value": 26
      },
      {
        "date": "Nov",
        "value": 28
      },
      {
        "date": "Dec",
        "value": 29
      },
      {
        "date": "Jan",
        "value": 29
      },
      {
        "date": "Feb",
        "value": 29
      },
      {
        "date": "Mar",
        "value": 29
      }
    ]
  },
  {
    "id": "1804",
    "name": "IN-4",
    "state": "Indiana",
    "raceType": "house",
    "probability": 0.45,
    "margin": -2.1,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 40
      },
      {
        "date": "Oct",
        "value": 42
      },
      {
        "date": "Nov",
        "value": 44
      },
      {
        "date": "Dec",
        "value": 45
      },
      {
        "date": "Jan",
        "value": 45
      },
      {
        "date": "Feb",
        "value": 45
      },
      {
        "date": "Mar",
        "value": 45
      }
    ]
  },
  {
    "id": "1805",
    "name": "IN-5",
    "state": "Indiana",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "1806",
    "name": "IN-6",
    "state": "Indiana",
    "raceType": "house",
    "probability": 0.49,
    "margin": -0.4,
    "rating": "Tilt R",
    "history": [
      {
        "date": "Sep",
        "value": 44
      },
      {
        "date": "Oct",
        "value": 46
      },
      {
        "date": "Nov",
        "value": 48
      },
      {
        "date": "Dec",
        "value": 49
      },
      {
        "date": "Jan",
        "value": 49
      },
      {
        "date": "Feb",
        "value": 49
      },
      {
        "date": "Mar",
        "value": 49
      }
    ]
  },
  {
    "id": "1807",
    "name": "IN-7",
    "state": "Indiana",
    "raceType": "house",
    "probability": 0.23,
    "margin": -11.5,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 18
      },
      {
        "date": "Oct",
        "value": 20
      },
      {
        "date": "Nov",
        "value": 22
      },
      {
        "date": "Dec",
        "value": 23
      },
      {
        "date": "Jan",
        "value": 23
      },
      {
        "date": "Feb",
        "value": 23
      },
      {
        "date": "Mar",
        "value": 23
      }
    ]
  },
  {
    "id": "1808",
    "name": "IN-8",
    "state": "Indiana",
    "raceType": "house",
    "probability": 0.15,
    "margin": -14.8,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 10
      },
      {
        "date": "Oct",
        "value": 12
      },
      {
        "date": "Nov",
        "value": 14
      },
      {
        "date": "Dec",
        "value": 15
      },
      {
        "date": "Jan",
        "value": 15
      },
      {
        "date": "Feb",
        "value": 15
      },
      {
        "date": "Mar",
        "value": 15
      }
    ]
  },
  {
    "id": "1809",
    "name": "IN-9",
    "state": "Indiana",
    "raceType": "house",
    "probability": 0.53,
    "margin": 1.2,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 48
      },
      {
        "date": "Oct",
        "value": 50
      },
      {
        "date": "Nov",
        "value": 52
      },
      {
        "date": "Dec",
        "value": 53
      },
      {
        "date": "Jan",
        "value": 53
      },
      {
        "date": "Feb",
        "value": 53
      },
      {
        "date": "Mar",
        "value": 53
      }
    ]
  },
  {
    "id": "1901",
    "name": "IA-1",
    "state": "Iowa",
    "raceType": "house",
    "probability": 0.6,
    "margin": 4.3,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 55
      },
      {
        "date": "Oct",
        "value": 57
      },
      {
        "date": "Nov",
        "value": 59
      },
      {
        "date": "Dec",
        "value": 60
      },
      {
        "date": "Jan",
        "value": 60
      },
      {
        "date": "Feb",
        "value": 60
      },
      {
        "date": "Mar",
        "value": 60
      }
    ]
  },
  {
    "id": "1902",
    "name": "IA-2",
    "state": "Iowa",
    "raceType": "house",
    "probability": 0.12,
    "margin": -15.9,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 7
      },
      {
        "date": "Oct",
        "value": 9
      },
      {
        "date": "Nov",
        "value": 11
      },
      {
        "date": "Dec",
        "value": 12
      },
      {
        "date": "Jan",
        "value": 12
      },
      {
        "date": "Feb",
        "value": 12
      },
      {
        "date": "Mar",
        "value": 12
      }
    ]
  },
  {
    "id": "1903",
    "name": "IA-3",
    "state": "Iowa",
    "raceType": "house",
    "probability": 0.44,
    "margin": -2.7,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 39
      },
      {
        "date": "Oct",
        "value": 41
      },
      {
        "date": "Nov",
        "value": 43
      },
      {
        "date": "Dec",
        "value": 44
      },
      {
        "date": "Jan",
        "value": 44
      },
      {
        "date": "Feb",
        "value": 44
      },
      {
        "date": "Mar",
        "value": 44
      }
    ]
  },
  {
    "id": "1904",
    "name": "IA-4",
    "state": "Iowa",
    "raceType": "house",
    "probability": 0.45,
    "margin": -2,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 40
      },
      {
        "date": "Oct",
        "value": 42
      },
      {
        "date": "Nov",
        "value": 44
      },
      {
        "date": "Dec",
        "value": 45
      },
      {
        "date": "Jan",
        "value": 45
      },
      {
        "date": "Feb",
        "value": 45
      },
      {
        "date": "Mar",
        "value": 45
      }
    ]
  },
  {
    "id": "2001",
    "name": "KS-1",
    "state": "Kansas",
    "raceType": "house",
    "probability": 0.47,
    "margin": -1.2,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 42
      },
      {
        "date": "Oct",
        "value": 44
      },
      {
        "date": "Nov",
        "value": 46
      },
      {
        "date": "Dec",
        "value": 47
      },
      {
        "date": "Jan",
        "value": 47
      },
      {
        "date": "Feb",
        "value": 47
      },
      {
        "date": "Mar",
        "value": 47
      }
    ]
  },
  {
    "id": "2002",
    "name": "KS-2",
    "state": "Kansas",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "2003",
    "name": "KS-3",
    "state": "Kansas",
    "raceType": "house",
    "probability": 0.4,
    "margin": -4,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 35
      },
      {
        "date": "Oct",
        "value": 37
      },
      {
        "date": "Nov",
        "value": 39
      },
      {
        "date": "Dec",
        "value": 40
      },
      {
        "date": "Jan",
        "value": 40
      },
      {
        "date": "Feb",
        "value": 40
      },
      {
        "date": "Mar",
        "value": 40
      }
    ]
  },
  {
    "id": "2004",
    "name": "KS-4",
    "state": "Kansas",
    "raceType": "house",
    "probability": 0.28,
    "margin": -9.3,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 23
      },
      {
        "date": "Oct",
        "value": 25
      },
      {
        "date": "Nov",
        "value": 27
      },
      {
        "date": "Dec",
        "value": 28
      },
      {
        "date": "Jan",
        "value": 28
      },
      {
        "date": "Feb",
        "value": 28
      },
      {
        "date": "Mar",
        "value": 28
      }
    ]
  },
  {
    "id": "2101",
    "name": "KY-1",
    "state": "Kentucky",
    "raceType": "house",
    "probability": 0.37,
    "margin": -5.4,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 32
      },
      {
        "date": "Oct",
        "value": 34
      },
      {
        "date": "Nov",
        "value": 36
      },
      {
        "date": "Dec",
        "value": 37
      },
      {
        "date": "Jan",
        "value": 37
      },
      {
        "date": "Feb",
        "value": 37
      },
      {
        "date": "Mar",
        "value": 37
      }
    ]
  },
  {
    "id": "2102",
    "name": "KY-2",
    "state": "Kentucky",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "2103",
    "name": "KY-3",
    "state": "Kentucky",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.8,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "2104",
    "name": "KY-4",
    "state": "Kentucky",
    "raceType": "house",
    "probability": 0.15,
    "margin": -14.7,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 10
      },
      {
        "date": "Oct",
        "value": 12
      },
      {
        "date": "Nov",
        "value": 14
      },
      {
        "date": "Dec",
        "value": 15
      },
      {
        "date": "Jan",
        "value": 15
      },
      {
        "date": "Feb",
        "value": 15
      },
      {
        "date": "Mar",
        "value": 15
      }
    ]
  },
  {
    "id": "2105",
    "name": "KY-5",
    "state": "Kentucky",
    "raceType": "house",
    "probability": 0.06,
    "margin": -18.3,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 3
      },
      {
        "date": "Nov",
        "value": 5
      },
      {
        "date": "Dec",
        "value": 6
      },
      {
        "date": "Jan",
        "value": 6
      },
      {
        "date": "Feb",
        "value": 6
      },
      {
        "date": "Mar",
        "value": 6
      }
    ]
  },
  {
    "id": "2106",
    "name": "KY-6",
    "state": "Kentucky",
    "raceType": "house",
    "probability": 0.45,
    "margin": -2.1,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 40
      },
      {
        "date": "Oct",
        "value": 42
      },
      {
        "date": "Nov",
        "value": 44
      },
      {
        "date": "Dec",
        "value": 45
      },
      {
        "date": "Jan",
        "value": 45
      },
      {
        "date": "Feb",
        "value": 45
      },
      {
        "date": "Mar",
        "value": 45
      }
    ]
  },
  {
    "id": "2201",
    "name": "LA-1",
    "state": "Louisiana",
    "raceType": "house",
    "probability": 0.33,
    "margin": -7.3,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 28
      },
      {
        "date": "Oct",
        "value": 30
      },
      {
        "date": "Nov",
        "value": 32
      },
      {
        "date": "Dec",
        "value": 33
      },
      {
        "date": "Jan",
        "value": 33
      },
      {
        "date": "Feb",
        "value": 33
      },
      {
        "date": "Mar",
        "value": 33
      }
    ]
  },
  {
    "id": "2202",
    "name": "LA-2",
    "state": "Louisiana",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "2203",
    "name": "LA-3",
    "state": "Louisiana",
    "raceType": "house",
    "probability": 0.47,
    "margin": -1.5,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 42
      },
      {
        "date": "Oct",
        "value": 44
      },
      {
        "date": "Nov",
        "value": 46
      },
      {
        "date": "Dec",
        "value": 47
      },
      {
        "date": "Jan",
        "value": 47
      },
      {
        "date": "Feb",
        "value": 47
      },
      {
        "date": "Mar",
        "value": 47
      }
    ]
  },
  {
    "id": "2204",
    "name": "LA-4",
    "state": "Louisiana",
    "raceType": "house",
    "probability": 0.1,
    "margin": -16.9,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 5
      },
      {
        "date": "Oct",
        "value": 7
      },
      {
        "date": "Nov",
        "value": 9
      },
      {
        "date": "Dec",
        "value": 10
      },
      {
        "date": "Jan",
        "value": 10
      },
      {
        "date": "Feb",
        "value": 10
      },
      {
        "date": "Mar",
        "value": 10
      }
    ]
  },
  {
    "id": "2205",
    "name": "LA-5",
    "state": "Louisiana",
    "raceType": "house",
    "probability": 0.16,
    "margin": -14.5,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 11
      },
      {
        "date": "Oct",
        "value": 13
      },
      {
        "date": "Nov",
        "value": 15
      },
      {
        "date": "Dec",
        "value": 16
      },
      {
        "date": "Jan",
        "value": 16
      },
      {
        "date": "Feb",
        "value": 16
      },
      {
        "date": "Mar",
        "value": 16
      }
    ]
  },
  {
    "id": "2206",
    "name": "LA-6",
    "state": "Louisiana",
    "raceType": "house",
    "probability": 0.44,
    "margin": -2.6,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 39
      },
      {
        "date": "Oct",
        "value": 41
      },
      {
        "date": "Nov",
        "value": 43
      },
      {
        "date": "Dec",
        "value": 44
      },
      {
        "date": "Jan",
        "value": 44
      },
      {
        "date": "Feb",
        "value": 44
      },
      {
        "date": "Mar",
        "value": 44
      }
    ]
  },
  {
    "id": "2301",
    "name": "ME-1",
    "state": "Maine",
    "raceType": "house",
    "probability": 0.61,
    "margin": 4.7,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 56
      },
      {
        "date": "Oct",
        "value": 58
      },
      {
        "date": "Nov",
        "value": 60
      },
      {
        "date": "Dec",
        "value": 61
      },
      {
        "date": "Jan",
        "value": 61
      },
      {
        "date": "Feb",
        "value": 61
      },
      {
        "date": "Mar",
        "value": 61
      }
    ]
  },
  {
    "id": "2302",
    "name": "ME-2",
    "state": "Maine",
    "raceType": "house",
    "probability": 0.38,
    "margin": -5,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 33
      },
      {
        "date": "Oct",
        "value": 35
      },
      {
        "date": "Nov",
        "value": 37
      },
      {
        "date": "Dec",
        "value": 38
      },
      {
        "date": "Jan",
        "value": 38
      },
      {
        "date": "Feb",
        "value": 38
      },
      {
        "date": "Mar",
        "value": 38
      }
    ]
  },
  {
    "id": "2401",
    "name": "MD-1",
    "state": "Maryland",
    "raceType": "house",
    "probability": 0.67,
    "margin": 7.3,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 62
      },
      {
        "date": "Oct",
        "value": 64
      },
      {
        "date": "Nov",
        "value": 66
      },
      {
        "date": "Dec",
        "value": 67
      },
      {
        "date": "Jan",
        "value": 67
      },
      {
        "date": "Feb",
        "value": 67
      },
      {
        "date": "Mar",
        "value": 67
      }
    ]
  },
  {
    "id": "2402",
    "name": "MD-2",
    "state": "Maryland",
    "raceType": "house",
    "probability": 0.58,
    "margin": 3.4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 53
      },
      {
        "date": "Oct",
        "value": 55
      },
      {
        "date": "Nov",
        "value": 57
      },
      {
        "date": "Dec",
        "value": 58
      },
      {
        "date": "Jan",
        "value": 58
      },
      {
        "date": "Feb",
        "value": 58
      },
      {
        "date": "Mar",
        "value": 58
      }
    ]
  },
  {
    "id": "2403",
    "name": "MD-3",
    "state": "Maryland",
    "raceType": "house",
    "probability": 0.97,
    "margin": 19.7,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 92
      },
      {
        "date": "Oct",
        "value": 94
      },
      {
        "date": "Nov",
        "value": 96
      },
      {
        "date": "Dec",
        "value": 97
      },
      {
        "date": "Jan",
        "value": 97
      },
      {
        "date": "Feb",
        "value": 97
      },
      {
        "date": "Mar",
        "value": 97
      }
    ]
  },
  {
    "id": "2404",
    "name": "MD-4",
    "state": "Maryland",
    "raceType": "house",
    "probability": 0.49,
    "margin": -0.5,
    "rating": "Tilt R",
    "history": [
      {
        "date": "Sep",
        "value": 44
      },
      {
        "date": "Oct",
        "value": 46
      },
      {
        "date": "Nov",
        "value": 48
      },
      {
        "date": "Dec",
        "value": 49
      },
      {
        "date": "Jan",
        "value": 49
      },
      {
        "date": "Feb",
        "value": 49
      },
      {
        "date": "Mar",
        "value": 49
      }
    ]
  },
  {
    "id": "2405",
    "name": "MD-5",
    "state": "Maryland",
    "raceType": "house",
    "probability": 0.81,
    "margin": 13,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 76
      },
      {
        "date": "Oct",
        "value": 78
      },
      {
        "date": "Nov",
        "value": 80
      },
      {
        "date": "Dec",
        "value": 81
      },
      {
        "date": "Jan",
        "value": 81
      },
      {
        "date": "Feb",
        "value": 81
      },
      {
        "date": "Mar",
        "value": 81
      }
    ]
  },
  {
    "id": "2406",
    "name": "MD-6",
    "state": "Maryland",
    "raceType": "house",
    "probability": 0.82,
    "margin": 13.4,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 77
      },
      {
        "date": "Oct",
        "value": 79
      },
      {
        "date": "Nov",
        "value": 81
      },
      {
        "date": "Dec",
        "value": 82
      },
      {
        "date": "Jan",
        "value": 82
      },
      {
        "date": "Feb",
        "value": 82
      },
      {
        "date": "Mar",
        "value": 82
      }
    ]
  },
  {
    "id": "2407",
    "name": "MD-7",
    "state": "Maryland",
    "raceType": "house",
    "probability": 0.48,
    "margin": -0.6,
    "rating": "Tilt R",
    "history": [
      {
        "date": "Sep",
        "value": 43
      },
      {
        "date": "Oct",
        "value": 45
      },
      {
        "date": "Nov",
        "value": 47
      },
      {
        "date": "Dec",
        "value": 48
      },
      {
        "date": "Jan",
        "value": 48
      },
      {
        "date": "Feb",
        "value": 48
      },
      {
        "date": "Mar",
        "value": 48
      }
    ]
  },
  {
    "id": "2408",
    "name": "MD-8",
    "state": "Maryland",
    "raceType": "house",
    "probability": 0.97,
    "margin": 19.7,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 92
      },
      {
        "date": "Oct",
        "value": 94
      },
      {
        "date": "Nov",
        "value": 96
      },
      {
        "date": "Dec",
        "value": 97
      },
      {
        "date": "Jan",
        "value": 97
      },
      {
        "date": "Feb",
        "value": 97
      },
      {
        "date": "Mar",
        "value": 97
      }
    ]
  },
  {
    "id": "2501",
    "name": "MA-1",
    "state": "Massachusetts",
    "raceType": "house",
    "probability": 0.7,
    "margin": 8.4,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 65
      },
      {
        "date": "Oct",
        "value": 67
      },
      {
        "date": "Nov",
        "value": 69
      },
      {
        "date": "Dec",
        "value": 70
      },
      {
        "date": "Jan",
        "value": 70
      },
      {
        "date": "Feb",
        "value": 70
      },
      {
        "date": "Mar",
        "value": 70
      }
    ]
  },
  {
    "id": "2502",
    "name": "MA-2",
    "state": "Massachusetts",
    "raceType": "house",
    "probability": 0.75,
    "margin": 10.6,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 70
      },
      {
        "date": "Oct",
        "value": 72
      },
      {
        "date": "Nov",
        "value": 74
      },
      {
        "date": "Dec",
        "value": 75
      },
      {
        "date": "Jan",
        "value": 75
      },
      {
        "date": "Feb",
        "value": 75
      },
      {
        "date": "Mar",
        "value": 75
      }
    ]
  },
  {
    "id": "2503",
    "name": "MA-3",
    "state": "Massachusetts",
    "raceType": "house",
    "probability": 0.97,
    "margin": 19.7,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 92
      },
      {
        "date": "Oct",
        "value": 94
      },
      {
        "date": "Nov",
        "value": 96
      },
      {
        "date": "Dec",
        "value": 97
      },
      {
        "date": "Jan",
        "value": 97
      },
      {
        "date": "Feb",
        "value": 97
      },
      {
        "date": "Mar",
        "value": 97
      }
    ]
  },
  {
    "id": "2504",
    "name": "MA-4",
    "state": "Massachusetts",
    "raceType": "house",
    "probability": 0.56,
    "margin": 2.7,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 51
      },
      {
        "date": "Oct",
        "value": 53
      },
      {
        "date": "Nov",
        "value": 55
      },
      {
        "date": "Dec",
        "value": 56
      },
      {
        "date": "Jan",
        "value": 56
      },
      {
        "date": "Feb",
        "value": 56
      },
      {
        "date": "Mar",
        "value": 56
      }
    ]
  },
  {
    "id": "2505",
    "name": "MA-5",
    "state": "Massachusetts",
    "raceType": "house",
    "probability": 0.97,
    "margin": 19.7,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 92
      },
      {
        "date": "Oct",
        "value": 94
      },
      {
        "date": "Nov",
        "value": 96
      },
      {
        "date": "Dec",
        "value": 97
      },
      {
        "date": "Jan",
        "value": 97
      },
      {
        "date": "Feb",
        "value": 97
      },
      {
        "date": "Mar",
        "value": 97
      }
    ]
  },
  {
    "id": "2506",
    "name": "MA-6",
    "state": "Massachusetts",
    "raceType": "house",
    "probability": 0.84,
    "margin": 14.4,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 79
      },
      {
        "date": "Oct",
        "value": 81
      },
      {
        "date": "Nov",
        "value": 83
      },
      {
        "date": "Dec",
        "value": 84
      },
      {
        "date": "Jan",
        "value": 84
      },
      {
        "date": "Feb",
        "value": 84
      },
      {
        "date": "Mar",
        "value": 84
      }
    ]
  },
  {
    "id": "2507",
    "name": "MA-7",
    "state": "Massachusetts",
    "raceType": "house",
    "probability": 0.63,
    "margin": 5.4,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 58
      },
      {
        "date": "Oct",
        "value": 60
      },
      {
        "date": "Nov",
        "value": 62
      },
      {
        "date": "Dec",
        "value": 63
      },
      {
        "date": "Jan",
        "value": 63
      },
      {
        "date": "Feb",
        "value": 63
      },
      {
        "date": "Mar",
        "value": 63
      }
    ]
  },
  {
    "id": "2508",
    "name": "MA-8",
    "state": "Massachusetts",
    "raceType": "house",
    "probability": 0.97,
    "margin": 19.7,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 92
      },
      {
        "date": "Oct",
        "value": 94
      },
      {
        "date": "Nov",
        "value": 96
      },
      {
        "date": "Dec",
        "value": 97
      },
      {
        "date": "Jan",
        "value": 97
      },
      {
        "date": "Feb",
        "value": 97
      },
      {
        "date": "Mar",
        "value": 97
      }
    ]
  },
  {
    "id": "2509",
    "name": "MA-9",
    "state": "Massachusetts",
    "raceType": "house",
    "probability": 0.63,
    "margin": 5.4,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 58
      },
      {
        "date": "Oct",
        "value": 60
      },
      {
        "date": "Nov",
        "value": 62
      },
      {
        "date": "Dec",
        "value": 63
      },
      {
        "date": "Jan",
        "value": 63
      },
      {
        "date": "Feb",
        "value": 63
      },
      {
        "date": "Mar",
        "value": 63
      }
    ]
  },
  {
    "id": "2601",
    "name": "MI-1",
    "state": "Michigan",
    "raceType": "house",
    "probability": 0.34,
    "margin": -6.8,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 29
      },
      {
        "date": "Oct",
        "value": 31
      },
      {
        "date": "Nov",
        "value": 33
      },
      {
        "date": "Dec",
        "value": 34
      },
      {
        "date": "Jan",
        "value": 34
      },
      {
        "date": "Feb",
        "value": 34
      },
      {
        "date": "Mar",
        "value": 34
      }
    ]
  },
  {
    "id": "2602",
    "name": "MI-2",
    "state": "Michigan",
    "raceType": "house",
    "probability": 0.53,
    "margin": 1.2,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 48
      },
      {
        "date": "Oct",
        "value": 50
      },
      {
        "date": "Nov",
        "value": 52
      },
      {
        "date": "Dec",
        "value": 53
      },
      {
        "date": "Jan",
        "value": 53
      },
      {
        "date": "Feb",
        "value": 53
      },
      {
        "date": "Mar",
        "value": 53
      }
    ]
  },
  {
    "id": "2603",
    "name": "MI-3",
    "state": "Michigan",
    "raceType": "house",
    "probability": 0.69,
    "margin": 7.9,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 64
      },
      {
        "date": "Oct",
        "value": 66
      },
      {
        "date": "Nov",
        "value": 68
      },
      {
        "date": "Dec",
        "value": 69
      },
      {
        "date": "Jan",
        "value": 69
      },
      {
        "date": "Feb",
        "value": 69
      },
      {
        "date": "Mar",
        "value": 69
      }
    ]
  },
  {
    "id": "2604",
    "name": "MI-4",
    "state": "Michigan",
    "raceType": "house",
    "probability": 0.26,
    "margin": -10,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 21
      },
      {
        "date": "Oct",
        "value": 23
      },
      {
        "date": "Nov",
        "value": 25
      },
      {
        "date": "Dec",
        "value": 26
      },
      {
        "date": "Jan",
        "value": 26
      },
      {
        "date": "Feb",
        "value": 26
      },
      {
        "date": "Mar",
        "value": 26
      }
    ]
  },
  {
    "id": "2605",
    "name": "MI-5",
    "state": "Michigan",
    "raceType": "house",
    "probability": 0.73,
    "margin": 9.7,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 68
      },
      {
        "date": "Oct",
        "value": 70
      },
      {
        "date": "Nov",
        "value": 72
      },
      {
        "date": "Dec",
        "value": 73
      },
      {
        "date": "Jan",
        "value": 73
      },
      {
        "date": "Feb",
        "value": 73
      },
      {
        "date": "Mar",
        "value": 73
      }
    ]
  },
  {
    "id": "2606",
    "name": "MI-6",
    "state": "Michigan",
    "raceType": "house",
    "probability": 0.47,
    "margin": -1.4,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 42
      },
      {
        "date": "Oct",
        "value": 44
      },
      {
        "date": "Nov",
        "value": 46
      },
      {
        "date": "Dec",
        "value": 47
      },
      {
        "date": "Jan",
        "value": 47
      },
      {
        "date": "Feb",
        "value": 47
      },
      {
        "date": "Mar",
        "value": 47
      }
    ]
  },
  {
    "id": "2607",
    "name": "MI-7",
    "state": "Michigan",
    "raceType": "house",
    "probability": 0.39,
    "margin": -4.7,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 34
      },
      {
        "date": "Oct",
        "value": 36
      },
      {
        "date": "Nov",
        "value": 38
      },
      {
        "date": "Dec",
        "value": 39
      },
      {
        "date": "Jan",
        "value": 39
      },
      {
        "date": "Feb",
        "value": 39
      },
      {
        "date": "Mar",
        "value": 39
      }
    ]
  },
  {
    "id": "2608",
    "name": "MI-8",
    "state": "Michigan",
    "raceType": "house",
    "probability": 0.77,
    "margin": 11.3,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 72
      },
      {
        "date": "Oct",
        "value": 74
      },
      {
        "date": "Nov",
        "value": 76
      },
      {
        "date": "Dec",
        "value": 77
      },
      {
        "date": "Jan",
        "value": 77
      },
      {
        "date": "Feb",
        "value": 77
      },
      {
        "date": "Mar",
        "value": 77
      }
    ]
  },
  {
    "id": "2609",
    "name": "MI-9",
    "state": "Michigan",
    "raceType": "house",
    "probability": 0.29,
    "margin": -9,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 24
      },
      {
        "date": "Oct",
        "value": 26
      },
      {
        "date": "Nov",
        "value": 28
      },
      {
        "date": "Dec",
        "value": 29
      },
      {
        "date": "Jan",
        "value": 29
      },
      {
        "date": "Feb",
        "value": 29
      },
      {
        "date": "Mar",
        "value": 29
      }
    ]
  },
  {
    "id": "2610",
    "name": "MI-10",
    "state": "Michigan",
    "raceType": "house",
    "probability": 0.62,
    "margin": 4.9,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 57
      },
      {
        "date": "Oct",
        "value": 59
      },
      {
        "date": "Nov",
        "value": 61
      },
      {
        "date": "Dec",
        "value": 62
      },
      {
        "date": "Jan",
        "value": 62
      },
      {
        "date": "Feb",
        "value": 62
      },
      {
        "date": "Mar",
        "value": 62
      }
    ]
  },
  {
    "id": "2611",
    "name": "MI-11",
    "state": "Michigan",
    "raceType": "house",
    "probability": 0.61,
    "margin": 4.7,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 56
      },
      {
        "date": "Oct",
        "value": 58
      },
      {
        "date": "Nov",
        "value": 60
      },
      {
        "date": "Dec",
        "value": 61
      },
      {
        "date": "Jan",
        "value": 61
      },
      {
        "date": "Feb",
        "value": 61
      },
      {
        "date": "Mar",
        "value": 61
      }
    ]
  },
  {
    "id": "2612",
    "name": "MI-12",
    "state": "Michigan",
    "raceType": "house",
    "probability": 0.29,
    "margin": -8.9,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 24
      },
      {
        "date": "Oct",
        "value": 26
      },
      {
        "date": "Nov",
        "value": 28
      },
      {
        "date": "Dec",
        "value": 29
      },
      {
        "date": "Jan",
        "value": 29
      },
      {
        "date": "Feb",
        "value": 29
      },
      {
        "date": "Mar",
        "value": 29
      }
    ]
  },
  {
    "id": "2613",
    "name": "MI-13",
    "state": "Michigan",
    "raceType": "house",
    "probability": 0.77,
    "margin": 11.4,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 72
      },
      {
        "date": "Oct",
        "value": 74
      },
      {
        "date": "Nov",
        "value": 76
      },
      {
        "date": "Dec",
        "value": 77
      },
      {
        "date": "Jan",
        "value": 77
      },
      {
        "date": "Feb",
        "value": 77
      },
      {
        "date": "Mar",
        "value": 77
      }
    ]
  },
  {
    "id": "2701",
    "name": "MN-1",
    "state": "Minnesota",
    "raceType": "house",
    "probability": 0.29,
    "margin": -8.8,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 24
      },
      {
        "date": "Oct",
        "value": 26
      },
      {
        "date": "Nov",
        "value": 28
      },
      {
        "date": "Dec",
        "value": 29
      },
      {
        "date": "Jan",
        "value": 29
      },
      {
        "date": "Feb",
        "value": 29
      },
      {
        "date": "Mar",
        "value": 29
      }
    ]
  },
  {
    "id": "2702",
    "name": "MN-2",
    "state": "Minnesota",
    "raceType": "house",
    "probability": 0.61,
    "margin": 4.4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 56
      },
      {
        "date": "Oct",
        "value": 58
      },
      {
        "date": "Nov",
        "value": 60
      },
      {
        "date": "Dec",
        "value": 61
      },
      {
        "date": "Jan",
        "value": 61
      },
      {
        "date": "Feb",
        "value": 61
      },
      {
        "date": "Mar",
        "value": 61
      }
    ]
  },
  {
    "id": "2703",
    "name": "MN-3",
    "state": "Minnesota",
    "raceType": "house",
    "probability": 0.62,
    "margin": 5.2,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 57
      },
      {
        "date": "Oct",
        "value": 59
      },
      {
        "date": "Nov",
        "value": 61
      },
      {
        "date": "Dec",
        "value": 62
      },
      {
        "date": "Jan",
        "value": 62
      },
      {
        "date": "Feb",
        "value": 62
      },
      {
        "date": "Mar",
        "value": 62
      }
    ]
  },
  {
    "id": "2704",
    "name": "MN-4",
    "state": "Minnesota",
    "raceType": "house",
    "probability": 0.28,
    "margin": -9.1,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 23
      },
      {
        "date": "Oct",
        "value": 25
      },
      {
        "date": "Nov",
        "value": 27
      },
      {
        "date": "Dec",
        "value": 28
      },
      {
        "date": "Jan",
        "value": 28
      },
      {
        "date": "Feb",
        "value": 28
      },
      {
        "date": "Mar",
        "value": 28
      }
    ]
  },
  {
    "id": "2705",
    "name": "MN-5",
    "state": "Minnesota",
    "raceType": "house",
    "probability": 0.77,
    "margin": 11.2,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 72
      },
      {
        "date": "Oct",
        "value": 74
      },
      {
        "date": "Nov",
        "value": 76
      },
      {
        "date": "Dec",
        "value": 77
      },
      {
        "date": "Jan",
        "value": 77
      },
      {
        "date": "Feb",
        "value": 77
      },
      {
        "date": "Mar",
        "value": 77
      }
    ]
  },
  {
    "id": "2706",
    "name": "MN-6",
    "state": "Minnesota",
    "raceType": "house",
    "probability": 0.39,
    "margin": -4.5,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 34
      },
      {
        "date": "Oct",
        "value": 36
      },
      {
        "date": "Nov",
        "value": 38
      },
      {
        "date": "Dec",
        "value": 39
      },
      {
        "date": "Jan",
        "value": 39
      },
      {
        "date": "Feb",
        "value": 39
      },
      {
        "date": "Mar",
        "value": 39
      }
    ]
  },
  {
    "id": "2707",
    "name": "MN-7",
    "state": "Minnesota",
    "raceType": "house",
    "probability": 0.46,
    "margin": -1.7,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 41
      },
      {
        "date": "Oct",
        "value": 43
      },
      {
        "date": "Nov",
        "value": 45
      },
      {
        "date": "Dec",
        "value": 46
      },
      {
        "date": "Jan",
        "value": 46
      },
      {
        "date": "Feb",
        "value": 46
      },
      {
        "date": "Mar",
        "value": 46
      }
    ]
  },
  {
    "id": "2708",
    "name": "MN-8",
    "state": "Minnesota",
    "raceType": "house",
    "probability": 0.74,
    "margin": 9.9,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 69
      },
      {
        "date": "Oct",
        "value": 71
      },
      {
        "date": "Nov",
        "value": 73
      },
      {
        "date": "Dec",
        "value": 74
      },
      {
        "date": "Jan",
        "value": 74
      },
      {
        "date": "Feb",
        "value": 74
      },
      {
        "date": "Mar",
        "value": 74
      }
    ]
  },
  {
    "id": "2801",
    "name": "MS-1",
    "state": "Mississippi",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "2802",
    "name": "MS-2",
    "state": "Mississippi",
    "raceType": "house",
    "probability": 0.43,
    "margin": -2.8,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 38
      },
      {
        "date": "Oct",
        "value": 40
      },
      {
        "date": "Nov",
        "value": 42
      },
      {
        "date": "Dec",
        "value": 43
      },
      {
        "date": "Jan",
        "value": 43
      },
      {
        "date": "Feb",
        "value": 43
      },
      {
        "date": "Mar",
        "value": 43
      }
    ]
  },
  {
    "id": "2803",
    "name": "MS-3",
    "state": "Mississippi",
    "raceType": "house",
    "probability": 0.31,
    "margin": -8.1,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 26
      },
      {
        "date": "Oct",
        "value": 28
      },
      {
        "date": "Nov",
        "value": 30
      },
      {
        "date": "Dec",
        "value": 31
      },
      {
        "date": "Jan",
        "value": 31
      },
      {
        "date": "Feb",
        "value": 31
      },
      {
        "date": "Mar",
        "value": 31
      }
    ]
  },
  {
    "id": "2804",
    "name": "MS-4",
    "state": "Mississippi",
    "raceType": "house",
    "probability": 0.08,
    "margin": -17.4,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 3
      },
      {
        "date": "Oct",
        "value": 5
      },
      {
        "date": "Nov",
        "value": 7
      },
      {
        "date": "Dec",
        "value": 8
      },
      {
        "date": "Jan",
        "value": 8
      },
      {
        "date": "Feb",
        "value": 8
      },
      {
        "date": "Mar",
        "value": 8
      }
    ]
  },
  {
    "id": "2901",
    "name": "MO-1",
    "state": "Missouri",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "2902",
    "name": "MO-2",
    "state": "Missouri",
    "raceType": "house",
    "probability": 0.49,
    "margin": -0.5,
    "rating": "Tilt R",
    "history": [
      {
        "date": "Sep",
        "value": 44
      },
      {
        "date": "Oct",
        "value": 46
      },
      {
        "date": "Nov",
        "value": 48
      },
      {
        "date": "Dec",
        "value": 49
      },
      {
        "date": "Jan",
        "value": 49
      },
      {
        "date": "Feb",
        "value": 49
      },
      {
        "date": "Mar",
        "value": 49
      }
    ]
  },
  {
    "id": "2903",
    "name": "MO-3",
    "state": "Missouri",
    "raceType": "house",
    "probability": 0.23,
    "margin": -11.3,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 18
      },
      {
        "date": "Oct",
        "value": 20
      },
      {
        "date": "Nov",
        "value": 22
      },
      {
        "date": "Dec",
        "value": 23
      },
      {
        "date": "Jan",
        "value": 23
      },
      {
        "date": "Feb",
        "value": 23
      },
      {
        "date": "Mar",
        "value": 23
      }
    ]
  },
  {
    "id": "2904",
    "name": "MO-4",
    "state": "Missouri",
    "raceType": "house",
    "probability": 0.14,
    "margin": -14.9,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 9
      },
      {
        "date": "Oct",
        "value": 11
      },
      {
        "date": "Nov",
        "value": 13
      },
      {
        "date": "Dec",
        "value": 14
      },
      {
        "date": "Jan",
        "value": 14
      },
      {
        "date": "Feb",
        "value": 14
      },
      {
        "date": "Mar",
        "value": 14
      }
    ]
  },
  {
    "id": "2905",
    "name": "MO-5",
    "state": "Missouri",
    "raceType": "house",
    "probability": 0.53,
    "margin": 1.3,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 48
      },
      {
        "date": "Oct",
        "value": 50
      },
      {
        "date": "Nov",
        "value": 52
      },
      {
        "date": "Dec",
        "value": 53
      },
      {
        "date": "Jan",
        "value": 53
      },
      {
        "date": "Feb",
        "value": 53
      },
      {
        "date": "Mar",
        "value": 53
      }
    ]
  },
  {
    "id": "2906",
    "name": "MO-6",
    "state": "Missouri",
    "raceType": "house",
    "probability": 0.05,
    "margin": -19,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 2
      },
      {
        "date": "Nov",
        "value": 4
      },
      {
        "date": "Dec",
        "value": 5
      },
      {
        "date": "Jan",
        "value": 5
      },
      {
        "date": "Feb",
        "value": 5
      },
      {
        "date": "Mar",
        "value": 5
      }
    ]
  },
  {
    "id": "2907",
    "name": "MO-7",
    "state": "Missouri",
    "raceType": "house",
    "probability": 0.37,
    "margin": -5.3,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 32
      },
      {
        "date": "Oct",
        "value": 34
      },
      {
        "date": "Nov",
        "value": 36
      },
      {
        "date": "Dec",
        "value": 37
      },
      {
        "date": "Jan",
        "value": 37
      },
      {
        "date": "Feb",
        "value": 37
      },
      {
        "date": "Mar",
        "value": 37
      }
    ]
  },
  {
    "id": "2908",
    "name": "MO-8",
    "state": "Missouri",
    "raceType": "house",
    "probability": 0.38,
    "margin": -5.2,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 33
      },
      {
        "date": "Oct",
        "value": 35
      },
      {
        "date": "Nov",
        "value": 37
      },
      {
        "date": "Dec",
        "value": 38
      },
      {
        "date": "Jan",
        "value": 38
      },
      {
        "date": "Feb",
        "value": 38
      },
      {
        "date": "Mar",
        "value": 38
      }
    ]
  },
  {
    "id": "3001",
    "name": "MT-1",
    "state": "Montana",
    "raceType": "house",
    "probability": 0.06,
    "margin": -18.4,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 3
      },
      {
        "date": "Nov",
        "value": 5
      },
      {
        "date": "Dec",
        "value": 6
      },
      {
        "date": "Jan",
        "value": 6
      },
      {
        "date": "Feb",
        "value": 6
      },
      {
        "date": "Mar",
        "value": 6
      }
    ]
  },
  {
    "id": "3002",
    "name": "MT-2",
    "state": "Montana",
    "raceType": "house",
    "probability": 0.55,
    "margin": 1.9,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 50
      },
      {
        "date": "Oct",
        "value": 52
      },
      {
        "date": "Nov",
        "value": 54
      },
      {
        "date": "Dec",
        "value": 55
      },
      {
        "date": "Jan",
        "value": 55
      },
      {
        "date": "Feb",
        "value": 55
      },
      {
        "date": "Mar",
        "value": 55
      }
    ]
  },
  {
    "id": "3101",
    "name": "NE-1",
    "state": "Nebraska",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "3102",
    "name": "NE-2",
    "state": "Nebraska",
    "raceType": "house",
    "probability": 0.48,
    "margin": -0.8,
    "rating": "Tilt R",
    "history": [
      {
        "date": "Sep",
        "value": 43
      },
      {
        "date": "Oct",
        "value": 45
      },
      {
        "date": "Nov",
        "value": 47
      },
      {
        "date": "Dec",
        "value": 48
      },
      {
        "date": "Jan",
        "value": 48
      },
      {
        "date": "Feb",
        "value": 48
      },
      {
        "date": "Mar",
        "value": 48
      }
    ]
  },
  {
    "id": "3103",
    "name": "NE-3",
    "state": "Nebraska",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.5,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "3201",
    "name": "NV-1",
    "state": "Nevada",
    "raceType": "house",
    "probability": 0.4,
    "margin": -4.2,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 35
      },
      {
        "date": "Oct",
        "value": 37
      },
      {
        "date": "Nov",
        "value": 39
      },
      {
        "date": "Dec",
        "value": 40
      },
      {
        "date": "Jan",
        "value": 40
      },
      {
        "date": "Feb",
        "value": 40
      },
      {
        "date": "Mar",
        "value": 40
      }
    ]
  },
  {
    "id": "3202",
    "name": "NV-2",
    "state": "Nevada",
    "raceType": "house",
    "probability": 0.79,
    "margin": 12.2,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 74
      },
      {
        "date": "Oct",
        "value": 76
      },
      {
        "date": "Nov",
        "value": 78
      },
      {
        "date": "Dec",
        "value": 79
      },
      {
        "date": "Jan",
        "value": 79
      },
      {
        "date": "Feb",
        "value": 79
      },
      {
        "date": "Mar",
        "value": 79
      }
    ]
  },
  {
    "id": "3203",
    "name": "NV-3",
    "state": "Nevada",
    "raceType": "house",
    "probability": 0.31,
    "margin": -8,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 26
      },
      {
        "date": "Oct",
        "value": 28
      },
      {
        "date": "Nov",
        "value": 30
      },
      {
        "date": "Dec",
        "value": 31
      },
      {
        "date": "Jan",
        "value": 31
      },
      {
        "date": "Feb",
        "value": 31
      },
      {
        "date": "Mar",
        "value": 31
      }
    ]
  },
  {
    "id": "3204",
    "name": "NV-4",
    "state": "Nevada",
    "raceType": "house",
    "probability": 0.63,
    "margin": 5.4,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 58
      },
      {
        "date": "Oct",
        "value": 60
      },
      {
        "date": "Nov",
        "value": 62
      },
      {
        "date": "Dec",
        "value": 63
      },
      {
        "date": "Jan",
        "value": 63
      },
      {
        "date": "Feb",
        "value": 63
      },
      {
        "date": "Mar",
        "value": 63
      }
    ]
  },
  {
    "id": "3301",
    "name": "NH-1",
    "state": "New Hampshire",
    "raceType": "house",
    "probability": 0.5,
    "margin": 0.1,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "3302",
    "name": "NH-2",
    "state": "New Hampshire",
    "raceType": "house",
    "probability": 0.79,
    "margin": 12.2,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 74
      },
      {
        "date": "Oct",
        "value": 76
      },
      {
        "date": "Nov",
        "value": 78
      },
      {
        "date": "Dec",
        "value": 79
      },
      {
        "date": "Jan",
        "value": 79
      },
      {
        "date": "Feb",
        "value": 79
      },
      {
        "date": "Mar",
        "value": 79
      }
    ]
  },
  {
    "id": "3401",
    "name": "NJ-1",
    "state": "New Jersey",
    "raceType": "house",
    "probability": 0.61,
    "margin": 4.6,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 56
      },
      {
        "date": "Oct",
        "value": 58
      },
      {
        "date": "Nov",
        "value": 60
      },
      {
        "date": "Dec",
        "value": 61
      },
      {
        "date": "Jan",
        "value": 61
      },
      {
        "date": "Feb",
        "value": 61
      },
      {
        "date": "Mar",
        "value": 61
      }
    ]
  },
  {
    "id": "3402",
    "name": "NJ-2",
    "state": "New Jersey",
    "raceType": "house",
    "probability": 0.77,
    "margin": 11.3,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 72
      },
      {
        "date": "Oct",
        "value": 74
      },
      {
        "date": "Nov",
        "value": 76
      },
      {
        "date": "Dec",
        "value": 77
      },
      {
        "date": "Jan",
        "value": 77
      },
      {
        "date": "Feb",
        "value": 77
      },
      {
        "date": "Mar",
        "value": 77
      }
    ]
  },
  {
    "id": "3403",
    "name": "NJ-3",
    "state": "New Jersey",
    "raceType": "house",
    "probability": 0.34,
    "margin": -6.6,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 29
      },
      {
        "date": "Oct",
        "value": 31
      },
      {
        "date": "Nov",
        "value": 33
      },
      {
        "date": "Dec",
        "value": 34
      },
      {
        "date": "Jan",
        "value": 34
      },
      {
        "date": "Feb",
        "value": 34
      },
      {
        "date": "Mar",
        "value": 34
      }
    ]
  },
  {
    "id": "3404",
    "name": "NJ-4",
    "state": "New Jersey",
    "raceType": "house",
    "probability": 0.81,
    "margin": 13.1,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 76
      },
      {
        "date": "Oct",
        "value": 78
      },
      {
        "date": "Nov",
        "value": 80
      },
      {
        "date": "Dec",
        "value": 81
      },
      {
        "date": "Jan",
        "value": 81
      },
      {
        "date": "Feb",
        "value": 81
      },
      {
        "date": "Mar",
        "value": 81
      }
    ]
  },
  {
    "id": "3405",
    "name": "NJ-5",
    "state": "New Jersey",
    "raceType": "house",
    "probability": 0.55,
    "margin": 1.9,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 50
      },
      {
        "date": "Oct",
        "value": 52
      },
      {
        "date": "Nov",
        "value": 54
      },
      {
        "date": "Dec",
        "value": 55
      },
      {
        "date": "Jan",
        "value": 55
      },
      {
        "date": "Feb",
        "value": 55
      },
      {
        "date": "Mar",
        "value": 55
      }
    ]
  },
  {
    "id": "3406",
    "name": "NJ-6",
    "state": "New Jersey",
    "raceType": "house",
    "probability": 0.47,
    "margin": -1.3,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 42
      },
      {
        "date": "Oct",
        "value": 44
      },
      {
        "date": "Nov",
        "value": 46
      },
      {
        "date": "Dec",
        "value": 47
      },
      {
        "date": "Jan",
        "value": 47
      },
      {
        "date": "Feb",
        "value": 47
      },
      {
        "date": "Mar",
        "value": 47
      }
    ]
  },
  {
    "id": "3407",
    "name": "NJ-7",
    "state": "New Jersey",
    "raceType": "house",
    "probability": 0.85,
    "margin": 14.6,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 80
      },
      {
        "date": "Oct",
        "value": 82
      },
      {
        "date": "Nov",
        "value": 84
      },
      {
        "date": "Dec",
        "value": 85
      },
      {
        "date": "Jan",
        "value": 85
      },
      {
        "date": "Feb",
        "value": 85
      },
      {
        "date": "Mar",
        "value": 85
      }
    ]
  },
  {
    "id": "3408",
    "name": "NJ-8",
    "state": "New Jersey",
    "raceType": "house",
    "probability": 0.37,
    "margin": -5.7,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 32
      },
      {
        "date": "Oct",
        "value": 34
      },
      {
        "date": "Nov",
        "value": 36
      },
      {
        "date": "Dec",
        "value": 37
      },
      {
        "date": "Jan",
        "value": 37
      },
      {
        "date": "Feb",
        "value": 37
      },
      {
        "date": "Mar",
        "value": 37
      }
    ]
  },
  {
    "id": "3409",
    "name": "NJ-9",
    "state": "New Jersey",
    "raceType": "house",
    "probability": 0.7,
    "margin": 8.3,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 65
      },
      {
        "date": "Oct",
        "value": 67
      },
      {
        "date": "Nov",
        "value": 69
      },
      {
        "date": "Dec",
        "value": 70
      },
      {
        "date": "Jan",
        "value": 70
      },
      {
        "date": "Feb",
        "value": 70
      },
      {
        "date": "Mar",
        "value": 70
      }
    ]
  },
  {
    "id": "3410",
    "name": "NJ-10",
    "state": "New Jersey",
    "raceType": "house",
    "probability": 0.69,
    "margin": 8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 64
      },
      {
        "date": "Oct",
        "value": 66
      },
      {
        "date": "Nov",
        "value": 68
      },
      {
        "date": "Dec",
        "value": 69
      },
      {
        "date": "Jan",
        "value": 69
      },
      {
        "date": "Feb",
        "value": 69
      },
      {
        "date": "Mar",
        "value": 69
      }
    ]
  },
  {
    "id": "3411",
    "name": "NJ-11",
    "state": "New Jersey",
    "raceType": "house",
    "probability": 0.37,
    "margin": -5.5,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 32
      },
      {
        "date": "Oct",
        "value": 34
      },
      {
        "date": "Nov",
        "value": 36
      },
      {
        "date": "Dec",
        "value": 37
      },
      {
        "date": "Jan",
        "value": 37
      },
      {
        "date": "Feb",
        "value": 37
      },
      {
        "date": "Mar",
        "value": 37
      }
    ]
  },
  {
    "id": "3412",
    "name": "NJ-12",
    "state": "New Jersey",
    "raceType": "house",
    "probability": 0.85,
    "margin": 14.7,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 80
      },
      {
        "date": "Oct",
        "value": 82
      },
      {
        "date": "Nov",
        "value": 84
      },
      {
        "date": "Dec",
        "value": 85
      },
      {
        "date": "Jan",
        "value": 85
      },
      {
        "date": "Feb",
        "value": 85
      },
      {
        "date": "Mar",
        "value": 85
      }
    ]
  },
  {
    "id": "3501",
    "name": "NM-1",
    "state": "New Mexico",
    "raceType": "house",
    "probability": 0.75,
    "margin": 10.3,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 70
      },
      {
        "date": "Oct",
        "value": 72
      },
      {
        "date": "Nov",
        "value": 74
      },
      {
        "date": "Dec",
        "value": 75
      },
      {
        "date": "Jan",
        "value": 75
      },
      {
        "date": "Feb",
        "value": 75
      },
      {
        "date": "Mar",
        "value": 75
      }
    ]
  },
  {
    "id": "3502",
    "name": "NM-2",
    "state": "New Mexico",
    "raceType": "house",
    "probability": 0.76,
    "margin": 11.1,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 71
      },
      {
        "date": "Oct",
        "value": 73
      },
      {
        "date": "Nov",
        "value": 75
      },
      {
        "date": "Dec",
        "value": 76
      },
      {
        "date": "Jan",
        "value": 76
      },
      {
        "date": "Feb",
        "value": 76
      },
      {
        "date": "Mar",
        "value": 76
      }
    ]
  },
  {
    "id": "3503",
    "name": "NM-3",
    "state": "New Mexico",
    "raceType": "house",
    "probability": 0.42,
    "margin": -3.2,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 37
      },
      {
        "date": "Oct",
        "value": 39
      },
      {
        "date": "Nov",
        "value": 41
      },
      {
        "date": "Dec",
        "value": 42
      },
      {
        "date": "Jan",
        "value": 42
      },
      {
        "date": "Feb",
        "value": 42
      },
      {
        "date": "Mar",
        "value": 42
      }
    ]
  },
  {
    "id": "3601",
    "name": "NY-1",
    "state": "New York",
    "raceType": "house",
    "probability": 0.77,
    "margin": 11.5,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 72
      },
      {
        "date": "Oct",
        "value": 74
      },
      {
        "date": "Nov",
        "value": 76
      },
      {
        "date": "Dec",
        "value": 77
      },
      {
        "date": "Jan",
        "value": 77
      },
      {
        "date": "Feb",
        "value": 77
      },
      {
        "date": "Mar",
        "value": 77
      }
    ]
  },
  {
    "id": "3602",
    "name": "NY-2",
    "state": "New York",
    "raceType": "house",
    "probability": 0.65,
    "margin": 6.2,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 60
      },
      {
        "date": "Oct",
        "value": 62
      },
      {
        "date": "Nov",
        "value": 64
      },
      {
        "date": "Dec",
        "value": 65
      },
      {
        "date": "Jan",
        "value": 65
      },
      {
        "date": "Feb",
        "value": 65
      },
      {
        "date": "Mar",
        "value": 65
      }
    ]
  },
  {
    "id": "3603",
    "name": "NY-3",
    "state": "New York",
    "raceType": "house",
    "probability": 0.42,
    "margin": -3.2,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 37
      },
      {
        "date": "Oct",
        "value": 39
      },
      {
        "date": "Nov",
        "value": 41
      },
      {
        "date": "Dec",
        "value": 42
      },
      {
        "date": "Jan",
        "value": 42
      },
      {
        "date": "Feb",
        "value": 42
      },
      {
        "date": "Mar",
        "value": 42
      }
    ]
  },
  {
    "id": "3604",
    "name": "NY-4",
    "state": "New York",
    "raceType": "house",
    "probability": 0.88,
    "margin": 16,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 83
      },
      {
        "date": "Oct",
        "value": 85
      },
      {
        "date": "Nov",
        "value": 87
      },
      {
        "date": "Dec",
        "value": 88
      },
      {
        "date": "Jan",
        "value": 88
      },
      {
        "date": "Feb",
        "value": 88
      },
      {
        "date": "Mar",
        "value": 88
      }
    ]
  },
  {
    "id": "3605",
    "name": "NY-5",
    "state": "New York",
    "raceType": "house",
    "probability": 0.43,
    "margin": -2.9,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 38
      },
      {
        "date": "Oct",
        "value": 40
      },
      {
        "date": "Nov",
        "value": 42
      },
      {
        "date": "Dec",
        "value": 43
      },
      {
        "date": "Jan",
        "value": 43
      },
      {
        "date": "Feb",
        "value": 43
      },
      {
        "date": "Mar",
        "value": 43
      }
    ]
  },
  {
    "id": "3606",
    "name": "NY-6",
    "state": "New York",
    "raceType": "house",
    "probability": 0.64,
    "margin": 5.8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 59
      },
      {
        "date": "Oct",
        "value": 61
      },
      {
        "date": "Nov",
        "value": 63
      },
      {
        "date": "Dec",
        "value": 64
      },
      {
        "date": "Jan",
        "value": 64
      },
      {
        "date": "Feb",
        "value": 64
      },
      {
        "date": "Mar",
        "value": 64
      }
    ]
  },
  {
    "id": "3607",
    "name": "NY-7",
    "state": "New York",
    "raceType": "house",
    "probability": 0.78,
    "margin": 11.9,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 73
      },
      {
        "date": "Oct",
        "value": 75
      },
      {
        "date": "Nov",
        "value": 77
      },
      {
        "date": "Dec",
        "value": 78
      },
      {
        "date": "Jan",
        "value": 78
      },
      {
        "date": "Feb",
        "value": 78
      },
      {
        "date": "Mar",
        "value": 78
      }
    ]
  },
  {
    "id": "3608",
    "name": "NY-8",
    "state": "New York",
    "raceType": "house",
    "probability": 0.36,
    "margin": -5.7,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 31
      },
      {
        "date": "Oct",
        "value": 33
      },
      {
        "date": "Nov",
        "value": 35
      },
      {
        "date": "Dec",
        "value": 36
      },
      {
        "date": "Jan",
        "value": 36
      },
      {
        "date": "Feb",
        "value": 36
      },
      {
        "date": "Mar",
        "value": 36
      }
    ]
  },
  {
    "id": "3609",
    "name": "NY-9",
    "state": "New York",
    "raceType": "house",
    "probability": 0.84,
    "margin": 14.1,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 79
      },
      {
        "date": "Oct",
        "value": 81
      },
      {
        "date": "Nov",
        "value": 83
      },
      {
        "date": "Dec",
        "value": 84
      },
      {
        "date": "Jan",
        "value": 84
      },
      {
        "date": "Feb",
        "value": 84
      },
      {
        "date": "Mar",
        "value": 84
      }
    ]
  },
  {
    "id": "3610",
    "name": "NY-10",
    "state": "New York",
    "raceType": "house",
    "probability": 0.56,
    "margin": 2.4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 51
      },
      {
        "date": "Oct",
        "value": 53
      },
      {
        "date": "Nov",
        "value": 55
      },
      {
        "date": "Dec",
        "value": 56
      },
      {
        "date": "Jan",
        "value": 56
      },
      {
        "date": "Feb",
        "value": 56
      },
      {
        "date": "Mar",
        "value": 56
      }
    ]
  },
  {
    "id": "3611",
    "name": "NY-11",
    "state": "New York",
    "raceType": "house",
    "probability": 0.5,
    "margin": -0.2,
    "rating": "Tilt R",
    "history": [
      {
        "date": "Sep",
        "value": 45
      },
      {
        "date": "Oct",
        "value": 47
      },
      {
        "date": "Nov",
        "value": 49
      },
      {
        "date": "Dec",
        "value": 50
      },
      {
        "date": "Jan",
        "value": 50
      },
      {
        "date": "Feb",
        "value": 50
      },
      {
        "date": "Mar",
        "value": 50
      }
    ]
  },
  {
    "id": "3612",
    "name": "NY-12",
    "state": "New York",
    "raceType": "house",
    "probability": 0.87,
    "margin": 15.4,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 82
      },
      {
        "date": "Oct",
        "value": 84
      },
      {
        "date": "Nov",
        "value": 86
      },
      {
        "date": "Dec",
        "value": 87
      },
      {
        "date": "Jan",
        "value": 87
      },
      {
        "date": "Feb",
        "value": 87
      },
      {
        "date": "Mar",
        "value": 87
      }
    ]
  },
  {
    "id": "3613",
    "name": "NY-13",
    "state": "New York",
    "raceType": "house",
    "probability": 0.38,
    "margin": -5,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 33
      },
      {
        "date": "Oct",
        "value": 35
      },
      {
        "date": "Nov",
        "value": 37
      },
      {
        "date": "Dec",
        "value": 38
      },
      {
        "date": "Jan",
        "value": 38
      },
      {
        "date": "Feb",
        "value": 38
      },
      {
        "date": "Mar",
        "value": 38
      }
    ]
  },
  {
    "id": "3614",
    "name": "NY-14",
    "state": "New York",
    "raceType": "house",
    "probability": 0.73,
    "margin": 9.5,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 68
      },
      {
        "date": "Oct",
        "value": 70
      },
      {
        "date": "Nov",
        "value": 72
      },
      {
        "date": "Dec",
        "value": 73
      },
      {
        "date": "Jan",
        "value": 73
      },
      {
        "date": "Feb",
        "value": 73
      },
      {
        "date": "Mar",
        "value": 73
      }
    ]
  },
  {
    "id": "3615",
    "name": "NY-15",
    "state": "New York",
    "raceType": "house",
    "probability": 0.7,
    "margin": 8.5,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 65
      },
      {
        "date": "Oct",
        "value": 67
      },
      {
        "date": "Nov",
        "value": 69
      },
      {
        "date": "Dec",
        "value": 70
      },
      {
        "date": "Jan",
        "value": 70
      },
      {
        "date": "Feb",
        "value": 70
      },
      {
        "date": "Mar",
        "value": 70
      }
    ]
  },
  {
    "id": "3616",
    "name": "NY-16",
    "state": "New York",
    "raceType": "house",
    "probability": 0.39,
    "margin": -4.5,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 34
      },
      {
        "date": "Oct",
        "value": 36
      },
      {
        "date": "Nov",
        "value": 38
      },
      {
        "date": "Dec",
        "value": 39
      },
      {
        "date": "Jan",
        "value": 39
      },
      {
        "date": "Feb",
        "value": 39
      },
      {
        "date": "Mar",
        "value": 39
      }
    ]
  },
  {
    "id": "3617",
    "name": "NY-17",
    "state": "New York",
    "raceType": "house",
    "probability": 0.87,
    "margin": 15.7,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 82
      },
      {
        "date": "Oct",
        "value": 84
      },
      {
        "date": "Nov",
        "value": 86
      },
      {
        "date": "Dec",
        "value": 87
      },
      {
        "date": "Jan",
        "value": 87
      },
      {
        "date": "Feb",
        "value": 87
      },
      {
        "date": "Mar",
        "value": 87
      }
    ]
  },
  {
    "id": "3618",
    "name": "NY-18",
    "state": "New York",
    "raceType": "house",
    "probability": 0.47,
    "margin": -1.1,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 42
      },
      {
        "date": "Oct",
        "value": 44
      },
      {
        "date": "Nov",
        "value": 46
      },
      {
        "date": "Dec",
        "value": 47
      },
      {
        "date": "Jan",
        "value": 47
      },
      {
        "date": "Feb",
        "value": 47
      },
      {
        "date": "Mar",
        "value": 47
      }
    ]
  },
  {
    "id": "3619",
    "name": "NY-19",
    "state": "New York",
    "raceType": "house",
    "probability": 0.58,
    "margin": 3.4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 53
      },
      {
        "date": "Oct",
        "value": 55
      },
      {
        "date": "Nov",
        "value": 57
      },
      {
        "date": "Dec",
        "value": 58
      },
      {
        "date": "Jan",
        "value": 58
      },
      {
        "date": "Feb",
        "value": 58
      },
      {
        "date": "Mar",
        "value": 58
      }
    ]
  },
  {
    "id": "3620",
    "name": "NY-20",
    "state": "New York",
    "raceType": "house",
    "probability": 0.82,
    "margin": 13.5,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 77
      },
      {
        "date": "Oct",
        "value": 79
      },
      {
        "date": "Nov",
        "value": 81
      },
      {
        "date": "Dec",
        "value": 82
      },
      {
        "date": "Jan",
        "value": 82
      },
      {
        "date": "Feb",
        "value": 82
      },
      {
        "date": "Mar",
        "value": 82
      }
    ]
  },
  {
    "id": "3621",
    "name": "NY-21",
    "state": "New York",
    "raceType": "house",
    "probability": 0.36,
    "margin": -5.9,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 31
      },
      {
        "date": "Oct",
        "value": 33
      },
      {
        "date": "Nov",
        "value": 35
      },
      {
        "date": "Dec",
        "value": 36
      },
      {
        "date": "Jan",
        "value": 36
      },
      {
        "date": "Feb",
        "value": 36
      },
      {
        "date": "Mar",
        "value": 36
      }
    ]
  },
  {
    "id": "3622",
    "name": "NY-22",
    "state": "New York",
    "raceType": "house",
    "probability": 0.8,
    "margin": 12.6,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 75
      },
      {
        "date": "Oct",
        "value": 77
      },
      {
        "date": "Nov",
        "value": 79
      },
      {
        "date": "Dec",
        "value": 80
      },
      {
        "date": "Jan",
        "value": 80
      },
      {
        "date": "Feb",
        "value": 80
      },
      {
        "date": "Mar",
        "value": 80
      }
    ]
  },
  {
    "id": "3623",
    "name": "NY-23",
    "state": "New York",
    "raceType": "house",
    "probability": 0.61,
    "margin": 4.8,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 56
      },
      {
        "date": "Oct",
        "value": 58
      },
      {
        "date": "Nov",
        "value": 60
      },
      {
        "date": "Dec",
        "value": 61
      },
      {
        "date": "Jan",
        "value": 61
      },
      {
        "date": "Feb",
        "value": 61
      },
      {
        "date": "Mar",
        "value": 61
      }
    ]
  },
  {
    "id": "3624",
    "name": "NY-24",
    "state": "New York",
    "raceType": "house",
    "probability": 0.45,
    "margin": -2.1,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 40
      },
      {
        "date": "Oct",
        "value": 42
      },
      {
        "date": "Nov",
        "value": 44
      },
      {
        "date": "Dec",
        "value": 45
      },
      {
        "date": "Jan",
        "value": 45
      },
      {
        "date": "Feb",
        "value": 45
      },
      {
        "date": "Mar",
        "value": 45
      }
    ]
  },
  {
    "id": "3625",
    "name": "NY-25",
    "state": "New York",
    "raceType": "house",
    "probability": 0.88,
    "margin": 15.9,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 83
      },
      {
        "date": "Oct",
        "value": 85
      },
      {
        "date": "Nov",
        "value": 87
      },
      {
        "date": "Dec",
        "value": 88
      },
      {
        "date": "Jan",
        "value": 88
      },
      {
        "date": "Feb",
        "value": 88
      },
      {
        "date": "Mar",
        "value": 88
      }
    ]
  },
  {
    "id": "3626",
    "name": "NY-26",
    "state": "New York",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.8,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "3701",
    "name": "NC-1",
    "state": "North Carolina",
    "raceType": "house",
    "probability": 0.67,
    "margin": 7.1,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 62
      },
      {
        "date": "Oct",
        "value": 64
      },
      {
        "date": "Nov",
        "value": 66
      },
      {
        "date": "Dec",
        "value": 67
      },
      {
        "date": "Jan",
        "value": 67
      },
      {
        "date": "Feb",
        "value": 67
      },
      {
        "date": "Mar",
        "value": 67
      }
    ]
  },
  {
    "id": "3702",
    "name": "NC-2",
    "state": "North Carolina",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.8,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "3703",
    "name": "NC-3",
    "state": "North Carolina",
    "raceType": "house",
    "probability": 0.32,
    "margin": -7.4,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 27
      },
      {
        "date": "Oct",
        "value": 29
      },
      {
        "date": "Nov",
        "value": 31
      },
      {
        "date": "Dec",
        "value": 32
      },
      {
        "date": "Jan",
        "value": 32
      },
      {
        "date": "Feb",
        "value": 32
      },
      {
        "date": "Mar",
        "value": 32
      }
    ]
  },
  {
    "id": "3704",
    "name": "NC-4",
    "state": "North Carolina",
    "raceType": "house",
    "probability": 0.71,
    "margin": 8.8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 66
      },
      {
        "date": "Oct",
        "value": 68
      },
      {
        "date": "Nov",
        "value": 70
      },
      {
        "date": "Dec",
        "value": 71
      },
      {
        "date": "Jan",
        "value": 71
      },
      {
        "date": "Feb",
        "value": 71
      },
      {
        "date": "Mar",
        "value": 71
      }
    ]
  },
  {
    "id": "3705",
    "name": "NC-5",
    "state": "North Carolina",
    "raceType": "house",
    "probability": 0.23,
    "margin": -11.5,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 18
      },
      {
        "date": "Oct",
        "value": 20
      },
      {
        "date": "Nov",
        "value": 22
      },
      {
        "date": "Dec",
        "value": 23
      },
      {
        "date": "Jan",
        "value": 23
      },
      {
        "date": "Feb",
        "value": 23
      },
      {
        "date": "Mar",
        "value": 23
      }
    ]
  },
  {
    "id": "3706",
    "name": "NC-6",
    "state": "North Carolina",
    "raceType": "house",
    "probability": 0.55,
    "margin": 2.2,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 50
      },
      {
        "date": "Oct",
        "value": 52
      },
      {
        "date": "Nov",
        "value": 54
      },
      {
        "date": "Dec",
        "value": 55
      },
      {
        "date": "Jan",
        "value": 55
      },
      {
        "date": "Feb",
        "value": 55
      },
      {
        "date": "Mar",
        "value": 55
      }
    ]
  },
  {
    "id": "3707",
    "name": "NC-7",
    "state": "North Carolina",
    "raceType": "house",
    "probability": 0.56,
    "margin": 2.3,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 51
      },
      {
        "date": "Oct",
        "value": 53
      },
      {
        "date": "Nov",
        "value": 55
      },
      {
        "date": "Dec",
        "value": 56
      },
      {
        "date": "Jan",
        "value": 56
      },
      {
        "date": "Feb",
        "value": 56
      },
      {
        "date": "Mar",
        "value": 56
      }
    ]
  },
  {
    "id": "3708",
    "name": "NC-8",
    "state": "North Carolina",
    "raceType": "house",
    "probability": 0.23,
    "margin": -11.5,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 18
      },
      {
        "date": "Oct",
        "value": 20
      },
      {
        "date": "Nov",
        "value": 22
      },
      {
        "date": "Dec",
        "value": 23
      },
      {
        "date": "Jan",
        "value": 23
      },
      {
        "date": "Feb",
        "value": 23
      },
      {
        "date": "Mar",
        "value": 23
      }
    ]
  },
  {
    "id": "3709",
    "name": "NC-9",
    "state": "North Carolina",
    "raceType": "house",
    "probability": 0.71,
    "margin": 8.8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 66
      },
      {
        "date": "Oct",
        "value": 68
      },
      {
        "date": "Nov",
        "value": 70
      },
      {
        "date": "Dec",
        "value": 71
      },
      {
        "date": "Jan",
        "value": 71
      },
      {
        "date": "Feb",
        "value": 71
      },
      {
        "date": "Mar",
        "value": 71
      }
    ]
  },
  {
    "id": "3710",
    "name": "NC-10",
    "state": "North Carolina",
    "raceType": "house",
    "probability": 0.33,
    "margin": -7.3,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 28
      },
      {
        "date": "Oct",
        "value": 30
      },
      {
        "date": "Nov",
        "value": 32
      },
      {
        "date": "Dec",
        "value": 33
      },
      {
        "date": "Jan",
        "value": 33
      },
      {
        "date": "Feb",
        "value": 33
      },
      {
        "date": "Mar",
        "value": 33
      }
    ]
  },
  {
    "id": "3711",
    "name": "NC-11",
    "state": "North Carolina",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.8,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "3712",
    "name": "NC-12",
    "state": "North Carolina",
    "raceType": "house",
    "probability": 0.67,
    "margin": 7.1,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 62
      },
      {
        "date": "Oct",
        "value": 64
      },
      {
        "date": "Nov",
        "value": 66
      },
      {
        "date": "Dec",
        "value": 67
      },
      {
        "date": "Jan",
        "value": 67
      },
      {
        "date": "Feb",
        "value": 67
      },
      {
        "date": "Mar",
        "value": 67
      }
    ]
  },
  {
    "id": "3713",
    "name": "NC-13",
    "state": "North Carolina",
    "raceType": "house",
    "probability": 0.2,
    "margin": -12.5,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 15
      },
      {
        "date": "Oct",
        "value": 17
      },
      {
        "date": "Nov",
        "value": 19
      },
      {
        "date": "Dec",
        "value": 20
      },
      {
        "date": "Jan",
        "value": 20
      },
      {
        "date": "Feb",
        "value": 20
      },
      {
        "date": "Mar",
        "value": 20
      }
    ]
  },
  {
    "id": "3714",
    "name": "NC-14",
    "state": "North Carolina",
    "raceType": "house",
    "probability": 0.63,
    "margin": 5.5,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 58
      },
      {
        "date": "Oct",
        "value": 60
      },
      {
        "date": "Nov",
        "value": 62
      },
      {
        "date": "Dec",
        "value": 63
      },
      {
        "date": "Jan",
        "value": 63
      },
      {
        "date": "Feb",
        "value": 63
      },
      {
        "date": "Mar",
        "value": 63
      }
    ]
  },
  {
    "id": "3800",
    "name": "ND-AL",
    "state": "North Dakota",
    "raceType": "house",
    "probability": 0.43,
    "margin": -3.1,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 38
      },
      {
        "date": "Oct",
        "value": 40
      },
      {
        "date": "Nov",
        "value": 42
      },
      {
        "date": "Dec",
        "value": 43
      },
      {
        "date": "Jan",
        "value": 43
      },
      {
        "date": "Feb",
        "value": 43
      },
      {
        "date": "Mar",
        "value": 43
      }
    ]
  },
  {
    "id": "3901",
    "name": "OH-1",
    "state": "Ohio",
    "raceType": "house",
    "probability": 0.64,
    "margin": 5.9,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 59
      },
      {
        "date": "Oct",
        "value": 61
      },
      {
        "date": "Nov",
        "value": 63
      },
      {
        "date": "Dec",
        "value": 64
      },
      {
        "date": "Jan",
        "value": 64
      },
      {
        "date": "Feb",
        "value": 64
      },
      {
        "date": "Mar",
        "value": 64
      }
    ]
  },
  {
    "id": "3902",
    "name": "OH-2",
    "state": "Ohio",
    "raceType": "house",
    "probability": 0.19,
    "margin": -12.8,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 14
      },
      {
        "date": "Oct",
        "value": 16
      },
      {
        "date": "Nov",
        "value": 18
      },
      {
        "date": "Dec",
        "value": 19
      },
      {
        "date": "Jan",
        "value": 19
      },
      {
        "date": "Feb",
        "value": 19
      },
      {
        "date": "Mar",
        "value": 19
      }
    ]
  },
  {
    "id": "3903",
    "name": "OH-3",
    "state": "Ohio",
    "raceType": "house",
    "probability": 0.39,
    "margin": -4.5,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 34
      },
      {
        "date": "Oct",
        "value": 36
      },
      {
        "date": "Nov",
        "value": 38
      },
      {
        "date": "Dec",
        "value": 39
      },
      {
        "date": "Jan",
        "value": 39
      },
      {
        "date": "Feb",
        "value": 39
      },
      {
        "date": "Mar",
        "value": 39
      }
    ]
  },
  {
    "id": "3904",
    "name": "OH-4",
    "state": "Ohio",
    "raceType": "house",
    "probability": 0.55,
    "margin": 1.9,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 50
      },
      {
        "date": "Oct",
        "value": 52
      },
      {
        "date": "Nov",
        "value": 54
      },
      {
        "date": "Dec",
        "value": 55
      },
      {
        "date": "Jan",
        "value": 55
      },
      {
        "date": "Feb",
        "value": 55
      },
      {
        "date": "Mar",
        "value": 55
      }
    ]
  },
  {
    "id": "3905",
    "name": "OH-5",
    "state": "Ohio",
    "raceType": "house",
    "probability": 0.12,
    "margin": -15.9,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 7
      },
      {
        "date": "Oct",
        "value": 9
      },
      {
        "date": "Nov",
        "value": 11
      },
      {
        "date": "Dec",
        "value": 12
      },
      {
        "date": "Jan",
        "value": 12
      },
      {
        "date": "Feb",
        "value": 12
      },
      {
        "date": "Mar",
        "value": 12
      }
    ]
  },
  {
    "id": "3906",
    "name": "OH-6",
    "state": "Ohio",
    "raceType": "house",
    "probability": 0.59,
    "margin": 4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 54
      },
      {
        "date": "Oct",
        "value": 56
      },
      {
        "date": "Nov",
        "value": 58
      },
      {
        "date": "Dec",
        "value": 59
      },
      {
        "date": "Jan",
        "value": 59
      },
      {
        "date": "Feb",
        "value": 59
      },
      {
        "date": "Mar",
        "value": 59
      }
    ]
  },
  {
    "id": "3907",
    "name": "OH-7",
    "state": "Ohio",
    "raceType": "house",
    "probability": 0.32,
    "margin": -7.5,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 27
      },
      {
        "date": "Oct",
        "value": 29
      },
      {
        "date": "Nov",
        "value": 31
      },
      {
        "date": "Dec",
        "value": 32
      },
      {
        "date": "Jan",
        "value": 32
      },
      {
        "date": "Feb",
        "value": 32
      },
      {
        "date": "Mar",
        "value": 32
      }
    ]
  },
  {
    "id": "3908",
    "name": "OH-8",
    "state": "Ohio",
    "raceType": "house",
    "probability": 0.25,
    "margin": -10.4,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 20
      },
      {
        "date": "Oct",
        "value": 22
      },
      {
        "date": "Nov",
        "value": 24
      },
      {
        "date": "Dec",
        "value": 25
      },
      {
        "date": "Jan",
        "value": 25
      },
      {
        "date": "Feb",
        "value": 25
      },
      {
        "date": "Mar",
        "value": 25
      }
    ]
  },
  {
    "id": "3909",
    "name": "OH-9",
    "state": "Ohio",
    "raceType": "house",
    "probability": 0.63,
    "margin": 5.3,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 58
      },
      {
        "date": "Oct",
        "value": 60
      },
      {
        "date": "Nov",
        "value": 62
      },
      {
        "date": "Dec",
        "value": 63
      },
      {
        "date": "Jan",
        "value": 63
      },
      {
        "date": "Feb",
        "value": 63
      },
      {
        "date": "Mar",
        "value": 63
      }
    ]
  },
  {
    "id": "3910",
    "name": "OH-10",
    "state": "Ohio",
    "raceType": "house",
    "probability": 0.14,
    "margin": -15,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 9
      },
      {
        "date": "Oct",
        "value": 11
      },
      {
        "date": "Nov",
        "value": 13
      },
      {
        "date": "Dec",
        "value": 14
      },
      {
        "date": "Jan",
        "value": 14
      },
      {
        "date": "Feb",
        "value": 14
      },
      {
        "date": "Mar",
        "value": 14
      }
    ]
  },
  {
    "id": "3911",
    "name": "OH-11",
    "state": "Ohio",
    "raceType": "house",
    "probability": 0.48,
    "margin": -0.8,
    "rating": "Tilt R",
    "history": [
      {
        "date": "Sep",
        "value": 43
      },
      {
        "date": "Oct",
        "value": 45
      },
      {
        "date": "Nov",
        "value": 47
      },
      {
        "date": "Dec",
        "value": 48
      },
      {
        "date": "Jan",
        "value": 48
      },
      {
        "date": "Feb",
        "value": 48
      },
      {
        "date": "Mar",
        "value": 48
      }
    ]
  },
  {
    "id": "3912",
    "name": "OH-12",
    "state": "Ohio",
    "raceType": "house",
    "probability": 0.47,
    "margin": -1.4,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 42
      },
      {
        "date": "Oct",
        "value": 44
      },
      {
        "date": "Nov",
        "value": 46
      },
      {
        "date": "Dec",
        "value": 47
      },
      {
        "date": "Jan",
        "value": 47
      },
      {
        "date": "Feb",
        "value": 47
      },
      {
        "date": "Mar",
        "value": 47
      }
    ]
  },
  {
    "id": "3913",
    "name": "OH-13",
    "state": "Ohio",
    "raceType": "house",
    "probability": 0.15,
    "margin": -14.7,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 10
      },
      {
        "date": "Oct",
        "value": 12
      },
      {
        "date": "Nov",
        "value": 14
      },
      {
        "date": "Dec",
        "value": 15
      },
      {
        "date": "Jan",
        "value": 15
      },
      {
        "date": "Feb",
        "value": 15
      },
      {
        "date": "Mar",
        "value": 15
      }
    ]
  },
  {
    "id": "3914",
    "name": "OH-14",
    "state": "Ohio",
    "raceType": "house",
    "probability": 0.63,
    "margin": 5.5,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 58
      },
      {
        "date": "Oct",
        "value": 60
      },
      {
        "date": "Nov",
        "value": 62
      },
      {
        "date": "Dec",
        "value": 63
      },
      {
        "date": "Jan",
        "value": 63
      },
      {
        "date": "Feb",
        "value": 63
      },
      {
        "date": "Mar",
        "value": 63
      }
    ]
  },
  {
    "id": "3915",
    "name": "OH-15",
    "state": "Ohio",
    "raceType": "house",
    "probability": 0.24,
    "margin": -11,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 19
      },
      {
        "date": "Oct",
        "value": 21
      },
      {
        "date": "Nov",
        "value": 23
      },
      {
        "date": "Dec",
        "value": 24
      },
      {
        "date": "Jan",
        "value": 24
      },
      {
        "date": "Feb",
        "value": 24
      },
      {
        "date": "Mar",
        "value": 24
      }
    ]
  },
  {
    "id": "4001",
    "name": "OK-1",
    "state": "Oklahoma",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.7,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "4002",
    "name": "OK-2",
    "state": "Oklahoma",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "4003",
    "name": "OK-3",
    "state": "Oklahoma",
    "raceType": "house",
    "probability": 0.25,
    "margin": -10.5,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 20
      },
      {
        "date": "Oct",
        "value": 22
      },
      {
        "date": "Nov",
        "value": 24
      },
      {
        "date": "Dec",
        "value": 25
      },
      {
        "date": "Jan",
        "value": 25
      },
      {
        "date": "Feb",
        "value": 25
      },
      {
        "date": "Mar",
        "value": 25
      }
    ]
  },
  {
    "id": "4004",
    "name": "OK-4",
    "state": "Oklahoma",
    "raceType": "house",
    "probability": 0.26,
    "margin": -10.1,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 21
      },
      {
        "date": "Oct",
        "value": 23
      },
      {
        "date": "Nov",
        "value": 25
      },
      {
        "date": "Dec",
        "value": 26
      },
      {
        "date": "Jan",
        "value": 26
      },
      {
        "date": "Feb",
        "value": 26
      },
      {
        "date": "Mar",
        "value": 26
      }
    ]
  },
  {
    "id": "4005",
    "name": "OK-5",
    "state": "Oklahoma",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "4101",
    "name": "OR-1",
    "state": "Oregon",
    "raceType": "house",
    "probability": 0.84,
    "margin": 14.3,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 79
      },
      {
        "date": "Oct",
        "value": 81
      },
      {
        "date": "Nov",
        "value": 83
      },
      {
        "date": "Dec",
        "value": 84
      },
      {
        "date": "Jan",
        "value": 84
      },
      {
        "date": "Feb",
        "value": 84
      },
      {
        "date": "Mar",
        "value": 84
      }
    ]
  },
  {
    "id": "4102",
    "name": "OR-2",
    "state": "Oregon",
    "raceType": "house",
    "probability": 0.36,
    "margin": -5.7,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 31
      },
      {
        "date": "Oct",
        "value": 33
      },
      {
        "date": "Nov",
        "value": 35
      },
      {
        "date": "Dec",
        "value": 36
      },
      {
        "date": "Jan",
        "value": 36
      },
      {
        "date": "Feb",
        "value": 36
      },
      {
        "date": "Mar",
        "value": 36
      }
    ]
  },
  {
    "id": "4103",
    "name": "OR-3",
    "state": "Oregon",
    "raceType": "house",
    "probability": 0.78,
    "margin": 11.7,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 73
      },
      {
        "date": "Oct",
        "value": 75
      },
      {
        "date": "Nov",
        "value": 77
      },
      {
        "date": "Dec",
        "value": 78
      },
      {
        "date": "Jan",
        "value": 78
      },
      {
        "date": "Feb",
        "value": 78
      },
      {
        "date": "Mar",
        "value": 78
      }
    ]
  },
  {
    "id": "4104",
    "name": "OR-4",
    "state": "Oregon",
    "raceType": "house",
    "probability": 0.64,
    "margin": 6,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 59
      },
      {
        "date": "Oct",
        "value": 61
      },
      {
        "date": "Nov",
        "value": 63
      },
      {
        "date": "Dec",
        "value": 64
      },
      {
        "date": "Jan",
        "value": 64
      },
      {
        "date": "Feb",
        "value": 64
      },
      {
        "date": "Mar",
        "value": 64
      }
    ]
  },
  {
    "id": "4105",
    "name": "OR-5",
    "state": "Oregon",
    "raceType": "house",
    "probability": 0.43,
    "margin": -3,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 38
      },
      {
        "date": "Oct",
        "value": 40
      },
      {
        "date": "Nov",
        "value": 42
      },
      {
        "date": "Dec",
        "value": 43
      },
      {
        "date": "Jan",
        "value": 43
      },
      {
        "date": "Feb",
        "value": 43
      },
      {
        "date": "Mar",
        "value": 43
      }
    ]
  },
  {
    "id": "4106",
    "name": "OR-6",
    "state": "Oregon",
    "raceType": "house",
    "probability": 0.88,
    "margin": 16,
    "rating": "Safe D",
    "history": [
      {
        "date": "Sep",
        "value": 83
      },
      {
        "date": "Oct",
        "value": 85
      },
      {
        "date": "Nov",
        "value": 87
      },
      {
        "date": "Dec",
        "value": 88
      },
      {
        "date": "Jan",
        "value": 88
      },
      {
        "date": "Feb",
        "value": 88
      },
      {
        "date": "Mar",
        "value": 88
      }
    ]
  },
  {
    "id": "4201",
    "name": "PA-1",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.69,
    "margin": 7.9,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 64
      },
      {
        "date": "Oct",
        "value": 66
      },
      {
        "date": "Nov",
        "value": 68
      },
      {
        "date": "Dec",
        "value": 69
      },
      {
        "date": "Jan",
        "value": 69
      },
      {
        "date": "Feb",
        "value": 69
      },
      {
        "date": "Mar",
        "value": 69
      }
    ]
  },
  {
    "id": "4202",
    "name": "PA-2",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.26,
    "margin": -10,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 21
      },
      {
        "date": "Oct",
        "value": 23
      },
      {
        "date": "Nov",
        "value": 25
      },
      {
        "date": "Dec",
        "value": 26
      },
      {
        "date": "Jan",
        "value": 26
      },
      {
        "date": "Feb",
        "value": 26
      },
      {
        "date": "Mar",
        "value": 26
      }
    ]
  },
  {
    "id": "4203",
    "name": "PA-3",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.73,
    "margin": 9.7,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 68
      },
      {
        "date": "Oct",
        "value": 70
      },
      {
        "date": "Nov",
        "value": 72
      },
      {
        "date": "Dec",
        "value": 73
      },
      {
        "date": "Jan",
        "value": 73
      },
      {
        "date": "Feb",
        "value": 73
      },
      {
        "date": "Mar",
        "value": 73
      }
    ]
  },
  {
    "id": "4204",
    "name": "PA-4",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.47,
    "margin": -1.4,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 42
      },
      {
        "date": "Oct",
        "value": 44
      },
      {
        "date": "Nov",
        "value": 46
      },
      {
        "date": "Dec",
        "value": 47
      },
      {
        "date": "Jan",
        "value": 47
      },
      {
        "date": "Feb",
        "value": 47
      },
      {
        "date": "Mar",
        "value": 47
      }
    ]
  },
  {
    "id": "4205",
    "name": "PA-5",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.39,
    "margin": -4.7,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 34
      },
      {
        "date": "Oct",
        "value": 36
      },
      {
        "date": "Nov",
        "value": 38
      },
      {
        "date": "Dec",
        "value": 39
      },
      {
        "date": "Jan",
        "value": 39
      },
      {
        "date": "Feb",
        "value": 39
      },
      {
        "date": "Mar",
        "value": 39
      }
    ]
  },
  {
    "id": "4206",
    "name": "PA-6",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.77,
    "margin": 11.3,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 72
      },
      {
        "date": "Oct",
        "value": 74
      },
      {
        "date": "Nov",
        "value": 76
      },
      {
        "date": "Dec",
        "value": 77
      },
      {
        "date": "Jan",
        "value": 77
      },
      {
        "date": "Feb",
        "value": 77
      },
      {
        "date": "Mar",
        "value": 77
      }
    ]
  },
  {
    "id": "4207",
    "name": "PA-7",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.29,
    "margin": -9,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 24
      },
      {
        "date": "Oct",
        "value": 26
      },
      {
        "date": "Nov",
        "value": 28
      },
      {
        "date": "Dec",
        "value": 29
      },
      {
        "date": "Jan",
        "value": 29
      },
      {
        "date": "Feb",
        "value": 29
      },
      {
        "date": "Mar",
        "value": 29
      }
    ]
  },
  {
    "id": "4208",
    "name": "PA-8",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.62,
    "margin": 4.9,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 57
      },
      {
        "date": "Oct",
        "value": 59
      },
      {
        "date": "Nov",
        "value": 61
      },
      {
        "date": "Dec",
        "value": 62
      },
      {
        "date": "Jan",
        "value": 62
      },
      {
        "date": "Feb",
        "value": 62
      },
      {
        "date": "Mar",
        "value": 62
      }
    ]
  },
  {
    "id": "4209",
    "name": "PA-9",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.61,
    "margin": 4.7,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 56
      },
      {
        "date": "Oct",
        "value": 58
      },
      {
        "date": "Nov",
        "value": 60
      },
      {
        "date": "Dec",
        "value": 61
      },
      {
        "date": "Jan",
        "value": 61
      },
      {
        "date": "Feb",
        "value": 61
      },
      {
        "date": "Mar",
        "value": 61
      }
    ]
  },
  {
    "id": "4210",
    "name": "PA-10",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.29,
    "margin": -8.9,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 24
      },
      {
        "date": "Oct",
        "value": 26
      },
      {
        "date": "Nov",
        "value": 28
      },
      {
        "date": "Dec",
        "value": 29
      },
      {
        "date": "Jan",
        "value": 29
      },
      {
        "date": "Feb",
        "value": 29
      },
      {
        "date": "Mar",
        "value": 29
      }
    ]
  },
  {
    "id": "4211",
    "name": "PA-11",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.77,
    "margin": 11.4,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 72
      },
      {
        "date": "Oct",
        "value": 74
      },
      {
        "date": "Nov",
        "value": 76
      },
      {
        "date": "Dec",
        "value": 77
      },
      {
        "date": "Jan",
        "value": 77
      },
      {
        "date": "Feb",
        "value": 77
      },
      {
        "date": "Mar",
        "value": 77
      }
    ]
  },
  {
    "id": "4212",
    "name": "PA-12",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.38,
    "margin": -5,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 33
      },
      {
        "date": "Oct",
        "value": 35
      },
      {
        "date": "Nov",
        "value": 37
      },
      {
        "date": "Dec",
        "value": 38
      },
      {
        "date": "Jan",
        "value": 38
      },
      {
        "date": "Feb",
        "value": 38
      },
      {
        "date": "Mar",
        "value": 38
      }
    ]
  },
  {
    "id": "4213",
    "name": "PA-13",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.47,
    "margin": -1.1,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 42
      },
      {
        "date": "Oct",
        "value": 44
      },
      {
        "date": "Nov",
        "value": 46
      },
      {
        "date": "Dec",
        "value": 47
      },
      {
        "date": "Jan",
        "value": 47
      },
      {
        "date": "Feb",
        "value": 47
      },
      {
        "date": "Mar",
        "value": 47
      }
    ]
  },
  {
    "id": "4214",
    "name": "PA-14",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.73,
    "margin": 9.6,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 68
      },
      {
        "date": "Oct",
        "value": 70
      },
      {
        "date": "Nov",
        "value": 72
      },
      {
        "date": "Dec",
        "value": 73
      },
      {
        "date": "Jan",
        "value": 73
      },
      {
        "date": "Feb",
        "value": 73
      },
      {
        "date": "Mar",
        "value": 73
      }
    ]
  },
  {
    "id": "4215",
    "name": "PA-15",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.26,
    "margin": -10,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 21
      },
      {
        "date": "Oct",
        "value": 23
      },
      {
        "date": "Nov",
        "value": 25
      },
      {
        "date": "Dec",
        "value": 26
      },
      {
        "date": "Jan",
        "value": 26
      },
      {
        "date": "Feb",
        "value": 26
      },
      {
        "date": "Mar",
        "value": 26
      }
    ]
  },
  {
    "id": "4216",
    "name": "PA-16",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.69,
    "margin": 8.2,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 64
      },
      {
        "date": "Oct",
        "value": 66
      },
      {
        "date": "Nov",
        "value": 68
      },
      {
        "date": "Dec",
        "value": 69
      },
      {
        "date": "Jan",
        "value": 69
      },
      {
        "date": "Feb",
        "value": 69
      },
      {
        "date": "Mar",
        "value": 69
      }
    ]
  },
  {
    "id": "4217",
    "name": "PA-17",
    "state": "Pennsylvania",
    "raceType": "house",
    "probability": 0.52,
    "margin": 0.9,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 47
      },
      {
        "date": "Oct",
        "value": 49
      },
      {
        "date": "Nov",
        "value": 51
      },
      {
        "date": "Dec",
        "value": 52
      },
      {
        "date": "Jan",
        "value": 52
      },
      {
        "date": "Feb",
        "value": 52
      },
      {
        "date": "Mar",
        "value": 52
      }
    ]
  },
  {
    "id": "4401",
    "name": "RI-1",
    "state": "Rhode Island",
    "raceType": "house",
    "probability": 0.83,
    "margin": 13.8,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 78
      },
      {
        "date": "Oct",
        "value": 80
      },
      {
        "date": "Nov",
        "value": 82
      },
      {
        "date": "Dec",
        "value": 83
      },
      {
        "date": "Jan",
        "value": 83
      },
      {
        "date": "Feb",
        "value": 83
      },
      {
        "date": "Mar",
        "value": 83
      }
    ]
  },
  {
    "id": "4402",
    "name": "RI-2",
    "state": "Rhode Island",
    "raceType": "house",
    "probability": 0.6,
    "margin": 4.4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 55
      },
      {
        "date": "Oct",
        "value": 57
      },
      {
        "date": "Nov",
        "value": 59
      },
      {
        "date": "Dec",
        "value": 60
      },
      {
        "date": "Jan",
        "value": 60
      },
      {
        "date": "Feb",
        "value": 60
      },
      {
        "date": "Mar",
        "value": 60
      }
    ]
  },
  {
    "id": "4501",
    "name": "SC-1",
    "state": "South Carolina",
    "raceType": "house",
    "probability": 0.21,
    "margin": -12.2,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 16
      },
      {
        "date": "Oct",
        "value": 18
      },
      {
        "date": "Nov",
        "value": 20
      },
      {
        "date": "Dec",
        "value": 21
      },
      {
        "date": "Jan",
        "value": 21
      },
      {
        "date": "Feb",
        "value": 21
      },
      {
        "date": "Mar",
        "value": 21
      }
    ]
  },
  {
    "id": "4502",
    "name": "SC-2",
    "state": "South Carolina",
    "raceType": "house",
    "probability": 0.12,
    "margin": -15.8,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 7
      },
      {
        "date": "Oct",
        "value": 9
      },
      {
        "date": "Nov",
        "value": 11
      },
      {
        "date": "Dec",
        "value": 12
      },
      {
        "date": "Jan",
        "value": 12
      },
      {
        "date": "Feb",
        "value": 12
      },
      {
        "date": "Mar",
        "value": 12
      }
    ]
  },
  {
    "id": "4503",
    "name": "SC-3",
    "state": "South Carolina",
    "raceType": "house",
    "probability": 0.51,
    "margin": 0.4,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 46
      },
      {
        "date": "Oct",
        "value": 48
      },
      {
        "date": "Nov",
        "value": 50
      },
      {
        "date": "Dec",
        "value": 51
      },
      {
        "date": "Jan",
        "value": 51
      },
      {
        "date": "Feb",
        "value": 51
      },
      {
        "date": "Mar",
        "value": 51
      }
    ]
  },
  {
    "id": "4504",
    "name": "SC-4",
    "state": "South Carolina",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "4505",
    "name": "SC-5",
    "state": "South Carolina",
    "raceType": "house",
    "probability": 0.35,
    "margin": -6.2,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 30
      },
      {
        "date": "Oct",
        "value": 32
      },
      {
        "date": "Nov",
        "value": 34
      },
      {
        "date": "Dec",
        "value": 35
      },
      {
        "date": "Jan",
        "value": 35
      },
      {
        "date": "Feb",
        "value": 35
      },
      {
        "date": "Mar",
        "value": 35
      }
    ]
  },
  {
    "id": "4506",
    "name": "SC-6",
    "state": "South Carolina",
    "raceType": "house",
    "probability": 0.36,
    "margin": -6.1,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 31
      },
      {
        "date": "Oct",
        "value": 33
      },
      {
        "date": "Nov",
        "value": 35
      },
      {
        "date": "Dec",
        "value": 36
      },
      {
        "date": "Jan",
        "value": 36
      },
      {
        "date": "Feb",
        "value": 36
      },
      {
        "date": "Mar",
        "value": 36
      }
    ]
  },
  {
    "id": "4507",
    "name": "SC-7",
    "state": "South Carolina",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "4600",
    "name": "SD-AL",
    "state": "South Dakota",
    "raceType": "house",
    "probability": 0.08,
    "margin": -17.8,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 3
      },
      {
        "date": "Oct",
        "value": 5
      },
      {
        "date": "Nov",
        "value": 7
      },
      {
        "date": "Dec",
        "value": 8
      },
      {
        "date": "Jan",
        "value": 8
      },
      {
        "date": "Feb",
        "value": 8
      },
      {
        "date": "Mar",
        "value": 8
      }
    ]
  },
  {
    "id": "4701",
    "name": "TN-1",
    "state": "Tennessee",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "4702",
    "name": "TN-2",
    "state": "Tennessee",
    "raceType": "house",
    "probability": 0.21,
    "margin": -12,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 16
      },
      {
        "date": "Oct",
        "value": 18
      },
      {
        "date": "Nov",
        "value": 20
      },
      {
        "date": "Dec",
        "value": 21
      },
      {
        "date": "Jan",
        "value": 21
      },
      {
        "date": "Feb",
        "value": 21
      },
      {
        "date": "Mar",
        "value": 21
      }
    ]
  },
  {
    "id": "4703",
    "name": "TN-3",
    "state": "Tennessee",
    "raceType": "house",
    "probability": 0.37,
    "margin": -5.6,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 32
      },
      {
        "date": "Oct",
        "value": 34
      },
      {
        "date": "Nov",
        "value": 36
      },
      {
        "date": "Dec",
        "value": 37
      },
      {
        "date": "Jan",
        "value": 37
      },
      {
        "date": "Feb",
        "value": 37
      },
      {
        "date": "Mar",
        "value": 37
      }
    ]
  },
  {
    "id": "4704",
    "name": "TN-4",
    "state": "Tennessee",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "4705",
    "name": "TN-5",
    "state": "Tennessee",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.6,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "4706",
    "name": "TN-6",
    "state": "Tennessee",
    "raceType": "house",
    "probability": 0.14,
    "margin": -15,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 9
      },
      {
        "date": "Oct",
        "value": 11
      },
      {
        "date": "Nov",
        "value": 13
      },
      {
        "date": "Dec",
        "value": 14
      },
      {
        "date": "Jan",
        "value": 14
      },
      {
        "date": "Feb",
        "value": 14
      },
      {
        "date": "Mar",
        "value": 14
      }
    ]
  },
  {
    "id": "4707",
    "name": "TN-7",
    "state": "Tennessee",
    "raceType": "house",
    "probability": 0.07,
    "margin": -18,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 2
      },
      {
        "date": "Oct",
        "value": 4
      },
      {
        "date": "Nov",
        "value": 6
      },
      {
        "date": "Dec",
        "value": 7
      },
      {
        "date": "Jan",
        "value": 7
      },
      {
        "date": "Feb",
        "value": 7
      },
      {
        "date": "Mar",
        "value": 7
      }
    ]
  },
  {
    "id": "4708",
    "name": "TN-8",
    "state": "Tennessee",
    "raceType": "house",
    "probability": 0.45,
    "margin": -2.2,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 40
      },
      {
        "date": "Oct",
        "value": 42
      },
      {
        "date": "Nov",
        "value": 44
      },
      {
        "date": "Dec",
        "value": 45
      },
      {
        "date": "Jan",
        "value": 45
      },
      {
        "date": "Feb",
        "value": 45
      },
      {
        "date": "Mar",
        "value": 45
      }
    ]
  },
  {
    "id": "4709",
    "name": "TN-9",
    "state": "Tennessee",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "4801",
    "name": "TX-1",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.11,
    "margin": -16.4,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 6
      },
      {
        "date": "Oct",
        "value": 8
      },
      {
        "date": "Nov",
        "value": 10
      },
      {
        "date": "Dec",
        "value": 11
      },
      {
        "date": "Jan",
        "value": 11
      },
      {
        "date": "Feb",
        "value": 11
      },
      {
        "date": "Mar",
        "value": 11
      }
    ]
  },
  {
    "id": "4802",
    "name": "TX-2",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.43,
    "margin": -3,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 38
      },
      {
        "date": "Oct",
        "value": 40
      },
      {
        "date": "Nov",
        "value": 42
      },
      {
        "date": "Dec",
        "value": 43
      },
      {
        "date": "Jan",
        "value": 43
      },
      {
        "date": "Feb",
        "value": 43
      },
      {
        "date": "Mar",
        "value": 43
      }
    ]
  },
  {
    "id": "4803",
    "name": "TX-3",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.44,
    "margin": -2.6,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 39
      },
      {
        "date": "Oct",
        "value": 41
      },
      {
        "date": "Nov",
        "value": 43
      },
      {
        "date": "Dec",
        "value": 44
      },
      {
        "date": "Jan",
        "value": 44
      },
      {
        "date": "Feb",
        "value": 44
      },
      {
        "date": "Mar",
        "value": 44
      }
    ]
  },
  {
    "id": "4804",
    "name": "TX-4",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.1,
    "margin": -16.6,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 5
      },
      {
        "date": "Oct",
        "value": 7
      },
      {
        "date": "Nov",
        "value": 9
      },
      {
        "date": "Dec",
        "value": 10
      },
      {
        "date": "Jan",
        "value": 10
      },
      {
        "date": "Feb",
        "value": 10
      },
      {
        "date": "Mar",
        "value": 10
      }
    ]
  },
  {
    "id": "4805",
    "name": "TX-5",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.59,
    "margin": 3.7,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 54
      },
      {
        "date": "Oct",
        "value": 56
      },
      {
        "date": "Nov",
        "value": 58
      },
      {
        "date": "Dec",
        "value": 59
      },
      {
        "date": "Jan",
        "value": 59
      },
      {
        "date": "Feb",
        "value": 59
      },
      {
        "date": "Mar",
        "value": 59
      }
    ]
  },
  {
    "id": "4806",
    "name": "TX-6",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.21,
    "margin": -12.2,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 16
      },
      {
        "date": "Oct",
        "value": 18
      },
      {
        "date": "Nov",
        "value": 20
      },
      {
        "date": "Dec",
        "value": 21
      },
      {
        "date": "Jan",
        "value": 21
      },
      {
        "date": "Feb",
        "value": 21
      },
      {
        "date": "Mar",
        "value": 21
      }
    ]
  },
  {
    "id": "4807",
    "name": "TX-7",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.28,
    "margin": -9.1,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 23
      },
      {
        "date": "Oct",
        "value": 25
      },
      {
        "date": "Nov",
        "value": 27
      },
      {
        "date": "Dec",
        "value": 28
      },
      {
        "date": "Jan",
        "value": 28
      },
      {
        "date": "Feb",
        "value": 28
      },
      {
        "date": "Mar",
        "value": 28
      }
    ]
  },
  {
    "id": "4808",
    "name": "TX-8",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.55,
    "margin": 2.2,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 50
      },
      {
        "date": "Oct",
        "value": 52
      },
      {
        "date": "Nov",
        "value": 54
      },
      {
        "date": "Dec",
        "value": 55
      },
      {
        "date": "Jan",
        "value": 55
      },
      {
        "date": "Feb",
        "value": 55
      },
      {
        "date": "Mar",
        "value": 55
      }
    ]
  },
  {
    "id": "4809",
    "name": "TX-9",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.08,
    "margin": -17.6,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 3
      },
      {
        "date": "Oct",
        "value": 5
      },
      {
        "date": "Nov",
        "value": 7
      },
      {
        "date": "Dec",
        "value": 8
      },
      {
        "date": "Jan",
        "value": 8
      },
      {
        "date": "Feb",
        "value": 8
      },
      {
        "date": "Mar",
        "value": 8
      }
    ]
  },
  {
    "id": "4810",
    "name": "TX-10",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.51,
    "margin": 0.3,
    "rating": "Tilt D",
    "history": [
      {
        "date": "Sep",
        "value": 46
      },
      {
        "date": "Oct",
        "value": 48
      },
      {
        "date": "Nov",
        "value": 50
      },
      {
        "date": "Dec",
        "value": 51
      },
      {
        "date": "Jan",
        "value": 51
      },
      {
        "date": "Feb",
        "value": 51
      },
      {
        "date": "Mar",
        "value": 51
      }
    ]
  },
  {
    "id": "4811",
    "name": "TX-11",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.35,
    "margin": -6.3,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 30
      },
      {
        "date": "Oct",
        "value": 32
      },
      {
        "date": "Nov",
        "value": 34
      },
      {
        "date": "Dec",
        "value": 35
      },
      {
        "date": "Jan",
        "value": 35
      },
      {
        "date": "Feb",
        "value": 35
      },
      {
        "date": "Mar",
        "value": 35
      }
    ]
  },
  {
    "id": "4812",
    "name": "TX-12",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.16,
    "margin": -14.4,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 11
      },
      {
        "date": "Oct",
        "value": 13
      },
      {
        "date": "Nov",
        "value": 15
      },
      {
        "date": "Dec",
        "value": 16
      },
      {
        "date": "Jan",
        "value": 16
      },
      {
        "date": "Feb",
        "value": 16
      },
      {
        "date": "Mar",
        "value": 16
      }
    ]
  },
  {
    "id": "4813",
    "name": "TX-13",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.6,
    "margin": 4.2,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 55
      },
      {
        "date": "Oct",
        "value": 57
      },
      {
        "date": "Nov",
        "value": 59
      },
      {
        "date": "Dec",
        "value": 60
      },
      {
        "date": "Jan",
        "value": 60
      },
      {
        "date": "Feb",
        "value": 60
      },
      {
        "date": "Mar",
        "value": 60
      }
    ]
  },
  {
    "id": "4814",
    "name": "TX-14",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.14,
    "margin": -15.1,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 9
      },
      {
        "date": "Oct",
        "value": 11
      },
      {
        "date": "Nov",
        "value": 13
      },
      {
        "date": "Dec",
        "value": 14
      },
      {
        "date": "Jan",
        "value": 14
      },
      {
        "date": "Feb",
        "value": 14
      },
      {
        "date": "Mar",
        "value": 14
      }
    ]
  },
  {
    "id": "4815",
    "name": "TX-15",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.37,
    "margin": -5.3,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 32
      },
      {
        "date": "Oct",
        "value": 34
      },
      {
        "date": "Nov",
        "value": 36
      },
      {
        "date": "Dec",
        "value": 37
      },
      {
        "date": "Jan",
        "value": 37
      },
      {
        "date": "Feb",
        "value": 37
      },
      {
        "date": "Mar",
        "value": 37
      }
    ]
  },
  {
    "id": "4816",
    "name": "TX-16",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.49,
    "margin": -0.5,
    "rating": "Tilt R",
    "history": [
      {
        "date": "Sep",
        "value": 44
      },
      {
        "date": "Oct",
        "value": 46
      },
      {
        "date": "Nov",
        "value": 48
      },
      {
        "date": "Dec",
        "value": 49
      },
      {
        "date": "Jan",
        "value": 49
      },
      {
        "date": "Feb",
        "value": 49
      },
      {
        "date": "Mar",
        "value": 49
      }
    ]
  },
  {
    "id": "4817",
    "name": "TX-17",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.09,
    "margin": -17.4,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 4
      },
      {
        "date": "Oct",
        "value": 6
      },
      {
        "date": "Nov",
        "value": 8
      },
      {
        "date": "Dec",
        "value": 9
      },
      {
        "date": "Jan",
        "value": 9
      },
      {
        "date": "Feb",
        "value": 9
      },
      {
        "date": "Mar",
        "value": 9
      }
    ]
  },
  {
    "id": "4818",
    "name": "TX-18",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.57,
    "margin": 2.8,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 52
      },
      {
        "date": "Oct",
        "value": 54
      },
      {
        "date": "Nov",
        "value": 56
      },
      {
        "date": "Dec",
        "value": 57
      },
      {
        "date": "Jan",
        "value": 57
      },
      {
        "date": "Feb",
        "value": 57
      },
      {
        "date": "Mar",
        "value": 57
      }
    ]
  },
  {
    "id": "4819",
    "name": "TX-19",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.26,
    "margin": -10,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 21
      },
      {
        "date": "Oct",
        "value": 23
      },
      {
        "date": "Nov",
        "value": 25
      },
      {
        "date": "Dec",
        "value": 26
      },
      {
        "date": "Jan",
        "value": 26
      },
      {
        "date": "Feb",
        "value": 26
      },
      {
        "date": "Mar",
        "value": 26
      }
    ]
  },
  {
    "id": "4820",
    "name": "TX-20",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.23,
    "margin": -11.3,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 18
      },
      {
        "date": "Oct",
        "value": 20
      },
      {
        "date": "Nov",
        "value": 22
      },
      {
        "date": "Dec",
        "value": 23
      },
      {
        "date": "Jan",
        "value": 23
      },
      {
        "date": "Feb",
        "value": 23
      },
      {
        "date": "Mar",
        "value": 23
      }
    ]
  },
  {
    "id": "4821",
    "name": "TX-21",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.58,
    "margin": 3.3,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 53
      },
      {
        "date": "Oct",
        "value": 55
      },
      {
        "date": "Nov",
        "value": 57
      },
      {
        "date": "Dec",
        "value": 58
      },
      {
        "date": "Jan",
        "value": 58
      },
      {
        "date": "Feb",
        "value": 58
      },
      {
        "date": "Mar",
        "value": 58
      }
    ]
  },
  {
    "id": "4822",
    "name": "TX-22",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.1,
    "margin": -17,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 5
      },
      {
        "date": "Oct",
        "value": 7
      },
      {
        "date": "Nov",
        "value": 9
      },
      {
        "date": "Dec",
        "value": 10
      },
      {
        "date": "Jan",
        "value": 10
      },
      {
        "date": "Feb",
        "value": 10
      },
      {
        "date": "Mar",
        "value": 10
      }
    ]
  },
  {
    "id": "4823",
    "name": "TX-23",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.46,
    "margin": -1.6,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 41
      },
      {
        "date": "Oct",
        "value": 43
      },
      {
        "date": "Nov",
        "value": 45
      },
      {
        "date": "Dec",
        "value": 46
      },
      {
        "date": "Jan",
        "value": 46
      },
      {
        "date": "Feb",
        "value": 46
      },
      {
        "date": "Mar",
        "value": 46
      }
    ]
  },
  {
    "id": "4824",
    "name": "TX-24",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.9,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "4825",
    "name": "TX-25",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.12,
    "margin": -15.9,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 7
      },
      {
        "date": "Oct",
        "value": 9
      },
      {
        "date": "Nov",
        "value": 11
      },
      {
        "date": "Dec",
        "value": 12
      },
      {
        "date": "Jan",
        "value": 12
      },
      {
        "date": "Feb",
        "value": 12
      },
      {
        "date": "Mar",
        "value": 12
      }
    ]
  },
  {
    "id": "4826",
    "name": "TX-26",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.6,
    "margin": 4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 55
      },
      {
        "date": "Oct",
        "value": 57
      },
      {
        "date": "Nov",
        "value": 59
      },
      {
        "date": "Dec",
        "value": 60
      },
      {
        "date": "Jan",
        "value": 60
      },
      {
        "date": "Feb",
        "value": 60
      },
      {
        "date": "Mar",
        "value": 60
      }
    ]
  },
  {
    "id": "4827",
    "name": "TX-27",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.18,
    "margin": -13.4,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 13
      },
      {
        "date": "Oct",
        "value": 15
      },
      {
        "date": "Nov",
        "value": 17
      },
      {
        "date": "Dec",
        "value": 18
      },
      {
        "date": "Jan",
        "value": 18
      },
      {
        "date": "Feb",
        "value": 18
      },
      {
        "date": "Mar",
        "value": 18
      }
    ]
  },
  {
    "id": "4828",
    "name": "TX-28",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.32,
    "margin": -7.6,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 27
      },
      {
        "date": "Oct",
        "value": 29
      },
      {
        "date": "Nov",
        "value": 31
      },
      {
        "date": "Dec",
        "value": 32
      },
      {
        "date": "Jan",
        "value": 32
      },
      {
        "date": "Feb",
        "value": 32
      },
      {
        "date": "Mar",
        "value": 32
      }
    ]
  },
  {
    "id": "4829",
    "name": "TX-29",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.53,
    "margin": 1.3,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 48
      },
      {
        "date": "Oct",
        "value": 50
      },
      {
        "date": "Nov",
        "value": 52
      },
      {
        "date": "Dec",
        "value": 53
      },
      {
        "date": "Jan",
        "value": 53
      },
      {
        "date": "Feb",
        "value": 53
      },
      {
        "date": "Mar",
        "value": 53
      }
    ]
  },
  {
    "id": "4830",
    "name": "TX-30",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.08,
    "margin": -17.6,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 3
      },
      {
        "date": "Oct",
        "value": 5
      },
      {
        "date": "Nov",
        "value": 7
      },
      {
        "date": "Dec",
        "value": 8
      },
      {
        "date": "Jan",
        "value": 8
      },
      {
        "date": "Feb",
        "value": 8
      },
      {
        "date": "Mar",
        "value": 8
      }
    ]
  },
  {
    "id": "4831",
    "name": "TX-31",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.53,
    "margin": 1.4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 48
      },
      {
        "date": "Oct",
        "value": 50
      },
      {
        "date": "Nov",
        "value": 52
      },
      {
        "date": "Dec",
        "value": 53
      },
      {
        "date": "Jan",
        "value": 53
      },
      {
        "date": "Feb",
        "value": 53
      },
      {
        "date": "Mar",
        "value": 53
      }
    ]
  },
  {
    "id": "4832",
    "name": "TX-32",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.32,
    "margin": -7.7,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 27
      },
      {
        "date": "Oct",
        "value": 29
      },
      {
        "date": "Nov",
        "value": 31
      },
      {
        "date": "Dec",
        "value": 32
      },
      {
        "date": "Jan",
        "value": 32
      },
      {
        "date": "Feb",
        "value": 32
      },
      {
        "date": "Mar",
        "value": 32
      }
    ]
  },
  {
    "id": "4833",
    "name": "TX-33",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.18,
    "margin": -13.3,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 13
      },
      {
        "date": "Oct",
        "value": 15
      },
      {
        "date": "Nov",
        "value": 17
      },
      {
        "date": "Dec",
        "value": 18
      },
      {
        "date": "Jan",
        "value": 18
      },
      {
        "date": "Feb",
        "value": 18
      },
      {
        "date": "Mar",
        "value": 18
      }
    ]
  },
  {
    "id": "4834",
    "name": "TX-34",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.6,
    "margin": 4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 55
      },
      {
        "date": "Oct",
        "value": 57
      },
      {
        "date": "Nov",
        "value": 59
      },
      {
        "date": "Dec",
        "value": 60
      },
      {
        "date": "Jan",
        "value": 60
      },
      {
        "date": "Feb",
        "value": 60
      },
      {
        "date": "Mar",
        "value": 60
      }
    ]
  },
  {
    "id": "4835",
    "name": "TX-35",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.12,
    "margin": -16,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 7
      },
      {
        "date": "Oct",
        "value": 9
      },
      {
        "date": "Nov",
        "value": 11
      },
      {
        "date": "Dec",
        "value": 12
      },
      {
        "date": "Jan",
        "value": 12
      },
      {
        "date": "Feb",
        "value": 12
      },
      {
        "date": "Mar",
        "value": 12
      }
    ]
  },
  {
    "id": "4836",
    "name": "TX-36",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.8,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "4837",
    "name": "TX-37",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.46,
    "margin": -1.7,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 41
      },
      {
        "date": "Oct",
        "value": 43
      },
      {
        "date": "Nov",
        "value": 45
      },
      {
        "date": "Dec",
        "value": 46
      },
      {
        "date": "Jan",
        "value": 46
      },
      {
        "date": "Feb",
        "value": 46
      },
      {
        "date": "Mar",
        "value": 46
      }
    ]
  },
  {
    "id": "4838",
    "name": "TX-38",
    "state": "Texas",
    "raceType": "house",
    "probability": 0.1,
    "margin": -17,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 5
      },
      {
        "date": "Oct",
        "value": 7
      },
      {
        "date": "Nov",
        "value": 9
      },
      {
        "date": "Dec",
        "value": 10
      },
      {
        "date": "Jan",
        "value": 10
      },
      {
        "date": "Feb",
        "value": 10
      },
      {
        "date": "Mar",
        "value": 10
      }
    ]
  },
  {
    "id": "4901",
    "name": "UT-1",
    "state": "Utah",
    "raceType": "house",
    "probability": 0.03,
    "margin": -19.7,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 1
      },
      {
        "date": "Oct",
        "value": 1
      },
      {
        "date": "Nov",
        "value": 2
      },
      {
        "date": "Dec",
        "value": 3
      },
      {
        "date": "Jan",
        "value": 3
      },
      {
        "date": "Feb",
        "value": 3
      },
      {
        "date": "Mar",
        "value": 3
      }
    ]
  },
  {
    "id": "4902",
    "name": "UT-2",
    "state": "Utah",
    "raceType": "house",
    "probability": 0.42,
    "margin": -3.5,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 37
      },
      {
        "date": "Oct",
        "value": 39
      },
      {
        "date": "Nov",
        "value": 41
      },
      {
        "date": "Dec",
        "value": 42
      },
      {
        "date": "Jan",
        "value": 42
      },
      {
        "date": "Feb",
        "value": 42
      },
      {
        "date": "Mar",
        "value": 42
      }
    ]
  },
  {
    "id": "4903",
    "name": "UT-3",
    "state": "Utah",
    "raceType": "house",
    "probability": 0.28,
    "margin": -9.1,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 23
      },
      {
        "date": "Oct",
        "value": 25
      },
      {
        "date": "Nov",
        "value": 27
      },
      {
        "date": "Dec",
        "value": 28
      },
      {
        "date": "Jan",
        "value": 28
      },
      {
        "date": "Feb",
        "value": 28
      },
      {
        "date": "Mar",
        "value": 28
      }
    ]
  },
  {
    "id": "4904",
    "name": "UT-4",
    "state": "Utah",
    "raceType": "house",
    "probability": 0.07,
    "margin": -18.2,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 2
      },
      {
        "date": "Oct",
        "value": 4
      },
      {
        "date": "Nov",
        "value": 6
      },
      {
        "date": "Dec",
        "value": 7
      },
      {
        "date": "Jan",
        "value": 7
      },
      {
        "date": "Feb",
        "value": 7
      },
      {
        "date": "Mar",
        "value": 7
      }
    ]
  },
  {
    "id": "5000",
    "name": "VT-AL",
    "state": "Vermont",
    "raceType": "house",
    "probability": 0.58,
    "margin": 3.4,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 53
      },
      {
        "date": "Oct",
        "value": 55
      },
      {
        "date": "Nov",
        "value": 57
      },
      {
        "date": "Dec",
        "value": 58
      },
      {
        "date": "Jan",
        "value": 58
      },
      {
        "date": "Feb",
        "value": 58
      },
      {
        "date": "Mar",
        "value": 58
      }
    ]
  },
  {
    "id": "5101",
    "name": "VA-1",
    "state": "Virginia",
    "raceType": "house",
    "probability": 0.3,
    "margin": -8.3,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 25
      },
      {
        "date": "Oct",
        "value": 27
      },
      {
        "date": "Nov",
        "value": 29
      },
      {
        "date": "Dec",
        "value": 30
      },
      {
        "date": "Jan",
        "value": 30
      },
      {
        "date": "Feb",
        "value": 30
      },
      {
        "date": "Mar",
        "value": 30
      }
    ]
  },
  {
    "id": "5102",
    "name": "VA-2",
    "state": "Virginia",
    "raceType": "house",
    "probability": 0.79,
    "margin": 12,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 74
      },
      {
        "date": "Oct",
        "value": 76
      },
      {
        "date": "Nov",
        "value": 78
      },
      {
        "date": "Dec",
        "value": 79
      },
      {
        "date": "Jan",
        "value": 79
      },
      {
        "date": "Feb",
        "value": 79
      },
      {
        "date": "Mar",
        "value": 79
      }
    ]
  },
  {
    "id": "5103",
    "name": "VA-3",
    "state": "Virginia",
    "raceType": "house",
    "probability": 0.41,
    "margin": -3.6,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 36
      },
      {
        "date": "Oct",
        "value": 38
      },
      {
        "date": "Nov",
        "value": 40
      },
      {
        "date": "Dec",
        "value": 41
      },
      {
        "date": "Jan",
        "value": 41
      },
      {
        "date": "Feb",
        "value": 41
      },
      {
        "date": "Mar",
        "value": 41
      }
    ]
  },
  {
    "id": "5104",
    "name": "VA-4",
    "state": "Virginia",
    "raceType": "house",
    "probability": 0.48,
    "margin": -0.8,
    "rating": "Tilt R",
    "history": [
      {
        "date": "Sep",
        "value": 43
      },
      {
        "date": "Oct",
        "value": 45
      },
      {
        "date": "Nov",
        "value": 47
      },
      {
        "date": "Dec",
        "value": 48
      },
      {
        "date": "Jan",
        "value": 48
      },
      {
        "date": "Feb",
        "value": 48
      },
      {
        "date": "Mar",
        "value": 48
      }
    ]
  },
  {
    "id": "5105",
    "name": "VA-5",
    "state": "Virginia",
    "raceType": "house",
    "probability": 0.76,
    "margin": 10.7,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 71
      },
      {
        "date": "Oct",
        "value": 73
      },
      {
        "date": "Nov",
        "value": 75
      },
      {
        "date": "Dec",
        "value": 76
      },
      {
        "date": "Jan",
        "value": 76
      },
      {
        "date": "Feb",
        "value": 76
      },
      {
        "date": "Mar",
        "value": 76
      }
    ]
  },
  {
    "id": "5106",
    "name": "VA-6",
    "state": "Virginia",
    "raceType": "house",
    "probability": 0.28,
    "margin": -9.1,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 23
      },
      {
        "date": "Oct",
        "value": 25
      },
      {
        "date": "Nov",
        "value": 27
      },
      {
        "date": "Dec",
        "value": 28
      },
      {
        "date": "Jan",
        "value": 28
      },
      {
        "date": "Feb",
        "value": 28
      },
      {
        "date": "Mar",
        "value": 28
      }
    ]
  },
  {
    "id": "5107",
    "name": "VA-7",
    "state": "Virginia",
    "raceType": "house",
    "probability": 0.7,
    "margin": 8.6,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 65
      },
      {
        "date": "Oct",
        "value": 67
      },
      {
        "date": "Nov",
        "value": 69
      },
      {
        "date": "Dec",
        "value": 70
      },
      {
        "date": "Jan",
        "value": 70
      },
      {
        "date": "Feb",
        "value": 70
      },
      {
        "date": "Mar",
        "value": 70
      }
    ]
  },
  {
    "id": "5108",
    "name": "VA-8",
    "state": "Virginia",
    "raceType": "house",
    "probability": 0.55,
    "margin": 2.3,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 50
      },
      {
        "date": "Oct",
        "value": 52
      },
      {
        "date": "Nov",
        "value": 54
      },
      {
        "date": "Dec",
        "value": 55
      },
      {
        "date": "Jan",
        "value": 55
      },
      {
        "date": "Feb",
        "value": 55
      },
      {
        "date": "Mar",
        "value": 55
      }
    ]
  },
  {
    "id": "5109",
    "name": "VA-9",
    "state": "Virginia",
    "raceType": "house",
    "probability": 0.35,
    "margin": -6.1,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 30
      },
      {
        "date": "Oct",
        "value": 32
      },
      {
        "date": "Nov",
        "value": 34
      },
      {
        "date": "Dec",
        "value": 35
      },
      {
        "date": "Jan",
        "value": 35
      },
      {
        "date": "Feb",
        "value": 35
      },
      {
        "date": "Mar",
        "value": 35
      }
    ]
  },
  {
    "id": "5110",
    "name": "VA-10",
    "state": "Virginia",
    "raceType": "house",
    "probability": 0.8,
    "margin": 12.6,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 75
      },
      {
        "date": "Oct",
        "value": 77
      },
      {
        "date": "Nov",
        "value": 79
      },
      {
        "date": "Dec",
        "value": 80
      },
      {
        "date": "Jan",
        "value": 80
      },
      {
        "date": "Feb",
        "value": 80
      },
      {
        "date": "Mar",
        "value": 80
      }
    ]
  },
  {
    "id": "5111",
    "name": "VA-11",
    "state": "Virginia",
    "raceType": "house",
    "probability": 0.34,
    "margin": -6.6,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 29
      },
      {
        "date": "Oct",
        "value": 31
      },
      {
        "date": "Nov",
        "value": 33
      },
      {
        "date": "Dec",
        "value": 34
      },
      {
        "date": "Jan",
        "value": 34
      },
      {
        "date": "Feb",
        "value": 34
      },
      {
        "date": "Mar",
        "value": 34
      }
    ]
  },
  {
    "id": "5301",
    "name": "WA-1",
    "state": "Washington",
    "raceType": "house",
    "probability": 0.46,
    "margin": -1.5,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 41
      },
      {
        "date": "Oct",
        "value": 43
      },
      {
        "date": "Nov",
        "value": 45
      },
      {
        "date": "Dec",
        "value": 46
      },
      {
        "date": "Jan",
        "value": 46
      },
      {
        "date": "Feb",
        "value": 46
      },
      {
        "date": "Mar",
        "value": 46
      }
    ]
  },
  {
    "id": "5302",
    "name": "WA-2",
    "state": "Washington",
    "raceType": "house",
    "probability": 0.85,
    "margin": 14.7,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 80
      },
      {
        "date": "Oct",
        "value": 82
      },
      {
        "date": "Nov",
        "value": 84
      },
      {
        "date": "Dec",
        "value": 85
      },
      {
        "date": "Jan",
        "value": 85
      },
      {
        "date": "Feb",
        "value": 85
      },
      {
        "date": "Mar",
        "value": 85
      }
    ]
  },
  {
    "id": "5303",
    "name": "WA-3",
    "state": "Washington",
    "raceType": "house",
    "probability": 0.37,
    "margin": -5.6,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 32
      },
      {
        "date": "Oct",
        "value": 34
      },
      {
        "date": "Nov",
        "value": 36
      },
      {
        "date": "Dec",
        "value": 37
      },
      {
        "date": "Jan",
        "value": 37
      },
      {
        "date": "Feb",
        "value": 37
      },
      {
        "date": "Mar",
        "value": 37
      }
    ]
  },
  {
    "id": "5304",
    "name": "WA-4",
    "state": "Washington",
    "raceType": "house",
    "probability": 0.69,
    "margin": 8.1,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 64
      },
      {
        "date": "Oct",
        "value": 66
      },
      {
        "date": "Nov",
        "value": 68
      },
      {
        "date": "Dec",
        "value": 69
      },
      {
        "date": "Jan",
        "value": 69
      },
      {
        "date": "Feb",
        "value": 69
      },
      {
        "date": "Mar",
        "value": 69
      }
    ]
  },
  {
    "id": "5305",
    "name": "WA-5",
    "state": "Washington",
    "raceType": "house",
    "probability": 0.7,
    "margin": 8.2,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 65
      },
      {
        "date": "Oct",
        "value": 67
      },
      {
        "date": "Nov",
        "value": 69
      },
      {
        "date": "Dec",
        "value": 70
      },
      {
        "date": "Jan",
        "value": 70
      },
      {
        "date": "Feb",
        "value": 70
      },
      {
        "date": "Mar",
        "value": 70
      }
    ]
  },
  {
    "id": "5306",
    "name": "WA-6",
    "state": "Washington",
    "raceType": "house",
    "probability": 0.37,
    "margin": -5.6,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 32
      },
      {
        "date": "Oct",
        "value": 34
      },
      {
        "date": "Nov",
        "value": 36
      },
      {
        "date": "Dec",
        "value": 37
      },
      {
        "date": "Jan",
        "value": 37
      },
      {
        "date": "Feb",
        "value": 37
      },
      {
        "date": "Mar",
        "value": 37
      }
    ]
  },
  {
    "id": "5307",
    "name": "WA-7",
    "state": "Washington",
    "raceType": "house",
    "probability": 0.85,
    "margin": 14.7,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 80
      },
      {
        "date": "Oct",
        "value": 82
      },
      {
        "date": "Nov",
        "value": 84
      },
      {
        "date": "Dec",
        "value": 85
      },
      {
        "date": "Jan",
        "value": 85
      },
      {
        "date": "Feb",
        "value": 85
      },
      {
        "date": "Mar",
        "value": 85
      }
    ]
  },
  {
    "id": "5308",
    "name": "WA-8",
    "state": "Washington",
    "raceType": "house",
    "probability": 0.47,
    "margin": -1.4,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 42
      },
      {
        "date": "Oct",
        "value": 44
      },
      {
        "date": "Nov",
        "value": 46
      },
      {
        "date": "Dec",
        "value": 47
      },
      {
        "date": "Jan",
        "value": 47
      },
      {
        "date": "Feb",
        "value": 47
      },
      {
        "date": "Mar",
        "value": 47
      }
    ]
  },
  {
    "id": "5309",
    "name": "WA-9",
    "state": "Washington",
    "raceType": "house",
    "probability": 0.55,
    "margin": 2,
    "rating": "Lean D",
    "history": [
      {
        "date": "Sep",
        "value": 50
      },
      {
        "date": "Oct",
        "value": 52
      },
      {
        "date": "Nov",
        "value": 54
      },
      {
        "date": "Dec",
        "value": 55
      },
      {
        "date": "Jan",
        "value": 55
      },
      {
        "date": "Feb",
        "value": 55
      },
      {
        "date": "Mar",
        "value": 55
      }
    ]
  },
  {
    "id": "5310",
    "name": "WA-10",
    "state": "Washington",
    "raceType": "house",
    "probability": 0.81,
    "margin": 13,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 76
      },
      {
        "date": "Oct",
        "value": 78
      },
      {
        "date": "Nov",
        "value": 80
      },
      {
        "date": "Dec",
        "value": 81
      },
      {
        "date": "Jan",
        "value": 81
      },
      {
        "date": "Feb",
        "value": 81
      },
      {
        "date": "Mar",
        "value": 81
      }
    ]
  },
  {
    "id": "5401",
    "name": "WV-1",
    "state": "West Virginia",
    "raceType": "house",
    "probability": 0.08,
    "margin": -17.8,
    "rating": "Safe R",
    "history": [
      {
        "date": "Sep",
        "value": 3
      },
      {
        "date": "Oct",
        "value": 5
      },
      {
        "date": "Nov",
        "value": 7
      },
      {
        "date": "Dec",
        "value": 8
      },
      {
        "date": "Jan",
        "value": 8
      },
      {
        "date": "Feb",
        "value": 8
      },
      {
        "date": "Mar",
        "value": 8
      }
    ]
  },
  {
    "id": "5402",
    "name": "WV-2",
    "state": "West Virginia",
    "raceType": "house",
    "probability": 0.36,
    "margin": -6,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 31
      },
      {
        "date": "Oct",
        "value": 33
      },
      {
        "date": "Nov",
        "value": 35
      },
      {
        "date": "Dec",
        "value": 36
      },
      {
        "date": "Jan",
        "value": 36
      },
      {
        "date": "Feb",
        "value": 36
      },
      {
        "date": "Mar",
        "value": 36
      }
    ]
  },
  {
    "id": "5501",
    "name": "WI-1",
    "state": "Wisconsin",
    "raceType": "house",
    "probability": 0.49,
    "margin": -0.3,
    "rating": "Tilt R",
    "history": [
      {
        "date": "Sep",
        "value": 44
      },
      {
        "date": "Oct",
        "value": 46
      },
      {
        "date": "Nov",
        "value": 48
      },
      {
        "date": "Dec",
        "value": 49
      },
      {
        "date": "Jan",
        "value": 49
      },
      {
        "date": "Feb",
        "value": 49
      },
      {
        "date": "Mar",
        "value": 49
      }
    ]
  },
  {
    "id": "5502",
    "name": "WI-2",
    "state": "Wisconsin",
    "raceType": "house",
    "probability": 0.65,
    "margin": 6.1,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 60
      },
      {
        "date": "Oct",
        "value": 62
      },
      {
        "date": "Nov",
        "value": 64
      },
      {
        "date": "Dec",
        "value": 65
      },
      {
        "date": "Jan",
        "value": 65
      },
      {
        "date": "Feb",
        "value": 65
      },
      {
        "date": "Mar",
        "value": 65
      }
    ]
  },
  {
    "id": "5503",
    "name": "WI-3",
    "state": "Wisconsin",
    "raceType": "house",
    "probability": 0.22,
    "margin": -11.7,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 17
      },
      {
        "date": "Oct",
        "value": 19
      },
      {
        "date": "Nov",
        "value": 21
      },
      {
        "date": "Dec",
        "value": 22
      },
      {
        "date": "Jan",
        "value": 22
      },
      {
        "date": "Feb",
        "value": 22
      },
      {
        "date": "Mar",
        "value": 22
      }
    ]
  },
  {
    "id": "5504",
    "name": "WI-4",
    "state": "Wisconsin",
    "raceType": "house",
    "probability": 0.69,
    "margin": 8.2,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 64
      },
      {
        "date": "Oct",
        "value": 66
      },
      {
        "date": "Nov",
        "value": 68
      },
      {
        "date": "Dec",
        "value": 69
      },
      {
        "date": "Jan",
        "value": 69
      },
      {
        "date": "Feb",
        "value": 69
      },
      {
        "date": "Mar",
        "value": 69
      }
    ]
  },
  {
    "id": "5505",
    "name": "WI-5",
    "state": "Wisconsin",
    "raceType": "house",
    "probability": 0.42,
    "margin": -3.3,
    "rating": "Lean R",
    "history": [
      {
        "date": "Sep",
        "value": 37
      },
      {
        "date": "Oct",
        "value": 39
      },
      {
        "date": "Nov",
        "value": 41
      },
      {
        "date": "Dec",
        "value": 42
      },
      {
        "date": "Jan",
        "value": 42
      },
      {
        "date": "Feb",
        "value": 42
      },
      {
        "date": "Mar",
        "value": 42
      }
    ]
  },
  {
    "id": "5506",
    "name": "WI-6",
    "state": "Wisconsin",
    "raceType": "house",
    "probability": 0.35,
    "margin": -6.2,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 30
      },
      {
        "date": "Oct",
        "value": 32
      },
      {
        "date": "Nov",
        "value": 34
      },
      {
        "date": "Dec",
        "value": 35
      },
      {
        "date": "Jan",
        "value": 35
      },
      {
        "date": "Feb",
        "value": 35
      },
      {
        "date": "Mar",
        "value": 35
      }
    ]
  },
  {
    "id": "5507",
    "name": "WI-7",
    "state": "Wisconsin",
    "raceType": "house",
    "probability": 0.73,
    "margin": 9.5,
    "rating": "Likely D",
    "history": [
      {
        "date": "Sep",
        "value": 68
      },
      {
        "date": "Oct",
        "value": 70
      },
      {
        "date": "Nov",
        "value": 72
      },
      {
        "date": "Dec",
        "value": 73
      },
      {
        "date": "Jan",
        "value": 73
      },
      {
        "date": "Feb",
        "value": 73
      },
      {
        "date": "Mar",
        "value": 73
      }
    ]
  },
  {
    "id": "5508",
    "name": "WI-8",
    "state": "Wisconsin",
    "raceType": "house",
    "probability": 0.24,
    "margin": -10.8,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 19
      },
      {
        "date": "Oct",
        "value": 21
      },
      {
        "date": "Nov",
        "value": 23
      },
      {
        "date": "Dec",
        "value": 24
      },
      {
        "date": "Jan",
        "value": 24
      },
      {
        "date": "Feb",
        "value": 24
      },
      {
        "date": "Mar",
        "value": 24
      }
    ]
  },
  {
    "id": "5600",
    "name": "WY-AL",
    "state": "Wyoming",
    "raceType": "house",
    "probability": 0.17,
    "margin": -13.9,
    "rating": "Likely R",
    "history": [
      {
        "date": "Sep",
        "value": 12
      },
      {
        "date": "Oct",
        "value": 14
      },
      {
        "date": "Nov",
        "value": 16
      },
      {
        "date": "Dec",
        "value": 17
      },
      {
        "date": "Jan",
        "value": 17
      },
      {
        "date": "Feb",
        "value": 17
      },
      {
        "date": "Mar",
        "value": 17
      }
    ]
  }
];

export const pres2024: Record<string, number> = {};
