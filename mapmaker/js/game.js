import * as THREE from './three.module.js';

function normalizeTexPath(name){
  let n = String(name || '').replace(/\\/g,'/').toLowerCase();
  n = n.replace(/^\.+\//, '');
  n = n.replace(/^(images|texpages)\//, '');
  n = n.replace(/^classic\/texpages\//, '');
  n = n.replace(/texpages\/texpages\//g, 'texpages/');
  return n;
}

let showPanelIdsCheckbox;
import { TILESETS, getTileCount, loadAllTiles, clearTileCache } from './tileset.js';
import { loadMapUnified, getTilesetIndexFromTtp } from './maploader.js';
import { convertGammaGameMapToClassic, parseTTypes } from './convert.js';
import { cameraState, resetCameraTarget, setupKeyboard } from './camera.js';
import { parsePie, loadPieGeometry } from "./pie.js";
import { buildStructureGroup, setStructureGroupPlayerColor } from "./structureGroup.js?v=wall-live-refresh";
import { STRUCTURE_TURRETS } from "./structure_turrets.js";
import { loadSensorDefs, getSensorModels } from "./sensors.js";
import { buildDroidGroup, updateDroidAnimations } from "./droidGroup.js";

let bodyDefs, propDefs, weaponDefs, templateDefs, constructionDefs, repairDefs, droidSensorDefs, brainDefs, ecmDefs;
const CUSTOM_DROID_TEMPLATE_ID = 'CustomDroid';
const DROID_BUILD_TEMPLATES = [
  { id: 'ConstructionDroid', name: 'Truck', body: 'Body1REC', propulsion: 'wheeled01', construct: 'Spade1Mk1' },
  { id: 'ViperMG01Wheels', name: 'Machinegun Viper Wheels', body: 'Body1REC', propulsion: 'wheeled01', weapons: ['MG1Mk1'] },
  { id: 'ViperLtCannonWheels', name: 'Light Cannon Viper Wheels', body: 'Body1REC', propulsion: 'wheeled01', weapons: ['Cannon1Mk1'] },
  { id: 'ViperPODWheels', name: 'Mini-Rocket Pod Viper Wheels', body: 'Body1REC', propulsion: 'wheeled01', weapons: ['Rocket-Pod'] },
  { id: 'A-Cobra-Wheels-HMG', name: 'Heavy Machinegun Cobra Wheels', body: 'Body5REC', propulsion: 'wheeled01', weapons: ['MG3Mk1'] },
  { id: 'A-Cobra-Trk-MC', name: 'Medium Cannon Cobra Tracks', body: 'Body5REC', propulsion: 'tracked01', weapons: ['Cannon2A-TMk1'] }
];
const STRUCTURE_ECM_MODELS = {
  RepairCentre: ['gnhrepar.pie']
};
const SCAVENGER_DROID_TEMPLATES = [
  { id: 'BaBaPeople', name: 'Scavenger', body: 'B1BaBaPerson01', propulsion: 'BaBaLegs', weapons: ['BaBaMG'] },
  { id: 'BabaJeep', name: 'Scavenger Jeep', body: 'B2JeepBody', propulsion: 'BaBaProp', weapons: ['BJeepMG'] },
  { id: 'BabaRKJeep', name: 'Scavenger Rocket Jeep', body: 'B2RKJeepBody', propulsion: 'BaBaProp', weapons: ['BabaRocket'] },
  { id: 'BarbarianBuggy', name: 'Scavenger Buggy', body: 'B3body-sml-buggy01', propulsion: 'BaBaProp', weapons: ['BuggyMG'] },
  { id: 'BarbarianTrike', name: 'Scavenger Trike', body: 'B4body-sml-trike01', propulsion: 'BaBaProp', weapons: ['bTrikeMG'] },
  { id: 'BabaBusCan', name: 'Scavenger Bus Cannon', body: 'BusBody', propulsion: 'BaBaProp', weapons: ['BusCannon'] }
];
const SCAVENGER_BODY_IDS = new Set(SCAVENGER_DROID_TEMPLATES.map(item => item.body));
const SCAVENGER_PROPULSION_IDS = new Set(SCAVENGER_DROID_TEMPLATES.map(item => item.propulsion));
const SCAVENGER_WEAPON_IDS = new Set(SCAVENGER_DROID_TEMPLATES.flatMap(item => item.weapons || item.weapon || []));
async function loadComponentDefs() {
  if (bodyDefs && propDefs && weaponDefs && templateDefs && constructionDefs && repairDefs && droidSensorDefs && brainDefs && ecmDefs) return;
  const base = (typeof window !== 'undefined' && window.PIES_BASE) ? window.PIES_BASE : 'pies/';
  [bodyDefs, propDefs, weaponDefs, templateDefs, constructionDefs, repairDefs, droidSensorDefs, brainDefs, ecmDefs] = await Promise.all([
    fetch(base + 'components/bodies/body.json').then(r => r.json()).catch(() => ({})),
    fetch(base + 'components/prop/propulsion.json').then(r => r.json()).catch(() => ({})),
    fetch(base + 'components/weapons/weapons.json').then(r => r.json()).catch(() => ({})),
    fetch(base + 'components/templates.json').then(r => r.json()).catch(() => ({})),
    fetch(base + 'components/construction.json').then(r => r.json()).catch(() => ({})),
    fetch(base + 'components/repair.json').then(r => r.json()).catch(() => ({})),
    fetch(base + 'components/sensor.json').then(r => r.json()).catch(() => ({})),
    fetch(base + 'components/brain.json').then(r => r.json()).catch(() => ({})),
    fetch(base + 'components/ecm.json').then(r => r.json()).catch(() => ({}))
  ]);
}

const tilesetSelect = document.getElementById('tilesetSelect');
const fileListDiv = document.getElementById('fileList');
const infoDiv = document.getElementById('info');
const compass = document.getElementById('compass');
const compassNeedle = document.getElementById('compassNeedle');
const mapFilenameSpan = document.getElementById('mapFilename');
const fileMapNameInput = document.getElementById('fileMapNameInput');
const localAutosaveToggle = document.getElementById('localAutosaveToggle');
const settingsMapNameInput = document.getElementById('settingsMapNameInput');
const settingsMapAuthorInput = document.getElementById('settingsMapAuthorInput');
const settingsMapCreatedInput = document.getElementById('settingsMapCreatedInput');
const settingsMapTypeInput = document.getElementById('settingsMapTypeInput');
const settingsMapDescriptionInput = document.getElementById('settingsMapDescriptionInput');
const settingsMapScavengersInput = document.getElementById('settingsMapScavengersInput');
const settingsMapSlotsInput = document.getElementById('settingsMapSlotsInput');
const settingsMapUploadedInput = document.getElementById('settingsMapUploadedInput');
const settingsMapVersionInput = document.getElementById('settingsMapVersionInput');
const settingsMapTagsInput = document.getElementById('settingsMapTagsInput');
const settingsMapLicenseInput = document.getElementById('settingsMapLicenseInput');
const settingsMapSourceInput = document.getElementById('settingsMapSourceInput');
const settingsMyAuthorInput = document.getElementById('settingsMyAuthorInput');
const settingsMyLicenseInput = document.getElementById('settingsMyLicenseInput');
const settingsMySourceInput = document.getElementById('settingsMySourceInput');
const minimapVisibilityToggle = document.getElementById('minimapVisibilityToggle');
const compassVisibilityToggle = document.getElementById('compassVisibilityToggle');
const buildPreviewVisibilityToggle = document.getElementById('buildPreviewVisibilityToggle');
const tileGridVisibilityToggle = document.getElementById('tileGridVisibilityToggle');
const previewQualitySelect = document.getElementById('previewQualitySelect');
const tileQualitySelect = document.getElementById('tileQualitySelect');
const mapBrightnessInput = document.getElementById('mapBrightnessInput');
const mapBrightnessSlider = document.getElementById('mapBrightnessSlider');
const cameraSpeedInput = document.getElementById('cameraSpeedInput');
const cameraSpeedSlider = document.getElementById('cameraSpeedSlider');
const zoomSpeedInput = document.getElementById('zoomSpeedInput');
const zoomSpeedSlider = document.getElementById('zoomSpeedSlider');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
const localSaveSelect = document.getElementById('localSaveSelect');
const localSaveLoadBtn = document.getElementById('localSaveLoadBtn');
const localSaveDeleteBtn = document.getElementById('localSaveDeleteBtn');
const localSaveStatus = document.getElementById('localSaveStatus');
const overlayLocalSaveBox = document.getElementById('overlayLocalSaveBox');
const overlayLocalSaveSelect = document.getElementById('overlayLocalSaveSelect');
const overlayLocalSaveBtn = document.getElementById('overlayLocalSaveBtn');
const uiBar = document.getElementById('uiBar');
const threeContainer = document.getElementById('threeContainer');
const minimapPanel = document.getElementById('minimapPanel');
const minimapCanvas = document.getElementById('minimapCanvas');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingDetail = document.getElementById('loadingDetail');
const loadingBarInner = document.getElementById('loadingBarInner');
const loadingPercent = document.getElementById('loadingPercent');
const saveResultOverlay = document.getElementById('saveResultOverlay');
const saveResultFilename = document.getElementById('saveResultFilename');
const saveResultDetails = document.getElementById('saveResultDetails');
const saveResultLocation = document.getElementById('saveResultLocation');
const saveResultCloseBtn = document.getElementById('saveResultCloseBtn');
const validationOverlay = document.getElementById('validationOverlay');
const validationSummary = document.getElementById('validationSummary');
const validationList = document.getElementById('validationList');
const validationCancelBtn = document.getElementById('validationCancelBtn');
const validationContinueBtn = document.getElementById('validationContinueBtn');
const templateNameBackdrop = document.getElementById('templateNameBackdrop');
const templateNameDialog = document.getElementById('templateNameDialog');
const templateNameInput = document.getElementById('templateNameInput');
const templateNameCreateBtn = document.getElementById('templateNameCreateBtn');
const templateNameCancelBtn = document.getElementById('templateNameCancelBtn');
const serverMapLicenseBackdrop = document.getElementById('serverMapLicenseBackdrop');
const serverMapLicenseDialog = document.getElementById('serverMapLicenseDialog');
const serverMapLicenseBody = document.getElementById('serverMapLicenseBody');
const serverMapLicenseOkBtn = document.getElementById('serverMapLicenseOkBtn');
const licenseHelpBtn = document.getElementById('licenseHelpBtn');
const licenseHelpBackdrop = document.getElementById('licenseHelpBackdrop');
const licenseHelpDialog = document.getElementById('licenseHelpDialog');
const licenseHelpBody = document.getElementById('licenseHelpBody');
const licenseHelpOkBtn = document.getElementById('licenseHelpOkBtn');
const overlayMsg = document.getElementById('overlayMsg');
const overlayText = document.getElementById('overlayText');
function setLoadingProgress(detail, percent) {
  const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
  document.body.classList.add('loading-map');
  if (overlayMsg) {
    overlayMsg.classList.add('hidden');
    overlayMsg.style.display = 'none';
    overlayMsg.style.pointerEvents = 'none';
  }
  if (fileListDiv) fileListDiv.classList.add('hidden');
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.remove('overlay-open');
  }
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');
  if (loadingDetail) loadingDetail.textContent = detail || 'Loading...';
  if (loadingBarInner) loadingBarInner.style.width = pct + '%';
  if (loadingPercent) loadingPercent.textContent = pct + '%';
  if (pct >= 100 && String(detail || '').toLowerCase().startsWith('failed')) {
    document.body.classList.remove('loading-map');
  }
  setFileStatus((detail || 'Loading...') + ' ' + pct + '%');
}
function hideLoadingProgress() {
  if (loadingOverlay) loadingOverlay.classList.add('hidden');
  document.body.classList.remove('loading-map');
}
function waitForUiPaint() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}
function appendSaveResultDetail(label, value) {
  if (!saveResultDetails || value === undefined || value === null || value === '') return;
  const labelEl = document.createElement('div');
  labelEl.className = 'save-result-label';
  labelEl.textContent = label + ':';
  const valueEl = document.createElement('div');
  valueEl.className = 'save-result-value';
  valueEl.textContent = String(value);
  saveResultDetails.append(labelEl, valueEl);
}

function showSaveResult(savedName, mode, extraNote = '', details = null, title = 'Map saved') {
  if (!saveResultOverlay) return;
  const titleEl = document.getElementById('saveResultTitle');
  if (titleEl) titleEl.textContent = title;
  if (saveResultFilename) saveResultFilename.textContent = savedName || 'Map file';
  if (saveResultDetails) {
    saveResultDetails.innerHTML = '';
    if (details) {
      [
        ['Map', details.mapName],
        ['Author', details.author],
        ['License', details.license],
        ['Source', details.source],
        ['Created', details.created],
        ['Uploaded', details.uploaded],
        ['Version', details.version],
        ['Map type', details.mapType],
        ['Description', details.description],
        ['Scavengers', details.scavengers],
        ['Tags', details.tags],
        ['Tileset', details.tileset],
        ['Size', details.size],
        ['Players', details.players],
        ['Objects', details.objects],
        ['Oil by player', details.oilByPlayer],
        ['Balance', details.balance],
        ['HQ positions', details.hqPositions],
        ['File size', details.fileSize],
        ['SHA-256', details.sha256],
        [details.timeLabel || 'Saved', details.savedAt],
        ['Made with', details.madeWith]
      ].forEach(([label, value]) => appendSaveResultDetail(label, value));
      if (details.playerSummary) {
        const summary = document.createElement('div');
        summary.id = 'saveResultPlayerSummary';
        summary.textContent = details.playerSummary;
        saveResultDetails.appendChild(summary);
      }
    }
  }
  if (saveResultLocation) {
    const locationText = mode === 'loaded'
      ? 'Loaded from the map file you selected.'
      : mode === 'picker'
      ? 'Saved to the folder you selected in the Save As window.'
      : 'Saved by the browser to your Downloads folder. Browsers do not let websites read the exact folder path.';
    saveResultLocation.textContent = extraNote ? locationText + ' ' + extraNote : locationText;
  }
  saveResultOverlay.classList.remove('hidden');
}
function hideSaveResult() {
  if (saveResultOverlay) saveResultOverlay.classList.add('hidden');
}
function setOverlayText(msg){
  if (overlayText) { overlayText.textContent = msg; }
  else if (overlayMsg) { overlayMsg.textContent = msg; }
}
function showOverlay(msg){
  if (typeof msg === 'string' && msg.length > 0) {
    setOverlayText(msg);
    if (overlayText) overlayText.style.display = 'block';
  } else {
    if (overlayText) overlayText.style.display = 'none';
  }
  if (overlayMsg) {
    overlayMsg.style.display = 'flex';
    overlayMsg.style.pointerEvents = 'auto';
  }
}
window.showOverlay = showOverlay;
function hideOverlay(){
  if (overlayMsg) overlayMsg.style.display = 'none';
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.remove('overlay-open');
  }
  if (typeof window !== 'undefined' && window.UI && typeof window.UI.showTopBar === 'function') {
    window.UI.showTopBar(true);
  }
}
window.hideOverlay = hideOverlay;

// ---- Configurable assets base paths (root defaults) ----
if (typeof window !== 'undefined') {
  if (typeof window.STRUCTURES_JSON === 'undefined') window.STRUCTURES_JSON = 'structure.json';
  if (typeof window.FEATURES_JSON === 'undefined') window.FEATURES_JSON = 'features.json';
  if (typeof window.SENSORS_JSON === 'undefined') window.SENSORS_JSON = 'sensor.json';
  if (typeof window.PIES_BASE === 'undefined') window.PIES_BASE = 'pies/';
  if (typeof window.TEX_BASE === 'undefined') window.TEX_BASE = 'classic/texpages/texpages/';
}

// Extend tileset codes to support Gamma maps (0x0300)
export const TTP_TILESET_MAP = {
  0x0100: 0, // Arizona
  0x0200: 1, // Urban
  0x0000: 2, // Rockies
  0x0300: 3  // Gamma
};

const showTileIdCheckbox = document.getElementById('showTileId');
const showHeightBtn = document.getElementById('showHeightBtn');
let showHeight = false;
if (showHeightBtn) {
  showHeightBtn.addEventListener('click', () => {
    showHeight = !showHeight;
    showHeightBtn.classList.toggle('active', showHeight);
    drawMap3D();
  });
}

// Tile types on 3D map toggle
const showTileTypesOnMapCheckbox = document.getElementById('showTileTypesOnMap');
const showTileTypesCheckbox = document.getElementById('displayTileTypes');
const showTileInfoCheckbox = document.getElementById('showTileInfo');
const tileInfoButtonsDiv = document.getElementById('tileInfoButtons');
const tileOptionsBox = document.getElementById('tileOptions');
const tileShowBtn = document.getElementById('tileShowBtn');

showPanelIdsCheckbox = document.getElementById('showPanelIds');
if (showPanelIdsCheckbox) {
  showPanelIdsCheckbox.addEventListener('change', () => {
    if (typeof renderTexturePalette === 'function') renderTexturePalette();
  });
}

let scene, camera, renderer, mesh;
let tileImages = [];
let tileTypesById = [];
const DEFAULT_TILE_TYPES_BY_TILESET = [
  // Official Warzone2100 data/base/tileset/tileTypes.json: Arizona.
  [1, 0, 2, 2, 0, 2, 2, 2, 2, 1, 1, 1, 0, 7, 7, 7, 7, 7, 8, 6, 4, 4, 6, 3, 3, 3, 2, 4, 1, 4, 7, 7, 7, 7, 4, 4, 2, 2, 2, 2, 1, 4, 0, 4, 4, 8, 8, 2, 4, 4, 4, 4, 4, 4, 4, 9, 9, 6, 9, 6, 4, 4, 9, 9, 9, 9, 9, 9, 9, 9, 9, 8, 4, 4, 4, 8, 5, 6, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0],
  // Official Warzone2100 data/base/tileset/tileTypes.json: Urban.
  [2, 2, 2, 2, 1, 2, 2, 1, 1, 1, 1, 1, 1, 7, 7, 7, 7, 7, 1, 8, 4, 4, 0, 7, 7, 7, 7, 4, 4, 2, 4, 0, 2, 0, 0, 2, 4, 4, 0, 4, 6, 2, 6, 6, 6, 6, 6, 6, 4, 6, 3, 4, 4, 2, 2, 9, 9, 9, 2, 4, 2, 4, 9, 9, 9, 9, 9, 8, 8, 8, 8, 4, 2, 0, 4, 4, 2, 2, 2, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0],
  // Official Warzone2100 data/base/tileset/tileTypes.json: Rockies.
  [0, 0, 2, 2, 2, 2, 2, 2, 1, 8, 11, 2, 11, 6, 7, 7, 7, 7, 8, 6, 1, 2, 6, 11, 11, 0, 11, 1, 1, 8, 8, 7, 7, 7, 0, 0, 1, 6, 0, 4, 5, 11, 8, 5, 8, 8, 8, 11, 11, 1, 1, 1, 1, 1, 8, 9, 9, 5, 2, 6, 6, 8, 9, 8, 10, 10, 11, 11, 8, 8, 10, 8, 1, 10, 0, 10, 8, 8, 8, 6, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0]
];
let selectedTileId = 0;
let selectedRotation = 0;
let selectedXFlip = false;
const TILE_TYPE_COLORS = [
  '#ff0','#0f0','#f00','#00f','#f0f','#0ff','#fff','#000','#888','#ffa500','#8a2be2','#00ced1'
];
const TILE_TYPE_WATER = 7;
const TILESET_WATER_FILL = ['#1b526b', '#1d4f68', '#1b526b'];
const SMART_WATER_TILE_HINTS = [
  {
    // Arizona water edges/corners seen in official community map files.
    '0000': { tile: 17, rot: 0 },
    '1111': { tile: 17, rot: 0 },
    '0111': { tile: 14, rot: 0 },
    '1110': { tile: 14, rot: 3 },
    '1011': { tile: 14, rot: 1 },
    '1101': { tile: 14, rot: 2 },
    '0110': { tile: 16, rot: 0 },
    '1100': { tile: 16, rot: 3 },
    '0011': { tile: 16, rot: 1 },
    '1001': { tile: 16, rot: 2 }
  },
  {},
  {
    // Rockies has its own water cliff set.
    '0000': { tile: 17, rot: 0 },
    '1111': { tile: 17, rot: 0 },
    '0111': { tile: 31, rot: 0 },
    '1110': { tile: 31, rot: 3 },
    '1011': { tile: 31, rot: 1 },
    '1101': { tile: 31, rot: 2 },
    '0110': { tile: 33, rot: 0 },
    '1100': { tile: 33, rot: 3 },
    '0011': { tile: 33, rot: 1 },
    '1001': { tile: 33, rot: 2 }
  }
];
const TILE_SELECTION_OUTLINE = '2px solid #6CF527';
const TILE_ICON_SIZE = 41;
const TILE_EDGE_DIRS = [
  { name: 'N', x: 0, y: -1 },
  { name: 'E', x: 1, y: 0 },
  { name: 'S', x: 0, y: 1 },
  { name: 'W', x: -1, y: 0 }
];
const TILE_RELATIONSHIP_FILES = ['data/arizona-tiles.json', 'data/urban-tiles.json', null];
const TILE_PIECE_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
const TILE_DIRECTION_EDGE_KEYS = ['N', 'E', 'S', 'W'];
const TILE_EDGE_PIECES = {
  N: ['topLeft', 'topRight'],
  E: ['topRight', 'bottomRight'],
  S: ['bottomLeft', 'bottomRight'],
  W: ['topLeft', 'bottomLeft']
};
const TILE_OPPOSITE_EDGE_PIECES = {
  N: ['bottomLeft', 'bottomRight'],
  E: ['topLeft', 'bottomLeft'],
  S: ['topLeft', 'topRight'],
  W: ['topRight', 'bottomRight']
};
const TILE_OPPOSITE_DIRECTION_EDGES = {
  N: 'S',
  E: 'W',
  S: 'N',
  W: 'E'
};
const TILE_ROAD_FAMILIES = ['a_roads', 'b_roads'];
const SMART_TILE_PRESETS = [
  { key: 'sand', tiles: [12] },
  { key: 'sand_grass', tiles: [0, 9, 11] },
  { key: 'baked_sand', tiles: [5, 6, 7, 8] },
  { key: 'red_sand', tiles: [44, 48, 53, 54] },
  { key: 'plates', tiles: [22] },
  { key: 'grass', tiles: [23] }
];
const tileRelationshipCache = new Map();
let activeTileRelationshipData = null;
let activeTileRelationshipsById = [];
let animationId = null;
const PLAYER_COLORS = [
  0xff0000, 0x0000ff, 0x00ff00, 0xffff00, 0xff00ff,
  0x00ffff, 0xffffff, 0x888888, 0xff8800, 0x0088ff
];

function getDefaultTileTypesForTileset(idx, count = tileImages.length) {
  const defaults = DEFAULT_TILE_TYPES_BY_TILESET[Math.max(0, Math.min(DEFAULT_TILE_TYPES_BY_TILESET.length - 1, idx | 0))] || [];
  const total = Math.max(0, count | 0);
  const types = defaults.slice(0, total);
  while (types.length < total) types.push(0);
  return types;
}
if (showTileInfoCheckbox && tileInfoButtonsDiv) {
  const updateTileInfoVisibility = () => {
    const visible = showTileInfoCheckbox.checked;
    tileInfoButtonsDiv.style.display = visible ? 'grid' : 'none';
    if (tileOptionsBox) tileOptionsBox.style.display = visible ? 'block' : 'none';

    const typeToggle = document.getElementById('displayTileTypes');
    const tileIdLabel = document.querySelector('label[for="showPanelIds"]');
    const typeLabel = document.querySelector('label[for="displayTileTypes"]');

    if (showPanelIdsCheckbox) showPanelIdsCheckbox.style.display = visible ? '' : 'none';
    if (tileIdLabel) tileIdLabel.style.display = visible ? '' : 'none';
    if (typeToggle) typeToggle.style.display = visible ? '' : 'none';
    if (typeLabel) typeLabel.style.display = visible ? '' : 'none';

    if (tileShowBtn) tileShowBtn.classList.toggle('active', visible);

    if (scene && typeof drawMap3D === 'function') drawMap3D();
    if (typeof renderTexturePalette === 'function') renderTexturePalette();
  };
  showTileInfoCheckbox.addEventListener('change', updateTileInfoVisibility);
  updateTileInfoVisibility();
}
let STRUCTURE_DEFS = [];
let FEATURE_DEFS = [];
let selectedStructureIndex = -1;
let selectedFeatureIndex = -1;
let objectsGroup = new THREE.Group();
let selectedStructureRotation = 0;
let selectedFeatureRotation = 0;
let structureMode = 'view';
let featureMode = 'view';
let droidMode = 'view';
let selectedDroidRotation = 0;
let selectedTemplateRotation = 0;
let copiedSelectionPlacementPlayer = 0;
let copiedSelectionPlacementRotation = 0;
let copiedTileTemplate = null;
let tileTemplatePasteArmed = false;
let copiedTileTemplateVersion = 0;
let selectedDroidGroup = null;
let selectedDroidBlinkHelper = null;
let selectedDroidBlinkTimer = null;
let hoveredDroidGroup = null;
let hoveredDroidHelper = null;
let selectedStructureGroup = null;
let selectedStructureLayer = 'structure';
let selectedStructureBlinkHelper = null;
let selectedStructureBlinkTimer = null;
let hoveredStructureGroup = null;
let hoveredStructureHelper = null;
let copiedMapObject = null;
let copiedMapObjectPasteArmed = false;
let copiedMapObjectVersion = 0;
let suppressNextMapContextMenu = false;
let previewScene = null;
let previewCamera = null;
let previewRenderer = null;
let previewMesh = null;
let previewLoadToken = 0;
let featurePreviewScene = null;
let featurePreviewCamera = null;
let featurePreviewRenderer = null;
let featurePreviewMesh = null;
let featurePreviewLoadToken = 0;
let droidPreviewScene = null;
let droidPreviewCamera = null;
let droidPreviewRenderer = null;
let droidPreviewMesh = null;
let droidPreviewLoadToken = 0;
let highlightLoadToken = 0;
let viewAreaDrag = null;
let viewAreaOverlay = null;
let viewBulkSelection = [];
let viewBulkSelectionHelpers = [];
let viewBulkSelectionArea = null;
let tileGridGroup = null;

function disposeObject3D(obj) {
  obj.traverse(child => {
    if (!child.isMesh && !child.isLine && !child.isLineSegments) return;
    if (child.geometry && typeof child.geometry.dispose === 'function') child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach(mat => {
      if (!mat) return;
      if (mat.map && typeof mat.map.dispose === 'function') mat.map.dispose();
      if (typeof mat.dispose === 'function') mat.dispose();
    });
  });
}

function clearMapObjects() {
  if (!objectsGroup) return;
  clearViewBulkSelection();
  clearSelectedStructure();
  clearHoveredStructure();
  clearSelectedDroid();
  clearHoveredDroid();
  for (let i = objectsGroup.children.length - 1; i >= 0; i--) {
    const obj = objectsGroup.children[i];
    disposeObject3D(obj);
    objectsGroup.remove(obj);
  }
}

function clearStructurePlacementPreview() {
  highlightLoadToken++;
  highlightCachedKey = null;
  highlightLoadingKey = null;
  highlightCachedId = null;
  highlightCachedRot = null;
  highlightPreviewTarget = null;
  highlightLoadingId = null;
  highlightLoadingRot = null;
  if (highlightMesh) {
    if (scene) scene.remove(highlightMesh);
    if (highlightMesh.geometry) highlightMesh.geometry.dispose();
    if (highlightMesh.material) highlightMesh.material.dispose();
    highlightMesh = null;
  }
  if (previewGroup) {
    disposeObject3D(previewGroup);
    if (scene) scene.remove(previewGroup);
    previewGroup = null;
  }
  if (highlightModelGroup) {
    disposeObject3D(highlightModelGroup);
    if (scene) scene.remove(highlightModelGroup);
    highlightModelGroup = null;
  }
  highlightModelKey = null;
  highlightPreviewTarget = null;
}

function clearPlacementSquarePreview() {
  if (highlightMesh) {
    if (scene) scene.remove(highlightMesh);
    if (highlightMesh.geometry) highlightMesh.geometry.dispose();
    if (highlightMesh.material) highlightMesh.material.dispose();
    highlightMesh = null;
  }
  if (previewGroup) {
    disposeObject3D(previewGroup);
    if (scene) scene.remove(previewGroup);
    previewGroup = null;
  }
}

function clearPlacementModelPreview() {
  highlightLoadToken++;
  highlightLoadingKey = null;
  if (highlightModelGroup) {
    disposeObject3D(highlightModelGroup);
    if (scene) scene.remove(highlightModelGroup);
    highlightModelGroup = null;
  }
  highlightModelKey = null;
}

function getStructureRootFromObject(obj) {
  let cur = obj;
  while (cur && cur !== objectsGroup) {
    if (cur.parent === objectsGroup && (cur.userData?.structureExport || cur.userData?.featureExport)) return cur;
    cur = cur.parent;
  }
  return null;
}

function isFeatureGroup(group) {
  return !!group?.userData?.featureExport;
}

function pickStructureFromEvent(event, includeFeatures = true) {
  if (!event || !threeContainer || !camera || !objectsGroup) return null;
  const rect = threeContainer.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(objectsGroup.children, true);
  for (const hit of hits) {
    const root = getStructureRootFromObject(hit.object);
    if (root && (includeFeatures || !isFeatureGroup(root))) return root;
  }
  return null;
}

function pickFeatureFromEvent(event) {
  if (!event || !threeContainer || !camera || !objectsGroup) return null;
  const rect = threeContainer.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(objectsGroup.children, true);
  for (const hit of hits) {
    const root = getStructureRootFromObject(hit.object);
    if (isFeatureGroup(root)) return root;
  }
  return null;
}

function getDroidRootFromObject(obj) {
  let cur = obj;
  while (cur && cur !== objectsGroup) {
    if (cur.parent === objectsGroup && cur.userData?.droidExport) return cur;
    cur = cur.parent;
  }
  return null;
}

function pickDroidFromEvent(event) {
  if (!event || !threeContainer || !camera || !objectsGroup) return null;
  const rect = threeContainer.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(objectsGroup.children, true);
  for (const hit of hits) {
    const root = getDroidRootFromObject(hit.object);
    if (root) return root;
  }
  return null;
}

function getMapTileFromEvent(event) {
  if (!event || !threeContainer || !camera || !scene) return null;
  const rect = threeContainer.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = (mesh ? raycaster.intersectObject(mesh, true)[0] : null) ||
    raycaster.intersectObjects(scene.children, true)[0];
  if (!hit) return null;
  const x = Math.floor(hit.point.x);
  const y = Math.floor(hit.point.z);
  return x >= 0 && y >= 0 && x < mapW && y < mapH ? { x, y } : null;
}

function cloneMapObjectData(value) {
  if (!value || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (e) {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
}

function getCopiedObjectLabel() {
  if (!copiedMapObject) return 'No copied object.';
  return 'Copied ' + copiedMapObject.kind + ': ' + copiedMapObject.name +
    (copiedMapObjectPasteArmed ? '\nMove mouse and click map to paste.' : '');
}

function getBulkSelectionName(count = viewBulkSelection.length) {
  return count + ' selected object' + (count === 1 ? '' : 's');
}

function updateViewClipboardControls() {
  const copyBtn = document.getElementById('viewCopyBtn');
  const pasteBtn = document.getElementById('viewPasteBtn');
  const info = document.getElementById('viewClipboardInfo');
  if (copyBtn) copyBtn.disabled = !getSelectedMapObjectForCopy();
  if (pasteBtn) pasteBtn.disabled = !copiedMapObject;
  if (info) info.textContent = getCopiedObjectLabel();
}

function armCopiedMapObjectPaste() {
  if (!copiedMapObject) return;
  copiedMapObjectPasteArmed = true;
  updateViewClipboardControls();
  updateViewBulkSelectionPanel();
  if (lastMouseEvent) updateHighlight(lastMouseEvent);
}

function disarmCopiedMapObjectPaste() {
  if (!copiedMapObjectPasteArmed) return;
  copiedMapObjectPasteArmed = false;
  clearStructurePlacementPreview();
  updateViewClipboardControls();
  updateViewBulkSelectionPanel();
}

function cancelCopiedMapObjectPaste() {
  copiedMapObjectPasteArmed = false;
  copiedMapObject = null;
  clearStructurePlacementPreview();
  updateViewClipboardControls();
  updateViewBulkSelectionPanel();
  setFileStatus('Copied placement canceled.');
}

function isCopiedMapObjectPasteMode() {
  return !!copiedMapObject && copiedMapObjectPasteArmed;
}

function shouldKeepCopiedMapObjectPasteArmed() {
  return copiedMapObject?.type === 'selection';
}

function getSelectedMapObjectForCopy() {
  if (activeTab === 'droids' && selectedDroidGroup) return { type: 'droid', group: selectedDroidGroup };
  if ((activeTab === 'objects' || activeTab === 'features') && selectedStructureGroup) {
    return { type: isFeatureGroup(selectedStructureGroup) ? 'feature' : 'structure', group: selectedStructureGroup };
  }
  if (selectedDroidGroup) return { type: 'droid', group: selectedDroidGroup };
  if (selectedStructureGroup) return { type: isFeatureGroup(selectedStructureGroup) ? 'feature' : 'structure', group: selectedStructureGroup };
  return null;
}

function copySelectedMapObject() {
  const source = getSelectedMapObjectForCopy();
  if (!source) {
    setFileStatus('Select a structure, droid, or object first.');
    updateViewClipboardControls();
    return false;
  }
  const { type, group } = source;
  if (type === 'droid') {
    const entry = getDroidExportEntry(group);
    if (!entry) return false;
    copiedMapObject = {
      type,
      kind: 'droid',
      name: entry.name || entry.template || 'droid',
      entry: cloneMapObjectData(entry)
    };
  } else if (type === 'feature') {
    const def = getStructureGroupDef(group);
    const entry = getFeatureExportEntry(group);
    if (!def || !entry) return false;
    copiedMapObject = {
      type,
      kind: 'object',
      name: getFeatureDisplayName(def),
      defId: def.id,
      rot: Math.round(getFeatureRotationDegrees(group) / 90) % 4,
      rotDeg: getFeatureRotationDegrees(group),
      entry: cloneMapObjectData(entry)
    };
  } else {
    const def = getStructureGroupDef(group);
    const data = group.userData?.structureExport || {};
    const entry = getStructureExportEntry(group, data.style || currentStructJsonStyle);
    const footprint = getStructureFootprint(group);
    if (!def || !entry || !footprint) return false;
    copiedMapObject = {
      type,
      kind: 'structure',
      name: def.name || def.id || 'structure',
      defId: def.id,
      rot: data.rot || 0,
      rotDeg: getStructureRotationDegrees(group),
      modules: getStructureModuleCount(group),
      player: getStructurePlayer(group),
      style: data.style || currentStructJsonStyle,
      entry: cloneMapObjectData(entry)
    };
  }
  copiedMapObjectVersion++;
  setFileStatus('Copied ' + copiedMapObject.name + '. Move mouse and click map to paste.');
  armCopiedMapObjectPaste();
  return true;
}

function getTemplateItemTile(item) {
  if (!item) return null;
  if (item.type === 'droid') return getObjectEntryTile(item.entry);
  if (item.footprint) return { x: item.footprint.x, y: item.footprint.y };
  return null;
}

function makeTemplateItemFromGroup(group) {
  if (group?.userData?.droidExport) {
    const entry = getDroidExportEntry(group);
    const tile = getObjectEntryTile(entry);
    if (!entry || !tile) return null;
    return {
      type: 'droid',
      name: entry.name || entry.template || 'droid',
      entry: cloneMapObjectData(entry),
      tile
    };
  }
  if (isFeatureGroup(group)) {
    const def = getStructureGroupDef(group);
    const entry = getFeatureExportEntry(group);
    const footprint = getStructureFootprint(group);
    if (!def || !entry || !footprint) return null;
    return {
      type: 'feature',
      name: getFeatureDisplayName(def),
      defId: def.id,
      rot: Math.round(getFeatureRotationDegrees(group) / 90) % 4,
      rotDeg: getFeatureRotationDegrees(group),
      entry: cloneMapObjectData(entry),
      footprint
    };
  }
  const def = getStructureGroupDef(group);
  const data = group?.userData?.structureExport || {};
  const entry = getStructureExportEntry(group, data.style || currentStructJsonStyle);
  const footprint = getStructureFootprint(group);
  if (!def || !entry || !footprint) return null;
  return {
    type: 'structure',
    name: def.name || def.id || 'structure',
    defId: def.id,
    rot: data.rot || 0,
    rotDeg: getStructureRotationDegrees(group),
    modules: getStructureModuleCount(group),
    player: getStructurePlayer(group),
    style: data.style || currentStructJsonStyle,
    entry: cloneMapObjectData(entry),
    footprint
  };
}

function collectTileTemplateCells(bounds, minX, minY) {
  const cells = [];
  if (!bounds) return cells;
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      cells.push({
        offsetX: x - minX,
        offsetY: y - minY,
        tile: mapTiles[y]?.[x] ?? 0,
        rot: mapRotations[y]?.[x] || 0,
        xFlip: !!mapXFlip[y]?.[x],
        yFlip: !!mapYFlip[y]?.[x],
        triFlip: !!mapTriFlip[y]?.[x]
      });
    }
  }
  return cells;
}

function collectHeightTemplateCells(bounds, minX, minY) {
  const cells = [];
  if (!bounds) return cells;
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      cells.push({
        offsetX: x - minX,
        offsetY: y - minY,
        height: mapHeights[y]?.[x] || 0
      });
    }
  }
  return cells;
}

function makeSelectionTemplateData(name, groups = viewBulkSelection) {
  const items = groups.map(makeTemplateItemFromGroup).filter(Boolean);
  const terrainStats = activeTab === 'view' ? getViewTerrainSelectionStats() : null;
  const tileBounds = terrainStats?.tileBounds || null;
  const heightBounds = terrainStats?.heightBounds || null;
  if (!items.length && !tileBounds && !heightBounds) return null;
  let minX = Infinity;
  let minY = Infinity;
  items.forEach(item => {
    const tile = getTemplateItemTile(item);
    if (!tile) return;
    minX = Math.min(minX, tile.x);
    minY = Math.min(minY, tile.y);
  });
  if (tileBounds) {
    minX = Math.min(minX, tileBounds.minX);
    minY = Math.min(minY, tileBounds.minY);
  }
  if (heightBounds) {
    minX = Math.min(minX, heightBounds.minX);
    minY = Math.min(minY, heightBounds.minY);
  }
  if (!isFinite(minX) || !isFinite(minY)) return null;
  items.forEach(item => {
    const tile = getTemplateItemTile(item);
    item.offsetX = tile.x - minX;
    item.offsetY = tile.y - minY;
  });
  const tileCells = collectTileTemplateCells(tileBounds, minX, minY);
  const heightCells = collectHeightTemplateCells(heightBounds, minX, minY);
  const totalParts = items.length + tileCells.length + heightCells.length;
  return {
    id: 'template-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    name: String(name || getBulkSelectionName(totalParts)).trim() || getBulkSelectionName(totalParts),
    createdAt: Date.now(),
    items,
    tileCells,
    heightCells
  };
}

function copyBulkSelection() {
  const template = makeSelectionTemplateData(getBulkSelectionName());
  if (!template) {
    setFileStatus('Select an area first.');
    return false;
  }
  copiedMapObject = {
    type: 'selection',
    kind: 'selection',
    name: template.name,
    items: template.items,
    tileCells: template.tileCells,
    heightCells: template.heightCells
  };
  resetCopiedSelectionPlacementOptions(copiedMapObject);
  copiedMapObjectVersion++;
  setFileStatus('Copied ' + template.name + '. Move mouse and click map to paste.');
  armCopiedMapObjectPaste();
  updateViewBulkSelectionPanel();
  return true;
}

function readStructureTemplates() {
  try {
    const parsed = JSON.parse(safeLocalStorageGet(STRUCTURE_TEMPLATE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter(item => item && (
        Array.isArray(item.items) ||
        Array.isArray(item.tileCells) ||
        Array.isArray(item.heightCells)
      ))
      : [];
  } catch (e) {
    return [];
  }
}

function writeStructureTemplates(templates) {
  return safeLocalStorageSet(STRUCTURE_TEMPLATE_KEY, JSON.stringify(templates || []));
}

function getTemplateItemDisplayName(item) {
  if (!item) return 'Unknown';
  const cleanName = value => String(value || '').replace(/\*/g, '').trim();
  if (item.type === 'droid') {
    return cleanName(item.name || item.entry?.name || item.entry?.template) || 'Droid';
  }
  const def = getStructureDefById(item.defId);
  if (item.type === 'feature') {
    return cleanName(item.name || getFeatureDisplayName(def) || item.entry?.name || item.defId) || 'Object';
  }
  return cleanName(item.name || def?.name || item.entry?.name || item.defId) || 'Structure';
}

function getTemplateItemCategory(item) {
  if (item?.type === 'droid') return 'Droids';
  if (item?.type === 'feature') return 'Objects';
  return 'Structures';
}

function formatTemplateContents(template, statusLine = 'Click the map to paste.') {
  const items = Array.isArray(template?.items) ? template.items : [];
  const tileCells = Array.isArray(template?.tileCells) ? template.tileCells : [];
  const heightCells = Array.isArray(template?.heightCells) ? template.heightCells : [];
  const templateName = String(template?.name || 'Template').trim() || 'Template';
  const categoryCounts = { Structures: 0, Droids: 0, Objects: 0 };
  const categoryItems = {
    Structures: new Map(),
    Droids: new Map(),
    Objects: new Map()
  };
  items.forEach(item => {
    const category = getTemplateItemCategory(item);
    categoryCounts[category]++;
    const name = getTemplateItemDisplayName(item);
    const current = categoryItems[category].get(name) || { name, count: 0 };
    current.count++;
    categoryItems[category].set(name, current);
  });
  const totalParts = items.length + tileCells.length + heightCells.length;
  const partWord = totalParts === 1 ? 'part' : 'parts';
  const lines = [templateName + ': ' + totalParts + ' ' + partWord];
  ['Structures', 'Droids', 'Objects'].forEach(category => {
    lines.push('', category + ': ' + categoryCounts[category]);
    categoryItems[category].forEach(item => {
      lines.push('- ' + item.name + (item.count > 1 ? ' x' + item.count : ''));
    });
  });
  lines.push('', 'Tiles: ' + tileCells.length);
  lines.push('', 'Height: ' + heightCells.length);
  if (statusLine) {
    lines.push('', statusLine);
  }
  return lines.join('\n');
}

let templateNameDialogResolve = null;
let serverMapDatabasePromise = null;

function closeTemplateNameDialog(value) {
  if (templateNameBackdrop) templateNameBackdrop.classList.add('hidden');
  if (templateNameDialog) templateNameDialog.classList.add('hidden');
  const resolve = templateNameDialogResolve;
  templateNameDialogResolve = null;
  if (resolve) resolve(value);
}

function showTemplateNameDialog(defaultName) {
  if (!templateNameDialog || !templateNameInput) {
    return Promise.resolve(String(defaultName || '').trim() || null);
  }
  if (templateNameDialogResolve) closeTemplateNameDialog(null);
  templateNameInput.value = defaultName || '';
  if (templateNameBackdrop) templateNameBackdrop.classList.remove('hidden');
  templateNameDialog.classList.remove('hidden');
  requestAnimationFrame(() => {
    templateNameInput.focus();
    templateNameInput.select();
  });
  return new Promise(resolve => {
    templateNameDialogResolve = resolve;
  });
}

function updateStructureTemplateSelectionButton(hasSelection) {
  const cancelBtn = document.getElementById('structureTemplateCancelBtn');
  if (cancelBtn) cancelBtn.classList.toggle('active', !!hasSelection);
}

function refreshStructureTemplateList(preserveSelection = true) {
  const select = document.getElementById('structureTemplateSelect');
  const info = document.getElementById('structureTemplateInfo');
  if (!select) return;
  const current = preserveSelection ? select.value : '';
  const templates = readStructureTemplates();
  select.innerHTML = '';
  templates.forEach(template => {
    const opt = document.createElement('option');
    const partCount = (Array.isArray(template.items) ? template.items.length : 0)
      + (Array.isArray(template.tileCells) ? template.tileCells.length : 0)
      + (Array.isArray(template.heightCells) ? template.heightCells.length : 0);
    opt.value = template.id;
    opt.textContent = template.name + ' (' + partCount + ')';
    select.appendChild(opt);
  });
  const selected = current && templates.some(template => template.id === current)
    ? templates.find(template => template.id === current)
    : null;
  if (selected) select.value = selected.id;
  else select.selectedIndex = -1;
  if (info) {
    info.textContent = selected
      ? formatTemplateContents(selected)
      : (templates.length ? 'Select a template from the list.' : 'No templates saved.');
  }
  updateStructureTemplateSelectionButton(!!selected);
}

async function createTemplateFromBulkSelection() {
  if (!viewBulkSelection.length) {
    setFileStatus('Select an area first.');
    return;
  }
  const fallback = getBulkSelectionName();
  const name = await showTemplateNameDialog(fallback);
  if (name === null) return;
  const template = makeSelectionTemplateData(name || fallback);
  if (!template) {
    setFileStatus('Failed to create template.');
    return;
  }
  const templates = readStructureTemplates();
  templates.unshift(template);
  if (!writeStructureTemplates(templates)) {
    setFileStatus('Failed to save template.');
    return;
  }
  refreshStructureTemplateList();
  setFileStatus('Created template ' + template.name + '.');
}

function getViewSelectionPartCount() {
  const terrainStats = getViewTerrainSelectionStats();
  return viewBulkSelection.length + (terrainStats?.tileCount || 0) + (terrainStats?.heightCount || 0);
}

function getViewSelectionDefaultName() {
  const count = getViewSelectionPartCount();
  return count + ' selected part' + (count === 1 ? '' : 's');
}

function copyViewSelection() {
  const template = makeSelectionTemplateData(getViewSelectionDefaultName());
  if (!template) {
    setFileStatus('Select an area first.');
    return false;
  }
  copiedMapObject = {
    type: 'selection',
    kind: 'selection',
    name: template.name,
    items: template.items,
    tileCells: template.tileCells,
    heightCells: template.heightCells
  };
  resetCopiedSelectionPlacementOptions(copiedMapObject);
  copiedMapObjectVersion++;
  tileTemplatePasteArmed = false;
  copiedTileTemplate = null;
  setFileStatus('Copied ' + template.name + '. Move mouse and click map to paste.');
  armCopiedMapObjectPaste();
  updateViewBulkSelectionPanel();
  if (lastMouseEvent) updateHighlight(lastMouseEvent);
  return true;
}

async function createTemplateFromViewSelection() {
  if (!getViewSelectionPartCount()) {
    setFileStatus('Select an area first.');
    return null;
  }
  const fallback = getViewSelectionDefaultName();
  const name = await showTemplateNameDialog(fallback);
  if (name === null) return null;
  const template = makeSelectionTemplateData(name || fallback);
  if (!template) {
    setFileStatus('Select an area first.');
    return null;
  }
  const templates = readStructureTemplates();
  templates.unshift(template);
  if (!writeStructureTemplates(templates)) {
    setFileStatus('Failed to save template.');
    return null;
  }
  refreshStructureTemplateList();
  setFileStatus('Created template ' + template.name + '.');
  return template;
}

function readTileTemplates() {
  try {
    const parsed = JSON.parse(safeLocalStorageGet(TILE_TEMPLATE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter(item => item && Array.isArray(item.cells) && item.width > 0 && item.height > 0)
      : [];
  } catch (e) {
    return [];
  }
}

function writeTileTemplates(templates) {
  return safeLocalStorageSet(TILE_TEMPLATE_KEY, JSON.stringify(templates || []));
}

function getTileSelectionBounds() {
  if (!tileSelectStart || !tileSelectEnd) return null;
  const minX = Math.max(0, Math.min(tileSelectStart.x, tileSelectEnd.x));
  const maxX = Math.min(mapW - 1, Math.max(tileSelectStart.x, tileSelectEnd.x));
  const minY = Math.max(0, Math.min(tileSelectStart.y, tileSelectEnd.y));
  const maxY = Math.min(mapH - 1, Math.max(tileSelectStart.y, tileSelectEnd.y));
  if (minX > maxX || minY > maxY) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function getHeightSelectionBounds() {
  if (!heightSelectStart || !heightSelectEnd) return null;
  const minX = Math.max(0, Math.min(heightSelectStart.x, heightSelectEnd.x));
  const maxX = Math.min(mapW - 1, Math.max(heightSelectStart.x, heightSelectEnd.x));
  const minY = Math.max(0, Math.min(heightSelectStart.y, heightSelectEnd.y));
  const maxY = Math.min(mapH - 1, Math.max(heightSelectStart.y, heightSelectEnd.y));
  if (minX > maxX || minY > maxY) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function getTileTemplateDefaultName(bounds = getTileSelectionBounds()) {
  if (!bounds) return 'Tile template';
  return bounds.width + 'x' + bounds.height + ' tile template';
}

function getHeightTemplateDefaultName(bounds = getHeightSelectionBounds()) {
  if (!bounds) return 'Height template';
  return bounds.width + 'x' + bounds.height + ' height template';
}

function makeTileTemplateData(name) {
  const bounds = getTileSelectionBounds();
  if (!bounds) return null;
  const cells = [];
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      cells.push({
        offsetX: x - bounds.minX,
        offsetY: y - bounds.minY,
        tile: mapTiles[y]?.[x] ?? 0,
        rot: mapRotations[y]?.[x] || 0,
        xFlip: !!mapXFlip[y]?.[x],
        yFlip: !!mapYFlip[y]?.[x],
        triFlip: !!mapTriFlip[y]?.[x]
      });
    }
  }
  return {
    id: 'tile-template-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    name: String(name || getTileTemplateDefaultName(bounds)).trim() || getTileTemplateDefaultName(bounds),
    createdAt: Date.now(),
    width: bounds.width,
    height: bounds.height,
    cells
  };
}

function makeHeightTemplateData(name) {
  const bounds = getHeightSelectionBounds();
  if (!bounds) return null;
  const cells = [];
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      cells.push({
        offsetX: x - bounds.minX,
        offsetY: y - bounds.minY,
        height: mapHeights[y]?.[x] || 0
      });
    }
  }
  return {
    id: 'height-template-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
    kind: 'height-template',
    name: String(name || getHeightTemplateDefaultName(bounds)).trim() || getHeightTemplateDefaultName(bounds),
    createdAt: Date.now(),
    width: bounds.width,
    height: bounds.height,
    cells
  };
}

function formatTileTemplateContents(template, statusLine = 'Click the map to paste.') {
  if (!template) return readTileTemplates().length ? 'Select a tile template from the list.' : 'No tile templates saved.';
  const cells = Array.isArray(template.cells) ? template.cells : [];
  if (template.kind === 'height-template' || template.kind === 'height-selection') {
    const heightCounts = new Map();
    cells.forEach(cell => {
      const key = String(cell.height ?? 0);
      heightCounts.set(key, (heightCounts.get(key) || 0) + 1);
    });
    const heightList = Array.from(heightCounts.entries())
      .slice(0, 8)
      .map(([height, count]) => 'Height ' + height + (count > 1 ? ' x' + count : ''))
      .join('\n');
    return [
      (template.name || 'Height template') + ': ' + cells.length + ' height' + (cells.length === 1 ? '' : 's'),
      'Size: ' + (template.width || 1) + ' x ' + (template.height || 1),
      heightList ? '\n' + heightList : '',
      statusLine ? '\n' + statusLine : ''
    ].filter(Boolean).join('\n');
  }
  const textureCounts = new Map();
  cells.forEach(cell => {
    const key = String(cell.tile ?? 0);
    textureCounts.set(key, (textureCounts.get(key) || 0) + 1);
  });
  const textureList = Array.from(textureCounts.entries())
    .slice(0, 8)
    .map(([tile, count]) => 'Tile ' + tile + (count > 1 ? ' x' + count : ''))
    .join('\n');
  return [
    (template.name || 'Tile template') + ': ' + cells.length + ' tile' + (cells.length === 1 ? '' : 's'),
    'Size: ' + (template.width || 1) + ' x ' + (template.height || 1),
    textureList ? '\n' + textureList : '',
    statusLine ? '\n' + statusLine : ''
  ].filter(Boolean).join('\n');
}

function getSelectedTileTemplate() {
  const select = document.getElementById('tileTemplateSelect');
  const id = select?.value;
  return readTileTemplates().find(template => template.id === id) || null;
}

function updateTileTemplateSelectionButton(hasSelection) {
  const deleteBtn = document.getElementById('tileTemplateDeleteBtn');
  const cancelBtn = document.getElementById('tileTemplateCancelBtn');
  if (deleteBtn) deleteBtn.disabled = !hasSelection;
  if (cancelBtn) {
    cancelBtn.disabled = !hasSelection;
    cancelBtn.classList.toggle('active', !!hasSelection);
  }
}

function refreshTileTemplateList(preserveSelection = true) {
  const select = document.getElementById('tileTemplateSelect');
  const info = document.getElementById('tileTemplateInfo');
  if (!select) return;
  const current = preserveSelection ? select.value : '';
  select.innerHTML = '';
  const templates = readTileTemplates();
  templates.forEach(template => {
    const opt = document.createElement('option');
    opt.value = template.id;
    opt.textContent = template.name + ' (' + template.width + 'x' + template.height + ')';
    select.appendChild(opt);
  });
  const selected = current && templates.some(template => template.id === current)
    ? templates.find(template => template.id === current)
    : null;
  if (selected) select.value = selected.id;
  else select.selectedIndex = -1;
  if (info) info.textContent = selected ? formatTileTemplateContents(selected) : formatTileTemplateContents(null);
  updateTileTemplateSelectionButton(!!selected);
  if (selected) {
    copiedTileTemplate = selected;
    tileTemplatePasteArmed = true;
  } else if (copiedTileTemplate?.kind !== 'tile-selection') {
    copiedTileTemplate = null;
    tileTemplatePasteArmed = false;
  }
}

function clearSelectedTileTemplate(showStatus = true) {
  const select = document.getElementById('tileTemplateSelect');
  const info = document.getElementById('tileTemplateInfo');
  if (select) select.selectedIndex = -1;
  if (info) info.textContent = formatTileTemplateContents(null);
  copiedTileTemplate = null;
  tileTemplatePasteArmed = false;
  updateTileTemplateSelectionButton(false);
  clearStructurePlacementPreview();
  if (showStatus) setFileStatus('Tile template selection canceled.');
}

function copyTileSelection() {
  if (tileTemplatePasteArmed && copiedTileTemplate?.kind === 'tile-selection') {
    clearSelectedTileTemplate(false);
    updateTileApplyBtn();
    setFileStatus('Tile copy canceled.');
    return false;
  }
  const template = makeTileTemplateData(getTileTemplateDefaultName());
  if (!template) {
    setFileStatus('Select a tile area first.');
    return false;
  }
  copiedTileTemplate = { ...template, kind: 'tile-selection' };
  tileTemplatePasteArmed = true;
  copiedTileTemplateVersion++;
  updateTileApplyBtn();
  if (lastMouseEvent) updateHighlight(lastMouseEvent);
  setFileStatus('Copied ' + template.name + '. Move mouse and click map to paste.');
  return true;
}

function updateHeightViewSelectionInfo() {
  const info = document.getElementById('heightViewInfo');
  const bounds = getHeightSelectionBounds();
  if (!info || !bounds) return;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let total = 0;
  let count = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const h = mapHeights[y]?.[x] || 0;
      minHeight = Math.min(minHeight, h);
      maxHeight = Math.max(maxHeight, h);
      total += h;
      count++;
    }
  }
  info.textContent = [
    'Selected height area',
    'Tiles: ' + bounds.width + ' x ' + bounds.height + ' (' + count + ')',
    'Height: ' + minHeight + (minHeight === maxHeight ? '' : ' - ' + maxHeight),
    'Average: ' + Math.round(total / Math.max(1, count))
  ].join('\n');
}

function copyHeightSelection() {
  if (tileTemplatePasteArmed && copiedTileTemplate?.kind === 'height-selection') {
    copiedTileTemplate = null;
    tileTemplatePasteArmed = false;
    copiedTileTemplateVersion++;
    updateHeightApplyBtn();
    if (lastMouseEvent) updateHighlight(lastMouseEvent);
    setFileStatus('Height copy canceled.');
    return false;
  }
  const template = makeHeightTemplateData(getHeightTemplateDefaultName());
  if (!template) {
    setFileStatus('Select a height area first.');
    return false;
  }
  copiedTileTemplate = { ...template, kind: 'height-selection' };
  tileTemplatePasteArmed = true;
  copiedTileTemplateVersion++;
  updateHeightApplyBtn();
  clearStructurePlacementPreview();
  if (lastMouseEvent) updateHighlight(lastMouseEvent);
  setFileStatus('Copied ' + template.name + '. Move mouse and click map to paste.');
  return true;
}

async function createTileTemplateFromSelection() {
  if (!getTileSelectionBounds()) {
    setFileStatus('Select a tile area first.');
    return false;
  }
  const fallback = getTileTemplateDefaultName();
  const name = await showTemplateNameDialog(fallback);
  if (name === null) {
    setFileStatus('Template creation canceled.');
    return false;
  }
  const template = makeTileTemplateData(name || fallback);
  if (!template) {
    setFileStatus('Failed to create tile template.');
    return false;
  }
  const templates = readTileTemplates();
  templates.unshift(template);
  if (!writeTileTemplates(templates)) {
    setFileStatus('Failed to save tile template.');
    return false;
  }
  refreshTileTemplateList();
  setFileStatus('Created tile template ' + template.name + '.');
  return true;
}

async function createHeightTemplateFromSelection() {
  if (!getHeightSelectionBounds()) {
    setFileStatus('Select a height area first.');
    return false;
  }
  const fallback = getHeightTemplateDefaultName();
  const name = await showTemplateNameDialog(fallback);
  if (name === null) {
    setFileStatus('Template creation canceled.');
    return false;
  }
  const template = makeHeightTemplateData(name || fallback);
  if (!template) {
    setFileStatus('Failed to create height template.');
    return false;
  }
  const templates = readTileTemplates();
  templates.unshift(template);
  if (!writeTileTemplates(templates)) {
    setFileStatus('Failed to save height template.');
    return false;
  }
  refreshTileTemplateList();
  setFileStatus('Created height template ' + template.name + '.');
  return true;
}

function getTileTemplatePlacementValidity(template, tileX, tileY) {
  if (!template || !Array.isArray(template.cells) || !template.cells.length) return { valid: false, reason: 'Tile template is empty.' };
  const hasOverlappingCell = template.cells.some(cell => {
    const x = tileX + (cell.offsetX || 0);
    const y = tileY + (cell.offsetY || 0);
    return x >= 0 && x < mapW && y >= 0 && y < mapH;
  });
  if (!hasOverlappingCell) {
    return { valid: false, reason: 'Copied area is outside the map.' };
  }
  return { valid: true, reason: '' };
}

function pasteTileTemplateAtTile(template, tileX, tileY) {
  const placement = getTileTemplatePlacementValidity(template, tileX, tileY);
  if (!placement.valid) {
    setFileStatus(placement.reason);
    return false;
  }
  if (template.kind === 'height-template' || template.kind === 'height-selection') {
    const changes = [];
    template.cells.forEach(cell => {
      const x = tileX + (cell.offsetX || 0);
      const y = tileY + (cell.offsetY || 0);
      if (x < 0 || x >= mapW || y < 0 || y >= mapH) return;
      const oldHeight = mapHeights[y][x];
      const newHeight = Math.max(0, Math.min(heightMax, parseInt(cell.height, 10) || 0));
      if (oldHeight === newHeight) return;
      changes.push({ x, y, oldHeight, newHeight });
      mapHeights[y][x] = newHeight;
    });
    if (!changes.length) {
      setFileStatus('Height template already matches this area.');
      return false;
    }
    pushUndo({ type: 'height', changes });
    requestTerrainRedraw();
    setFileStatus('Pasted height template ' + (template.name || 'selection') + '.');
    return true;
  }
  const changes = [];
  template.cells.forEach(cell => {
    const x = tileX + (cell.offsetX || 0);
    const y = tileY + (cell.offsetY || 0);
    if (x < 0 || y < 0 || x >= mapW || y >= mapH) return;
    const oldTile = mapTiles[y][x];
    const oldRot = mapRotations[y][x];
    const oldXFlip = !!mapXFlip[y]?.[x];
    const oldYFlip = !!mapYFlip[y]?.[x];
    const oldTriFlip = !!mapTriFlip[y]?.[x];
    const newTile = parseInt(cell.tile, 10) || 0;
    const newRot = parseInt(cell.rot, 10) || 0;
    const newXFlip = !!cell.xFlip;
    const newYFlip = !!cell.yFlip;
    const newTriFlip = !!cell.triFlip;
    if (oldTile === newTile && oldRot === newRot && oldXFlip === newXFlip && oldYFlip === newYFlip && oldTriFlip === newTriFlip) return;
    changes.push({ x, y, oldTile, oldRot, oldXFlip, oldYFlip, oldTriFlip, newTile, newRot, newXFlip, newYFlip, newTriFlip });
    mapTiles[y][x] = newTile;
    mapRotations[y][x] = newRot;
    mapXFlip[y][x] = newXFlip;
    mapYFlip[y][x] = newYFlip;
    mapTriFlip[y][x] = newTriFlip;
  });
  if (!changes.length) {
    setFileStatus('Tile template already matches this area.');
    return false;
  }
  pushUndo({ type: 'tiles', changes });
  requestTerrainRedraw();
  setFileStatus('Pasted tile template ' + (template.name || 'selection') + '.');
  return true;
}

function pasteTileTemplateFromEvent(event) {
  const template = copiedTileTemplate;
  const tile = getMapTileFromEvent(event);
  if (!template) {
    setFileStatus('Copy or select a tile template first.');
    return false;
  }
  if (!tile) {
    setFileStatus('Move mouse over the map before pasting.');
    return false;
  }
  const pasted = pasteTileTemplateAtTile(template, tile.x, tile.y);
  if (lastMouseEvent) updateHighlight(lastMouseEvent);
  return pasted;
}

function pasteSelectedTileTemplateAtMouse() {
  const template = getSelectedTileTemplate();
  if (!template) {
    setFileStatus('No tile template selected.');
    return false;
  }
  const tile = getMapTileFromEvent(lastMouseEvent);
  if (!tile) {
    setFileStatus('Move mouse over the map before pasting.');
    return false;
  }
  return pasteTileTemplateAtTile(template, tile.x, tile.y);
}

function isTileTemplatePasteMode() {
  return !!(tileTemplatePasteArmed && copiedTileTemplate);
}

function updateTileTemplatePlacementPreview(event) {
  if (!threeContainer || !scene) return false;
  const template = copiedTileTemplate;
  const tile = getMapTileFromEvent(event);
  const info = document.getElementById('tileTemplateInfo');
  if (!template || !tile) {
    clearStructurePlacementPreview();
    return true;
  }
  const placement = getTileTemplatePlacementValidity(template, tile.x, tile.y);
  const width = Math.max(1, parseInt(template.width, 10) || 1);
  const height = Math.max(1, parseInt(template.height, 10) || 1);
  const modelKey = [
    'tile-template',
    copiedTileTemplateVersion,
    template.id || template.kind || 'copy',
    width,
    height,
    placement.valid ? 'ok' : 'blocked'
  ].join('|');
  const previewKey = modelKey + '|' + tile.x + '|' + tile.y;
  if (previewKey === highlightCachedKey && previewGroup && highlightMesh) return true;
  clearStructurePlacementPreview();
  previewGroup = new THREE.Group();
  highlightMesh = createTerrainHighlightMesh(
    tile.x,
    tile.y,
    width,
    height,
    placement.valid ? 0x6CF527 : 0xff3333,
    0.45,
    0.06
  );
  previewGroup.add(highlightMesh);
  previewGroup.traverse(obj => obj.layers.set(1));
  scene.add(previewGroup);
  highlightCachedKey = previewKey;
  if (info && activeTab === 'templates') {
    info.textContent = formatTileTemplateContents(
      template,
      placement.valid ? 'Click the map to paste.' : placement.reason
    );
  }
  return true;
}

function cancelTileTemplatePaste() {
  if (!isTileTemplatePasteMode()) return false;
  const wasCopiedTileSelection = copiedTileTemplate?.kind === 'tile-selection';
  const wasCopiedHeightSelection = copiedTileTemplate?.kind === 'height-selection';
  clearSelectedTileTemplate(false);
  if (wasCopiedTileSelection) {
    clearTileSelectionState();
    setFileStatus('Tile selection canceled.');
  } else if (wasCopiedHeightSelection) {
    heightSelectStart = null;
    heightSelectEnd = null;
    heightViewTile = null;
    updateHeightApplyBtn();
    setFileStatus('Height selection canceled.');
  } else {
    updateTileApplyBtn();
    setFileStatus('Tile template placement canceled.');
  }
  updateViewBulkSelectionPanel();
  return true;
}

function deleteSelectedTileTemplate() {
  const template = getSelectedTileTemplate();
  if (!template) return false;
  const templates = readTileTemplates().filter(item => item.id !== template.id);
  writeTileTemplates(templates);
  clearSelectedTileTemplate(false);
  refreshTileTemplateList(false);
  setFileStatus('Deleted tile template ' + template.name + '.');
  return true;
}

async function buildDroidGroupFromEntry(entry, tileX, tileY) {
  if (!isTileWithinMap(tileX, tileY)) return null;
  await loadComponentDefs();
  const pasteEntry = cloneMapObjectData(entry) || {};
  delete pasteEntry.id;
  const degrees = Array.isArray(pasteEntry.rotation)
    ? normalizeDegrees((pasteEntry.rotation[1] || 0) * 360 / 65536)
    : normalizeDegrees(pasteEntry.rotDeg || 0);
  pasteEntry.position = [Math.round((tileX + 0.5) * 128), Math.round((tileY + 0.5) * 128)];
  pasteEntry.rotation = [0, degreesToWzAngle(degrees), 0];
  const pieList = getDroidPieList(pasteEntry);
  let group;
  if (pieList && pieList.length) {
    group = await buildDroidGroup(pieList);
  } else {
    const player = getObjectEntryPlayer(pasteEntry);
    const geom = new THREE.ConeGeometry(0.3, 0.6, 4);
    const mat = new THREE.MeshLambertMaterial({ color: PLAYER_COLORS[player % PLAYER_COLORS.length] });
    group = new THREE.Mesh(geom, mat);
    group.userData.centerX = 0;
    group.userData.centerZ = 0;
    group.userData.minY = -0.3;
  }
  const h = (mapHeights?.[tileY]?.[tileX] ?? 0) * HEIGHT_SCALE + 0.07;
  group.position.set(tileX + 0.5 - (group.userData.centerX || 0), h - (group.userData.minY || 0), tileY + 0.5 - (group.userData.centerZ || 0));
  group.rotation.y = -degrees * Math.PI / 180;
  group.userData.droidExport = pasteEntry;
  addDroidGroup(group);
  return group;
}

async function buildDroidVisualFromEntry(entry, tileX, tileY) {
  await loadComponentDefs();
  const previewEntry = cloneMapObjectData(entry) || {};
  const degrees = Array.isArray(previewEntry.rotation)
    ? normalizeDegrees((previewEntry.rotation[1] || 0) * 360 / 65536)
    : normalizeDegrees(previewEntry.rotDeg || 0);
  previewEntry.position = [Math.round((tileX + 0.5) * 128), Math.round((tileY + 0.5) * 128)];
  previewEntry.rotation = [0, degreesToWzAngle(degrees), 0];
  const pieList = getDroidPieList(previewEntry);
  let group;
  if (pieList && pieList.length) {
    group = await buildDroidGroup(pieList);
  } else {
    const player = getObjectEntryPlayer(previewEntry);
    const geom = new THREE.ConeGeometry(0.3, 0.6, 4);
    const mat = new THREE.MeshLambertMaterial({ color: PLAYER_COLORS[player % PLAYER_COLORS.length] });
    group = new THREE.Mesh(geom, mat);
    group.userData.centerX = 0;
    group.userData.centerZ = 0;
    group.userData.minY = -0.3;
  }
  const h = (mapHeights?.[tileY]?.[tileX] ?? 0) * HEIGHT_SCALE + 0.07;
  group.position.set(tileX + 0.5 - (group.userData.centerX || 0), h - (group.userData.minY || 0), tileY + 0.5 - (group.userData.centerZ || 0));
  group.rotation.y = -degrees * Math.PI / 180;
  return group;
}

async function pasteStructureCopyAtTile(copy, tileX, tileY) {
  const def = getStructureDefById(copy.defId);
  if (!def || def.feature) return null;
  const moduleRule = getModuleParentTypes(def);
  if (moduleRule) {
    setFileStatus('Cannot paste standalone module structures.');
    return null;
  }
  let sizeX = def.sizeX || 1;
  let sizeY = def.sizeY || 1;
  const rot = copy.rot || 0;
  if (rot % 2 === 1) {
    const tmp = sizeX;
    sizeX = sizeY;
    sizeY = tmp;
  }
  const placement = getStructurePlacementValidity(def, tileX, tileY, sizeX, sizeY);
  if (!placement.valid) {
    setFileStatus('Cannot paste structure: ' + placement.reason);
    return null;
  }
  const sourceEntry = cloneMapObjectData(copy.entry) || {};
  delete sourceEntry.id;
  if (sourceEntry.player !== undefined) sourceEntry.player = copy.player;
  else sourceEntry.startpos = copy.player;
  if (copy.modules > 0) sourceEntry.modules = copy.modules;
  else delete sourceEntry.modules;
  const group = await buildStructureGroup(getStructureRenderDef(def, copy.modules), rot, sizeX, sizeY);
  const minH = getMinTerrainHeight(tileX, tileY, sizeX, sizeY);
  group.position.copy(getStructurePlacementPosition(group, tileX, tileY, sizeX, sizeY, minH));
  markStructureForExport(group, def, rot, sizeX, sizeY, sourceEntry, copy.style || currentStructJsonStyle);
  setStructureModuleCount(group, copy.modules);
  setStructurePlayer(group, copy.player);
  setStructureRotationDegrees(group, copy.rotDeg);
  addStructureGroup(group);
  return group;
}

async function pasteFeatureCopyAtTile(copy, tileX, tileY) {
  const def = getStructureDefById(copy.defId);
  if (!def?.feature) return null;
  let sizeX = def.sizeX || 1;
  let sizeY = def.sizeY || 1;
  const rot = copy.rot || 0;
  if (rot % 2 === 1) {
    const tmp = sizeX;
    sizeX = sizeY;
    sizeY = tmp;
  }
  const placement = getStructurePlacementValidity(def, tileX, tileY, sizeX, sizeY);
  if (!placement.valid) {
    setFileStatus('Cannot paste object: ' + placement.reason);
    return null;
  }
  const entry = makeFeatureEntry(def, tileX, tileY, rot);
  const sourceEntry = { ...(cloneMapObjectData(copy.entry) || {}), ...entry };
  delete sourceEntry.id;
  const group = await buildStructureGroup(def, rot, sizeX, sizeY);
  const minH = getMinTerrainHeight(tileX, tileY, sizeX, sizeY);
  group.position.copy(getStructurePlacementPosition(group, tileX, tileY, sizeX, sizeY, minH));
  markFeatureForExport(group, def, tileX, tileY, sourceEntry, rot, copy.rotDeg);
  addStructureGroup(group);
  return group;
}

async function pasteCopiedMapObjectAtTile(tileX, tileY) {
  if (!copiedMapObject) {
    setFileStatus('Copy a structure, droid, or object first.');
    return null;
  }
  if (copiedMapObject.type === 'selection') {
    return await pasteTemplateDataAtTile(getCopiedSelectionPlacementTemplate(), tileX, tileY);
  }
  let group = null;
  if (copiedMapObject.type === 'droid') {
    group = await buildDroidGroupFromEntry(copiedMapObject.entry, tileX, tileY);
    if (group) {
      pushUndo({ type: 'droid', group });
      selectDroidGroup(group);
    }
  } else if (copiedMapObject.type === 'feature') {
    group = await pasteFeatureCopyAtTile(copiedMapObject, tileX, tileY);
    if (group) {
      refreshObjectPreviewLayer();
      pushUndo({ type: 'structure', group });
      selectFeatureGroup(group);
    }
  } else if (copiedMapObject.type === 'structure') {
    group = await pasteStructureCopyAtTile(copiedMapObject, tileX, tileY);
    if (group) {
      refreshObjectPreviewLayer();
      pushUndo({ type: 'structure', group });
      selectStructureGroup(group);
    }
  }
  if (group) {
    markMapDirty();
    setFileStatus('Pasted ' + copiedMapObject.name + '.');
    if (lastMouseEvent) updateHighlight(lastMouseEvent);
  }
  updateViewClipboardControls();
  return group;
}

async function pasteTemplateItemAtTile(item, tileX, tileY) {
  if (!item) return null;
  if (!getTemplateItemPlacementValidity(item, tileX, tileY).valid) return null;
  if (item.type === 'droid') return await buildDroidGroupFromEntry(item.entry, tileX, tileY);
  if (item.type === 'feature') return await pasteFeatureCopyAtTile(item, tileX, tileY);
  if (item.type === 'structure') return await pasteStructureCopyAtTile(item, tileX, tileY);
  return null;
}

async function pasteTemplateDataAtTile(template, tileX, tileY) {
  const items = Array.isArray(template?.items) ? template.items : [];
  const tileCells = Array.isArray(template?.tileCells) ? template.tileCells : [];
  const heightCells = Array.isArray(template?.heightCells) ? template.heightCells : [];
  if (!items.length && !tileCells.length && !heightCells.length) {
    setFileStatus('Template is empty.');
    return null;
  }
  let pastedTerrain = false;
  if (tileCells.length) {
    pastedTerrain = pasteTileTemplateAtTile({
      kind: 'tile-template',
      name: template.name || 'selection',
      cells: tileCells
    }, tileX, tileY) || pastedTerrain;
  }
  if (heightCells.length) {
    pastedTerrain = pasteTileTemplateAtTile({
      kind: 'height-template',
      name: template.name || 'selection',
      cells: heightCells
    }, tileX, tileY) || pastedTerrain;
  }
  const groups = [];
  for (const item of items) {
    const group = await pasteTemplateItemAtTile(item, tileX + (item.offsetX || 0), tileY + (item.offsetY || 0));
    if (group) groups.push(group);
  }
  if (!groups.length && !pastedTerrain) return null;
  if (groups.length) {
    refreshObjectPreviewLayer();
    pushUndo({ type: 'object-batch', groups });
  }
  setFileStatus('Pasted template ' + (template.name || 'selection') + '.');
  if (lastMouseEvent) updateHighlight(lastMouseEvent);
  return groups.length ? groups : true;
}

function getSelectedStructureTemplate() {
  const select = document.getElementById('structureTemplateSelect');
  const id = select?.value;
  return readStructureTemplates().find(template => template.id === id) || null;
}

function setSelectedStructureTemplateId(id) {
  const select = document.getElementById('structureTemplateSelect');
  if (!select) return;
  const previous = select.value;
  select.value = id || '';
  if (select.value !== previous) resetTemplatePlacementRotation();
  refreshStructureTemplateList();
  if (lastMouseEvent) updateHighlight(lastMouseEvent);
}

function getTemplatePlacementPlayer() {
  const select = document.getElementById('structureTemplatePlayerSelect');
  return Math.max(0, Math.min(10, parseInt(select?.value, 10) || 0));
}

function getTemplatePlacementRotation() {
  return ((selectedTemplateRotation % 4) + 4) % 4;
}

function updateStructureTemplateRotationDisplay() {
  const display = document.getElementById('structureTemplateRotationDisplay');
  if (display) display.textContent = (getTemplatePlacementRotation() * 90) + '°';
}

function rotateTemplatePlacement(delta) {
  selectedTemplateRotation = (getTemplatePlacementRotation() + delta + 4) % 4;
  updateStructureTemplateRotationDisplay();
  if (lastMouseEvent) updateHighlight(lastMouseEvent);
}

function resetTemplatePlacementRotation() {
  selectedTemplateRotation = 0;
  updateStructureTemplateRotationDisplay();
}

function getTemplateItemWithOwner(item, player) {
  const copy = cloneMapObjectData(item);
  if (!copy || typeof copy !== 'object') return item;
  if (copy.type === 'structure') {
    copy.player = player;
    if (copy.entry && typeof copy.entry === 'object') {
      if (copy.entry.player !== undefined) copy.entry.player = player;
      else copy.entry.startpos = player;
    }
  } else if (copy.type === 'droid') {
    copy.entry = cloneMapObjectData(copy.entry) || {};
    copy.entry.startpos = player;
    if (copy.entry.player !== undefined) copy.entry.player = player;
  }
  return copy;
}

function getTemplateDefaultPlayer(template) {
  const items = Array.isArray(template?.items) ? template.items : [];
  const ownedItem = items.find(item => item?.type === 'structure' || item?.type === 'droid');
  if (!ownedItem) return 0;
  if (ownedItem.type === 'structure') return Math.max(0, Math.min(10, parseInt(ownedItem.player, 10) || 0));
  return Math.max(0, Math.min(10, getObjectEntryPlayer(ownedItem.entry)));
}

function getTemplateBounds(items, tileCells = [], heightCells = []) {
  let width = 1;
  let height = 1;
  (items || []).forEach(item => {
    const { sizeX, sizeY } = getTemplateItemSize(item);
    width = Math.max(width, (item.offsetX || 0) + sizeX);
    height = Math.max(height, (item.offsetY || 0) + sizeY);
  });
  [...(tileCells || []), ...(heightCells || [])].forEach(cell => {
    width = Math.max(width, (cell.offsetX || 0) + 1);
    height = Math.max(height, (cell.offsetY || 0) + 1);
  });
  return { width, height };
}

function rotateTemplateLayoutParts(template, rotation) {
  const turns = ((rotation % 4) + 4) % 4;
  const items = Array.isArray(template?.items) ? template.items.map(item => cloneMapObjectData(item)) : [];
  const tileCells = Array.isArray(template?.tileCells) ? template.tileCells.map(cell => cloneMapObjectData(cell)) : [];
  const heightCells = Array.isArray(template?.heightCells) ? template.heightCells.map(cell => cloneMapObjectData(cell)) : [];
  if (!turns) return { items, tileCells, heightCells };
  const bounds = getTemplateBounds(items, tileCells, heightCells);
  const entries = [
    ...items.map(item => ({ kind: 'item', value: item, ...getTemplateItemSize(item) })),
    ...tileCells.map(cell => ({ kind: 'tile', value: cell, sizeX: 1, sizeY: 1 })),
    ...heightCells.map(cell => ({ kind: 'height', value: cell, sizeX: 1, sizeY: 1 }))
  ];
  const rotated = entries.map(entry => {
    const centerX = (entry.value.offsetX || 0) + entry.sizeX / 2;
    const centerY = (entry.value.offsetY || 0) + entry.sizeY / 2;
    let rotatedCenterX = centerX;
    let rotatedCenterY = centerY;
    if (turns === 1) {
      rotatedCenterX = centerY;
      rotatedCenterY = bounds.width - centerX;
    } else if (turns === 2) {
      rotatedCenterX = bounds.width - centerX;
      rotatedCenterY = bounds.height - centerY;
    } else if (turns === 3) {
      rotatedCenterX = bounds.height - centerY;
      rotatedCenterY = centerX;
    }
    return {
      ...entry,
      offsetX: Math.round(rotatedCenterX - entry.sizeX / 2),
      offsetY: Math.round(rotatedCenterY - entry.sizeY / 2)
    };
  });
  const minX = rotated.reduce((min, entry) => Math.min(min, entry.offsetX), Infinity);
  const minY = rotated.reduce((min, entry) => Math.min(min, entry.offsetY), Infinity);
  rotated.forEach(entry => {
    entry.value.offsetX = entry.offsetX - minX;
    entry.value.offsetY = entry.offsetY - minY;
  });
  return {
    items: rotated.filter(entry => entry.kind === 'item').map(entry => entry.value),
    tileCells: rotated.filter(entry => entry.kind === 'tile').map(entry => entry.value),
    heightCells: rotated.filter(entry => entry.kind === 'height').map(entry => entry.value)
  };
}

function getTemplateWithPlacementOptions(template, player = getTemplatePlacementPlayer(), rotation = getTemplatePlacementRotation()) {
  if (!template) return template;
  const items = Array.isArray(template.items)
    ? template.items.map(item => getTemplateItemWithOwner(item, player))
    : [];
  const rotated = rotateTemplateLayoutParts({ ...template, items }, rotation);
  return {
    ...template,
    items: rotated.items,
    tileCells: rotated.tileCells,
    heightCells: rotated.heightCells
  };
}

function isCopiedSelectionPasteArmed() {
  return !!(copiedMapObjectPasteArmed && copiedMapObject?.type === 'selection');
}

function getCopiedSelectionPlacementRotation() {
  return ((copiedSelectionPlacementRotation % 4) + 4) % 4;
}

function resetCopiedSelectionPlacementOptions(template = copiedMapObject) {
  copiedSelectionPlacementPlayer = getTemplateDefaultPlayer(template);
  copiedSelectionPlacementRotation = 0;
}

function setCopiedSelectionPlacementPlayer(player) {
  copiedSelectionPlacementPlayer = Math.max(0, Math.min(10, parseInt(player, 10) || 0));
  updateViewBulkSelectionPanel();
  if (lastMouseEvent) updateHighlight(lastMouseEvent);
}

function rotateCopiedSelectionPlacement(delta) {
  copiedSelectionPlacementRotation = (getCopiedSelectionPlacementRotation() + delta + 4) % 4;
  updateViewBulkSelectionPanel();
  if (lastMouseEvent) updateHighlight(lastMouseEvent);
}

function getCopiedSelectionPlacementTemplate() {
  if (!copiedMapObject || copiedMapObject.type !== 'selection') return null;
  return getTemplateWithPlacementOptions(
    copiedMapObject,
    copiedSelectionPlacementPlayer,
    getCopiedSelectionPlacementRotation()
  );
}

async function pasteSelectedStructureTemplateAtMouse() {
  const template = getTemplateWithPlacementOptions(getSelectedStructureTemplate());
  if (!template) {
    setFileStatus('No template selected.');
    return null;
  }
  const tile = getMapTileFromEvent(lastMouseEvent);
  if (!tile) {
    setFileStatus('Move mouse over the map before pasting.');
    return null;
  }
  try {
    return await pasteTemplateDataAtTile(template, tile.x, tile.y);
  } catch (err) {
    console.error('Failed to paste template:', err);
    setFileStatus('Failed to paste template.');
    return null;
  }
}

function deleteSelectedStructureTemplate() {
  const template = getSelectedStructureTemplate();
  if (!template) return false;
  const templates = readStructureTemplates().filter(item => item.id !== template.id);
  writeStructureTemplates(templates);
  refreshStructureTemplateList();
  setFileStatus('Deleted template ' + template.name + '.');
  if (lastMouseEvent) updateHighlight(lastMouseEvent);
  return true;
}

function renameSelectedStructureTemplate() {
  const template = getSelectedStructureTemplate();
  if (!template) {
    setFileStatus('No template selected.');
    return;
  }
  const nextName = window.prompt('Template name:', template.name || '');
  if (nextName === null) return;
  const cleanName = String(nextName).trim();
  if (!cleanName) {
    setFileStatus('Template name was not changed.');
    return;
  }
  const templates = readStructureTemplates();
  const item = templates.find(entry => entry.id === template.id);
  if (!item) return;
  item.name = cleanName;
  if (!writeStructureTemplates(templates)) {
    setFileStatus('Failed to rename template.');
    return;
  }
  refreshStructureTemplateList();
  setSelectedStructureTemplateId(item.id);
  setFileStatus('Renamed template to ' + cleanName + '.');
}

function cancelSelectedStructureTemplate() {
  const select = document.getElementById('structureTemplateSelect');
  const info = document.getElementById('structureTemplateInfo');
  if (select) select.selectedIndex = -1;
  if (info) info.textContent = readStructureTemplates().length ? 'Select a template from the list.' : 'No templates saved.';
  updateStructureTemplateSelectionButton(false);
  clearStructurePlacementPreview();
  setFileStatus('Template selection canceled.');
}

function hideTemplateContextMenu() {
  const menu = document.getElementById('templateContextMenu');
  if (menu) menu.style.display = 'none';
}

function selectStructureTemplateFromPointer(event) {
  const select = document.getElementById('structureTemplateSelect');
  if (!select || !select.options.length) return false;
  if (event.target?.tagName === 'OPTION') {
    const previous = select.value;
    select.value = event.target.value;
    if (select.value !== previous) resetTemplatePlacementRotation();
    refreshStructureTemplateList();
    if (lastMouseEvent) updateHighlight(lastMouseEvent);
    return true;
  }
  const rect = select.getBoundingClientRect();
  const visibleRows = Math.max(1, Math.min(select.size || select.options.length, select.options.length));
  const rowHeight = rect.height / visibleRows;
  const row = Math.floor((event.clientY - rect.top + select.scrollTop) / rowHeight);
  if (row < 0 || row >= select.options.length) return !!select.value;
  const previous = select.value;
  select.selectedIndex = row;
  if (select.value !== previous) resetTemplatePlacementRotation();
  refreshStructureTemplateList();
  if (lastMouseEvent) updateHighlight(lastMouseEvent);
  return true;
}

function showTemplateContextMenu(event) {
  event.preventDefault();
  event.stopPropagation();
  if (!selectStructureTemplateFromPointer(event) || !getSelectedStructureTemplate()) {
    hideTemplateContextMenu();
    return;
  }
  const menu = document.getElementById('templateContextMenu');
  if (!menu) return;
  menu.style.display = 'block';
  const width = menu.offsetWidth || 130;
  const height = menu.offsetHeight || 70;
  const left = Math.min(event.clientX, window.innerWidth - width - 4);
  const top = Math.min(event.clientY, window.innerHeight - height - 4);
  menu.style.left = Math.max(4, left) + 'px';
  menu.style.top = Math.max(4, top) + 'px';
}

async function pasteCopiedMapObjectAtMouse() {
  const tile = getMapTileFromEvent(lastMouseEvent);
  if (!tile) {
    setFileStatus('Move mouse over the map before pasting.');
    return null;
  }
  try {
    const pasted = await pasteCopiedMapObjectAtTile(tile.x, tile.y);
    if (pasted && !shouldKeepCopiedMapObjectPasteArmed()) disarmCopiedMapObjectPaste();
    else if (pasted) {
      updateViewBulkSelectionPanel();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    }
    return pasted;
  } catch (err) {
    console.error('Failed to paste copied object:', err);
    setFileStatus('Failed to paste copied object.');
    return null;
  }
}

async function pasteCopiedMapObjectFromEvent(event) {
  const tile = getMapTileFromEvent(event);
  if (!tile) {
    setFileStatus('Move mouse over the map before pasting.');
    return null;
  }
  try {
    const pasted = await pasteCopiedMapObjectAtTile(tile.x, tile.y);
    if (pasted && !shouldKeepCopiedMapObjectPasteArmed()) disarmCopiedMapObjectPaste();
    else if (pasted) {
      updateViewBulkSelectionPanel();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    }
    return pasted;
  } catch (err) {
    console.error('Failed to paste copied object:', err);
    setFileStatus('Failed to paste copied object.');
    return null;
  }
}

function getTemplateItemSize(item) {
  if (!item) return { sizeX: 1, sizeY: 1 };
  if (item.type === 'droid') return { sizeX: 1, sizeY: 1 };
  const def = getStructureDefById(item.defId);
  let sizeX = def?.sizeX || item.footprint?.sizeX || 1;
  let sizeY = def?.sizeY || item.footprint?.sizeY || 1;
  if ((item.rot || 0) % 2 === 1) {
    const tmp = sizeX;
    sizeX = sizeY;
    sizeY = tmp;
  }
  return { sizeX, sizeY };
}

function getTemplateItemPlacementValidity(item, tileX, tileY) {
  if (!item) return { valid: false, reason: 'Missing template item.' };
  const { sizeX, sizeY } = getTemplateItemSize(item);
  if (tileX < 0 || tileY < 0 || tileX + sizeX > mapW || tileY + sizeY > mapH) {
    return { valid: false, reason: 'Template does not fit inside the map.' };
  }
  if (item.type === 'droid') return { valid: true };
  const def = getStructureDefById(item.defId);
  if (!def) return { valid: false, reason: 'Missing structure definition.' };
  return getStructurePlacementValidity(def, tileX, tileY, sizeX, sizeY);
}

async function addTemplateItemPreview(root, item, tileX, tileY) {
  const { sizeX, sizeY } = getTemplateItemSize(item);
  const placement = getTemplateItemPlacementValidity(item, tileX, tileY);
  const color = placement.valid
    ? (item.type === 'droid' ? PLAYER_COLORS[getObjectEntryPlayer(item.entry) % PLAYER_COLORS.length] : 0x00ff00)
    : 0xff3333;
  const plane = createTerrainHighlightMesh(tileX, tileY, sizeX, sizeY, color, 0.32, 0.035);
  root.add(plane);

  let group = null;
  if (item.type === 'droid') {
    group = await buildDroidVisualFromEntry(item.entry, tileX, tileY);
  } else {
    const def = getStructureDefById(item.defId);
    if (def) {
      const modules = item.type === 'structure' ? item.modules : 0;
      group = await buildStructureGroup(getStructureRenderDef(def, modules), item.rot || 0, sizeX, sizeY, null, 0.55);
      const minH = getMinTerrainHeight(tileX, tileY, sizeX, sizeY);
      const pos = getStructurePlacementPosition(group, tileX, tileY, sizeX, sizeY, minH);
      pos.y += 0.02;
      group.position.copy(pos);
      if (item.type === 'structure') setStructureGroupPlayerColor(group, item.player || 0);
    }
  }
  if (group) {
    setPlacementPreviewOpacity(group, 0.55);
    tintPlacementPreview(group, placement.valid);
    root.add(group);
  }
  return placement.valid;
}

async function updateTemplatePlacementPreview(template, tileX, tileY, modelKey, previewKey, token, infoElementId = 'structureTemplateInfo') {
  const root = new THREE.Group();
  const items = Array.isArray(template?.items) ? template.items : [];
  const terrainCells = [
    ...(Array.isArray(template?.tileCells) ? template.tileCells : []),
    ...(Array.isArray(template?.heightCells) ? template.heightCells : [])
  ];
  let allValid = true;
  if (terrainCells.length) {
    const minX = terrainCells.reduce((min, cell) => Math.min(min, cell.offsetX || 0), Infinity);
    const minY = terrainCells.reduce((min, cell) => Math.min(min, cell.offsetY || 0), Infinity);
    const maxX = terrainCells.reduce((max, cell) => Math.max(max, cell.offsetX || 0), -Infinity);
    const maxY = terrainCells.reduce((max, cell) => Math.max(max, cell.offsetY || 0), -Infinity);
    const placement = getTileTemplatePlacementValidity({ cells: terrainCells }, tileX, tileY);
    allValid = allValid && placement.valid;
    const color = placement.valid ? 0x6cf527 : 0xff3333;
    root.add(createTerrainHighlightMesh(tileX + minX, tileY + minY, maxX - minX + 1, maxY - minY + 1, color, 0.28, 0.04));
  }
  for (const item of items) {
    if (token !== highlightLoadToken) {
      disposeObject3D(root);
      return;
    }
    const ok = await addTemplateItemPreview(root, item, tileX + (item.offsetX || 0), tileY + (item.offsetY || 0));
    allValid = allValid && ok;
  }
  if (token !== highlightLoadToken) {
    disposeObject3D(root);
    return;
  }
  root.traverse(obj => obj.layers.set(1));
  clearStructurePlacementPreview();
  previewGroup = root;
  highlightMesh = root;
  scene.add(root);
  highlightModelGroup = null;
  highlightModelKey = modelKey;
  highlightCachedKey = previewKey;
  highlightLoadingKey = null;
  const info = infoElementId ? document.getElementById(infoElementId) : null;
  if (info) {
    info.textContent = formatTemplateContents(
      template,
      allValid ? 'Click the map to paste.' : 'Red preview parts cannot be pasted here.'
    );
  }
}

function getCopiedMapObjectPreviewTemplate() {
  if (!copiedMapObject) return null;
  if (copiedMapObject.type === 'selection') return getCopiedSelectionPlacementTemplate();
  const item = cloneMapObjectData(copiedMapObject);
  if (!item || typeof item !== 'object') return null;
  item.offsetX = 0;
  item.offsetY = 0;
  return {
    id: 'copied-map-object-' + copiedMapObjectVersion,
    name: copiedMapObject.name || copiedMapObject.kind || 'copied object',
    items: [item]
  };
}

function updateCopiedMapObjectPlacementPreview(event) {
  if (!isCopiedMapObjectPasteMode()) return false;
  clearHoveredStructure();
  clearHoveredDroid();
  const template = getCopiedMapObjectPreviewTemplate();
  const tile = getMapTileFromEvent(event);
  if (!template || !tile) {
    clearStructurePlacementPreview();
    return true;
  }
  const copyPlacementKey = copiedMapObject.type === 'selection'
    ? '|p' + copiedSelectionPlacementPlayer + '|r' + getCopiedSelectionPlacementRotation()
    : '';
  const modelKey = 'copied|' + copiedMapObjectVersion + '|' + copiedMapObject.type + '|' + (template.items?.length || 0) + copyPlacementKey;
  const previewKey = modelKey + '|' + tile.x + '|' + tile.y;
  if (previewKey === highlightCachedKey && previewGroup && highlightModelKey === modelKey) return true;
  if (highlightLoadingKey === previewKey) return true;
  clearStructurePlacementPreview();
  highlightLoadingKey = previewKey;
  const token = ++highlightLoadToken;
  updateTemplatePlacementPreview(template, tile.x, tile.y, modelKey, previewKey, token, null)
    .catch(err => {
      if (highlightLoadingKey === previewKey) highlightLoadingKey = null;
      console.warn('Copied placement preview failed:', err);
    });
  return true;
}

function clearViewBulkSelection(clearStoredArea = true) {
  viewBulkSelection = [];
  viewBulkSelectionHelpers.forEach(helper => {
    if (scene) scene.remove(helper);
  });
  viewBulkSelectionHelpers = [];
  if (clearStoredArea) {
    viewBulkSelectionArea = null;
    clearViewTerrainSelection();
  }
  document.querySelectorAll('[data-view-bulk-controls]').forEach(controls => {
    controls.style.display = 'none';
  });
}

function cancelViewBulkSelection() {
  if (!viewBulkSelection.length && !viewAreaDrag && !hasViewTerrainSelection()) return false;
  viewAreaDrag = null;
  if (viewAreaOverlay) viewAreaOverlay.style.display = 'none';
  clearViewBulkSelection();
  disarmCopiedMapObjectPaste();
  setFileStatus('Selection canceled.');
  return true;
}

function isTemplateNameDialogOpen() {
  return !!(templateNameDialog && !templateNameDialog.classList.contains('hidden'));
}

function isTemplateContextMenuOpen() {
  const menu = document.getElementById('templateContextMenu');
  return !!(menu && menu.style.display !== 'none' && menu.style.display !== '');
}

function cancelTileSelectionRectangle() {
  if (activeTab !== 'textures' || !(tileSelectionMode || tileViewMode) || (!tileSelectStart && !tileSelectEnd && !tileSelectionFixed && !tileViewDrag)) return false;
  clearTileSelectionState();
  setFileStatus('Tile selection canceled.');
  return true;
}

function cancelHeightSelectionRectangle() {
  if (activeTab !== 'height' || !heightSelectionMode || (!heightSelectStart && !heightSelectEnd)) return false;
  heightSelectStart = null;
  heightSelectEnd = null;
  clearEditHighlight();
  updateHeightApplyBtn();
  setFileStatus('Height selection canceled.');
  return true;
}

function cancelBuildPlacementPreview() {
  if (activeTab === 'objects' && structureMode === 'build') {
    setStructureMode('view');
    setFileStatus('Structure build canceled.');
    return true;
  }
  if (activeTab === 'droids' && droidMode === 'build') {
    setDroidMode('view');
    setFileStatus('Droid build canceled.');
    return true;
  }
  if (activeTab === 'features' && featureMode === 'build') {
    setFeatureMode('view');
    setFileStatus('Object build canceled.');
    return true;
  }
  return false;
}

function cancelTemplatePlacementSelection() {
  if (activeTab !== 'templates' || !getSelectedStructureTemplate()) return false;
  cancelSelectedStructureTemplate();
  return true;
}

function cancelShortcutAction() {
  if (isTemplateNameDialogOpen()) {
    closeTemplateNameDialog(null);
    return true;
  }
  if (isCopiedMapObjectPasteMode()) {
    cancelCopiedMapObjectPaste();
    return true;
  }
  if (cancelTileTemplatePaste()) return true;
  if (cancelViewBulkSelection()) return true;
  if (isTemplateContextMenuOpen()) {
    hideTemplateContextMenu();
    return true;
  }
  if (cancelTemplatePlacementSelection()) return true;
  if (cancelBuildPlacementPreview()) return true;
  if (cancelTileSelectionRectangle()) return true;
  if (cancelHeightSelectionRectangle()) return true;
  return false;
}

function hasShortcutCancelAction() {
  return isTemplateNameDialogOpen() ||
    isCopiedMapObjectPasteMode() ||
    isTileTemplatePasteMode() ||
    viewBulkSelection.length ||
    viewAreaDrag ||
    hasViewTerrainSelection() ||
    isTemplateContextMenuOpen() ||
    (activeTab === 'templates' && !!getSelectedStructureTemplate()) ||
    (activeTab === 'objects' && structureMode === 'build') ||
    (activeTab === 'droids' && droidMode === 'build') ||
    (activeTab === 'features' && featureMode === 'build') ||
    (activeTab === 'textures' && (tileSelectionMode || tileViewMode) && !!(tileSelectStart || tileSelectEnd || tileSelectionFixed || tileViewDrag)) ||
    (activeTab === 'height' && heightSelectionMode && !!(heightSelectStart || heightSelectEnd));
}

function isBulkSelectionViewMode() {
  return activeTab === 'view' ||
    (activeTab === 'objects' && structureMode === 'view') ||
    (activeTab === 'droids' && droidMode === 'view') ||
    (activeTab === 'features' && featureMode === 'view');
}

function getViewSelectionTypeFilters() {
  return {
    structures: document.getElementById('viewSelectStructures')?.checked !== false,
    droids: document.getElementById('viewSelectDroids')?.checked !== false,
    objects: document.getElementById('viewSelectObjects')?.checked !== false,
    tiles: document.getElementById('viewSelectTiles')?.checked !== false,
    height: document.getElementById('viewSelectHeight')?.checked !== false,
  };
}

function isGroupAllowedByViewSelectionFilters(group) {
  if (activeTab !== 'view') return true;
  const filters = getViewSelectionTypeFilters();
  if (group.userData?.droidExport) return filters.droids;
  if (group.userData?.featureExport || isFeatureGroup(group)) return filters.objects;
  if (group.userData?.structureExport) return filters.structures;
  return false;
}

function clearViewTerrainSelection() {
  tileSelectStart = null;
  tileSelectEnd = null;
  tileSelectionFixed = false;
  heightSelectStart = null;
  heightSelectEnd = null;
  heightViewTile = null;
}

function hasViewTerrainSelection() {
  return activeTab === 'view' && !!(getTileSelectionBounds() || getHeightSelectionBounds());
}

function setViewTerrainSelection(range) {
  clearViewTerrainSelection();
  if (activeTab !== 'view' || !range) return;
  const filters = getViewSelectionTypeFilters();
  if (filters.tiles) {
    tileSelectStart = { x: range.start.x, y: range.start.y };
    tileSelectEnd = { x: range.end.x, y: range.end.y };
    tileSelectionFixed = true;
  }
  if (filters.height) {
    heightSelectStart = { x: range.start.x, y: range.start.y };
    heightSelectEnd = { x: range.end.x, y: range.end.y };
  }
}

function getViewTerrainSelectionStats() {
  if (activeTab !== 'view') return null;
  const filters = getViewSelectionTypeFilters();
  const tileBounds = filters.tiles ? getTileSelectionBounds() : null;
  const heightBounds = filters.height ? getHeightSelectionBounds() : null;
  const tileCount = tileBounds ? tileBounds.width * tileBounds.height : 0;
  const heightCount = heightBounds ? heightBounds.width * heightBounds.height : 0;
  return { tileBounds, heightBounds, tileCount, heightCount };
}

function isGroupSelectableInActiveBulkView(group) {
  if (!group) return false;
  if (activeTab === 'view') {
    return !!(group.userData?.structureExport || group.userData?.droidExport || group.userData?.featureExport) &&
      isGroupAllowedByViewSelectionFilters(group);
  }
  if (activeTab === 'droids') return !!group.userData?.droidExport;
  if (activeTab === 'features') return isFeatureGroup(group);
  if (activeTab === 'objects') {
    return !!group.userData?.structureExport && !group.userData?.featureExport;
  }
  return false;
}

function updateViewBulkSelectionPanel() {
  const controlsList = Array.from(document.querySelectorAll('[data-view-bulk-controls]'));
  if (!controlsList.length) return;
  const terrainStats = getViewTerrainSelectionStats();
  const terrainCount = (terrainStats?.tileCount || 0) + (terrainStats?.heightCount || 0);
  const showControls = isBulkSelectionViewMode() && (viewBulkSelection.length || terrainCount);
  const structures = viewBulkSelection.filter(group => group.userData?.structureExport).length;
  const droids = viewBulkSelection.filter(group => group.userData?.droidExport).length;
  const features = viewBulkSelection.filter(group => group.userData?.featureExport).length;
  const hasObjects = viewBulkSelection.length > 0;
  const hasTiles = !!terrainStats?.tileCount;
  const hasHeight = !!terrainStats?.heightCount;
  const terrainOnly = !hasObjects && (hasTiles || hasHeight);
  const hasAnySelection = hasObjects || hasTiles || hasHeight;
  const names = new Map();
  const copiedSelectionArmed = isCopiedSelectionPasteArmed();
  const copiedTileArmed = tileTemplatePasteArmed && copiedTileTemplate?.kind === 'tile-selection';
  const copiedHeightArmed = tileTemplatePasteArmed && copiedTileTemplate?.kind === 'height-selection';
  const copiedTerrainArmed = terrainOnly && ((hasTiles && copiedTileArmed) || (hasHeight && copiedHeightArmed));
  const copiedAnyArmed = copiedSelectionArmed || copiedTerrainArmed;
  viewBulkSelection.forEach(group => {
    const structureDef = getStructureGroupDef(group);
    const droid = group.userData?.droidExport;
    const name = structureDef?.name || droid?.name || droid?.template || 'Unknown object';
    names.set(name, (names.get(name) || 0) + 1);
  });
  const list = Array.from(names.entries()).map(([name, count]) => name + (count > 1 ? ' x' + count : '')).join('\n');
  controlsList.forEach(controls => {
    const summary = controls.querySelector('[data-view-bulk-summary]');
    const select = controls.querySelector('[data-view-bulk-player-select]');
    const copyBtn = controls.querySelector('[data-view-bulk-action="copy"]');
    const templateBtn = controls.querySelector('[data-view-bulk-action="template"]');
    const deleteBtn = controls.querySelector('[data-view-bulk-action="delete"]');
    const copyControls = controls.querySelector('[data-copy-placement-controls]');
    const copyPlayerSelect = controls.querySelector('[data-copy-placement-player-select]');
    const copyRotationDisplay = controls.querySelector('[data-copy-placement-rotation-display]');
    controls.style.display = showControls ? 'block' : 'none';
    if (copyBtn) {
      copyBtn.disabled = copiedAnyArmed ? false : !hasAnySelection;
      copyBtn.textContent = copiedAnyArmed ? 'Copied' : 'Copy';
      copyBtn.classList.toggle('active', copiedAnyArmed);
      copyBtn.title = '';
    }
    if (templateBtn) {
      templateBtn.disabled = copiedAnyArmed || !hasAnySelection;
      templateBtn.title = '';
    }
    if (deleteBtn) deleteBtn.disabled = copiedAnyArmed || !viewBulkSelection.length;
    if (summary) {
      const lines = [
        'Selected area',
        'Structures: ' + structures,
        'Droids: ' + droids,
        'Objects: ' + features,
        'Tiles: ' + (terrainStats?.tileCount || 0),
        'Height: ' + (terrainStats?.heightCount || 0),
        'Total: ' + (viewBulkSelection.length + terrainCount)
      ];
      if (list) {
        lines.push('', list);
      }
      summary.textContent = lines.join('\n');
    }
    if (select) {
      populatePlayerSelect(select);
      select.disabled = copiedAnyArmed || !hasObjects;
      const ownerRow = select.closest('div');
      if (ownerRow) ownerRow.style.opacity = (copiedAnyArmed || !hasObjects) ? '0.55' : '';
    }
    if (copyControls) {
      copyControls.style.display = copiedSelectionArmed ? 'block' : 'none';
    }
    if (copyPlayerSelect) {
      populatePlayerSelect(copyPlayerSelect);
      copyPlayerSelect.value = String(copiedSelectionPlacementPlayer);
    }
    if (copyRotationDisplay) {
      copyRotationDisplay.textContent = (getCopiedSelectionPlacementRotation() * 90) + '\u00B0';
    }
  });
}

function applyViewBulkSelectionOwner(player) {
  let changed = 0;
  viewBulkSelection.forEach(group => {
    if (group.userData?.structureExport) {
      setStructurePlayer(group, player);
      changed++;
    } else if (group.userData?.droidExport) {
      setDroidPlayer(group, player);
      changed++;
    }
  });
  updateViewBulkSelectionPanel();
  document.querySelectorAll('[data-view-bulk-player-select]').forEach(select => {
    select.value = String(player);
  });
  setFileStatus(changed
    ? 'Changed owner for ' + changed + ' selected object' + (changed === 1 ? '' : 's') + '.'
    : 'Selected objects do not have an owner.');
}

function deleteViewBulkSelection() {
  if (!viewBulkSelection.length) return false;
  const groups = viewBulkSelection.slice();
  clearViewBulkSelection();
  disarmCopiedMapObjectPaste();
  const removed = [];
  groups.forEach(group => {
    const didRemove = group.userData?.droidExport
      ? removeDroidGroup(group)
      : removeStructureGroup(group);
    if (didRemove) removed.push(group);
  });
  if (!removed.length) {
    setFileStatus('No selected objects were deleted.');
    return false;
  }
  pushUndo({ type: 'object-batch-delete', groups: removed });
  setFileStatus('Deleted ' + removed.length + ' selected object' + (removed.length === 1 ? '' : 's') + '.');
  updateViewBulkSelectionPanel();
  return true;
}

function deleteSelectedDroidViewObject() {
  const group = selectedDroidGroup;
  if (!group || !removeDroidGroup(group)) return false;
  pushUndo({ type: 'droid-delete', group });
  updateDroidInfo(null, 'No droid selected.');
  updateDroidModeUI();
  setFileStatus('Deleted selected droid.');
  return true;
}

function deleteSelectedStructureViewObject() {
  const group = selectedStructureGroup;
  if (!group || isFeatureGroup(group)) return false;
  if (selectedStructureLayer === 'module') {
    removeTopStructureModule(group)
      .then(newGroup => {
        if (newGroup) selectStructureGroup(newGroup);
      })
      .catch(err => {
        console.error('Failed to delete selected module:', err);
        setFileStatus('Failed to delete selected module.');
      });
    return true;
  }
  removeStructureGroupWithWallRefresh(group)
    .then(action => {
      if (!action) return;
      pushUndo(action);
      updateStructureInfo(null, 'No structure selected.');
      updateStructureModeUI();
      setFileStatus('Deleted selected structure.');
    })
    .catch(err => {
      console.error('Failed to delete selected structure:', err);
      setFileStatus('Failed to delete selected structure.');
    });
  return true;
}

function deleteSelectedFeatureViewObject() {
  const group = isFeatureGroup(selectedStructureGroup) ? selectedStructureGroup : null;
  if (!group || !removeStructureGroup(group)) return false;
  pushUndo({ type: 'structure-delete', group });
  updateFeatureInfo(null, 'No object selected.');
  updateFeatureModeUI();
  setFileStatus('Deleted selected object.');
  return true;
}

function deleteSelectedMapObjectShortcut() {
  if (activeTab === 'droids' && droidMode === 'view') return deleteSelectedDroidViewObject();
  if (activeTab === 'objects' && structureMode === 'view') return deleteSelectedStructureViewObject();
  if (activeTab === 'features' && featureMode === 'view') return deleteSelectedFeatureViewObject();
  if (activeTab === 'view') {
    if (selectedDroidGroup) return deleteSelectedDroidViewObject();
    if (isFeatureGroup(selectedStructureGroup)) return deleteSelectedFeatureViewObject();
    if (selectedStructureGroup) return deleteSelectedStructureViewObject();
  }
  return false;
}

function deleteShortcutAction(target = null) {
  const tagName = target?.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable) return false;
  if (tagName === 'SELECT' && target !== localSaveSelect && target?.id !== 'structureTemplateSelect') return false;
  if (activeTab === 'file') return deleteSelectedLocalSave();
  if (activeTab === 'templates') return deleteSelectedStructureTemplate();
  if (deleteViewBulkSelection()) return true;
  return deleteSelectedMapObjectShortcut();
}

function selectViewArea(start, end) {
  clearViewBulkSelection(false);
  if (!start || !end) {
    viewBulkSelectionArea = null;
    return;
  }
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  viewBulkSelectionArea = {
    type: 'tile',
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
  };
  setViewTerrainSelection({ start, end });
  viewBulkSelection = objectsGroup.children.filter(group => {
    if (!isGroupSelectableInActiveBulkView(group)) return false;
    const footprint = getStructureFootprint(group);
    if (footprint) {
      return footprint.x <= maxX && footprint.x + footprint.sizeX - 1 >= minX &&
        footprint.y <= maxY && footprint.y + footprint.sizeY - 1 >= minY;
    }
    const tile = getObjectEntryTile(group.userData?.droidExport);
    return tile && tile.x >= minX && tile.x <= maxX && tile.y >= minY && tile.y <= maxY;
  });
  viewBulkSelection.forEach(group => {
    const helper = new THREE.BoxHelper(group, 0x6cf527);
    helper.layers.set(1);
    viewBulkSelectionHelpers.push(helper);
    if (scene) scene.add(helper);
  });
  updateViewBulkSelectionPanel();
  if (activeTab === 'view') updateHighlight(lastMouseEvent);
}

function getObjectScreenBounds(group) {
  if (!group || !threeContainer || !camera) return null;
  const box = new THREE.Box3().setFromObject(group);
  const points = [];
  if (box.isEmpty()) {
    points.push(group.getWorldPosition(new THREE.Vector3()));
  } else {
    points.push(
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z)
    );
  }
  const rect = threeContainer.getBoundingClientRect();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach(point => {
    const projected = point.project(camera);
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return;
    const x = rect.left + (projected.x + 1) * 0.5 * rect.width;
    const y = rect.top + (1 - projected.y) * 0.5 * rect.height;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

function selectViewScreenArea(startClientX, startClientY, endClientX, endClientY) {
  clearViewBulkSelection(false);
  if (!objectsGroup) {
    viewBulkSelectionArea = null;
    return;
  }
  const minX = Math.min(startClientX, endClientX);
  const maxX = Math.max(startClientX, endClientX);
  const minY = Math.min(startClientY, endClientY);
  const maxY = Math.max(startClientY, endClientY);
  viewBulkSelectionArea = {
    type: 'screen',
    startClientX,
    startClientY,
    endClientX,
    endClientY,
  };
  setViewTerrainSelection(getTileRangeFromScreenArea(startClientX, startClientY, endClientX, endClientY));
  viewBulkSelection = objectsGroup.children.filter(group => {
    if (!isGroupSelectableInActiveBulkView(group)) return false;
    const bounds = getObjectScreenBounds(group);
    return bounds && bounds.minX <= maxX && bounds.maxX >= minX &&
      bounds.minY <= maxY && bounds.maxY >= minY;
  });
  viewBulkSelection.forEach(group => {
    const helper = new THREE.BoxHelper(group, 0x6cf527);
    helper.layers.set(1);
    viewBulkSelectionHelpers.push(helper);
    if (scene) scene.add(helper);
  });
  updateViewBulkSelectionPanel();
  if (activeTab === 'view') updateHighlight(lastMouseEvent);
}

function refreshViewBulkSelectionFilters() {
  if (activeTab !== 'view') return;
  if (!viewBulkSelectionArea) {
    updateViewBulkSelectionPanel();
    return;
  }
  if (viewBulkSelectionArea.type === 'screen') {
    selectViewScreenArea(
      viewBulkSelectionArea.startClientX,
      viewBulkSelectionArea.startClientY,
      viewBulkSelectionArea.endClientX,
      viewBulkSelectionArea.endClientY
    );
  } else {
    selectViewArea(viewBulkSelectionArea.start, viewBulkSelectionArea.end);
  }
}

function beginViewAreaDrag(event) {
  clearViewBulkSelection();
  const tile = getMapTileFromEvent(event);
  viewAreaDrag = { clientX: event.clientX, clientY: event.clientY, start: tile, end: tile, usesScreenSelection: !tile };
  if (!viewAreaOverlay) {
    viewAreaOverlay = document.createElement('div');
    viewAreaOverlay.style.position = 'fixed';
    viewAreaOverlay.style.pointerEvents = 'none';
    viewAreaOverlay.style.border = '1px solid #6cf527';
    viewAreaOverlay.style.background = 'rgba(108,245,39,0.12)';
    viewAreaOverlay.style.zIndex = '250';
    document.body.appendChild(viewAreaOverlay);
  }
  updateViewAreaDrag(event);
}

function updateViewAreaDrag(event) {
  if (!viewAreaDrag || !viewAreaOverlay) return;
  const tile = getMapTileFromEvent(event);
  if (tile) {
    viewAreaDrag.end = tile;
  } else {
    viewAreaDrag.usesScreenSelection = true;
  }
  const left = Math.min(viewAreaDrag.clientX, event.clientX);
  const top = Math.min(viewAreaDrag.clientY, event.clientY);
  viewAreaOverlay.style.display = 'block';
  viewAreaOverlay.style.left = left + 'px';
  viewAreaOverlay.style.top = top + 'px';
  viewAreaOverlay.style.width = Math.abs(event.clientX - viewAreaDrag.clientX) + 'px';
  viewAreaOverlay.style.height = Math.abs(event.clientY - viewAreaDrag.clientY) + 'px';
}

function finishViewAreaDrag(event) {
  if (!viewAreaDrag) return;
  const drag = viewAreaDrag;
  viewAreaDrag = null;
  if (viewAreaOverlay) viewAreaOverlay.style.display = 'none';
  const distance = Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY);
  if (activeTab === 'textures' && tileViewMode) {
    if (distance < 6) {
      const tile = getMapTileFromEvent(event) || drag.end || drag.start;
      tileSelectStart = null;
      tileSelectEnd = null;
      tileSelectionFixed = false;
      if (tile) {
        updateTileViewInfoAt(tile.x, tile.y);
      } else {
        updateTileViewInfoAt(-1, -1);
      }
      updateTileApplyBtn();
      updateHighlight(event);
      return;
    }
    const range = (drag.usesScreenSelection || !drag.start || !drag.end)
      ? getTileRangeFromScreenArea(drag.clientX, drag.clientY, event.clientX, event.clientY)
      : { start: drag.start, end: drag.end };
    if (!range) {
      clearTileSelectionState();
      setFileStatus('No map tiles selected.');
      return;
    }
    tileSelectStart = range.start;
    tileSelectEnd = range.end;
    tileSelectionFixed = true;
    updateTileApplyBtn();
    updateHighlight(event);
    return;
  }
  if (activeTab === 'height' && heightViewMode) {
    if (distance < 6) {
      const tile = getMapTileFromEvent(event) || drag.end || drag.start;
      heightSelectStart = null;
      heightSelectEnd = null;
      if (tile) {
        updateHeightViewInfoAt(tile.x, tile.y);
      } else {
        updateHeightViewInfoAt(-1, -1);
      }
      updateHeightApplyBtn();
      updateHighlight(event);
      return;
    }
    const range = (drag.usesScreenSelection || !drag.start || !drag.end)
      ? getTileRangeFromScreenArea(drag.clientX, drag.clientY, event.clientX, event.clientY)
      : { start: drag.start, end: drag.end };
    if (!range) {
      heightSelectStart = null;
      heightSelectEnd = null;
      heightViewTile = null;
      updateHeightViewInfoAt(-1, -1);
      updateHeightApplyBtn();
      setFileStatus('No height area selected.');
      return;
    }
    heightViewTile = null;
    heightSelectStart = range.start;
    heightSelectEnd = range.end;
    updateHeightViewSelectionInfo();
    updateHeightApplyBtn();
    updateHighlight(event);
    return;
  }
  if (distance < 6) {
    if (isBulkSelectionViewMode()) {
      if (!routeActiveBulkObjectSelection(event)) {
        if (activeTab === 'view') {
          const filters = getViewSelectionTypeFilters();
          const tile = getMapTileFromEvent(event) || drag.end || drag.start;
          if (tile && (filters.tiles || filters.height)) {
            selectViewArea(tile, tile);
            updateHighlight(event);
            return;
          }
          const info = document.getElementById('viewSelectionInfo');
          if (info) info.textContent = 'No map object selected.';
        } else if (activeTab === 'droids') {
          clearSelectedDroid();
          updateDroidInfo(null, 'No droid selected.');
        } else if (activeTab === 'features') {
          clearSelectedStructure();
          updateFeatureInfo(null, 'No object selected.');
        } else {
          clearSelectedStructure();
          updateStructureInfo(null, 'No structure selected.');
        }
      }
      return;
    }
    updateViewSelectionInfo(event);
    return;
  }
  if (drag.usesScreenSelection || !drag.start || !drag.end) {
    selectViewScreenArea(drag.clientX, drag.clientY, event.clientX, event.clientY);
  } else {
    selectViewArea(drag.start, drag.end);
  }
}

function getDroidPlayer(group) {
  const entry = group?.userData?.droidExport || {};
  return getObjectEntryPlayer(entry);
}

function setDroidPlayer(group, player) {
  if (!group?.userData?.droidExport) return;
  const nextPlayer = Math.max(0, Math.min(10, parseInt(player, 10) || 0));
  group.userData.droidExport.startpos = nextPlayer;
  if (group.userData.droidExport.player !== undefined) group.userData.droidExport.player = nextPlayer;
  updateDroidInfo(group);
  updateMinimap();
}

function populatePlayerSelect(select) {
  if (!select || select.options.length) return;
  for (let i = 0; i <= 10; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = 'Player ' + i;
    select.appendChild(opt);
  }
}

function getDroidRotationDegrees(group) {
  const entry = group?.userData?.droidExport || {};
  if (entry.rotDeg !== undefined) return normalizeDegrees(entry.rotDeg);
  const raw = Array.isArray(entry.rotation) ? entry.rotation[1] : entry.rotation;
  if (typeof raw === 'number') return normalizeDegrees(Math.abs(raw) > 360 ? raw * 360 / 65536 : raw);
  return normalizeDegrees(-group.rotation.y * 180 / Math.PI);
}

function setDroidRotationDegrees(group, degrees) {
  if (!group?.userData?.droidExport) return;
  const deg = normalizeDegrees(degrees);
  group.userData.droidExport.rotDeg = deg;
  group.userData.droidExport.rotation = [0, degreesToWzAngle(deg), 0];
  group.rotation.y = -deg * Math.PI / 180;
  if (selectedDroidBlinkHelper) selectedDroidBlinkHelper.update();
  if (hoveredDroidHelper) hoveredDroidHelper.update();
  updateDroidInfo(group);
}

function updateDroidInfo(group, fallback = 'No droid selected.') {
  const info = document.getElementById('droidInfo');
  if (!info) return;
  if (!group?.userData?.droidExport) {
    info.textContent = fallback;
    updateDroidViewPlayerControls(null);
    return;
  }
  info.textContent = describeDroidGroup(group);
  updateDroidViewPlayerControls(group);
}

function updateDroidViewPlayerControls(group) {
  const controls = document.getElementById('droidViewPlayerControls');
  const select = document.getElementById('droidViewPlayerSelect');
  if (!controls || !select) return;
  const show = droidMode === 'view' && !!group;
  controls.style.display = show ? 'flex' : 'none';
  if (!show) return;
  populatePlayerSelect(select);
  select.value = String(getDroidPlayer(group));
}

function describeDroidGroup(group) {
  const entry = group.userData.droidExport;
  const tile = getObjectEntryTile(entry);
  return [
    'Selected droid',
    'Name: ' + (entry.name || entry.template || 'Builder Truck'),
    'Template: ' + (entry.template || 'custom'),
    'Player: ' + getDroidPlayer(group),
    tile ? ('Tile: ' + tile.x + ', ' + tile.y) : 'Tile: unknown',
    'Rotation: ' + Math.round(getDroidRotationDegrees(group)) + ' deg'
  ].join('\n');
}

function updateViewSelectionInfo(event) {
  const info = document.getElementById('viewSelectionInfo');
  if (!info) return;
  if (routeMapObjectSelection(event)) return;
  info.textContent = 'No map object selected.';
}

function updateTileViewInfoAt(tileX, tileY) {
  const info = document.getElementById('tileViewInfo');
  if (tileX < 0 || tileY < 0 || tileX >= mapW || tileY >= mapH) {
    if (info) info.textContent = 'No tile selected.';
    return;
  }
  const tileId = mapTiles[tileY][tileX];
  const tileType = tileTypesById[tileId] ?? 0;
  selectedTileId = tileId;
  selectedRotation = mapRotations[tileY][tileX] || 0;
  selectedXFlip = !!mapXFlip[tileY]?.[tileX];
  updateSelectedInfo();
  renderTexturePalette();
  if (info) {
    info.textContent = [
      'Selected map tile',
      'Tile: ' + tileX + ', ' + tileY,
      'Texture: ' + tileId,
      'Type: ' + (TILE_TYPE_NAMES[tileType] || tileType),
      'Height: ' + mapHeights[tileY][tileX],
      'Rotation: ' + ((mapRotations[tileY][tileX] || 0) * 90) + ' deg',
      'Flip: ' + (selectedXFlip ? 'On' : 'Off')
    ].join('\n');
  }
}

function setSelectedHeightFromMap(height) {
  const clamped = Math.max(0, Math.min(heightMax, parseInt(height, 10) || 0));
  selectedHeight = clamped;
  if (heightInput) heightInput.value = clamped;
  if (heightSlider) heightSlider.value = clamped;
}

function updateHeightViewInfoAt(tileX, tileY) {
  const info = document.getElementById('heightViewInfo');
  if (tileX < 0 || tileY < 0 || tileX >= mapW || tileY >= mapH) {
    heightViewTile = null;
    if (info) info.textContent = 'No height selected.';
    return;
  }
  const height = mapHeights[tileY][tileX] || 0;
  heightViewTile = { x: tileX, y: tileY };
  setSelectedHeightFromMap(height);
  if (info) {
    info.textContent = [
      'Selected map height',
      'Tile: ' + tileX + ', ' + tileY,
      'Height: ' + height
    ].join('\n');
  }
}

function restoreHeightViewHighlight() {
  if (activeTab !== 'height' || !heightViewMode) return;
  if (isTileTemplatePasteMode()) return;
  if (!heightViewTile && !getHeightSelectionBounds()) return;
  updateHighlight(null);
}

function updateTileViewInfoFromEvent(event) {
  const rect = threeContainer.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(scene.children, true)[0];
  const tileX = hit ? Math.floor(hit.point.x) : -1;
  const tileY = hit ? Math.floor(hit.point.z) : -1;
  updateTileViewInfoAt(tileX, tileY);
}

function hasFinishedTileSelection() {
  return !!(tileSelectStart && tileSelectEnd && tileSelectionFixed);
}

function getBrushCells(tileX, tileY, shape = 'square') {
  const size = Math.max(1, Math.min(255, parseInt(brushSize, 10) || 1));
  if (shape === 'line') {
    const rot = ((selectedRotation % 4) + 4) % 4;
    const dirs = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 }
    ];
    const dir = dirs[rot] || dirs[0];
    return Array.from({ length: size }, (_, i) => ({
      x: tileX + dir.x * i,
      y: tileY + dir.y * i
    }));
  }
  const cells = [];
  const center = (size - 1) / 2;
  const circleRadius = Math.max(0.75, size / 2 - 0.25);
  const diamondRadius = size / 2;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const rx = dx - center;
      const ry = dy - center;
      if (shape === 'circle' && Math.hypot(rx, ry) > circleRadius) continue;
      if (shape === 'diamond' && Math.abs(rx) + Math.abs(ry) > diamondRadius) continue;
      cells.push({ x: tileX + dx, y: tileY + dy });
    }
  }
  return cells;
}

function getMirroredTerrainCells(cells) {
  const modes = [{ x: false, y: false }];
  if (terrainMirrorMode === 'vertical' || terrainMirrorMode === 'both') modes.push({ x: true, y: false });
  if (terrainMirrorMode === 'horizontal' || terrainMirrorMode === 'both') modes.push({ x: false, y: true });
  if (terrainMirrorMode === 'both') modes.push({ x: true, y: true });
  if (modes.length === 1) return cells;
  const mirrored = [];
  const seen = new Set();
  cells.forEach(cell => {
    modes.forEach(mode => {
      const x = mode.x ? mapW - 1 - cell.x : cell.x;
      const y = mode.y ? mapH - 1 - cell.y : cell.y;
      const key = x + ',' + y;
      if (seen.has(key)) return;
      seen.add(key);
      mirrored.push({ x, y });
    });
  });
  return mirrored;
}

function getTileBrushCells(tileX, tileY) {
  if (tileBrushRoads) return getMirroredTerrainCells([{ x: tileX, y: tileY }]);
  return getMirroredTerrainCells(getBrushCells(tileX, tileY, tileBrushShape || 'square'));
}

function getTileBrushPreviewCells(tileX, tileY) {
  return getTileBrushCells(tileX, tileY);
}

function getHeightBrushCells(tileX, tileY) {
  return getMirroredTerrainCells(getBrushCells(tileX, tileY, heightBrushShape || 'square'));
}

function getSmoothedHeightAt(source, tileX, tileY) {
  let total = 0;
  let count = 0;
  for (let y = tileY - 1; y <= tileY + 1; y++) {
    for (let x = tileX - 1; x <= tileX + 1; x++) {
      if (x < 0 || x >= mapW || y < 0 || y >= mapH) continue;
      total += source[y]?.[x] || 0;
      count++;
    }
  }
  return count ? Math.round(total / count) : (source[tileY]?.[tileX] || 0);
}

function getHeightBrushValue(oldHeight, source, tileX, tileY, event) {
  if (event.shiftKey) return 0;
  const amount = Math.max(1, Math.round(selectedHeight || 0));
  if (heightBrushAction === 'raise') return oldHeight + amount;
  if (heightBrushAction === 'lower') return oldHeight - amount;
  if (heightBrushAction === 'smooth') return getSmoothedHeightAt(source, tileX, tileY);
  return selectedHeight;
}

const tileAlphaSignatureCache = new Map();
const tileVisualSignatureCache = new Map();
const tileSmartCoreCache = new Map();
const TILE_VISUAL_SAMPLE_SIZE = 32;

function getTileAlphaSignature(tileId, rotation = 0) {
  const rot = ((rotation % 4) + 4) % 4;
  const key = tilesetIndex + ':' + tileId + ':' + rot;
  if (tileAlphaSignatureCache.has(key)) return tileAlphaSignatureCache.get(key);
  const img = tileImages[tileId];
  if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) {
    const empty = { edges: [0, 0, 0, 0], corners: [0, 0, 0, 0], center: 0 };
    tileAlphaSignatureCache.set(key, empty);
    return empty;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  drawOfficialTileImage(ctx, img, 32, rot, false, false);
  const data = ctx.getImageData(0, 0, 32, 32).data;
  const alphaAt = (x, y) => data[(y * 32 + x) * 4 + 3];
  const alphaWater = (points) => {
    let count = 0;
    points.forEach(point => {
      if (alphaAt(point.x, point.y) < 250) count++;
    });
    return points.length ? count / points.length : 0;
  };
  const points = {
    N: [],
    E: [],
    S: [],
    W: [],
    NW: [],
    NE: [],
    SE: [],
    SW: [],
    C: []
  };
  const band = 6;
  for (let i = 0; i < 32; i++) {
    for (let b = 0; b < band; b++) {
      points.N.push({ x: i, y: b });
      points.E.push({ x: 31 - b, y: i });
      points.S.push({ x: i, y: 31 - b });
      points.W.push({ x: b, y: i });
    }
  }
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) points.NW.push({ x, y });
    for (let x = 24; x < 32; x++) points.NE.push({ x, y });
  }
  for (let y = 24; y < 32; y++) {
    for (let x = 24; x < 32; x++) points.SE.push({ x, y });
    for (let x = 0; x < 8; x++) points.SW.push({ x, y });
  }
  for (let y = 10; y < 22; y++) {
    for (let x = 10; x < 22; x++) points.C.push({ x, y });
  }
  const signature = {
    edges: [alphaWater(points.N), alphaWater(points.E), alphaWater(points.S), alphaWater(points.W)],
    corners: [alphaWater(points.NW), alphaWater(points.NE), alphaWater(points.SE), alphaWater(points.SW)],
    center: alphaWater(points.C)
  };
  tileAlphaSignatureCache.set(key, signature);
  return signature;
}

function getTileVisualSignature(tileId, rotation = 0) {
  const rot = ((rotation % 4) + 4) % 4;
  const key = tilesetIndex + ':' + tileId + ':' + rot;
  if (tileVisualSignatureCache.has(key)) return tileVisualSignatureCache.get(key);
  const img = tileImages[tileId];
  if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) {
    const emptyColor = [0, 0, 0];
    const empty = {
      edges: [emptyColor, emptyColor, emptyColor, emptyColor],
      corners: [emptyColor, emptyColor, emptyColor, emptyColor],
      center: emptyColor,
      average: emptyColor,
      edgeVariance: 9999
    };
    tileVisualSignatureCache.set(key, empty);
    return empty;
  }

  const size = TILE_VISUAL_SAMPLE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  fillTileCanvasBase(ctx, tileId, size);
  drawOfficialTileImage(ctx, img, size, rot, false, false);
  const data = ctx.getImageData(0, 0, size, size).data;

  const sample = (x1, y1, x2, y2) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let y = y1; y < y2; y++) {
      for (let x = x1; x < x2; x++) {
        const idx = (y * size + x) * 4;
        const a = data[idx + 3] / 255;
        r += data[idx] * a;
        g += data[idx + 1] * a;
        b += data[idx + 2] * a;
        count += a;
      }
    }
    if (!count) return [0, 0, 0];
    return [r / count, g / count, b / count];
  };

  const band = 5;
  const corner = 8;
  const centerStart = 10;
  const centerEnd = 22;
  const edges = [
    sample(0, 0, size, band),
    sample(size - band, 0, size, size),
    sample(0, size - band, size, size),
    sample(0, 0, band, size)
  ];
  const corners = [
    sample(0, 0, corner, corner),
    sample(size - corner, 0, size, corner),
    sample(size - corner, size - corner, size, size),
    sample(0, size - corner, corner, size)
  ];
  const center = sample(centerStart, centerStart, centerEnd, centerEnd);
  const average = sample(0, 0, size, size);
  let edgeVariance = 0;
  edges.forEach(edge => {
    edgeVariance += colorDistance(edge, average);
  });

  const signature = { edges, corners, center, average, edgeVariance };
  tileVisualSignatureCache.set(key, signature);
  return signature;
}

function colorDistance(a, b) {
  if (!a || !b) return 9999;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function mixColors(a, b, amount = 0.5) {
  return [
    a[0] * (1 - amount) + b[0] * amount,
    a[1] * (1 - amount) + b[1] * amount,
    a[2] * (1 - amount) + b[2] * amount
  ];
}

function getOppositeEdgeIndex(edgeIndex) {
  return (edgeIndex + 2) % 4;
}

function getSmartTilePreferredRotation(tileX, tileY, tileId) {
  const hash = ((tileX * 73856093) ^ (tileY * 19349663) ^ (tileId * 83492791)) >>> 0;
  return hash & 0x03;
}

function getSmartTileCoreSignature(type, sourceTileId = selectedTileId, sourceRotation = selectedRotation) {
  const key = tilesetIndex + ':' + type + ':' + sourceTileId + ':' + sourceRotation;
  if (tileSmartCoreCache.has(key)) return tileSmartCoreCache.get(key);
  const candidates = getTileTypeCandidates(type);
  let best = null;
  candidates.forEach(tileId => {
    for (let rot = 0; rot < 4; rot++) {
      const signature = getTileVisualSignature(tileId, rot);
      const selectedSignature = getTileVisualSignature(sourceTileId, sourceRotation);
      const selectionDistance = Math.min(
        colorDistance(signature.center, selectedSignature.center),
        colorDistance(signature.average, selectedSignature.average),
        ...signature.edges.map(edge => Math.min(
          colorDistance(edge, selectedSignature.center),
          colorDistance(edge, selectedSignature.average),
          ...selectedSignature.edges.map(selectedEdge => colorDistance(edge, selectedEdge))
        ))
      );
      const score = signature.edgeVariance + selectionDistance * 0.65;
      if (!best || score < best.score) best = { signature, score };
    }
  });
  const core = best ? best.signature : getTileVisualSignature(sourceTileId, sourceRotation);
  tileSmartCoreCache.set(key, core);
  return core;
}

function getSmartVisualTileCandidates(type, excludeRoads = false) {
  if (type === TILE_TYPE_WATER) return getTileTypeCandidates(type);
  const candidates = [];
  for (let idx = 0; idx < tileImages.length; idx++) {
    if (tileTypesById[idx] === TILE_TYPE_WATER) continue;
    if (excludeRoads && getTileRoadFamily(idx)) continue;
    candidates.push(idx);
  }
  return candidates;
}

function getNeighborTerrainVotes(tileX, tileY, type) {
  const tileVotes = new Map();
  const rotationVotes = new Map();
  TILE_EDGE_DIRS.forEach(dir => {
    const tx = tileX + dir.x;
    const ty = tileY + dir.y;
    if (tx < 0 || tx >= mapW || ty < 0 || ty >= mapH) return;
    const tileId = mapTiles[ty]?.[tx];
    if (tileTypesById[tileId] !== type) return;
    const rotation = mapRotations[ty]?.[tx] ?? 0;
    tileVotes.set(tileId, (tileVotes.get(tileId) || 0) + 1);
    rotationVotes.set(rotation, (rotationVotes.get(rotation) || 0) + 1);
  });
  return { tileVotes, rotationVotes };
}

function getTopVotedValue(votes, fallback) {
  let bestValue = fallback;
  let bestCount = 0;
  votes.forEach((count, value) => {
    if (count > bestCount || (count === bestCount && value === fallback)) {
      bestValue = value;
      bestCount = count;
    }
  });
  return bestValue;
}

async function loadTileRelationshipDataForTileset(idx) {
  const path = TILE_RELATIONSHIP_FILES[idx] || null;
  activeTileRelationshipData = null;
  activeTileRelationshipsById = [];
  if (!path) return;

  const shouldBypassCache = path.includes('-tiles.json');
  if (!shouldBypassCache && tileRelationshipCache.has(path)) {
    activeTileRelationshipData = tileRelationshipCache.get(path);
  } else {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      activeTileRelationshipData = await response.json();
      tileRelationshipCache.set(path, activeTileRelationshipData);
    } catch (err) {
      console.warn('Tile relationship metadata failed to load:', err);
      tileRelationshipCache.set(path, null);
      activeTileRelationshipData = null;
      return;
    }
  }

  const tiles = Array.isArray(activeTileRelationshipData?.tiles) ? activeTileRelationshipData.tiles : [];
  activeTileRelationshipsById = [];
  tiles.forEach(tile => {
    const id = parseInt(tile?.id, 10);
    if (Number.isFinite(id)) activeTileRelationshipsById[id] = tile;
  });
}

function getTileRelationship(tileId) {
  const id = parseInt(tileId, 10);
  return Number.isFinite(id) ? (activeTileRelationshipsById[id] || null) : null;
}

function getTileFamilyFriends(family) {
  const friends = activeTileRelationshipData?.families?.[family]?.friends;
  return Array.isArray(friends) ? friends : [];
}

function areTileFamiliesFriends(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return getTileFamilyFriends(a).includes(b) || getTileFamilyFriends(b).includes(a);
}

function getRotatedTilePieces(tileId, rotation = 0) {
  const meta = getTileRelationship(tileId);
  if (!meta) return null;
  const family = normalizeTileConnectorFamily(meta.family || 'tile_' + tileId);
  let pieces = {};
  TILE_PIECE_KEYS.forEach(key => {
    pieces[key] = normalizeTileConnectorFamily(meta.pieces?.[key] || family);
  });

  // Terrain CanvasTexture rendering flips the vertical texture axis before rotations are visible.
  pieces = {
    topLeft: pieces.bottomLeft,
    topRight: pieces.bottomRight,
    bottomRight: pieces.topRight,
    bottomLeft: pieces.topLeft
  };

  const steps = ((rotation % 4) + 4) % 4;
  for (let i = 0; i < steps; i++) {
    pieces = {
      topLeft: pieces.bottomLeft,
      topRight: pieces.topLeft,
      bottomRight: pieces.topRight,
      bottomLeft: pieces.bottomRight
    };
  }
  return pieces;
}

function normalizeTileConnectorFamily(family) {
  return family === 'roads' ? 'a_roads' : family;
}

function getRotatedTileDirectionEdges(tileId, rotation = 0) {
  const meta = getTileRelationship(tileId);
  if (!meta?.edges) return null;
  const family = normalizeTileConnectorFamily(meta.family || 'tile_' + tileId);
  let edges = {};
  TILE_DIRECTION_EDGE_KEYS.forEach(key => {
    edges[key] = normalizeTileConnectorFamily(meta.edges?.[key] || family);
  });

  // Terrain CanvasTexture rendering flips the vertical texture axis before rotations are visible.
  edges = {
    N: edges.S,
    E: edges.E,
    S: edges.N,
    W: edges.W
  };

  const steps = ((rotation % 4) + 4) % 4;
  for (let i = 0; i < steps; i++) {
    edges = {
      N: edges.W,
      E: edges.N,
      S: edges.E,
      W: edges.S
    };
  }
  return edges;
}

function getSmartPieceTileCandidates(targetFamily) {
  if (!targetFamily || !activeTileRelationshipData) return [];
  const candidates = [];
  activeTileRelationshipsById.forEach((meta, tileId) => {
    if (!meta || tileId >= tileImages.length) return;
    const pieces = getRotatedTilePieces(tileId, 0);
    const edges = getRotatedTileDirectionEdges(tileId, 0);
    if (
      meta.family === targetFamily ||
      Object.values(pieces || {}).includes(targetFamily) ||
      Object.values(edges || {}).includes(targetFamily)
    ) {
      candidates.push(tileId);
    }
  });
  return candidates;
}

function scoreSmartPieceMatch(a, b) {
  a = normalizeTileConnectorFamily(a);
  b = normalizeTileConnectorFamily(b);
  if (!a || !b) return -1;
  if (a === b) return 12;
  return areTileFamiliesFriends(a, b) ? 3 : -8;
}

function scoreConnectorValues(candidateValues, neighborValues) {
  if (!candidateValues.length || !neighborValues.length) return 0;
  let score = 0;
  candidateValues.forEach(candidateValue => {
    neighborValues.forEach(neighborValue => {
      score += scoreSmartPieceMatch(candidateValue, neighborValue);
    });
  });
  return (score / (candidateValues.length * neighborValues.length)) * 2;
}

function getSmartEdgeConnectorValues(pieces, directionEdges, edgeName, useOpposite = false) {
  if (directionEdges) {
    const directionKey = useOpposite ? TILE_OPPOSITE_DIRECTION_EDGES[edgeName] : edgeName;
    return directionKey && directionEdges[directionKey] ? [directionEdges[directionKey]] : [];
  }
  const pieceKeys = (useOpposite ? TILE_OPPOSITE_EDGE_PIECES : TILE_EDGE_PIECES)[edgeName];
  return pieceKeys ? pieceKeys.map(key => pieces?.[key]).filter(Boolean) : [];
}

function scoreSmartPieceEdge(candidatePieces, candidateEdges, edgeName, neighborPieces, neighborEdges) {
  const candidateValues = getSmartEdgeConnectorValues(candidatePieces, candidateEdges, edgeName);
  const neighborValues = getSmartEdgeConnectorValues(neighborPieces, neighborEdges, edgeName, true);
  return scoreConnectorValues(candidateValues, neighborValues);
}

function scoreSmartPieceTargets(candidatePieces, pieceTargets, targetFamily) {
  if (!pieceTargets) return 0;
  let score = 0;
  TILE_PIECE_KEYS.forEach(key => {
    const value = normalizeTileConnectorFamily(candidatePieces?.[key] || '');
    const wantsTarget = !!pieceTargets[key];
    if (wantsTarget) {
      score += value === targetFamily ? 150 : -220;
    } else {
      score += value === targetFamily ? -120 : 20;
    }
  });
  return score;
}

function shouldRoadContinuePastMapEdge(tileX, tileY, dir, targetFamily, plannedCells) {
  const tx = tileX + dir.x;
  const ty = tileY + dir.y;
  if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH) return false;

  const oppositeX = tileX - dir.x;
  const oppositeY = tileY - dir.y;
  if (oppositeX < 0 || oppositeX >= mapW || oppositeY < 0 || oppositeY >= mapH) return false;
  if (plannedCells?.has(oppositeX + ',' + oppositeY)) return true;
  return areRoadFamiliesConnectable(targetFamily, getTileRoadFamily(mapTiles[oppositeY]?.[oppositeX]));
}

function getSmartConnectorTileBrushPaint(tileX, tileY, targetFamily, fallbackTileId, plannedCells, requirePrimaryFamily = false, pieceTargets = null) {
  targetFamily = normalizeTileConnectorFamily(targetFamily);
  if (!targetFamily) return null;

  const candidates = getSmartPieceTileCandidates(targetFamily);
  if (!candidates.length) return null;

  const plannedPieces = {
    topLeft: targetFamily,
    topRight: targetFamily,
    bottomRight: targetFamily,
    bottomLeft: targetFamily
  };
  const plannedEdges = {
    N: targetFamily,
    E: targetFamily,
    S: targetFamily,
    W: targetFamily
  };
  let best = null;

  candidates.forEach(tileId => {
    const meta = getTileRelationship(tileId);
    if (requirePrimaryFamily && normalizeTileConnectorFamily(meta?.family || '') !== targetFamily) return;
    for (let rot = 0; rot < 4; rot++) {
      const pieces = getRotatedTilePieces(tileId, rot);
      if (!pieces) continue;
      const edges = getRotatedTileDirectionEdges(tileId, rot);

      let score = 0;
      if (edges) {
        TILE_DIRECTION_EDGE_KEYS.forEach(key => {
          score += scoreSmartPieceMatch(edges[key], targetFamily) * 0.45;
        });
      } else {
        TILE_PIECE_KEYS.forEach(key => {
          score += scoreSmartPieceMatch(pieces[key], targetFamily) * 0.35;
        });
      }
      score += scoreSmartPieceTargets(pieces, pieceTargets, targetFamily);

      TILE_EDGE_DIRS.forEach(dir => {
        const tx = tileX + dir.x;
        const ty = tileY + dir.y;
        if (tx < 0 || tx >= mapW || ty < 0 || ty >= mapH) {
          if (requirePrimaryFamily && shouldRoadContinuePastMapEdge(tileX, tileY, dir, targetFamily, plannedCells)) {
            score += scoreSmartPieceEdge(pieces, edges, dir.name, plannedPieces, plannedEdges) * 1.8;
          }
          return;
        }

        const insideBrush = plannedCells?.has(tx + ',' + ty);
        if (insideBrush) {
          score += scoreSmartPieceEdge(pieces, edges, dir.name, plannedPieces, plannedEdges) * 0.8;
          return;
        }

        const neighborPieces = getRotatedTilePieces(mapTiles[ty]?.[tx], mapRotations[ty]?.[tx] ?? 0);
        const neighborEdges = getRotatedTileDirectionEdges(mapTiles[ty]?.[tx], mapRotations[ty]?.[tx] ?? 0);
        if (neighborPieces) score += scoreSmartPieceEdge(pieces, edges, dir.name, neighborPieces, neighborEdges) * 1.8;
      });

      if (requirePrimaryFamily) {
        TILE_EDGE_DIRS.forEach(dir => {
          const tx = tileX + dir.x;
          const ty = tileY + dir.y;
          const outsideMap = tx < 0 || tx >= mapW || ty < 0 || ty >= mapH;
          const insideBrush = !outsideMap && plannedCells?.has(tx + ',' + ty);
          const neighborFamily = !outsideMap
            ? getTileRoadFamily(mapTiles[ty]?.[tx])
            : '';
          const wantsRoadEdge = insideBrush ||
            areRoadFamiliesConnectable(targetFamily, neighborFamily) ||
            (outsideMap && shouldRoadContinuePastMapEdge(tileX, tileY, dir, targetFamily, plannedCells));
          const hasRoadEdge = getSmartEdgeConnectorValues(pieces, edges, dir.name)
            .some(value => areRoadFamiliesConnectable(targetFamily, value));

          if (wantsRoadEdge) {
            score += hasRoadEdge ? 120 : -160;
          } else {
            score += hasRoadEdge ? -90 : 10;
          }
        });
      }

      const fallbackMeta = getTileRelationship(fallbackTileId);
      if (fallbackMeta?.wrongTiles?.includes(tileId)) score -= 40;
      if (fallbackMeta?.friendTiles?.includes(tileId)) score += 4;
      if (tileId === fallbackTileId) score += 0.5;
      if (meta?.family === targetFamily) score += 0.25;
      if (rot === getSmartTilePreferredRotation(tileX, tileY, tileId)) score += 0.1;

      if (!best || score > best.score) best = { tile: tileId, rot, score };
    }
  });

  return best;
}

function getSmartPieceTileBrushPaint(tileX, tileY, plannedCells) {
  const selectedMeta = getTileRelationship(selectedTileId);
  return getSmartConnectorTileBrushPaint(tileX, tileY, selectedMeta?.family, selectedTileId, plannedCells);
}

function getTileTypeCandidates(type) {
  const candidates = [];
  for (let idx = 0; idx < tileImages.length; idx++) {
    if (tileTypesById[idx] === type) candidates.push(idx);
  }
  return candidates;
}

function neighborMatchesPlannedTerrain(tx, ty, type, plannedCells) {
  if (tx < 0 || tx >= mapW || ty < 0 || ty >= mapH) return false;
  if (plannedCells?.has(tx + ',' + ty)) return true;
  return tileTypesById[mapTiles[ty]?.[tx]] === type;
}

function getSmartVisualOutsideSignature(tx, ty, plannedCells) {
  if (tx < 0 || tx >= mapW || ty < 0 || ty >= mapH) return null;
  if (plannedCells?.has(tx + ',' + ty)) return null;
  return getTileVisualSignature(mapTiles[ty]?.[tx], mapRotations[ty]?.[tx] ?? 0);
}

function getSmartVisualCornerTarget(tileX, tileY, cornerIndex, core, plannedCells) {
  const pair = TILE_CORNER_EDGE_INDEXES[cornerIndex];
  const outside = pair.map(edgeIndex => {
    const dir = TILE_EDGE_DIRS[edgeIndex];
    return {
      edgeIndex,
      signature: getSmartVisualOutsideSignature(tileX + dir.x, tileY + dir.y, plannedCells)
    };
  }).filter(item => item.signature);

  if (!outside.length) {
    return { color: core.corners[cornerIndex], weight: 0.7 };
  }

  const diagonal = TILE_CORNER_DIRS[cornerIndex];
  const diagonalSignature = getSmartVisualOutsideSignature(tileX + diagonal.x, tileY + diagonal.y, plannedCells);
  if (outside.length === 2) {
    return {
      color: diagonalSignature ? diagonalSignature.corners[diagonal.opposite] : mixColors(
        outside[0].signature.edges[getOppositeEdgeIndex(outside[0].edgeIndex)],
        outside[1].signature.edges[getOppositeEdgeIndex(outside[1].edgeIndex)]
      ),
      weight: 2.4
    };
  }

  const outsideColor = outside[0].signature.edges[getOppositeEdgeIndex(outside[0].edgeIndex)];
  return {
    color: mixColors(core.corners[cornerIndex], outsideColor, 0.5),
    weight: 0.9
  };
}

const TILE_CORNER_EDGE_INDEXES = [
  [0, 3], // NW
  [0, 1], // NE
  [2, 1], // SE
  [2, 3]  // SW
];
const TILE_CORNER_DIRS = [
  { x: -1, y: -1, opposite: 2 },
  { x: 1, y: -1, opposite: 3 },
  { x: 1, y: 1, opposite: 0 },
  { x: -1, y: 1, opposite: 1 }
];

function getWaterTargetProfile(tileX, tileY, type, plannedCells) {
  const edges = TILE_EDGE_DIRS.map(dir => neighborMatchesPlannedTerrain(tileX + dir.x, tileY + dir.y, type, plannedCells) ? 1 : 0);
  const corners = TILE_CORNER_EDGE_INDEXES.map(([a, b]) => {
    const waterCount = edges[a] + edges[b];
    if (waterCount === 2) return 1;
    if (waterCount === 0) return 0;
    return 0.45;
  });
  return {
    edges,
    corners,
    landEdges: edges.reduce((count, value) => count + (value ? 0 : 1), 0)
  };
}

function getSmartWaterTileHint(target, candidates, useWaterHints = selectedTileId === 17 || tileBrushWater) {
  const hints = SMART_WATER_TILE_HINTS[tilesetIndex] || {};
  const edgeMask = target.edges.join('');
  const hint = hints[edgeMask];
  if (!hint || !useWaterHints || !candidates.includes(hint.tile)) return null;
  return hint;
}

function scoreWaterSignature(signature, target) {
  if (target.landEdges === 0) {
    let score = Math.abs(signature.center - 1) * 3;
    for (let i = 0; i < 4; i++) score += Math.abs(signature.edges[i] - 1) * 2.5;
    for (let i = 0; i < 4; i++) score += Math.abs(signature.corners[i] - 1) * 0.8;
    return score;
  }

  let score = 0;
  for (let i = 0; i < 4; i++) {
    if (target.edges[i]) {
      score += Math.max(0, 0.42 - signature.edges[i]) * 1.2;
    } else {
      score += signature.edges[i] * 4;
    }
  }

  for (let i = 0; i < 4; i++) {
    score += Math.abs(signature.corners[i] - target.corners[i]) * 1.2;
  }

  if (target.landEdges === 1) {
    const landEdge = target.edges.findIndex(value => !value);
    TILE_CORNER_EDGE_INDEXES.forEach((pair, idx) => {
      if (pair.includes(landEdge)) score += signature.corners[idx] * 1.4;
    });
  } else if (target.landEdges === 2) {
    TILE_CORNER_EDGE_INDEXES.forEach((pair, idx) => {
      if (!target.edges[pair[0]] && !target.edges[pair[1]]) score += signature.corners[idx] * 2;
    });
  }

  return score;
}

function getSmartWaterTileBrushPaint(tileX, tileY, type, plannedCells, useWaterHints = selectedTileId === 17 || tileBrushWater) {
  const candidates = getTileTypeCandidates(type);
  if (!candidates.length) return null;
  const target = getWaterTargetProfile(tileX, tileY, type, plannedCells);
  const hintedTile = getSmartWaterTileHint(target, candidates, useWaterHints);
  if (hintedTile) {
    return { tile: hintedTile.tile, rot: hintedTile.rot, score: -1 };
  }
  const neighborVotes = getNeighborTerrainVotes(tileX, tileY, type).tileVotes;
  let best = null;
  candidates.forEach(tileId => {
    for (let rot = 0; rot < 4; rot++) {
      const signature = getTileAlphaSignature(tileId, rot);
      let score = scoreWaterSignature(signature, target);
      score -= (neighborVotes.get(tileId) || 0) * 0.12;
      if (!best || score < best.score) best = { tile: tileId, rot, score };
    }
  });
  return best;
}

function getSmartVisualTileBrushPaint(tileX, tileY, type, plannedCells, sourceTileId = selectedTileId, sourceRotation = selectedRotation, excludeRoads = false) {
  const core = getSmartTileCoreSignature(type, sourceTileId, sourceRotation);
  const candidates = getSmartVisualTileCandidates(type, excludeRoads);
  if (!candidates.length) return null;
  const neighborVotes = getNeighborTerrainVotes(tileX, tileY, type).tileVotes;
  const cornerTargets = TILE_CORNER_EDGE_INDEXES.map((_, idx) => getSmartVisualCornerTarget(tileX, tileY, idx, core, plannedCells));
  let best = null;

  candidates.forEach(tileId => {
    for (let rot = 0; rot < 4; rot++) {
      const signature = getTileVisualSignature(tileId, rot);
      let score =
        colorDistance(signature.center, core.center) * 0.3 +
        colorDistance(signature.average, core.average) * 0.15 +
        signature.edgeVariance * 0.02;

      TILE_EDGE_DIRS.forEach((dir, edgeIndex) => {
        const tx = tileX + dir.x;
        const ty = tileY + dir.y;
        const plannedKey = tx + ',' + ty;
        const insideBrush = plannedCells?.has(plannedKey);
        let targetEdge = core.edges[edgeIndex];
        let weight = insideBrush ? 1.15 : 0.75;

        if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH && !insideBrush) {
          const neighborTile = mapTiles[ty]?.[tx];
          const neighborRot = mapRotations[ty]?.[tx] ?? 0;
          const neighborSignature = getTileVisualSignature(neighborTile, neighborRot);
          targetEdge = neighborSignature.edges[getOppositeEdgeIndex(edgeIndex)];
          weight = 1.9;
        }

        score += colorDistance(signature.edges[edgeIndex], targetEdge) * weight;
      });
      cornerTargets.forEach((target, cornerIndex) => {
        score += colorDistance(signature.corners[cornerIndex], target.color) * target.weight;
      });

      score -= (neighborVotes.get(tileId) || 0) * 1.5;
      if (tileId === sourceTileId) score -= 0.2;
      if (rot === getSmartTilePreferredRotation(tileX, tileY, tileId)) score -= 0.06;
      if (!best || score < best.score) best = { tile: tileId, rot, score };
    }
  });

  return best;
}

function getSmartTilePreset(key = activeSmartTilePresetKey) {
  return SMART_TILE_PRESETS.find(preset => preset.key === key) || null;
}

function isSmartTilePresetActive() {
  return tilesetIndex === 0 && tileBrushSmartTiles && !tileBrushRoads && !tileBrushWater && !!getSmartTilePreset();
}

function getSmartTilePresetPaintTileId() {
  const preset = isSmartTilePresetActive() ? getSmartTilePreset() : null;
  const tiles = preset
    ? preset.tiles.filter(tileId => tileId >= 0 && tileId < tileImages.length)
    : [];
  if (!tiles.length) return selectedTileId;
  return tiles[Math.floor(Math.random() * tiles.length)];
}

function isSmartTilePresetSourceTile(tileId, sourceTileId = selectedTileId) {
  const preset = isSmartTilePresetActive() ? getSmartTilePreset() : null;
  if (!preset || !preset.tiles.includes(sourceTileId)) return tileId === sourceTileId;
  return preset.tiles.includes(tileId);
}

function getTileBrushPaintChoice(tileX, tileY, plannedCells = null) {
  const selectedFlip = { xFlip: selectedXFlip, yFlip: false, triFlip: false };
  if (!tileTypesById.length || !tileImages.length) {
    return { tile: selectedTileId, rot: selectedRotation, ...selectedFlip };
  }
  if (tileBrushRoads) {
    return getRoadTilePaintChoice(tileX, tileY, tileBrushRoadFamily, plannedCells);
  }
  if (tileBrushWater) {
    return getWaterTilePaintChoice();
  }
  if (tileBrushSmartTiles) {
    return { tile: getSmartTilePresetPaintTileId(), rot: selectedRotation, ...selectedFlip };
  }
  return { tile: selectedTileId, rot: selectedRotation, ...selectedFlip };
}

function recordTileBrushChange(changes, x, y, newTile, newRot, newXFlip = null, newYFlip = null, newTriFlip = null) {
  if (x < 0 || x >= mapW || y < 0 || y >= mapH) return false;
  const oldTile = mapTiles[y][x];
  const oldRot = mapRotations[y][x];
  const oldXFlip = !!mapXFlip[y]?.[x];
  const oldYFlip = !!mapYFlip[y]?.[x];
  const oldTriFlip = !!mapTriFlip[y]?.[x];
  const nextXFlip = newXFlip === null ? oldXFlip : !!newXFlip;
  const nextYFlip = newYFlip === null ? oldYFlip : !!newYFlip;
  const nextTriFlip = newTriFlip === null ? oldTriFlip : !!newTriFlip;
  if (oldTile === newTile && oldRot === newRot && oldXFlip === nextXFlip && oldYFlip === nextYFlip && oldTriFlip === nextTriFlip) return false;

  const existingIndex = changes.findIndex(change => change.x === x && change.y === y);
  if (existingIndex >= 0) {
    const existing = changes[existingIndex];
    existing.newTile = newTile;
    existing.newRot = newRot;
    existing.newXFlip = nextXFlip;
    existing.newYFlip = nextYFlip;
    existing.newTriFlip = nextTriFlip;
    const originalXFlip = 'oldXFlip' in existing ? !!existing.oldXFlip : oldXFlip;
    const originalYFlip = 'oldYFlip' in existing ? !!existing.oldYFlip : oldYFlip;
    const originalTriFlip = 'oldTriFlip' in existing ? !!existing.oldTriFlip : oldTriFlip;
    if (existing.oldTile === newTile && existing.oldRot === newRot && originalXFlip === nextXFlip && originalYFlip === nextYFlip && originalTriFlip === nextTriFlip) changes.splice(existingIndex, 1);
  } else {
    changes.push({ x, y, oldTile, oldRot, oldXFlip, oldYFlip, oldTriFlip, newTile, newRot, newXFlip: nextXFlip, newYFlip: nextYFlip, newTriFlip: nextTriFlip });
  }
  mapTiles[y][x] = newTile;
  mapRotations[y][x] = newRot;
  mapXFlip[y][x] = nextXFlip;
  mapYFlip[y][x] = nextYFlip;
  mapTriFlip[y][x] = nextTriFlip;
  return true;
}

function shouldRefreshSmartWaterTiles() {
  const type = tileTypesById[selectedTileId] ?? selectedTileType ?? 0;
  return tileBrushWater || (tileBrushSmartTiles && type === TILE_TYPE_WATER);
}

function getTileRoadFamily(tileId) {
  const family = normalizeTileConnectorFamily(getTileRelationship(tileId)?.family || '');
  return TILE_ROAD_FAMILIES.includes(family) ? family : '';
}

function isRoadConnectorFamily(family) {
  return TILE_ROAD_FAMILIES.includes(normalizeTileConnectorFamily(family || ''));
}

function areRoadFamiliesConnectable(a, b) {
  a = normalizeTileConnectorFamily(a || '');
  b = normalizeTileConnectorFamily(b || '');
  return !!a && !!b && (a === b || (isRoadConnectorFamily(a) && isRoadConnectorFamily(b)));
}

function getRoadFallbackTileId(family) {
  const match = activeTileRelationshipsById.find((meta, tileId) =>
    meta?.family === family && tileId < tileImages.length
  );
  return Number.isFinite(match?.id) ? match.id : selectedTileId;
}

function getRoadTilePaintChoice(tileX, tileY, family, plannedCells = null) {
  const fallbackTileId = getRoadFallbackTileId(family);
  const choice = getSmartConnectorTileBrushPaint(tileX, tileY, family, fallbackTileId, plannedCells, true);
  return choice || { tile: fallbackTileId, rot: selectedRotation };
}

function getWaterFallbackTileId() {
  if (tileTypesById[17] === TILE_TYPE_WATER && 17 < tileImages.length) return 17;
  const selectedType = tileTypesById[selectedTileId] ?? selectedTileType ?? 0;
  if (selectedType === TILE_TYPE_WATER) return selectedTileId;
  const candidates = getTileTypeCandidates(TILE_TYPE_WATER);
  return candidates.length ? candidates[0] : selectedTileId;
}

function getWaterTilePaintChoice() {
  return { tile: getWaterFallbackTileId(), rot: selectedRotation };
}

function getClampedRoadExtraRadius(value = tileBrushRoadExtraRadius) {
  const radius = parseInt(value, 10);
  return Number.isFinite(radius) ? Math.max(0, Math.min(1, radius)) : 0;
}

function getClampedWaterExtraRadius(value = tileBrushWaterExtraRadius) {
  const radius = parseInt(value, 10);
  return Number.isFinite(radius) ? Math.max(0, Math.min(1, radius)) : 0;
}

function getRoadExtraTerrainCells(roadCells) {
  const radius = getClampedRoadExtraRadius();
  if (!tileBrushRoads || radius <= 0 || !Array.isArray(roadCells) || !roadCells.length) return [];

  const sourceRoadCells = [];
  const roadKeys = new Set();
  const addSourceRoadCell = (x, y) => {
    if (x < 0 || x >= mapW || y < 0 || y >= mapH) return;
    const key = x + ',' + y;
    if (roadKeys.has(key)) return;
    roadKeys.add(key);
    sourceRoadCells.push({ x, y });
  };
  roadCells.forEach(cell => {
    addSourceRoadCell(cell.x, cell.y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (getTileRoadFamily(mapTiles[y]?.[x])) addSourceRoadCell(x, y);
      }
    }
  });

  const seen = new Set();
  const cells = [];
  sourceRoadCells.forEach(cell => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (x < 0 || x >= mapW || y < 0 || y >= mapH) continue;
        const key = x + ',' + y;
        if (roadKeys.has(key) || seen.has(key)) continue;
        if (getTileRoadFamily(mapTiles[y]?.[x])) continue;
        seen.add(key);
        cells.push({ x, y });
      }
    }
  });
  return cells;
}

function isRoadExtraTerrainSourceTile(tileId) {
  return Number.isFinite(tileId) && !getTileRoadFamily(tileId) && tileTypesById[tileId] !== TILE_TYPE_WATER;
}

function getRoadExtraTerrainSource(tileX, tileY) {
  if (isRoadExtraTerrainSourceTile(selectedTileId)) {
    return { tile: selectedTileId, rot: selectedRotation };
  }

  const currentTile = mapTiles[tileY]?.[tileX];
  if (isRoadExtraTerrainSourceTile(currentTile)) {
    return { tile: currentTile, rot: mapRotations[tileY]?.[tileX] ?? 0 };
  }

  for (let radius = 1; radius <= 4; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = tileX + dx;
        const y = tileY + dy;
        if (x < 0 || x >= mapW || y < 0 || y >= mapH) continue;
        const tileId = mapTiles[y]?.[x];
        if (isRoadExtraTerrainSourceTile(tileId)) {
          return { tile: tileId, rot: mapRotations[y]?.[x] ?? 0 };
        }
      }
    }
  }

  return null;
}

function getRoadExtraTerrainPaintChoice(tileX, tileY, plannedCells = null) {
  const source = getRoadExtraTerrainSource(tileX, tileY);
  if (!source) return { tile: mapTiles[tileY]?.[tileX] ?? selectedTileId, rot: mapRotations[tileY]?.[tileX] ?? 0 };
  const sourceTileId = source.tile;
  const sourceRotation = source.rot;

  const selectedMeta = getTileRelationship(sourceTileId);
  const smartPieces = getSmartConnectorTileBrushPaint(tileX, tileY, selectedMeta?.family, sourceTileId, plannedCells);
  if (smartPieces && !getTileRoadFamily(smartPieces.tile)) return { tile: smartPieces.tile, rot: smartPieces.rot };

  const type = tileTypesById[sourceTileId] ?? selectedTileType ?? 0;
  const smartVisual = getSmartVisualTileBrushPaint(tileX, tileY, type, plannedCells, sourceTileId, sourceRotation, true);
  if (smartVisual && !getTileRoadFamily(smartVisual.tile)) return { tile: smartVisual.tile, rot: smartVisual.rot };

  return { tile: sourceTileId, rot: sourceRotation };
}

function paintRoadExtraTerrainAroundCells(roadCells, changes) {
  const extraCells = getRoadExtraTerrainCells(roadCells);
  if (!extraCells.length) return { changed: false, cells: extraCells };

  const plannedCells = new Set(extraCells.map(cell => cell.x + ',' + cell.y));
  let changed = false;
  extraCells.forEach(cell => {
    const choice = getRoadExtraTerrainPaintChoice(cell.x, cell.y, plannedCells);
    if (recordTileBrushChange(changes, cell.x, cell.y, choice.tile, choice.rot)) changed = true;
  });
  return { changed, cells: extraCells };
}

function paintRoadPrimaryCells(roadCells, plannedCells, changes) {
  let changed = false;
  roadCells.forEach(cell => {
    const tx = cell.x;
    const ty = cell.y;
    if (tx < 0 || tx >= mapW || ty < 0 || ty >= mapH) return;
    const choice = getRoadTilePaintChoice(tx, ty, tileBrushRoadFamily, plannedCells);
    if (recordTileBrushChange(changes, tx, ty, choice.tile, choice.rot)) changed = true;
  });
  return changed;
}

function getWaterBrushCells(waterCells) {
  const radius = getClampedWaterExtraRadius();
  if (!Array.isArray(waterCells) || !waterCells.length) return [];

  const sourceKeys = new Set();
  waterCells.forEach(cell => {
    if (cell.x >= 0 && cell.x < mapW && cell.y >= 0 && cell.y < mapH) sourceKeys.add(cell.x + ',' + cell.y);
  });

  if (radius <= 0) return waterCells;

  const seen = new Set(sourceKeys);
  const cells = waterCells.slice();
  waterCells.forEach(cell => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (x < 0 || x >= mapW || y < 0 || y >= mapH) continue;
        const key = x + ',' + y;
        if (seen.has(key)) continue;
        seen.add(key);
        cells.push({ x, y });
      }
    }
  });
  return cells;
}

function paintWaterCells(waterCells, changes) {
  let changed = false;
  waterCells.forEach(cell => {
    const tx = cell.x;
    const ty = cell.y;
    if (tx < 0 || tx >= mapW || ty < 0 || ty >= mapH) return;
    const choice = getWaterTilePaintChoice();
    if (recordTileBrushChange(changes, tx, ty, choice.tile, choice.rot)) changed = true;
  });
  return changed;
}

function getSmartConnectorTargetFamily(sourceTileId = selectedTileId) {
  return normalizeTileConnectorFamily(getTileRelationship(sourceTileId)?.family || '');
}

function isSmartConnectorTileForFamily(tileId, rotation, targetFamily) {
  targetFamily = normalizeTileConnectorFamily(targetFamily || '');
  if (!targetFamily) return false;
  const pieces = getRotatedTilePieces(tileId, rotation);
  const edges = getRotatedTileDirectionEdges(tileId, rotation);
  const values = edges ? Object.values(edges) : Object.values(pieces || {});
  const normalizedValues = values.map(value => normalizeTileConnectorFamily(value || '')).filter(Boolean);
  return normalizedValues.includes(targetFamily) && normalizedValues.some(value => value !== targetFamily);
}

const SMART_CONNECTOR_PIECE_TOUCHES = {
  topLeft: [
    { dx: -1, dy: 0, piece: 'topRight' },
    { dx: 0, dy: -1, piece: 'bottomLeft' },
    { dx: -1, dy: -1, piece: 'bottomRight' }
  ],
  topRight: [
    { dx: 1, dy: 0, piece: 'topLeft' },
    { dx: 0, dy: -1, piece: 'bottomRight' },
    { dx: 1, dy: -1, piece: 'bottomLeft' }
  ],
  bottomRight: [
    { dx: 1, dy: 0, piece: 'bottomLeft' },
    { dx: 0, dy: 1, piece: 'topRight' },
    { dx: 1, dy: 1, piece: 'topLeft' }
  ],
  bottomLeft: [
    { dx: -1, dy: 0, piece: 'bottomRight' },
    { dx: 0, dy: 1, piece: 'topLeft' },
    { dx: -1, dy: 1, piece: 'topRight' }
  ]
};

function getSmartConnectorPieceTargets(cell, sourceKeys, targetFamily) {
  targetFamily = normalizeTileConnectorFamily(targetFamily || '');
  if (!targetFamily) return null;
  const targets = {};
  TILE_PIECE_KEYS.forEach(key => {
    targets[key] = SMART_CONNECTOR_PIECE_TOUCHES[key].some(touch => {
      const x = cell.x + touch.dx;
      const y = cell.y + touch.dy;
      if (!sourceKeys?.has(x + ',' + y)) return false;
      const pieces = getRotatedTilePieces(mapTiles[y]?.[x], mapRotations[y]?.[x] ?? 0);
      return normalizeTileConnectorFamily(pieces?.[touch.piece] || '') === targetFamily;
    });
  });
  return targets;
}

function getConnectedSmartSourceCells(primaryCells, sourceTileId = selectedTileId) {
  const sourceCells = [];
  const sourceKeys = new Set();
  const queue = [];
  const addSourceCell = (x, y) => {
    if (x < 0 || x >= mapW || y < 0 || y >= mapH) return;
    if (!isSmartTilePresetSourceTile(mapTiles[y]?.[x], sourceTileId)) return;
    const key = x + ',' + y;
    if (sourceKeys.has(key)) return;
    sourceKeys.add(key);
    sourceCells.push({ x, y });
    queue.push({ x, y });
  };

  primaryCells.forEach(cell => addSourceCell(cell.x, cell.y));
  for (let idx = 0; idx < queue.length; idx++) {
    const cell = queue[idx];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        addSourceCell(cell.x + dx, cell.y + dy);
      }
    }
  }
  return { sourceCells, sourceKeys };
}

function getSmartConnectorCells(primaryCells, sourceTileId = selectedTileId) {
  const targetFamily = getSmartConnectorTargetFamily(sourceTileId);
  if (!tileBrushSmartTiles || tileBrushRoads || !targetFamily || !Array.isArray(primaryCells) || !primaryCells.length) {
    return { cells: [], plannedCells: new Set(), targetFamily };
  }

  const { sourceCells, sourceKeys } = getConnectedSmartSourceCells(primaryCells, sourceTileId);

  const seen = new Set();
  const cells = [];
  sourceCells.forEach(cell => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (x < 0 || x >= mapW || y < 0 || y >= mapH) continue;
        const key = x + ',' + y;
        if (sourceKeys.has(key) || seen.has(key)) continue;
        if (getTileRoadFamily(mapTiles[y]?.[x])) continue;
        seen.add(key);
        cells.push({ x, y });
      }
    }
  });

  return { cells, plannedCells: sourceKeys, targetFamily };
}

function paintSmartConnectorsAroundCells(primaryCells, changes, sourceTileId = selectedTileId) {
  const connectorData = getSmartConnectorCells(primaryCells, sourceTileId);
  const protectedCells = new Set(connectorData.plannedCells);
  if (!connectorData.cells.length) {
    return { changed: false, cells: connectorData.cells, protectedCells };
  }

  let changed = false;
  const protectConnectorCells = (tileTypesById[sourceTileId] ?? selectedTileType ?? 0) === TILE_TYPE_WATER;
  for (let pass = 0; pass < 2; pass++) {
    let passChanged = false;
    connectorData.cells.forEach(cell => {
      const pieceTargets = getSmartConnectorPieceTargets(cell, connectorData.plannedCells, connectorData.targetFamily);
      const choice = getSmartConnectorTileBrushPaint(
        cell.x,
        cell.y,
        connectorData.targetFamily,
        sourceTileId,
        connectorData.plannedCells,
        false,
        pieceTargets
      );
      if (!choice || !isSmartConnectorTileForFamily(choice.tile, choice.rot, connectorData.targetFamily)) return;
      if (recordTileBrushChange(changes, cell.x, cell.y, choice.tile, choice.rot)) {
        changed = true;
        passChanged = true;
      }
    });
    if (!passChanged) break;
  }
  if (protectConnectorCells) {
    connectorData.cells.forEach(cell => protectedCells.add(cell.x + ',' + cell.y));
  }
  return { changed, cells: connectorData.cells, protectedCells };
}

function refreshRoadTilesAroundCells(cells, changes) {
  if (!tileBrushRoads) return false;
  const refreshKeys = new Set();
  cells.forEach(cell => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (x >= 0 && x < mapW && y >= 0 && y < mapH) refreshKeys.add(x + ',' + y);
      }
    }
  });

  let changed = false;
  refreshKeys.forEach(key => {
    const [xText, yText] = key.split(',');
    const x = parseInt(xText, 10);
    const y = parseInt(yText, 10);
    const family = getTileRoadFamily(mapTiles[y]?.[x]);
    if (!family) return;
    const choice = getRoadTilePaintChoice(x, y, family, null);
    if (recordTileBrushChange(changes, x, y, choice.tile, choice.rot)) changed = true;
  });
  return changed;
}

function refreshAllRoadTiles(changes) {
  let changed = false;
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const family = getTileRoadFamily(mapTiles[y]?.[x]);
      if (!family) continue;
      const choice = getRoadTilePaintChoice(x, y, family, null);
      if (recordTileBrushChange(changes, x, y, choice.tile, choice.rot)) changed = true;
    }
  }
  return changed;
}

function getRoadChangedWaterCells(changes) {
  return changes
    .filter(change => tileTypesById[change.oldTile] === TILE_TYPE_WATER && getTileRoadFamily(change.newTile))
    .map(change => ({ x: change.x, y: change.y }));
}

function refreshSmartWaterTilesAroundCells(cells, changes, protectedCells = null, forceRefresh = false, radius = 1, plannedWaterCells = null, useWaterHints = selectedTileId === 17 || tileBrushWater) {
  if (!forceRefresh && !shouldRefreshSmartWaterTiles()) return false;
  radius = Math.max(1, Math.min(3, parseInt(radius, 10) || 1));
  const refreshKeys = new Set();
  cells.forEach(cell => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (x >= 0 && x < mapW && y >= 0 && y < mapH) refreshKeys.add(x + ',' + y);
      }
    }
  });

  let changed = false;
  refreshKeys.forEach(key => {
    if (protectedCells?.has(key)) return;
    const [xText, yText] = key.split(',');
    const x = parseInt(xText, 10);
    const y = parseInt(yText, 10);
    if (tileTypesById[mapTiles[y]?.[x]] !== TILE_TYPE_WATER) return;
    const choice = getSmartWaterTileBrushPaint(x, y, TILE_TYPE_WATER, plannedWaterCells, useWaterHints);
    if (!choice) return;
    if (recordTileBrushChange(changes, x, y, choice.tile, choice.rot)) changed = true;
  });
  return changed;
}

function clearTileSelectionState() {
  tileSelectStart = null;
  tileSelectEnd = null;
  tileSelectionFixed = false;
  tileViewDrag = null;
  if (viewAreaOverlay) viewAreaOverlay.style.display = 'none';
  clearStructurePlacementPreview();
  updateTileApplyBtn();
}

function getTileScreenBounds(tileX, tileY) {
  if (!threeContainer || !camera) return null;
  const rect = threeContainer.getBoundingClientRect();
  const points = [
    new THREE.Vector3(tileX, getTerrainCornerHeight(tileX, tileY), tileY),
    new THREE.Vector3(tileX + 1, getTerrainCornerHeight(tileX + 1, tileY), tileY),
    new THREE.Vector3(tileX + 1, getTerrainCornerHeight(tileX + 1, tileY + 1), tileY + 1),
    new THREE.Vector3(tileX, getTerrainCornerHeight(tileX, tileY + 1), tileY + 1)
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach(point => {
    const projected = point.project(camera);
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return;
    const x = rect.left + (projected.x + 1) * 0.5 * rect.width;
    const y = rect.top + (1 - projected.y) * 0.5 * rect.height;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

function getTileRangeFromScreenArea(startClientX, startClientY, endClientX, endClientY) {
  if (!mapW || !mapH) return null;
  const minScreenX = Math.min(startClientX, endClientX);
  const maxScreenX = Math.max(startClientX, endClientX);
  const minScreenY = Math.min(startClientY, endClientY);
  const maxScreenY = Math.max(startClientY, endClientY);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const bounds = getTileScreenBounds(x, y);
      if (!bounds) continue;
      if (bounds.minX <= maxScreenX && bounds.maxX >= minScreenX &&
          bounds.minY <= maxScreenY && bounds.maxY >= minScreenY) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return {
    start: { x: minX, y: minY },
    end: { x: maxX, y: maxY }
  };
}

function beginTileViewSelectionDrag(event) {
  const tile = getMapTileFromEvent(event);
  tileViewDrag = {
    clientX: event.clientX,
    clientY: event.clientY,
    start: tile,
    end: tile,
    moved: false,
    usesScreenSelection: !tile
  };
  if (!viewAreaOverlay) {
    viewAreaOverlay = document.createElement('div');
    viewAreaOverlay.style.position = 'fixed';
    viewAreaOverlay.style.pointerEvents = 'none';
    viewAreaOverlay.style.border = '1px solid #6cf527';
    viewAreaOverlay.style.background = 'rgba(108,245,39,0.12)';
    viewAreaOverlay.style.zIndex = '250';
    document.body.appendChild(viewAreaOverlay);
  }
  updateTileViewSelectionDrag(event);
  return true;
}

function updateTileViewSelectionDrag(event) {
  if (!tileViewDrag || !viewAreaOverlay) return false;
  const tile = getMapTileFromEvent(event);
  if (tile) {
    tileViewDrag.end = tile;
  } else {
    tileViewDrag.usesScreenSelection = true;
  }
  const distance = Math.hypot(event.clientX - tileViewDrag.clientX, event.clientY - tileViewDrag.clientY);
  tileViewDrag.moved = tileViewDrag.moved || distance > 3;
  const left = Math.min(tileViewDrag.clientX, event.clientX);
  const top = Math.min(tileViewDrag.clientY, event.clientY);
  viewAreaOverlay.style.display = 'block';
  viewAreaOverlay.style.left = left + 'px';
  viewAreaOverlay.style.top = top + 'px';
  viewAreaOverlay.style.width = Math.abs(event.clientX - tileViewDrag.clientX) + 'px';
  viewAreaOverlay.style.height = Math.abs(event.clientY - tileViewDrag.clientY) + 'px';
  return true;
}

function finishTileViewSelectionDrag(event) {
  if (!tileViewDrag) return false;
  const drag = tileViewDrag;
  tileViewDrag = null;
  if (viewAreaOverlay) viewAreaOverlay.style.display = 'none';
  const tile = getMapTileFromEvent(event) || drag.end || drag.start;
  const distance = Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY);
  if (drag.moved || distance > 3) {
    const range = (!drag.usesScreenSelection && drag.start && tile)
      ? { start: drag.start, end: tile }
      : getTileRangeFromScreenArea(drag.clientX, drag.clientY, event.clientX, event.clientY);
    if (!range) {
      clearTileSelectionState();
      setFileStatus('No map tiles selected.');
      return true;
    }
    tileSelectStart = range.start;
    tileSelectEnd = range.end;
    tileSelectionFixed = true;
    updateTileApplyBtn();
    updateHighlight(event);
  } else if (tile) {
    tileSelectStart = null;
    tileSelectEnd = null;
    tileSelectionFixed = false;
    updateTileViewInfoAt(tile.x, tile.y);
    updateTileApplyBtn();
    updateHighlight(event);
  } else {
    clearTileSelectionState();
    updateTileViewInfoAt(-1, -1);
  }
  return true;
}

function routeMapObjectSelection(event) {
  const droid = pickDroidFromEvent(event);
  if (droid && isGroupAllowedByViewSelectionFilters(droid)) {
    setActiveTab('droids');
    setDroidMode('view');
    selectDroidGroup(droid);
    return true;
  }
  const feature = pickFeatureFromEvent(event);
  if (feature && isGroupAllowedByViewSelectionFilters(feature)) {
    setActiveTab('features');
    setFeatureMode('view');
    selectFeatureGroup(feature);
    return true;
  }
  const structure = pickStructureFromEvent(event, false);
  if (structure && isGroupAllowedByViewSelectionFilters(structure)) {
    setActiveTab('objects');
    setStructureMode('view');
    selectStructureGroup(structure);
    return true;
  }
  return false;
}

function routeActiveBulkObjectSelection(event) {
  if (activeTab === 'view') return routeMapObjectSelection(event);
  if (activeTab === 'droids') {
    const droid = pickDroidFromEvent(event);
    if (!droid) return false;
    selectDroidGroup(droid);
    return true;
  }
  if (activeTab === 'features') {
    const feature = pickFeatureFromEvent(event);
    if (!feature) return false;
    selectFeatureGroup(feature);
    return true;
  }
  if (activeTab === 'objects') {
    const structure = pickStructureFromEvent(event, false);
    if (!structure) return false;
    selectStructureGroup(structure);
    return true;
  }
  return false;
}

function updateDroidModeUI() {
  document.querySelectorAll('[data-droid-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-droid-mode') === droidMode);
  });
  const buildControls = document.getElementById('droidBuildControls');
  const deleteBtn = document.getElementById('droidViewDeleteBtn');
  const viewPlayerControls = document.getElementById('droidViewPlayerControls');
  const hint = document.getElementById('droidModeHint');
  if (buildControls) buildControls.style.display = droidMode === 'build' ? 'block' : 'none';
  if (deleteBtn) deleteBtn.style.display = droidMode === 'view' && selectedDroidGroup ? 'block' : 'none';
  if (viewPlayerControls) updateDroidViewPlayerControls(droidMode === 'view' ? selectedDroidGroup : null);
  if (hint) {
    if (droidMode === 'build') hint.textContent = 'Click the map to place a builder truck.';
    else if (droidMode === 'delete') hint.textContent = 'Hover a droid and click mouse1 to remove it.';
    else hint.textContent = 'Click a droid on the map to view it.';
  }
  if (droidMode !== 'view') clearViewBulkSelection();
  else updateViewBulkSelectionPanel();
  if (droidMode !== 'view') clearSelectedDroid();
  if (droidMode !== 'delete') clearHoveredDroid();
  if (droidMode === 'build') requestAnimationFrame(() => updateDroidPreview());
  if (lastMouseEvent) updateHighlight(lastMouseEvent);
}

function getComponentOptionLabel(def, id) {
  const name = String(def?.name || id || '').replace(/\*/g, '');
  return name && name !== id ? name + ' (' + id + ')' : String(id || '');
}

function populateComponentSelect(select, defs, filterFn, preferredIds = []) {
  if (!select || !defs) return;
  const current = select.value;
  const preferred = new Set(preferredIds);
  const items = Object.entries(defs)
    .filter(([id, def]) => preferred.has(id) || filterFn(id, def))
    .sort((a, b) => {
      const ap = preferred.has(a[0]) ? 0 : 1;
      const bp = preferred.has(b[0]) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return getComponentOptionLabel(a[1], a[0]).localeCompare(getComponentOptionLabel(b[1], b[0]));
    });
  select.innerHTML = '';
  items.forEach(([id, def]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = getComponentOptionLabel(def, id);
    select.appendChild(opt);
  });
  if (items.some(([id]) => id === current)) select.value = current;
}

function normalizeDroidTemplate(template) {
  if (!template) return null;
  return {
    id: template.id,
    name: template.name || template.id,
    body: template.body,
    propulsion: template.propulsion,
    weapon: template.weapon,
    weapons: Array.isArray(template.weapons) ? template.weapons.slice() : template.weapons,
    construct: template.construct,
    repair: template.repair,
    sensor: template.sensor,
    brain: template.brain,
    ecm: template.ecm,
    type: template.type
  };
}

function getDroidPrimaryTool(design) {
  if (!design) return '';
  if (Array.isArray(design.weapons) && design.weapons.length) return design.weapons[0];
  return design.weapon || design.construct || design.repair || design.sensor || design.brain || design.ecm || '';
}

function getTemplateToolId(template) {
  return getDroidPrimaryTool(template) || '';
}

function getDroidToolDefs() {
  return {
    ...(weaponDefs || {}),
    ...(constructionDefs || {}),
    ...(repairDefs || {}),
    ...(droidSensorDefs || {}),
    ...(brainDefs || {}),
    ...(ecmDefs || {})
  };
}

function getDroidBodyUsageClass(bodyId) {
  return bodyDefs && bodyId ? bodyDefs[bodyId]?.usageClass || '' : '';
}

function isCyborgUsageClass(usageClass) {
  return usageClass === 'Cyborg' || usageClass === 'SuperCyborg';
}

function isTransportDroidType(droidType) {
  return droidType === 'TRANSPORTER' || droidType === 'SUPERTRANSPORTER';
}

function isTransportBody(bodyId) {
  return isTransportDroidType(bodyDefs && bodyId ? bodyDefs[bodyId]?.droidType : '');
}

function isCompatibleDroidPropulsion(def, bodyUsageClass) {
  if (!def?.model) return false;
  if (isCyborgUsageClass(bodyUsageClass)) return def.usageClass === 'Cyborg';
  return !isCyborgUsageClass(def.usageClass);
}

function isCompatibleDroidTool(def, bodyUsageClass) {
  if (!(def?.model || def?.mountModel || def?.sensorModel || def?.turret)) return false;
  if (isCyborgUsageClass(bodyUsageClass)) return def.usageClass === bodyUsageClass;
  return !isCyborgUsageClass(def.usageClass);
}

function isScavengerDroidTemplate(template) {
  if (!template) return false;
  const body = bodyDefs && template.body ? bodyDefs[template.body] : null;
  const id = String(template.id || '').toLowerCase();
  const name = String(template.name || '').toLowerCase();
  return body?.class === 'Babas' || SCAVENGER_BODY_IDS.has(template.body) || id.includes('baba') || id.includes('barbarian') || name.includes('scavenger');
}

function applyDroidToolToDesign(design, toolId) {
  if (!toolId) return design;
  if (weaponDefs && weaponDefs[toolId]) design.weapons = [toolId];
  else if (constructionDefs && constructionDefs[toolId]) design.construct = toolId;
  else if (repairDefs && repairDefs[toolId]) design.repair = toolId;
  else if (droidSensorDefs && droidSensorDefs[toolId]) design.sensor = toolId;
  else if (brainDefs && brainDefs[toolId]) design.brain = toolId;
  else if (ecmDefs && ecmDefs[toolId]) design.ecm = toolId;
  else design.weapon = toolId;
  return design;
}

function setDroidDesignerParts(design) {
  const bodySelect = document.getElementById('droidBodySelect');
  const propulsionSelect = document.getElementById('droidPropulsionSelect');
  const weaponSelect = document.getElementById('droidWeaponSelect');
  if (bodySelect && design?.body) bodySelect.value = design.body;
  if (design?.body) populateDroidPartOptionsForBody(design.body);
  if (propulsionSelect && design?.propulsion) propulsionSelect.value = design.propulsion;
  populateDroidWeaponOptions(design?.body, design?.propulsion);
  const tool = getDroidPrimaryTool(design);
  if (weaponSelect && tool) weaponSelect.value = tool;
  updateDroidPreview();
}

function getDroidTemplateList() {
  const showScavengers = document.getElementById('droidShowScavengers')?.checked;
  if (templateDefs) {
    const templates = Object.values(templateDefs).map(normalizeDroidTemplate).filter(Boolean);
    return templates
      .filter(template => showScavengers ? isScavengerDroidTemplate(template) : !isScavengerDroidTemplate(template))
      .sort((a, b) => {
        const ap = DROID_BUILD_TEMPLATES.some(item => item.id === a.id) || SCAVENGER_DROID_TEMPLATES.some(item => item.id === a.id) ? 0 : 1;
        const bp = DROID_BUILD_TEMPLATES.some(item => item.id === b.id) || SCAVENGER_DROID_TEMPLATES.some(item => item.id === b.id) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return String(a.name || a.id).localeCompare(String(b.name || b.id));
      });
  }
  return showScavengers ? SCAVENGER_DROID_TEMPLATES : DROID_BUILD_TEMPLATES;
}

function getDroidTemplateById(id) {
  if (templateDefs && templateDefs[id]) return normalizeDroidTemplate(templateDefs[id]);
  return getDroidTemplateList().find(item => item.id === id) ||
    DROID_BUILD_TEMPLATES.find(item => item.id === id) ||
    SCAVENGER_DROID_TEMPLATES.find(item => item.id === id);
}

function getSelectedDroidDesign() {
  const templateSelect = document.getElementById('droidTemplateSelect');
  const bodySelect = document.getElementById('droidBodySelect');
  const propulsionSelect = document.getElementById('droidPropulsionSelect');
  const weaponSelect = document.getElementById('droidWeaponSelect');
  const templateId = templateSelect?.value || 'ConstructionDroid';
  const preset = getDroidTemplateById(templateId);
  const body = bodySelect?.value || preset?.body || 'Body1REC';
  const propulsion = propulsionSelect?.value || preset?.propulsion || 'wheeled01';
  if (isTransportBody(body)) {
    return {
      id: templateId,
      name: preset?.name || 'Transport',
      body,
      propulsion: propulsion || 'V-Tol',
      type: bodyDefs?.[body]?.droidType
    };
  }
  const tool = weaponSelect?.value || getDroidPrimaryTool(preset) || 'Spade1Mk1';
  if (preset && tool === getDroidPrimaryTool(preset)) {
    return {
      ...preset,
      name: preset.name || preset.id,
      body,
      propulsion
    };
  }
  return applyDroidToolToDesign({
    id: templateId,
    name: preset?.name || templateId,
    body,
    propulsion
  }, tool);
}

function populateDroidDesignerControls() {
  const bodySelect = document.getElementById('droidBodySelect');
  const showScavengers = document.getElementById('droidShowScavengers')?.checked;
  const normalBodies = ['Body1REC', 'Body5REC', 'Body4ABT'];
  const scavengerBodies = Array.from(SCAVENGER_BODY_IDS);
  const templateBodyIds = new Set(getDroidTemplateList().map(template => template.body).filter(Boolean));
  populateComponentSelect(
    bodySelect,
    bodyDefs,
    (id, def) => templateBodyIds.has(id) && def?.model && (def.weaponSlots === undefined || def.weaponSlots > 0) && (showScavengers || (def?.class !== 'Babas' && !SCAVENGER_BODY_IDS.has(id))),
    showScavengers ? scavengerBodies : normalBodies
  );
  populateDroidPartOptionsForBody(bodySelect?.value);
  const currentTemplate = document.getElementById('droidTemplateSelect')?.value || 'ConstructionDroid';
  const preset = getDroidTemplateById(currentTemplate) || DROID_BUILD_TEMPLATES[0];
  setDroidDesignerParts(preset);
}

function populateDroidPartOptionsForBody(bodyId) {
  const propulsionSelect = document.getElementById('droidPropulsionSelect');
  const templatePropulsions = Array.from(new Set(
    getDroidTemplateList()
      .filter(template => template.body === bodyId)
      .map(template => template.propulsion)
      .filter(Boolean)
  ));
  populateComponentSelect(
    propulsionSelect,
    propDefs,
    id => templatePropulsions.includes(id),
    templatePropulsions
  );
  populateDroidWeaponOptions(bodyId, propulsionSelect?.value);
}

function populateDroidWeaponOptions(bodyId, propulsionId) {
  const weaponSelect = document.getElementById('droidWeaponSelect');
  const templateTools = Array.from(new Set(
    getDroidTemplateList()
      .filter(template => template.body === bodyId && template.propulsion === propulsionId)
      .map(getTemplateToolId)
      .filter(Boolean)
  ));
  populateComponentSelect(
    weaponSelect,
    getDroidToolDefs(),
    id => templateTools.includes(id),
    templateTools
  );
}

function findDroidTemplateForParts(bodyId, propulsionId, toolId) {
  const templates = getDroidTemplateList();
  const normalizedTool = toolId || '';
  return templates.find(template =>
    template.body === bodyId &&
    template.propulsion === propulsionId &&
    getTemplateToolId(template) === normalizedTool
  ) || templates.find(template =>
    template.body === bodyId &&
    template.propulsion === propulsionId
  ) || templates.find(template => template.body === bodyId) || templates[0] || null;
}

function syncDroidTemplateFromParts() {
  const templateSelect = document.getElementById('droidTemplateSelect');
  const bodySelect = document.getElementById('droidBodySelect');
  const propulsionSelect = document.getElementById('droidPropulsionSelect');
  const weaponSelect = document.getElementById('droidWeaponSelect');
  const template = findDroidTemplateForParts(
    bodySelect?.value,
    propulsionSelect?.value,
    weaponSelect?.value || ''
  );
  if (!template) return;
  if (templateSelect) templateSelect.value = template.id;
  setDroidDesignerParts(template);
}

function getSearchText(id) {
  const input = document.getElementById(id);
  return input ? input.value.trim().toLowerCase() : '';
}

function matchesSearch(parts, search) {
  if (!search) return true;
  const haystack = parts
    .filter(part => part !== undefined && part !== null)
    .map(part => String(part).toLowerCase())
    .join(' ');
  return search.split(/\s+/).every(term => haystack.includes(term));
}

function populateDroidTemplateSelect() {
  const select = document.getElementById('droidTemplateSelect');
  if (!select) return;
  const current = select.value || 'ConstructionDroid';
  select.innerHTML = '';
  const search = getSearchText('droidSearch');
  const templates = getDroidTemplateList()
    .filter(template => matchesSearch([
      template.name,
      template.id,
      template.body,
      template.propulsion,
      ...(template.weapons || [])
    ], search));
  templates.forEach(template => {
    const opt = document.createElement('option');
    opt.value = template.id;
    opt.textContent = template.name;
    select.appendChild(opt);
  });
  select.value = templates.some(template => template.id === current) ? current : (templates[0]?.id || '');
}

function clearDroidPreviewScene() {
  if (!droidPreviewScene) return;
  for (let i = droidPreviewScene.children.length - 1; i >= 0; i--) {
    const child = droidPreviewScene.children[i];
    if (child.isLight) continue;
    droidPreviewScene.remove(child);
    disposeObject3D(child);
  }
  droidPreviewMesh = null;
}

function frameDroidPreview(group) {
  if (!droidPreviewCamera || !group) return;
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const fov = droidPreviewCamera.fov * (Math.PI / 180);
  const cameraZ = (maxDim / 2) / Math.tan(fov / 2);
  const offset = cameraZ * 1.7;
  droidPreviewCamera.position.set(center.x + offset, center.y + offset * 0.75, center.z + offset);
  droidPreviewCamera.lookAt(center);
  droidPreviewCamera.updateProjectionMatrix();
}

async function updateDroidPreview() {
  if (!droidPreviewScene || !droidPreviewRenderer || !droidPreviewCamera) return;
  const previewDiv = document.getElementById('droidPreview');
  if (previewDiv) {
    const w = previewDiv.clientWidth || 160;
    const h = previewDiv.clientHeight || 180;
    droidPreviewRenderer.setSize(w, h);
    droidPreviewCamera.aspect = w / h;
    droidPreviewCamera.updateProjectionMatrix();
  }
  const currentToken = ++droidPreviewLoadToken;
  clearDroidPreviewScene();
  try {
    await loadComponentDefs();
    const design = getSelectedDroidDesign();
    const entry = makeDroidEntry(design, getDroidBuildPlayer(), 0, 0, selectedDroidRotation);
    const pieList = getDroidPieList(entry);
    if (!pieList || !pieList.length) return;
    const group = await buildDroidGroup(pieList);
    if (currentToken !== droidPreviewLoadToken) {
      disposeObject3D(group);
      return;
    }
    group.rotation.y = -selectedDroidRotation * Math.PI / 180;
    droidPreviewMesh = group;
    droidPreviewScene.add(group);
    frameDroidPreview(group);
  } catch (err) {
    console.warn('Failed to update droid preview:', err);
  }
}

function setDroidMode(mode) {
  droidMode = mode;
  clearStructurePlacementPreview();
  updateDroidModeUI();
}

function clearSelectedDroid() {
  selectedDroidGroup = null;
  if (selectedDroidBlinkTimer) {
    clearInterval(selectedDroidBlinkTimer);
    selectedDroidBlinkTimer = null;
  }
  if (selectedDroidBlinkHelper) {
    if (scene) scene.remove(selectedDroidBlinkHelper);
    selectedDroidBlinkHelper = null;
  }
  updateViewClipboardControls();
}

function selectDroidGroup(group) {
  clearSelectedDroid();
  if (!group) {
    updateDroidInfo(null, 'No droid selected.');
    updateDroidModeUI();
    return;
  }
  selectedDroidGroup = group;
  selectedDroidBlinkHelper = new THREE.BoxHelper(group, 0x6cf527);
  selectedDroidBlinkHelper.layers.set(1);
  if (scene) scene.add(selectedDroidBlinkHelper);
  selectedDroidBlinkTimer = setInterval(() => {
    if (!selectedDroidBlinkHelper) return;
    selectedDroidBlinkHelper.visible = !selectedDroidBlinkHelper.visible;
    selectedDroidBlinkHelper.update();
  }, 350);
  updateDroidInfo(group);
  updateDroidModeUI();
  updateViewClipboardControls();
}

function clearHoveredDroid() {
  hoveredDroidGroup = null;
  if (hoveredDroidHelper) {
    if (scene) scene.remove(hoveredDroidHelper);
    hoveredDroidHelper = null;
  }
}

function setHoveredDroid(group) {
  if (hoveredDroidGroup === group) {
    if (hoveredDroidHelper) hoveredDroidHelper.update();
    return;
  }
  clearHoveredDroid();
  if (!group) return;
  hoveredDroidGroup = group;
  hoveredDroidHelper = new THREE.BoxHelper(group, droidMode === 'delete' ? 0xff5555 : 0x66aaff);
  hoveredDroidHelper.layers.set(1);
  if (scene) scene.add(hoveredDroidHelper);
}

function removeDroidGroup(group) {
  if (!group || !objectsGroup.children.includes(group)) return false;
  if (selectedDroidGroup === group) clearSelectedDroid();
  if (hoveredDroidGroup === group) clearHoveredDroid();
  const entry = group.userData?.droidExport;
  if (entry) currentDroidEntries = currentDroidEntries.filter(item => item !== entry);
  objectsGroup.remove(group);
  refreshObjectPreviewLayer();
  return true;
}

function addDroidGroup(group) {
  if (!group || objectsGroup.children.includes(group)) return false;
  const entry = group.userData?.droidExport;
  if (entry && !currentDroidEntries.includes(entry)) currentDroidEntries.push(entry);
  objectsGroup.add(group);
  if (!scene.children.includes(objectsGroup)) scene.add(objectsGroup);
  refreshObjectPreviewLayer();
  return true;
}

function describeStructureGroup(group) {
  if (!group) return 'Click a structure on the map to view its info.';
  const data = group.userData?.structureExport || group.userData?.featureExport || {};
  const structureId = data.name || data.id;
  const def = getStructureDefById(structureId) || {};
  const moduleSelected = selectedStructureGroup === group && selectedStructureLayer === 'module';
  const moduleDef = moduleSelected ? getModuleDefForParent(def) : null;
  const player = getStructurePlayer(group);
  const centerX = group.position.x + (group.userData.centerX || 0);
  const centerY = group.position.z + (group.userData.centerZ || 0);
  const tileX = Math.max(0, Math.min(mapW - 1, Math.round(centerX - 0.5)));
  const tileY = Math.max(0, Math.min(mapH - 1, Math.round(centerY - 0.5)));
  const name = def.name || data.name || data.id || 'Unknown structure';
  const lines = [
    data.feature ? 'Selected feature' : moduleSelected ? 'Selected module' : 'Selected structure',
    'Name: ' + (moduleDef?.name || name),
    'ID: ' + (moduleDef?.id || structureId || def.id || 'unknown')
  ];
  if (!data.feature) lines.push('Player: ' + player);
  if (moduleSelected) lines.push('Parent: ' + name);
  if (def.categoryName || def.category !== undefined) lines.push('Type: ' + (def.categoryName || STRUCTURE_CATEGORY_NAMES[def.category] || 'unknown'));
  lines.push('Tile: ' + tileX + ', ' + tileY);
  if (data.sizeX && data.sizeY) lines.push('Size: ' + data.sizeX + 'x' + data.sizeY);
  const moduleCount = getStructureModuleCount(group);
  if (def.moduleStageModels?.length || moduleCount > 0) {
    lines.push('Modules: ' + moduleCount + '/' + Math.max(0, (def.moduleStageModels?.length || 1) - 1));
  }
  lines.push('Rotation: ' + getStructureRotationDegrees(group) + ' deg');
  return lines.join('\n');
}

function updateStructureInfo(group, fallback) {
  const info = document.getElementById('structureInfo');
  if (!info) return;
  info.textContent = group ? describeStructureGroup(group) : fallback || '';
  updateStructurePlayerControls(group);
  updateStructureRotationControls(group);
  updateStructureViewDeleteButton(group);
  updateStructureViewAddModuleButton(group);
}

function normalizeDegrees(value) {
  const raw = parseFloat(value);
  if (!Number.isFinite(raw)) return 0;
  return ((Math.round(raw) % 360) + 360) % 360;
}

function degreesToWzAngle(deg) {
  return Math.round(normalizeDegrees(deg) * 65536 / 360);
}

function parseStructureRotation(entry) {
  let rot = 0;
  let rotDeg = 0;
  if (Array.isArray(entry.rotation)) {
    const yaw = entry.rotation.find(v => typeof v === 'number' && v !== 0) ?? entry.rotation[0] ?? 0;
    rotDeg = Math.abs(yaw) > 360 ? yaw * 360 / 65536 : yaw;
    rot = Math.round(rotDeg / 90) % 4;
  } else if (typeof entry.rotation === 'number') {
    rotDeg = Math.abs(entry.rotation) > 360 ? entry.rotation * 360 / 65536 : entry.rotation;
    rot = Math.round(rotDeg / 90) % 4;
  }
  rot = ((rot % 4) + 4) % 4;
  return { rot, rotDeg: normalizeDegrees(rotDeg) };
}

function getStructureRotationDegrees(group) {
  const data = group?.userData?.structureExport || {};
  if (data.rotDeg !== undefined) return normalizeDegrees(data.rotDeg);
  return normalizeDegrees((data.rot || 0) * 90);
}

function setStructureRotationDegrees(group, degrees) {
  if (!group?.userData?.structureExport) return;
  const deg = normalizeDegrees(degrees);
  const data = group.userData.structureExport;
  data.rotDeg = deg;
  data.rot = Math.round(deg / 90) % 4;
  group.rotation.y = -deg * Math.PI / 180;
  group.updateMatrixWorld(true);
  if (selectedStructureBlinkHelper) selectedStructureBlinkHelper.update();
  if (hoveredStructureHelper) hoveredStructureHelper.update();
  updateStructureInfo(group);
}

function getFeatureDisplayName(def) {
  const name = String(def?.name || '').replace(/\*/g, '').trim();
  return name || String(def?.id || 'Object');
}

function getFeatureRotationDegrees(group) {
  const data = group?.userData?.featureExport || {};
  if (data.rotDeg !== undefined) return normalizeDegrees(data.rotDeg);
  const rotation = data.sourceEntry?.rotation;
  if (Array.isArray(rotation)) {
    const yaw = rotation.find(v => typeof v === 'number' && v !== 0) ?? rotation[0] ?? 0;
    return normalizeDegrees(Math.abs(yaw) > 360 ? yaw * 360 / 65536 : yaw);
  }
  return normalizeDegrees(-group?.rotation?.y * 180 / Math.PI || 0);
}

function describeFeatureGroup(group) {
  if (!group) return 'No object selected.';
  const data = group.userData?.featureExport || {};
  const def = getStructureDefById(data.name) || {};
  const footprint = getStructureFootprint(group);
  const lines = [
    'Selected object',
    getFeatureDisplayName(def),
    'ID: ' + (def.id || data.name || 'unknown')
  ];
  if (def.categoryName) lines.push('Type: ' + def.categoryName);
  else if (def.type) lines.push('Type: ' + def.type);
  if (footprint) lines.push('Tile: ' + footprint.x + ', ' + footprint.y);
  lines.push('Size: ' + (data.sizeX || def.sizeX || 1) + 'x' + (data.sizeY || def.sizeY || 1));
  lines.push('Rotation: ' + getFeatureRotationDegrees(group) + ' deg');
  return lines.join('\n');
}

function updateFeatureInfo(group, fallback) {
  const info = document.getElementById('featureInfo');
  if (info) info.textContent = group ? describeFeatureGroup(group) : fallback || 'No object selected.';
  const deleteBtn = document.getElementById('featureViewDeleteBtn');
  if (deleteBtn) deleteBtn.style.display = featureMode === 'view' && isFeatureGroup(group) ? 'block' : 'none';
}

function selectFeatureGroup(group) {
  clearSelectedStructure();
  if (!isFeatureGroup(group)) {
    updateFeatureInfo(null, 'No object selected.');
    updateViewClipboardControls();
    return;
  }
  selectedStructureGroup = group;
  selectedStructureLayer = 'feature';
  selectedStructureBlinkHelper = new THREE.BoxHelper(group, 0x6cf527);
  selectedStructureBlinkHelper.layers.set(1);
  if (scene) scene.add(selectedStructureBlinkHelper);
  selectedStructureBlinkTimer = setInterval(() => {
    if (!selectedStructureBlinkHelper) return;
    selectedStructureBlinkHelper.visible = !selectedStructureBlinkHelper.visible;
    selectedStructureBlinkHelper.update();
  }, 350);
  updateFeatureInfo(group);
  updateViewClipboardControls();
}

function updateFeatureModeUI() {
  document.querySelectorAll('[data-feature-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-feature-mode') === featureMode);
  });
  const buildControls = document.getElementById('featureBuildControls');
  const info = document.getElementById('featureInfo');
  const hint = document.getElementById('featureModeHint');
  if (buildControls) buildControls.style.display = featureMode === 'build' ? 'block' : 'none';
  if (info) info.style.display = featureMode === 'build' ? 'none' : 'block';
  if (hint) {
    if (featureMode === 'build') hint.textContent = 'Click on the map to place the selected object.';
    else if (featureMode === 'delete') hint.textContent = 'Hover an object and click mouse1 to remove it from the map.';
    else hint.textContent = 'Click an object on the map to view it.';
  }
  if (featureMode !== 'view') {
    clearSelectedStructure();
    clearViewBulkSelection();
    updateFeatureInfo(null, featureMode === 'delete' ? 'Hover and click an object to delete it.' : 'No object selected.');
  } else {
    updateFeatureInfo(isFeatureGroup(selectedStructureGroup) ? selectedStructureGroup : null, 'No object selected.');
    updateViewBulkSelectionPanel();
  }
  if (featureMode !== 'delete') clearHoveredStructure();
  if (featureMode === 'build') {
    clearHoveredStructure();
    requestAnimationFrame(() => updateFeaturePreview());
  } else {
    clearStructurePlacementPreview();
  }
  if (lastMouseEvent) updateHighlight(lastMouseEvent);
}

function setFeatureMode(mode) {
  if (!['view', 'build', 'delete'].includes(mode)) return;
  featureMode = mode;
  updateFeatureModeUI();
}

function getStructurePlayer(group) {
  if (group?.userData?.featureExport) return 0;
  const data = group?.userData?.structureExport || {};
  const source = data.sourceEntry || {};
  const raw = data.player ?? source.player ?? source.startpos ?? 0;
  const player = parseInt(raw, 10);
  return Number.isFinite(player) ? Math.max(0, Math.min(10, player)) : 0;
}

function setStructurePlayer(group, player) {
  if (!group?.userData?.structureExport || group.userData?.featureExport) return;
  const nextPlayer = Math.max(0, Math.min(10, parseInt(player, 10) || 0));
  const data = group.userData.structureExport;
  data.player = nextPlayer;
  if (data.sourceEntry && typeof data.sourceEntry === 'object') {
    if (data.sourceEntry.player !== undefined) data.sourceEntry.player = nextPlayer;
    else data.sourceEntry.startpos = nextPlayer;
  }
  setStructureGroupPlayerColor(group, nextPlayer);
  updateStructureInfo(group);
  updateMinimap();
}

function updateStructurePlayerControls(group) {
  const controls = document.getElementById('structurePlayerControls');
  const select = document.getElementById('structurePlayerSelect');
  if (!controls || !select) return;
  const show = structureMode === 'view' && !!group && !group.userData?.featureExport;
  controls.style.display = show ? 'flex' : 'none';
  if (!show) return;
  populatePlayerSelect(select);
  select.value = String(getStructurePlayer(group));
}

function getStructureBuildPlayer() {
  return document.getElementById('structureBuildPlayerSelect')?.value ?? 0;
}

function getDroidBuildPlayer() {
  return document.getElementById('droidPlayerSelect')?.value ?? 0;
}

function updateStructureRotationControls(group) {
  const controls = document.getElementById('structureRotationControls');
  const input = document.getElementById('structureRotationInput');
  if (!controls || !input) return;
  const show = structureMode === 'view' && !!group && selectedStructureLayer !== 'module' && !group.userData?.featureExport;
  controls.style.display = show ? 'flex' : 'none';
  if (!show) return;
  input.value = String(getStructureRotationDegrees(group));
}

function updateStructureViewDeleteButton(group) {
  const btn = document.getElementById('structureViewDeleteBtn');
  if (!btn) return;
  btn.style.display = structureMode === 'view' && !!group ? 'block' : 'none';
  btn.textContent = selectedStructureLayer === 'module' ? 'Delete module' : 'Delete structure';
}

function updateStructureViewAddModuleButton(group) {
  const btn = document.getElementById('structureViewAddModuleBtn');
  if (!btn) return;
  const parentDef = getStructureGroupDef(group);
  const moduleDef = getModuleDefForParent(parentDef);
  const moduleRule = getModuleParentTypes(moduleDef);
  const show = structureMode === 'view' && !!group && !!moduleRule && getStructureModuleCount(group) < moduleRule.max;
  btn.style.display = show ? 'block' : 'none';
}

function clearSelectedStructure() {
  selectedStructureGroup = null;
  selectedStructureLayer = 'structure';
  if (selectedStructureBlinkTimer) {
    clearInterval(selectedStructureBlinkTimer);
    selectedStructureBlinkTimer = null;
  }
  if (selectedStructureBlinkHelper) {
    if (scene) scene.remove(selectedStructureBlinkHelper);
    selectedStructureBlinkHelper = null;
  }
  updateViewClipboardControls();
}

function selectStructureGroup(group) {
  clearSelectedStructure();
  if (!group) {
    updateStructureInfo(null, 'No structure selected.');
    return;
  }
  selectedStructureGroup = group;
  selectedStructureLayer = getStructureModuleCount(group) > 0 ? 'module' : 'structure';
  selectedStructureBlinkHelper = new THREE.BoxHelper(group, 0x6cf527);
  selectedStructureBlinkHelper.layers.set(1);
  if (scene) scene.add(selectedStructureBlinkHelper);
  selectedStructureBlinkTimer = setInterval(() => {
    if (!selectedStructureBlinkHelper) return;
    selectedStructureBlinkHelper.visible = !selectedStructureBlinkHelper.visible;
    selectedStructureBlinkHelper.update();
  }, 350);
  updateStructureInfo(group);
  updateViewClipboardControls();
}

function clearHoveredStructure() {
  hoveredStructureGroup = null;
  if (hoveredStructureHelper) {
    if (scene) scene.remove(hoveredStructureHelper);
    hoveredStructureHelper = null;
  }
}

function setHoveredStructure(group, mode = structureMode) {
  if (hoveredStructureGroup === group) {
    if (hoveredStructureHelper) hoveredStructureHelper.update();
    return;
  }
  clearHoveredStructure();
  if (!group) return;
  hoveredStructureGroup = group;
  hoveredStructureHelper = new THREE.BoxHelper(group, mode === 'delete' ? 0xff5555 : 0x66aaff);
  hoveredStructureHelper.layers.set(1);
  if (scene) scene.add(hoveredStructureHelper);
}

function removeStructureGroup(group) {
  if (!group || !objectsGroup.children.includes(group)) return false;
  if (selectedStructureGroup === group) clearSelectedStructure();
  if (hoveredStructureGroup === group) clearHoveredStructure();
  const featureEntry = group.userData?.featureExport?.sourceEntry;
  if (featureEntry) currentFeatureEntries = currentFeatureEntries.filter(item => item !== featureEntry);
  objectsGroup.remove(group);
  refreshObjectPreviewLayer();
  return true;
}

function addStructureGroup(group) {
  if (!group || objectsGroup.children.includes(group)) return false;
  const featureEntry = group.userData?.featureExport?.sourceEntry;
  if (featureEntry && !currentFeatureEntries.includes(featureEntry)) currentFeatureEntries.push(featureEntry);
  if (!group.userData?.featureExport) setStructureGroupPlayerColor(group, getStructurePlayer(group));
  objectsGroup.add(group);
  refreshObjectPreviewLayer();
  return true;
}

function replaceStructureGroup(oldGroup, newGroup) {
  if (!oldGroup || !newGroup || !objectsGroup.children.includes(oldGroup)) return false;
  const index = objectsGroup.children.indexOf(oldGroup);
  if (selectedStructureGroup === oldGroup) clearSelectedStructure();
  if (hoveredStructureGroup === oldGroup) clearHoveredStructure();
  objectsGroup.remove(oldGroup);
  addStructureGroup(newGroup);
  const newIndex = objectsGroup.children.indexOf(newGroup);
  if (index >= 0 && newIndex >= 0 && index !== newIndex) {
    objectsGroup.children.splice(newIndex, 1);
    objectsGroup.children.splice(index, 0, newGroup);
  }
  if (!scene.children.includes(objectsGroup)) scene.add(objectsGroup);
  refreshObjectPreviewLayer();
  return true;
}

function getStructureDefById(id) {
  const key = String(id || '').toLowerCase();
  return STRUCTURE_DEFS.find(def => String(def.id || '').toLowerCase() === key) ||
    FEATURE_DEFS.find(def => String(def.id || '').toLowerCase() === key) ||
    (key === OIL_SPOT_DEF_ID.toLowerCase() ? OIL_SPOT_DEF : null);
}

function getStructureGroupDef(group) {
  return getStructureDefById(group?.userData?.structureExport?.name || group?.userData?.featureExport?.name);
}

function getStructureModuleCount(group) {
  if (group?.userData?.featureExport) return 0;
  const data = group?.userData?.structureExport || {};
  const source = data.sourceEntry || {};
  const raw = data.modules ?? source.modules ?? 0;
  const count = parseInt(raw, 10);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function setStructureModuleCount(group, count) {
  if (!group?.userData?.structureExport) return;
  const nextCount = Math.max(0, parseInt(count, 10) || 0);
  const data = group.userData.structureExport;
  data.modules = nextCount;
  if (data.sourceEntry && typeof data.sourceEntry === 'object') {
    if (nextCount > 0) data.sourceEntry.modules = nextCount;
    else delete data.sourceEntry.modules;
  }
}

function getStructureRenderDef(def, moduleCount = 0) {
  if (!def?.moduleStageModels?.length) return def;
  const stage = Math.max(0, Math.min(def.moduleStageModels.length - 1, parseInt(moduleCount, 10) || 0));
  const pies = [];
  if (def.baseModel) pies.push(def.baseModel);
  pies.push(def.moduleStageModels[stage]);
  if (def.turretPieces?.length) pies.push(...def.turretPieces);
  return { ...def, pies };
}

function getStructureFootprint(group) {
  const data = group?.userData?.structureExport || group?.userData?.featureExport;
  if (!data) return null;
  const sizeX = data.sizeX || 1;
  const sizeY = data.sizeY || 1;
  const centerX = group.position.x + (group.userData.centerX || 0);
  const centerY = group.position.z + (group.userData.centerZ || 0);
  const x = Math.round(centerX - sizeX / 2);
  const y = Math.round(centerY - sizeY / 2);
  return { x, y, sizeX, sizeY };
}

function footprintsOverlap(a, b) {
  return a.x < b.x + b.sizeX &&
    a.x + a.sizeX > b.x &&
    a.y < b.y + b.sizeY &&
    a.y + a.sizeY > b.y;
}

function footprintsMatch(a, b) {
  return a.x === b.x && a.y === b.y && a.sizeX === b.sizeX && a.sizeY === b.sizeY;
}

function getModuleParentTypes(def) {
  const type = String(def?.type || '').toLowerCase();
  return STRUCTURE_MODULE_PARENT_TYPES[type] || null;
}

function getModuleDefForParent(def) {
  const type = String(def?.type || '').toLowerCase();
  if (type === 'power generator') return getStructureDefById('A0PowMod1');
  if (type === 'research') return getStructureDefById('A0ResearchModule1');
  if (type === 'factory' || type === 'vtol factory') return getStructureDefById('A0FacMod1');
  return null;
}

function isOilSpotDef(def) {
  return String(def?.id || '').toLowerCase() === OIL_SPOT_DEF_ID.toLowerCase();
}

function isOilDerrickDef(def) {
  return String(def?.id || '').toLowerCase() === 'a0resourceextractor';
}

function findModuleParentForPlacement(def, target) {
  const moduleRule = getModuleParentTypes(def);
  if (!moduleRule) return null;
  for (const group of objectsGroup.children) {
    const parentDef = getStructureGroupDef(group);
    const type = String(parentDef?.type || '').toLowerCase();
    if (!moduleRule.parents.has(type)) continue;
    const footprint = getStructureFootprint(group);
    if (footprint && footprintsMatch(target, footprint)) return group;
  }
  return null;
}

function getStructurePlacementValidity(def, tileX, tileY, sizeX, sizeY) {
  const target = { x: tileX, y: tileY, sizeX, sizeY };
  if (tileX < 0 || tileY < 0 || tileX + sizeX > mapW || tileY + sizeY > mapH) {
    return { valid: false, reason: 'Structure does not fit inside the map.' };
  }

  const overlaps = [];
  objectsGroup.children.forEach(group => {
    const footprint = getStructureFootprint(group);
    if (footprint && footprintsOverlap(target, footprint)) {
      overlaps.push({ group, footprint, def: getStructureGroupDef(group) });
    }
  });

  if (isOilSpotDef(def)) {
    return overlaps.length ? { valid: false, reason: 'Oil spot must be placed on an empty tile.' } : { valid: true };
  }

  if (isOilDerrickDef(def)) {
    const oilSpot = overlaps.find(item => isOilSpotDef(item.def) && footprintsMatch(target, item.footprint));
    if (!oilSpot) return { valid: false, reason: 'Oil Derrick must be placed on an empty oil spot.' };
    const blockers = overlaps.filter(item => item.group !== oilSpot.group);
    return blockers.length ? { valid: false, reason: 'Oil spot is already occupied.' } : { valid: true, oilSpotGroup: oilSpot.group };
  }

  const moduleRule = getModuleParentTypes(def);
  if (!moduleRule) {
    return overlaps.length ? { valid: false, reason: 'That tile is already occupied.' } : { valid: true };
  }

  let foundParent = false;
  let existingModules = 0;
  let parentGroup = null;
  for (const item of overlaps) {
    const type = String(item.def?.type || '').toLowerCase();
    const id = String(item.def?.id || '').toLowerCase();
    const isSameModule = id && id === String(def.id || '').toLowerCase();
    const isMatchingParent = moduleRule.parents.has(type) && footprintsMatch(target, item.footprint);
    if (isMatchingParent) {
      foundParent = true;
      parentGroup = item.group;
      existingModules = Math.max(existingModules, getStructureModuleCount(item.group));
    }
    if (isSameModule && footprintsMatch(target, item.footprint)) existingModules++;
    if (!isMatchingParent && !isSameModule) {
      return { valid: false, reason: 'Module must be placed on a matching structure.' };
    }
  }

  if (existingModules >= moduleRule.max) {
    return { valid: false, reason: 'This structure already has the maximum number of modules.' };
  }
  return foundParent ? { valid: true, parentGroup } : { valid: false, reason: 'Module must be placed on a matching structure.' };
}

const WALL_CONNECT_LEFT = 1;
const WALL_CONNECT_RIGHT = 2;
const WALL_CONNECT_UP = 4;
const WALL_CONNECT_DOWN = 8;
const WALL_DIR_DEGREES = [0, 0, 180, 0, 270, 0, 270, 0, 90, 90, 180, 180, 270, 90, 270, 0];
const WALL_MODEL_INDEX = [0, 0, 0, 0, 0, 3, 3, 2, 0, 3, 3, 2, 0, 2, 2, 1];
let wallPlacementQueue = Promise.resolve();
let liveWallRefreshTimer = 0;

function isWallCombiningDef(def) {
  const type = String(def?.type || '').toUpperCase();
  return type === 'WALL' || type === 'GATE' || type === 'CORNER WALL' || !!def?.combinesWithWall;
}

function isAutoWallShapeDef(def) {
  const type = String(def?.type || '').toUpperCase();
  return (type === 'WALL' || type === 'GATE') && Array.isArray(def?.wallModels) && def.wallModels.length > 1;
}

function enqueueWallPlacement(task) {
  wallPlacementQueue = wallPlacementQueue
    .catch(() => {})
    .then(task)
    .catch(err => {
      console.error('Failed to place wall structure:', err);
      setFileStatus('Failed to place structure.');
    });
  return wallPlacementQueue;
}

function scheduleLiveWallConnectionRefresh() {
  if (liveWallRefreshTimer) clearTimeout(liveWallRefreshTimer);
  liveWallRefreshTimer = setTimeout(() => {
    liveWallRefreshTimer = 0;
    wallPlacementQueue
      .catch(() => {})
      .then(() => refreshAllWallConnections())
      .then(() => {
        if (lastMouseEvent) updateHighlight(lastMouseEvent);
      })
      .catch(err => {
        console.error('Failed to refresh wall connections:', err);
      });
  }, 0);
}

function getWallShapeRenderDef(def, modelIndex) {
  if (!isAutoWallShapeDef(def)) return def;
  const models = def.wallModels;
  const idx = Math.max(0, Math.min(models.length - 1, parseInt(modelIndex, 10) || 0));
  return {
    ...def,
    pies: def.baseModel ? [def.baseModel, models[idx]] : [models[idx]],
    moduleStageModels: [],
    wallRenderIndex: idx,
    preserveModelOrigin: true
  };
}

function getStructureGroupAtTile(tileX, tileY) {
  if (!objectsGroup) return null;
  return objectsGroup.children.find(group => {
    if (group?.userData?.featureExport || group?.userData?.droidExport) return false;
    const footprint = getStructureFootprint(group);
    return footprint &&
      tileX >= footprint.x &&
      tileX < footprint.x + footprint.sizeX &&
      tileY >= footprint.y &&
      tileY < footprint.y + footprint.sizeY;
  }) || null;
}

function getWallNeighborMask(tileX, tileY, player) {
  const checks = [
    { bit: WALL_CONNECT_LEFT, x: tileX - 1, y: tileY },
    { bit: WALL_CONNECT_RIGHT, x: tileX + 1, y: tileY },
    // Warzone's wall PIEs are authored with the vertical map axis mirrored
    // from our Three.js tile Z axis, so convert vertical neighbors before
    // applying the official wallDir/wallType tables.
    { bit: WALL_CONNECT_DOWN, x: tileX, y: tileY - 1 },
    { bit: WALL_CONNECT_UP, x: tileX, y: tileY + 1 }
  ];
  let mask = 0;
  checks.forEach(check => {
    if (check.x < 0 || check.y < 0 || check.x >= mapW || check.y >= mapH) return;
    const group = getStructureGroupAtTile(check.x, check.y);
    const def = getStructureGroupDef(group);
    if (group && def && isWallCombiningDef(def) && getStructurePlayer(group) === player) {
      mask |= check.bit;
    }
  });
  return mask;
}

function getWallShapeInfo(def, tileX, tileY, player, fallbackRot = 0) {
  if (!isAutoWallShapeDef(def)) return null;
  const mask = getWallNeighborMask(tileX, tileY, player);
  const modelIndex = WALL_MODEL_INDEX[mask] || 0;
  const rotDeg = mask === 0 ? normalizeDegrees((fallbackRot || 0) * 90) : WALL_DIR_DEGREES[mask];
  const rot = Math.round(rotDeg / 90) % 4;
  return {
    mask,
    modelIndex,
    rot,
    rotDeg,
    renderDef: getWallShapeRenderDef(def, modelIndex)
  };
}

async function buildWallShapeReplacement(group) {
  const def = getStructureGroupDef(group);
  if (!isAutoWallShapeDef(def)) return null;
  const footprint = getStructureFootprint(group);
  if (!footprint || footprint.sizeX !== 1 || footprint.sizeY !== 1) return null;
  const player = getStructurePlayer(group);
  const currentRotDeg = getStructureRotationDegrees(group);
  const info = getWallShapeInfo(def, footprint.x, footprint.y, player, Math.round(currentRotDeg / 90));
  if (!info) return null;
  const currentIndex = group.userData?.wallRenderIndex;
  if (currentIndex === info.modelIndex && normalizeDegrees(currentRotDeg) === info.rotDeg) return null;
  if (currentIndex === undefined && info.modelIndex === 0 && normalizeDegrees(currentRotDeg) === info.rotDeg) return null;

  const data = group.userData?.structureExport || {};
  const sourceEntry = cloneMapObjectData(data.sourceEntry) || {};
  const newGroup = await buildStructureGroup(info.renderDef, info.rot, 1, 1);
  const minH = getMinTerrainHeight(footprint.x, footprint.y, 1, 1);
  newGroup.position.copy(getStructurePlacementPosition(newGroup, footprint.x, footprint.y, 1, 1, minH));
  markStructureForExport(newGroup, def, info.rot, 1, 1, sourceEntry, data.style || currentStructJsonStyle);
  setStructurePlayer(newGroup, player);
  setStructureRotationDegrees(newGroup, info.rotDeg);
  newGroup.userData.wallRenderIndex = info.modelIndex;
  newGroup.userData.wallConnectMask = info.mask;
  return newGroup;
}

async function refreshWallGroupShape(group) {
  const newGroup = await buildWallShapeReplacement(group);
  if (!newGroup) return null;
  if (!replaceStructureGroup(group, newGroup)) return null;
  return { oldGroup: group, newGroup };
}

async function refreshWallConnectionsForPlayer(player) {
  const groups = objectsGroup ? objectsGroup.children.slice() : [];
  const replacements = [];
  for (const group of groups) {
    if (!objectsGroup.children.includes(group)) continue;
    if (getStructurePlayer(group) !== player) continue;
    const def = getStructureGroupDef(group);
    if (!isAutoWallShapeDef(def)) continue;
    const replacement = await refreshWallGroupShape(group);
    if (replacement) replacements.push(replacement);
  }
  return replacements;
}

async function refreshAllWallConnections() {
  const players = new Set();
  if (objectsGroup) {
    objectsGroup.children.forEach(group => {
      const def = getStructureGroupDef(group);
      if (isAutoWallShapeDef(def)) players.add(getStructurePlayer(group));
    });
  }
  for (const player of players) await refreshWallConnectionsForPlayer(player);
}

async function removeStructureGroupWithWallRefresh(group) {
  const def = getStructureGroupDef(group);
  const footprint = getStructureFootprint(group);
  const player = getStructurePlayer(group);
  if (!removeStructureGroup(group)) return null;
  const replacements = def && footprint && isWallCombiningDef(def)
    ? await refreshWallConnectionsForPlayer(player)
    : [];
  if (def && isWallCombiningDef(def)) scheduleLiveWallConnectionRefresh();
  return replacements.length
    ? { type: 'structure-delete-wall-batch', group, replacements }
    : { type: 'structure-delete', group };
}

function tintPlacementPreview(group, valid) {
  if (valid) return;
  group.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const tinted = materials.map(mat => {
      const next = mat.clone();
      if (next.color) next.color.set(0xff3333);
      if (next.emissive) next.emissive.set(0x661111);
      next.transparent = true;
      next.opacity = Math.min(next.opacity || 1, 0.7);
      return next;
    });
    child.material = Array.isArray(child.material) ? tinted : tinted[0];
  });
}

function setPlacementPreviewOpacity(group, opacity) {
  group?.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach(mat => {
      if (!mat) return;
      mat.transparent = true;
      mat.opacity = Math.min(mat.opacity || 1, opacity);
      mat.depthWrite = false;
    });
  });
}

function closeServerMapLicenseDialog() {
  if (serverMapLicenseBackdrop) serverMapLicenseBackdrop.classList.add('hidden');
  if (serverMapLicenseDialog) serverMapLicenseDialog.classList.add('hidden');
}

function closeLicenseHelpDialog() {
  if (licenseHelpBackdrop) licenseHelpBackdrop.classList.add('hidden');
  if (licenseHelpDialog) licenseHelpDialog.classList.add('hidden');
}

function getServerMapHashFromFilename(filename) {
  const match = String(filename || '').match(/-([0-9a-f]{64})\.wz$/i);
  return match ? match[1].toLowerCase() : '';
}

function getServerMapDisplayName(filename, metadata = null) {
  const metadataName = String(metadata?.name || '').trim();
  if (metadataName) return metadataName;
  const cleanName = String(filename || 'Server map')
    .split(/[\\/]/)
    .pop()
    .replace(/\.(wz|zip)$/i, '')
    .replace(/-[0-9a-f]{64}$/i, '')
    .replace(/^\d+[cp]-/i, '');
  return cleanName || 'Server map';
}

function loadServerMapDatabase() {
  if (!serverMapDatabasePromise) {
    serverMapDatabasePromise = fetch('https://maps.wz2100.net/api/v1/full.json')
      .then(resp => {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .catch(err => {
        serverMapDatabasePromise = null;
        throw err;
      });
  }
  return serverMapDatabasePromise;
}

async function getServerMapLicenseInfo(filename) {
  const hash = getServerMapHashFromFilename(filename);
  if (!hash) return null;
  try {
    const db = await loadServerMapDatabase();
    return (db?.maps || []).find(map => String(map?.download?.hash || '').toLowerCase() === hash) || null;
  } catch (err) {
    console.warn('Failed to load server map license metadata:', err);
    return null;
  }
}

function getLicenseUseText(license) {
  const value = String(license || '').toUpperCase();
  if (value.includes('CC0')) {
    return [
      'Private editing: OK.',
      'Public sharing: OK; attribution is not required, but still nice when known.'
    ];
  }
  if (value.includes('CC-BY-SA')) {
    return [
      'Private editing: OK.',
      'Public sharing: credit the original author and keep the modified map under a compatible share-alike license.'
    ];
  }
  if (value.includes('CC-BY')) {
    return [
      'Private editing: OK.',
      'Public sharing: credit the original author.'
    ];
  }
  if (value.includes('GPL')) {
    return [
      'Private editing: OK.',
      'Public sharing: keep the modified map under GPL-compatible terms and preserve author/license information.'
    ];
  }
  return [
    'Private editing: OK.',
    'Public sharing: check the map source or author first, because the license was not found.'
  ];
}

function showLicenseHelpDialog() {
  if (!licenseHelpDialog || !licenseHelpBody) return;
  const licenses = [
    ['CC0-1.0', 'Public domain style license. Best when you allow anyone to edit, remix, and share without required credit.'],
    ['CC-BY-4.0', 'Allows edits and sharing, but users should credit the original author.'],
    ['CC-BY-SA-4.0', 'Allows edits and sharing with credit, and shared edits should use a compatible share-alike license.'],
    ['GPL-2.0-or-later', 'Allows sharing and modification under GPL-compatible terms. Keep author and license information with the map.'],
    ['GPL-3.0-or-later', 'Allows sharing and modification under GPL-compatible terms, using GPL version 3 or later. Keep author and license information.'],
    ['MIT', 'Permissive license. Allows editing and sharing, usually with the license and copyright notice kept.'],
    ['Unknown', 'Use this only when you do not know the license yet. Before public sharing, check the author or map source first.']
  ];
  licenseHelpBody.innerHTML = '';
  licenses.forEach(([name, summary]) => {
    const section = document.createElement('div');
    section.style.marginBottom = '10px';
    const title = document.createElement('strong');
    title.textContent = name;
    section.appendChild(title);
    const p = document.createElement('p');
    p.textContent = summary;
    section.appendChild(p);
    if (name !== 'Unknown') {
      const ul = document.createElement('ul');
      getLicenseUseText(name).forEach(text => {
        const li = document.createElement('li');
        li.textContent = text;
        ul.appendChild(li);
      });
      section.appendChild(ul);
    }
    licenseHelpBody.appendChild(section);
  });
  const note = document.createElement('div');
  note.className = 'app-dialog-hint';
  note.textContent = 'This is not legal advice. For maps you publish, keep the original author, source, and license information whenever possible.';
  licenseHelpBody.appendChild(note);
  if (licenseHelpBackdrop) licenseHelpBackdrop.classList.remove('hidden');
  licenseHelpDialog.classList.remove('hidden');
}

function showServerMapLicenseDialog(filename, metadata) {
  if (!serverMapLicenseDialog || !serverMapLicenseBody) return;
  const mapName = getServerMapDisplayName(filename, metadata);
  const author = Array.isArray(metadata?.author) ? metadata.author.join(', ') : metadata?.author;
  const license = metadata?.license || 'Unknown';
  const tips = getLicenseUseText(license);

  serverMapLicenseBody.innerHTML = '';
  [
    ['Map', mapName],
    ['Author', author || 'Unknown'],
    ['License', license]
  ].forEach(([label, value]) => {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = label + ': ';
    p.appendChild(strong);
    p.appendChild(document.createTextNode(value));
    serverMapLicenseBody.appendChild(p);
  });

  const ul = document.createElement('ul');
  tips.forEach(text => {
    const li = document.createElement('li');
    li.textContent = text;
    ul.appendChild(li);
  });
  serverMapLicenseBody.appendChild(ul);

  const note = document.createElement('div');
  note.className = 'app-dialog-hint';
  note.textContent = 'This is not legal advice. If you upload or share an edited map, keep the original author and license information with it.';
  serverMapLicenseBody.appendChild(note);

  if (serverMapLicenseBackdrop) serverMapLicenseBackdrop.classList.remove('hidden');
  serverMapLicenseDialog.classList.remove('hidden');
}

function scheduleServerMapLicenseNotice(filename, metadata) {
  setTimeout(() => showServerMapLicenseDialog(filename, metadata), 700);
}

function updateStructureModeUI() {
  document.querySelectorAll('[data-structure-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-structure-mode') === structureMode);
  });
  const buildControls = document.getElementById('structureBuildControls');
  const info = document.getElementById('structureInfo');
  const hint = document.getElementById('structureModeHint');
  if (buildControls) buildControls.style.display = structureMode === 'build' ? 'block' : 'none';
  if (info) info.style.display = structureMode === 'build' ? 'none' : 'block';
  if (hint) {
    hint.style.display = structureMode === 'view' ? 'none' : 'block';
    if (structureMode === 'delete') hint.textContent = 'Hover a structure and click mouse1 to remove it from the map.';
    else if (structureMode === 'build') hint.textContent = 'Click on the map to place the selected structure. Structures snap to the terrain and cannot overlap the map boundary.';
    else hint.textContent = '';
  }
  updateStructurePlayerControls(structureMode === 'view' ? selectedStructureGroup : null);
  updateStructureRotationControls(structureMode === 'view' ? selectedStructureGroup : null);
  updateStructureViewDeleteButton(structureMode === 'view' ? selectedStructureGroup : null);
  updateStructureViewAddModuleButton(structureMode === 'view' ? selectedStructureGroup : null);
  if (structureMode !== 'view') clearViewBulkSelection();
  else updateViewBulkSelectionPanel();
  if (structureMode === 'build') {
    clearHoveredStructure();
    clearSelectedStructure();
  } else {
    clearStructurePlacementPreview();
    updateStructureInfo(selectedStructureGroup, structureMode === 'delete' ? 'Hover and click a structure to delete it.' : 'Click a structure on the map to view its info.');
  }
}

function setStructureMode(mode) {
  if (!['view', 'build', 'delete'].includes(mode)) return;
  structureMode = mode;
  updateStructureModeUI();
  if (lastMouseEvent) updateHighlight(lastMouseEvent);
}

const STRUCTURE_CATEGORY_NAMES = [
  'Resources',
  'Base buildings',
  'Sensors',
  'Walls',
  'Towers',
  'Bunkers',
  'Hardpoints',
  'Fortresses',
  'Artillery emplacements',
  'Anti-Air batteries',
  'Other defenses',
  'Unavailable buildings'
];

const OIL_SPOT_DEF_ID = 'OilResource';
const OIL_SPOT_DEF = {
  id: OIL_SPOT_DEF_ID,
  name: 'Oil Resource',
  sizeX: 1,
  sizeY: 1,
  pies: ['mislick.pie'],
  type: 'OIL RESOURCE',
  strength: '',
  feature: true,
  featureName: 'OilResource'
};

const FEATURE_CATEGORY_NAMES = [
  'Trees / bushes',
  'Boulders / traps / wreck chunks',
  'Ruins / buildings',
  'City / skyscraper objects',
  'Vehicles / pipes / debris',
  'Resource / misc'
];

function categorizeFeature(def) {
  const type = String(def?.type || '').toUpperCase();
  if (type === 'TREE') return 'Trees / bushes';
  if (type === 'BOULDER') return 'Boulders / traps / wreck chunks';
  if (type === 'SKYSCRAPER') return 'City / skyscraper objects';
  if (type === 'VEHICLE') return 'Vehicles / pipes / debris';
  if (type === 'OIL RESOURCE' || type === 'OIL DRUM' || type === 'GENERIC ARTEFACT') return 'Resource / misc';
  return 'Ruins / buildings';
}

async function loadFeatureDefs() {
  try {
    const url = (typeof window !== 'undefined' && window.FEATURES_JSON) ? window.FEATURES_JSON : 'features.json';
    const resp = await fetch(url, { cache: 'no-cache' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    FEATURE_DEFS = Object.values(data)
      .map(entry => {
        const def = {
          id: entry.id,
          name: entry.name || entry.id,
          sizeX: entry.width || 1,
          sizeY: entry.breadth || 1,
          pies: entry.model ? [entry.model] : [],
          type: entry.type || '',
          strength: '',
          feature: true,
          featureName: entry.id
        };
        def.categoryName = categorizeFeature(def);
        return def;
      })
      .filter(def => def.id && def.pies.length);
    populateFeatureSelect();
  } catch (err) {
    console.error('Failed to load feature definitions:', err);
    FEATURE_DEFS = [OIL_SPOT_DEF];
    populateFeatureSelect();
  }
}

function populateFeatureSelect() {
  const featureSelect = document.getElementById('featureSelect');
  if (!featureSelect) return;
  while (featureSelect.firstChild) featureSelect.removeChild(featureSelect.firstChild);
  const filterSelect = document.getElementById('featureFilter');
  const filter = filterSelect ? filterSelect.value : 'All types';
  const search = getSearchText('featureSearch');
  const groups = Object.fromEntries(FEATURE_CATEGORY_NAMES.map(c => [c, []]));
  FEATURE_DEFS.forEach((def, idx) => {
    if (!matchesSearch([getFeatureDisplayName(def), def.id, def.featureName, def.categoryName, def.type], search)) return;
    const cat = def.categoryName || categorizeFeature(def);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push({ def, idx });
  });
  const appendOption = (parent, def, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = getFeatureDisplayName(def);
    parent.appendChild(opt);
  };
  if (filter === 'All types') {
    FEATURE_CATEGORY_NAMES.forEach(cat => {
      const items = groups[cat] || [];
      if (!items.length) return;
      const optgroup = document.createElement('optgroup');
      optgroup.label = cat;
      items
        .sort((a, b) => getFeatureDisplayName(a.def).localeCompare(getFeatureDisplayName(b.def)))
        .forEach(({ def, idx }) => appendOption(optgroup, def, idx));
      featureSelect.appendChild(optgroup);
    });
  } else {
    (groups[filter] || [])
      .sort((a, b) => getFeatureDisplayName(a.def).localeCompare(getFeatureDisplayName(b.def)))
      .forEach(({ def, idx }) => appendOption(featureSelect, def, idx));
  }
  selectedFeatureIndex = -1;
  updateFeaturePreview();
}

function populateFeatureFilter() {
  const filterSelect = document.getElementById('featureFilter');
  if (!filterSelect) return;
  while (filterSelect.firstChild) filterSelect.removeChild(filterSelect.firstChild);
  const allOpt = document.createElement('option');
  allOpt.value = 'All types';
  allOpt.textContent = 'All types';
  filterSelect.appendChild(allOpt);
  FEATURE_CATEGORY_NAMES.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    filterSelect.appendChild(opt);
  });
  filterSelect.value = 'All types';
}

const BASE_STRUCTURE_IDS = new Set([
  'a0commandcentre',
  'a0comdroidcontrol',
  'a0powergenerator',
  'a0powmod1',
  'a0researchfacility',
  'a0researchmodule1',
  'a0lightfactory',
  'a0cyborgfactory',
  'a0facmod1',
  'a0vtolfactory1',
  'a0repaircentre3',
  'a0vtolpad',
  'a0resourceextractor',
  'a0sat-linkcentre',
  'a0lassatcommand'
]);

const STRUCTURE_MODULE_PARENT_TYPES = {
  'factory module': { parents: new Set(['factory', 'vtol factory']), max: 2 },
  'power module': { parents: new Set(['power generator']), max: 1 },
  'research module': { parents: new Set(['research']), max: 1 }
};

const SENSOR_STRUCTURE_IDS = new Set([
  'sys-sensotower01',
  'sys-sensotower02',
  'sys-radardetector01',
  'sys-cb-tower01',
  'sys-vtol-radartower01',
  'sys-vtol-cb-tower01',
  'sys-sensotowerws'
]);

const SENSOR_STRUCTURE_ORDER = [
  'sys-sensotower01',
  'sys-sensotower02',
  'sys-radardetector01',
  'sys-cb-tower01',
  'sys-vtol-radartower01',
  'sys-vtol-cb-tower01',
  'sys-sensotowerws'
];

const WALL_STRUCTURE_IDS = new Set([
  'a0tanktrap',
  'a0hardcretemk1cwall',
  'a0hardcretemk1wall',
  'a0hardcretemk1gate'
]);

const ALLOWED_TOWER_IDS = new Set([
  'guardtower1',
  'guardtower6',
  'guardtower5',
  'guardtower-rail1',
  'guardtower-atmiss',
  'sys-spytower',
  'guardtower-beamlas',
  'sys-sensotower01',
  'sys-sensotower02',
  'sys-radardetector01',
  'sys-cb-tower01',
  'sys-vtol-radartower01',
  'sys-vtol-cb-tower01',
  'sys-sensotowerws'
]);

const ALLOWED_BUNKER_IDS = new Set([
  'pillbox1',
  'pillbox5',
  'pillbox4',
  'pillbox-cannon6',
  'tower-projector',
  'pillbox-rotmg',
  'plasmite-flamer-bunker'
]);

const ALLOWED_HARDPOINT_IDS = new Set([
  'wall-rotmg',
  'wall-vulcancan',
  'walltower-doubleaagun',
  'walltower-doubleaagun02',
  'walltower-hpvcannon',
  'walltower-hvatrocket',
  'walltower-pulselas',
  'walltower-quadrotaagun',
  'walltower-rail2',
  'walltower-rail3',
  'walltower-samhvy',
  'walltower-samsite',
  'walltower-twinassaultgun',
  'walltower-atmiss',
  'walltower-emp',
  'walltower01',
  'walltower02',
  'walltower03',
  'walltower04',
  'walltower06'
]);

const ALLOWED_FORTRESS_IDS = new Set([
  'x-super-cannon',
  'x-super-rocket',
  'x-super-missile',
  'x-super-massdriver'
]);

const ALLOWED_ARTILLERY_IDS = new Set([
  'emplacement-mortarpit01',
  'emplacement-mrl-pit',
  'emplacement-mortarpit02',
  'emplacement-rotmor',
  'emplacement-mortarpit-incendiary',
  'emplacement-mrlhvy-pit',
  'emplacement-rocket06-idf',
  'emplacement-howitzer105',
  'emplacement-howitzer-incendiary',
  'emplacement-rothow',
  'emplacement-howitzer150',
  'emplacement-mortaremp',
  'emplacement-mdart-pit',
  'emplacement-heavyplasmalauncher',
  'emplacement-hvart-pit'
]);

const ALLOWED_ANTI_AIR_IDS = new Set([
  'aasite-quadmg1',
  'p0-aasite-sunburst',
  'aasite-quadbof',
  'aasite-quadrotmg',
  'aasite-quadbof02',
  'p0-aasite-sam1',
  'p0-aasite-laser',
  'p0-aasite-sam2'
]);

const ALLOWED_OTHER_DEFENSE_IDS = new Set([
  'emplacement-hpvcannon',
  'emplacement-hvyatrocket',
  'emplacement-plasmacannon',
  'emplacement-prislas',
  'emplacement-heavylaser',
  'emplacement-rail2',
  'emplacement-rail3'
]);

const UNAVAILABLE_STRUCTURE_IDS = new Set([
  'a0ademolishstructure',
  'a0bababunker',
  'a0babacornerwall',
  'a0babafactory',
  'a0babaflametower',
  'a0babaguntower',
  'a0babaguntowerend',
  'a0babahorizontalwall',
  'a0babamortarpit',
  'a0babapowergenerator',
  'a0babarocketpit',
  'a0babarocketpitat',
  'a0babavtolfactory',
  'a0babavtolpad',
  'a0cannontower',
  'a0commandcentreco',
  'a0commandcentrene',
  'a0commandcentrenp',
  'bbaatow',
  'co-tower-hvatrkt',
  'co-tower-hvcan',
  'co-tower-hvflame',
  'co-tower-ltatrkt',
  'co-tower-mdcan',
  'co-tower-mg3',
  'co-tower-rotmg',
  'co-walltower-hvcan',
  'co-walltower-rotcan',
  'collectivecwall',
  'collectivewall',
  'coolingtower',
  'ecm1pylonmk1',
  'guardtower-rotmg',
  'guardtower2',
  'guardtower3',
  'guardtower4',
  'lookouttower',
  'nexuscwall',
  'nexuswall',
  'nuclearreactor',
  'nx-anti-satsite',
  'nx-cruisesite',
  'nx-emp-medartmiss-pit',
  'nx-emp-multiartmiss-pit',
  'nx-emp-plasma-pit',
  'nx-tower-atmiss',
  'nx-tower-pulselas',
  'nx-tower-rail1',
  'nx-walltower-beamlas',
  'nx-walltower-rail2',
  'nx-walltower-rail3',
  'pillbox-cannon6',
  'pillbox-rotmg',
  'pillbox1',
  'pillbox4',
  'pillbox5',
  'plasmite-flamer-bunker',
  'scavrepaircentre',
  'sys-nexuslinktow',
  'sys-nx-cbtower',
  'sys-nx-sensortower',
  'sys-nx-vtol-cb-tow',
  'sys-nx-vtol-radtow',
  'tanktrapc',
  'tower-projector',
  'tower-rotmg',
  'tower-vulcancan',
  'uplinkcentre',
  'walltower-projector',
  'walltower05',
  'wreckedtransporter'
]);


async function loadStructureDefs() {
  try {
    const url = (typeof window !== 'undefined' && window.STRUCTURES_JSON) ? window.STRUCTURES_JSON : 'structure.json';
    const resp = await fetch(url, { cache: 'no-cache' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    STRUCTURE_DEFS = Object.values(data)
      .map(entry => {
        if (entry.feature) return { ...entry };
        const pies = [];
        // Some structures list multiple model files representing
        // upgrade stages (e.g. factory modules). The first model is
        // the base building and subsequent entries include the whole
        // structure again with added modules. Previously we appended
        // every model which resulted in several complete buildings
        // being stacked vertically. Instead, ignore files that look
        // like module pieces and keep only the initial non‑module
        // model so we render the base structure without upgrades.
        const models = Array.isArray(entry.structureModel)
          ? entry.structureModel
          : (entry.structureModel ? [entry.structureModel] : []);
        const nonModules = models.filter(m => !/module/i.test(m));
        const turretPieces = nonModules
          .slice(1)
          .filter(m => /^tr/i.test(m));
        const moduleStageModels = nonModules.filter(m => !/^tr/i.test(m));
        if (nonModules.length) {
          // Include the optional floor/base model first so the structure
          // sits on top of it, then add the main building geometry.
          if (entry.baseModel) {
            pies.push(entry.baseModel);
          }
          pies.push(moduleStageModels[0] || nonModules[0]);

          // Some defensive structures, such as guard towers, list an
          // additional piece after the main building for the weapon mount
          // (e.g. "trl" turret boxes). Previously we discarded these,
          // which caused weapons to float above the tower. Append any
          // subsequent non-module models that look like turret pieces so
          // the weapon sits on the intended extra box.
          pies.push(...turretPieces);
        } else if (entry.baseModel) {
          pies.push(entry.baseModel);
        }

        const isWallVariantType = entry.type === 'WALL' || entry.type === 'GATE';
        const preserveModelOrigin = isWallVariantType || entry.type === 'CORNER WALL';

        return {
          id: entry.id,
          name: entry.name,
          sizeX: entry.width,
          sizeY: entry.breadth,
          pies,
          baseModel: entry.baseModel || null,
          moduleStageModels: !isWallVariantType && moduleStageModels.length > 1 ? moduleStageModels : [],
          wallModels: isWallVariantType && moduleStageModels.length > 1 ? moduleStageModels : [],
          turretPieces,
          alignPiesByOrigin: !!entry.baseModel,
          preserveModelOrigin,
          type: entry.type || '',
          strength: entry.strength || '',
          combinesWithWall: !!entry.combinesWithWall,
          ecmID: entry.ecmID || '',
          sensorID: entry.sensorID
        };
      });
    if (!STRUCTURE_DEFS.some(def => isOilSpotDef(def))) {
      STRUCTURE_DEFS.push({ ...OIL_SPOT_DEF });
    }
    populateStructureSelect();
  } catch (err) {
    console.error('Failed to load structure definitions:', err);
  }
}

function categorizeStructure(def) {
  if (def.feature) {
    return 'Resources';
  }

  if (isOilDerrickDef(def)) {
    return 'Resources';
  }

  const id = def.id.toLowerCase();
  const name = def.name.toLowerCase();
  const type = (def.type || '').toLowerCase();
  const strength = (def.strength || '').toLowerCase();

  if (ALLOWED_BUNKER_IDS.has(id)) {
    return 'Bunkers';
  }

  if (
    UNAVAILABLE_STRUCTURE_IDS.has(id) ||
    name.includes('scavenger') ||
    id.startsWith('nx-') ||
    id.startsWith('co-') ||
    name.includes('*') ||
    type === 'demolish'
  ) {
    return 'Unavailable buildings';
  }

  if (BASE_STRUCTURE_IDS.has(id)) {
    return 'Base buildings';
  }

  if (SENSOR_STRUCTURE_IDS.has(id)) {
    return 'Sensors';
  }

  if (WALL_STRUCTURE_IDS.has(id)) {
    return 'Walls';
  }

  if (type === 'fortress') {
    return 'Fortresses';
  }

  if (ALLOWED_OTHER_DEFENSE_IDS.has(id)) {
    return 'Other defenses';
  }

  if (type !== 'defense') {
    return 'Unavailable buildings';
  }

  if (def.combinesWithWall) {
    return 'Hardpoints';
  }

  if (name.includes('bunker')) {
    return 'Bunkers';
  }

  if (
    name.includes('aa') ||
    name.includes('sam') ||
    name.includes('stormbringer') ||
    name.includes('vindicator')
  ) {
    return 'Anti-Air batteries';
  }

  if (
    name.includes('battery') ||
    name.includes('pit') ||
    name.includes('emplacement')
  ) {
    return 'Artillery emplacements';
  }

  if (id.includes('tower') || name.includes('tower')) {
    return 'Towers';
  }

  return 'Other defenses';
}

function populateStructureSelect() {
  const structureSelect = document.getElementById('structureSelect');
  if (!structureSelect) return;
  while (structureSelect.firstChild) {
    structureSelect.removeChild(structureSelect.firstChild);
  }
  const filterSelect = document.getElementById('structureFilter');
  const filter = filterSelect ? filterSelect.value : 'All types';
  const search = getSearchText('structureSearch');
  const groups = Object.fromEntries(STRUCTURE_CATEGORY_NAMES.map(c => [c, []]));
  STRUCTURE_DEFS.forEach((def, idx) => {
    const idLower = def.id.toLowerCase();
    const nameLower = def.name.toLowerCase();
    if (!matchesSearch([def.name, def.id, def.type, def.stat, def.category], search)) return;
    const isTower = idLower.includes('tower') || nameLower.includes('tower');
    if (
      isTower &&
      !ALLOWED_TOWER_IDS.has(idLower) &&
      !ALLOWED_BUNKER_IDS.has(idLower) &&
      !ALLOWED_HARDPOINT_IDS.has(idLower) &&
      !ALLOWED_FORTRESS_IDS.has(idLower) &&
      !ALLOWED_ARTILLERY_IDS.has(idLower) &&
      !ALLOWED_ANTI_AIR_IDS.has(idLower) &&
      !ALLOWED_OTHER_DEFENSE_IDS.has(idLower) &&
      !UNAVAILABLE_STRUCTURE_IDS.has(idLower)
    ) return;
    const cat = categorizeStructure(def);
    if (cat === 'Bunkers' && !ALLOWED_BUNKER_IDS.has(idLower)) return;
    if (cat === 'Hardpoints' && !ALLOWED_HARDPOINT_IDS.has(idLower)) return;
    if (cat === 'Fortresses' && !ALLOWED_FORTRESS_IDS.has(idLower)) return;
    if (cat === 'Artillery emplacements' && !ALLOWED_ARTILLERY_IDS.has(idLower)) return;
    if (cat === 'Anti-Air batteries' && !ALLOWED_ANTI_AIR_IDS.has(idLower)) return;
    if (cat === 'Other defenses' && !ALLOWED_OTHER_DEFENSE_IDS.has(idLower)) return;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push({ def, idx });
  });
  if (filter === 'All types') {
      STRUCTURE_CATEGORY_NAMES.forEach(cat => {
        const items = groups[cat];
        if (items && items.length) {
          const optgroup = document.createElement('optgroup');
          optgroup.label = cat;
          items
            .sort((a, b) => {
              if (cat === 'Sensors') {
                return (
                  SENSOR_STRUCTURE_ORDER.indexOf(a.def.id.toLowerCase()) -
                  SENSOR_STRUCTURE_ORDER.indexOf(b.def.id.toLowerCase())
                );
              }
              return a.def.name.localeCompare(b.def.name);
            })
            .forEach(({ def, idx }) => {
              const opt = document.createElement('option');
              opt.value = idx;
              opt.textContent = def.name;
              optgroup.appendChild(opt);
            });
          structureSelect.appendChild(optgroup);
        }
      });
    } else {
      const items = groups[filter] || [];
      items
        .sort((a, b) => {
          if (filter === 'Sensors') {
            return (
              SENSOR_STRUCTURE_ORDER.indexOf(a.def.id.toLowerCase()) -
              SENSOR_STRUCTURE_ORDER.indexOf(b.def.id.toLowerCase())
            );
          }
          return a.def.name.localeCompare(b.def.name);
        })
        .forEach(({ def, idx }) => {
          const opt = document.createElement('option');
          opt.value = idx;
          opt.textContent = def.name;
          structureSelect.appendChild(opt);
        });
    }
  selectedStructureIndex = -1;
  updateStructurePreview();
}

function populateStructureFilter() {
  const filterSelect = document.getElementById('structureFilter');
  if (!filterSelect) return;
  while (filterSelect.firstChild) {
    filterSelect.removeChild(filterSelect.firstChild);
  }
  const allOpt = document.createElement('option');
  allOpt.value = 'All types';
  allOpt.textContent = 'All types';
  filterSelect.appendChild(allOpt);
  STRUCTURE_CATEGORY_NAMES.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    filterSelect.appendChild(opt);
  });
  filterSelect.value = 'All types';
}
let activeTab = 'view';
window.activeTab = activeTab;
let brushSize = 1;
let heightMax = 255;
let heightInput;
let heightSlider;
let selectedHeight = 0;
let highlightMesh = null;
let previewGroup = null;
let lastMouseEvent = null;
let placementPreviewPausedByCamera = false;
let heightSelectionMode = false;
let heightViewMode = false;
let heightBrushMode = true;
let continuousBrushDown = false;
let continuousBrushLastKey = null;
let continuousBrushPainting = false;
let continuousBrushRedrawTimer = 0;
let continuousBrushRedrawPending = false;
let terrainRafRedraw = 0;
let terrainRafPending = false;
let continuousBrushPointerId = null;
let heightViewTile = null;
let heightSelectStart = null;
let heightSelectEnd = null;
let tileViewMode = false;
let tileSelectionMode = false;
let tileBrushMode = true;

function isKeyboardCameraMoving() {
  return !!(
    cameraState.keys['w'] ||
    cameraState.keys['a'] ||
    cameraState.keys['s'] ||
    cameraState.keys['d'] ||
    cameraState.keys['arrowup'] ||
    cameraState.keys['arrowdown'] ||
    cameraState.keys['arrowleft'] ||
    cameraState.keys['arrowright']
  );
}

function isBuildPlacementPreviewMode() {
  return (activeTab === 'objects' && structureMode === 'build') ||
    (activeTab === 'droids' && droidMode === 'build') ||
    (activeTab === 'features' && featureMode === 'build');
}

function releaseUiFocusForMap() {
  const active = document.activeElement;
  if (!active || active === document.body) return;
  if (active.closest?.('#editPanel, #menuBar, #uiBar')) active.blur?.();
}

let tileBrushShape = 'square';
let heightBrushShape = 'square';
let heightBrushAction = 'set';
let tileBrushSmartTiles = false;
let tileBrushRoads = false;
let tileBrushRoadFamily = 'a_roads';
let tileBrushRoadExtraRadius = 0;
let tileBrushWater = false;
let tileBrushWaterExtraRadius = 0;
let activeSmartTilePresetKey = '';
let refreshSmartTilePresetControls = () => {};
let terrainMirrorMode = 'off';
let tileSelectStart = null;
let tileSelectEnd = null;
let tileSelectionFixed = false;
let tileViewDrag = null;
const raycaster = new THREE.Raycaster();
raycaster.layers.set(0);
const mouse = new THREE.Vector2();
let highlightCachedId = null;
let highlightCachedRot = null;
let highlightCachedKey = null;
let highlightModelGroup = null;
let highlightModelKey = null;
let highlightPreviewTarget = null;
let highlightLoadingId = null;
let highlightLoadingRot = null;
let highlightLoadingKey = null;
// References to key DOM elements so helper functions can update them
let tileSelectControls;
let tileViewSelectionControls;
let tileApplyBtn;
let tileCopyBtn;
let tileTemplateBtn;
let tileViewSelectionCancelBtn;
let tileCancelBtn;
let heightViewSelectionControls;
let heightCopyBtn;
let heightTemplateBtn;
let heightViewSelectionCancelBtn;
let heightApplyBtn;
let heightCancelBtn;
let undoBtn;
let redoBtn;
const undoStack = [];
const redoStack = [];
let mapDirty = false;
const LOCAL_AUTOSAVE_ENABLED_KEY = 'warzone2100MapMaker.localAutosave.enabled';
const LOCAL_SAVE_INDEX_KEY = 'warzone2100MapMaker.localSaves.index';
const LOCAL_SAVE_KEY_PREFIX = 'warzone2100MapMaker.localSaves.';
const STRUCTURE_TEMPLATE_KEY = 'warzone2100MapMaker.structureTemplates';
const TILE_TEMPLATE_KEY = 'warzone2100MapMaker.tileTemplates';
const UI_MINIMAP_VISIBLE_KEY = 'warzone2100MapMaker.ui.minimapVisible';
const UI_COMPASS_VISIBLE_KEY = 'warzone2100MapMaker.ui.compassVisible';
const UI_BUILD_PREVIEW_VISIBLE_KEY = 'warzone2100MapMaker.ui.buildPreviewVisible';
const UI_TILE_GRID_VISIBLE_KEY = 'warzone2100MapMaker.ui.tileGridVisible';
const UI_PREVIEW_QUALITY_KEY = 'warzone2100MapMaker.ui.previewQuality';
const UI_TILE_QUALITY_KEY = 'warzone2100MapMaker.ui.tileQuality';
const UI_MAP_BRIGHTNESS_KEY = 'warzone2100MapMaker.ui.mapBrightness';
const UI_CAMERA_SPEED_KEY = 'warzone2100MapMaker.ui.cameraSpeed';
const UI_ZOOM_SPEED_KEY = 'warzone2100MapMaker.ui.zoomSpeed';
const USER_MAP_INFO_KEY = 'warzone2100MapMaker.userMapInfo';
const MAX_LOCAL_SAVES = 8;
let localAutosaveEnabled = true;
let buildPreviewVisible = true;
let tileGridVisible = false;
let previewQuality = 'normal';
let tileQuality = 'normal';
let mapBrightness = 100;
let cameraSpeedMultiplier = 1;
let zoomSpeedMultiplier = 1;
let currentLocalSaveId = null;
let localAutosaveTimer = null;

function requestTerrainRedraw() {
  if (terrainRafPending || !threeContainer) return;
  terrainRafPending = true;
  terrainRafRedraw = requestAnimationFrame(() => {
    terrainRafPending = false;
    terrainRafRedraw = 0;
    if (threeContainer) drawMap3D();
  });
}

function flushTerrainRedraw() {
  if (!terrainRafPending && !terrainRafRedraw) return;
  if (terrainRafPending) {
    terrainRafPending = false;
    cancelAnimationFrame(terrainRafRedraw);
    terrainRafRedraw = 0;
  }
  drawMap3D();
}

function refreshObjectPreviewLayer() {
  if (objectsGroup && scene && !scene.children.includes(objectsGroup)) {
    scene.add(objectsGroup);
  }
  updateMinimap();
}

function setMapDirty(dirty) {
  mapDirty = !!dirty;
}

function markMapDirty() {
  setMapDirty(true);
  scheduleLocalAutosave();
}

function markMapClean() {
  setMapDirty(false);
}

function confirmUnsavedChanges(message = 'You have unsaved map changes. Continue and lose them?') {
  return !mapDirty || window.confirm(message);
}
window.confirmUnsavedChanges = confirmUnsavedChanges;
window.isMapDirty = () => mapDirty;

function consumeUnsavedPromptSkip() {
  if (typeof window === 'undefined' || !window.__skipNextUnsavedPrompt) return false;
  window.__skipNextUnsavedPrompt = false;
  return true;
}

window.addEventListener('beforeunload', event => {
  if (!mapDirty) return;
  event.preventDefault();
  event.returnValue = '';
});

function safeLocalStorageGet(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}

function safeLocalStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn('Local autosave failed:', e);
    if (localSaveStatus) localSaveStatus.textContent = 'Local autosave failed. Browser storage may be full.';
    return false;
  }
}

function safeLocalStorageRemove(key) {
  try { window.localStorage.removeItem(key); } catch (e) {}
}

function getDefaultUserMapInfo() {
  return { author: '', license: '', source: '' };
}

function readUserMapInfo() {
  try {
    const parsed = JSON.parse(safeLocalStorageGet(USER_MAP_INFO_KEY) || '{}');
    return { ...getDefaultUserMapInfo(), ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch (e) {
    return getDefaultUserMapInfo();
  }
}

function writeUserMapInfo(info) {
  safeLocalStorageSet(USER_MAP_INFO_KEY, JSON.stringify({ ...getDefaultUserMapInfo(), ...info }));
}

function setMinimapVisible(visible, persist = true) {
  const nextVisible = !!visible;
  if (document.body) document.body.classList.toggle('minimap-hidden', !nextVisible);
  if (minimapPanel) minimapPanel.setAttribute('aria-hidden', nextVisible ? 'false' : 'true');
  if (minimapVisibilityToggle) minimapVisibilityToggle.checked = nextVisible;
  if (persist) safeLocalStorageSet(UI_MINIMAP_VISIBLE_KEY, nextVisible ? '1' : '0');
  if (nextVisible) updateMinimap();
}

function setCompassVisible(visible, persist = true) {
  const nextVisible = !!visible;
  if (document.body) document.body.classList.toggle('compass-hidden', !nextVisible);
  if (compass) compass.setAttribute('aria-hidden', nextVisible ? 'false' : 'true');
  if (compassVisibilityToggle) compassVisibilityToggle.checked = nextVisible;
  if (persist) safeLocalStorageSet(UI_COMPASS_VISIBLE_KEY, nextVisible ? '1' : '0');
}

function setBuildPreviewVisible(visible, persist = true) {
  buildPreviewVisible = !!visible;
  if (buildPreviewVisibilityToggle) buildPreviewVisibilityToggle.checked = buildPreviewVisible;
  if (persist) safeLocalStorageSet(UI_BUILD_PREVIEW_VISIBLE_KEY, buildPreviewVisible ? '1' : '0');
  if (!buildPreviewVisible) clearStructurePlacementPreview();
  else if (lastMouseEvent) updateHighlight(lastMouseEvent);
}

function setTileGridVisible(visible, persist = true) {
  tileGridVisible = !!visible;
  if (tileGridVisibilityToggle) tileGridVisibilityToggle.checked = tileGridVisible;
  if (persist) safeLocalStorageSet(UI_TILE_GRID_VISIBLE_KEY, tileGridVisible ? '1' : '0');
  refreshTileGrid();
}

function getPreviewQualityPixelRatio() {
  if (previewQuality === 'low') return 0.75;
  if (previewQuality === 'high') return Math.min(window.devicePixelRatio || 1, 2);
  return 1;
}

function applyPreviewQuality() {
  if (!renderer || !threeContainer) return;
  renderer.setPixelRatio(getPreviewQualityPixelRatio());
  renderer.setSize(threeContainer.offsetWidth, threeContainer.offsetHeight);
}

function setPreviewQuality(value, persist = true) {
  previewQuality = ['low', 'normal', 'high'].includes(value) ? value : 'normal';
  if (previewQualitySelect) previewQualitySelect.value = previewQuality;
  if (persist) safeLocalStorageSet(UI_PREVIEW_QUALITY_KEY, previewQuality);
  applyPreviewQuality();
}

const TERRAIN_TILE_QUALITY = {
  low: { size: 32, smoothing: true, magFilter: THREE.NearestFilter, minFilter: THREE.LinearMipMapLinearFilter, anisotropy: 1 },
  normal: { size: 64, smoothing: true, magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipMapLinearFilter, anisotropy: 2 },
  high: { size: 128, smoothing: false, magFilter: THREE.NearestFilter, minFilter: THREE.LinearMipMapLinearFilter, anisotropy: 4 }
};

function getTerrainTileQualityConfig() {
  return TERRAIN_TILE_QUALITY[tileQuality] || TERRAIN_TILE_QUALITY.normal;
}

function setTileQuality(value, persist = true) {
  tileQuality = TERRAIN_TILE_QUALITY[value] ? value : 'normal';
  if (tileQualitySelect) tileQualitySelect.value = tileQuality;
  if (persist) safeLocalStorageSet(UI_TILE_QUALITY_KEY, tileQuality);
  if (persist) requestTerrainRedraw();
}

function clampMapBrightness(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(50, Math.min(parsed, 150)) : 100;
}

function applyMapBrightness() {
  if (!renderer?.domElement) return;
  renderer.domElement.style.filter = mapBrightness === 100 ? '' : 'brightness(' + mapBrightness + '%)';
}

function setMapBrightness(value, persist = true) {
  mapBrightness = clampMapBrightness(value);
  const textValue = String(mapBrightness);
  if (mapBrightnessInput) mapBrightnessInput.value = textValue;
  if (mapBrightnessSlider) mapBrightnessSlider.value = textValue;
  if (persist) safeLocalStorageSet(UI_MAP_BRIGHTNESS_KEY, textValue);
  applyMapBrightness();
}

function clampCameraSetting(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0.25, Math.min(parsed, 3)) : 1;
}

function setCameraSpeedMultiplier(value, persist = true) {
  cameraSpeedMultiplier = clampCameraSetting(value);
  const textValue = String(cameraSpeedMultiplier);
  if (cameraSpeedInput) cameraSpeedInput.value = textValue;
  if (cameraSpeedSlider) cameraSpeedSlider.value = textValue;
  if (persist) safeLocalStorageSet(UI_CAMERA_SPEED_KEY, textValue);
}

function setZoomSpeedMultiplier(value, persist = true) {
  zoomSpeedMultiplier = clampCameraSetting(value);
  const textValue = String(zoomSpeedMultiplier);
  if (zoomSpeedInput) zoomSpeedInput.value = textValue;
  if (zoomSpeedSlider) zoomSpeedSlider.value = textValue;
  if (persist) safeLocalStorageSet(UI_ZOOM_SPEED_KEY, textValue);
}

function resetSettingsToDefaults() {
  const rightClickActionSelect = document.getElementById('rightClickActionSelect');
  rightClickAction = 'camera';
  if (rightClickActionSelect) rightClickActionSelect.value = rightClickAction;
  setMinimapVisible(true);
  setCompassVisible(true);
  setLocalAutosaveEnabled(true);
  setBuildPreviewVisible(true);
  setTileGridVisible(false);
  setPreviewQuality('normal');
  setTileQuality('normal');
  setMapBrightness(100);
  setCameraSpeedMultiplier(1);
  setZoomSpeedMultiplier(1);
  setFileStatus('Settings reset to defaults.');
}

function initOverlayVisibilitySettings() {
  setMinimapVisible(safeLocalStorageGet(UI_MINIMAP_VISIBLE_KEY) !== '0', false);
  setCompassVisible(safeLocalStorageGet(UI_COMPASS_VISIBLE_KEY) !== '0', false);
  setBuildPreviewVisible(safeLocalStorageGet(UI_BUILD_PREVIEW_VISIBLE_KEY) !== '0', false);
  setTileGridVisible(safeLocalStorageGet(UI_TILE_GRID_VISIBLE_KEY) === '1', false);
  setPreviewQuality(safeLocalStorageGet(UI_PREVIEW_QUALITY_KEY) || 'normal', false);
  setTileQuality(safeLocalStorageGet(UI_TILE_QUALITY_KEY) || 'normal', false);
  setMapBrightness(safeLocalStorageGet(UI_MAP_BRIGHTNESS_KEY) || 100, false);
  setCameraSpeedMultiplier(safeLocalStorageGet(UI_CAMERA_SPEED_KEY) || 1, false);
  setZoomSpeedMultiplier(safeLocalStorageGet(UI_ZOOM_SPEED_KEY) || 1, false);
  if (minimapVisibilityToggle) {
    minimapVisibilityToggle.addEventListener('change', () => setMinimapVisible(minimapVisibilityToggle.checked));
  }
  if (compassVisibilityToggle) {
    compassVisibilityToggle.addEventListener('change', () => setCompassVisible(compassVisibilityToggle.checked));
  }
  if (buildPreviewVisibilityToggle) {
    buildPreviewVisibilityToggle.addEventListener('change', () => setBuildPreviewVisible(buildPreviewVisibilityToggle.checked));
  }
  if (tileGridVisibilityToggle) {
    tileGridVisibilityToggle.addEventListener('change', () => setTileGridVisible(tileGridVisibilityToggle.checked));
  }
  if (previewQualitySelect) {
    previewQualitySelect.addEventListener('change', () => setPreviewQuality(previewQualitySelect.value));
  }
  if (tileQualitySelect) {
    tileQualitySelect.addEventListener('change', () => setTileQuality(tileQualitySelect.value));
  }
  if (mapBrightnessInput) {
    mapBrightnessInput.addEventListener('input', () => setMapBrightness(mapBrightnessInput.value));
    mapBrightnessInput.addEventListener('change', () => setMapBrightness(mapBrightnessInput.value));
  }
  if (mapBrightnessSlider) {
    mapBrightnessSlider.addEventListener('input', () => setMapBrightness(mapBrightnessSlider.value));
    mapBrightnessSlider.addEventListener('change', () => setMapBrightness(mapBrightnessSlider.value));
  }
  if (cameraSpeedInput) {
    cameraSpeedInput.addEventListener('input', () => setCameraSpeedMultiplier(cameraSpeedInput.value));
    cameraSpeedInput.addEventListener('change', () => setCameraSpeedMultiplier(cameraSpeedInput.value));
  }
  if (cameraSpeedSlider) {
    cameraSpeedSlider.addEventListener('input', () => setCameraSpeedMultiplier(cameraSpeedSlider.value));
    cameraSpeedSlider.addEventListener('change', () => setCameraSpeedMultiplier(cameraSpeedSlider.value));
  }
  if (zoomSpeedInput) {
    zoomSpeedInput.addEventListener('input', () => setZoomSpeedMultiplier(zoomSpeedInput.value));
    zoomSpeedInput.addEventListener('change', () => setZoomSpeedMultiplier(zoomSpeedInput.value));
  }
  if (zoomSpeedSlider) {
    zoomSpeedSlider.addEventListener('input', () => setZoomSpeedMultiplier(zoomSpeedSlider.value));
    zoomSpeedSlider.addEventListener('change', () => setZoomSpeedMultiplier(zoomSpeedSlider.value));
  }
  [
    [settingsMapNameInput, 'name'],
    [settingsMapAuthorInput, 'author'],
    [settingsMapCreatedInput, 'created'],
    [settingsMapTypeInput, 'mapType'],
    [settingsMapDescriptionInput, 'description'],
    [settingsMapScavengersInput, 'scavengers'],
    [settingsMapSlotsInput, 'slots'],
    [settingsMapUploadedInput, 'uploaded'],
    [settingsMapVersionInput, 'version'],
    [settingsMapTagsInput, 'tags'],
    [settingsMapLicenseInput, 'license'],
    [settingsMapSourceInput, 'source']
  ].forEach(([input, key]) => {
    if (!input) return;
    input.addEventListener('input', () => setMapInfoOverrideField(key, input.value, false));
    input.addEventListener('change', () => setMapInfoOverrideField(key, input.value, false));
  });
  syncMyInfoInputs();
  [
    [settingsMyAuthorInput, 'author'],
    [settingsMyLicenseInput, 'license'],
    [settingsMySourceInput, 'source']
  ].forEach(([input, key]) => {
    if (!input) return;
    input.addEventListener('input', () => updateUserMapInfoField(key, input.value));
    input.addEventListener('change', () => updateUserMapInfoField(key, input.value));
  });
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', resetSettingsToDefaults);
  }
}

function readLocalSaveIndex() {
  try {
    const parsed = JSON.parse(safeLocalStorageGet(LOCAL_SAVE_INDEX_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => item && item.id) : [];
  } catch (e) {
    return [];
  }
}

function writeLocalSaveIndex(index) {
  safeLocalStorageSet(LOCAL_SAVE_INDEX_KEY, JSON.stringify(index));
}

function formatLocalSaveTime(value) {
  const date = new Date(value || Date.now());
  return date.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function setLocalSaveStatus(text) {
  if (localSaveStatus) localSaveStatus.textContent = text || '';
}

function fillLocalSaveSelect(select, index, selected, emptyText) {
  if (!select) return false;
  while (select.firstChild) select.removeChild(select.firstChild);
  if (!index.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = emptyText || 'No local saves';
    select.appendChild(opt);
    select.value = '';
    return false;
  }
  index.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = (item.name || 'Untitled Map') + ' - ' + formatLocalSaveTime(item.updatedAt);
    select.appendChild(opt);
  });
  select.value = index.some(item => item.id === selected) ? selected : index[0].id;
  return !!select.value;
}

function refreshOverlayLocalSaveList(index = null) {
  const saves = index || readLocalSaveIndex().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const hasSelection = fillLocalSaveSelect(overlayLocalSaveSelect, saves, overlayLocalSaveSelect ? overlayLocalSaveSelect.value : '', '');
  if (overlayLocalSaveBox) overlayLocalSaveBox.style.display = hasSelection ? 'block' : 'none';
  if (overlayLocalSaveBtn) overlayLocalSaveBtn.disabled = !hasSelection;
}
window.refreshOverlayLocalSaves = refreshOverlayLocalSaveList;

function refreshLocalSaveList() {
  const index = readLocalSaveIndex().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const hasSelection = fillLocalSaveSelect(localSaveSelect, index, localSaveSelect ? localSaveSelect.value : '', 'No local saves');
  if (localSaveLoadBtn) localSaveLoadBtn.disabled = !hasSelection;
  if (localSaveDeleteBtn) localSaveDeleteBtn.disabled = !hasSelection;
  refreshOverlayLocalSaveList(index);
}

function getLocalAutosaveEnabled() {
  return localAutosaveEnabled;
}

function setLocalAutosaveEnabled(enabled) {
  localAutosaveEnabled = !!enabled;
  safeLocalStorageSet(LOCAL_AUTOSAVE_ENABLED_KEY, localAutosaveEnabled ? '1' : '0');
  if (localAutosaveToggle) localAutosaveToggle.checked = localAutosaveEnabled;
  if (localAutosaveEnabled) scheduleLocalAutosave(100);
  else setLocalSaveStatus('Local autosave is off.');
}

function getLocalSaveEntriesFromJson(text, key) {
  try {
    const parsed = JSON.parse(text || '{}');
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed[key])) return parsed[key];
    return Object.values(parsed).filter(entry => entry && typeof entry === 'object');
  } catch (e) {
    return [];
  }
}

function makeLocalSaveSnapshot() {
  const name = getCurrentMapFilename();
  return {
    version: 1,
    name,
    savedAt: Date.now(),
    tilesetIndex,
    mapW,
    mapH,
    mapTiles,
    mapRotations,
    mapHeights,
    mapXFlip,
    mapYFlip,
    mapTriFlip,
    tileTypesById: Array.isArray(tileTypesById) ? tileTypesById.slice() : [],
    structureStyle: currentStructJsonStyle || 'array',
    mapInfo: { ...currentMapInfoOverrides },
    structures: getLocalSaveEntriesFromJson(buildStructJson(), 'structures'),
    features: getLocalSaveEntriesFromJson(buildFeatureJson(), 'features'),
    droids: getLocalSaveEntriesFromJson(buildDroidJson(), 'droids')
  };
}

function makeLocalSaveId() {
  return 'save-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function pruneLocalSaves(index) {
  const sorted = index.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const keep = sorted.slice(0, MAX_LOCAL_SAVES);
  sorted.slice(MAX_LOCAL_SAVES).forEach(item => safeLocalStorageRemove(LOCAL_SAVE_KEY_PREFIX + item.id));
  return keep;
}

function saveLocalAutosaveNow() {
  if (!getLocalAutosaveEnabled()) return;
  if (!mapDirty) return;
  const id = currentLocalSaveId || makeLocalSaveId();
  const snapshot = makeLocalSaveSnapshot();
  snapshot.id = id;
  currentLocalSaveId = id;
  const payload = JSON.stringify(snapshot);
  if (!safeLocalStorageSet(LOCAL_SAVE_KEY_PREFIX + id, payload)) return;
  const index = readLocalSaveIndex().filter(item => item.id !== id);
  index.unshift({
    id,
    name: snapshot.name || 'Untitled Map',
    updatedAt: snapshot.savedAt,
    mapW: snapshot.mapW,
    mapH: snapshot.mapH
  });
  writeLocalSaveIndex(pruneLocalSaves(index));
  refreshLocalSaveList();
  setLocalSaveStatus('Autosaved locally ' + formatLocalSaveTime(snapshot.savedAt) + '.');
}

function scheduleLocalAutosave(delay = 1200) {
  if (!getLocalAutosaveEnabled() || !mapDirty) return;
  if (localAutosaveTimer) clearTimeout(localAutosaveTimer);
  localAutosaveTimer = setTimeout(() => {
    localAutosaveTimer = null;
    saveLocalAutosaveNow();
  }, delay);
}

function readLocalSaveSnapshot(id) {
  try {
    return JSON.parse(safeLocalStorageGet(LOCAL_SAVE_KEY_PREFIX + id) || 'null');
  } catch (e) {
    return null;
  }
}

function updateUndoRedoButtons() {
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

function pushUndo(action) {
  undoStack.push(action);
  redoStack.length = 0;
  markMapDirty();
  updateUndoRedoButtons();
}

function updateHeightUI(maxVal) {
  heightMax = maxVal;
  if (heightInput) {
    heightInput.max = maxVal;
    if (parseInt(heightInput.value, 10) > maxVal) {
      heightInput.value = maxVal;
      selectedHeight = maxVal;
    }
  }
  if (heightSlider) {
    heightSlider.max = maxVal;
    if (parseInt(heightSlider.value, 10) > maxVal) {
      heightSlider.value = maxVal;
    }
  }
  const presets = document.querySelectorAll('.height-preset');
  if (presets.length >= 5) {
    const step = Math.round(maxVal / 4);
    const values = [0, step, step * 2, step * 3, maxVal];
    presets.forEach((btn, idx) => {
      const v = values[idx];
      btn.textContent = v;
      btn.setAttribute('data-val', v);
    });
  }
}

function setMapState(w, h, tiles, rotations, heights, xflip = [], yflip = [], triflip = []) {
  mapW = w;
  mapH = h;
  mapTiles = tiles;
  mapRotations = rotations;
  mapHeights = heights;
  mapXFlip = xflip.length ? xflip : Array(h).fill().map(() => Array(w).fill(false));
  mapYFlip = yflip.length ? yflip : Array(h).fill().map(() => Array(w).fill(false));
  mapTriFlip = triflip.length ? triflip : Array(h).fill().map(() => Array(w).fill(false));

  const sizeXInput = document.getElementById('sizeXInput');
  const sizeYInput = document.getElementById('sizeYInput');
  const sizeXSlider = document.getElementById('sizeXSlider');
  const sizeYSlider = document.getElementById('sizeYSlider');
  if (sizeXInput) sizeXInput.value = w;
  if (sizeYInput) sizeYInput.value = h;
  if (sizeXSlider) sizeXSlider.value = w;
  if (sizeYSlider) sizeYSlider.value = h;
  const applySizeBtn = document.getElementById('applySizeBtn');
  if (applySizeBtn) applySizeBtn.disabled = true;

  resetCameraTarget(mapW, mapH, threeContainer);
  drawMap3D();

  if (highlightMesh) {
    scene.remove(highlightMesh);
    highlightMesh = null;
  }
  if (previewGroup) {
    previewGroup.traverse(child => {
      if (child.isMesh) {
        if (child.material && child.material.map) child.material.map.dispose();
        if (child.material) child.material.dispose();
        if (child.geometry) child.geometry.dispose();
      }
    });
    scene.remove(previewGroup);
    previewGroup = null;
  }
}

function applyAction(action, mode) {
  if (!action) return;
  if (action.type === 'tiles') {
    for (const c of action.changes) {
      const tile = mode === 'undo' ? c.oldTile : c.newTile;
      const rot = mode === 'undo' ? c.oldRot : c.newRot;
      mapTiles[c.y][c.x] = tile;
      mapRotations[c.y][c.x] = rot;
      if ('oldXFlip' in c || 'newXFlip' in c) mapXFlip[c.y][c.x] = !!(mode === 'undo' ? c.oldXFlip : c.newXFlip);
      if ('oldYFlip' in c || 'newYFlip' in c) mapYFlip[c.y][c.x] = !!(mode === 'undo' ? c.oldYFlip : c.newYFlip);
      if ('oldTriFlip' in c || 'newTriFlip' in c) mapTriFlip[c.y][c.x] = !!(mode === 'undo' ? c.oldTriFlip : c.newTriFlip);
    }
    requestTerrainRedraw();
  } else if (action.type === 'height') {
    for (const c of action.changes) {
      const h = mode === 'undo' ? c.oldHeight : c.newHeight;
      mapHeights[c.y][c.x] = h;
    }
    requestTerrainRedraw();
  } else if (action.type === 'resize') {
    const state = mode === 'undo' ? action.oldState : action.newState;
    setMapState(state.w, state.h, state.tiles, state.rotations, state.heights, state.xflip, state.yflip, state.triflip);
  } else if (action.type === 'structure') {
    if (mode === 'undo') {
      removeStructureGroup(action.group);
    } else {
      addStructureGroup(action.group);
    }
  } else if (action.type === 'structure-wall-batch') {
    const replacements = Array.isArray(action.replacements) ? action.replacements : [];
    if (mode === 'undo') {
      removeStructureGroup(action.group);
      replacements.slice().reverse().forEach(item => replaceStructureGroup(item.newGroup, item.oldGroup));
    } else {
      addStructureGroup(action.group);
      replacements.forEach(item => replaceStructureGroup(item.oldGroup, item.newGroup));
    }
  } else if (action.type === 'structure-replace') {
    if (mode === 'undo') replaceStructureGroup(action.newGroup, action.oldGroup);
    else replaceStructureGroup(action.oldGroup, action.newGroup);
  } else if (action.type === 'structure-delete') {
    if (mode === 'undo') {
      addStructureGroup(action.group);
    } else {
      removeStructureGroup(action.group);
    }
  } else if (action.type === 'structure-delete-wall-batch') {
    const replacements = Array.isArray(action.replacements) ? action.replacements : [];
    if (mode === 'undo') {
      addStructureGroup(action.group);
      replacements.slice().reverse().forEach(item => replaceStructureGroup(item.newGroup, item.oldGroup));
    } else {
      removeStructureGroup(action.group);
      replacements.forEach(item => replaceStructureGroup(item.oldGroup, item.newGroup));
    }
  } else if (action.type === 'object-batch') {
    const groups = Array.isArray(action.groups) ? action.groups : [];
    if (mode === 'undo') {
      groups.forEach(group => {
        if (group.userData?.droidExport) removeDroidGroup(group);
        else removeStructureGroup(group);
      });
    } else {
      groups.forEach(group => {
        if (group.userData?.droidExport) addDroidGroup(group);
        else addStructureGroup(group);
      });
    }
  } else if (action.type === 'object-batch-delete') {
    const groups = Array.isArray(action.groups) ? action.groups : [];
    if (mode === 'undo') {
      groups.forEach(group => {
        if (group.userData?.droidExport) addDroidGroup(group);
        else addStructureGroup(group);
      });
    } else {
      groups.forEach(group => {
        if (group.userData?.droidExport) removeDroidGroup(group);
        else removeStructureGroup(group);
      });
    }
  } else if (action.type === 'droid') {
    if (mode === 'undo') {
      removeDroidGroup(action.group);
    } else {
      addDroidGroup(action.group);
    }
  } else if (action.type === 'droid-delete') {
    if (mode === 'undo') {
      addDroidGroup(action.group);
    } else {
      removeDroidGroup(action.group);
    }
  }
}

function undo() {
  const action = undoStack.pop();
  if (!action) return;
  applyAction(action, 'undo');
  redoStack.push(action);
  markMapDirty();
  updateUndoRedoButtons();
}

function redo() {
  const action = redoStack.pop();
  if (!action) return;
  applyAction(action, 'redo');
  undoStack.push(action);
  markMapDirty();
  updateUndoRedoButtons();
}

  function updateTileApplyBtn() {
    if (!tileApplyBtn && !tileCopyBtn && !tileTemplateBtn && !tileCancelBtn && !tileViewSelectionCancelBtn) return;
    const hasSelection = hasFinishedTileSelection();
    if (tileSelectControls) {
      tileSelectControls.style.display = tileSelectionMode ? 'grid' : 'none';
    }
    if (tileViewSelectionControls) {
      tileViewSelectionControls.style.display = tileViewMode && hasSelection ? 'grid' : 'none';
    }
    if (!tileSelectionMode) {
      if (tileApplyBtn) {
        tileApplyBtn.disabled = true;
        tileApplyBtn.classList.remove('ready');
      }
      if (tileCancelBtn) tileCancelBtn.disabled = true;
    } else {
      if (tileApplyBtn) {
        tileApplyBtn.disabled = !hasSelection;
        tileApplyBtn.classList.toggle('ready', !!hasSelection);
      }
      if (tileCancelBtn) tileCancelBtn.disabled = !hasSelection;
    }
    if (tileCopyBtn) {
      tileCopyBtn.disabled = !(tileViewMode && hasSelection);
      const copied = tileTemplatePasteArmed && copiedTileTemplate?.kind === 'tile-selection';
      tileCopyBtn.textContent = copied ? 'Copied' : 'Copy area';
      tileCopyBtn.classList.toggle('active', copied);
    }
    if (tileTemplateBtn) tileTemplateBtn.disabled = !(tileViewMode && hasSelection);
    if (tileViewSelectionCancelBtn) tileViewSelectionCancelBtn.disabled = !(tileViewMode && hasSelection);
  }

  function updateHeightApplyBtn() {
    if (!heightApplyBtn) return;
    const hasViewSelection = heightViewMode && !!getHeightSelectionBounds();
    if (heightViewSelectionControls) {
      heightViewSelectionControls.style.display = hasViewSelection ? 'grid' : 'none';
    }
    if (heightCopyBtn) {
      heightCopyBtn.disabled = !hasViewSelection;
      const copied = tileTemplatePasteArmed && copiedTileTemplate?.kind === 'height-selection';
      heightCopyBtn.textContent = copied ? 'Copied' : 'Copy area';
      heightCopyBtn.classList.toggle('active', copied);
    }
    if (heightTemplateBtn) heightTemplateBtn.disabled = !hasViewSelection;
    if (heightViewSelectionCancelBtn) heightViewSelectionCancelBtn.disabled = !hasViewSelection;
    if (heightSelectControls) {
      heightSelectControls.style.display = heightSelectionMode ? 'flex' : 'none';
    }
    if (!heightSelectionMode) {
      heightApplyBtn.disabled = true;
      heightApplyBtn.classList.remove('ready');
      if (heightCancelBtn) heightCancelBtn.disabled = true;
    } else {
      heightApplyBtn.disabled = false;
      const hasSelection = heightSelectStart && heightSelectEnd;
      heightApplyBtn.classList.toggle('ready', !!hasSelection);
      if (heightCancelBtn) heightCancelBtn.disabled = !hasSelection;
    }
  }

function setFileStatus(text) {
  const status = document.getElementById('fileStatus');
  if (status) status.textContent = text || '';
}

function escapeInfoHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

function getLoadedMapDisplayName(fileName, mapPath = '') {
  const archiveName = String(fileName || '')
    .split(/[\\/]/)
    .pop()
    .replace(/\.(wz|zip|7z)$/i, '');
  const parts = String(mapPath || '').replace(/\\/g, '/').split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  if (last.toLowerCase() === 'game.map' && parts.length > 1) {
    return parts[parts.length - 2];
  }
  if (last && last.toLowerCase() !== 'game.map') {
    return last.replace(/\.[^.]+$/, '');
  }
  return archiveName || last || 'untitled-map';
}

function setLoadedMapInfo(displayName) {
  infoDiv.innerHTML = '<b>Map:</b> <span style="color:yellow">' + escapeInfoHtml(displayName) + '</span><br>Tileset: ' + escapeInfoHtml(TILESETS[tilesetIndex].name) + '<br>Size: ' + mapW + 'x' + mapH;
}

function setCurrentMapName(name) {
  const cleanName = String(name || '').trim();
  if (mapFilenameSpan) mapFilenameSpan.textContent = cleanName;
  if (fileMapNameInput) fileMapNameInput.value = cleanName;
  if (typeof window !== 'undefined' && window.UI && typeof window.UI.setMapFilename === 'function') {
    window.UI.setMapFilename(cleanName);
  }
}

function hideCurrentMapNameBar() {
  if (mapFilenameSpan) mapFilenameSpan.textContent = '';
  if (typeof window !== 'undefined' && window.UI && typeof window.UI.showTopBar === 'function') {
    window.UI.showTopBar(false);
  }
}

function getCurrentMapFilename() {
  const inputName = fileMapNameInput && fileMapNameInput.value ? fileMapNameInput.value : '';
  const raw = (inputName || (mapFilenameSpan && mapFilenameSpan.textContent) || 'untitled-map').trim();
  return raw || 'untitled-map';
}

let currentMapArchive = null;
let currentMapArchivePath = null;
let currentMapExportInfo = null;
let currentStructArchivePath = null;
let currentStructJsonStyle = 'array';
let currentDroidArchivePath = null;
let currentFeatureArchivePath = null;
let currentTileTypesArchivePath = null;
let currentGamArchivePath = null;
let currentLevelArchivePath = null;
let currentDroidEntries = [];
let currentFeatureEntries = [];
let currentGamJson = null;
let currentLevelJson = null;
let currentServerMapMetadata = null;
let currentServerMapSourceName = '';
let currentMapInfoOverrides = {
  name: '',
  author: '',
  created: '',
  mapType: '',
  description: '',
  scavengers: '',
  slots: '',
  uploaded: '',
  version: '',
  tags: '',
  license: '',
  source: ''
};

function getSafeMapBase() {
  const base = getCurrentMapFilename()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'untitled-map';
  return base;
}

function makeSaveFilename() {
  const base = getSafeMapBase();
  return base + '.wz';
}

function getMetadataText(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const joined = value.map(item => String(item || '').trim()).filter(Boolean).join(', ');
      if (joined) return joined;
    } else {
      const text = String(value || '').trim();
      if (text) return text;
    }
  }
  return '';
}

function getDefaultMapInfoOverrides() {
  return {
    name: '',
    author: '',
    created: '',
    mapType: '',
    description: '',
    scavengers: '',
    slots: '',
    uploaded: '',
    version: '',
    tags: '',
    license: '',
    source: ''
  };
}

function setMapInfoOverrideField(key, value, updateInputs = true) {
  if (!Object.prototype.hasOwnProperty.call(currentMapInfoOverrides, key)) return;
  currentMapInfoOverrides[key] = String(value || '').trim();
  if (updateInputs) updateMapInfoInputs();
  if (key === 'name' && currentMapInfoOverrides.name) setCurrentMapName(currentMapInfoOverrides.name);
  markMapDirty();
}

function ensureLicenseOption(select, license) {
  if (!select || !license) return;
  if (Array.from(select.options).some(option => option.value === license)) return;
  const option = document.createElement('option');
  option.value = license;
  option.textContent = license;
  select.appendChild(option);
}

function syncMyInfoInputs(info = readUserMapInfo()) {
  if (settingsMyAuthorInput) settingsMyAuthorInput.value = info.author || '';
  if (settingsMyLicenseInput) {
    ensureLicenseOption(settingsMyLicenseInput, info.license);
    settingsMyLicenseInput.value = info.license || '';
  }
  if (settingsMySourceInput) settingsMySourceInput.value = info.source || '';
}

function applyUserMapInfoToMapInfo(info = readUserMapInfo(), previous = getDefaultUserMapInfo()) {
  const shouldCopy = (key, currentValue, metadataValue) => {
    const current = String(currentValue || '').trim();
    const metadata = String(metadataValue || '').trim();
    const oldDefault = String(previous[key] || '').trim();
    return !current && !metadata || (oldDefault && current === oldDefault);
  };
  if (info.author && shouldCopy('author', currentMapInfoOverrides.author, getMetadataText(currentServerMapMetadata?.author, currentLevelJson?.author, currentLevelJson?.authors, currentLevelJson?.creator))) {
    currentMapInfoOverrides.author = info.author;
  }
  if (info.license && shouldCopy('license', currentMapInfoOverrides.license, getMetadataText(currentServerMapMetadata?.license, currentLevelJson?.license, currentLevelJson?.licence))) {
    currentMapInfoOverrides.license = info.license;
  }
  if (info.source && shouldCopy('source', currentMapInfoOverrides.source, getSaveSourceName())) {
    currentMapInfoOverrides.source = info.source;
  }
  updateMapInfoInputs();
}

function updateUserMapInfoField(key, value) {
  const previous = readUserMapInfo();
  const next = { ...previous, [key]: String(value || '').trim() };
  writeUserMapInfo(next);
  syncMyInfoInputs(next);
  applyUserMapInfoToMapInfo(next, previous);
  markMapDirty();
}

function updateMapInfoInputs() {
  if (settingsMapNameInput) settingsMapNameInput.value = getMetadataText(currentMapInfoOverrides.name, currentLevelJson?.name, currentServerMapMetadata?.name, getCurrentMapFilename());
  if (settingsMapAuthorInput) settingsMapAuthorInput.value = getMetadataText(currentMapInfoOverrides.author, currentServerMapMetadata?.author, currentLevelJson?.author, currentLevelJson?.authors, currentLevelJson?.creator);
  if (settingsMapCreatedInput) settingsMapCreatedInput.value = getMetadataText(currentMapInfoOverrides.created, currentServerMapMetadata?.created, currentLevelJson?.created).slice(0, 10);
  if (settingsMapTypeInput) settingsMapTypeInput.value = getMetadataText(currentMapInfoOverrides.mapType, currentServerMapMetadata?.type, currentLevelJson?.mapType, 'normal').toLowerCase() === 'script-generated' ? 'script-generated' : 'normal';
  if (settingsMapDescriptionInput) settingsMapDescriptionInput.value = getMetadataText(currentMapInfoOverrides.description, currentLevelJson?.description, currentLevelJson?.readme);
  if (settingsMapScavengersInput) settingsMapScavengersInput.value = getMetadataText(currentMapInfoOverrides.scavengers, currentServerMapMetadata?.scavs, currentLevelJson?.scavs);
  if (settingsMapSlotsInput) settingsMapSlotsInput.value = getMetadataText(currentMapInfoOverrides.slots, currentServerMapMetadata?.slots, currentLevelJson?.players);
  if (settingsMapUploadedInput) settingsMapUploadedInput.value = getMetadataText(currentMapInfoOverrides.uploaded, currentServerMapMetadata?.download?.uploaded, currentLevelJson?.uploaded).slice(0, 10);
  if (settingsMapVersionInput) settingsMapVersionInput.value = getMetadataText(currentMapInfoOverrides.version, currentLevelJson?.versionName, currentLevelJson?.mapVersion);
  if (settingsMapTagsInput) settingsMapTagsInput.value = getMetadataText(currentMapInfoOverrides.tags, currentLevelJson?.tags);
  if (settingsMapLicenseInput) {
    const license = getMetadataText(currentMapInfoOverrides.license, currentServerMapMetadata?.license, currentLevelJson?.license, currentLevelJson?.licence);
    ensureLicenseOption(settingsMapLicenseInput, license);
    settingsMapLicenseInput.value = license;
  }
  if (settingsMapSourceInput) settingsMapSourceInput.value = getMetadataText(currentMapInfoOverrides.source, getSaveSourceName());
}

function resetMapInfoOverrides() {
  currentMapInfoOverrides = getDefaultMapInfoOverrides();
  updateMapInfoInputs();
}

function getSaveMapName() {
  return getMetadataText(currentMapInfoOverrides.name, currentLevelJson?.name, currentServerMapMetadata?.name, getCurrentMapFilename());
}

function getSaveAuthor() {
  return getMetadataText(
    currentMapInfoOverrides.author,
    currentServerMapMetadata?.author,
    currentLevelJson?.author,
    currentLevelJson?.authors,
    currentLevelJson?.creator
  ) || 'Unknown';
}

function getSaveLicense() {
  return getMetadataText(
    currentMapInfoOverrides.license,
    currentServerMapMetadata?.license,
    currentLevelJson?.license,
    currentLevelJson?.licence
  ) || 'Unknown';
}

function getSaveSourceName() {
  if (currentMapInfoOverrides.source) return currentMapInfoOverrides.source;
  if (!currentServerMapMetadata && !currentServerMapSourceName) return '';
  return getServerMapDisplayName(currentServerMapSourceName, currentServerMapMetadata);
}

function getSaveObjectSummary() {
  const groups = objectsGroup ? objectsGroup.children : [];
  const structureGroups = groups.filter(group => group?.userData?.structureExport);
  const featureGroups = groups.filter(group => group?.userData?.featureExport);
  const oilCount = currentFeatureEntries.filter(isOilFeature).length || featureGroups.filter(group => {
    return String(group?.userData?.featureExport?.name || '').toLowerCase() === 'oilresource';
  }).length;
  return [
    'Structures ' + structureGroups.length,
    'Droids ' + currentDroidEntries.length,
    'Objects ' + featureGroups.length,
    'Oil ' + oilCount
  ].join(', ');
}

function getStructureSaveCategory(def) {
  const id = String(def?.id || '').toLowerCase();
  const name = String(def?.name || '').toLowerCase();
  const type = String(def?.type || '').toLowerCase();
  const text = id + ' ' + name + ' ' + type;
  if (id === 'a0resourceextractor' || text.includes('resource extractor') || text.includes('oil derrick')) return 'extractors';
  if (text.includes('power') || text.includes('generator')) return 'power';
  if (text.includes('vtol') && text.includes('factory')) return 'vtolFactories';
  if (text.includes('cyborg') && text.includes('factory')) return 'cyborgFactories';
  if (text.includes('factory')) return 'factories';
  if (text.includes('research')) return 'research';
  if (type.includes('defense') || text.includes('hardpoint') || text.includes('bunker') || text.includes('tower') || text.includes('wall') || text.includes('gate')) return 'defenses';
  if (text.includes('command') && (text.includes('center') || text.includes('centre'))) return 'hq';
  return 'other';
}

function getSavePlayerStats() {
  const players = new Map();
  const ensure = player => {
    const key = Math.max(0, Math.min(10, parseInt(player, 10) || 0));
    if (!players.has(key)) {
      players.set(key, {
        structures: 0,
        droids: 0,
        extractors: 0,
        power: 0,
        factories: 0,
        vtolFactories: 0,
        cyborgFactories: 0,
        research: 0,
        defenses: 0,
        hq: []
      });
    }
    return players.get(key);
  };
  if (objectsGroup) {
    objectsGroup.children.forEach(group => {
      if (!group?.userData?.structureExport) return;
      const player = getStructurePlayer(group);
      const item = ensure(player);
      item.structures++;
      const def = getStructureGroupDef(group);
      const category = getStructureSaveCategory(def);
      if (category === 'hq') {
        const footprint = getStructureFootprint(group);
        if (footprint) item.hq.push([footprint.x, footprint.y]);
      } else if (Object.prototype.hasOwnProperty.call(item, category)) {
        item[category]++;
      }
    });
  }
  currentDroidEntries.forEach(entry => {
    ensure(getObjectEntryPlayer(entry)).droids++;
  });
  return players;
}

function formatSavePlayerStats(players) {
  return Array.from(players.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([player, item]) => {
      const bits = [
        item.structures + ' structures',
        item.droids + ' droids',
        item.extractors + ' oil',
        item.power + ' power',
        item.factories + ' factories',
        item.vtolFactories + ' VTOL',
        item.cyborgFactories + ' cyborg',
        item.research + ' research',
        item.defenses + ' defenses'
      ];
      return 'Player ' + player + ': ' + bits.join(', ');
    })
    .join('\n');
}

function formatOilByPlayer(players) {
  const parts = Array.from(players.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([player, item]) => 'P' + player + ' ' + item.extractors);
  return parts.join(', ');
}

function formatHqPositions(players) {
  const parts = [];
  Array.from(players.entries()).sort((a, b) => a[0] - b[0]).forEach(([player, item]) => {
    item.hq.forEach(pos => parts.push('P' + player + ' ' + pos[0] + ',' + pos[1]));
  });
  return parts.join('; ');
}

function getSaveBalanceSummary(players) {
  const keys = ['droids', 'extractors', 'power', 'factories', 'vtolFactories', 'cyborgFactories', 'research', 'defenses'];
  const values = Array.from(players.values());
  if (!values.length) return 'Unknown';
  const details = keys.map(key => {
    const nums = values.map(item => item[key] || 0);
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return { key, min, max, eq: min === max };
  });
  const balanced = details.every(item => item.eq);
  const label = balanced ? 'Yes' : 'No';
  const compact = details.map(item => {
    const name = item.key
      .replace('vtolFactories', 'VTOL')
      .replace('cyborgFactories', 'cyborg')
      .replace('extractors', 'oil')
      .replace('factories', 'factories');
    return name + ' ' + item.min + '-' + item.max + (item.eq ? ' equal' : ' mixed');
  }).join(', ');
  return label + ' (' + compact + ')';
}

function getSavePlayerSummary() {
  return formatSavePlayerStats(getSavePlayerStats());
}

function getReadableFileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(2) + ' MB';
  if (value >= 1024) return (value / 1024).toFixed(1) + ' KB';
  return value + ' B';
}

async function getBlobSha256(blob) {
  if (!window.crypto?.subtle || !blob?.arrayBuffer) return '';
  const buffer = await blob.arrayBuffer();
  const digest = await window.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function buildSaveResultDetails(blob = null, sha256 = '', timeLabel = 'Saved') {
  const activePlayers = new Set();
  if (objectsGroup) {
    objectsGroup.children.forEach(group => {
      if (group?.userData?.structureExport) activePlayers.add(getStructurePlayer(group));
    });
  }
  currentDroidEntries.forEach(entry => activePlayers.add(getObjectEntryPlayer(entry)));
  const declaredPlayers = currentServerMapMetadata?.slots || getDeclaredPlayerCount(activePlayers);
  const playerStats = getSavePlayerStats();
  return {
    mapName: getSaveMapName(),
    author: getSaveAuthor(),
    license: getSaveLicense(),
    source: getSaveSourceName(),
    created: getMetadataText(currentMapInfoOverrides.created, currentServerMapMetadata?.created, currentLevelJson?.created),
    uploaded: getMetadataText(currentMapInfoOverrides.uploaded, currentServerMapMetadata?.download?.uploaded, currentLevelJson?.uploaded),
    version: getMetadataText(currentMapInfoOverrides.version, currentLevelJson?.versionName, currentLevelJson?.mapVersion),
    mapType: getMetadataText(currentMapInfoOverrides.mapType, currentServerMapMetadata?.type, currentLevelJson?.mapType),
    description: getMetadataText(currentMapInfoOverrides.description, currentLevelJson?.description, currentLevelJson?.readme),
    scavengers: getMetadataText(currentMapInfoOverrides.scavengers, currentServerMapMetadata?.scavs, currentLevelJson?.scavs),
    tags: getMetadataText(currentMapInfoOverrides.tags, currentLevelJson?.tags),
    tileset: TILESETS[tilesetIndex]?.name || getOfficialTilesetName(tilesetIndex),
    size: mapW + ' x ' + mapH,
    players: declaredPlayers || 'Unknown',
    objects: getSaveObjectSummary(),
    oilByPlayer: formatOilByPlayer(playerStats),
    balance: getSaveBalanceSummary(playerStats),
    hqPositions: formatHqPositions(playerStats),
    fileSize: blob ? getReadableFileSize(blob.size) : '',
    sha256,
    playerSummary: formatSavePlayerStats(playerStats),
    timeLabel,
    savedAt: new Date().toLocaleString(),
    madeWith: 'Warzone2100 MapMaker'
  };
}

function showLoadedMapInfo(file, displayName) {
  const name = displayName || file?.name || getCurrentMapFilename() || 'Map file';
  setTimeout(() => {
    showSaveResult(name, 'loaded', '', buildSaveResultDetails(file, '', 'Loaded'), 'Map loaded');
  }, 650);
}

function getCanonicalTilesetName(name) {
  const value = String(name || '').toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (!value) return '';
  if (value.includes('arizona')) return 'arizona';
  if (value.includes('urban')) return 'urban';
  if (value.includes('rock')) return 'rockies';
  return value;
}

function getOfficialTilesetName(index) {
  return getCanonicalTilesetName(TILESETS[index]?.name) || 'arizona';
}

function getTilesetIndexFromName(name) {
  const value = getCanonicalTilesetName(name);
  if (!value) return null;
  if (value.includes('urban')) return 1;
  if (value.includes('rock')) return 2;
  if (value.includes('arizona')) return 0;
  const exact = TILESETS.findIndex(item => getCanonicalTilesetName(item.name) === value);
  return exact >= 0 ? exact : null;
}

function getMapExportInfo(bytes) {
  if (!bytes || bytes.length < 16 || bytes[0] !== 0x6d || bytes[1] !== 0x61 || bytes[2] !== 0x70 || bytes[3] !== 0x20) {
    return null;
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const gamma = bytes[4] === 0x28;
  const version = gamma ? 40 : dv.getUint32(4, true);
  const width = dv.getUint32(8, true);
  const height = dv.getUint32(12, true);
  const bytesPerTile = gamma || version >= 39 ? 4 : 3;
  const gridEnd = 16 + width * height * bytesPerTile;
  return {
    gamma,
    version,
    width,
    height,
    bytesPerTile,
    header: bytes.slice(0, 16),
    tail: bytes.length > gridEnd ? bytes.slice(gridEnd) : null
  };
}

function buildTileNumber(x, y) {
  const tile = Math.max(0, Math.min(0x01ff, mapTiles[y]?.[x] || 0));
  const rot = (mapRotations[y]?.[x] || 0) & 0x03;
  const xflip = mapXFlip[y]?.[x] ? 0x8000 : 0;
  const yflip = mapYFlip[y]?.[x] ? 0x4000 : 0;
  const triflip = mapTriFlip[y]?.[x] ? 0x0800 : 0;
  return tile | (rot << 12) | xflip | yflip | triflip;
}

function getReusableMapTail(info) {
  if (!info || !info.tail || info.width !== mapW || info.height !== mapH) return null;
  return info.tail;
}

function buildClassicMapFileBytes(info = currentMapExportInfo) {
  const version = info && !info.gamma ? info.version : 10;
  const bytesPerTile = version >= 39 ? 4 : 3;
  const tail = getReusableMapTail(info);
  const out = new Uint8Array(16 + mapW * mapH * bytesPerTile + (tail ? tail.length : 0));
  out[0] = 0x6d; // m
  out[1] = 0x61; // a
  out[2] = 0x70; // p
  out[3] = 0x20; // space

  const dv = new DataView(out.buffer);
  dv.setUint32(4, version, true);
  dv.setUint32(8, mapW, true);
  dv.setUint32(12, mapH, true);

  let ofs = 16;
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const tilenum = buildTileNumber(x, y);
      dv.setUint16(ofs, tilenum, true);
      if (bytesPerTile === 4) {
        const height = Math.max(0, Math.min(1023, Math.round(mapHeights[y]?.[x] || 0)));
        dv.setUint16(ofs + 2, height > 255 ? height : height << 1, true);
      } else {
        const height = Math.max(0, Math.min(255, Math.round(mapHeights[y]?.[x] || 0)));
        dv.setUint8(ofs + 2, height);
      }
      ofs += bytesPerTile;
    }
  }
  if (tail) out.set(tail, ofs);
  return out;
}

function buildGammaMapFileBytes(info = currentMapExportInfo) {
  const tail = getReusableMapTail(info);
  const out = new Uint8Array(16 + mapW * mapH * 4 + (tail ? tail.length : 0));
  if (info && info.gamma && info.header) out.set(info.header.slice(0, 16), 0);
  out[0] = 0x6d; // m
  out[1] = 0x61; // a
  out[2] = 0x70; // p
  out[3] = 0x20; // space
  out[4] = 0x28; // Gamma map marker

  const dv = new DataView(out.buffer);
  dv.setUint32(8, mapW, true);
  dv.setUint32(12, mapH, true);

  let ofs = 16;
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const tile = Math.max(0, Math.min(0x3fff, mapTiles[y]?.[x] || 0));
      const rot = (mapRotations[y]?.[x] || 0) & 0x03;
      const gammaTile = (tile << 2) | rot;
      const height = Math.max(0, Math.min(1023, Math.round(mapHeights[y]?.[x] || 0)));
      dv.setUint16(ofs, gammaTile, true);
      dv.setUint16(ofs + 2, height > 255 ? height : height << 1, true);
      ofs += 4;
    }
  }
  if (tail) out.set(tail, ofs);
  return out;
}

function buildMapFileBytes() {
  if (currentMapExportInfo && currentMapExportInfo.gamma) {
    return buildGammaMapFileBytes(currentMapExportInfo);
  }
  if (currentMapExportInfo && !currentMapExportInfo.gamma) {
    return buildClassicMapFileBytes(currentMapExportInfo);
  }
  return buildGammaMapFileBytes(null);
}

function buildTileTypesFileBytes() {
  const defaults = DEFAULT_TILE_TYPES_BY_TILESET[Math.max(0, Math.min(DEFAULT_TILE_TYPES_BY_TILESET.length - 1, tilesetIndex | 0))] || [];
  const count = Math.max(defaults.length, tileTypesById.length, tileImages.length);
  const out = new Uint8Array(12 + count * 2);
  out[0] = 0x74; // t
  out[1] = 0x74; // t
  out[2] = 0x79; // y
  out[3] = 0x70; // p
  const dv = new DataView(out.buffer);
  dv.setUint32(4, 8, true);
  dv.setUint32(8, count, true);
  for (let i = 0; i < count; i++) {
    const value = parseInt(tileTypesById[i] ?? defaults[i] ?? 0, 10);
    dv.setUint16(12 + i * 2, Number.isFinite(value) ? value : 0, true);
  }
  return out;
}

function getTileTypesArchivePath(mapPath) {
  if (currentTileTypesArchivePath) return currentTileTypesArchivePath;
  const normalized = String(mapPath || '').replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  return slash >= 0 ? normalized.slice(0, slash + 1) + 'ttypes.ttp' : 'ttypes.ttp';
}

function buildDefaultLevelJson(base) {
  return JSON.stringify({
    name: base,
    type: 'skirmish',
    players: 4,
    tileset: getOfficialTilesetName(tilesetIndex),
    generator: 'warzone2100-mapmaker'
  }, null, 2);
}

function buildDefaultGamJson() {
  return JSON.stringify({
    version: 7,
    gameTime: 0,
    GameType: 0,
    ScrollMinX: 0,
    ScrollMinY: 0,
    ScrollMaxX: mapW,
    ScrollMaxY: mapH,
    levelName: ''
  }, null, 2);
}

async function readArchiveJson(zip, suffix) {
  const name = Object.keys(zip.files).find(fn => fn.toLowerCase().endsWith(suffix) && !zip.files[fn].dir);
  if (!name) return { name: null, data: null };
  try {
    return { name, data: JSON.parse(await zip.files[name].async('string')) };
  } catch (e) {
    return { name, data: null };
  }
}

async function loadArchiveMetadata(zip) {
  const gam = await readArchiveJson(zip, 'gam.json');
  const level = await readArchiveJson(zip, 'level.json');
  const feature = await readArchiveJson(zip, 'feature.json');
  const droid = await readArchiveJson(zip, 'droid.json');
  const ttypesName = Object.keys(zip.files).find(fn => fn.toLowerCase().endsWith('ttypes.ttp') && !zip.files[fn].dir);
  currentGamArchivePath = gam.name;
  currentLevelArchivePath = level.name;
  currentFeatureArchivePath = feature.name;
  currentDroidArchivePath = droid.name;
  currentTileTypesArchivePath = ttypesName || null;
  currentGamJson = gam.data;
  currentLevelJson = level.data;
  const features = feature.data ? (Array.isArray(feature.data) ? feature.data : Array.isArray(feature.data.features) ? feature.data.features : Object.values(feature.data)) : [];
  const droids = droid.data ? (Array.isArray(droid.data) ? droid.data : Array.isArray(droid.data.droids) ? droid.data.droids : Object.values(droid.data)) : [];
  currentFeatureEntries = features.filter(entry => entry && typeof entry === 'object');
  currentDroidEntries = droids.filter(entry => entry && typeof entry === 'object');
}

function resetLoadedMetadata() {
  currentDroidArchivePath = null;
  currentFeatureArchivePath = null;
  currentTileTypesArchivePath = null;
  currentGamArchivePath = null;
  currentLevelArchivePath = null;
  currentDroidEntries = [];
  currentFeatureEntries = [];
  currentGamJson = null;
  currentLevelJson = null;
  currentServerMapMetadata = null;
  currentServerMapSourceName = '';
  resetMapInfoOverrides();
}

function makeDroidEntry(design, player, tileX, tileY, degrees) {
  const templateName = design?.id || 'ConstructionDroid';
  const entry = {
    name: design?.name || templateName,
    body: design?.body || 'Body1REC',
    propulsion: design?.propulsion || 'wheeled01',
    startpos: Math.max(0, Math.min(10, parseInt(player, 10) || 0)),
    position: [Math.round((tileX + 0.5) * 128), Math.round((tileY + 0.5) * 128)],
    rotation: [0, degreesToWzAngle(degrees), 0],
    rotDeg: normalizeDegrees(degrees)
  };
  if (Array.isArray(design?.weapons)) entry.weapons = design.weapons.slice();
  else if (design?.weapon) entry.weapon = design.weapon;
  if (design?.construct) entry.construct = design.construct;
  if (design?.repair) entry.repair = design.repair;
  if (design?.sensor) entry.sensor = design.sensor;
  if (design?.brain) entry.brain = design.brain;
  if (design?.ecm) entry.ecm = design.ecm;
  if (templateName !== CUSTOM_DROID_TEMPLATE_ID && (!templateDefs || templateDefs[templateName])) entry.template = templateName;
  return entry;
}

function getDroidPieList(entry) {
  if (Array.isArray(entry.pies)) return entry.pies;
  if (Array.isArray(entry.models)) return entry.models;
  if (entry.pie) return [entry.pie];
  if (entry.model) return [entry.model];
  const parts = [];
  const toPath = (val, prefix = '') => {
    let name = String(val);
    if (!name.toLowerCase().endsWith('.pie')) name += '.pie';
    if (name.includes('/')) return name;
    return prefix + name;
  };
  const addRolePart = (role, val, prefix) => {
    if (!val) return;
    const addOne = v => parts.push({ role, path: toPath(v, prefix) });
    if (Array.isArray(val)) val.forEach(addOne);
    else addOne(val);
  };
  const getRightPropulsionModel = leftModel => {
    const left = String(leftModel || '');
    if (/^prmvtl/i.test(left)) return '';
    const right = left.replace(/^pr([lmh])(whl|trk|htr|vtl)/i, 'pr$1r$2');
    return right !== left ? right : '';
  };
  const addPropulsionPair = extra => {
    const leftModel = typeof extra === 'string' ? extra : extra?.left;
    if (!leftModel) return false;
    parts.push({ role: 'propulsion', path: toPath(leftModel, 'components/prop/'), side: 'left' });
    const rightModel = getRightPropulsionModel(leftModel);
    if (rightModel) parts.push({ role: 'propulsion', path: toPath(rightModel, 'components/prop/'), side: 'right' });
    const effectModel = extra?.still || extra?.moving;
    if (effectModel) {
      parts.push({
        role: 'effect',
        path: toPath(effectModel),
        effectState: extra.still ? 'still' : 'moving'
      });
    }
    return true;
  };
  const getDroidRenderType = () => {
    const template = entry.template && templateDefs && templateDefs[entry.template];
    const body = bodyDefs && bodyId ? bodyDefs[bodyId] : null;
    if (template?.type) return template.type;
    if (entry.construct) return body?.class === 'Cyborgs' ? 'CYBORG_CONSTRUCT' : 'CONSTRUCT';
    if (entry.repair) return body?.class === 'Cyborgs' ? 'CYBORG_REPAIR' : 'REPAIR';
    if (entry.sensor) return 'SENSOR';
    if (entry.ecm) return 'ECM';
    if (entry.brain) return 'COMMAND';
    return body?.droidType || 'DROID';
  };
  const addWeapon = (val, slot = 0) => {
    if (!val) return;
    const wd = weaponDefs && weaponDefs[val];
    if (wd) {
      const modelPath = wd.model && toPath(wd.model, 'components/weapons/');
      const mountPath = wd.mountModel && toPath(wd.mountModel, 'components/weapons/');
      const weaponMeta = {
        slot,
        kind: 'weapon',
        recoilValue: wd.recoilValue || 0,
        rotateSpeed: wd.rotate || 0,
        firePause: wd.firePause || 20
      };
      if (mountPath) parts.push({ role: 'mount', path: mountPath, ...weaponMeta });
      if (modelPath && modelPath !== mountPath) parts.push({ role: 'weapon', path: modelPath, ...weaponMeta });
      if (wd.muzzleGfx) parts.push({ role: 'muzzle', path: toPath(wd.muzzleGfx), ...weaponMeta });
    } else {
      parts.push({ role: 'weapon', path: toPath(val, 'components/weapons/'), slot, kind: 'weapon' });
    }
  };
  const addTurretComponent = (val, defs, kind, prefix = 'components/weapons/') => {
    if (!val) return;
    const def = defs && defs[val];
    if (!def) {
      parts.push({ role: 'weapon', path: toPath(val, prefix), slot: 0, kind });
      return;
    }
    const mountPath = def.mountModel && toPath(def.mountModel, prefix);
    const modelPath = (def.model || def.sensorModel) && toPath(def.model || def.sensorModel, prefix);
    if (mountPath) parts.push({ role: 'mount', path: mountPath, slot: 0, kind });
    if (modelPath && modelPath !== mountPath) parts.push({ role: 'weapon', path: modelPath, slot: 0, kind });
  };
  const bodyId = entry.body;
  const propId = entry.propulsion;
  const propDef = propDefs && propId ? propDefs[propId] : null;
  const renderType = getDroidRenderType();
  parts.push({ role: 'meta', propulsionType: propDef?.type, droidType: renderType });
  let hasBodySpecificPropulsion = false;
  if (bodyId) {
    const bd = bodyDefs && bodyDefs[bodyId];
    if (bd && bd.model) addRolePart('body', bd.model, 'components/bodies/');
    else addRolePart('body', bodyId, 'components/bodies/');
    if (bd && bd.propulsionExtraModels && propId) {
      const extra = bd.propulsionExtraModels[propId];
      hasBodySpecificPropulsion = addPropulsionPair(extra);
    }
  }
  if (propId && !hasBodySpecificPropulsion) {
    const pd = propDefs && propDefs[propId];
    if (pd && pd.model) addRolePart('propulsion', pd.model, 'components/prop/');
    else if (!pd) addRolePart('propulsion', propId, 'components/prop/');
  }
  const weapons = entry.weapon || entry.weapons;
  if (Array.isArray(weapons)) weapons.forEach((weapon, slot) => addWeapon(weapon, slot));
  else addWeapon(weapons);
  addTurretComponent(entry.construct, constructionDefs, 'construct');
  addTurretComponent(entry.repair, repairDefs, 'repair');
  addTurretComponent(entry.sensor, droidSensorDefs, 'sensor');
  if (entry.brain && brainDefs && brainDefs[entry.brain]?.turret) addWeapon(brainDefs[entry.brain].turret);
  else addTurretComponent(entry.brain, brainDefs, 'brain');
  addTurretComponent(entry.ecm, ecmDefs, 'ecm');
  return parts.length ? parts : null;
}

function getDroidExportEntry(group) {
  const entry = group?.userData?.droidExport;
  if (!entry) return null;
  const out = { ...entry };
  const centerX = group.position.x + (group.userData.centerX || 0);
  const centerY = group.position.z + (group.userData.centerZ || 0);
  out.position = [Math.round(centerX * 128), Math.round(centerY * 128)];
  out.rotation = [0, degreesToWzAngle(getDroidRotationDegrees(group)), 0];
  out.startpos = getDroidPlayer(group);
  delete out.rotDeg;
  return out;
}

function ensureUniqueEntryIds(entries, assignMissing = false) {
  const used = new Set();
  let nextId = 1;
  const claimNextId = () => {
    while (used.has(nextId)) nextId++;
    const id = nextId;
    used.add(id);
    nextId++;
    return id;
  };
  entries.forEach(entry => {
    if (!entry || typeof entry !== 'object') return;
    const raw = entry.id;
    const id = parseInt(raw, 10);
    if (Number.isFinite(id) && id > 0 && !used.has(id)) {
      used.add(id);
      return;
    }
    if (assignMissing || raw !== undefined) entry.id = claimNextId();
  });
}

function buildDroidJson() {
  const entries = [];
  if (objectsGroup) {
    objectsGroup.children.forEach(group => {
      const entry = getDroidExportEntry(group);
      if (entry) entries.push(entry);
    });
  }
  ensureUniqueEntryIds(entries, false);
  return JSON.stringify({ version: 2, droids: entries }, null, 2);
}

async function updateGammaMetadata(zip, base) {
  if (!zip.file('level.json')) zip.file('level.json', buildDefaultLevelJson(base));
  try {
    const level = JSON.parse(await zip.file('level.json').async('string'));
    level.name = getSaveMapName() || base;
    level.tileset = getOfficialTilesetName(tilesetIndex);
    const slots = parseInt(currentMapInfoOverrides.slots, 10);
    if (Number.isFinite(slots) && slots > 0) level.players = Math.max(1, Math.min(10, slots));
    if (currentMapInfoOverrides.mapType) level.mapType = currentMapInfoOverrides.mapType;
    if (currentMapInfoOverrides.author) level.author = currentMapInfoOverrides.author;
    if (currentMapInfoOverrides.created) level.created = currentMapInfoOverrides.created;
    if (currentMapInfoOverrides.description) level.description = currentMapInfoOverrides.description;
    if (currentMapInfoOverrides.scavengers !== '') level.scavs = parseInt(currentMapInfoOverrides.scavengers, 10) || 0;
    if (currentMapInfoOverrides.uploaded) level.uploaded = currentMapInfoOverrides.uploaded;
    if (currentMapInfoOverrides.version) level.versionName = currentMapInfoOverrides.version;
    if (currentMapInfoOverrides.tags) level.tags = currentMapInfoOverrides.tags;
    if (currentMapInfoOverrides.license) level.license = currentMapInfoOverrides.license;
    if (currentMapInfoOverrides.source) level.source = currentMapInfoOverrides.source;
    zip.file('level.json', JSON.stringify(level, null, 2));
    currentLevelJson = level;
  } catch (e) {
    zip.file('level.json', buildDefaultLevelJson(base));
  }
  if (!zip.file('gam.json')) {
    zip.file('gam.json', buildDefaultGamJson());
  } else {
    const text = await zip.file('gam.json').async('string');
    try {
      const gam = JSON.parse(text);
      gam.ScrollMaxX = mapW;
      gam.ScrollMaxY = mapH;
      zip.file('gam.json', JSON.stringify(gam, null, 2));
    } catch (e) {
      zip.file('gam.json', buildDefaultGamJson());
    }
  }
  if (!zip.file('struct.json')) zip.file('struct.json', JSON.stringify({ version: 2, structures: [] }));
  if (!zip.file('feature.json')) zip.file('feature.json', JSON.stringify({ version: 2, features: [] }));
  if (!zip.file('droid.json')) zip.file('droid.json', JSON.stringify({ version: 2, droids: [] }));
}

function markStructureForExport(group, def, rot, sizeX, sizeY, sourceEntry = null, style = currentStructJsonStyle) {
  if (!group || !def) return;
  const moduleCount = Math.max(0, parseInt(sourceEntry?.modules, 10) || 0);
  group.userData.structureExport = {
    name: def.id,
    rot: rot || 0,
    rotDeg: normalizeDegrees((rot || 0) * 90),
    sizeX: sizeX || def.sizeX || 1,
    sizeY: sizeY || def.sizeY || 1,
    player: sourceEntry?.player ?? sourceEntry?.startpos ?? 0,
    modules: moduleCount,
    sourceEntry,
    style
  };
  setStructureGroupPlayerColor(group, group.userData.structureExport.player);
}

function makeFeatureEntry(def, tileX, tileY, rotation = 0) {
  const height = Math.max(0, Math.round((mapHeights[tileY]?.[tileX] || 0) * 2));
  return {
    name: def.featureName || def.id,
    position: [Math.round((tileX + (def.sizeX || 1) / 2) * 128), Math.round((tileY + (def.sizeY || 1) / 2) * 128), height],
    rotation: [degreesToWzAngle((rotation || 0) * 90), 0, 0]
  };
}

function markFeatureForExport(group, def, tileX, tileY, sourceEntry = null, rotation = 0, rotDeg = null) {
  if (!group || !def?.feature) return;
  const entry = sourceEntry || makeFeatureEntry(def, tileX, tileY, rotation);
  const deg = rotDeg !== null ? normalizeDegrees(rotDeg) : normalizeDegrees((rotation || 0) * 90);
  group.userData.featureExport = {
    name: def.id,
    sizeX: def.sizeX || 1,
    sizeY: def.sizeY || 1,
    rot: Math.round(deg / 90) % 4,
    rotDeg: deg,
    feature: true,
    sourceEntry: entry
  };
  if (!currentFeatureEntries.includes(entry)) currentFeatureEntries.push(entry);
}

function getStructureExportEntry(group, style, id) {
  if (group?.userData?.featureExport) return null;
  const data = group?.userData?.structureExport;
  if (!data) return null;
  const def = STRUCTURE_DEFS.find(d => d.id === data.name || d.id.toLowerCase() === String(data.name).toLowerCase());
  if (!def) return null;
  const centerX = group.position.x + (group.userData.centerX || 0);
  const centerY = group.position.z + (group.userData.centerZ || 0);
  const tileX = Math.max(0, Math.min(mapW - 1, Math.round(centerX - 0.5)));
  const tileY = Math.max(0, Math.min(mapH - 1, Math.round(centerY - 0.5)));
  const height = Math.max(0, Math.round((mapHeights[tileY]?.[tileX] || 0) * 2));
  const base = data.sourceEntry && typeof data.sourceEntry === 'object' ? { ...data.sourceEntry } : {};
  base.name = def.id;
  base.id = base.id ?? id;
  if (style === 'object') {
    base.position = [Math.round(centerX * 128), Math.round(centerY * 128), height];
    base.rotation = [degreesToWzAngle(getStructureRotationDegrees(group)), 0, 0];
  } else {
    base.position = [Math.round(centerX * 128), Math.round(centerY * 128)];
    base.rotation = degreesToWzAngle(getStructureRotationDegrees(group));
  }
  const player = getStructurePlayer(group);
  if (base.player !== undefined) base.player = player;
  else base.startpos = player;
  const moduleCount = getStructureModuleCount(group);
  if (moduleCount > 0) base.modules = moduleCount;
  else delete base.modules;
  return base;
}

function getFeatureExportEntry(group, id) {
  const data = group?.userData?.featureExport;
  if (!data) return null;
  const centerX = group.position.x + (group.userData.centerX || 0);
  const centerY = group.position.z + (group.userData.centerZ || 0);
  const tileX = Math.max(0, Math.min(mapW - 1, Math.floor(centerX)));
  const tileY = Math.max(0, Math.min(mapH - 1, Math.floor(centerY)));
  const base = data.sourceEntry && typeof data.sourceEntry === 'object' ? { ...data.sourceEntry } : {};
  base.name = data.name || data.sourceEntry?.name || OIL_SPOT_DEF.featureName;
  if (base.id !== undefined) base.id = base.id || id;
  const height = Math.max(0, Math.round((mapHeights[tileY]?.[tileX] || 0) * 2));
  base.position = [Math.round(centerX * 128), Math.round(centerY * 128), height];
  base.rotation = [degreesToWzAngle(getFeatureRotationDegrees(group)), 0, 0];
  return base;
}

function buildStructJson() {
  const style = currentStructJsonStyle || 'array';
  const entries = [];
  if (objectsGroup) {
    objectsGroup.children.forEach((group, idx) => {
      const entry = getStructureExportEntry(group, style, idx + 1);
      if (entry) entries.push(entry);
    });
  }
  ensureUniqueEntryIds(entries, true);
  if (style === 'object') {
    const out = {};
    entries.forEach((entry, idx) => {
      out['structure_' + String(idx + 1).padStart(4, '0')] = entry;
    });
    return JSON.stringify(out);
  }
  return JSON.stringify({ version: 2, structures: entries });
}

function buildFeatureJson() {
  const replacements = new Map();
  if (objectsGroup) {
    objectsGroup.children.forEach((group, idx) => {
      const entry = getFeatureExportEntry(group, idx + 1);
      const source = group?.userData?.featureExport?.sourceEntry;
      if (entry && source) replacements.set(source, entry);
    });
  }
  const entries = currentFeatureEntries.map(entry => replacements.get(entry) || entry);
  replacements.forEach((entry, source) => {
    if (!currentFeatureEntries.includes(source)) entries.push(entry);
  });
  ensureUniqueEntryIds(entries, false);
  return JSON.stringify({ version: 2, features: entries }, null, 2);
}

function savedMapNeedsAdvancedBases() {
  if (!objectsGroup) return false;
  return objectsGroup.children.some(group => {
    const data = group?.userData?.structureExport;
    if (!data) return false;
    const def = STRUCTURE_DEFS.find(d => d.id === data.name || d.id.toLowerCase() === String(data.name).toLowerCase());
    return def && (def.type === 'DEFENSE' || def.type === 'GATE' || def.type === 'WALL' || def.type === 'COMMAND_CONTROL');
  });
}

function getStructureLabel(group, index) {
  const data = group?.userData?.structureExport || {};
  const def = getStructureDefById(data.name);
  return (def?.name || data.name || 'Structure') + ' #' + (index + 1);
}

function validateStructureOverlaps(groups, errors) {
  const footprints = groups.map((group, index) => ({
    group,
    index,
    def: getStructureGroupDef(group),
    footprint: getStructureFootprint(group)
  })).filter(item => item.footprint);
  const moduleCounts = new Map();

  for (let i = 0; i < footprints.length; i++) {
    const a = footprints[i];
    const moduleRule = getModuleParentTypes(a.def);
    const parentModuleDef = getModuleDefForParent(a.def);
    const parentModuleRule = getModuleParentTypes(parentModuleDef);
    const parentModuleCount = getStructureModuleCount(a.group);
    if (parentModuleRule && parentModuleCount > parentModuleRule.max) {
      errors.push(getStructureLabel(a.group, a.index) + ' exceeds module limit.');
    }
    if (moduleRule) {
      const sameTileItems = footprints.filter(item => footprintsMatch(item.footprint, a.footprint));
      const parent = sameTileItems.find(item => {
        const type = String(item.def?.type || '').toLowerCase();
        return item !== a && moduleRule.parents.has(type);
      });
      if (!parent) {
        errors.push(getStructureLabel(a.group, a.index) + ' is a module but is not on a matching parent structure.');
      } else {
        const key = String(a.def?.id || '').toLowerCase() + '@' + a.footprint.x + ',' + a.footprint.y;
        moduleCounts.set(key, (moduleCounts.get(key) || 0) + 1);
      }
    }

    for (let j = i + 1; j < footprints.length; j++) {
      const b = footprints[j];
      if (!footprintsOverlap(a.footprint, b.footprint)) continue;
      const oilDerrickOnSpot =
        footprintsMatch(a.footprint, b.footprint) &&
        ((isOilSpotDef(a.def) && isOilDerrickDef(b.def)) || (isOilDerrickDef(a.def) && isOilSpotDef(b.def)));
      if (oilDerrickOnSpot) continue;
      const aRule = getModuleParentTypes(a.def);
      const bRule = getModuleParentTypes(b.def);
      const aOnB = aRule && footprintsMatch(a.footprint, b.footprint) && aRule.parents.has(String(b.def?.type || '').toLowerCase());
      const bOnA = bRule && footprintsMatch(a.footprint, b.footprint) && bRule.parents.has(String(a.def?.type || '').toLowerCase());
      const sameModuleStack = aRule && bRule &&
        String(a.def?.id || '').toLowerCase() === String(b.def?.id || '').toLowerCase() &&
        footprintsMatch(a.footprint, b.footprint);
      if (!aOnB && !bOnA && !sameModuleStack) {
        errors.push(getStructureLabel(a.group, a.index) + ' overlaps ' + getStructureLabel(b.group, b.index) + '.');
      }
    }
  }

  moduleCounts.forEach((count, key) => {
    const id = key.split('@')[0];
    const def = getStructureDefById(id);
    const rule = getModuleParentTypes(def);
    if (rule && count > rule.max) {
      errors.push((def?.name || id) + ' exceeds module limit at tile ' + key.split('@')[1] + '.');
    }
  });
}

function getObjectEntryTile(entry) {
  const pos = entry?.position || entry?.pos;
  if (!Array.isArray(pos) || pos.length < 2) return null;
  return {
    x: Math.floor((parseFloat(pos[0]) || 0) / 128),
    y: Math.floor((parseFloat(pos[1]) || 0) / 128)
  };
}

function isTileWithinMap(tileX, tileY) {
  return tileX >= 0 && tileY >= 0 && tileX < mapW && tileY < mapH;
}

function isFootprintWithinMap(footprint) {
  return !!footprint &&
    footprint.x >= 0 &&
    footprint.y >= 0 &&
    footprint.x + Math.max(1, footprint.sizeX || 1) <= mapW &&
    footprint.y + Math.max(1, footprint.sizeY || 1) <= mapH;
}

function getObjectEntryPlayer(entry) {
  const raw = entry?.player ?? entry?.startpos;
  const player = parseInt(raw, 10);
  return Number.isFinite(player) ? player : 0;
}

function isOilFeature(entry) {
  const name = String(entry?.name || entry?.id || '').toLowerCase();
  const type = String(entry?.type || entry?.stattype || '').toLowerCase();
  return name === 'oilresource' || type === 'oil resource';
}

const MINIMAP_TERRAIN_COLORS = [
  '#c9a96a', '#9a7c42', '#7a4e37', '#4d7a47',
  '#8e4b38', '#9a6a8f', '#9a9b94', '#1f5d75',
  '#6b5a4f', '#73553b', '#d8e7f0', '#91a5a8'
];

function colorToCssHex(color) {
  const value = Math.max(0, Math.min(0xffffff, parseInt(color, 10) || 0));
  return '#' + value.toString(16).padStart(6, '0');
}

function drawMinimapRect(ctx, scaleX, scaleY, x, y, w, h, color) {
  const left = Math.floor(x * scaleX);
  const top = Math.floor(y * scaleY);
  const right = Math.ceil((x + Math.max(1, w)) * scaleX);
  const bottom = Math.ceil((y + Math.max(1, h)) * scaleY);
  ctx.fillStyle = color;
  ctx.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
}

function updateMinimap() {
  if (!minimapCanvas || !mapW || !mapH || !Array.isArray(mapTiles)) return;
  const ctx = minimapCanvas.getContext('2d');
  if (!ctx) return;
  const width = minimapCanvas.width;
  const height = minimapCanvas.height;
  ctx.clearRect(0, 0, width, height);
  const scale = Math.min(width / mapW, height / mapH);
  const drawW = Math.max(1, Math.floor(mapW * scale));
  const drawH = Math.max(1, Math.floor(mapH * scale));
  const offsetX = Math.floor((width - drawW) / 2);
  const offsetY = Math.floor((height - drawH) / 2);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.fillStyle = '#101722';
  ctx.fillRect(0, 0, drawW, drawH);

  for (let y = 0; y < mapH; y++) {
    const row = mapTiles[y] || [];
    for (let x = 0; x < mapW; x++) {
      const tileId = row[x] || 0;
      const typeId = tileTypesById[tileId] ?? 0;
      drawMinimapRect(ctx, scale, scale, x, y, 1, 1, MINIMAP_TERRAIN_COLORS[typeId] || '#777');
    }
  }

  if (objectsGroup) {
    objectsGroup.children.forEach(group => {
      if (group?.userData?.featureExport) {
        const entry = group.userData.featureExport.sourceEntry || {};
        if (!isOilFeature(entry) && String(group.userData.featureExport.name || '').toLowerCase() !== 'oilresource') return;
        const footprint = getStructureFootprint(group);
        if (footprint) drawMinimapRect(ctx, scale, scale, footprint.x, footprint.y, footprint.sizeX, footprint.sizeY, '#ffd447');
        return;
      }
      if (group?.userData?.structureExport) {
        const footprint = getStructureFootprint(group);
        const color = colorToCssHex(PLAYER_COLORS[getStructurePlayer(group) % PLAYER_COLORS.length]);
        if (footprint) drawMinimapRect(ctx, scale, scale, footprint.x, footprint.y, footprint.sizeX, footprint.sizeY, color);
        return;
      }
      if (group?.userData?.droidExport) {
        const tile = getObjectEntryTile(group.userData.droidExport);
        const color = colorToCssHex(PLAYER_COLORS[getDroidPlayer(group) % PLAYER_COLORS.length]);
        if (tile) drawMinimapRect(ctx, scale, scale, tile.x, tile.y, 1, 1, color);
      }
    });
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, drawW - 1, drawH - 1);
  ctx.restore();
}

function getMinimapTileFromEvent(event) {
  if (!minimapCanvas || !mapW || !mapH) return null;
  const rect = minimapCanvas.getBoundingClientRect();
  const scale = Math.min(minimapCanvas.width / mapW, minimapCanvas.height / mapH);
  const drawW = Math.max(1, Math.floor(mapW * scale));
  const drawH = Math.max(1, Math.floor(mapH * scale));
  const offsetX = Math.floor((minimapCanvas.width - drawW) / 2);
  const offsetY = Math.floor((minimapCanvas.height - drawH) / 2);
  const canvasX = (event.clientX - rect.left) * (minimapCanvas.width / rect.width);
  const canvasY = (event.clientY - rect.top) * (minimapCanvas.height / rect.height);
  if (canvasX < offsetX || canvasY < offsetY || canvasX >= offsetX + drawW || canvasY >= offsetY + drawH) return null;
  return {
    x: Math.max(0, Math.min(mapW - 1, Math.floor((canvasX - offsetX) / scale))),
    y: Math.max(0, Math.min(mapH - 1, Math.floor((canvasY - offsetY) / scale)))
  };
}

function jumpCameraToMinimapEvent(event) {
  const tile = getMinimapTileFromEvent(event);
  if (!tile) return;
  cameraState.camTargetX = tile.x + 0.5;
  cameraState.camTargetZ = tile.y + 0.5;
}

function isBuilderDroid(entry) {
  const template = String(entry?.template || '').toLowerCase();
  if (template.includes('construction')) return true;
  const weapons = Array.isArray(entry?.weapons) ? entry.weapons : [entry?.weapon];
  return weapons.some(weapon => String(weapon || '').toLowerCase() === 'droid_construct');
}

function getDeclaredPlayerCount(activePlayers) {
  const raw = currentLevelJson?.players ?? currentGamJson?.players ?? currentGamJson?.Players;
  const declared = parseInt(raw, 10);
  if (Number.isFinite(declared) && declared > 0) return Math.min(Math.max(declared, 1), 11);
  if (activePlayers.size) return Math.min(Math.max(Math.max(...activePlayers) + 1, 1), 11);
  return 0;
}

function validateDroids(errors, warnings, activePlayers, builderPlayers) {
  currentDroidEntries.forEach((entry, index) => {
    const label = 'Droid #' + (index + 1);
    const player = getObjectEntryPlayer(entry);
    const tile = getObjectEntryTile(entry);
    if (player < 0 || player > 10) errors.push(label + ' has invalid owner player ' + player + '.');
    else activePlayers.add(player);
    if (!tile) {
      errors.push(label + ' has no valid position.');
    } else if (tile.x < 0 || tile.y < 0 || tile.x >= mapW || tile.y >= mapH) {
      errors.push(label + ' is outside the map bounds.');
    }
    if (isBuilderDroid(entry)) builderPlayers.add(player);
    if (!entry.template && !entry.body && !entry.pie && !entry.model && !entry.pies && !entry.models) {
      warnings.push(label + ' has no template/body/model data.');
    }
  });
}

function validateFeatures(errors, warnings) {
  const oilTiles = new Map();
  currentFeatureEntries.forEach((entry, index) => {
    const label = 'Feature #' + (index + 1);
    const tile = getObjectEntryTile(entry);
    if (!tile) {
      warnings.push(label + ' has no valid position.');
      return;
    }
    if (tile.x < 0 || tile.y < 0 || tile.x >= mapW || tile.y >= mapH) {
      errors.push(label + ' is outside the map bounds.');
      return;
    }
    if (isOilFeature(entry)) {
      const key = tile.x + ',' + tile.y;
      oilTiles.set(key, (oilTiles.get(key) || 0) + 1);
    }
  });
  oilTiles.forEach((count, key) => {
    if (count > 1) warnings.push('Multiple oil/resource features are stacked at tile ' + key + '.');
  });
  return oilTiles;
}

function validateGamMetadata(errors, warnings) {
  if (currentGamJson) {
    const maxX = parseInt(currentGamJson.ScrollMaxX, 10);
    const maxY = parseInt(currentGamJson.ScrollMaxY, 10);
    if (Number.isFinite(maxX) && maxX !== mapW) warnings.push('gam.json ScrollMaxX is ' + maxX + ', export will set it to ' + mapW + '.');
    if (Number.isFinite(maxY) && maxY !== mapH) warnings.push('gam.json ScrollMaxY is ' + maxY + ', export will set it to ' + mapH + '.');
  }
  if (currentLevelJson) {
    const players = parseInt(currentLevelJson.players, 10);
    if (Number.isFinite(players) && (players < 1 || players > 10)) {
      warnings.push('level.json player count looks unusual: ' + players + '.');
    }
    const levelTileset = getCanonicalTilesetName(currentLevelJson.tileset);
    const activeTileset = getOfficialTilesetName(tilesetIndex);
    if (levelTileset && activeTileset && levelTileset !== activeTileset) {
      warnings.push('level.json tileset is "' + currentLevelJson.tileset + '" but editor tileset is "' + TILESETS[tilesetIndex].name + '".');
    }
  }
}

function cleanupObjectsOutsideMapBounds() {
  if (!objectsGroup) return 0;
  const groups = objectsGroup.children.slice();
  let removed = 0;
  groups.forEach(group => {
    if (group?.userData?.droidExport) {
      const tile = getObjectEntryTile(group.userData.droidExport);
      if (!tile || !isTileWithinMap(tile.x, tile.y)) {
        if (removeDroidGroup(group)) removed++;
      }
      return;
    }
    if (group?.userData?.structureExport || group?.userData?.featureExport) {
      const footprint = getStructureFootprint(group);
      if (!isFootprintWithinMap(footprint)) {
        if (removeStructureGroup(group)) removed++;
      }
    }
  });
  if (removed) {
    clearViewBulkSelection();
    markMapDirty();
    updateMinimap();
  }
  return removed;
}

function validateMapForExport() {
  const errors = [];
  const warnings = [];
  const info = [];
  const activePlayers = new Set();
  const commandCenterPlayers = new Set();
  const builderPlayers = new Set();
  const removedOutOfBounds = cleanupObjectsOutsideMapBounds();
  if (removedOutOfBounds) {
    info.push('Removed ' + removedOutOfBounds + ' object' + (removedOutOfBounds === 1 ? '' : 's') + ' outside the map bounds.');
  }

  if (!Number.isInteger(mapW) || !Number.isInteger(mapH) || mapW <= 0 || mapH <= 0) {
    errors.push('Map size is invalid.');
  }
  if (!Array.isArray(mapTiles) || mapTiles.length !== mapH || mapTiles.some(row => !Array.isArray(row) || row.length !== mapW)) {
    errors.push('Tile grid size does not match map size.');
  }
  if (!Array.isArray(mapHeights) || mapHeights.length !== mapH || mapHeights.some(row => !Array.isArray(row) || row.length !== mapW)) {
    errors.push('Height grid size does not match map size.');
  }

  const groups = objectsGroup ? objectsGroup.children.filter(group => group?.userData?.structureExport) : [];
  groups.forEach((group, index) => {
    const data = group.userData.structureExport;
    const def = getStructureDefById(data.name);
    const label = getStructureLabel(group, index);
    const footprint = getStructureFootprint(group);
    const player = getStructurePlayer(group);
    if (!def) errors.push(label + ' has unknown structure id "' + (data.name || 'missing') + '".');
    if (!Number.isInteger(player) || player < 0 || player > 10) errors.push(label + ' has invalid owner player ' + player + '.');
    else activePlayers.add(player);
    const defText = ((def?.id || '') + ' ' + (def?.name || '')).toLowerCase();
    if (defText.includes('commandcentre') || defText.includes('command center')) commandCenterPlayers.add(player);
    if (!footprint) {
      errors.push(label + ' has no footprint.');
    } else if (footprint.x < 0 || footprint.y < 0 || footprint.x + footprint.sizeX > mapW || footprint.y + footprint.sizeY > mapH) {
      errors.push(label + ' is outside the map bounds.');
    }
    if (!Number.isFinite(getStructureRotationDegrees(group))) {
      errors.push(label + ' has invalid rotation.');
    }
  });
  validateStructureOverlaps(groups, errors);
  validateDroids(errors, warnings, activePlayers, builderPlayers);
  const oilTiles = validateFeatures(errors, warnings);
  validateGamMetadata(errors, warnings);

  const extractorGroups = groups.filter(group => String(getStructureGroupDef(group)?.id || '').toLowerCase() === 'a0resourceextractor');
  extractorGroups.forEach((group, index) => {
    const footprint = getStructureFootprint(group);
    if (footprint && oilTiles.size && !oilTiles.has(footprint.x + ',' + footprint.y)) {
      warnings.push('Resource extractor #' + (index + 1) + ' is not on a known oil/resource feature tile.');
    }
  });

  const playerCount = getDeclaredPlayerCount(activePlayers);
  if (playerCount > 0 && (groups.length || currentDroidEntries.length)) {
    for (let player = 0; player < playerCount; player++) {
      if (!commandCenterPlayers.has(player)) warnings.push('Player ' + player + ' has no Command Center.');
      if (!builderPlayers.has(player)) warnings.push('Player ' + player + ' has no builder truck droid.');
    }
  }

  if (!groups.length) warnings.push('No structures are placed. That is fine for terrain-only maps.');
  if (!currentDroidEntries.length) warnings.push('No droids found. Advanced-base maps usually need at least one builder truck per player.');
  if (!currentFeatureEntries.length && extractorGroups.length) warnings.push('No feature.json oil/resource data found, but resource extractors are placed.');
  if (savedMapNeedsAdvancedBases()) {
    warnings.push('This map has defenses, walls, gates, or command structures. Use Advanced Bases in Warzone to keep them in game.');
  }
  return { errors, warnings, info };
}

function showValidationDialog(result, allowContinue = false) {
  if (!validationOverlay) return Promise.resolve(!result.errors.length);
  return new Promise(resolve => {
    const hasErrors = result.errors.length > 0;
    const hasWarnings = result.warnings.length > 0;
    validationSummary.textContent = hasErrors
      ? result.errors.length + ' error(s) must be fixed before export.'
      : hasWarnings
        ? result.warnings.length + ' warning(s) found. You can still export if these are expected.'
        : 'No problems found. Map is ready to export.';
    validationList.innerHTML = '';
    const items = [
      ...result.errors.map(text => ({ text, type: 'error' })),
      ...result.warnings.map(text => ({ text, type: 'warning' })),
      ...result.info.map(text => ({ text, type: 'info' }))
    ];
    items.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item.text;
      li.className = item.type;
      validationList.appendChild(li);
    });
    const close = (value) => {
      validationOverlay.classList.add('hidden');
      validationCancelBtn.onclick = null;
      validationContinueBtn.onclick = null;
      resolve(value);
    };
    validationContinueBtn.style.display = allowContinue && !hasErrors ? 'inline-block' : 'none';
    validationCancelBtn.textContent = allowContinue && !hasErrors ? 'Cancel' : 'Close';
    validationCancelBtn.onclick = () => close(false);
    validationContinueBtn.onclick = () => close(true);
    validationOverlay.classList.remove('hidden');
  });
}

async function validateMapFromFileTab() {
  const result = validateMapForExport();
  await showValidationDialog(result, false);
  const summary = result.errors.length
    ? 'Validation found ' + result.errors.length + ' error(s).'
    : result.warnings.length
      ? 'Validation found ' + result.warnings.length + ' warning(s).'
      : 'Validation passed.';
  setFileStatus(summary);
}

function updateStructJson(zip) {
  const structPath = currentStructArchivePath || 'struct.json';
  zip.file(structPath, buildStructJson());
}

function updateDroidJson(zip) {
  const droidPath = currentDroidArchivePath || 'droid.json';
  zip.file(droidPath, buildDroidJson());
}

function updateFeatureJson(zip) {
  const featurePath = currentFeatureArchivePath || 'feature.json';
  zip.file(featurePath, buildFeatureJson());
}

async function buildWzFileBlob() {
  const zip = currentMapArchive || new JSZip();
  const base = getSafeMapBase();
  const mapPath = currentMapArchivePath || 'game.map';
  if (!currentMapArchive || (currentMapExportInfo && currentMapExportInfo.gamma)) {
    await updateGammaMetadata(zip, base);
  }
  updateStructJson(zip);
  updateFeatureJson(zip);
  updateDroidJson(zip);
  zip.file(mapPath, buildMapFileBytes());
  zip.file(getTileTypesArchivePath(mapPath), buildTileTypesFileBytes());
  return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

async function saveCurrentMap() {
  let fileHandle = null;
  const savedName = makeSaveFilename();
  try {
    hideSaveResult();
    const validation = validateMapForExport();
    if (validation.errors.length) {
      await showValidationDialog(validation, false);
      setFileStatus('Save blocked: fix validation errors first.');
      return;
    }
    if (validation.warnings.length) {
      const shouldContinue = await showValidationDialog(validation, true);
      if (!shouldContinue) {
        setFileStatus('Save cancelled after validation.');
        return;
      }
    }
    if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
      try {
        setFileStatus('Choose save location...');
        fileHandle = await window.showSaveFilePicker({
          suggestedName: savedName,
          types: [{
            description: 'Warzone 2100 map archive',
            accept: { 'application/zip': ['.wz'] }
          }]
        });
      } catch (err) {
        if (err && err.name === 'AbortError') {
          setFileStatus('Save cancelled.');
          return;
        }
        console.warn('Save picker unavailable, using browser download:', err);
        fileHandle = null;
      }
    }
    setFileStatus('Packing .wz map...');
    setLoadingProgress('Packing WZ archive', 15);
    const blob = await buildWzFileBlob();
    let saveMode = 'download';
    if (fileHandle) {
      setLoadingProgress('Writing WZ file', 95);
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      saveMode = 'picker';
    } else {
      setLoadingProgress('Preparing download', 95);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = savedName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    setLoadingProgress('WZ saved', 100);
    markMapClean();
    setTimeout(() => {
      hideLoadingProgress();
      const baseTip = savedMapNeedsAdvancedBases() ? ' Use Advanced Bases in Warzone to keep defenses/sensors.' : '';
      setFileStatus('Saved ' + savedName + baseTip);
      getBlobSha256(blob).then(hash => {
        showSaveResult(savedName, saveMode, baseTip, buildSaveResultDetails(blob, hash));
      }).catch(() => {
        showSaveResult(savedName, saveMode, baseTip, buildSaveResultDetails(blob));
      });
    }, 600);
  } catch (err) {
    console.error('Failed to save WZ map:', err);
    setFileStatus('Failed to save .wz map.');
    setLoadingProgress('Failed to save WZ archive', 100);
  }
}
window.saveCurrentMap = saveCurrentMap;

function setupFilePanel() {
  const loadBtn = document.getElementById('fileLoadBtn');
  const serverBtn = document.getElementById('fileServerBtn');
  const officialBtn = document.getElementById('fileOfficialBtn');
  const saveBtn = document.getElementById('fileSaveBtn');
  const validateBtn = document.getElementById('fileValidateBtn');
  const newBtn = document.getElementById('fileNewBtn');
  const input = document.getElementById('wzLoader');

  if (loadBtn && input) {
    loadBtn.addEventListener('click', () => {
      try { input.click(); } catch (e) {}
    });
  }
  if (serverBtn && fileListDiv) {
    serverBtn.addEventListener('click', async () => {
      if (!fileListDiv.children.length && typeof window.loadServerList === 'function') {
        await window.loadServerList();
      }
      fileListDiv.classList.toggle('hidden');
      setFileStatus(fileListDiv.classList.contains('hidden') ? 'Server map list closed.' : 'Select a server map from the list.');
    });
  }
  if (officialBtn) {
    officialBtn.addEventListener('click', () => {
      window.open('https://maps.wz2100.net/', '_blank');
    });
  }
  if (fileMapNameInput) {
    fileMapNameInput.addEventListener('input', () => {
      if (mapFilenameSpan) mapFilenameSpan.textContent = fileMapNameInput.value.trim();
      currentMapInfoOverrides.name = fileMapNameInput.value.trim();
      if (settingsMapNameInput) settingsMapNameInput.value = currentMapInfoOverrides.name;
      markMapDirty();
    });
  }
  if (localAutosaveToggle) {
    localAutosaveEnabled = safeLocalStorageGet(LOCAL_AUTOSAVE_ENABLED_KEY) !== '0';
    localAutosaveToggle.checked = localAutosaveEnabled;
    localAutosaveToggle.addEventListener('change', () => setLocalAutosaveEnabled(localAutosaveToggle.checked));
  }
  if (localSaveLoadBtn) {
    localSaveLoadBtn.addEventListener('click', () => {
      loadSelectedLocalSave().catch(err => {
        console.error('Failed to load local save:', err);
        setLocalSaveStatus('Failed to load local save.');
      });
    });
  }
  if (localSaveDeleteBtn) localSaveDeleteBtn.addEventListener('click', deleteSelectedLocalSave);
  refreshLocalSaveList();
  if (saveBtn) {
    saveBtn.addEventListener('click', saveCurrentMap);
  }
  if (validateBtn) {
    validateBtn.addEventListener('click', validateMapFromFileTab);
  }
  if (newBtn) {
    newBtn.addEventListener('click', async () => {
      if (!confirmUnsavedChanges()) return;
      await newMap();
      if (fileListDiv) fileListDiv.classList.add('hidden');
      setCurrentMapName('Untitled Map');
      hideOverlay();
      hideCurrentMapNameBar();
      setFileStatus('Created a new blank map.');
    });
  }
}

const initDom = () => {
  loadTerrainSpeedModifiers();
  if (saveResultCloseBtn) {
    saveResultCloseBtn.addEventListener('click', hideSaveResult);
  }
  if (templateNameCreateBtn) {
    templateNameCreateBtn.addEventListener('click', () => {
      const value = templateNameInput ? templateNameInput.value.trim() : '';
      closeTemplateNameDialog(value);
    });
  }
  if (templateNameCancelBtn) templateNameCancelBtn.addEventListener('click', () => closeTemplateNameDialog(null));
  if (templateNameBackdrop) templateNameBackdrop.addEventListener('click', () => closeTemplateNameDialog(null));
  if (serverMapLicenseOkBtn) serverMapLicenseOkBtn.addEventListener('click', closeServerMapLicenseDialog);
  if (serverMapLicenseBackdrop) serverMapLicenseBackdrop.addEventListener('click', closeServerMapLicenseDialog);
  if (licenseHelpBtn) licenseHelpBtn.addEventListener('click', showLicenseHelpDialog);
  if (licenseHelpOkBtn) licenseHelpOkBtn.addEventListener('click', closeLicenseHelpDialog);
  if (licenseHelpBackdrop) licenseHelpBackdrop.addEventListener('click', closeLicenseHelpDialog);
  if (templateNameInput) {
    templateNameInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        closeTemplateNameDialog(templateNameInput.value.trim());
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeTemplateNameDialog(null);
      }
    });
  }
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      setActiveTab(tab);
    });
  });
  document.querySelectorAll('[data-about-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-about-mode');
      document.querySelectorAll('[data-about-mode]').forEach(item => {
        item.classList.toggle('active', item === btn);
      });
      const helpPanel = document.getElementById('aboutHelpPanel');
      const controlsPanel = document.getElementById('aboutControlsPanel');
      const infoPanel = document.getElementById('aboutInfoPanel');
      if (helpPanel) helpPanel.style.display = mode === 'help' ? 'block' : 'none';
      if (controlsPanel) controlsPanel.style.display = mode === 'controls' ? 'block' : 'none';
      if (infoPanel) infoPanel.style.display = mode === 'about' ? 'block' : 'none';
    });
  });
  document.querySelectorAll('[data-settings-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-settings-mode');
      document.querySelectorAll('[data-settings-mode]').forEach(item => {
        item.classList.toggle('active', item === btn);
      });
      const viewPanel = document.getElementById('settingsViewPanel');
      const mapInfoPanel = document.getElementById('settingsMapInfoPanel');
      const myInfoPanel = document.getElementById('settingsMyInfoPanel');
      if (viewPanel) viewPanel.style.display = mode === 'view' ? 'block' : 'none';
      if (mapInfoPanel) mapInfoPanel.style.display = mode === 'map' ? 'block' : 'none';
      if (myInfoPanel) myInfoPanel.style.display = mode === 'my' ? 'block' : 'none';
    });
  });
  const rotLeft = document.getElementById('rotateLeft');
  const rotRight = document.getElementById('rotateRight');
  const tileFlip = document.getElementById('tileFlip');
  const heightRotLeft = document.getElementById('heightRotateLeft');
  const heightRotRight = document.getElementById('heightRotateRight');
  const rotateBrushLine = (delta) => {
    selectedRotation = (selectedRotation + delta + 4) % 4;
    updateSelectedInfo();
    renderTexturePalette();
    continuousBrushLastKey = null;
    if (lastMouseEvent) updateHighlight(lastMouseEvent);
  };
  rotLeft && rotLeft.addEventListener('click', () => {
    rotateBrushLine(1);
  });
  rotRight && rotRight.addEventListener('click', () => {
    rotateBrushLine(3);
  });
  tileFlip && tileFlip.addEventListener('click', () => {
    selectedXFlip = !selectedXFlip;
    updateSelectedInfo();
    renderTexturePalette();
    continuousBrushLastKey = null;
    if (lastMouseEvent) updateHighlight(lastMouseEvent);
  });
  heightRotLeft && heightRotLeft.addEventListener('click', () => rotateBrushLine(1));
  heightRotRight && heightRotRight.addEventListener('click', () => rotateBrushLine(3));
  updateSelectedInfo();
  setActiveTab(activeTab);
  setupFilePanel();
  if (minimapCanvas) {
    minimapCanvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      jumpCameraToMinimapEvent(event);
    });
  }

  const brushInput = document.getElementById('brushSizeInput');
  const brushSlider = document.getElementById('brushSizeSlider');
  const tileBrushShapeInputs = document.querySelectorAll('input[name="tileBrushShape"]');
  const tileBrushSmartTilesInput = document.getElementById('tileBrushSmartTiles');
  const tileBrushRoadModeControls = document.getElementById('tileBrushRoadModeControls');
  const tileBrushRoadOptionControls = document.getElementById('tileBrushRoadOptionControls');
  const tileBrushWaterOptionControls = document.getElementById('tileBrushWaterOptionControls');
  const tileBrushRoadsInput = document.getElementById('tileBrushRoads');
  const tileBrushRoadFamilySelect = document.getElementById('tileBrushRoadFamily');
  const tileBrushRoadExtraTileInput = document.getElementById('tileBrushRoadExtraTile');
  const tileBrushWaterInput = document.getElementById('tileBrushWater');
  const tileBrushWaterExtraTileInput = document.getElementById('tileBrushWaterExtraTile');
  const tileBrushSmartPresetControls = document.getElementById('tileBrushSmartPresetControls');
  const tileBrushSmartPresetButtons = document.querySelectorAll('[data-smart-tile-preset]');
  const heightBrushInput = document.getElementById('heightBrushSizeInput');
  const heightBrushSlider = document.getElementById('heightBrushSizeSlider');
  const heightBrushShapeInputs = document.querySelectorAll('input[name="heightBrushShape"]');
  const heightBrushActionInputs = document.querySelectorAll('input[name="heightBrushAction"]');
  const terrainMirrorSelects = [
    document.getElementById('tileMirrorModeSelect'),
    document.getElementById('heightMirrorModeSelect')
  ].filter(Boolean);

  const setBrush = (v) => {
    const n = parseInt(v, 10);
    brushSize = isNaN(n) ? 1 : Math.min(Math.max(n, 1), 255);
    if (brushInput) brushInput.value = brushSize;
    if (brushSlider) brushSlider.value = String(brushSize);
    if (heightBrushInput) heightBrushInput.value = brushSize;
    if (heightBrushSlider) heightBrushSlider.value = String(brushSize);
    if (lastMouseEvent) updateHighlight(lastMouseEvent);
  };

  if (brushInput) {
    brushSize = parseInt(brushInput.value, 10) || 1;
    brushInput.addEventListener('input', () => setBrush(brushInput.value));
    brushInput.addEventListener('change', () => setBrush(brushInput.value));
  }
  if (brushSlider) {
    brushSlider.value = String(brushSize);
    brushSlider.addEventListener('input', () => setBrush(brushSlider.value));
    brushSlider.addEventListener('change', () => setBrush(brushSlider.value));
  }
  tileBrushShapeInputs.forEach(input => {
    if (input.checked) tileBrushShape = input.value || tileBrushShape;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      tileBrushShape = input.value || 'square';
      continuousBrushLastKey = null;
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  });
  heightBrushShapeInputs.forEach(input => {
    if (input.checked) heightBrushShape = input.value || heightBrushShape;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      heightBrushShape = input.value || 'square';
      continuousBrushLastKey = null;
      updateHeightBrushControls();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  });
  heightBrushActionInputs.forEach(input => {
    if (input.checked) heightBrushAction = input.value || heightBrushAction;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      heightBrushAction = input.value || 'set';
      continuousBrushLastKey = null;
      updateHeightBrushControls();
      if (typeof window.refreshHeightValueMode === 'function') window.refreshHeightValueMode();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  });
  if (tileBrushSmartTilesInput) {
    tileBrushSmartTiles = tileBrushSmartTilesInput.checked;
    tileBrushSmartTilesInput.addEventListener('change', () => {
      tileBrushSmartTiles = tileBrushSmartTilesInput.checked;
      if (!tileBrushSmartTiles) {
        activeSmartTilePresetKey = '';
        setRoadBrushMode(false);
        setWaterBrushMode(false);
      }
      updateTileBrushControls();
      continuousBrushLastKey = null;
    });
  }
  const setSmartTilePreset = (key) => {
    const preset = getSmartTilePreset(key);
    activeSmartTilePresetKey = preset ? preset.key : '';
    if (preset) {
      selectedTileId = preset.tiles[0];
      tileBrushSmartTiles = true;
      tileBrushRoads = false;
      tileBrushWater = false;
      if (tileBrushSmartTilesInput) tileBrushSmartTilesInput.checked = true;
      if (tileBrushRoadsInput) tileBrushRoadsInput.checked = false;
      if (tileBrushWaterInput) tileBrushWaterInput.checked = false;
      updateSelectedInfo();
      renderTexturePalette();
    }
    refreshSmartTilePresetControls();
    updateTileBrushControls();
    continuousBrushLastKey = null;
    if (lastMouseEvent) updateHighlight(lastMouseEvent);
  };
  tileBrushSmartPresetButtons.forEach(button => {
    button.addEventListener('click', () => {
      setSmartTilePreset(button.dataset.smartTilePreset || '');
    });
  });
  if (tileBrushRoadFamilySelect) {
    tileBrushRoadFamily = TILE_ROAD_FAMILIES.includes(tileBrushRoadFamilySelect.value)
      ? tileBrushRoadFamilySelect.value
      : 'a_roads';
    tileBrushRoadFamilySelect.value = tileBrushRoadFamily;
    tileBrushRoadFamilySelect.addEventListener('change', () => {
      tileBrushRoadFamily = TILE_ROAD_FAMILIES.includes(tileBrushRoadFamilySelect.value)
        ? tileBrushRoadFamilySelect.value
        : 'a_roads';
      continuousBrushLastKey = null;
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  if (tileBrushRoadExtraTileInput) {
    tileBrushRoadExtraRadius = tileBrushRoadExtraTileInput.checked ? 1 : 0;
    tileBrushRoadExtraTileInput.addEventListener('change', () => {
      tileBrushRoadExtraRadius = tileBrushRoadExtraTileInput.checked ? 1 : 0;
      continuousBrushLastKey = null;
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  if (tileBrushWaterExtraTileInput) {
    tileBrushWaterExtraRadius = tileBrushWaterExtraTileInput.checked ? 1 : 0;
    tileBrushWaterExtraTileInput.addEventListener('change', () => {
      tileBrushWaterExtraRadius = tileBrushWaterExtraTileInput.checked ? 1 : 0;
      continuousBrushLastKey = null;
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  const setTerrainMirrorMode = (value) => {
    terrainMirrorMode = ['off', 'vertical', 'horizontal', 'both'].includes(value) ? value : 'off';
    terrainMirrorSelects.forEach(select => {
      if (select.value !== terrainMirrorMode) select.value = terrainMirrorMode;
    });
    continuousBrushLastKey = null;
    if (lastMouseEvent) updateHighlight(lastMouseEvent);
  };

  const setRoadBrushMode = (enabled, refreshControls = true) => {
    tileBrushRoads = !!enabled;
    if (tileBrushRoads) {
      activeSmartTilePresetKey = '';
      tileBrushWater = false;
    }
    if (tileBrushRoadsInput) tileBrushRoadsInput.checked = tileBrushRoads;
    if (tileBrushWaterInput) tileBrushWaterInput.checked = tileBrushWater;
    if (refreshControls) updateTileBrushControls();
    if (tileBrushRoads) {
      setBrush(1);
      tileBrushShape = 'square';
      tileBrushSmartTiles = true;
      tileBrushShapeInputs.forEach(input => {
        input.checked = input.value === 'square';
      });
      if (tileBrushSmartTilesInput) tileBrushSmartTilesInput.checked = true;
      const changes = [];
      if (refreshAllRoadTiles(changes)) {
        pushUndo({ type: 'tiles', changes });
        redrawTerrain();
        setFileStatus('Updated road connectors.');
      }
    }
    continuousBrushLastKey = null;
    if (lastMouseEvent) updateHighlight(lastMouseEvent);
  };
  if (tileBrushRoadsInput) {
    setRoadBrushMode(tileBrushRoadsInput.checked, false);
    tileBrushRoadsInput.addEventListener('change', () => {
      setRoadBrushMode(tileBrushRoadsInput.checked);
    });
  }
  const setWaterBrushMode = (enabled, refreshControls = true) => {
    tileBrushWater = !!enabled;
    if (tileBrushWater) {
      activeSmartTilePresetKey = '';
      tileBrushRoads = false;
      setBrush(1);
      tileBrushShape = 'square';
      tileBrushSmartTiles = true;
      tileBrushShapeInputs.forEach(input => {
        input.checked = input.value === 'square';
      });
      if (tileBrushSmartTilesInput) tileBrushSmartTilesInput.checked = true;
    }
    if (tileBrushWaterInput) tileBrushWaterInput.checked = tileBrushWater;
    if (tileBrushRoadsInput) tileBrushRoadsInput.checked = tileBrushRoads;
    if (refreshControls) updateTileBrushControls();
    continuousBrushLastKey = null;
    if (lastMouseEvent) updateHighlight(lastMouseEvent);
  };
  if (tileBrushWaterInput) {
    setWaterBrushMode(tileBrushWaterInput.checked, false);
    tileBrushWaterInput.addEventListener('change', () => {
      setWaterBrushMode(tileBrushWaterInput.checked);
    });
  }
  terrainMirrorSelects.forEach(select => {
    select.value = terrainMirrorMode;
    select.addEventListener('change', () => setTerrainMirrorMode(select.value));
  });
  if (heightBrushInput) {
    heightBrushInput.value = brushSize;
    heightBrushInput.addEventListener('input', () => setBrush(heightBrushInput.value));
    heightBrushInput.addEventListener('change', () => setBrush(heightBrushInput.value));
  }
  if (heightBrushSlider) {
    heightBrushSlider.value = String(brushSize);
    heightBrushSlider.addEventListener('input', () => setBrush(heightBrushSlider.value));
    heightBrushSlider.addEventListener('change', () => setBrush(heightBrushSlider.value));
  }
  document.querySelectorAll('[data-step-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.getAttribute('data-step-target'));
      if (!input) return;
      const delta = parseInt(btn.getAttribute('data-step-delta'), 10) || 0;
      const min = input.min === '' ? -Infinity : parseInt(input.min, 10);
      const max = input.max === '' ? Infinity : parseInt(input.max, 10);
      const current = parseInt(input.value, 10) || 0;
      input.value = String(Math.max(min, Math.min(max, current + delta)));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  const tileSelectBtn = document.getElementById('tileSelectBtn');
  tileApplyBtn = document.getElementById('tileApplyBtn');
  tileCopyBtn = document.getElementById('tileCopyBtn');
  tileTemplateBtn = document.getElementById('tileTemplateBtn');
  tileViewSelectionCancelBtn = document.getElementById('tileViewSelectionCancelBtn');
  tileCancelBtn = document.getElementById('tileCancelBtn');
  const tileViewBtn = document.getElementById('tileViewBtn');
  const tileViewInfo = document.getElementById('tileViewInfo');
  const tileBrushBtn = document.getElementById('tileBrushBtn');
  const tileBrushControls = document.getElementById('tileBrushControls');
  const tileBrushSizeControls = document.getElementById('tileBrushSizeControls');
  const tilePaletteControls = document.getElementById('tilePaletteControls');
  const texturePalette = document.getElementById('texturePalette');
  const tileInfoSlot = document.getElementById('tileInfoSlot');
  tileSelectControls = document.getElementById('tileSelectControls');
  tileViewSelectionControls = document.getElementById('tileViewSelectionControls');
  const heightViewBtn = document.getElementById('heightViewBtn');
  const heightViewInfo = document.getElementById('heightViewInfo');
  heightViewSelectionControls = document.getElementById('heightViewSelectionControls');
  heightCopyBtn = document.getElementById('heightCopyBtn');
  heightTemplateBtn = document.getElementById('heightTemplateBtn');
  heightViewSelectionCancelBtn = document.getElementById('heightViewSelectionCancelBtn');
  const heightSelectBtn = document.getElementById('heightSelectBtn');
  heightApplyBtn = document.getElementById('heightApplyBtn');
  heightCancelBtn = document.getElementById('heightCancelBtn');
  const heightBrushBtn = document.getElementById('heightBrushBtn');
  const heightBrushControls = document.getElementById('heightBrushControls');
  const heightSelectControls = document.getElementById('heightSelectControls');
  const heightRotationControls = document.getElementById('heightRotationControls');
  const heightValueControls = document.getElementById('heightValueControls');
  const heightPresets = document.getElementById('heightPresets');
  const rightClickActionSelect = document.getElementById('rightClickActionSelect');
  undoBtn = document.getElementById('undoBtn');
  redoBtn = document.getElementById('redoBtn');
  if (rightClickActionSelect) {
    rightClickAction = rightClickActionSelect.value || rightClickAction;
    rightClickActionSelect.addEventListener('change', () => {
      rightClickAction = rightClickActionSelect.value || 'camera';
    });
  }
  initOverlayVisibilitySettings();
  const viewCopyBtn = document.getElementById('viewCopyBtn');
  const viewPasteBtn = document.getElementById('viewPasteBtn');
  const structureTemplateSelect = document.getElementById('structureTemplateSelect');
  const structureTemplatePlayerSelect = document.getElementById('structureTemplatePlayerSelect');
  const structureTemplateRotateLeft = document.getElementById('structureTemplateRotateLeft');
  const structureTemplateRotateRight = document.getElementById('structureTemplateRotateRight');
  const structureTemplateDeleteBtn = document.getElementById('structureTemplateDeleteBtn');
  const structureTemplateCancelBtn = document.getElementById('structureTemplateCancelBtn');
  const tileTemplateSelect = document.getElementById('tileTemplateSelect');
  const tileTemplateDeleteBtn = document.getElementById('tileTemplateDeleteBtn');
  const tileTemplateCancelBtn = document.getElementById('tileTemplateCancelBtn');
  const templateContextRenameBtn = document.getElementById('templateContextRenameBtn');
  const templateContextDeleteBtn = document.getElementById('templateContextDeleteBtn');
  document.querySelectorAll('[data-view-bulk-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-view-bulk-action');
      if (action === 'clear') {
        clearViewBulkSelection();
        disarmCopiedMapObjectPaste();
        clearSelectedTileTemplate(false);
      } else if (action === 'copy') {
        if (copiedMapObjectPasteArmed && copiedMapObject?.type === 'selection') {
          cancelCopiedMapObjectPaste();
        } else if (tileTemplatePasteArmed && (copiedTileTemplate?.kind === 'tile-selection' || copiedTileTemplate?.kind === 'height-selection')) {
          clearSelectedTileTemplate(false);
          updateTileApplyBtn();
          updateHeightApplyBtn();
          updateViewBulkSelectionPanel();
        } else {
          copyViewSelection();
        }
      } else if (action === 'template') {
        createTemplateFromViewSelection();
      } else if (action === 'delete') {
        deleteViewBulkSelection();
      }
    });
  });
  document.querySelectorAll('[data-view-bulk-player-select]').forEach(select => {
    select.addEventListener('change', () => applyViewBulkSelectionOwner(select.value));
  });
  ['viewSelectStructures', 'viewSelectDroids', 'viewSelectObjects', 'viewSelectTiles', 'viewSelectHeight'].forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox) checkbox.addEventListener('change', refreshViewBulkSelectionFilters);
  });
  document.querySelectorAll('[data-copy-placement-player-select]').forEach(select => {
    populatePlayerSelect(select);
    select.addEventListener('change', () => setCopiedSelectionPlacementPlayer(select.value));
  });
  document.querySelectorAll('[data-copy-placement-rotate]').forEach(btn => {
    btn.addEventListener('click', () => {
      rotateCopiedSelectionPlacement(parseInt(btn.getAttribute('data-copy-placement-rotate'), 10) || 0);
    });
  });
  if (viewCopyBtn) viewCopyBtn.addEventListener('click', copySelectedMapObject);
  if (viewPasteBtn) {
    viewPasteBtn.addEventListener('click', () => {
      pasteCopiedMapObjectAtMouse();
    });
  }
  if (structureTemplateSelect) {
    structureTemplateSelect.addEventListener('change', () => {
      clearSelectedTileTemplate(false);
      resetTemplatePlacementRotation();
      hideTemplateContextMenu();
      refreshStructureTemplateList();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
    structureTemplateSelect.addEventListener('contextmenu', showTemplateContextMenu);
  }
  populatePlayerSelect(structureTemplatePlayerSelect);
  if (structureTemplatePlayerSelect) {
    structureTemplatePlayerSelect.addEventListener('change', () => {
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  updateStructureTemplateRotationDisplay();
  if (structureTemplateRotateLeft) {
    structureTemplateRotateLeft.addEventListener('click', () => rotateTemplatePlacement(1));
  }
  if (structureTemplateRotateRight) {
    structureTemplateRotateRight.addEventListener('click', () => rotateTemplatePlacement(3));
  }
  if (structureTemplateDeleteBtn) structureTemplateDeleteBtn.addEventListener('click', deleteSelectedStructureTemplate);
  if (structureTemplateCancelBtn) structureTemplateCancelBtn.addEventListener('click', cancelSelectedStructureTemplate);
  if (tileTemplateSelect) {
    tileTemplateSelect.addEventListener('change', () => {
      const select = document.getElementById('structureTemplateSelect');
      if (select) select.selectedIndex = -1;
      updateStructureTemplateSelectionButton(false);
      const selected = getSelectedTileTemplate();
      copiedTileTemplate = selected;
      tileTemplatePasteArmed = !!selected;
      copiedTileTemplateVersion++;
      refreshTileTemplateList();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  if (tileTemplateDeleteBtn) tileTemplateDeleteBtn.addEventListener('click', deleteSelectedTileTemplate);
  if (tileTemplateCancelBtn) tileTemplateCancelBtn.addEventListener('click', () => clearSelectedTileTemplate());
  if (templateContextRenameBtn) {
    templateContextRenameBtn.addEventListener('click', event => {
      event.stopPropagation();
      hideTemplateContextMenu();
      renameSelectedStructureTemplate();
    });
  }
  if (templateContextDeleteBtn) {
    templateContextDeleteBtn.addEventListener('click', event => {
      event.stopPropagation();
      hideTemplateContextMenu();
      deleteSelectedStructureTemplate();
    });
  }
  document.addEventListener('click', hideTemplateContextMenu);
  document.addEventListener('contextmenu', event => {
    if (!event.target.closest?.('#templateContextMenu') && event.target !== structureTemplateSelect) hideTemplateContextMenu();
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isTemplateContextMenuOpen()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      hideTemplateContextMenu();
    }
  });
  refreshStructureTemplateList();
  refreshTileTemplateList(false);
  updateViewClipboardControls();
  if (undoBtn) undoBtn.addEventListener('click', undo);
  if (redoBtn) redoBtn.addEventListener('click', redo);
  updateUndoRedoButtons();

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'escape' && cancelShortcutAction()) {
      e.preventDefault();
      return;
    }
    if (key === 'delete' && deleteShortcutAction(e.target)) {
      e.preventDefault();
      return;
    }
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.ctrlKey && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.ctrlKey && ((e.shiftKey && key === 'z') || key === 'y')) {
      e.preventDefault();
      redo();
    } else if (e.ctrlKey && key === 'c' && !e.shiftKey) {
      if (copySelectedMapObject()) e.preventDefault();
    } else if (e.ctrlKey && key === 'v' && !e.shiftKey) {
      e.preventDefault();
      pasteCopiedMapObjectAtMouse();
    } else if (e.code === 'Space') {
      if (activeTab === 'textures' && tileBrushMode && lastMouseEvent) {
        e.preventDefault();
        handleEditClick({
          clientX: lastMouseEvent.clientX,
          clientY: lastMouseEvent.clientY,
          shiftKey: e.shiftKey,
        });
        return;
      }
      if (activeTab === 'height' && heightBrushMode && lastMouseEvent) {
        e.preventDefault();
        handleEditClick({
          clientX: lastMouseEvent.clientX,
          clientY: lastMouseEvent.clientY,
          shiftKey: e.shiftKey,
        });
        return;
      }
      e.preventDefault();
      if (activeTab === 'height') {
        if (heightApplyBtn && !heightApplyBtn.disabled) heightApplyBtn.click();
      } else if (activeTab === 'textures') {
        if (tileApplyBtn && !tileApplyBtn.disabled) tileApplyBtn.click();
      } else if (tileApplyBtn && !tileApplyBtn.disabled) {
        tileApplyBtn.click();
      } else if (heightApplyBtn && !heightApplyBtn.disabled) {
        heightApplyBtn.click();
      }
    } else if (key === 'escape') {
      e.preventDefault();
      if (activeTab === 'height') {
        if (heightCancelBtn && !heightCancelBtn.disabled) heightCancelBtn.click();
      } else if (activeTab === 'textures') {
        if (tileCancelBtn && !tileCancelBtn.disabled) tileCancelBtn.click();
      } else if (tileCancelBtn && !tileCancelBtn.disabled) {
        tileCancelBtn.click();
      } else if (heightCancelBtn && !heightCancelBtn.disabled) {
        heightCancelBtn.click();
      }
    }
  });

    function updateTileBrushControls() {
      const shouldEnable = tileBrushMode && !tileSelectionMode;
      const sizeEnabled = shouldEnable && !tileBrushRoads;
      if (brushInput) {
        brushInput.disabled = !sizeEnabled;
        brushInput.style.pointerEvents = sizeEnabled ? 'auto' : 'none';
      }
      if (brushSlider) {
        brushSlider.disabled = !sizeEnabled;
        brushSlider.style.pointerEvents = sizeEnabled ? 'auto' : 'none';
      }
      tileBrushShapeInputs.forEach(input => {
        input.disabled = !shouldEnable || tileBrushRoads;
      });
      if (tileBrushSmartTilesInput) tileBrushSmartTilesInput.disabled = !shouldEnable;
      if (tileBrushRoadsInput) tileBrushRoadsInput.disabled = !shouldEnable;
      if (tileBrushWaterInput) tileBrushWaterInput.disabled = !shouldEnable;
      if (tileBrushRoadFamilySelect) tileBrushRoadFamilySelect.disabled = !shouldEnable || !tileBrushRoads;
      if (tileBrushRoadExtraTileInput) tileBrushRoadExtraTileInput.disabled = !shouldEnable || !tileBrushRoads;
      if (tileBrushWaterExtraTileInput) tileBrushWaterExtraTileInput.disabled = !shouldEnable || !tileBrushWater;
      if (tileBrushRoadModeControls) tileBrushRoadModeControls.style.display = tileBrushSmartTiles ? 'grid' : 'none';
      if (tileBrushRoadOptionControls) tileBrushRoadOptionControls.style.display = tileBrushRoads ? 'flex' : 'none';
      if (tileBrushWaterOptionControls) tileBrushWaterOptionControls.style.display = tileBrushWater ? 'flex' : 'none';
      if (tileBrushSizeControls) tileBrushSizeControls.style.display = 'flex';
      if (tilePaletteControls) tilePaletteControls.style.display = 'flex';
      if (texturePalette) texturePalette.style.display = 'flex';
      if (tileInfoSlot) tileInfoSlot.style.display = '';
      refreshSmartTilePresetControls();
    if (tileBrushControls) {
      tileBrushControls.style.display = tileBrushMode ? 'flex' : 'none';
    }
    if (tileViewInfo) {
      tileViewInfo.style.display = tileViewMode ? 'block' : 'none';
    }
    if (tileViewBtn) tileViewBtn.classList.toggle('active', tileViewMode);
    if (tileBrushBtn) tileBrushBtn.classList.toggle('active', tileBrushMode);
    if (tileSelectBtn) tileSelectBtn.classList.toggle('active', tileSelectionMode);
  }
  refreshSmartTilePresetControls = () => {
    const show = tileBrushSmartTiles && tilesetIndex === 0;
    const enable = show && tileBrushMode && !tileSelectionMode;
    if (tileBrushSmartPresetControls) {
      tileBrushSmartPresetControls.style.display = show ? 'grid' : 'none';
    }
    tileBrushSmartPresetButtons.forEach(button => {
      const active = button.dataset.smartTilePreset === activeSmartTilePresetKey;
      button.classList.toggle('active', active);
      button.disabled = !enable;
    });
  };
    const updateHeightBrushControls = () => {
      const shouldEnable = heightBrushMode && !heightSelectionMode;
      if (heightBrushInput) {
        heightBrushInput.disabled = !shouldEnable;
        heightBrushInput.style.pointerEvents = shouldEnable ? 'auto' : 'none';
      }
      if (heightBrushSlider) {
        heightBrushSlider.disabled = !shouldEnable;
        heightBrushSlider.style.pointerEvents = shouldEnable ? 'auto' : 'none';
      }
      heightBrushShapeInputs.forEach(input => {
        input.disabled = !shouldEnable;
      });
      heightBrushActionInputs.forEach(input => {
        input.disabled = !shouldEnable;
      });
      if (heightRotLeft) heightRotLeft.disabled = !shouldEnable;
      if (heightRotRight) heightRotRight.disabled = !shouldEnable;
      if (heightRotationControls) {
        heightRotationControls.style.display = shouldEnable && heightBrushShape === 'line' ? 'flex' : 'none';
      }
      const showHeightValue = heightBrushMode && heightBrushAction !== 'smooth';
      if (heightValueControls) heightValueControls.style.display = showHeightValue ? 'flex' : 'none';
      if (heightPresets) heightPresets.style.display = showHeightValue ? 'flex' : 'none';
      if (heightBrushControls) {
        heightBrushControls.style.display = heightBrushMode ? 'flex' : 'none';
      }
      if (heightViewInfo) {
        heightViewInfo.style.display = heightViewMode ? 'block' : 'none';
      }
      if (heightViewBtn) heightViewBtn.classList.toggle('active', heightViewMode);
      if (showHeightBtn) showHeightBtn.classList.toggle('active', showHeight);
      if (heightBrushBtn) heightBrushBtn.classList.toggle('active', heightBrushMode);
    };
  if (tileBrushMode && tileBrushBtn) tileBrushBtn.classList.add('active');
  if (heightBrushMode && heightBrushBtn) heightBrushBtn.classList.add('active');
  updateTileBrushControls();
  updateHeightBrushControls();
  updateTileApplyBtn();
  updateHeightApplyBtn();

  if (tileSelectBtn) {
    tileSelectBtn.addEventListener('click', () => {
      if (tileSelectionMode) {
        tileSelectionMode = false;
        clearTileSelectionState();
      } else {
        tileSelectionMode = true;
        tileViewMode = false;
        tileBrushMode = false;
        tileSelectStart = null;
        tileSelectEnd = null;
        tileSelectionFixed = false;
        tileViewDrag = null;
        clearStructurePlacementPreview();
      }
      updateTileBrushControls();
      updateTileApplyBtn();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }

  if (tileBrushBtn) {
    tileBrushBtn.addEventListener('click', () => {
      if (tileBrushMode) {
        tileBrushMode = false;
      } else {
        tileBrushMode = true;
        tileViewMode = false;
        tileSelectionMode = false;
        tileSelectStart = null;
        tileSelectEnd = null;
        tileSelectionFixed = false;
        tileViewDrag = null;
        clearStructurePlacementPreview();
      }
      updateTileBrushControls();
      updateTileApplyBtn();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }

  if (tileViewBtn) {
    tileViewBtn.addEventListener('click', () => {
      tileViewMode = !tileViewMode;
      if (tileViewMode) {
        tileBrushMode = false;
        tileSelectionMode = false;
        tileSelectStart = null;
        tileSelectEnd = null;
        tileSelectionFixed = false;
        tileViewDrag = null;
        clearStructurePlacementPreview();
      } else {
        clearTileSelectionState();
      }
      updateTileBrushControls();
      updateTileApplyBtn();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }

  if (tileShowBtn && showTileInfoCheckbox) {
    tileShowBtn.addEventListener('click', () => {
      showTileInfoCheckbox.checked = !showTileInfoCheckbox.checked;
      if (showTileInfoCheckbox.checked) {
        tileViewMode = false;
        tileBrushMode = false;
        tileSelectionMode = false;
        tileSelectStart = null;
        tileSelectEnd = null;
        tileSelectionFixed = false;
        tileViewDrag = null;
        clearStructurePlacementPreview();
      }
      updateTileBrushControls();
      updateTileApplyBtn();
      showTileInfoCheckbox.dispatchEvent(new Event('change'));
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }

  if (tileApplyBtn) {
    tileApplyBtn.addEventListener('click', () => {
      if (!tileSelectStart || !tileSelectEnd) return;
      const minX = Math.min(tileSelectStart.x, tileSelectEnd.x);
      const maxX = Math.max(tileSelectStart.x, tileSelectEnd.x);
      const minY = Math.min(tileSelectStart.y, tileSelectEnd.y);
      const maxY = Math.max(tileSelectStart.y, tileSelectEnd.y);
      let needsRedraw = false;
      const changes = [];
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (x >= 0 && x < mapW && y >= 0 && y < mapH) {
            if (recordTileBrushChange(changes, x, y, selectedTileId, selectedRotation, selectedXFlip, false, false)) {
              needsRedraw = true;
            }
          }
        }
      }
      if (changes.length) pushUndo({ type: 'tiles', changes });
      if (needsRedraw) requestTerrainRedraw();
      tileSelectStart = null;
      tileSelectEnd = null;
      tileSelectionFixed = false;
      clearStructurePlacementPreview();
      updateTileApplyBtn();
    });
  }

  if (tileCopyBtn) {
    tileCopyBtn.addEventListener('click', copyTileSelection);
  }

  if (tileTemplateBtn) {
    tileTemplateBtn.addEventListener('click', createTileTemplateFromSelection);
  }

  if (tileViewSelectionCancelBtn) {
    tileViewSelectionCancelBtn.addEventListener('click', () => {
      if (copiedTileTemplate?.kind === 'tile-selection') {
        copiedTileTemplate = null;
        tileTemplatePasteArmed = false;
      }
      clearTileSelectionState();
      setFileStatus('Tile selection canceled.');
    });
  }

  if (tileCancelBtn) {
    tileCancelBtn.addEventListener('click', () => {
      tileSelectStart = null;
      tileSelectEnd = null;
      tileSelectionFixed = false;
      if (copiedTileTemplate?.kind === 'tile-selection') {
        copiedTileTemplate = null;
        tileTemplatePasteArmed = false;
      }
      clearStructurePlacementPreview();
      updateTileApplyBtn();
    });
  }

  if (heightSelectBtn) {
    heightSelectBtn.addEventListener('click', () => {
      if (heightSelectionMode) {
        heightSelectionMode = false;
        heightSelectBtn.classList.remove('active');
        updateHeightBrushControls();
        heightSelectStart = null;
        heightSelectEnd = null;
        if (highlightMesh && scene) {
          scene.remove(highlightMesh);
          highlightMesh = null;
        }
      } else {
        heightSelectionMode = true;
        heightSelectBtn.classList.add('active');
        heightBrushMode = false;
        if (heightBrushBtn) heightBrushBtn.classList.remove('active');
        updateHeightBrushControls();
      }
      updateHeightApplyBtn();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }

  if (heightCopyBtn) {
    heightCopyBtn.addEventListener('click', copyHeightSelection);
  }

  if (heightTemplateBtn) {
    heightTemplateBtn.addEventListener('click', createHeightTemplateFromSelection);
  }

  if (heightViewSelectionCancelBtn) {
    heightViewSelectionCancelBtn.addEventListener('click', () => {
      if (copiedTileTemplate?.kind === 'height-selection') {
        copiedTileTemplate = null;
        tileTemplatePasteArmed = false;
      }
      heightSelectStart = null;
      heightSelectEnd = null;
      heightViewTile = null;
      if (heightViewInfo) heightViewInfo.textContent = 'No height selected.';
      clearStructurePlacementPreview();
      updateHeightApplyBtn();
      setFileStatus('Height selection canceled.');
    });
  }

  if (heightViewBtn) {
    heightViewBtn.addEventListener('click', () => {
      heightViewMode = !heightViewMode;
      if (heightViewMode) {
        heightBrushMode = false;
        heightSelectionMode = false;
        heightSelectStart = null;
        heightSelectEnd = null;
        if (heightSelectBtn) heightSelectBtn.classList.remove('active');
      } else {
        heightViewTile = null;
        if (heightViewInfo) heightViewInfo.textContent = 'No height selected.';
        clearStructurePlacementPreview();
      }
      updateHeightBrushControls();
      updateHeightApplyBtn();
      drawMap3D();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }

  if (heightBrushBtn) {
    heightBrushBtn.addEventListener('click', () => {
      if (heightBrushMode) {
        heightBrushMode = false;
        heightBrushBtn.classList.remove('active');
      } else {
        heightBrushMode = true;
        heightBrushBtn.classList.add('active');
        heightViewMode = false;
        heightViewTile = null;
        if (heightViewBtn) heightViewBtn.classList.remove('active');
        if (heightViewInfo) heightViewInfo.textContent = 'No height selected.';
        clearStructurePlacementPreview();
        heightSelectionMode = false;
        if (heightSelectBtn) heightSelectBtn.classList.remove('active');
        heightSelectStart = null;
        heightSelectEnd = null;
        if (highlightMesh && scene) {
          scene.remove(highlightMesh);
          highlightMesh = null;
        }
      }
      updateHeightBrushControls();
      updateHeightApplyBtn();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }

  if (heightApplyBtn) {
    heightApplyBtn.addEventListener('click', (ev) => {
      if (!heightSelectStart || !heightSelectEnd) return;
      let newHeight = selectedHeight;
      if (ev.shiftKey) newHeight = 0;
      const minX = Math.min(heightSelectStart.x, heightSelectEnd.x);
      const maxX = Math.max(heightSelectStart.x, heightSelectEnd.x);
      const minY = Math.min(heightSelectStart.y, heightSelectEnd.y);
      const maxY = Math.max(heightSelectStart.y, heightSelectEnd.y);
      const changes = [];
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (x >= 0 && x < mapW && y >= 0 && y < mapH) {
            const oldHeight = mapHeights[y][x];
            const nh = Math.max(0, Math.min(heightMax, newHeight));
            if (oldHeight !== nh) {
              changes.push({ x, y, oldHeight, newHeight: nh });
              mapHeights[y][x] = nh;
            }
          }
        }
      }
      if (changes.length) pushUndo({ type: 'height', changes });
      requestTerrainRedraw();
      heightSelectStart = null;
      heightSelectEnd = null;
      if (highlightMesh && scene) {
        scene.remove(highlightMesh);
        highlightMesh = null;
      }
      updateHeightApplyBtn();
    });
  }

  if (heightCancelBtn) {
    heightCancelBtn.addEventListener('click', () => {
      heightSelectStart = null;
      heightSelectEnd = null;
      if (highlightMesh && scene) {
        scene.remove(highlightMesh);
        highlightMesh = null;
      }
      updateHeightApplyBtn();
    });
  }

  const typeSelect = document.getElementById('tileTypeSelect');
  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      const val = parseInt(typeSelect.value, 10);
      selectedTileType = isNaN(val) ? 0 : val;
      if (tileTypesById.length > selectedTileId) {
        tileTypesById[selectedTileId] = selectedTileType;
      }
      typeSelect.style.color = TILE_TYPE_COLORS[selectedTileType % TILE_TYPE_COLORS.length] || '#888';
      renderTexturePalette();
      requestTerrainRedraw();
      markMapDirty();
    });
  }
  const typeToggle = document.getElementById('displayTileTypes');
  if (typeToggle) {
    typeToggle.addEventListener('change', () => {
      renderTexturePalette();
    });
  }
  heightInput = document.getElementById('heightValueInput');
  heightSlider = document.getElementById('heightSlider');
  if (heightInput && heightSlider) {
    const heightValueLabel = document.getElementById('heightValueLabel');
    const getHeightValueMin = () => (heightBrushAction === 'raise' || heightBrushAction === 'lower') ? 1 : 0;
    const refreshHeightValueMode = () => {
      const min = getHeightValueMin();
      if (heightValueLabel) heightValueLabel.textContent = min === 1 ? 'By' : 'Height';
      heightInput.min = String(min);
      heightSlider.min = String(min);
      const firstPreset = document.querySelector('.height-preset[data-val="0"], .height-preset[data-val="1"]');
      if (firstPreset) {
        firstPreset.setAttribute('data-val', String(min));
        firstPreset.textContent = String(min);
      }
      if ((parseInt(heightInput.value, 10) || 0) < min) syncHeightControls(min);
    };
    selectedHeight = parseInt(heightInput.value, 10) || 0;
    const syncHeightControls = (val) => {
      const clamped = Math.max(getHeightValueMin(), Math.min(heightMax, val));
      selectedHeight = clamped;
      heightInput.value = clamped;
      heightSlider.value = clamped;
    };
    heightInput.addEventListener('change', () => {
      const val = parseInt(heightInput.value, 10);
      if (!isNaN(val)) syncHeightControls(val);
    });
    heightSlider.addEventListener('input', () => {
      const val = parseInt(heightSlider.value, 10);
      syncHeightControls(val);
    });
    document.querySelectorAll('.height-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.getAttribute('data-val'), 10);
        if (!isNaN(val)) syncHeightControls(val);
      });
    });
    refreshHeightValueMode();
    window.refreshHeightValueMode = refreshHeightValueMode;
  }
  const sizeXInput = document.getElementById('sizeXInput');
  const sizeYInput = document.getElementById('sizeYInput');
  const sizeXSlider = document.getElementById('sizeXSlider');
  const sizeYSlider = document.getElementById('sizeYSlider');
  const applySizeBtn = document.getElementById('applySizeBtn');
  const resetSizeBtn = document.getElementById('resetSizeBtn');
  if (applySizeBtn && resetSizeBtn && sizeXInput && sizeYInput && sizeXSlider && sizeYSlider) {
    const updateApplyBtn = () => {
      const w = parseInt(sizeXInput.value, 10);
      const h = parseInt(sizeYInput.value, 10);
      applySizeBtn.disabled = (w === mapW && h === mapH);
    };
    const syncX = (val) => {
      const clamped = Math.max(1, Math.min(255, val));
      sizeXInput.value = clamped;
      sizeXSlider.value = clamped;
      updateApplyBtn();
    };
    const syncY = (val) => {
      const clamped = Math.max(1, Math.min(255, val));
      sizeYInput.value = clamped;
      sizeYSlider.value = clamped;
      updateApplyBtn();
    };
    syncX(mapW);
    syncY(mapH);
    sizeXInput.addEventListener('input', () => {
      const val = parseInt(sizeXInput.value, 10);
      if (!isNaN(val)) syncX(val);
    });
    sizeXSlider.addEventListener('input', () => {
      const val = parseInt(sizeXSlider.value, 10);
      syncX(val);
    });
    sizeYInput.addEventListener('input', () => {
      const val = parseInt(sizeYInput.value, 10);
      if (!isNaN(val)) syncY(val);
    });
    sizeYSlider.addEventListener('input', () => {
      const val = parseInt(sizeYSlider.value, 10);
      syncY(val);
    });
    resetSizeBtn.addEventListener('click', () => {
      syncX(mapW);
      syncY(mapH);
    });
    applySizeBtn.addEventListener('click', () => {
      const newW = parseInt(sizeXInput.value, 10);
      const newH = parseInt(sizeYInput.value, 10);
      if (!isNaN(newW) && !isNaN(newH) && newW > 0 && newH > 0 && newW <= 255 && newH <= 255) {
        resizeMap(newW, newH);
        updateApplyBtn();
      }
    });
  }
  threeContainer.addEventListener('mousemove', handleMouseMove);
  threeContainer.addEventListener('pointermove', handleContinuousBrushMove);
  window.addEventListener('pointermove', handleContinuousBrushMove);
  window.addEventListener('mousemove', handleContinuousBrushMove);
  threeContainer.addEventListener('mouseleave', () => {
    const hasHeightSelection = heightSelectionMode && heightSelectStart && heightSelectEnd;
    const hasHeightPaste = isTileTemplatePasteMode() && activeTab === 'height';
    const hasHeightViewSelection = !hasHeightPaste && heightViewMode && (heightViewTile || (heightSelectStart && heightSelectEnd));
    const hasTileSelection = (tileSelectionMode || tileViewMode) && tileSelectStart && tileSelectEnd;
    if (highlightMesh && scene && !hasHeightSelection && !hasHeightViewSelection && !hasTileSelection) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    if (previewGroup && scene && !hasHeightViewSelection && !hasTileSelection) {
      previewGroup.traverse(child => {
        if (child.isMesh) {
          if (child.material && child.material.map) child.material.map.dispose();
          if (child.material) child.material.dispose();
          if (child.geometry) child.geometry.dispose();
        }
      });
      scene.remove(previewGroup);
      previewGroup = null;
    }
    clearHoveredStructure();
    clearHoveredDroid();
  });
  const droidPlayerSelect = document.getElementById('droidPlayerSelect');
  const structureBuildPlayerSelect = document.getElementById('structureBuildPlayerSelect');
  populateDroidTemplateSelect();
  loadComponentDefs().then(() => {
    populateDroidTemplateSelect();
    populateDroidDesignerControls();
  });
  const droidTemplateSelect = document.getElementById('droidTemplateSelect');
  const droidSearch = document.getElementById('droidSearch');
  if (droidTemplateSelect) {
    droidTemplateSelect.addEventListener('change', () => {
      const preset = getDroidTemplateById(droidTemplateSelect.value);
      if (preset) setDroidDesignerParts(preset);
      updateDroidPreview();
    });
  }
  if (droidSearch) {
    droidSearch.addEventListener('input', () => {
      populateDroidTemplateSelect();
      populateDroidDesignerControls();
      updateDroidPreview();
    });
  }
  const droidShowScavengers = document.getElementById('droidShowScavengers');
  if (droidShowScavengers) {
    droidShowScavengers.addEventListener('change', () => {
      populateDroidTemplateSelect();
      populateDroidDesignerControls();
      updateDroidPreview();
    });
  }
  ['droidBodySelect', 'droidPropulsionSelect', 'droidWeaponSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      if (id === 'droidBodySelect') populateDroidPartOptionsForBody(el.value);
      if (id === 'droidPropulsionSelect') populateDroidWeaponOptions(document.getElementById('droidBodySelect')?.value, el.value);
      syncDroidTemplateFromParts();
    });
  });
  populatePlayerSelect(droidPlayerSelect);
  populatePlayerSelect(structureBuildPlayerSelect);
  const droidRotationInput = document.getElementById('droidRotationInput');
  const syncDroidRotationInput = () => {
    selectedDroidRotation = normalizeDegrees(droidRotationInput ? droidRotationInput.value : selectedDroidRotation);
    if (selectedDroidGroup) setDroidRotationDegrees(selectedDroidGroup, selectedDroidRotation);
    updateDroidPreview();
    if (lastMouseEvent) updateHighlight(lastMouseEvent);
  };
  if (droidRotationInput) {
    droidRotationInput.value = String(selectedDroidRotation);
    droidRotationInput.addEventListener('input', syncDroidRotationInput);
    droidRotationInput.addEventListener('change', syncDroidRotationInput);
  }
  const droidRotateLeft = document.getElementById('droidRotateLeft');
  const droidRotateRight = document.getElementById('droidRotateRight');
  if (droidRotateLeft) {
    droidRotateLeft.addEventListener('click', () => {
      selectedDroidRotation = normalizeDegrees(selectedDroidRotation + 90);
      if (droidRotationInput) droidRotationInput.value = String(selectedDroidRotation);
      if (selectedDroidGroup) setDroidRotationDegrees(selectedDroidGroup, selectedDroidRotation);
      updateDroidPreview();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  if (droidRotateRight) {
    droidRotateRight.addEventListener('click', () => {
      selectedDroidRotation = normalizeDegrees(selectedDroidRotation - 90);
      if (droidRotationInput) droidRotationInput.value = String(selectedDroidRotation);
      if (selectedDroidGroup) setDroidRotationDegrees(selectedDroidGroup, selectedDroidRotation);
      updateDroidPreview();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  if (droidPlayerSelect) {
    droidPlayerSelect.addEventListener('change', () => {
      if (selectedDroidGroup) setDroidPlayer(selectedDroidGroup, droidPlayerSelect.value);
      updateDroidPreview();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  const droidViewPlayerSelect = document.getElementById('droidViewPlayerSelect');
  if (droidViewPlayerSelect) {
    droidViewPlayerSelect.addEventListener('change', () => {
      if (selectedDroidGroup) setDroidPlayer(selectedDroidGroup, droidViewPlayerSelect.value);
    });
  }
  document.querySelectorAll('[data-droid-mode]').forEach(btn => {
    btn.addEventListener('click', () => setDroidMode(btn.getAttribute('data-droid-mode')));
  });
  const droidViewDeleteBtn = document.getElementById('droidViewDeleteBtn');
  if (droidViewDeleteBtn) {
    droidViewDeleteBtn.addEventListener('click', deleteSelectedDroidViewObject);
  }
  updateDroidModeUI();
  setTileset(tilesetIndex);
  const structureSelect = document.getElementById('structureSelect');
  const structureFilter = document.getElementById('structureFilter');
  const structureSearch = document.getElementById('structureSearch');
  document.querySelectorAll('[data-structure-mode]').forEach(btn => {
    btn.addEventListener('click', () => setStructureMode(btn.getAttribute('data-structure-mode')));
  });
  updateStructureModeUI();
  const structurePlayerSelect = document.getElementById('structurePlayerSelect');
  if (structurePlayerSelect) {
    structurePlayerSelect.addEventListener('change', () => {
      if (selectedStructureGroup) setStructurePlayer(selectedStructureGroup, structurePlayerSelect.value);
    });
  }
  if (structureBuildPlayerSelect) {
    structureBuildPlayerSelect.addEventListener('change', () => {
      updateStructurePreview();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  const structureRotationInput = document.getElementById('structureRotationInput');
  const structureViewRotateLeft = document.getElementById('structureViewRotateLeft');
  const structureViewRotateRight = document.getElementById('structureViewRotateRight');
  if (structureRotationInput) {
    const applyStructureRotationInput = () => {
      if (selectedStructureGroup) setStructureRotationDegrees(selectedStructureGroup, structureRotationInput.value);
    };
    structureRotationInput.addEventListener('input', applyStructureRotationInput);
    structureRotationInput.addEventListener('change', applyStructureRotationInput);
  }
  if (structureViewRotateLeft) {
    structureViewRotateLeft.addEventListener('click', () => {
      if (selectedStructureGroup) setStructureRotationDegrees(selectedStructureGroup, getStructureRotationDegrees(selectedStructureGroup) + 90);
    });
  }
  if (structureViewRotateRight) {
    structureViewRotateRight.addEventListener('click', () => {
      if (selectedStructureGroup) setStructureRotationDegrees(selectedStructureGroup, getStructureRotationDegrees(selectedStructureGroup) - 90);
    });
  }
  const structureViewDeleteBtn = document.getElementById('structureViewDeleteBtn');
  if (structureViewDeleteBtn) {
    structureViewDeleteBtn.addEventListener('click', deleteSelectedStructureViewObject);
  }
  const structureViewAddModuleBtn = document.getElementById('structureViewAddModuleBtn');
  if (structureViewAddModuleBtn) {
    structureViewAddModuleBtn.addEventListener('click', async () => {
      const group = selectedStructureGroup;
      const parentDef = getStructureGroupDef(group);
      const moduleDef = getModuleDefForParent(parentDef);
      const footprint = getStructureFootprint(group);
      if (!group || !moduleDef || !footprint) return;
      const newGroup = await applyStructureModulePlacement(moduleDef, group, footprint.x, footprint.y, footprint.sizeX, footprint.sizeY);
      if (newGroup) selectStructureGroup(newGroup);
    });
  }
  if (structureSelect) {
    structureSelect.addEventListener('change', () => {
      const val = parseInt(structureSelect.value, 10);
      selectedStructureIndex = isNaN(val) ? -1 : val;
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
      selectedStructureRotation = 0;
      updateStructurePreview();
    });
  }
  if (structureFilter) {
    populateStructureFilter();
    structureFilter.addEventListener('change', () => {
      populateStructureSelect();
    });
  }
  if (structureSearch) {
    structureSearch.addEventListener('input', () => {
      populateStructureSelect();
    });
  }
  if (structureSelect) {
    loadSensorDefs().then(() => loadStructureDefs());
  } else {
    loadSensorDefs();
  }
  const sRotLeft = document.getElementById('structRotateLeft');
  const sRotRight = document.getElementById('structRotateRight');
  if (sRotLeft) {
    sRotLeft.addEventListener('click', () => {
      selectedStructureRotation = (selectedStructureRotation + 1) % 4;
      updateStructurePreview();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  if (sRotRight) {
    sRotRight.addEventListener('click', () => {
      selectedStructureRotation = (selectedStructureRotation + 3) % 4;
      updateStructurePreview();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  const featureSelect = document.getElementById('featureSelect');
  const featureFilter = document.getElementById('featureFilter');
  const featureSearch = document.getElementById('featureSearch');
  document.querySelectorAll('[data-feature-mode]').forEach(btn => {
    btn.addEventListener('click', () => setFeatureMode(btn.getAttribute('data-feature-mode')));
  });
  updateFeatureModeUI();
  if (featureSelect) {
    featureSelect.addEventListener('change', () => {
      const val = parseInt(featureSelect.value, 10);
      selectedFeatureIndex = isNaN(val) ? -1 : val;
      selectedFeatureRotation = 0;
      updateFeaturePreview();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  if (featureFilter) {
    populateFeatureFilter();
    featureFilter.addEventListener('change', () => {
      populateFeatureSelect();
    });
  }
  if (featureSearch) {
    featureSearch.addEventListener('input', () => {
      populateFeatureSelect();
    });
  }
  if (featureSelect) loadFeatureDefs();
  const featureRotateLeft = document.getElementById('featureRotateLeft');
  const featureRotateRight = document.getElementById('featureRotateRight');
  if (featureRotateLeft) {
    featureRotateLeft.addEventListener('click', () => {
      selectedFeatureRotation = (selectedFeatureRotation + 1) % 4;
      updateFeaturePreview();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  if (featureRotateRight) {
    featureRotateRight.addEventListener('click', () => {
      selectedFeatureRotation = (selectedFeatureRotation + 3) % 4;
      updateFeaturePreview();
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
  }
  const featureViewDeleteBtn = document.getElementById('featureViewDeleteBtn');
  if (featureViewDeleteBtn) {
    featureViewDeleteBtn.addEventListener('click', deleteSelectedFeatureViewObject);
  }
  const previewDiv = document.getElementById('structurePreview');
  if (previewDiv) {
    const width = previewDiv.clientWidth;
    const height = previewDiv.clientHeight;
    previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    previewRenderer.setSize(width, height);
    previewRenderer.setClearColor(0x151e28, 0);
    previewDiv.appendChild(previewRenderer.domElement);
    previewScene = new THREE.Scene();
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    previewScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(10, 20, 10);
    previewScene.add(dirLight);
    previewCamera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    previewCamera.position.set(2.5, 2, 2.5);
    previewCamera.lookAt(0, 0, 0);
    const renderPreview = () => {
      if (previewRenderer && previewScene && previewCamera) {
        previewRenderer.render(previewScene, previewCamera);
      }
      requestAnimationFrame(renderPreview);
    };
    renderPreview();
    updateStructurePreview();
  }
  const featurePreviewDiv = document.getElementById('featurePreview');
  if (featurePreviewDiv) {
    const width = featurePreviewDiv.clientWidth || 160;
    const height = featurePreviewDiv.clientHeight || 160;
    featurePreviewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    featurePreviewRenderer.setSize(width, height);
    featurePreviewRenderer.setClearColor(0x151e28, 0);
    featurePreviewDiv.appendChild(featurePreviewRenderer.domElement);
    featurePreviewScene = new THREE.Scene();
    featurePreviewScene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const featureDirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    featureDirLight.position.set(10, 20, 10);
    featurePreviewScene.add(featureDirLight);
    featurePreviewCamera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    featurePreviewCamera.position.set(2.5, 2, 2.5);
    featurePreviewCamera.lookAt(0, 0, 0);
    const renderFeaturePreview = () => {
      if (featurePreviewRenderer && featurePreviewScene && featurePreviewCamera) {
        featurePreviewRenderer.render(featurePreviewScene, featurePreviewCamera);
      }
      requestAnimationFrame(renderFeaturePreview);
    };
    renderFeaturePreview();
    updateFeaturePreview();
  }
  const droidPreviewDiv = document.getElementById('droidPreview');
  if (droidPreviewDiv) {
    const width = droidPreviewDiv.clientWidth || 160;
    const height = droidPreviewDiv.clientHeight || 180;
    droidPreviewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    droidPreviewRenderer.setSize(width, height);
    droidPreviewRenderer.setClearColor(0x151e28, 0);
    droidPreviewDiv.appendChild(droidPreviewRenderer.domElement);
    droidPreviewScene = new THREE.Scene();
    droidPreviewScene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const droidDirLight = new THREE.DirectionalLight(0xffffff, 0.65);
    droidDirLight.position.set(8, 14, 8);
    droidPreviewScene.add(droidDirLight);
    droidPreviewCamera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    droidPreviewCamera.position.set(2, 2, 2);
    droidPreviewCamera.lookAt(0, 0, 0);
    const renderDroidPreview = () => {
      if (droidPreviewRenderer && droidPreviewScene && droidPreviewCamera) {
        updateDroidAnimations(droidPreviewScene, performance.now());
        droidPreviewRenderer.render(droidPreviewScene, droidPreviewCamera);
      }
      requestAnimationFrame(renderDroidPreview);
    };
    renderDroidPreview();
    updateDroidPreview();
  }
  if (threeContainer) {
    // Use pointerdown so map edits respond immediately on mouse1.
    threeContainer.addEventListener('pointerdown', handleMapPointerDown);
    threeContainer.addEventListener('mousedown', handleContinuousBrushMouseDown);
    threeContainer.addEventListener('contextmenu', handleMapContextMenu);
    window.addEventListener('pointerup', handleMapPointerUp);
    window.addEventListener('mouseup', handleMapPointerUp);
  }
};

function handleMapPointerDown(event) {
  if (event.button === 2 && cancelShortcutAction()) {
    event.preventDefault();
    event.stopPropagation();
    suppressNextMapContextMenu = true;
    return;
  }
  if (isTileTemplatePasteMode() && event.button === 0) {
    event.preventDefault();
    pasteTileTemplateFromEvent(event);
    return;
  }
  if (activeTab === 'textures' && tileViewMode && event.button === 0) {
    beginViewAreaDrag(event);
    return;
  }
  if (activeTab === 'height' && heightViewMode && event.button === 0) {
    beginViewAreaDrag(event);
    return;
  }
  if (isCopiedMapObjectPasteMode() && event.button === 0) {
    event.preventDefault();
    pasteCopiedMapObjectFromEvent(event);
    return;
  }
  if (isBulkSelectionViewMode() && event.button === 0) {
    beginViewAreaDrag(event);
    return;
  }
  if (beginContinuousBrush(event)) {
    return;
  }
  handleEditClick(event);
}

function handleMapPointerUp(event) {
  if (event.button === 0 && tileViewDrag) {
    finishTileViewSelectionDrag(event);
    return;
  }
  if (event.button === 0 && viewAreaDrag) finishViewAreaDrag(event);
  if (isContinuousBrushRelease(event)) endContinuousBrush();
}

function handleMapContextMenu(event) {
  if (suppressNextMapContextMenu) {
    suppressNextMapContextMenu = false;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (isCopiedMapObjectPasteMode()) {
    event.preventDefault();
    event.stopPropagation();
    cancelCopiedMapObjectPaste();
    return;
  }
  if (isTileTemplatePasteMode()) {
    event.preventDefault();
    event.stopPropagation();
    cancelTileTemplatePaste();
    return;
  }
  if (cancelShortcutAction()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (rightClickAction === 'browser') return;
  event.preventDefault();
  event.stopPropagation();
}

async function placeDroidAtTile(tileX, tileY) {
  await loadComponentDefs();
  const playerSelect = document.getElementById('droidPlayerSelect');
  const player = playerSelect ? playerSelect.value : 0;
  const design = getSelectedDroidDesign();
  const entry = makeDroidEntry(design, player, tileX, tileY, selectedDroidRotation);
  const pieList = getDroidPieList(entry);
  let group;
  if (pieList && pieList.length) {
    group = await buildDroidGroup(pieList);
  } else {
    const geom = new THREE.ConeGeometry(0.3, 0.6, 4);
    const mat = new THREE.MeshLambertMaterial({ color: PLAYER_COLORS[entry.startpos % PLAYER_COLORS.length] });
    group = new THREE.Mesh(geom, mat);
    group.userData.centerX = 0;
    group.userData.centerZ = 0;
    group.userData.minY = -0.3;
  }
  const h = (mapHeights?.[tileY]?.[tileX] ?? 0) * HEIGHT_SCALE + 0.07;
  const cX = group.userData.centerX || 0;
  const cZ = group.userData.centerZ || 0;
  const minY = group.userData.minY || 0;
  group.position.set(tileX + 0.5 - cX, h - minY, tileY + 0.5 - cZ);
  group.rotation.y = -selectedDroidRotation * Math.PI / 180;
  group.userData.droidExport = entry;
  currentDroidEntries.push(entry);
  objectsGroup.add(group);
  if (!scene.children.includes(objectsGroup)) scene.add(objectsGroup);
  refreshObjectPreviewLayer();
  setFileStatus('Placed ' + entry.name + ' for player ' + entry.startpos + '.');
  return group;
}

function getMinTerrainHeight(tileX, tileY, sizeX, sizeY) {
  let minH = Infinity;
  for (let dy = 0; dy < sizeY; dy++) {
    for (let dx = 0; dx < sizeX; dx++) {
      const tx = tileX + dx;
      const ty = tileY + dy;
      if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) continue;
      const h = mapHeights[ty][tx] * HEIGHT_SCALE;
      if (h < minH) minH = h;
    }
  }
  return isFinite(minH) ? minH : 0;
}

async function applyStructureModulePlacement(moduleDef, parentGroup, tileX, tileY, sizeX, sizeY) {
  const parentDef = getStructureGroupDef(parentGroup);
  const data = parentGroup?.userData?.structureExport || {};
  if (!parentDef || !data) return null;
  const nextCount = getStructureModuleCount(parentGroup) + 1;
  const rot = data.rot || 0;
  const rotDeg = getStructureRotationDegrees(parentGroup);
  const renderDef = getStructureRenderDef(parentDef, nextCount);
  const newGroup = await buildStructureGroup(renderDef, rot, sizeX, sizeY);
  const minH = getMinTerrainHeight(tileX, tileY, sizeX, sizeY);
  newGroup.position.copy(getStructurePlacementPosition(newGroup, tileX, tileY, sizeX, sizeY, minH));
  const sourceEntry = data.sourceEntry && typeof data.sourceEntry === 'object'
    ? { ...data.sourceEntry, modules: nextCount }
    : { modules: nextCount };
  markStructureForExport(newGroup, parentDef, rot, sizeX, sizeY, sourceEntry, data.style || currentStructJsonStyle);
  setStructurePlayer(newGroup, getStructurePlayer(parentGroup));
  setStructureModuleCount(newGroup, nextCount);
  setStructureRotationDegrees(newGroup, rotDeg);
  if (replaceStructureGroup(parentGroup, newGroup)) {
    pushUndo({ type: 'structure-replace', oldGroup: parentGroup, newGroup });
    setFileStatus('Added ' + (moduleDef.name || 'module') + ' to ' + (parentDef.name || parentDef.id) + ' (' + nextCount + ' module' + (nextCount === 1 ? '' : 's') + ').');
    return newGroup;
  }
  return null;
}

async function removeTopStructureModule(parentGroup) {
  const parentDef = getStructureGroupDef(parentGroup);
  const data = parentGroup?.userData?.structureExport || {};
  const moduleCount = getStructureModuleCount(parentGroup);
  if (!parentDef || moduleCount < 1) return null;
  const footprint = getStructureFootprint(parentGroup);
  if (!footprint) return null;
  const nextCount = moduleCount - 1;
  const rot = data.rot || 0;
  const rotDeg = getStructureRotationDegrees(parentGroup);
  const newGroup = await buildStructureGroup(getStructureRenderDef(parentDef, nextCount), rot, footprint.sizeX, footprint.sizeY);
  const minH = getMinTerrainHeight(footprint.x, footprint.y, footprint.sizeX, footprint.sizeY);
  newGroup.position.copy(getStructurePlacementPosition(newGroup, footprint.x, footprint.y, footprint.sizeX, footprint.sizeY, minH));
  const sourceEntry = data.sourceEntry && typeof data.sourceEntry === 'object'
    ? { ...data.sourceEntry, modules: nextCount }
    : { modules: nextCount };
  if (nextCount < 1) delete sourceEntry.modules;
  markStructureForExport(newGroup, parentDef, rot, footprint.sizeX, footprint.sizeY, sourceEntry, data.style || currentStructJsonStyle);
  setStructurePlayer(newGroup, getStructurePlayer(parentGroup));
  setStructureModuleCount(newGroup, nextCount);
  setStructureRotationDegrees(newGroup, rotDeg);
  if (!replaceStructureGroup(parentGroup, newGroup)) return null;
  pushUndo({ type: 'structure-replace', oldGroup: parentGroup, newGroup });
  setFileStatus('Removed one module from ' + (parentDef.name || parentDef.id) + ' (' + nextCount + ' remaining).');
  return newGroup;
}

async function handleEditClick(event) {
  if (activeTab !== 'view' && activeTab !== 'textures' && activeTab !== 'height' && activeTab !== 'objects' && activeTab !== 'droids' && activeTab !== 'features' && activeTab !== 'templates') return;
  if (event.button !== undefined && event.button !== 0) return;
  if (activeTab === 'view') {
    updateViewSelectionInfo(event);
    return;
  }
  if (activeTab === 'templates') {
    lastMouseEvent = event;
    if (isTileTemplatePasteMode()) {
      pasteTileTemplateFromEvent(event);
      return;
    }
    pasteSelectedStructureTemplateAtMouse();
    return;
  }
  if (activeTab === 'objects' && structureMode !== 'build') {
    if (structureMode === 'view' && routeMapObjectSelection(event)) return;
    const group = pickStructureFromEvent(event, false);
    if (structureMode === 'view') {
      selectStructureGroup(group);
    } else if (structureMode === 'delete' && group) {
      if (getStructureModuleCount(group) > 0) {
        await removeTopStructureModule(group);
      } else {
        const action = await removeStructureGroupWithWallRefresh(group);
        if (action) pushUndo(action);
      }
    }
    return;
  }
  if (activeTab === 'features' && featureMode !== 'build') {
    if (featureMode === 'view' && routeMapObjectSelection(event)) return;
    const group = pickFeatureFromEvent(event);
    if (featureMode === 'view') {
      selectFeatureGroup(group);
    } else if (featureMode === 'delete' && group) {
      if (removeStructureGroup(group)) pushUndo({ type: 'structure-delete', group });
      updateFeatureInfo(null, 'No object selected.');
      updateFeatureModeUI();
    }
    return;
  }
  if (activeTab === 'droids' && droidMode !== 'build') {
    if (droidMode === 'view' && routeMapObjectSelection(event)) return;
    const group = pickDroidFromEvent(event);
    if (droidMode === 'view') {
      selectDroidGroup(group);
    } else if (droidMode === 'delete' && group) {
      if (removeDroidGroup(group)) pushUndo({ type: 'droid-delete', group });
    }
    return;
  }
  const rect = threeContainer.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  if (!intersects.length) return;
  const point = intersects[0].point;
  const tileX = Math.floor(point.x);
  const tileY = Math.floor(point.z);
  if (tileX < 0 || tileX >= mapW || tileY < 0 || tileY >= mapH) return;
  if (activeTab === 'height' && heightSelectionMode) {
    lastMouseEvent = event;
    if (!heightSelectStart || heightSelectEnd) {
      heightSelectStart = { x: tileX, y: tileY };
      heightSelectEnd = null;
    } else {
      heightSelectEnd = { x: tileX, y: tileY };
    }
    updateHighlight(event);
    updateHeightApplyBtn();
    return;
  }
  if (activeTab === 'textures') {
    if (tileViewMode) {
      updateTileViewInfoAt(tileX, tileY);
      updateHighlight(event);
      return;
    }
    if (tileSelectionMode) {
      lastMouseEvent = event;
      if (!tileSelectStart || tileSelectionFixed) {
        tileSelectStart = { x: tileX, y: tileY };
        tileSelectEnd = { x: tileX, y: tileY };
        tileSelectionFixed = false;
      } else {
        tileSelectEnd = { x: tileX, y: tileY };
        tileSelectionFixed = true;
      }
      updateHighlight(event);
      updateTileApplyBtn();
      return;
    }
    if (!tileBrushMode) return;
    let __needsRedrawTex = false;
    const changes = [];
    const brushCells = getTileBrushCells(tileX, tileY);
    const plannedCells = new Set(brushCells.map(cell => cell.x + ',' + cell.y));
    let refreshCells = brushCells;
    let protectedSmartCells = null;
    if (tileBrushRoads) {
      if (paintRoadPrimaryCells(brushCells, plannedCells, changes)) __needsRedrawTex = true;
      const roadExtraTerrain = paintRoadExtraTerrainAroundCells(brushCells, changes);
      if (roadExtraTerrain.changed) __needsRedrawTex = true;
      if (paintRoadPrimaryCells(brushCells, plannedCells, changes)) __needsRedrawTex = true;
      refreshCells = roadExtraTerrain.cells.length ? brushCells.concat(roadExtraTerrain.cells) : brushCells;
    } else if (tileBrushWater) {
      const waterCells = getWaterBrushCells(brushCells);
      if (paintWaterCells(waterCells, changes)) __needsRedrawTex = true;
      const waterTileId = getWaterFallbackTileId();
      const smartConnectors = paintSmartConnectorsAroundCells(waterCells, changes, waterTileId);
      if (smartConnectors.changed) __needsRedrawTex = true;
      refreshCells = smartConnectors.cells.length ? waterCells.concat(smartConnectors.cells) : waterCells;
      protectedSmartCells = smartConnectors.protectedCells;
    } else {
      brushCells.forEach(cell => {
        const tx = cell.x;
        const ty = cell.y;
        if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH) {
          const choice = getTileBrushPaintChoice(tx, ty, plannedCells);
          const newTile = choice.tile;
          const newRot = choice.rot;
          if (recordTileBrushChange(changes, tx, ty, newTile, newRot, choice.xFlip, choice.yFlip, choice.triFlip)) __needsRedrawTex = true;
        }
      });
      if (tileBrushSmartTiles) {
        const smartConnectors = paintSmartConnectorsAroundCells(brushCells, changes);
        if (smartConnectors.changed) __needsRedrawTex = true;
        refreshCells = smartConnectors.cells.length ? brushCells.concat(smartConnectors.cells) : brushCells;
        protectedSmartCells = smartConnectors.protectedCells;
      }
    }
    if (refreshRoadTilesAroundCells(refreshCells, changes)) __needsRedrawTex = true;
    if (tileBrushRoads) {
      const roadWaterCells = getRoadChangedWaterCells(changes);
      const plannedWaterCells = roadWaterCells.length
        ? new Set(roadWaterCells.map(cell => cell.x + ',' + cell.y))
        : null;
      if (plannedWaterCells) {
        roadWaterCells.forEach(cell => {
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const x = cell.x + dx;
              const y = cell.y + dy;
              if (x >= 0 && x < mapW && y >= 0 && y < mapH && getTileRoadFamily(mapTiles[y]?.[x])) {
                plannedWaterCells.add(x + ',' + y);
              }
            }
          }
        });
      }
      if (roadWaterCells.length && refreshSmartWaterTilesAroundCells(roadWaterCells, changes, protectedSmartCells, true, 2, plannedWaterCells, true)) __needsRedrawTex = true;
    } else if (refreshSmartWaterTilesAroundCells(refreshCells, changes, protectedSmartCells)) {
      __needsRedrawTex = true;
    }
    if (changes.length) pushUndo({ type: 'tiles', changes });
    if (__needsRedrawTex) {
      if (continuousBrushPainting) scheduleContinuousBrushRedraw();
      else requestTerrainRedraw();
    }
  } else if (activeTab === 'height' && heightBrushMode) {
    let __needsRedrawHeight = false;
    const changes = [];
    const heightSource = heightBrushAction === 'smooth'
      ? mapHeights.map(row => Array.isArray(row) ? row.slice() : [])
      : mapHeights;
    getHeightBrushCells(tileX, tileY).forEach(cell => {
      const tx = cell.x;
      const ty = cell.y;
      if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH) {
        const oldHeight = mapHeights[ty][tx];
        const nextHeight = getHeightBrushValue(oldHeight, heightSource, tx, ty, event);
        const nh = Math.max(0, Math.min(heightMax, Math.round(nextHeight)));
        if (oldHeight !== nh) {
          changes.push({ x: tx, y: ty, oldHeight, newHeight: nh });
          mapHeights[ty][tx] = nh;
          __needsRedrawHeight = true;
        }
      }
    });
    if (changes.length) pushUndo({ type: 'height', changes });
    if (__needsRedrawHeight) {
      if (continuousBrushPainting) scheduleContinuousBrushRedraw();
      else requestTerrainRedraw();
    }
  } else if (activeTab === 'objects') {
    if (selectedStructureIndex < 0) return;
    const def = STRUCTURE_DEFS[selectedStructureIndex];
    let sizeX = def.sizeX || 1;
    let sizeY = def.sizeY || 1;
    if (selectedStructureRotation % 2 === 1) {
      const tmp = sizeX;
      sizeX = sizeY;
      sizeY = tmp;
    }
    if (tileX + sizeX - 1 >= mapW || tileY + sizeY - 1 >= mapH) {
      setFileStatus('Cannot place structure: structure does not fit inside the map.');
      return;
    }
    const placement = getStructurePlacementValidity(def, tileX, tileY, sizeX, sizeY);
    if (!placement.valid) {
      setFileStatus('Cannot place structure: ' + placement.reason);
      updateHighlight(event);
      return;
    }
    if (def.feature) {
      const minH = getMinTerrainHeight(tileX, tileY, sizeX, sizeY);
      buildStructureGroup(def, selectedStructureRotation, sizeX, sizeY).then(group => {
        const pos = getStructurePlacementPosition(group, tileX, tileY, sizeX, sizeY, minH);
        group.position.copy(pos);
        markFeatureForExport(group, def, tileX, tileY);
        addStructureGroup(group);
        pushUndo({ type: 'structure', group });
        lastMouseEvent = event;
        updateHighlight(event);
      }).catch(() => {});
      return;
    }
    const moduleRule = getModuleParentTypes(def);
    if (moduleRule) {
      const parentGroup = placement.parentGroup || findModuleParentForPlacement(def, { x: tileX, y: tileY, sizeX, sizeY });
      if (!parentGroup) {
        setFileStatus('Cannot place structure: Module must be placed on a matching structure.');
        updateHighlight(event);
        return;
      }
      applyStructureModulePlacement(def, parentGroup, tileX, tileY, sizeX, sizeY)
        .then(() => {
          lastMouseEvent = event;
          updateHighlight(event);
        })
        .catch(err => {
          console.error('Failed to place structure module:', err);
          setFileStatus('Failed to place module.');
        });
      return;
    }
    const player = getStructureBuildPlayer();
    const rotation = selectedStructureRotation;
    const placeStructure = async () => {
      const currentPlacement = getStructurePlacementValidity(def, tileX, tileY, sizeX, sizeY);
      if (!currentPlacement.valid) {
        setFileStatus('Cannot place structure: ' + currentPlacement.reason);
        if (lastMouseEvent) updateHighlight(lastMouseEvent);
        return;
      }
      const minH = getMinTerrainHeight(tileX, tileY, sizeX, sizeY);
      const wallShape = getWallShapeInfo(def, tileX, tileY, player, rotation);
      const buildDef = wallShape?.renderDef || def;
      const buildRot = wallShape?.rot ?? rotation;
      const group = await buildStructureGroup(buildDef, buildRot, sizeX, sizeY);
      const pos = getStructurePlacementPosition(group, tileX, tileY, sizeX, sizeY, minH);
      group.position.copy(pos);
      markStructureForExport(group, def, buildRot, sizeX, sizeY);
      setStructurePlayer(group, player);
      if (wallShape) {
        setStructureRotationDegrees(group, wallShape.rotDeg);
        group.userData.wallRenderIndex = wallShape.modelIndex;
        group.userData.wallConnectMask = wallShape.mask;
      }
      addStructureGroup(group);
      let placedGroup = group;
      const allReplacements = isWallCombiningDef(def)
        ? await refreshWallConnectionsForPlayer(player)
        : [];
      const replacements = [];
      allReplacements.forEach(item => {
        if (item.oldGroup === group) placedGroup = item.newGroup;
        else replacements.push(item);
      });
      pushUndo(replacements.length
        ? { type: 'structure-wall-batch', group: placedGroup, replacements }
        : { type: 'structure', group: placedGroup });
      lastMouseEvent = event;
      updateHighlight(event);
      if (isWallCombiningDef(def)) scheduleLiveWallConnectionRefresh();
    };
    if (isWallCombiningDef(def)) enqueueWallPlacement(placeStructure);
    else placeStructure().catch(err => {
      console.error('Failed to place structure:', err);
      setFileStatus('Failed to place structure.');
    });
  } else if (activeTab === 'features') {
    if (selectedFeatureIndex < 0) return;
    const def = FEATURE_DEFS[selectedFeatureIndex];
    let sizeX = def.sizeX || 1;
    let sizeY = def.sizeY || 1;
    if (selectedFeatureRotation % 2 === 1) {
      const tmp = sizeX;
      sizeX = sizeY;
      sizeY = tmp;
    }
    if (tileX + sizeX - 1 >= mapW || tileY + sizeY - 1 >= mapH) {
      setFileStatus('Cannot place object: object does not fit inside the map.');
      return;
    }
    const placement = getStructurePlacementValidity(def, tileX, tileY, sizeX, sizeY);
    if (!placement.valid) {
      setFileStatus('Cannot place object: ' + placement.reason);
      updateHighlight(event);
      return;
    }
    const minH = getMinTerrainHeight(tileX, tileY, sizeX, sizeY);
    buildStructureGroup(def, selectedFeatureRotation, sizeX, sizeY).then(group => {
      const pos = getStructurePlacementPosition(group, tileX, tileY, sizeX, sizeY, minH);
      group.position.copy(pos);
      markFeatureForExport(group, def, tileX, tileY, null, selectedFeatureRotation);
      addStructureGroup(group);
      pushUndo({ type: 'structure', group });
      setFileStatus('Placed ' + getFeatureDisplayName(def) + '.');
      lastMouseEvent = event;
      updateHighlight(event);
    }).catch(err => {
      console.error('Failed to place object:', err);
      setFileStatus('Failed to place object.');
    });
  } else if (activeTab === 'droids' && droidMode === 'build') {
    placeDroidAtTile(tileX, tileY).then(group => {
      if (group) pushUndo({ type: 'droid', group });
    }).catch(err => {
      console.error('Failed to place droid:', err);
      setFileStatus('Failed to place droid.');
    });
  }
}
function __old_updateHighlight(event) {
  if (!threeContainer || !scene) return;
  if (activeTab !== 'textures' && activeTab !== 'height' && activeTab !== 'objects') {
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    if (previewGroup) {
      previewGroup.traverse(child => {
        if (child.isMesh) {
          if (child.material && child.material.map) child.material.map.dispose();
          if (child.material) child.material.dispose();
          if (child.geometry) child.geometry.dispose();
        }
      });
      scene.remove(previewGroup);
      previewGroup = null;
    }
    return;
  }
  if (activeTab === 'height' && !heightBrushMode) {
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    return;
  }
  if (activeTab === 'textures' && !tileBrushMode) {
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    return;
  }
  let clientX, clientY;
  if (event) {
    clientX = event.clientX;
    clientY = event.clientY;
  } else {
    return;
  }
  const rect = threeContainer.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  if (!intersects.length) {
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    return;
  }
  const point = intersects[0].point;
  const tileX = Math.floor(point.x);
  const tileY = Math.floor(point.z);
  if (tileX < 0 || tileX >= mapW || tileY < 0 || tileY >= mapH) {
    if (highlightMesh) {
      scene.remove(highlightMesh);
      highlightMesh = null;
    }
    return;
  }
  if (highlightMesh) {
    scene.remove(highlightMesh);
    if (highlightMesh.geometry) highlightMesh.geometry.dispose();
    if (highlightMesh.material) highlightMesh.material.dispose();
    highlightMesh = null;
  }
  if (previewGroup) {
    previewGroup.traverse(child => {
      if (child.isMesh) {
        if (child.material && child.material.map) child.material.map.dispose();
        if (child.material) child.material.dispose();
        if (child.geometry) child.geometry.dispose();
      }
    });
    scene.remove(previewGroup);
    previewGroup = null;
  }
  if (activeTab === 'textures') {
    highlightMesh = createTerrainCellHighlightMesh(getTileBrushPreviewCells(tileX, tileY), 0xffff00, 0.3);
    scene.add(highlightMesh);
  } else if (activeTab === 'height') {
    highlightMesh = createTerrainCellHighlightMesh(getHeightBrushCells(tileX, tileY), 0x6CF527, 0.38, 0.055);
    scene.add(highlightMesh);
  } else if (activeTab === 'objects') {
    if (selectedStructureIndex < 0) return;
    const def = STRUCTURE_DEFS[selectedStructureIndex];
    let sizeX = def.sizeX || 1;
    let sizeY = def.sizeY || 1;
    if (selectedStructureRotation % 2 === 1) {
      const tmpXY = sizeX;
      sizeX = sizeY;
      sizeY = tmpXY;
    }
    let maxH2 = 0;
    for (let dy = 0; dy < sizeY; dy++) {
      for (let dx = 0; dx < sizeX; dx++) {
        const tx = tileX + dx;
        const ty = tileY + dy;
        if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH) {
          const h = mapHeights[ty][tx] * HEIGHT_SCALE;
          if (h > maxH2) maxH2 = h;
        }
      }
    }
    const newGroup = new THREE.Group();
    const planeGeo = new THREE.PlaneGeometry(sizeX, sizeY);
    planeGeo.rotateX(-Math.PI / 2);
    const planeMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const planeMesh = new THREE.Mesh(planeGeo, planeMat);
    planeMesh.position.set(tileX + sizeX / 2, maxH2 + 0.02, tileY + sizeY / 2);
    highlightMesh = planeMesh;
    newGroup.add(planeMesh);
    const currentToken = ++highlightLoadToken;
    const pieFile = (def.pies && def.pies.length) ? def.pies[0] : null;
    const repositionPreview = () => {
      if (!highlightModelGroup) return;
      const cX = highlightModelGroup.userData.centerX;
      const cZ = highlightModelGroup.userData.centerZ;
      const minYVal = highlightModelGroup.userData.minY;
      const pX = tileX + sizeX / 2 - cX;
      // Slightly raise preview to keep floor tiles above the terrain
      const pY = maxH2 + 0.02 - minYVal;
      const pZ = tileY + sizeY / 2 - cZ;
      highlightModelGroup.position.set(pX + cX, pY, pZ + cZ);
    };
    if (!pieFile) {
      previewGroup = newGroup;
      scene.add(previewGroup);
    } else if (highlightModelGroup && highlightCachedId === def.id && highlightCachedRot === selectedStructureRotation) {
      repositionPreview();
      previewGroup = newGroup;
      scene.add(previewGroup);
      if (!scene.children.includes(highlightModelGroup)) scene.add(highlightModelGroup);
    } else if (highlightLoadingId === def.id && highlightLoadingRot === selectedStructureRotation) {
      previewGroup = newGroup;
      scene.add(previewGroup);
    } else {
      highlightLoadingId = def.id;
      highlightLoadingRot = selectedStructureRotation;
      if (highlightModelGroup) {
        scene.remove(highlightModelGroup);
        highlightModelGroup.traverse(child => {
          if (child.isMesh) {
            if (child.material && child.material.map) child.material.map.dispose();
            if (child.material) child.material.dispose();
            if (child.geometry) child.geometry.dispose();
          }
        });
        highlightModelGroup = null;
      }
      loadPieGeometry(pieFile).then(geo => {
            if (currentToken !== highlightLoadToken) return;
        const g = geo.clone();
        g.computeBoundingBox();
        const bb = g.boundingBox;
        const width = bb.max.x - bb.min.x;
        const depth = bb.max.z - bb.min.z;
        let sX = width !== 0 ? (sizeX / width) : 1;
        let sZ = depth !== 0 ? (sizeY / depth) : 1;
        let scl = Math.min(sX, sZ);
        if (!isFinite(scl) || scl <= 0) scl = 1;
        g.scale(scl, scl, scl);
        g.computeBoundingBox();
        const bb2 = g.boundingBox;
        let baseMat;
        if (g.userData && g.userData.textureName) {
          const texLoader = new THREE.TextureLoader();
          const texName = normalizeTexPath(g.userData.textureName);
          const tex = texLoader.load(((typeof window!=='undefined'&&window.TEX_BASE)?window.TEX_BASE:TEX_BASE) +  texName, undefined, undefined, () => {});
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.LinearMipMapLinearFilter;
          baseMat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.5 });
        } else {
          baseMat = new THREE.MeshPhongMaterial({ color: 0x8888ff, transparent: true, opacity: 0.5 });
        }
        const cX = (bb2.min.x + bb2.max.x) / 2;
        const cY = (bb2.min.y + bb2.max.y) / 2;
        const cZ = (bb2.min.z + bb2.max.z) / 2;
        const minYVal = bb2.min.y;
        const connRel = {
          x: 0,
          y: bb2.max.y - minYVal,
          z: 0
        };
        const inner = new THREE.Group();
        const baseMesh = new THREE.Mesh(g, baseMat);
        baseMesh.position.set(-cX, -cY, -cZ);
        inner.add(baseMesh);
        let attachments = STRUCTURE_TURRETS[def.id];
        const ecmModels = STRUCTURE_ECM_MODELS[def.ecmID] || [];
        const sensorModels = getSensorModels(def.sensorID);
        if (!attachments && ecmModels.length) {
          attachments = ecmModels;
        }
        if (!attachments && sensorModels.length) {
          attachments = sensorModels;
        }
        let loadAtts;
        if (attachments && attachments.length) {
          const sortedFiles = attachments.slice().sort((a, b) => {
                const aTur = a.toLowerCase().startsWith('tr') ? 0 : 1;
                const bTur = b.toLowerCase().startsWith('tr') ? 0 : 1;
                return aTur - bTur;
              });
          loadAtts = Promise.all(sortedFiles.map(file => loadPieGeometry(file))).then(attGeos => {
            if (currentToken !== highlightLoadToken) return;
            const gHeightVal = bb2.max.y - bb2.min.y;
            let offYVal = gHeightVal / 2;
            attGeos.forEach(attGeo => {
              const tg = attGeo.clone();
              tg.scale(scl, scl, scl);
              tg.computeBoundingBox();
              const tb = tg.boundingBox;
              let tMat;
              if (tg.userData && tg.userData.textureName) {
                const texLoader2 = new THREE.TextureLoader();
                const texName2 = normalizeTexPath(tg.userData.textureName);
                const tex2 = texLoader2.load(((typeof window!=='undefined'&&window.TEX_BASE)?window.TEX_BASE:TEX_BASE) +  texName2, undefined, undefined, () => {});
                tex2.magFilter = THREE.NearestFilter;
                tex2.minFilter = THREE.LinearMipMapLinearFilter;
                tMat = new THREE.MeshLambertMaterial({ map: tex2, transparent: true, opacity: 0.5 });
              } else {
                tMat = new THREE.MeshLambertMaterial({ color: 0x6666ff, transparent: true, opacity: 0.5 });
              }
              const tMesh = new THREE.Mesh(tg, tMat);
              if (connRel) {
                tMesh.position.set(connRel.x, connRel.y, connRel.z);
              } else {
                const tcX = (tb.min.x + tb.max.x) / 2;
                const tcZ = (tb.min.z + tb.max.z) / 2;
                const tMinY = tb.min.y;
                tMesh.position.set(-tcX, offYVal - tMinY, -tcZ);
                offYVal += (tb.max.y - tb.min.y);
              }
              inner.add(tMesh);
            });
          }).catch(() => {});
        } else {
          loadAtts = Promise.resolve();
        }
        Promise.resolve(loadAtts).then(() => {
            if (currentToken !== highlightLoadToken) return;
          const pX = tileX + sizeX / 2 - cX;
          // Slightly raise preview to keep floor tiles above the terrain
          const pY = maxH2 + 0.02 - minYVal;
          const pZ = tileY + sizeY / 2 - cZ;
          inner.position.set(pX + cX, pY, pZ + cZ);
          inner.rotation.y = -selectedStructureRotation * Math.PI / 2;
          inner.userData.centerX = cX;
          inner.userData.centerY = cY;
          inner.userData.centerZ = cZ;
          inner.userData.minY = minYVal;
          highlightModelGroup = inner;
          highlightCachedId = def.id;
          highlightCachedRot = selectedStructureRotation;
          highlightLoadingId = null;
          highlightLoadingRot = null;
          previewGroup = newGroup;
          scene.add(previewGroup);
          scene.add(highlightModelGroup);
        });
      }).catch(err => {
        console.warn('Failed to load structure preview for placement', err);
        highlightLoadingId = null;
        highlightLoadingRot = null;
        previewGroup = newGroup;
        scene.add(previewGroup);
        previewGroup.position.copy(getStructurePlacementPosition(previewGroup, tileX, tileY, sizeX, sizeY, minH));
      });
    }
  }
}
function handleMouseMove(event) {
  lastMouseEvent = event;
  releaseUiFocusForMap();
  placementPreviewPausedByCamera = false;
  if (viewAreaDrag) updateViewAreaDrag(event);
  handleContinuousBrushMove(event);
  if (updateTileViewSelectionDrag(event)) return;
  updateHighlight(event);
}

function canContinuousBrushPaint() {
  return (activeTab === 'textures' && tileBrushMode && !tileSelectionMode) ||
    (activeTab === 'height' && heightBrushMode && !heightSelectionMode);
}

function isPrimaryEditButton(event) {
  return !event || event.button === undefined || event.button === 0;
}

function isPrimaryEditButtonDown(event) {
  if (continuousBrushDown) return true;
  return !!(event && typeof event.buttons === 'number' && (event.buttons & 1));
}

function beginContinuousBrush(event) {
  if (!canContinuousBrushPaint() || !isPrimaryEditButton(event)) return false;
  continuousBrushDown = true;
  continuousBrushLastKey = null;
  continuousBrushPointerId = event?.pointerId ?? null;
  if (event?.currentTarget?.setPointerCapture && event.pointerId !== undefined) {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (err) {
      // Pointer capture is best-effort; normal mousemove fallback still paints.
    }
  }
  const painted = handleContinuousBrushPaint(event);
  if (!painted) handleEditClick(event);
  if (event?.preventDefault) event.preventDefault();
  return true;
}

function handleContinuousBrushMouseDown(event) {
  if (continuousBrushDown) return;
  beginContinuousBrush(event);
}

function isContinuousBrushRelease(event) {
  if (!continuousBrushDown) return false;
  if (!event) return true;
  if (event.pointerId !== undefined && continuousBrushPointerId !== null) {
    return event.pointerId === continuousBrushPointerId;
  }
  return event.button === undefined || event.button === 0;
}

function endContinuousBrush() {
  continuousBrushDown = false;
  continuousBrushPointerId = null;
  continuousBrushLastKey = null;
  flushContinuousBrushRedraw();
}

function scheduleContinuousBrushRedraw() {
  continuousBrushRedrawPending = true;
  if (continuousBrushRedrawTimer) return;
  continuousBrushRedrawTimer = requestAnimationFrame(() => {
    continuousBrushRedrawTimer = 0;
    if (!continuousBrushRedrawPending) return;
    continuousBrushRedrawPending = false;
    requestTerrainRedraw();
  });
}

function flushContinuousBrushRedraw() {
  if (continuousBrushRedrawTimer) {
    cancelAnimationFrame(continuousBrushRedrawTimer);
    continuousBrushRedrawTimer = 0;
  }
  if (!continuousBrushRedrawPending) return;
  continuousBrushRedrawPending = false;
  requestTerrainRedraw();
}

function handleContinuousBrushPaint(event) {
  if (!canContinuousBrushPaint()) return false;
  const tile = getMapTileFromEvent(event);
  if (!tile) return false;
  const key = [
    activeTab,
    tile.x,
    tile.y,
    brushSize,
    activeTab === 'textures' ? tileBrushShape : (activeTab === 'height' ? heightBrushShape : ''),
    activeTab === 'height' ? heightBrushAction : '',
    activeTab === 'textures' ? tileBrushSmartTiles : '',
    activeTab === 'textures' ? tileBrushRoads : '',
    activeTab === 'textures' ? tileBrushRoadFamily : '',
    activeTab === 'textures' ? tileBrushRoadExtraRadius : '',
    activeTab === 'textures' ? tileBrushWater : '',
    activeTab === 'textures' ? tileBrushWaterExtraRadius : '',
    activeTab === 'textures' ? activeSmartTilePresetKey : '',
    (activeTab === 'textures' || activeTab === 'height') ? terrainMirrorMode : '',
    activeTab === 'textures' ? selectedTileId : selectedHeight,
    activeTab === 'textures' ? selectedRotation : '',
    activeTab === 'textures' ? selectedXFlip : '',
    event.shiftKey ? 'shift' : ''
  ].join('|');
  if (key === continuousBrushLastKey) return true;
  continuousBrushLastKey = key;
  continuousBrushPainting = true;
  try {
    handleEditClick({
      button: 0,
      clientX: event.clientX,
      clientY: event.clientY,
      shiftKey: event.shiftKey
    });
  } finally {
    continuousBrushPainting = false;
  }
  return true;
}

function handleContinuousBrushMove(event) {
  if (!canContinuousBrushPaint()) return;
  if (!isPrimaryEditButtonDown(event)) {
    continuousBrushLastKey = null;
    return;
  }
  continuousBrushDown = true;
  handleContinuousBrushPaint(event);
}

function setActiveTab(tab) {
  const previousTab = activeTab;
  activeTab = tab;
  window.activeTab = activeTab;
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    const isActive = btn.getAttribute('data-tab') === tab;
    btn.classList.toggle('active', isActive);
  });
  const panels = document.querySelectorAll('#editPanel .panel');
  panels.forEach(p => { p.style.display = 'none'; });
  const panel = document.getElementById(tab + 'Panel');
  if (panel) panel.style.display = 'block';
  if (previousTab !== tab) clearViewBulkSelection();
  if (tab === 'objects') {
    if (isFeatureGroup(selectedStructureGroup)) clearSelectedStructure();
    updateStructureModeUI();
    updateStructurePreview();
  } else if (tab === 'features') {
    if (selectedStructureGroup && !isFeatureGroup(selectedStructureGroup)) clearSelectedStructure();
    updateFeatureModeUI();
    updateFeaturePreview();
  } else if (tab === 'templates') {
    clearHoveredStructure();
    clearSelectedStructure();
    refreshStructureTemplateList(false);
    refreshTileTemplateList(false);
    if (lastMouseEvent) updateHighlight(lastMouseEvent);
  } else {
    clearHoveredStructure();
    clearSelectedStructure();
  }
  if (tab === 'droids') {
    updateDroidModeUI();
    updateDroidInfo(selectedDroidGroup, 'No droid selected.');
  } else {
    clearHoveredDroid();
    clearSelectedDroid();
  }
}
window.setActiveTab = setActiveTab;
  function updateSelectedInfo() {
    const span = document.getElementById('selectedTileIdDisplay');
    if (span) {
      span.textContent = selectedTileId;
    }
    const rotSpan = document.getElementById('selectedRotationDisplay');
    if (rotSpan) {
      rotSpan.textContent = `${selectedRotation * 90}°`;
    }
    const flipBtn = document.getElementById('tileFlip');
    if (flipBtn) {
      flipBtn.classList.toggle('active', selectedXFlip);
      flipBtn.setAttribute('aria-pressed', selectedXFlip ? 'true' : 'false');
    }
    const heightRotSpan = document.getElementById('heightRotationDisplay');
    if (heightRotSpan) {
      heightRotSpan.textContent = `${selectedRotation * 90}°`;
    }
    const typeSelect = document.getElementById('tileTypeSelect');
    if (typeSelect && tileTypesById.length) {
      const typeVal = tileTypesById[selectedTileId] ?? 0;
      typeSelect.value = typeVal;
      selectedTileType = typeVal;
    typeSelect.style.color = TILE_TYPE_COLORS[typeVal % TILE_TYPE_COLORS.length] || '#888';
  }
  // Ensure the type label prefix is present
  const typeLabel = document.getElementById('selectedTileTypeLabel');
  if (typeLabel) typeLabel.textContent = 'Type:';
  // Ensure single-line + smaller font for type label
  try {
    const _lbl = document.getElementById('selectedTileTypeLabel');
    if (_lbl) {
      _lbl.style.fontSize = '12px';
      _lbl.style.whiteSpace = 'nowrap';
    }
    const _idSpan = document.getElementById('selectedTileIdDisplay');
    const _parent = _idSpan ? _idSpan.parentElement : null;
    if (_parent) {
      _parent.style.whiteSpace = 'nowrap';
    }
  } catch(e) {}
}
function updateStructurePreview() {
  const label = document.getElementById('structureNameLabel');
  if (!previewScene || !previewRenderer || !previewCamera) {
    if (label) label.textContent = '';
    return;
  }
  const previewDiv = document.getElementById('structurePreview');
  if (previewRenderer && previewDiv) {
    const w = previewDiv.clientWidth || 160;
    const h = previewDiv.clientHeight || 160;
    if (w > 0 && h > 0) {
      previewRenderer.setSize(w, h);
      previewCamera.aspect = w / h;
      previewCamera.updateProjectionMatrix();
    }
  }
  const currentToken = ++previewLoadToken;
  if (previewScene) {
    for (let i = previewScene.children.length - 1; i >= 0; i--) {
      const child = previewScene.children[i];
      if (child.isMesh || child.type === "Group") {
        previewScene.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
        if (child.children) {
          child.traverse((c) => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
          });
        }
      }
    }
    previewMesh = null;
  }
  if (selectedStructureIndex < 0) {
    if (label) label.textContent = '';
    return;
  }
  const def = STRUCTURE_DEFS[selectedStructureIndex];
  if (label) label.textContent = def.name || '';
    buildStructureGroup(def, selectedStructureRotation, def.sizeX, def.sizeY, null, 1).then(group => {
  if (currentToken !== previewLoadToken) return;
  if (!def.feature) setStructureGroupPlayerColor(group, getStructureBuildPlayer());
  group.traverse(obj => {
    if (obj.material) obj.material.transparent = true;
  });
  previewMesh = group;
  previewScene.add(previewMesh);
  const box = new THREE.Box3().setFromObject(previewMesh);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = previewCamera.fov * (Math.PI / 180);
  const cameraZ = (maxDim / 2) / Math.tan(fov / 2);
  const offset = cameraZ * 1.4;
  previewCamera.position.set(
    center.x + offset,
    center.y + offset,
    center.z + offset
  );
  previewCamera.lookAt(center);
  previewCamera.updateProjectionMatrix();
}).catch(() => {});
}

function updateFeaturePreview() {
  const label = document.getElementById('featureNameLabel');
  if (!featurePreviewScene || !featurePreviewRenderer || !featurePreviewCamera) {
    if (label) label.textContent = '';
    return;
  }
  const previewDiv = document.getElementById('featurePreview');
  if (featurePreviewRenderer && previewDiv) {
    const w = previewDiv.clientWidth || 160;
    const h = previewDiv.clientHeight || 160;
    if (w > 0 && h > 0) {
      featurePreviewRenderer.setSize(w, h);
      featurePreviewCamera.aspect = w / h;
      featurePreviewCamera.updateProjectionMatrix();
    }
  }
  const currentToken = ++featurePreviewLoadToken;
  for (let i = featurePreviewScene.children.length - 1; i >= 0; i--) {
    const child = featurePreviewScene.children[i];
    if (child.isMesh || child.type === 'Group') {
      featurePreviewScene.remove(child);
      disposeObject3D(child);
    }
  }
  featurePreviewMesh = null;
  if (selectedFeatureIndex < 0) {
    if (label) label.textContent = '';
    return;
  }
  const def = FEATURE_DEFS[selectedFeatureIndex];
  if (label) label.textContent = getFeatureDisplayName(def);
  let sizeX = def.sizeX || 1;
  let sizeY = def.sizeY || 1;
  if (selectedFeatureRotation % 2 === 1) {
    const tmp = sizeX;
    sizeX = sizeY;
    sizeY = tmp;
  }
  buildStructureGroup(def, selectedFeatureRotation, sizeX, sizeY, null, 1).then(group => {
    if (currentToken !== featurePreviewLoadToken) return;
    featurePreviewMesh = group;
    featurePreviewScene.add(featurePreviewMesh);
    const box = new THREE.Box3().setFromObject(featurePreviewMesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = featurePreviewCamera.fov * (Math.PI / 180);
    const cameraZ = (maxDim / 2) / Math.tan(fov / 2);
    const offset = cameraZ * 1.4;
    featurePreviewCamera.position.set(center.x + offset, center.y + offset, center.z + offset);
    featurePreviewCamera.lookAt(center);
    featurePreviewCamera.updateProjectionMatrix();
  }).catch(err => {
    console.warn('Failed to update object preview:', err);
  });
}

function fillTileCanvasBase(ctx, tileIdx, size) {
  const typeCode = tileTypesById[tileIdx] ?? 0;
  if (typeCode !== TILE_TYPE_WATER) return;
  ctx.fillStyle = TILESET_WATER_FILL[tilesetIndex] || TILESET_WATER_FILL[0];
  ctx.fillRect(0, 0, size, size);
}

function renderTexturePalette() {
  const palette = document.getElementById('texturePalette');
  if (!palette) return;
  palette.innerHTML = '';
  const typeToggle = document.getElementById('displayTileTypes');
  const showTypes = typeToggle && typeToggle.checked && tileTypesById.length;
  // Use the actual number of loaded tile images rather than the
  // expected count from the tileset definition. This ensures we
  // don't accidentally clip tiles when a tileset provides more (or
  // fewer) images than the hard-coded metadata. For example the
  // Rocky Mountains tileset should display all 80 tiles.
  const total = tileImages.length;
  for (let idx = 0; idx < total; idx++) {
    const img = tileImages[idx];
    const canvas = document.createElement('canvas');
    canvas.width = TILE_ICON_SIZE;
    canvas.height = TILE_ICON_SIZE;
    const ctx = canvas.getContext('2d');
    fillTileCanvasBase(ctx, idx, TILE_ICON_SIZE);
    if (img && img.complete && img.naturalWidth > 0) {
      // Match the terrain CanvasTexture upload, which flips tile images vertically in WebGL.
      drawOfficialTileImage(ctx, img, TILE_ICON_SIZE, selectedRotation, selectedXFlip, true);
    }
    const panelIdToggle = (typeof showPanelIdsCheckbox !== 'undefined' && showPanelIdsCheckbox)
      ? showPanelIdsCheckbox
      : document.getElementById('showPanelIds');
    if (!panelIdToggle || panelIdToggle.checked) {
      const label = String(idx);
      const cx = TILE_ICON_SIZE / 2;
      const cy = TILE_ICON_SIZE / 2;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.arc(cx, cy, TILE_ICON_SIZE * 0.38, 0, Math.PI * 2);
      ctx.fill();
      const fontSize = Math.floor(TILE_ICON_SIZE * 0.55);
      ctx.font = 'bold ' + fontSize + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, Math.floor(TILE_ICON_SIZE * 0.08));
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(label, cx, cy);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, cx, cy);
    }
    if (showTypes) {
      const typeCode = tileTypesById[idx] ?? 0;
      const colour = TILE_TYPE_COLORS[typeCode % TILE_TYPE_COLORS.length];
      const badgeSize = Math.floor(TILE_ICON_SIZE * 0.34);
      const x = TILE_ICON_SIZE - badgeSize - 2;
      const y = TILE_ICON_SIZE - badgeSize - 2;
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, badgeSize, badgeSize);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, badgeSize, badgeSize);
      ctx.font = 'bold ' + Math.floor(badgeSize * 0.78) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(String(typeCode), x + badgeSize / 2, y + badgeSize / 2);
      ctx.fillStyle = '#000';
      ctx.fillText(String(typeCode), x + badgeSize / 2, y + badgeSize / 2);
    }
    const imgElem = new Image();
    imgElem.src = canvas.toDataURL();
    imgElem.dataset.index = idx;
    imgElem.style.width = TILE_ICON_SIZE + 'px';
    imgElem.style.height = TILE_ICON_SIZE + 'px';
    imgElem.style.cursor = 'pointer';
    imgElem.style.border = '1px solid #435066';
    imgElem.style.boxSizing = 'border-box';
    imgElem.addEventListener('click', () => {
      activeSmartTilePresetKey = '';
      selectedTileId = idx;
      updateSelectedInfo();
      refreshSmartTilePresetControls();
      palette.querySelectorAll('img').forEach(el => el.style.outline = '');
      imgElem.style.outline = TILE_SELECTION_OUTLINE;
      if (lastMouseEvent) updateHighlight(lastMouseEvent);
    });
    imgElem.addEventListener('mouseenter', ev => showTileTooltip(ev, idx));
    imgElem.addEventListener('mousemove', moveTileTooltip);
    imgElem.addEventListener('mouseleave', hideTileTooltip);
    palette.appendChild(imgElem);
  }
  const selectedImg = palette.querySelector("img[data-index='" + selectedTileId + "']");
  if (selectedImg) {
    selectedImg.style.outline = TILE_SELECTION_OUTLINE;
  }
}
const DEFAULT_MAP_W = 20;
const DEFAULT_MAP_H = 40;
const CAM_EDGE_MARGIN = 400;
let tilesetIndex = 0;
let mapW = DEFAULT_MAP_W, mapH = DEFAULT_MAP_H;
let mapTiles = Array(mapH).fill().map(() => Array(mapW).fill(0));
let mapHeights = Array(mapH).fill().map(() => Array(mapW).fill(0));
let mapRotations = Array(mapH).fill().map(() => Array(mapW).fill(0));
let mapXFlip = Array(mapH).fill().map(() => Array(mapW).fill(false));
let mapYFlip = Array(mapH).fill().map(() => Array(mapW).fill(false));
let mapTriFlip = Array(mapH).fill().map(() => Array(mapW).fill(false));

function getOfficialTileSourceCorners(rotation, xFlip, yFlip) {
  const corners = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 }
  ];
  const swap = (a, b) => {
    const tmp = corners[a];
    corners[a] = corners[b];
    corners[b] = tmp;
  };

  if (xFlip) {
    swap(0, 1);
    swap(2, 3);
  }
  if (yFlip) {
    swap(0, 3);
    swap(1, 2);
  }

  switch (rotation & 0x03) {
    case 1: {
      const tmp = corners[0];
      corners[0] = corners[3];
      corners[3] = corners[2];
      corners[2] = corners[1];
      corners[1] = tmp;
      break;
    }
    case 2:
      swap(0, 2);
      swap(3, 1);
      break;
    case 3: {
      const tmp = corners[0];
      corners[0] = corners[1];
      corners[1] = corners[2];
      corners[2] = corners[3];
      corners[3] = tmp;
      break;
    }
  }

  return corners;
}

function drawOfficialTileImage(ctx, img, size, rotation, xFlip, yFlip) {
  const corners = getOfficialTileSourceCorners(rotation, xFlip, yFlip);
  const destCorners = [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size }
  ];
  const sourceToDest = {};

  corners.forEach((source, destIndex) => {
    sourceToDest[source.x + ',' + source.y] = destCorners[destIndex];
  });

  const d00 = sourceToDest['0,0'];
  const d10 = sourceToDest['1,0'];
  const d01 = sourceToDest['0,1'];
  if (!d00 || !d10 || !d01) {
    ctx.drawImage(img, 0, 0, size, size);
    return;
  }

  ctx.save();
  ctx.setTransform(
    (d10.x - d00.x) / size,
    (d10.y - d00.y) / size,
    (d01.x - d00.x) / size,
    (d01.y - d00.y) / size,
    d00.x,
    d00.y
  );
  ctx.drawImage(img, 0, 0, size, size);
  ctx.restore();
}

function getTerrainCornerHeight(x, y) {
  if (!mapW || !mapH) return 0;
  const sampleX = Math.max(0, Math.min(mapW - 1, x));
  const sampleY = Math.max(0, Math.min(mapH - 1, y));
  return (mapHeights?.[sampleY]?.[sampleX] ?? 0) * HEIGHT_SCALE;
}

function createTerrainHighlightMesh(minX, minY, width, height, color, opacity, yOffset = 0.025) {
  const positions = [];
  const indices = [];
  for (let y = minY; y < minY + height; y++) {
    for (let x = minX; x < minX + width; x++) {
      if (x < 0 || x >= mapW || y < 0 || y >= mapH) continue;
      const base = positions.length / 3;
      const nw = getTerrainCornerHeight(x, y) + yOffset;
      const ne = getTerrainCornerHeight(x + 1, y) + yOffset;
      const se = getTerrainCornerHeight(x + 1, y + 1) + yOffset;
      const sw = getTerrainCornerHeight(x, y + 1) + yOffset;
      positions.push(
        x, nw, y,
        x + 1, ne, y,
        x + 1, se, y + 1,
        x, sw, y + 1
      );
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
  return new THREE.Mesh(geometry, material);
}

function createTerrainCellHighlightMesh(cells, color, opacity, yOffset = 0.025) {
  const positions = [];
  const indices = [];
  cells.forEach(cell => {
    const x = cell.x;
    const y = cell.y;
    if (x < 0 || x >= mapW || y < 0 || y >= mapH) return;
    const base = positions.length / 3;
    const nw = getTerrainCornerHeight(x, y) + yOffset;
    const ne = getTerrainCornerHeight(x + 1, y) + yOffset;
    const se = getTerrainCornerHeight(x + 1, y + 1) + yOffset;
    const sw = getTerrainCornerHeight(x, y + 1) + yOffset;
    positions.push(
      x, nw, y,
      x + 1, ne, y,
      x + 1, se, y + 1,
      x, sw, y + 1
    );
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
  return new THREE.Mesh(geometry, material);
}

function createTerrainTileWireframe(tileX, tileY, color = 0x66aaff) {
  const bottomOffset = 0.045;
  const topOffset = 0.42;
  const nw = getTerrainCornerHeight(tileX, tileY);
  const ne = getTerrainCornerHeight(tileX + 1, tileY);
  const se = getTerrainCornerHeight(tileX + 1, tileY + 1);
  const sw = getTerrainCornerHeight(tileX, tileY + 1);
  const bottom = [
    [tileX, nw + bottomOffset, tileY],
    [tileX + 1, ne + bottomOffset, tileY],
    [tileX + 1, se + bottomOffset, tileY + 1],
    [tileX, sw + bottomOffset, tileY + 1]
  ];
  const top = [
    [tileX, nw + topOffset, tileY],
    [tileX + 1, ne + topOffset, tileY],
    [tileX + 1, se + topOffset, tileY + 1],
    [tileX, sw + topOffset, tileY + 1]
  ];
  const positions = [];
  const addLine = (a, b) => positions.push(...a, ...b);
  for (let i = 0; i < 4; i++) {
    addLine(bottom[i], bottom[(i + 1) % 4]);
    addLine(top[i], top[(i + 1) % 4]);
    addLine(bottom[i], top[i]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
  return new THREE.LineSegments(geometry, material);
}

function removeTileGrid() {
  if (!tileGridGroup) return;
  if (scene) scene.remove(tileGridGroup);
  tileGridGroup.traverse(child => {
    if (child.geometry && typeof child.geometry.dispose === 'function') child.geometry.dispose();
    if (child.material && typeof child.material.dispose === 'function') child.material.dispose();
  });
  tileGridGroup = null;
}

function createTerrainTileGrid() {
  const positions = [];
  const yOffset = 0.04;
  const addLine = (a, b) => positions.push(...a, ...b);
  for (let x = 0; x <= mapW; x++) {
    for (let y = 0; y < mapH; y++) {
      addLine(
        [x, getTerrainCornerHeight(x, y) + yOffset, y],
        [x, getTerrainCornerHeight(x, y + 1) + yOffset, y + 1]
      );
    }
  }
  for (let y = 0; y <= mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      addLine(
        [x, getTerrainCornerHeight(x, y) + yOffset, y],
        [x + 1, getTerrainCornerHeight(x + 1, y) + yOffset, y]
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  const material = new THREE.LineBasicMaterial({
    color: 0x6cf527,
    transparent: true,
    opacity: 0.35,
    depthWrite: false
  });
  const grid = new THREE.LineSegments(geometry, material);
  grid.layers.set(1);
  return grid;
}

function refreshTileGrid() {
  removeTileGrid();
  if (!tileGridVisible || !scene || !mapW || !mapH) return;
  tileGridGroup = createTerrainTileGrid();
  scene.add(tileGridGroup);
}

function addTerrainTileGeometry(buffers, x, y, rotation, xFlip, yFlip) {
  const base = buffers.positions.length / 3;
  const nw = getTerrainCornerHeight(x, y);
  const ne = getTerrainCornerHeight(x + 1, y);
  const se = getTerrainCornerHeight(x + 1, y + 1);
  const sw = getTerrainCornerHeight(x, y + 1);
  const centerH = (nw + ne + se + sw) / 4;
  const centerX = x + 0.5;
  const centerY = y + 0.5;
  const uvCorners = getOfficialTileSourceCorners(rotation, xFlip, yFlip);
  const uvNW = uvCorners[0];
  const uvNE = uvCorners[1];
  const uvSE = uvCorners[2];
  const uvSW = uvCorners[3];

  buffers.positions.push(
    centerX, centerH, centerY,
    x, sw, y + 1,
    x, nw, y,
    x + 1, se, y + 1,
    x + 1, ne, y
  );
  buffers.uvs.push(
    0.5, 0.5,
    uvSW.x, uvSW.y,
    uvNW.x, uvNW.y,
    uvSE.x, uvSE.y,
    uvNE.x, uvNE.y
  );

  buffers.indices.push(
    base, base + 1, base + 2,
    base, base + 3, base + 1,
    base, base + 4, base + 3,
    base, base + 2, base + 4
  );

  const addBorderSkirt = (ax, ah, az, bx, bh, bz) => {
    const skirtBase = buffers.positions.length / 3;
    buffers.positions.push(
      ax, ah, az,
      bx, bh, bz,
      bx, 0, bz,
      ax, 0, az
    );
    buffers.uvs.push(
      0, 0,
      1, 0,
      1, 1,
      0, 1
    );
    buffers.indices.push(
      skirtBase, skirtBase + 1, skirtBase + 2,
      skirtBase, skirtBase + 2, skirtBase + 3
    );
  };

  if (x === 0) addBorderSkirt(x, nw, y, x, sw, y + 1);
  if (x === mapW - 1) addBorderSkirt(x + 1, se, y + 1, x + 1, ne, y);
  if (y === 0) addBorderSkirt(x + 1, ne, y, x, nw, y);
  if (y === mapH - 1) addBorderSkirt(x, sw, y + 1, x + 1, se, y + 1);
}

const TILE_TYPE_NAMES = [
  "Sand",
  "Sandy Brush",
  "Rubble",
  "Green Mud",
  "Red Brush",
  "Pink Rock",
  "Road",
  "Water",
  "Cliff Face",
  "Baked Earth",
  "Sheet Ice",
  "Slush"
];
const TILE_TYPE_CODES = [
  "TER_SAND",
  "TER_SANDYBRUSH",
  "TER_RUBBLE",
  "TER_GREENMUD",
  "TER_REDBRUSH",
  "TER_PINKROCK",
  "TER_ROAD",
  "TER_WATER",
  "TER_CLIFFFACE",
  "TER_BAKEDEARTH",
  "TER_SHEETICE",
  "TER_SLUSH"
];
// Adds a colored square before each tile type option in the dropdown.
function colorizeTileTypeOptions() {
  const sel = document.getElementById('tileTypeSelect');
  if (!sel) return;
  for (let i = 0; i < sel.options.length; i++) {
    const opt = sel.options[i];
    const baseName = opt.getAttribute('data-name') || opt.textContent.replace(/^■\s*/, '').trim();
    const color = (typeof TILE_TYPE_COLORS !== 'undefined' && TILE_TYPE_COLORS[i]) ? TILE_TYPE_COLORS[i] : '#888';
    opt.textContent = '■ ' + baseName;
    opt.style.color = color;
    // Attach a plain-text tooltip so the browser shows terrain info
    // even when the native <select> drop-down is expanded. Native
    // <option> elements do not reliably fire mouse events, so we set
    // the `title` attribute instead of custom hover handlers.
    if (terrainSpeedModifiers) {
      const terrainKey = TILE_TYPE_CODES[i];
      if (terrainKey) {
        let tooltip = `${TILE_TYPE_NAMES[i] || ''}\n`;
        tooltip += 'Speed modifiers:\n';
        for (const prop in terrainSpeedModifiers) {
          const val = terrainSpeedModifiers[prop][terrainKey];
          if (val != null) tooltip += `${prop}: ${Math.round(val * 100)}%\n`;
        }
        opt.title = tooltip.trim();
      }
    }
  }
  const idx = parseInt(sel.value, 10) || 0;
  sel.style.color = (typeof TILE_TYPE_COLORS !== 'undefined' && TILE_TYPE_COLORS[idx]) ? TILE_TYPE_COLORS[idx] : '#888';
}

function ensureTileTypeOptions() {
  const typeSelect = document.getElementById('tileTypeSelect');
  if (!typeSelect || typeSelect.options.length) return;
  TILE_TYPE_NAMES.forEach((name, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = name;
    opt.setAttribute('data-name', name);
    typeSelect.appendChild(opt);
  });
  try { colorizeTileTypeOptions(); } catch (e) {}
}
  let terrainSpeedModifiers = null;
let tileTooltipDiv = null;
let selectedTileType = 0;
let rightClickAction = 'camera';
  function parseTileTypes(data) {
  if (!data || data.length < 12) return [];
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const entryCount = dv.getUint32(8, true);
  const arr = [];
  for (let i = 0; i < entryCount; i++) {
    const val = dv.getUint16(12 + i * 2, true);
    arr.push(val);
  }
  return arr;
}

async function loadTerrainSpeedModifiers() {
  try {
    const resp = await fetch('terrain_speed_modifiers.json', { cache: 'no-cache' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    terrainSpeedModifiers = await resp.json();
  } catch (err) {
    console.error('Failed to load terrain speed modifiers:', err);
  }
}

function ensureTileTooltip() {
  if (tileTooltipDiv) return;
  tileTooltipDiv = document.createElement('div');
  tileTooltipDiv.style.position = 'fixed';
  tileTooltipDiv.style.pointerEvents = 'none';
  tileTooltipDiv.style.background = 'rgba(24,32,48,0.95)';
  tileTooltipDiv.style.border = '1px solid #435066';
  tileTooltipDiv.style.padding = '4px';
  tileTooltipDiv.style.fontSize = '12px';
  tileTooltipDiv.style.zIndex = '200';
  tileTooltipDiv.style.display = 'none';
  document.body.appendChild(tileTooltipDiv);
}

function showTileTooltip(ev, idx, isTypeIndex = false) {
  if (!terrainSpeedModifiers) return;
  let typeCode;
  if (isTypeIndex) {
    typeCode = idx;
  } else {
    if (!tileTypesById.length) return;
    typeCode = tileTypesById[idx] ?? 0;
  }
  const terrainKey = TILE_TYPE_CODES[typeCode];
  if (!terrainKey) return;
  let html = `<b>${TILE_TYPE_NAMES[typeCode] || ''}</b><br>`;
  html += 'Speed modifiers:<br>';
  for (const prop in terrainSpeedModifiers) {
    const val = terrainSpeedModifiers[prop][terrainKey];
    if (val != null) html += `${prop}: ${Math.round(val * 100)}%<br>`;
  }
  ensureTileTooltip();
  tileTooltipDiv.innerHTML = html;
  tileTooltipDiv.style.display = 'block';
  moveTileTooltip(ev);
}

function moveTileTooltip(ev) {
  if (!tileTooltipDiv) return;
  tileTooltipDiv.style.left = (ev.clientX + 12) + 'px';
  tileTooltipDiv.style.top = (ev.clientY + 12) + 'px';
}

function hideTileTooltip() {
  if (tileTooltipDiv) tileTooltipDiv.style.display = 'none';
}

function clearEditHighlight() {
  if (highlightMesh && scene) {
    scene.remove(highlightMesh);
    if (highlightMesh.geometry) highlightMesh.geometry.dispose();
    if (highlightMesh.material) highlightMesh.material.dispose();
    highlightMesh = null;
  }
}

function cancelCurrentMapAction() {
  isDragging = false;
  hideTileTooltip();
  if (activeTab === 'textures') {
    tileSelectStart = null;
    tileSelectEnd = null;
    tileSelectionFixed = false;
    clearEditHighlight();
    updateTileApplyBtn();
  } else if (activeTab === 'height') {
    heightSelectStart = null;
    heightSelectEnd = null;
    clearEditHighlight();
    updateHeightApplyBtn();
  } else if (activeTab === 'objects') {
    if (structureMode === 'view') {
      clearSelectedStructure();
      updateStructureInfo(null, 'No structure selected.');
    } else if (structureMode === 'build') {
      clearStructurePlacementPreview();
    } else if (structureMode === 'delete') {
      clearHoveredStructure();
    }
  } else if (activeTab === 'droids') {
    if (droidMode === 'view') {
      clearSelectedDroid();
      updateDroidInfo(null, 'No droid selected.');
    } else if (droidMode === 'build') {
      clearStructurePlacementPreview();
    } else if (droidMode === 'delete') {
      clearHoveredDroid();
    }
  }
}
TILESETS.forEach((ts, i) => {
  let opt = document.createElement("option");
  opt.value = i;
  opt.textContent = ts.name;
  tilesetSelect.appendChild(opt);
});
tilesetSelect.value = tilesetIndex;
if (tilesetSelect && !tilesetSelect.__wzBound) {
  tilesetSelect.addEventListener('change', (e) => {
    const idx = parseInt(e.target.value, 10);
    setTileset(isNaN(idx) ? 0 : idx);
  });
  tilesetSelect.addEventListener('input', (e) => {
    const idx = parseInt(e.target.value, 10);
    setTileset(isNaN(idx) ? 0 : idx);
  });
  tilesetSelect.__wzBound = true;
}
setupKeyboard(() => resetCameraTarget(mapW, mapH, threeContainer));
async function setTileset(idx) {
  // ensure fresh tiles when switching sets
  clearTileCache(idx);

  if (idx < 0 || idx >= TILESETS.length) idx = 0;
  tilesetIndex = idx;
  tilesetSelect.value = tilesetIndex;
  tileImages = await loadAllTiles(tilesetIndex);
  tileTypesById = getDefaultTileTypesForTileset(tilesetIndex);
  await loadTileRelationshipDataForTileset(tilesetIndex);
  if (tilesetIndex !== 0) activeSmartTilePresetKey = '';
  ensureTileTypeOptions();
  renderTexturePalette();
  updateSelectedInfo();
  refreshSmartTilePresetControls();
  drawMap3D();
}

function parseStructIni(text) {
  const sections = [];
  let current = null;
  String(text || '').split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) return;
    const section = trimmed.match(/^\[([^\]]+)\]$/);
    if (section) {
      current = {};
      sections.push(current);
      return;
    }
    if (!current) return;
    const eq = trimmed.indexOf('=');
    if (eq < 0) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key === 'position' || key === 'rotation') {
      current[key] = value.split(',').map(part => parseInt(part.trim(), 10) || 0);
    } else if (key === 'id' || key === 'startpos' || key === 'modules') {
      const n = parseInt(value, 10);
      current[key] = Number.isFinite(n) ? n : value;
    } else {
      current[key] = value;
    }
  });
  return sections;
}

async function addLoadedStructure(def, entry, rot, rotDeg, tileX, tileY, sizeX, sizeY, minH) {
  const moduleCount = Math.max(0, parseInt(entry?.modules, 10) || 0);
  const group = await buildStructureGroup(getStructureRenderDef(def, moduleCount), rot, sizeX, sizeY);
  const pos = getStructurePlacementPosition(group, tileX, tileY, sizeX, sizeY, minH);
  group.position.copy(pos);
  markStructureForExport(group, def, rot, sizeX, sizeY, entry, currentStructJsonStyle);
  setStructureModuleCount(group, moduleCount);
  setStructureRotationDegrees(group, rotDeg);
  addStructureGroup(group);
  return group;
}

async function addLoadedFeature(entry) {
  const name = String(entry?.name || entry?.id || '').toLowerCase();
  if (!name) return null;
  if (!FEATURE_DEFS.length) {
    try { await loadFeatureDefs(); } catch (e) {}
  }
  const def = getStructureDefById(name) || (isOilFeature(entry) ? OIL_SPOT_DEF : null);
  if (!def?.feature) return null;
  const { rot, rotDeg } = parseStructureRotation(entry);
  let sizeX = def.sizeX || 1;
  let sizeY = def.sizeY || 1;
  if (rot % 2 === 1) {
    const tmp = sizeX;
    sizeX = sizeY;
    sizeY = tmp;
  }
  const centerX = Array.isArray(entry.position) ? (parseFloat(entry.position[0]) || 0) / 128 : 0;
  const centerY = Array.isArray(entry.position) ? (parseFloat(entry.position[1]) || 0) / 128 : 0;
  const tileX = Math.round(centerX - sizeX / 2);
  const tileY = Math.round(centerY - sizeY / 2);
  if (tileX < 0 || tileY < 0 || tileX >= mapW || tileY >= mapH) return null;
  const minH = getMinTerrainHeight(tileX, tileY, sizeX, sizeY);
  const group = await buildStructureGroup(def, rot, sizeX, sizeY);
  group.position.set(centerX - (group.userData.centerX || 0), minH + 0.02 - (group.userData.minY || 0), centerY - (group.userData.centerZ || 0));
  markFeatureForExport(group, def, tileX, tileY, entry, rot, rotDeg);
  addStructureGroup(group);
  return group;
}

async function loadFeaturesFromMetadata() {
  if (!currentFeatureEntries.length) return;
  if (!FEATURE_DEFS.length) {
    try { await loadFeatureDefs(); } catch (e) {}
  }
  await Promise.all(currentFeatureEntries.map(entry => addLoadedFeature(entry).catch(() => null)));
}

function foldLegacyStructureModules(entries) {
  const absorbed = new Set();
  entries.forEach((entry, index) => {
    const moduleDef = getStructureDefById(entry?.name);
    const moduleRule = getModuleParentTypes(moduleDef);
    if (!moduleRule) return;
    const modulePos = entry.position;
    if (!Array.isArray(modulePos) || modulePos.length < 2) return;
    const parentIndex = entries.findIndex((candidate, candidateIndex) => {
      if (candidateIndex === index || absorbed.has(candidateIndex)) return false;
      const parentDef = getStructureDefById(candidate?.name);
      const parentType = String(parentDef?.type || '').toLowerCase();
      const parentPos = candidate?.position;
      return moduleRule.parents.has(parentType) &&
        Array.isArray(parentPos) &&
        parentPos[0] === modulePos[0] &&
        parentPos[1] === modulePos[1];
    });
    if (parentIndex < 0) return;
    const parent = entries[parentIndex];
    const currentCount = Math.max(0, parseInt(parent.modules, 10) || 0);
    parent.modules = Math.min(moduleRule.max, currentCount + 1);
    absorbed.add(index);
  });
  return entries.filter((_, index) => !absorbed.has(index));
}

async function loadStructuresFromZip(zip) {
  clearMapObjects();
  const structName = Object.keys(zip.files).find(fn => fn.toLowerCase().endsWith('struct.json') && !zip.files[fn].dir);
  const structIniName = Object.keys(zip.files).find(fn => fn.toLowerCase().endsWith('struct.ini') && !zip.files[fn].dir);
  currentStructArchivePath = structName || (structIniName ? structIniName.replace(/struct\.ini$/i, 'struct.json') : null);
  currentStructJsonStyle = 'array';
  if (!structName && !structIniName) return;
  try {
    const text = await zip.files[structName || structIniName].async('string');
    const data = structName ? JSON.parse(text) : parseStructIni(text);
    currentStructJsonStyle = structName && !(Array.isArray(data) || Array.isArray(data.structures)) ? 'object' : 'array';
    const rawEntries = Array.isArray(data) ? data : Array.isArray(data.structures) ? data.structures : Object.values(data);
    await loadStructureEntries(rawEntries);
  } catch (err) {
    console.error('Failed to load structures from struct data:', err);
  }
}

async function loadStructureEntries(rawEntries) {
  try {
    if (!STRUCTURE_DEFS.length) {
      try { await loadStructureDefs(); } catch (e) {}
    }
    const entries = foldLegacyStructureModules(rawEntries);
    const promises = entries.map(entry => {
      const name = typeof entry.name === 'string' ? entry.name.toLowerCase() : null;
      if (!name) return Promise.resolve();
      const def = STRUCTURE_DEFS.find(d => d.id.toLowerCase() === name);
      if (!def) return Promise.resolve();
      const { rot, rotDeg } = parseStructureRotation(entry);
      let sizeX = def.sizeX || 1;
      let sizeY = def.sizeY || 1;
      if (rot % 2 === 1) {
        const tmp = sizeX; sizeX = sizeY; sizeY = tmp;
      }
      const centerX = (entry.position?.[0] || 0) / 128;
      const centerY = (entry.position?.[1] || 0) / 128;
      const tileX = Math.round(centerX - sizeX / 2);
      const tileY = Math.round(centerY - sizeY / 2);
      if (tileX < 0 || tileY < 0 || tileX >= mapW || tileY >= mapH) return Promise.resolve();
      let minH = Infinity;
      for (let dy = 0; dy < sizeY; dy++) {
        for (let dx = 0; dx < sizeX; dx++) {
          if (tileY + dy < 0 || tileY + dy >= mapH || tileX + dx < 0 || tileX + dx >= mapW) continue;
          const h = mapHeights[tileY + dy][tileX + dx] * HEIGHT_SCALE;
          if (h < minH) minH = h;
        }
      }
      return addLoadedStructure(def, entry, rot, rotDeg, tileX, tileY, sizeX, sizeY, minH)
        .catch(() => {});
    });
    await Promise.all(promises);
    await refreshAllWallConnections();
  } catch (err) {
    console.error('Failed to load structure entries:', err);
  }
}

async function loadDroidEntries(entries) {
  currentDroidEntries = [];
  try {
    await loadComponentDefs();
    currentDroidEntries = entries.filter(entry => entry && typeof entry === 'object');
    for (const entry of entries) {
      if (entry.template && templateDefs && templateDefs[entry.template]) {
        const t = templateDefs[entry.template];
        entry.body ||= t.body;
        entry.propulsion ||= t.propulsion;
        if (!entry.weapon && !entry.weapons) {
          if (Array.isArray(t.weapons)) entry.weapons = t.weapons.slice();
          else if (t.weapon) entry.weapon = t.weapon;
        }
        entry.construct ||= t.construct;
        entry.repair ||= t.repair;
        entry.sensor ||= t.sensor;
        entry.brain ||= t.brain;
        entry.ecm ||= t.ecm;
      }
      const posX = (entry.position?.[0] ?? 0) / 128;
      const posZ = (entry.position?.[1] ?? 0) / 128;
      const tileX = Math.floor(posX);
      const tileY = Math.floor(posZ);
      if (tileX < 0 || tileY < 0 || tileX >= mapW || tileY >= mapH) continue;
      // Lift droids slightly above the terrain to avoid z-fighting
      const h = (mapHeights?.[tileY]?.[tileX] ?? 0) * HEIGHT_SCALE + 0.07;
      const yaw = (entry.rotation?.[1] ?? 0) * (2 * Math.PI / 65536);
      const pieList = getDroidPieList(entry);
      if (pieList && pieList.length) {
        try {
          const group = await buildDroidGroup(pieList);
          const cX = group.userData.centerX || 0;
          const cZ = group.userData.centerZ || 0;
          const minY = group.userData.minY || 0;
          group.position.set(posX - cX, h - minY, posZ - cZ);
          group.rotation.y = -yaw;
          group.userData.droidExport = entry;
          objectsGroup.add(group);
          continue;
        } catch (e) {
          console.warn('Failed to build droid from pies:', e);
        }
      }
      const geom = new THREE.ConeGeometry(0.3, 0.6, 4);
      const color = PLAYER_COLORS[(entry.startpos ?? 0) % PLAYER_COLORS.length];
      const mat = new THREE.MeshLambertMaterial({ color });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.y = -yaw;
      mesh.position.set(posX, h, posZ);
      mesh.userData.cullable = true;
      mesh.userData.droidExport = entry;
      objectsGroup.add(mesh);
    }
    if (objectsGroup && !scene.children.includes(objectsGroup)) {
      scene.add(objectsGroup);
    }
  } catch (err) {
    console.error('Failed to load droid entries:', err);
  }
}

async function loadDroidsFromZip(zip) {
  const droidName = Object.keys(zip.files).find(fn => fn.toLowerCase().endsWith('droid.json') && !zip.files[fn].dir);
  currentDroidArchivePath = droidName || null;
  if (!droidName) {
    currentDroidEntries = [];
    return;
  }
  try {
    const text = await zip.files[droidName].async('string');
    const data = JSON.parse(text);
    const entries = Array.isArray(data) ? data : Array.isArray(data.droids) ? data.droids : Object.values(data);
    await loadDroidEntries(entries);
  } catch (err) {
    console.error('Failed to load droids from droid.json:', err);
  }
}

async function loadLocalSaveSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.mapTiles) || !Array.isArray(snapshot.mapHeights)) {
    setLocalSaveStatus('Could not load local save.');
    return;
  }
  const name = snapshot.name || 'Untitled Map';
  setLoadingProgress('Loading local save', 5);
  await waitForUiPaint();
  resetLoadedMetadata();
  currentMapArchive = null;
  currentMapArchivePath = null;
  currentMapExportInfo = null;
  currentStructArchivePath = null;
  currentStructJsonStyle = snapshot.structureStyle || 'array';
  currentDroidArchivePath = null;
  currentFeatureArchivePath = null;
  currentTileTypesArchivePath = null;
  currentGamArchivePath = null;
  currentLevelArchivePath = null;
  currentGamJson = null;
  currentLevelJson = null;
  currentMapInfoOverrides = { ...getDefaultMapInfoOverrides(), ...(snapshot.mapInfo || {}) };
  if (!currentMapInfoOverrides.name) currentMapInfoOverrides.name = String(name || '').trim();
  updateMapInfoInputs();
  applyUserMapInfoToMapInfo();
  setLoadingProgress('Loading tileset textures', 20);
  await setTileset(Math.max(0, Math.min(TILESETS.length - 1, parseInt(snapshot.tilesetIndex, 10) || 0)));
  setLoadingProgress('Restoring tile types', 35);
  if (Array.isArray(snapshot.tileTypesById)) {
    const defaultTypes = getDefaultTileTypesForTileset(tilesetIndex);
    tileTypesById = defaultTypes.map((fallback, idx) => {
      const saved = parseInt(snapshot.tileTypesById[idx], 10);
      return Number.isFinite(saved) ? saved : fallback;
    });
    renderTexturePalette();
    updateSelectedInfo();
  }
  setLoadingProgress('Restoring map grid', 45);
  clearMapObjects();
  setMapState(
    snapshot.mapW || snapshot.mapTiles[0]?.length || DEFAULT_MAP_W,
    snapshot.mapH || snapshot.mapTiles.length || DEFAULT_MAP_H,
    snapshot.mapTiles,
    snapshot.mapRotations || snapshot.mapTiles.map(row => row.map(() => 0)),
    snapshot.mapHeights,
    snapshot.mapXFlip || [],
    snapshot.mapYFlip || [],
    snapshot.mapTriFlip || []
  );
  setLoadingProgress('Loading structures', 65);
  await loadStructureEntries(Array.isArray(snapshot.structures) ? snapshot.structures : []);
  setLoadingProgress('Loading objects', 78);
  currentFeatureEntries = Array.isArray(snapshot.features) ? snapshot.features : [];
  await loadFeaturesFromMetadata();
  setLoadingProgress('Loading droids', 88);
  await loadDroidEntries(Array.isArray(snapshot.droids) ? snapshot.droids : []);
  if (objectsGroup && !scene.children.includes(objectsGroup)) scene.add(objectsGroup);
  setLoadingProgress('Drawing map', 96);
  drawMap3D();
  setCurrentMapName(name);
  hideCurrentMapNameBar();
  currentLocalSaveId = snapshot.id || currentLocalSaveId;
  undoStack.length = 0;
  redoStack.length = 0;
  updateUndoRedoButtons();
  markMapClean();
  hideOverlay();
  setFileStatus('Loaded local save ' + name + '.');
  setLocalSaveStatus('Loaded local save ' + formatLocalSaveTime(snapshot.savedAt) + '.');
  setLoadingProgress('Local save loaded', 100);
  setTimeout(hideLoadingProgress, 600);
}

async function loadLocalSaveById(id) {
  if (!id) return;
  if (!confirmUnsavedChanges()) return;
  const snapshot = readLocalSaveSnapshot(id);
  if (!snapshot) {
    setLocalSaveStatus('Local save is missing.');
    refreshLocalSaveList();
    return;
  }
  try {
    await loadLocalSaveSnapshot(snapshot);
  } catch (err) {
    setLoadingProgress('Failed to load local save', 100);
    setTimeout(hideLoadingProgress, 900);
    throw err;
  }
}

async function loadSelectedLocalSave() {
  const id = localSaveSelect ? localSaveSelect.value : '';
  await loadLocalSaveById(id);
}

async function loadOverlayLocalSave() {
  const id = overlayLocalSaveSelect ? overlayLocalSaveSelect.value : '';
  if (localSaveSelect && id) localSaveSelect.value = id;
  await loadLocalSaveById(id);
}
window.loadOverlayLocalSave = () => {
  loadOverlayLocalSave().catch(err => {
    console.error('Failed to load local save:', err);
    setLocalSaveStatus('Failed to load local save.');
  });
};

function deleteSelectedLocalSave() {
  const id = localSaveSelect ? localSaveSelect.value : '';
  if (!id) return false;
  const index = readLocalSaveIndex().filter(item => item.id !== id);
  safeLocalStorageRemove(LOCAL_SAVE_KEY_PREFIX + id);
  writeLocalSaveIndex(index);
  if (currentLocalSaveId === id) currentLocalSaveId = null;
  refreshLocalSaveList();
  setLocalSaveStatus('Deleted local save.');
  return true;
}

async function loadMapFile(file, options = {}) {
  const displayNameOverride = String(options.displayName || '').trim();
  fileListDiv.classList.add('hidden');
  infoDiv.textContent = "";
  setCurrentMapName(displayNameOverride || file.name);
  currentLocalSaveId = null;
  setLoadingProgress('Preparing ' + file.name, 2);
  try {
    const inputEl = document.getElementById('wzLoader');
    if (inputEl) inputEl.style.display = 'none';
    if (mapFilenameSpan) mapFilenameSpan.style.display = 'none';
    if (typeof uiBar !== 'undefined' && uiBar) uiBar.style.display = 'none';
    try {
      const threeEl = document.getElementById('threeContainer');
      if (threeEl) { threeEl.style.top = '0px'; threeEl.style.height = '100vh'; }
      const overlayEl = document.getElementById('overlayMsg');
      if (overlayEl) overlayEl.style.top = '0px';
    } catch(e) {}
  } catch(e) {}
  let fileExt = file.name.toLowerCase().split('.').pop();
  currentMapArchive = null;
  currentMapArchivePath = null;
  currentMapExportInfo = null;
  currentStructArchivePath = null;
  currentStructJsonStyle = 'array';
  resetLoadedMetadata();
  currentServerMapMetadata = options.serverMetadata || null;
  currentServerMapSourceName = String(options.serverFilename || '');
  updateMapInfoInputs();
  let found = false;
  let autoTs = 0;
  if (fileExt === 'map' || fileExt === 'json') {
    setLoadingProgress('Reading map file', 15);
    if (fileExt === 'json') {
      try {
        const json = JSON.parse(await file.text());
        if (typeof json.tileset === 'number') autoTs = json.tileset;
      } catch (e) {}
    } else {
      currentMapExportInfo = getMapExportInfo(new Uint8Array(await file.arrayBuffer()));
    }
    setLoadingProgress('Parsing map grid', 35);
    const mapData = await loadMapUnified(file);
    console.log("Loaded map format:", mapData.format, mapData);
    setLoadingProgress('Loading tileset textures', 55);
    await setTileset(autoTs);
    setLoadingProgress('Applying map data', 70);
    mapW = mapData.mapW;
    mapH = mapData.mapH;
    mapTiles = mapData.mapTiles;
    mapRotations = mapData.mapRotations;
    mapHeights = mapData.mapHeights;
    mapXFlip = mapData.mapXFlip || mapXFlip;
    mapYFlip = mapData.mapYFlip || mapYFlip;
    mapTriFlip = mapData.mapTriFlip || mapTriFlip;
    updateHeightUI(mapData.mapVersion >= 39 ? 1023 : 255);
    resetCameraTarget(mapW, mapH, threeContainer);
    const displayName = displayNameOverride || getLoadedMapDisplayName(file.name, file.name);
    setLoadedMapInfo(displayName);
  setCurrentMapName(displayName);
  updateMapInfoInputs();
  applyUserMapInfoToMapInfo();
  setFileStatus('Loaded ' + file.name);
    setLoadingProgress('Drawing map', 95);
    drawMap3D();
    markMapClean();
    setLoadingProgress('Map loaded', 100);
    setTimeout(hideLoadingProgress, 600);
    hideOverlay();
    showLoadedMapInfo(file, displayName);
    return;
  }
  try {
    setLoadingProgress('Reading archive file', 20);
    const buf = await file.arrayBuffer();
    setLoadingProgress('Opening map archive', 30);
    const zip = await JSZip.loadAsync(buf);
    await loadArchiveMetadata(zip);
    updateMapInfoInputs();
    applyUserMapInfoToMapInfo();
    let names = Object.keys(zip.files).map(n => n.replace(/\\/g, '/'));
    const ttypesName = names.find(n => n.toLowerCase().endsWith('ttypes.ttp'));
    let ttypesMap = null;
    if (ttypesName) {
      setLoadingProgress('Loading tile type metadata', 38);
      const ttypesData = await zip.files[ttypesName].async('uint8array');
      ttypesMap = parseTTypes(ttypesData);
    }
    setLoadingProgress('Detecting tileset', 44);
    autoTs = getTilesetIndexFromName(currentLevelJson?.tileset);
    if (autoTs == null) autoTs = await getTilesetIndexFromTtp(zip, TTP_TILESET_MAP);
    let allMapNames = Object.keys(zip.files)
      .filter(fname => fname.toLowerCase().endsWith(".map") && !zip.files[fname].dir);
    let mapFileName = allMapNames.find(f => f.toLowerCase().endsWith("game.map")) || allMapNames[0];
    if (mapFileName) {
      currentMapArchive = zip;
      currentMapArchivePath = mapFileName;
      setLoadingProgress('Extracting map grid', 50);
      let fileData = await zip.files[mapFileName].async("uint8array");
      currentMapExportInfo = getMapExportInfo(fileData);
      setLoadingProgress('Converting map grid if needed', 56);
      const converted = convertGammaGameMapToClassic(fileData, ttypesMap);
      if (converted) fileData = converted;
      setLoadingProgress('Loading tileset textures', 62);
      await setTileset(autoTs);
      setLoadingProgress('Parsing map grid', 68);
      const result = await loadMapUnified(new File([fileData], mapFileName));
      console.log("Loaded map format:", result.format, result);
      if (result) {
        setLoadingProgress('Applying map data', 74);
        mapW = result.mapW;
        mapH = result.mapH;
        mapTiles = result.mapTiles;
        mapRotations = result.mapRotations;
        mapHeights = result.mapHeights;
        mapXFlip = result.mapXFlip || mapXFlip;
        mapYFlip = result.mapYFlip || mapYFlip;
        mapTriFlip = result.mapTriFlip || mapTriFlip;
        updateHeightUI(result.mapVersion >= 39 ? 1023 : 255);
        const ttpName = Object.keys(zip.files).find(fn => fn.toLowerCase().endsWith('.ttp') && !zip.files[fn].dir);
        if (ttpName) {
          setLoadingProgress('Loading tile type metadata', 80);
          const ttpData = await zip.files[ttpName].async('uint8array');
          tileTypesById = parseTileTypes(ttpData);
          if (tileTypesById.length < tileImages.length) {
            const defaultTypes = getDefaultTileTypesForTileset(tilesetIndex);
            for (let i = tileTypesById.length; i < tileImages.length; i++) tileTypesById[i] = defaultTypes[i] ?? 0;
          }
        } else {
          tileTypesById = getDefaultTileTypesForTileset(tilesetIndex);
        }
        setLoadingProgress('Loading structures', 86);
        await loadStructuresFromZip(zip);
        await loadFeaturesFromMetadata();
        setLoadingProgress('Loading droids', 91);
        await loadDroidsFromZip(zip);
        resetCameraTarget(mapW, mapH, threeContainer);
        const displayName = displayNameOverride || getLoadedMapDisplayName(file.name, mapFileName);
        setLoadedMapInfo(displayName);
        setCurrentMapName(displayName);
        updateMapInfoInputs();
        applyUserMapInfoToMapInfo();
        setFileStatus('Loaded ' + file.name);
        setLoadingProgress('Drawing map', 96);
        drawMap3D();
        markMapClean();
        setLoadingProgress('Map loaded', 100);
        setTimeout(hideLoadingProgress, 600);
        hideOverlay();
        showLoadedMapInfo(file, displayName);
        found = true;
        const typeSelect = document.getElementById('tileTypeSelect');
        if (typeSelect) {
          ensureTileTypeOptions();
          if (tileTypesById.length > selectedTileId) {
            typeSelect.value = tileTypesById[selectedTileId] ?? 0;
          } else {
            typeSelect.value = 0;
          }
          const idx = parseInt(typeSelect.value, 10) || 0;
          typeSelect.style.color = TILE_TYPE_COLORS[idx % TILE_TYPE_COLORS.length] || '#888';
        }
        renderTexturePalette();
        const sizeXInputEl = document.getElementById('sizeXInput');
        const sizeYInputEl = document.getElementById('sizeYInput');
        const sizeXSliderEl = document.getElementById('sizeXSlider');
        const sizeYSliderEl = document.getElementById('sizeYSlider');
        if (sizeXInputEl) sizeXInputEl.value = mapW;
        if (sizeYInputEl) sizeYInputEl.value = mapH;
        if (sizeXSliderEl) sizeXSliderEl.value = mapW;
        if (sizeYSliderEl) sizeYSliderEl.value = mapH;
      }
    }
    if (!found) {
      infoDiv.innerHTML = '<b style=\"color:red\">Failed to decode any map grid in this archive!</b>';
      setLoadingProgress('Failed to decode map grid', 100);
      showOverlay("Failed to load map. Please select another file.");
      resetCameraTarget(mapW, mapH, threeContainer);
    }
  } catch (err) {
    infoDiv.innerHTML = '<b style=\"color:red\">Failed to open archive!</b>';
    setLoadingProgress('Failed to open map archive', 100);
    showOverlay("Failed to open file. Please select another map.");
    resetCameraTarget(mapW, mapH, threeContainer);
  }
}

document.getElementById('wzLoader').addEventListener('change', async evt => {
  const file = evt.target.files[0];
  if (!file) return;
  if (!consumeUnsavedPromptSkip() && !confirmUnsavedChanges()) {
    evt.target.value = '';
    return;
  }
  await loadMapFile(file);
});

async function fetchBlobWithProgress(url, label, options = undefined) {
  setLoadingProgress('Downloading ' + label, 3);
  const resp = await fetch(url, options);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const total = parseInt(resp.headers.get('content-length') || '0', 10);
  if (!resp.body || !total) {
    const blob = await resp.blob();
    setLoadingProgress('Downloaded ' + label, 20);
    return blob;
  }
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    setLoadingProgress('Downloading ' + label, 3 + (received / total) * 17);
  }
  setLoadingProgress('Downloaded ' + label, 20);
  return new Blob(chunks);
}

async function loadServerMap(filename) {
  try {
    if (!consumeUnsavedPromptSkip() && !confirmUnsavedChanges()) return;
    const licenseInfoPromise = getServerMapLicenseInfo(filename);
    const blob = await fetchBlobWithProgress('maps/' + filename, filename);
    const licenseInfo = await licenseInfoPromise;
    const file = new File([blob], filename);
    await loadMapFile(file, {
      displayName: getServerMapDisplayName(filename, licenseInfo),
      serverMetadata: licenseInfo,
      serverFilename: filename
    });
    scheduleServerMapLicenseNotice(filename, licenseInfo);
  } catch (err) {
    infoDiv.innerHTML = '<b style="color:red">Failed to load server map!</b>';
    setLoadingProgress('Failed to download server map', 100);
    console.error(err);
  }
}
window.loadServerMap = loadServerMap;

function resolveMapUrl(url) {
  try {
    const u = new URL(url);
    if (
      u.hostname === 'github.com' &&
      /^\/[^/]+\/[^/]+\/releases\/download\//.test(u.pathname)
    ) {
      // Release assets aren't available on raw.githubusercontent.com.
      // Use the original GitHub release URL so the file downloads correctly.
      return u.href;
    }
  } catch (e) {
    console.error(e);
  }
  return url;
}

async function loadRemoteMap(url) {
  try {
    if (!consumeUnsavedPromptSkip() && !confirmUnsavedChanges()) return;
    url = resolveMapUrl(url);
    const name = url.split('/').pop() || 'remote.wz';
    const blob = await fetchBlobWithProgress(url, name, { mode: 'cors' });
    const file = new File([blob], name);
    await loadMapFile(file);
  } catch (err) {
    infoDiv.innerHTML = '<b style="color:red">Failed to load remote map!</b>';
    setLoadingProgress('Failed to download remote map', 100);
    console.error(err);
  }
}
window.loadRemoteMap = loadRemoteMap;
loadAllTiles(tilesetIndex).then(images => {
  tileImages = images;
  updateMinimap();
  showOverlay("Warzone2100 MapMaker");
  resetCameraTarget(mapW, mapH, threeContainer);
});
let isDragging = false, lastX = 0, lastY = 0;
const HEIGHT_SCALE = 0.015;
// Culling settings (added 2025-08-16)
const ENABLE_DISTANCE_CULLING = true;
const CULL_DISTANCE = 350; // world units
const ENABLE_FRUSTUM_CULLING = true;
function drawMap3D() {
  if (!threeContainer) return;
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  if (scene && mesh) {
    scene.remove(mesh);
    mesh = null;
  }
  removeTileGrid();
  if (scene) {
    for (let i = scene.children.length - 1; i >= 0; --i) {
      const obj = scene.children[i];
      if (obj.type === "Mesh" || obj.type === "InstancedMesh") {
        scene.remove(obj);
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => {
            if (mat && mat.map && typeof mat.map.dispose === "function") mat.map.dispose();
            if (mat && typeof mat.dispose === "function") mat.dispose();
          });
        } else if (obj.material) {
          if (obj.material.map && typeof obj.material.map.dispose === "function") obj.material.map.dispose();
          if (typeof obj.material.dispose === "function") obj.material.dispose();
        }
        if (obj.geometry && typeof obj.geometry.dispose === "function") obj.geometry.dispose();
      }
    }
  } else {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setClearColor(0x151e28);
    threeContainer.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.93));
    let dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(100, 200, 150);
    scene.add(dir);
    camera = new THREE.PerspectiveCamera(
      55,
      threeContainer.offsetWidth / threeContainer.offsetHeight,
      0.1,
      4000
    );
    camera.layers.enable(1);
    window.addEventListener('resize', () => {
      applyPreviewQuality();
      camera.aspect = threeContainer.offsetWidth / threeContainer.offsetHeight;
      camera.updateProjectionMatrix();
      resetCameraTarget(mapW, mapH, threeContainer);
    });
    threeContainer.addEventListener('mousedown', e => {
      if (hasShortcutCancelAction() || suppressNextMapContextMenu) return;
      if (e.button !== 2 || rightClickAction === 'browser') return;
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        renderTexturePalette();
      }
    });
    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      let dx = e.clientX - lastX, dy = e.clientY - lastY;
      cameraState.rotationY -= dx * 0.008;
      cameraState.rotationX -= dy * 0.008;
      cameraState.rotationX = Math.max(-Math.PI / 2, Math.min(0, cameraState.rotationX));
      lastX = e.clientX; lastY = e.clientY;
    });
    threeContainer.addEventListener('wheel', e => {
      cameraState.zoom *= (1 + e.deltaY * 0.0015 * zoomSpeedMultiplier);
      cameraState.zoom = Math.max(0.01, Math.min(cameraState.zoom, 6));
    });
  }
  applyPreviewQuality();
  applyMapBrightness();
  const tileQualityConfig = getTerrainTileQualityConfig();
  const tileTextureSize = tileQualityConfig.size;
  const tileDebugScale = tileTextureSize / 32;
  const showTileId = !!(typeof showTileIdCheckbox !== "undefined" && showTileIdCheckbox && showTileIdCheckbox.checked);
  const uniqueTiles = new Map();
  for (let y = 0; y < mapH; ++y) {
    for (let x = 0; x < mapW; ++x) {
      const tileIdx = mapTiles[y][x];
      const hVal = mapHeights[y][x];
      const rotVal = (mapRotations[y]?.[x] || 0) & 0x03;
      const xFlipVal = !!mapXFlip[y]?.[x];
      const yFlipVal = !!mapYFlip[y]?.[x];
      const keyHeight = showHeight ? hVal : '';
      const key = `${tileIdx}_${keyHeight}`;
      if (!uniqueTiles.has(key)) {
        uniqueTiles.set(key, { tileIdx, height: hVal, positions: [] });
      }
      uniqueTiles.get(key).positions.push({ x, y, h: hVal, rotation: rotVal, xFlip: xFlipVal, yFlip: yFlipVal });
    }
  }
  uniqueTiles.forEach(({ tileIdx, height: heightVal, positions }) => {
    const img = tileImages[tileIdx];
    const canvas = document.createElement('canvas');
    canvas.width = tileTextureSize;
    canvas.height = tileTextureSize;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = tileQualityConfig.smoothing;
    fillTileCanvasBase(ctx, tileIdx, tileTextureSize);
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, 0, 0, tileTextureSize, tileTextureSize);
    } else {
      ctx.fillStyle = '#393';
      ctx.fillRect(0, 0, tileTextureSize, tileTextureSize);
    }
// --- draw small type swatch on map when enabled ---
try {
  if (typeof showTileTypesOnMapCheckbox !== 'undefined' && showTileTypesOnMapCheckbox && showTileTypesOnMapCheckbox.checked) {
    const typeCode = (typeof tileTypesById !== 'undefined' && tileTypesById.length) ? (tileTypesById[tileIdx] ?? 0) : 0;
    const col = (typeof TILE_TYPE_COLORS !== 'undefined' && TILE_TYPE_COLORS[typeCode % TILE_TYPE_COLORS.length]) ? TILE_TYPE_COLORS[typeCode % TILE_TYPE_COLORS.length] : '#888';
    ctx.fillStyle = col;
    const d = Math.max(6, Math.round(6 * tileDebugScale));
    const o = Math.max(2, Math.round(2 * tileDebugScale));
    ctx.fillRect(o, o, d, d);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(o, o, d, d);
  }
} catch(e) {}
      if (showTileId) {
        ctx.save();
        ctx.font = "bold " + Math.round(14 * tileDebugScale) + "px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = Math.max(2, Math.round(2 * tileDebugScale));
        ctx.strokeText(tileIdx, tileTextureSize / 2, 0);
        ctx.fillStyle = "#FFF";
        ctx.fillText(tileIdx, tileTextureSize / 2, 0);
        ctx.restore();
      }
      if (showHeight) {
        ctx.save();
        ctx.font = "bold " + Math.round(14 * tileDebugScale) + "px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = Math.max(2, Math.round(2 * tileDebugScale));
        ctx.strokeText(heightVal, tileTextureSize / 2, tileTextureSize);
        ctx.fillStyle = "#FFF";
        ctx.fillText(heightVal, tileTextureSize / 2, tileTextureSize);
        ctx.restore();
      }
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = tileQualityConfig.magFilter;
    tex.minFilter = tileQualityConfig.minFilter;
    tex.anisotropy = Math.min(
      tileQualityConfig.anisotropy,
      renderer?.capabilities?.getMaxAnisotropy?.() || tileQualityConfig.anisotropy
    );
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    const material = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const buffers = { positions: [], uvs: [], indices: [] };
    positions.forEach(pos => {
      addTerrainTileGeometry(buffers, pos.x, pos.y, pos.rotation, pos.xFlip, pos.yFlip);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
    geometry.setIndex(buffers.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const tileMesh = new THREE.Mesh(geometry, material);
    scene.add(tileMesh);
  });
  if (objectsGroup && !scene.children.includes(objectsGroup)) {
    scene.add(objectsGroup);
  }
  refreshTileGrid();
  updateMinimap();
  restoreHeightViewHighlight();
// --- Frustum & distance culling (added 2025-08-16) ---
const __frustum = new THREE.Frustum();
const __projScreenMatrix = new THREE.Matrix4();
const __tmpVec3 = new THREE.Vector3();
function updateCulling() {
  if ((!ENABLE_DISTANCE_CULLING && !ENABLE_FRUSTUM_CULLING) || !camera || !scene) return;
  if (ENABLE_FRUSTUM_CULLING) {
    __projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    __frustum.setFromProjectionMatrix(__projScreenMatrix);
  }
  const camPos = camera.position;
  scene.traverse(obj => {
    const ud = obj.userData || {};
    if (!ud.cullable) return;
    // Start visible by default
    let visible = true;
    if (ENABLE_DISTANCE_CULLING) {
      obj.getWorldPosition(__tmpVec3);
      const dist = __tmpVec3.distanceTo(camPos);
      if (dist > CULL_DISTANCE) visible = false;
    }
    if (visible && ENABLE_FRUSTUM_CULLING) {
      let bs = ud.boundingSphere;
      if (!bs) {
        // compute once and store
        const box = new THREE.Box3().setFromObject(obj);
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        ud.boundingSphere = sphere;
        obj.userData = ud;
        bs = sphere;
      }
      if (bs) {
        // transform sphere center to world
        const worldCenter = obj.localToWorld(bs.center.clone());
        const worldSphere = new THREE.Sphere(worldCenter, bs.radius);
        visible = __frustum.intersectsSphere(worldSphere);
      }
    }
    obj.visible = visible;
  });
}
  function animate() {
    let moveX = 0, moveZ = 0;
    const cameraMoveStep = cameraState.camMoveSpeed * cameraState.zoom * cameraSpeedMultiplier;
    if (cameraState.keys['w']) moveZ -= cameraMoveStep;
    if (cameraState.keys['s']) moveZ += cameraMoveStep;
    if (cameraState.keys['a']) moveX -= cameraMoveStep;
    if (cameraState.keys['d']) moveX += cameraMoveStep;
    if (cameraState.keys['arrowup']) moveZ -= cameraMoveStep;
    if (cameraState.keys['arrowdown']) moveZ += cameraMoveStep;
    if (cameraState.keys['arrowleft']) moveX -= cameraMoveStep;
    if (cameraState.keys['arrowright']) moveX += cameraMoveStep;
    if (moveX || moveZ) {
      const angle = cameraState.rotationY;
      const fx = Math.sin(angle);
      const fz = Math.cos(angle);
      const rx = Math.sin(angle + Math.PI / 2);
      const rz = Math.cos(angle + Math.PI / 2);
      cameraState.camTargetX += fx * moveZ + rx * moveX;
      cameraState.camTargetZ += fz * moveZ + rz * moveX;
      cameraState.camTargetX = Math.max(-CAM_EDGE_MARGIN, Math.min(mapW - 1 + CAM_EDGE_MARGIN, cameraState.camTargetX));
      cameraState.camTargetZ = Math.max(-CAM_EDGE_MARGIN, Math.min(mapH - 1 + CAM_EDGE_MARGIN, cameraState.camTargetZ));
      if (isBuildPlacementPreviewMode() && isKeyboardCameraMoving() && !placementPreviewPausedByCamera) {
        placementPreviewPausedByCamera = true;
        clearStructurePlacementPreview();
      }
    }
    let dist = Math.max(mapW, mapH) * 1.5 * cameraState.zoom;
    let camY = Math.abs(Math.sin(cameraState.rotationX)) * dist + 3;
    camera.position.x = cameraState.camTargetX + Math.sin(cameraState.rotationY) * Math.cos(cameraState.rotationX) * dist;
    camera.position.y = camY;
    camera.position.z = cameraState.camTargetZ + Math.cos(cameraState.rotationY) * Math.cos(cameraState.rotationX) * dist;
    camera.lookAt(cameraState.camTargetX, 0, cameraState.camTargetZ);
    if (compassNeedle) {
      const deg = -cameraState.rotationY * 180 / Math.PI;
      compassNeedle.setAttribute('transform', `rotate(${deg} 50 50)`);
    }
    updateCulling();
    updateDroidAnimations(objectsGroup, performance.now());
    renderer.render(scene, camera);
    animationId = requestAnimationFrame(animate);
  }
  animate();
}
if (showTileIdCheckbox) showTileIdCheckbox.addEventListener('change', () => drawMap3D());
if (showTileTypesOnMapCheckbox) showTileTypesOnMapCheckbox.addEventListener('change', () => drawMap3D());
if (showTileTypesCheckbox) showTileTypesCheckbox.addEventListener('change', () => {
  try {
    const pal = document.getElementById('displayTileTypes');
    if (pal) pal.checked = !!showTileTypesCheckbox.checked;
    // if tiles.js exposed palette refresh, call it; otherwise drawMap3D is enough
    if (typeof window.refreshTexturePalette === 'function') window.refreshTexturePalette();
  } catch(e) {}
  drawMap3D();
});
function resizeMap(newW, newH) {
  if (newW === mapW && newH === mapH) return;
  const oldState = {
    w: mapW,
    h: mapH,
    tiles: mapTiles,
    rotations: mapRotations,
    heights: mapHeights,
    xflip: mapXFlip,
    yflip: mapYFlip,
    triflip: mapTriFlip
  };
  const newTiles = Array(newH).fill().map(() => Array(newW).fill(0));
  const newRotationsArr = Array(newH).fill().map(() => Array(newW).fill(0));
  const newHeightsArr = Array(newH).fill().map(() => Array(newW).fill(0));
  const newXFlipArr = Array(newH).fill().map(() => Array(newW).fill(false));
  const newYFlipArr = Array(newH).fill().map(() => Array(newW).fill(false));
  const newTriFlipArr = Array(newH).fill().map(() => Array(newW).fill(false));
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      if (y < oldState.h && x < oldState.w) {
        newTiles[y][x] = mapTiles[y][x];
        newRotationsArr[y][x] = mapRotations[y][x];
        newHeightsArr[y][x] = mapHeights[y][x];
        newXFlipArr[y][x] = mapXFlip[y][x];
        newYFlipArr[y][x] = mapYFlip[y][x];
        newTriFlipArr[y][x] = mapTriFlip[y][x];
      }
    }
  }
  const newState = {
    w: newW,
    h: newH,
    tiles: newTiles,
    rotations: newRotationsArr,
    heights: newHeightsArr,
    xflip: newXFlipArr,
    yflip: newYFlipArr,
    triflip: newTriFlipArr
  };
  setMapState(newW, newH, newTiles, newRotationsArr, newHeightsArr, newXFlipArr, newYFlipArr, newTriFlipArr);
  pushUndo({ type: 'resize', oldState, newState });
}

async function newMap() {
  currentLocalSaveId = null;
  currentMapArchive = null;
  currentMapArchivePath = null;
  currentMapExportInfo = null;
  currentStructArchivePath = null;
  currentStructJsonStyle = 'array';
  resetLoadedMetadata();
  applyUserMapInfoToMapInfo();
  await setTileset(0);
  const w = DEFAULT_MAP_W;
  const h = DEFAULT_MAP_H;
  const tiles = Array(h).fill().map(() => Array(w).fill(0));
  const rotations = Array(h).fill().map(() => Array(w).fill(0));
  const heights = Array(h).fill().map(() => Array(w).fill(0));
  const xflip = Array(h).fill().map(() => Array(w).fill(false));
  const yflip = Array(h).fill().map(() => Array(w).fill(false));
  const triflip = Array(h).fill().map(() => Array(w).fill(false));
  clearMapObjects();
  setMapState(w, h, tiles, rotations, heights, xflip, yflip, triflip);
  undoStack.length = 0;
  redoStack.length = 0;
  markMapClean();
  updateUndoRedoButtons();
}
window.newMap = newMap;

function getStructurePlacementPosition(group, tileX, tileY, sizeX, sizeY, minH) {
  const centerX = group.userData.centerX;
  const centerZ = group.userData.centerZ;
  const posX = tileX + sizeX / 2 - centerX;
  // Offset slightly so structure floors render above the terrain
  const posY = minH + 0.02 - group.userData.minY;
  const posZ = tileY + sizeY / 2 - centerZ;
  return new THREE.Vector3(posX, posY, posZ);
}
// --- Repatch: unified objects preview using buildStructureGroup (2025-08-19) ---
function updateHighlight(event) {
  if (placementPreviewPausedByCamera && isBuildPlacementPreviewMode()) return;

  if (isTileTemplatePasteMode() && (activeTab === 'view' || activeTab === 'textures' || activeTab === 'templates' || activeTab === 'height')) {
    updateTileTemplatePlacementPreview(event);
    return;
  }

  if (isCopiedMapObjectPasteMode() && ['view', 'objects', 'droids', 'features'].includes(activeTab)) {
    updateCopiedMapObjectPlacementPreview(event);
    return;
  }

  if (activeTab === 'view') {
    const terrainStats = getViewTerrainSelectionStats();
    const bounds = terrainStats?.tileBounds || terrainStats?.heightBounds;
    if (bounds && scene) {
      const previewKey = 'view-terrain-selection|' + bounds.minX + '|' + bounds.minY + '|' + bounds.width + '|' + bounds.height;
      if (previewKey === highlightCachedKey && previewGroup && highlightMesh) return;
      clearStructurePlacementPreview();
      previewGroup = new THREE.Group();
      highlightMesh = createTerrainHighlightMesh(bounds.minX, bounds.minY, bounds.width, bounds.height, 0x6CF527, 0.24, 0.055);
      previewGroup.add(highlightMesh);
      previewGroup.traverse(obj => obj.layers.set(1));
      scene.add(previewGroup);
      highlightCachedKey = previewKey;
      return;
    }
    if (!isCopiedMapObjectPasteMode()) clearStructurePlacementPreview();
  }

  if (activeTab === 'height' && heightViewMode) {
    const bounds = getHeightSelectionBounds();
    if ((!bounds && !heightViewTile) || !scene) {
      clearStructurePlacementPreview();
      return;
    }
    const x = bounds ? bounds.minX : heightViewTile.x;
    const y = bounds ? bounds.minY : heightViewTile.y;
    const width = bounds ? bounds.width : 1;
    const height = bounds ? bounds.height : 1;
    const previewKey = 'height-view|' + x + '|' + y + '|' + width + '|' + height;
    if (previewKey === highlightCachedKey && previewGroup && highlightMesh) return;
    clearStructurePlacementPreview();
    previewGroup = new THREE.Group();
    highlightMesh = createTerrainHighlightMesh(x, y, width, height, 0x6CF527, 0.3, 0.055);
    previewGroup.add(highlightMesh);
    previewGroup.traverse(obj => obj.layers.set(1));
    scene.add(previewGroup);
    highlightCachedKey = previewKey;
    return;
  }

  if (activeTab === 'height' && heightSelectionMode) {
    if (!threeContainer || !scene) return;
    let startX, startY, endX, endY;
    if (heightSelectStart && heightSelectEnd) {
      startX = heightSelectStart.x;
      startY = heightSelectStart.y;
      endX = heightSelectEnd.x;
      endY = heightSelectEnd.y;
    } else {
      if (!event) return;
      const rect = threeContainer.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      if (!intersects.length) {
        if (highlightMesh) {
          scene.remove(highlightMesh);
          highlightMesh = null;
        }
        return;
      }
      const p = intersects[0].point;
      const tileX = Math.floor(p.x);
      const tileY = Math.floor(p.z);
      if (tileX < 0 || tileX >= mapW || tileY < 0 || tileY >= mapH) {
        if (highlightMesh) {
          scene.remove(highlightMesh);
          highlightMesh = null;
        }
        return;
      }
      if (heightSelectStart) {
        startX = heightSelectStart.x;
        startY = heightSelectStart.y;
        endX = tileX;
        endY = tileY;
      } else {
        startX = tileX;
        startY = tileY;
        endX = tileX;
        endY = tileY;
      }
    }
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    if (highlightMesh) {
      scene.remove(highlightMesh);
      if (highlightMesh.geometry) highlightMesh.geometry.dispose();
      if (highlightMesh.material) highlightMesh.material.dispose();
      highlightMesh = null;
    }
    highlightMesh = createTerrainHighlightMesh(minX, minY, width, height, 0xffff00, 0.3);
    scene.add(highlightMesh);
    updateHeightApplyBtn();
    return;
  }
  if (activeTab === 'textures' && tileSelectionMode) {
    if (!threeContainer || !scene) return;
    let startX, startY, endX, endY;
    if (tileSelectStart) {
      if (!tileSelectionFixed && event) {
        const rect = threeContainer.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (!intersects.length) {
          if (highlightMesh) {
            scene.remove(highlightMesh);
            highlightMesh = null;
          }
          return;
        }
        const p = intersects[0].point;
        const tileX = Math.floor(p.x);
        const tileY = Math.floor(p.z);
        if (tileX < 0 || tileX >= mapW || tileY < 0 || tileY >= mapH) {
          if (highlightMesh) {
            scene.remove(highlightMesh);
            highlightMesh = null;
          }
          return;
        }
        tileSelectEnd = { x: tileX, y: tileY };
      }
      startX = tileSelectStart.x;
      startY = tileSelectStart.y;
      endX = tileSelectEnd ? tileSelectEnd.x : tileSelectStart.x;
      endY = tileSelectEnd ? tileSelectEnd.y : tileSelectStart.y;
    } else {
      if (!event) return;
      const rect = threeContainer.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      if (!intersects.length) {
        if (highlightMesh) {
          scene.remove(highlightMesh);
          highlightMesh = null;
        }
        return;
      }
      const p = intersects[0].point;
      const tileX = Math.floor(p.x);
      const tileY = Math.floor(p.z);
      if (tileX < 0 || tileX >= mapW || tileY < 0 || tileY >= mapH) {
        if (highlightMesh) {
          scene.remove(highlightMesh);
          highlightMesh = null;
        }
        return;
      }
      startX = tileX;
      startY = tileY;
      endX = tileX;
      endY = tileY;
    }
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    if (highlightMesh) {
      scene.remove(highlightMesh);
      if (highlightMesh.geometry) highlightMesh.geometry.dispose();
      if (highlightMesh.material) highlightMesh.material.dispose();
      highlightMesh = null;
    }
    highlightMesh = createTerrainHighlightMesh(minX, minY, width, height, 0xffff00, 0.3);
    scene.add(highlightMesh);
    updateTileApplyBtn();
    return;
  }
  if (activeTab === 'textures' && tileViewMode) {
    if (tileSelectStart && tileSelectEnd) {
      const minX = Math.min(tileSelectStart.x, tileSelectEnd.x);
      const maxX = Math.max(tileSelectStart.x, tileSelectEnd.x);
      const minY = Math.min(tileSelectStart.y, tileSelectEnd.y);
      const maxY = Math.max(tileSelectStart.y, tileSelectEnd.y);
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const previewKey = 'tile-view-selection|' + minX + '|' + minY + '|' + width + '|' + height + '|' + tileSelectionFixed;
      if (previewKey === highlightCachedKey && previewGroup && highlightMesh) return;
      clearStructurePlacementPreview();
      previewGroup = new THREE.Group();
      highlightMesh = createTerrainHighlightMesh(minX, minY, width, height, 0x6CF527, 0.3, 0.055);
      previewGroup.add(highlightMesh);
      previewGroup.traverse(obj => obj.layers.set(1));
      scene.add(previewGroup);
      highlightCachedKey = previewKey;
      updateTileApplyBtn();
      return;
    }
    clearStructurePlacementPreview();
    return;
  }
  if (activeTab === 'templates') {
    clearHoveredStructure();
    clearHoveredDroid();
    const template = getTemplateWithPlacementOptions(getSelectedStructureTemplate());
    const tile = getMapTileFromEvent(event);
    if (!template || !tile) {
      clearStructurePlacementPreview();
      return;
    }
    const modelKey = 'template|' + template.id
      + '|o' + (template.items?.length || 0)
      + '|t' + (template.tileCells?.length || 0)
      + '|h' + (template.heightCells?.length || 0)
      + '|p' + getTemplatePlacementPlayer()
      + '|r' + getTemplatePlacementRotation();
    const previewKey = modelKey + '|' + tile.x + '|' + tile.y;
    if (previewKey === highlightCachedKey && previewGroup && highlightModelKey === modelKey) return;
    if (highlightLoadingKey === previewKey) return;
    clearStructurePlacementPreview();
    highlightLoadingKey = previewKey;
    const token = ++highlightLoadToken;
    updateTemplatePlacementPreview(template, tile.x, tile.y, modelKey, previewKey, token)
      .catch(err => {
        if (highlightLoadingKey === previewKey) highlightLoadingKey = null;
        console.warn('Template placement preview failed:', err);
      });
    return;
  }
  if (activeTab === 'droids') {
    if (!threeContainer || !scene) return;
    if (droidMode !== 'build') {
      clearStructurePlacementPreview();
      setHoveredDroid(event ? pickDroidFromEvent(event) : null);
      return;
    }
    if (!buildPreviewVisible) {
      clearStructurePlacementPreview();
      return;
    }
    clearHoveredDroid();
    if (!event) return;
    const rect = threeContainer.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (!intersects.length) {
      clearStructurePlacementPreview();
      return;
    }
    const point = intersects[0].point;
    const tileX = Math.floor(point.x);
    const tileY = Math.floor(point.z);
    if (tileX < 0 || tileX >= mapW || tileY < 0 || tileY >= mapH) {
      clearStructurePlacementPreview();
      return;
    }
    const droidPreviewPlayer = parseInt(getDroidBuildPlayer(), 10) || 0;
    const design = getSelectedDroidDesign();
    const modelKey = [
      'droid',
      design?.id || '',
      design?.body || '',
      design?.propulsion || '',
      getDroidPrimaryTool(design) || '',
      selectedDroidRotation,
      droidPreviewPlayer
    ].join('|');
    const previewKey = modelKey + '|' + tileX + '|' + tileY;
    if (previewKey === highlightCachedKey && previewGroup && highlightModelGroup && highlightModelKey === modelKey) return;
    if (highlightModelGroup && highlightModelKey !== modelKey) clearPlacementModelPreview();
    clearPlacementSquarePreview();
    highlightCachedKey = previewKey;
    previewGroup = new THREE.Group();
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[droidPreviewPlayer % PLAYER_COLORS.length], transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    highlightMesh = new THREE.Mesh(geo, mat);
    const h = (mapHeights?.[tileY]?.[tileX] ?? 0) * HEIGHT_SCALE;
    highlightPreviewTarget = { type: 'droid', modelKey, tileX, tileY, h };
    highlightMesh.position.set(tileX + 0.5, h + 0.03, tileY + 0.5);
    previewGroup.add(highlightMesh);
    previewGroup.traverse(obj => obj.layers.set(1));
    scene.add(previewGroup);
    if (highlightModelGroup && highlightModelKey === modelKey) {
      const cX = highlightModelGroup.userData.centerX || 0;
      const cZ = highlightModelGroup.userData.centerZ || 0;
      const minY = highlightModelGroup.userData.minY || 0;
      highlightModelGroup.position.set(tileX + 0.5 - cX, h + 0.07 - minY, tileY + 0.5 - cZ);
      highlightModelGroup.rotation.y = -selectedDroidRotation * Math.PI / 180;
      if (!scene.children.includes(highlightModelGroup)) scene.add(highlightModelGroup);
      return;
    }
    if (highlightLoadingKey === modelKey) return;
    highlightLoadingKey = modelKey;
    const thisToken = ++highlightLoadToken;
    loadComponentDefs()
      .then(() => {
        const entry = makeDroidEntry(design, droidPreviewPlayer, tileX, tileY, selectedDroidRotation);
        const pieList = getDroidPieList(entry);
        if (!pieList || !pieList.length) return null;
        return buildDroidGroup(pieList);
      })
      .then(group => {
        if (!group) return;
        if (thisToken !== highlightLoadToken) {
          disposeObject3D(group);
          return;
        }
        const target = highlightPreviewTarget?.modelKey === modelKey ? highlightPreviewTarget : { tileX, tileY, h };
        const cX = group.userData.centerX || 0;
        const cZ = group.userData.centerZ || 0;
        const minY = group.userData.minY || 0;
        group.position.set(target.tileX + 0.5 - cX, target.h + 0.07 - minY, target.tileY + 0.5 - cZ);
        group.rotation.y = -selectedDroidRotation * Math.PI / 180;
        setPlacementPreviewOpacity(group, 0.65);
        group.traverse(obj => obj.layers.set(1));
        scene.add(group);
        highlightModelGroup = group;
        highlightModelKey = modelKey;
        highlightCachedKey = previewKey;
        highlightLoadingKey = null;
      })
      .catch(err => {
        if (highlightLoadingKey === modelKey) highlightLoadingKey = null;
        console.warn('Droid placement preview failed:', err);
      });
    return;
  }
  // For other textures/height/object behavior
  if (activeTab !== 'objects' && activeTab !== 'features') {
    return __old_updateHighlight(event);
  }
  if (!threeContainer || !scene) return;
  if (activeTab !== 'objects' && activeTab !== 'features') return;
  const placingFeatures = activeTab === 'features';
  const buildMode = placingFeatures ? featureMode : structureMode;
  if (buildMode !== 'build') {
    clearStructurePlacementPreview();
    setHoveredStructure(event ? (placingFeatures ? pickFeatureFromEvent(event) : pickStructureFromEvent(event, false)) : null, buildMode);
    return;
  }
  if (!buildPreviewVisible) {
    clearStructurePlacementPreview();
    return;
  }
  clearHoveredStructure();
  // Read mouse
  let clientX, clientY;
  if (event) {
    clientX = event.clientX;
    clientY = event.clientY;
  } else {
    return;
  }
  const rect = threeContainer.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  if (!intersects.length) {
    clearStructurePlacementPreview();
    return;
  }
  const point = intersects[0].point;
  const tileX = Math.floor(point.x);
  const tileY = Math.floor(point.z);
  if (tileX < 0 || tileX >= mapW || tileY < 0 || tileY >= mapH) {
    clearStructurePlacementPreview();
    return;
  }
  const selectedIndex = placingFeatures ? selectedFeatureIndex : selectedStructureIndex;
  const defs = placingFeatures ? FEATURE_DEFS : STRUCTURE_DEFS;
  const rotation = placingFeatures ? selectedFeatureRotation : selectedStructureRotation;
  if (selectedIndex < 0 || !defs || !defs.length) {
    return;
  }
  const def = defs[selectedIndex];
  const previewIsFeature = placingFeatures || !!def.feature;
  let sizeX = def.sizeX || 1;
  let sizeY = def.sizeY || 1;
  if (rotation % 2 === 1) {
    const tmpXY = sizeX;
    sizeX = sizeY;
    sizeY = tmpXY;
  }
  const placement = getStructurePlacementValidity(def, tileX, tileY, sizeX, sizeY);
  let previewDef = def;
  const moduleRule = getModuleParentTypes(def);
  if (moduleRule && placement.parentGroup) {
    const parentDef = getStructureGroupDef(placement.parentGroup);
    previewDef = getStructureRenderDef(parentDef, getStructureModuleCount(placement.parentGroup) + 1);
  }
  const previewPlayer = previewIsFeature ? 0 : getStructureBuildPlayer();
  let previewRotation = rotation;
  const wallShape = !previewIsFeature && !moduleRule
    ? getWallShapeInfo(def, tileX, tileY, previewPlayer, rotation)
    : null;
  if (wallShape) {
    previewDef = wallShape.renderDef;
    previewRotation = wallShape.rot;
  }
  const modelKey = [
    previewIsFeature ? 'feature' : 'structure',
    previewDef.id,
    previewRotation,
    previewPlayer,
    sizeX,
    sizeY,
    wallShape ? wallShape.modelIndex + ':' + wallShape.mask : '',
    getStructureModuleCount(placement.parentGroup),
    placement.valid ? 'ok' : 'blocked'
  ].join('|');
  const previewKey = modelKey + '|' + tileX + '|' + tileY;
  if (previewKey === highlightCachedKey && previewGroup && (moduleRule || (highlightModelGroup && highlightModelKey === modelKey))) return;
  if (highlightModelGroup && highlightModelKey !== modelKey) clearPlacementModelPreview();
  // Ground plane highlight (green)
  let minH2 = Infinity;
  for (let dy = 0; dy < sizeY; dy++) {
    for (let dx = 0; dx < sizeX; dx++) {
      const tx = tileX + dx;
      const ty = tileY + dy;
      if (tx >= 0 && tx < mapW && ty >= 0 && ty < mapH) {
        const h = mapHeights[ty][tx] * HEIGHT_SCALE;
        if (h < minH2) minH2 = h;
      }
    }
  }
  clearPlacementSquarePreview();
  previewGroup = new THREE.Group();
  const planeColor = placement.valid && !previewIsFeature
    ? PLAYER_COLORS[(parseInt(previewPlayer, 10) || 0) % PLAYER_COLORS.length]
    : (placement.valid ? 0x00ff00 : 0xff3333);
  const planeMesh = createTerrainHighlightMesh(tileX, tileY, sizeX, sizeY, planeColor, 0.45, moduleRule ? 0.08 : 0.025);
  highlightPreviewTarget = {
    type: previewIsFeature ? 'feature' : 'structure',
    modelKey,
    tileX,
    tileY,
    sizeX,
    sizeY,
    baseH: isFinite(minH2) ? minH2 : 0
  };
  highlightMesh = planeMesh;
  previewGroup.add(planeMesh);
  previewGroup.traverse(obj => obj.layers.set(1));
  scene.add(previewGroup);
  // Clear old model preview
  if (highlightModelGroup) {
    scene.remove(highlightModelGroup);
    highlightModelGroup.traverse(child => {
      if (child.isMesh) {
        if (child.material && child.material.map) child.material.map.dispose();
        if (child.material) child.material.dispose();
        if (child.geometry) child.geometry.dispose();
      }
    });
    highlightModelGroup = null;
  }
  if (moduleRule) {
    highlightCachedKey = previewKey;
    highlightLoadingKey = null;
    return;
  }
  if (highlightModelGroup && highlightModelKey === modelKey) {
    const baseH = isFinite(minH2) ? minH2 : 0;
    const pos = getStructurePlacementPosition(highlightModelGroup, tileX, tileY, sizeX, sizeY, baseH);
    pos.y += 0.02;
    highlightModelGroup.position.copy(pos);
    if (!scene.children.includes(highlightModelGroup)) scene.add(highlightModelGroup);
    highlightCachedKey = previewKey;
    return;
  }
  if (highlightLoadingKey === modelKey) return;
  highlightLoadingKey = modelKey;
  const thisToken = ++highlightLoadToken;
  // Build unified preview using the same function as final placement
  buildStructureGroup(previewDef, previewRotation, sizeX, sizeY, null, 0.55)
    .then(group => {
      if (thisToken !== highlightLoadToken) return; // stale
      // Use the same placement logic as for final structures to keep
      // preview alignment consistent. Compute the base position using
      // the structure's center and minY, then nudge it slightly upward
      // to avoid z-fighting with the ground.
      const target = highlightPreviewTarget?.modelKey === modelKey ? highlightPreviewTarget : { tileX, tileY, sizeX, sizeY, baseH: isFinite(minH2) ? minH2 : 0 };
      const pos = getStructurePlacementPosition(group, target.tileX, target.tileY, target.sizeX, target.sizeY, target.baseH);
      pos.y += 0.02;
      group.position.copy(pos);
      if (!previewIsFeature) setStructureGroupPlayerColor(group, previewPlayer);
      tintPlacementPreview(group, placement.valid);
      group.traverse(obj => obj.layers.set(1));
      scene.add(group);
      highlightModelGroup = group;
      highlightModelKey = modelKey;
      highlightCachedId = previewDef.id;
      highlightCachedRot = previewRotation;
      highlightCachedKey = previewKey;
      highlightLoadingKey = null;
    })
    .catch(err => {
      if (highlightLoadingKey === modelKey) highlightLoadingKey = null;
      console.warn("Unified preview failed:", err);
    });
}
// Ensure "Tile" row uses smaller font size and stays in one line
(function(){
  try {
    const idSpan = document.getElementById('selectedTileIdDisplay');
    const parent = idSpan ? idSpan.parentElement : null;
    if (parent) {
      parent.style.whiteSpace = 'nowrap';
      parent.style.fontSize = '12px';
      // also tighten the number span a bit
      idSpan.style.fontSize = '12px';
    }
  } catch(e) {}
})();

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initDom);
} else {
  initDom();
}
