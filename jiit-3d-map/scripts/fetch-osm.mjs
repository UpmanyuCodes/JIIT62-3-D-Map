// Downloads raw OpenStreetMap data around JIIT Sector 62 (free Overpass API).
// Map data © OpenStreetMap contributors, ODbL.
import { writeFileSync } from 'node:fs';
const bbox = '28.6250,77.3660,28.6350,77.3790';
const q = `[out:json][timeout:90];
(
  way(71847594);
  relation(5262993);
  way(${bbox})[building];
  relation(${bbox})[building];
  way(${bbox})[highway];
  way(${bbox})[leisure];
  way(${bbox})[landuse];
  way(${bbox})[amenity];
  way(${bbox})[natural];
  node(${bbox})[~"^(amenity|shop|leisure|barrier|natural|name|tourism|highway)$"~"."];
);
out geom;`;
const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
let res;
for (const url of endpoints) {
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': 'campus-3d-map-builder', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(q),
    });
    if (res.ok) break;
    console.warn(url, 'HTTP', res.status);
  } catch (err) {
    console.warn(url, 'failed:', err.cause?.code || err.message);
  }
  res = null;
}
if (!res) throw new Error('All Overpass endpoints failed, try again later');
const txt = await res.text();
writeFileSync(new URL('../src/data/osm-raw.json', import.meta.url), txt);
console.log('saved', JSON.parse(txt).elements.length, 'elements');
