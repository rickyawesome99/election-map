#!/usr/bin/env node
/**
 * Updates congressional district boundaries for specified states
 * using 119th Congress data from Census Bureau TIGERWEB API,
 * simplified with mapshaper and winding-order-corrected to RFC 7946
 * (CCW exterior rings, CW interior rings).
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';

const TIGERWEB_URL =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/0/query';

const STATES_TO_UPDATE = {
  '06': 'California',
  '49': 'Utah',
  '48': 'Texas',
  '39': 'Ohio',
  '36': 'New York',
};

// Signed area: negative = CW, positive = CCW
function signedArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

// Force exterior ring to CCW and holes to CW (GeoJSON RFC 7946).
function fixWindingOrder(geometry) {
  if (geometry.type === 'Polygon') {
    geometry.coordinates = geometry.coordinates.map((ring, i) => {
      const area = signedArea(ring);
      const isExterior = i === 0;
      // exterior should be CCW (positive area), holes should be CW (negative)
      if (isExterior && area < 0) return [...ring].reverse();
      if (!isExterior && area > 0) return [...ring].reverse();
      return ring;
    });
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates = geometry.coordinates.map(poly =>
      poly.map((ring, i) => {
        const area = signedArea(ring);
        const isExterior = i === 0;
        if (isExterior && area < 0) return [...ring].reverse();
        if (!isExterior && area > 0) return [...ring].reverse();
        return ring;
      })
    );
  }
  return geometry;
}

async function fetchStateDistricts(stateFips) {
  const params = new URLSearchParams({
    where: `STATE='${stateFips}'`,
    outFields: 'GEOID,STATE,CD119,NAME,CDSESSN',
    outSR: '4326',
    f: 'geojson',
  });

  console.log(`Fetching ${STATES_TO_UPDATE[stateFips]} (${stateFips})...`);
  const res = await fetch(`${TIGERWEB_URL}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for state ${stateFips}`);
  const geojson = await res.json();
  if (!geojson.features) throw new Error(`No features for state ${stateFips}`);
  console.log(`  Got ${geojson.features.length} districts`);
  return geojson.features;
}

async function main() {
  const filePath = 'public/congressional-districts.json';
  console.log('Loading existing districts file...');
  const existing = JSON.parse(readFileSync(filePath, 'utf8'));

  const fipsToUpdate = new Set(Object.keys(STATES_TO_UPDATE));
  const kept = existing.features.filter(f => !fipsToUpdate.has(f.properties.STATEFP));
  console.log(`Kept ${kept.length} features from other states`);

  // Fetch all new features from TIGERWEB
  const rawFeatures = [];
  for (const fips of Object.keys(STATES_TO_UPDATE)) {
    const features = await fetchStateDistricts(fips);
    rawFeatures.push(...features);
  }
  console.log(`Fetched ${rawFeatures.length} raw features`);

  // Write to temp file and simplify with mapshaper (matching original ~300-500 pts/district)
  const tmpIn = join(tmpdir(), 'districts-raw.json');
  const tmpOut = join(tmpdir(), 'districts-simplified.json');
  writeFileSync(tmpIn, JSON.stringify({ type: 'FeatureCollection', features: rawFeatures }));

  console.log('Simplifying with mapshaper...');
  execSync(`npx mapshaper "${tmpIn}" -simplify 4% -o "${tmpOut}" format=geojson`, { stdio: 'pipe' });
  const simplified = JSON.parse(readFileSync(tmpOut, 'utf8'));
  console.log(`  Simplified to ${simplified.features.length} features`);

  // Normalize properties and enforce RFC 7946 winding order.
  const newFeatures = simplified.features.map(f => {
    const stateFips = f.properties.STATE;
    const districtNum = (f.properties.CD119 || '').padStart(2, '0');
    const geoid = `${stateFips}${districtNum}`;

    return {
      type: 'Feature',
      geometry: fixWindingOrder(f.geometry),
      properties: {
        STATEFP: stateFips,
        CD119FP: districtNum,
        AFFGEOID: `5001900US${geoid}`,
        GEOID: geoid,
        NAMELSAD: f.properties.NAME || `Congressional District ${districtNum}`,
        LSAD: 'C2',
        CDSESSN: '119',
      },
    };
  });

  const updated = {
    type: 'FeatureCollection',
    features: [...kept, ...newFeatures],
  };

  console.log(`Writing ${updated.features.length} total features...`);
  writeFileSync(filePath, JSON.stringify(updated));
  console.log('Done!');

  const counts = {};
  for (const f of updated.features) counts[f.properties.STATEFP] = (counts[f.properties.STATEFP] || 0) + 1;
  for (const [fips, name] of Object.entries(STATES_TO_UPDATE)) {
    console.log(`  ${name} (${fips}): ${counts[fips]} districts`);
  }
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
