import { Vector3 } from "three";

// The stock pack consolidates these older page names into shared texture pages.
export const DROID_TEXTURE_ALIASES = {
  "page-32-soldier.png": "page-7-barbarians-arizona.png",
  "page-33-cyborgs.png": "page-14-droid-hubs.png",
};

const sortByName = (items) => items.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
export const isCyborgBody = (body) => body?.class === "Cyborgs";
export const isFlyingPropulsion = (propulsion) => ["Lift", "Helicopter"].includes(propulsion?.type);
export const weaponSlotCount = (body) => Math.max(0, Math.min(3, Number(body?.weaponSlots) || 0));

export function selectableBodies(catalog) {
  return sortByName(Object.values(catalog.bodies).filter((body) =>
    (body.designable && body.class === "Droids") || isCyborgBody(body)));
}

export function compatiblePropulsions(bodyId, catalog) {
  const body = catalog.bodies[bodyId];
  if (!selectableBodies(catalog).some((item) => item.id === bodyId)) return [];
  return sortByName(Object.values(catalog.propulsions).filter((propulsion) => isCyborgBody(body)
    ? propulsion.usageClass === "Cyborg" && propulsion.type === "Legged"
    : propulsion.designable));
}

export function compatibleWeapons(bodyId, propulsionId, catalog) {
  const body = catalog.bodies[bodyId];
  const propulsion = compatiblePropulsions(bodyId, catalog).find((item) => item.id === propulsionId);
  if (!body || !propulsion) return [];
  const flying = isFlyingPropulsion(propulsion);
  return sortByName(Object.values(catalog.weapons).filter((weapon) => {
    if (!(isCyborgBody(body) ? weapon.usageClass === body.usageClass : weapon.designable)) return false;
    if ((Number(weapon.numAttackRuns ?? 0) > 0) !== flying) return false;
    if (flying && !["DIRECT", "HOMING-DIRECT"].includes(weapon.movement ?? "DIRECT")) return false;
    // Engine WEAPON_SIZE values: 0 = light bodies only, 1 = non-light, 2 = any.
    if (weapon.weaponSize === 0 && body.size !== "LIGHT") return false;
    if (weapon.weaponSize === 1 && body.size === "LIGHT") return false;
    return true;
  }));
}

export function reconcileDesign(draft, catalog) {
  const bodies = selectableBodies(catalog);
  const body = bodies.find((item) => item.id === draft.body) ?? bodies.find((item) => item.id === "Body1REC") ?? bodies[0];
  if (!body) throw new Error("No designable bodies are available.");
  const propulsions = compatiblePropulsions(body.id, catalog);
  const propulsion = propulsions.find((item) => item.id === draft.propulsion)
    ?? propulsions.find((item) => item.id === "wheeled01") ?? propulsions[0];
  if (!propulsion) throw new Error("No compatible propulsion is available for this body.");
  const available = compatibleWeapons(body.id, propulsion.id, catalog);
  const preferred = isCyborgBody(body) ? "CyborgChaingun" : isFlyingPropulsion(propulsion) ? "MG1-VTOL" : "MG1Mk1";
  const first = available.find((item) => item.id === draft.weapons?.[0])
    ?? available.find((item) => item.id === preferred) ?? available[0];
  if (!first) throw new Error("No compatible guns are available for this body and propulsion.");
  const weapons = [first.id];
  for (let slot = 1; slot < weaponSlotCount(body); slot += 1) {
    const id = draft.weapons?.[slot];
    if (!available.some((item) => item.id === id)) break;
    weapons.push(id);
  }
  return { body: body.id, propulsion: propulsion.id, weapons };
}

export function validateDesign(design, catalog) {
  if (!selectableBodies(catalog).some((item) => item.id === design.body)) throw new Error("Choose a designable vehicle or cyborg body.");
  if (!compatiblePropulsions(design.body, catalog).some((item) => item.id === design.propulsion)) throw new Error("Choose compatible propulsion for this body.");
  const capacity = weaponSlotCount(catalog.bodies[design.body]);
  if (!Array.isArray(design.weapons) || !design.weapons.length || design.weapons.length > capacity) {
    throw new Error(`This body supports ${capacity} gun slot(s).`);
  }
  const available = new Set(compatibleWeapons(design.body, design.propulsion, catalog).map((item) => item.id));
  if (design.weapons.some((id) => !available.has(id))) throw new Error("Choose guns compatible with the body and propulsion.");
}

export function designName(design, catalog) {
  return `${design.weapons.map((id) => catalog.weapons[id]?.name ?? id).join(" + ")} ${catalog.bodies[design.body]?.name ?? design.body} ${catalog.propulsions[design.propulsion]?.name ?? design.propulsion}`;
}

export function modulePartSpecs(template, catalog, resolvePath) {
  const body = catalog.bodies[template.body];
  const propulsion = catalog.propulsions[template.propulsion];
  if (!body || !propulsion) throw new Error("The preset references an unknown body or propulsion.");
  if (!body.model) throw new Error("The selected body has no model.");
  const specs = [];
  function add(role, value, prefix, label, slot = 0) {
    if (!value) return;
    const path = resolvePath(value, prefix);
    if (!path) throw new Error(`Model ${value} is unavailable for ${label}.`);
    const turret = role === "mount" || role === "weapon";
    const flying = turret && isFlyingPropulsion(propulsion) && !["Transports", "Cyborgs"].includes(body.class);
    specs.push({ role, path, label, slot, connectorIndex: flying ? 5 + slot : slot, rotationZ: flying ? Math.PI : 0 });
  }
  add("body", body.model, "components/bodies/", body.name ?? "Body");
  if (!isCyborgBody(body)) {
    const extra = body.propulsionExtraModels?.[template.propulsion];
    // Modern meshes combine both sides in `left`. Only load an explicit right.
    const models = typeof extra === "string" ? { left: extra } : extra;
    if (models) {
      add("propulsion", models.left, "components/prop/", `${propulsion.name} propulsion`);
      add("propulsion", models.right, "components/prop/", `${propulsion.name} right`);
      add("propulsion", models.still, "components/prop/", `${propulsion.name} stationary`);
    } else {
      add("propulsion", propulsion.model, "components/prop/", propulsion.name ?? "Propulsion");
    }
  }
  // A cyborg body PIE already supplies its legs; the weapon mount supplies its torso.
  for (const [slot, id] of (template.weapons ?? []).entries()) {
    const weapon = catalog.weapons[id];
    if (!weapon) throw new Error(`Unknown gun ${id}.`);
    add("mount", weapon.mountModel, "components/weapons/", `${weapon.name ?? id} mount`, slot);
    // Bomb bays can intentionally have a mount without a separate gun mesh.
    add("weapon", weapon.model, "components/weapons/", weapon.name ?? id, slot);
  }
  return specs;
}

function connector(model, index) {
  const point = model?.levels?.[0]?.connectors?.[index];
  return point ? new Vector3(point.x, point.z, point.y) : new Vector3();
}

export function assemblyPartTransform(part, assembly) {
  const rotationZ = part.rotationZ ?? 0;
  const position = new Vector3();
  if (["mount", "weapon"].includes(part.role)) {
    const body = assembly.find((item) => item.role === "body");
    position.copy(connector(body?.model, part.connectorIndex ?? part.slot ?? 0));
    if (part.role === "weapon") {
      const mount = assembly.find((item) => item.role === "mount" && (item.slot ?? 0) === (part.slot ?? 0));
      position.add(connector(mount?.model, 0).applyAxisAngle(new Vector3(0, 0, 1), rotationZ));
    }
  }
  return { position, rotationZ };
}
