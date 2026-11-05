// Generated once, 2026-11-05: the county rows data-entry/county_results_corrections.csv fixed, as they
// stood when the 2026 forecast was locked. lib/locked2026CountyData.ts lays them back over the corrected
// data for the 2026 model's county figures only (County TPL, the turnout split).
import type { CountyYearResult } from "@/data/countySenateData";

export type LockedRow = { fips: string; bucket: "years" | "specialYears"; year: number; row: CountyYearResult };

export const lockedSenateRows: LockedRow[] = [
  { fips: "13069", bucket: "specialYears", year: 2020, row: { demVotes: 4082, repVotes: 9137, othVotes: 0, totalVotes: 13129, demPct: 31.09, repPct: 69.59, margin: 38.5 } },
  { fips: "13133", bucket: "specialYears", year: 2020, row: { demVotes: 3758, repVotes: 6855, othVotes: 0, totalVotes: 11247, demPct: 33.41, repPct: 60.95, margin: 27.54 } },
  { fips: "18167", bucket: "years", year: 2016, row: { demVotes: 21028, repVotes: 15681, othVotes: 2229, totalVotes: 39838, demPct: 52.78, repPct: 39.36, margin: -13.42 } },
  { fips: "23005", bucket: "years", year: 2018, row: { demVotes: 93860, repVotes: 40053, othVotes: 21035, totalVotes: 156893, demPct: 59.82, repPct: 25.53, margin: -34.29 } },
  { fips: "23005", bucket: "years", year: 2024, row: { demVotes: 113847, repVotes: 47372, othVotes: 28883, totalVotes: 191102, demPct: 59.57, repPct: 24.79, margin: -34.78 } },
  { fips: "26037", bucket: "years", year: 2024, row: { demVotes: 22600, repVotes: 25903, othVotes: 562, totalVotes: 49545, demPct: 45.62, repPct: 52.28, margin: 6.66 } },
  { fips: "27171", bucket: "years", year: 2020, row: { demVotes: 25896, repVotes: 48173, othVotes: 6592, totalVotes: 74069, demPct: 34.96, repPct: 65.04, margin: 30.08 } },
  { fips: "31007", bucket: "specialYears", year: 2024, row: { demVotes: 25, repVotes: 357, othVotes: 0, totalVotes: 372, demPct: 6.72, repPct: 95.97, margin: 89.25 } },
  { fips: "31155", bucket: "specialYears", year: 2024, row: { demVotes: 3240, repVotes: 10081, othVotes: 0, totalVotes: 4321, demPct: 74.98, repPct: 233.3, margin: 158.32 } },
  { fips: "32013", bucket: "years", year: 2016, row: { demVotes: 1406, repVotes: 4397, othVotes: 581, totalVotes: 6834, demPct: 20.57, repPct: 64.34, margin: 43.77 } },
  { fips: "32015", bucket: "years", year: 2016, row: { demVotes: 417, repVotes: 1704, othVotes: 272, totalVotes: 2280, demPct: 18.29, repPct: 74.74, margin: 56.45 } },
  { fips: "33005", bucket: "years", year: 2020, row: { demVotes: 26750, repVotes: 15690, othVotes: 1155, totalVotes: 42440, demPct: 63.03, repPct: 36.97, margin: -26.06 } },
  { fips: "42007", bucket: "years", year: 2018, row: { demVotes: 34442, repVotes: 31916, othVotes: 1284, totalVotes: 68884, demPct: 50.0, repPct: 46.33, margin: -3.67 } },
  { fips: "42035", bucket: "years", year: 2018, row: { demVotes: 5289, repVotes: 6869, othVotes: 220, totalVotes: 18448, demPct: 28.67, repPct: 37.23, margin: 8.56 } },
  { fips: "42061", bucket: "years", year: 2024, row: { demVotes: 5582, repVotes: 16910, othVotes: 986, totalVotes: 23028, demPct: 24.24, repPct: 73.43, margin: 49.19 } },
  { fips: "42095", bucket: "years", year: 2018, row: { demVotes: 62275, repVotes: 50385, othVotes: 1956, totalVotes: 124550, demPct: 50.0, repPct: 40.45, margin: -9.55 } },
  { fips: "42103", bucket: "years", year: 2024, row: { demVotes: 6470, repVotes: 20869, othVotes: 831, totalVotes: 34609, demPct: 18.69, repPct: 60.3, margin: 41.61 } },
  { fips: "42109", bucket: "years", year: 2018, row: { demVotes: 4322, repVotes: 8826, othVotes: 245, totalVotes: 28637, demPct: 15.09, repPct: 30.82, margin: 15.73 } },
  { fips: "45067", bucket: "years", year: 2020, row: { demVotes: 9034, repVotes: 5562, othVotes: 132, totalVotes: 14278, demPct: 63.27, repPct: 38.96, margin: -24.31 } },
  { fips: "48367", bucket: "years", year: 2020, row: { demVotes: 11919, repVotes: 61705, othVotes: 473, totalVotes: 75520, demPct: 15.78, repPct: 81.71, margin: 65.93 } },
  { fips: "48441", bucket: "years", year: 2020, row: { demVotes: 13704, repVotes: 39887, othVotes: 1522, totalVotes: 54483, demPct: 25.15, repPct: 73.21, margin: 48.06 } },
  { fips: "55083", bucket: "years", year: 2018, row: { demVotes: 7042, repVotes: 10392, othVotes: 15, totalVotes: 16731, demPct: 42.09, repPct: 62.11, margin: 20.02 } },
];

export const lockedGovernorRows: LockedRow[] = [
  { fips: "06095", bucket: "years", year: 2018, row: { demVotes: 86694, repVotes: 56627, othVotes: 0, totalVotes: 146321, demPct: 59.25, repPct: 38.7, margin: -20.55 } },
  { fips: "08083", bucket: "years", year: 2018, row: { demVotes: 4403, repVotes: 6933, othVotes: 288, totalVotes: 11714, demPct: 37.59, repPct: 59.19, margin: 21.6 } },
  { fips: "12077", bucket: "years", year: 2022, row: { demVotes: 371, repVotes: 2345, othVotes: 12, totalVotes: 2617, demPct: 14.18, repPct: 89.61, margin: 75.43 } },
  { fips: "18163", bucket: "years", year: 2024, row: { demVotes: 31408, repVotes: 40270, othVotes: 1756, totalVotes: 74434, demPct: 42.2, repPct: 54.1, margin: 11.9 } },
  { fips: "21073", bucket: "years", year: 2019, row: { demVotes: 12888, repVotes: 7570, othVotes: 493, totalVotes: 21230, demPct: 60.71, repPct: 35.66, margin: -25.05 } },
  { fips: "32510", bucket: "years", year: 2018, row: { demVotes: 9249, repVotes: 12080, othVotes: 1161, totalVotes: 22681, demPct: 40.78, repPct: 53.26, margin: 12.48 } },
  { fips: "36037", bucket: "years", year: 2018, row: { demVotes: 5400, repVotes: 13967, othVotes: 1714, totalVotes: 21801, demPct: 24.77, repPct: 64.07, margin: 39.3 } },
  { fips: "36053", bucket: "years", year: 2018, row: { demVotes: 9006, repVotes: 10153, othVotes: 2286, totalVotes: 25908, demPct: 34.76, repPct: 39.19, margin: 4.43 } },
  { fips: "36083", bucket: "years", year: 2018, row: { demVotes: 69116, repVotes: 67063, othVotes: 4505, totalVotes: 60500, demPct: 114.24, repPct: 110.85, margin: -3.39 } },
  { fips: "36097", bucket: "years", year: 2018, row: { demVotes: 2414, repVotes: 4024, othVotes: 493, totalVotes: 7381, demPct: 32.71, repPct: 54.52, margin: 21.81 } },
  { fips: "36111", bucket: "years", year: 2018, row: { demVotes: 24325, repVotes: 33509, othVotes: 3752, totalVotes: 78661, demPct: 30.92, repPct: 42.6, margin: 11.68 } },
  { fips: "37047", bucket: "years", year: 2024, row: { demVotes: 9920, repVotes: 14970, othVotes: 941, totalVotes: 25381, demPct: 39.08, repPct: 58.98, margin: 19.9 } },
  { fips: "37055", bucket: "years", year: 2024, row: { demVotes: 11031, repVotes: 12717, othVotes: 1029, totalVotes: 24504, demPct: 45.02, repPct: 51.9, margin: 6.88 } },
  { fips: "40041", bucket: "years", year: 2022, row: { demVotes: 3497, repVotes: 8858, othVotes: 413, totalVotes: 13218, demPct: 26.46, repPct: 67.01, margin: 40.55 } },
  { fips: "40065", bucket: "years", year: 2022, row: { demVotes: 1, repVotes: 3857, othVotes: 195, totalVotes: 5502, demPct: 0.02, repPct: 70.1, margin: 70.08 } },
  { fips: "40073", bucket: "years", year: 2022, row: { demVotes: 1121, repVotes: 3, othVotes: 115, totalVotes: 4883, demPct: 22.96, repPct: 0.06, margin: -22.9 } },
  { fips: "40085", bucket: "years", year: 2022, row: { demVotes: 703, repVotes: 1, othVotes: 88, totalVotes: 2742, demPct: 25.64, repPct: 0.04, margin: -25.6 } },
  { fips: "41021", bucket: "years", year: 2018, row: { demVotes: 218, repVotes: 691, othVotes: 114, totalVotes: 993, demPct: 21.95, repPct: 69.59, margin: 47.64 } },
  { fips: "47013", bucket: "years", year: 2022, row: { demVotes: 1197, repVotes: 6118, othVotes: 165, totalVotes: 7550, demPct: 15.85, repPct: 81.03, margin: 65.18 } },
  { fips: "47059", bucket: "years", year: 2022, row: { demVotes: 3054, repVotes: 13574, othVotes: 498, totalVotes: 16951, demPct: 18.02, repPct: 80.08, margin: 62.06 } },
  { fips: "48059", bucket: "years", year: 2022, row: { demVotes: 444, repVotes: 4770, othVotes: 52, totalVotes: 4378, demPct: 10.14, repPct: 108.95, margin: 98.81 } },
  { fips: "48073", bucket: "years", year: 2022, row: { demVotes: 2323, repVotes: 12023, othVotes: 137, totalVotes: 15736, demPct: 14.76, repPct: 76.4, margin: 61.64 } },
  { fips: "48191", bucket: "years", year: 2022, row: { demVotes: 94, repVotes: 772, othVotes: 11, totalVotes: 960, demPct: 9.79, repPct: 80.42, margin: 70.63 } },
  { fips: "48195", bucket: "years", year: 2022, row: { demVotes: 91, repVotes: 1419, othVotes: 12, totalVotes: 1510, demPct: 6.03, repPct: 93.97, margin: 87.94 } },
  { fips: "48205", bucket: "years", year: 2022, row: { demVotes: 96, repVotes: 1463, othVotes: 15, totalVotes: 1564, demPct: 6.14, repPct: 93.54, margin: 87.4 } },
  { fips: "48253", bucket: "years", year: 2022, row: { demVotes: 581, repVotes: 4349, othVotes: 62, totalVotes: 4349, demPct: 13.36, repPct: 100.0, margin: 86.64 } },
  { fips: "48379", bucket: "years", year: 2022, row: { demVotes: 596, repVotes: 4339, othVotes: 52, totalVotes: 6528, demPct: 9.13, repPct: 66.47, margin: 57.34 } },
  { fips: "48427", bucket: "years", year: 2022, row: { demVotes: 6455, repVotes: 4460, othVotes: 202, totalVotes: 14182, demPct: 45.52, repPct: 31.45, margin: -14.07 } },
  { fips: "54003", bucket: "years", year: 2020, row: { demVotes: 15253, repVotes: 28841, othVotes: 3083, totalVotes: 47897, demPct: 31.85, repPct: 60.21, margin: 28.36 } },
];
