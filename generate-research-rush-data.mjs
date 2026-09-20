import fs from "node:fs/promises";

const DATA_ROOT = "https://betaguide.wz2100.net/data_master/stats/";
const OUTPUT_PATH = new URL("./research-rush-data.json", import.meta.url);
const targetIds = ["R-Defense-Super-Rocket", "R-Wpn-Missile-LtSAM"];

async function loadJson(name) {
  const response = await fetch(`${DATA_ROOT}${name}.json`, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Unable to download ${name}.json: HTTP ${response.status}`);
  }
  return response.json();
}

const [research, weapons, structures] = await Promise.all([
  loadJson("research"),
  loadJson("weapons"),
  loadJson("structure")
]);

const requiredIds = new Set();
function collect(id) {
  if (requiredIds.has(id)) return;
  const topic = research[id];
  if (!topic) throw new Error(`Missing research topic: ${id}`);
  requiredIds.add(id);
  for (const prerequisite of topic.requiredResearch || []) collect(prerequisite);
}
for (const id of targetIds) collect(id);

const topics = [...requiredIds]
  .map((id) => research[id])
  .map((topic) => ({
    id: topic.id,
    name: topic.name,
    points: Number(topic.researchPoints || 0),
    power: Number(topic.researchPower || 0),
    requires: (topic.requiredResearch || []).filter((id) => requiredIds.has(id)),
    target: targetIds.includes(topic.id)
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const payload = {
  format: 1,
  source: DATA_ROOT,
  targets: [
    {
      researchId: "R-Defense-Super-Rocket",
      componentId: "X-Super-Rocket",
      name: structures["X-Super-Rocket"].name,
      type: "Structure",
      guideUrl: "https://betaguide.wz2100.net/structure.html?details_id=X-Super-Rocket"
    },
    {
      researchId: "R-Wpn-Missile-LtSAM",
      componentId: "Missile-LtSAM",
      name: weapons["Missile-LtSAM"].name,
      type: "Weapon",
      guideUrl: "https://betaguide.wz2100.net/weapons.html?details_id=Missile-LtSAM"
    }
  ],
  lab: {
    count: 5,
    basePointsPerSecond: Number(structures.A0ResearchFacility.researchPoints || 14),
    modulePointsPerSecond: Number(structures.A0ResearchModule1.researchPoints || 12)
  },
  topics
};

await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${topics.length} research topics to ${OUTPUT_PATH.pathname}`);
