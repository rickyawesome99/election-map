import { readFileSync } from 'fs';
import { join } from 'path';

const PVI_YEARS = [2026, 2024, 2022, 2020, 2018, 2016] as const;
export type PviYear = typeof PVI_YEARS[number];

export type PviByYear = Partial<Record<PviYear, number>>;
export type PviHistory = Record<string, PviByYear>;

function parsePviCsv(): PviHistory {
  const csvPath = join(process.cwd(), 'data-entry', 'pvi.csv');
  const text = readFileSync(csvPath, 'utf8');
  const lines = text.trim().split('\n');
  const result: PviHistory = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const rawId = cols[1]?.trim();
    if (!rawId || rawId === 'Statewide') continue;

    // CSV uses state FIPS without leading zero; forecastData uses 4-char padded key (e.g. "0101")
    const id = rawId.padStart(4, '0');

    const byYear: PviByYear = {};
    for (let j = 0; j < PVI_YEARS.length; j++) {
      const val = cols[j + 2]?.trim();
      if (val) {
        const num = parseInt(val, 10);
        if (!isNaN(num)) byYear[PVI_YEARS[j]] = num;
      }
    }
    if (Object.keys(byYear).length > 0) result[id] = byYear;
  }

  return result;
}

export const pviHistory: PviHistory = parsePviCsv();
