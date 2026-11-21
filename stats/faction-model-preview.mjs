import * as THREE from '../mapmaker/js/three.module.js';
import {buildDroidGroup} from '../mapmaker/js/droidGroup.js';
import {drawSoftwareUnit} from '../mapmaker/js/softwareUnitPreview.js';

const partsByFaction = {
  project: ['blbpower.pie', 'blpower0.pie'],
  collective: [{path: 'trmacan.pie', role: 'body'}, {path: 'gnmacan.pie', role: 'weapon'}],
  nexus: ['blbcfact.pie', 'blcfact1.pie']
};

export async function mountFactionModel(preview) {
  const parts = partsByFaction[preview.dataset.factionModel];
  if (!parts) throw Error('Unknown faction model');
  window.PIES_BASE = new URL('../mapmaker/pies/', import.meta.url).href;
  window.TEX_BASE = new URL('../mapmaker/classic/texpages/texpages/', import.meta.url).href;
  const model = await buildDroidGroup(parts);
  if (model.children.length !== parts.length) throw Error('Missing model geometry');

  const pivot = new THREE.Group();
  const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  model.position.sub(center);
  pivot.add(model);

  const canvas = preview.querySelector('.model-stage');
  const redraw = () => {
    if (preview.open && canvas.clientWidth) drawSoftwareUnit(pivot, canvas);
  };
  canvas.hidden = false;
  try { redraw(); }
  catch (error) {
    canvas.hidden = true;
    throw error;
  }
  preview.querySelector('.model-status').hidden = true;
  preview.querySelector('.model-controls').hidden = false;
  for (const control of preview.querySelectorAll('[data-turn]')) {
    control.addEventListener('click', () => {
      pivot.rotation.y += Number(control.dataset.turn) * Math.PI / 4;
      redraw();
    });
  }
  new ResizeObserver(redraw).observe(canvas);
  preview.addEventListener('toggle', redraw);
  // Textures may arrive after the geometry. Refresh once after the first draw.
  setTimeout(redraw, 500);
}
