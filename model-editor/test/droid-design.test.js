import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { parsePie } from "../src/pie-format.js";
import { selectableBodies, compatiblePropulsions, compatibleWeapons, reconcileDesign, validateDesign, modulePartSpecs, assemblyPartTransform } from "../src/droid-design.js";

const root = new URL("../../mapmaker/pies/", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const catalog = { bodies: read("components/bodies/body.json"), propulsions: read("components/prop/propulsion.json"), weapons: read("components/weapons/weapons.json") };
const resolve = (name, prefix = "") => {
  const file = name.toLowerCase();
  return [prefix + file, file].find((path) => existsSync(new URL(path, root))) ?? null;
};
const design = (body = "Body1REC", propulsion = "wheeled01", weapons = ["MG1Mk1"]) => ({ body, propulsion, weapons });

test("component options separate vehicles, VTOLs, cyborgs and super cyborgs", () => {
  assert.equal(selectableBodies(catalog).length, 16);
  assert.equal(compatiblePropulsions("Body1REC", catalog).length, 6);
  assert.deepEqual(compatiblePropulsions("CyborgHeavyBody", catalog).map((item) => item.id), ["CyborgLegs"]);
  assert.equal(compatibleWeapons("Body1REC", "wheeled01", catalog).length, 52);
  assert.equal(compatibleWeapons("Body1REC", "V-Tol", catalog).length, 27);
  assert.equal(compatibleWeapons("CyborgLightBody", "CyborgLegs", catalog).length, 10);
  assert.equal(compatibleWeapons("CyborgHeavyBody", "CyborgLegs", catalog).length, 7);
  assert.deepEqual(compatibleWeapons("CyborgHeavyBody", "wheeled01", catalog), []);
  assert.ok(!selectableBodies(catalog).some((body) => ["ScavTruckBody", "TransporterBody", "ZNULLBODY"].includes(body.id)));
  assert.ok(!compatiblePropulsions("Body1REC", catalog).some((prop) => prop.id === "Helicopter"));
  assert.ok(compatibleWeapons("Body1REC", "wheeled01", catalog).some((weapon) => weapon.id === "AAGun2Mk1"), "AA targeting does not mean the gun is mounted on an aircraft");
});

test("changing families selects compatible components and respects Dragon's optional second slot", () => {
  const air = reconcileDesign(design("Body1REC", "V-Tol"), catalog);
  assert.equal(air.weapons[0], "MG1-VTOL"); validateDesign(air, catalog);
  const cyborg = reconcileDesign(design("CyborgLightBody", "V-Tol", air.weapons), catalog);
  assert.equal(cyborg.propulsion, "CyborgLegs"); assert.equal(cyborg.weapons[0], "CyborgChaingun");
  const superCyborg = reconcileDesign({ ...cyborg, body: "CyborgHeavyBody" }, catalog);
  assert.equal(catalog.weapons[superCyborg.weapons[0]].usageClass, "SuperCyborg");
  validateDesign(design("Body14SUP", "tracked01", ["MG1Mk1", "Cannon1Mk1"]), catalog);
  assert.throws(() => validateDesign(design("Body1REC", "wheeled01", ["MG1Mk1", "Cannon1Mk1"]), catalog), /slot/);
  assert.equal(reconcileDesign(design("Body1REC", "wheeled01", ["MG1Mk1", "Cannon1Mk1"]), catalog).weapons.length, 1);
  for (const invalid of [design("Body1REC", "V-Tol"), design("Body1REC", "tracked01", ["Bomb1-VTOL-LtHE"]), design("CyborgLightBody", "CyborgLegs", ["Cyb-Hvywpn-HPV"]), design("Body1REC", "wheeled01", ["MG1Mk1", ""]), design("ZNULLBODY")]) {
    assert.throws(() => validateDesign(invalid, catalog));
  }
});

test("honors explicit weaponSize without restricting by weight or names; rejects indirect aircraft guns", () => {
  const data = structuredClone(catalog);
  data.weapons.MG1Mk1.weaponSize = 0;
  data.weapons.Cannon375mmMk1.weaponSize = 1;
  data.weapons.MG3Mk1.weight = 1e10;
  const light = compatibleWeapons("Body1REC", "wheeled01", data).map((item) => item.id);
  const heavy = compatibleWeapons("Body11ABT", "wheeled01", data).map((item) => item.id);
  assert.ok(light.includes("MG1Mk1") && light.includes("MG3Mk1") && !light.includes("Cannon375mmMk1"));
  assert.ok(!heavy.includes("MG1Mk1") && heavy.includes("Cannon375mmMk1"));
  data.weapons["MG1-VTOL"].movement = "INDIRECT";
  assert.ok(!compatibleWeapons("Body1REC", "V-Tol", data).some((weapon) => weapon.id === "MG1-VTOL"));
});

test("every stock single-gun combination and all existing armed presets resolve their models", () => {
  let count = 0;
  for (const body of selectableBodies(catalog)) for (const prop of compatiblePropulsions(body.id, catalog)) {
    for (const weapon of compatibleWeapons(body.id, prop.id, catalog)) {
      const value = design(body.id, prop.id, [weapon.id]); validateDesign(value, catalog);
      const parts = modulePartSpecs(value, catalog, resolve);
      assert.ok(parts.some((part) => part.role === "body"));
      assert.ok(parts.every((part) => existsSync(new URL(part.path, root)))); count++;
    }
  }
  assert.equal(count, 4035);
  for (const preset of Object.values(read("components/templates.json")).filter((item) => item.body && item.propulsion && item.weapons?.length)) {
    assert.ok(modulePartSpecs(preset, catalog, resolve).length > 0, preset.id);
  }
});

test("uses combined stock propulsion meshes, explicit legacy sides, and cyborg native legs", () => {
  const parts = modulePartSpecs(design(), catalog, resolve);
  assert.deepEqual(parts.filter((part) => part.role === "propulsion").map((part) => part.path), ["components/prop/prlwhl1.pie"]);
  const heavy = modulePartSpecs(design("Body14SUP", "tracked01"), catalog, resolve);
  assert.equal(heavy.find((part) => part.role === "propulsion").path, "components/prop/prstrk4.pie");
  const data = structuredClone(catalog);
  data.bodies.Body1REC.propulsionExtraModels.wheeled01.right = "prlrwhl1.pie";
  assert.equal(modulePartSpecs(design(), data, resolve).filter((part) => part.role === "propulsion").length, 2);
  for (const [body, weapon] of [["CyborgLightBody", "CyborgChaingun"], ["CyborgHeavyBody", "Cyb-Hvywpn-HPV"]]) {
    const cyborg = modulePartSpecs(design(body, "CyborgLegs", [weapon]), catalog, resolve);
    assert.equal(cyborg.length, 3); assert.ok(!cyborg.some((part) => part.role === "propulsion"));
  }
  const bomb = design("Body1REC", "V-Tol", ["Bomb1-VTOL-LtHE"]);
  validateDesign(bomb, catalog);
  assert.ok(modulePartSpecs(bomb, catalog, resolve).some((part) => part.role === "mount"));
  assert.ok(!modulePartSpecs(bomb, catalog, resolve).some((part) => part.role === "weapon"));
  assert.throws(() => modulePartSpecs(design(), catalog, () => null), /unavailable/);
});

test("aircraft use underside connectors and rotate both mounts and gun offsets", () => {
  const parts = modulePartSpecs(design("Body14SUP", "V-Tol", ["MG1-VTOL", "MG2-VTOL"]), catalog, resolve)
    .map((part) => ({ ...part, model: parsePie(readFileSync(new URL(part.path, root), "utf8")) }));
  const body = parts.find((part) => part.role === "body");
  for (const slot of [0, 1]) {
    const mount = parts.find((part) => part.role === "mount" && part.slot === slot);
    const gun = parts.find((part) => part.role === "weapon" && part.slot === slot);
    const anchor = body.model.levels[0].connectors[5 + slot];
    const mountConnector = mount.model.levels[0].connectors[0];
    const mountTransform = assemblyPartTransform(mount, parts), gunTransform = assemblyPartTransform(gun, parts);
    assert.equal(mountTransform.rotationZ, Math.PI); assert.equal(gunTransform.rotationZ, Math.PI);
    assert.deepEqual(mountTransform.position.toArray(), [anchor.x, anchor.z, anchor.y]);
    if (mountConnector) {
      assert.ok(Math.abs(gunTransform.position.x - (anchor.x - mountConnector.x)) < 1e-6);
      assert.ok(Math.abs(gunTransform.position.y - (anchor.z - mountConnector.z)) < 1e-6);
      assert.ok(Math.abs(gunTransform.position.z - (anchor.y + mountConnector.y)) < 1e-6);
    }
  }
});
