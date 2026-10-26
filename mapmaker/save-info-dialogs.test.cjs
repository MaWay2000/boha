const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {
  const {showSaveInfoDialog, showSaveLicenseHelp} = await import('./js/saveInfoDialogs.js');
  const {metadataText} = await import('./js/archiveImport.js');
  const {getNextMapVersion} = await import('./js/mapVersion.js');
  const source = fs.readFileSync(path.join(__dirname, 'js/game.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const today = new Date();
  const todayDate = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  const extract = name => {
    const start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
    assert(start >= 0, name);
    const rest = source.slice(start), end = rest.search(/\n(?:async )?function /);
    return end < 0 ? rest : rest.slice(0, end);
  };
  let storedInfo = null;
  const defaults = vm.createContext({USER_MAP_INFO_KEY:'test',safeLocalStorageGet:() => storedInfo});
  vm.runInContext(extract('getDefaultUserMapInfo') + '\n' + extract('readUserMapInfo'), defaults);
  for (const value of [null, '{}', '{"license":""}', '{"license":"  "}', 'invalid JSON']) {
    storedInfo = value;
    assert.equal(defaults.readUserMapInfo().license, 'CC0-1.0', 'Missing and legacy blank settings default to CC0');
  }
  for (const value of ['MIT', 'CC-BY-4.0', 'Unknown']) {
    storedInfo = JSON.stringify({license:value});
    assert.equal(defaults.readUserMapInfo().license, value, 'Explicit saved choices remain intact');
  }
  for (const id of ['settingsMapLicenseInput','settingsMyLicenseInput']) {
    const select = html.slice(html.indexOf('<select id="' + id + '"')).split('</select>')[0];
    assert.match(select, /<option value="CC0-1.0" selected>/);
    assert.match(select, /<option value="Unknown">Unknown<\/option>/);
  }
  let doc;
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {};
      this.listeners = {}; this.style = {}; this.value = ''; this.textContent = '';
      const classes = new Set();
      this.classList = {add:name => classes.add(name), remove:name => classes.delete(name), contains:name => classes.has(name)};
    }
    set id(value) { this.attributes.id = value; }
    get id() { return this.attributes.id || ''; }
    set htmlFor(value) { this.attributes.for = value; }
    get htmlFor() { return this.attributes.for || ''; }
    get isConnected() { return this === doc.body || !!this.parent?.isConnected; }
    get options() { return this.querySelectorAll('option'); }
    set innerHTML(value) { assert.equal(value, ''); this.children = []; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
    appendChild(child) { this.append(child); }
    after(node) { node.parent = this.parent; this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, node); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
    querySelectorAll(selector) {
      const matches = node => selector.split(',').some(part => {
        const match = part.trim().match(/^(\w+)?(?:\[(\w+)\])?$/);
        return match && (!match[1] || node.tagName === match[1].toUpperCase()) &&
          (!match[2] || Object.hasOwn(node.attributes, match[2]));
      });
      return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    cloneNode(deep) {
      const copy = new Element(this.tagName);
      copy.attributes = {...this.attributes}; copy.style = {...this.style};
      copy.value = this.value; copy.type = this.type; copy.className = this.className; copy.textContent = this.textContent;
      if (deep) copy.append(...this.children.map(child => child.cloneNode(true)));
      return copy;
    }
    addEventListener(type, callback, options) { (this.listeners[type] ||= []).push({callback, once:options?.once}); }
    dispatchEvent(event) {
      for (const listener of [...(this.listeners[event.type] || [])]) {
        listener.callback(event);
        if (listener.once) this.listeners[event.type] = this.listeners[event.type].filter(item => item !== listener);
      }
      return !event.defaultPrevented;
    }
    focus() { doc.activeElement = this; }
    showModal() { this.open = true; (this.querySelectorAll('input, select, textarea')[0] || this.querySelectorAll('button')[0])?.focus(); }
    close(value = '') { this.returnValue = value; this.open = false; this.dispatchEvent(new Event('close')); }
  }
  const panel = id => {
    const node = new Element('div'); node.id = id; node.style.display = 'none';
    const start = html.indexOf('id="' + id + '"');
    const end = id === 'settingsMapInfoPanel' ? html.indexOf('id="settingsMyInfoPanel"', start) : html.indexOf('id="resetSettingsBtn"', start);
    const fragment = html.slice(start, end);
    const tags = fragment.match(/<input\b[^>]*>|<select\b[^>]*>[\s\S]*?<\/select>|<textarea\b[^>]*>[\s\S]*?<\/textarea>|<label\b[^>]*>[\s\S]*?<\/label>|<button\b[^>]*>[\s\S]*?<\/button>/g);
    for (const tag of tags) {
      const element = new Element(tag.match(/^<(\w+)/)[1]);
      for (const attr of tag.slice(0, tag.indexOf('>')).matchAll(/([\w-]+)="([^"]*)"/g)) element.setAttribute(attr[1], attr[2]);
      if (element.tagName === 'BUTTON') { element.textContent = tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</')); element.type = element.attributes.type; }
      if (element.tagName === 'SELECT') {
        for (const option of tag.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)) {
          const choice = new Element('option'); choice.value = option[1]; choice.textContent = option[2]; element.append(choice);
        }
      }
      node.append(element);
    }
    doc.body.append(node); return node;
  };
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  const activeDialog = () => doc.body.querySelectorAll('dialog').findLast(dialog => dialog.open);
  const edit = (dialog, id, value) => {
    const input = dialog.querySelectorAll('input, select, textarea').find(item => item.id.endsWith('-' + id));
    assert(input, id); input.value = value;
  };
  const submit = dialog => dialog.querySelectorAll('form')[0].dispatchEvent(new Event('submit', {cancelable:true}));
  const cancel = dialog => dialog.querySelectorAll('button').find(button => button.textContent === 'Cancel').dispatchEvent(new Event('click'));
  const title = dialog => dialog.children[0].children[0].textContent;
  const oldDocument = globalThis.document;
  try {
    doc = {body:new Element('body'), createElement:tag => new Element(tag),
      getElementById:id => doc.body.querySelectorAll('[id]').find(element => element.id === id)};
    globalThis.document = doc;
    const myPanel = panel('settingsMyInfoPanel'), mapPanel = panel('settingsMapInfoPanel');
    const licenseHelpDialog = new Element('div'), licenseHelpBody = new Element('div'), licenseHelpBackdrop = new Element('div');
    licenseHelpBody.id = 'licenseHelpBody'; licenseHelpDialog.append(licenseHelpBody);
    licenseHelpDialog.classList.add('hidden'); licenseHelpBackdrop.classList.add('hidden');
    doc.body.append(licenseHelpBackdrop, licenseHelpDialog);
    const fileName = new Element('input'); fileName.value = 'Black'; doc.body.append(fileName); fileName.focus();
    let userInfo = {author:'My author',license:'MIT',source:'My page'}, dirty = 0, picks = [], packed = [], writes = 0, failWrite = false;
    const status = [];
    const ctx = vm.createContext({document:doc, showSaveInfoDialog, showSaveLicenseHelp, licenseHelpDialog, licenseHelpBody, licenseHelpBackdrop, metadataText, getNextMapVersion, console, mapSaveInProgress:false,
      mapDirty:false,savedMapVersion:'',
      currentMapArchive:null,tilesetIndex:0,getOfficialTilesetName:() => 'arizona',
      currentLevelJson:{name:'Black',author:'Original author',license:'GPL 2+',players:4,source:'Original page',description:'Original description'},
      currentServerMapMetadata:null, currentServerMapSourceName:'', currentMapInfoOverrides:{},
      readUserMapInfo:() => ({...userInfo}), writeUserMapInfo:info => { userInfo = {...info}; },
      markMapDirty:() => { dirty++; ctx.mapDirty = true; }, getCurrentMapFilename:() => fileName.value,
      setCurrentMapName:name => { fileName.value = name; },
      updateScavengerInfoInput:() => { ctx.settingsMapScavengersInput.value = ctx.currentMapInfoOverrides.scavengers || ''; },
      validation:{errors:[],warnings:[],info:[]}, validateMapForExport:() => ctx.validation,
      validationAccepted:true, showValidationDialog:async () => ctx.validationAccepted,
      hideSaveResult(){}, setFileStatus:text => status.push(text), setLoadingProgress(){}, markMapClean(){ ctx.mapDirty = false; }, setTimeout(){},
      buildWzFileBlob:async () => {
        packed.push({name:ctx.getSaveMapName(),author:ctx.getSaveAuthor(),license:ctx.getSaveLicense(),source:ctx.getSaveSourceName(),version:ctx.getSaveMapVersion(),info:{...ctx.currentMapInfoOverrides}});
        return {size:10};
      },
      window:{showSaveFilePicker:async options => {
        picks.push(options.suggestedName);
        return {createWritable:async () => ({write:async () => { if (failWrite) throw Error('Test write failure'); writes++; },close:async () => {}})};
      }}
    });
    for (const input of [...myPanel.querySelectorAll('input, select, textarea'), ...mapPanel.querySelectorAll('input, select, textarea')]) ctx[input.id] = input;
    for (const name of ['getDefaultUserMapInfo','getDefaultMapInfoOverrides','getMetadataText','ensureLicenseOption',
      'syncMyInfoInputs','applyUserMapInfoToMapInfo','updateUserMapInfoField','updateMapInfoInputs',
      'setMapInfoOverrideField','getSaveMapName','getSaveAuthor','getSaveLicense','getSaveMapVersion','getSaveSourceName',
      'getSafeMapBase','makeSaveFilename','buildDefaultLevelJson','getLicenseUseText','showLicenseHelpDialog','closeLicenseHelpDialog',
      'confirmMapSaveInfo','saveCurrentMap']) vm.runInContext(extract(name), ctx);
    ctx.currentMapInfoOverrides = ctx.getDefaultMapInfoOverrides();
    // Bind the production Settings change handlers, which the cloned form reuses on confirmation.
    const normalized = source.replace(/\r\n/g, '\n');
    const start = normalized.indexOf('  [\n    [settingsMapNameInput,');
    assert(start >= 0);
    vm.runInContext(normalized.slice(start, normalized.indexOf('  if (resetSettingsBtn)', start)), ctx);

    ctx.licenseHelpBtn = doc.getElementById('licenseHelpBtn');
    ctx.mapLicenseHelpBtn = doc.getElementById('mapLicenseHelpBtn');
    const helpBindings = normalized.indexOf('  if (licenseHelpBtn)');
    vm.runInContext(normalized.slice(helpBindings, normalized.indexOf('  if (licenseHelpOkBtn)', helpBindings)), ctx);
    for (const helpButton of [ctx.licenseHelpBtn, ctx.mapLicenseHelpBtn]) {
      assert(helpButton); helpButton.dispatchEvent(new Event('click'));
      assert.equal(licenseHelpDialog.classList.contains('hidden'), false, 'Both Settings license buttons open the same help');
      ctx.closeLicenseHelpDialog();
    }
    assert.equal(licenseHelpDialog.classList.contains('hidden'), true);

    let saving = ctx.saveCurrentMap(); await flush();
    let dialog = activeDialog(); assert.equal(title(dialog), 'My info');
    assert.equal(dialog.querySelectorAll('input, select, textarea').length, 3);
    assert.equal(dialog.querySelectorAll('input')[0].value, 'My author');
    assert.equal(picks.length, 0); assert.equal(packed.length, 0);
    await ctx.saveCurrentMap(); assert.equal(doc.body.querySelectorAll('dialog').length, 1, 'Repeated Save does not stack dialogs');
    edit(dialog, 'settingsMyAuthorInput', 'Unsaved draft');
    const helpButton = dialog.querySelectorAll('button').find(button => button.id.endsWith('-licenseHelpBtn'));
    assert(helpButton, 'The same question mark is available beside Default license');
    assert.equal(helpButton.textContent, '?'); assert.equal(helpButton.type, 'button');
    helpButton.focus(); helpButton.dispatchEvent(new Event('click'));
    let help = activeDialog();
    assert.notEqual(help, dialog); assert.equal(help.children[0].textContent, 'License help');
    assert.equal(help.open, true); assert.equal(dialog.open, true, 'Help opens above the save form');
    assert.deepEqual(help.querySelectorAll('strong').map(element => element.textContent),
      licenseHelpBody.querySelectorAll('strong').map(element => element.textContent), 'Help reuses the existing license explanations');
    assert(help.querySelectorAll('strong').length > 0);
    assert.equal(help.querySelectorAll('[id]').length, 0, 'Nested help does not duplicate source IDs');
    assert.equal(licenseHelpDialog.classList.contains('hidden'), true, 'The non-modal Settings dialog stays hidden');
    assert.equal(userInfo.author, 'My author', 'Opening help does not commit draft edits');
    help.querySelectorAll('button')[0].dispatchEvent(new Event('click'));
    assert.equal(activeDialog(), dialog); assert.equal(doc.activeElement, helpButton);
    assert.equal(dialog.querySelectorAll('input')[0].value, 'Unsaved draft');
    helpButton.dispatchEvent(new Event('click')); help = activeDialog(); help.close();
    assert.equal(activeDialog(), dialog, 'Escape closes only help, preserving the save step');
    assert.equal(picks.length, 0); assert.equal(packed.length, 0);
    edit(dialog, 'settingsMyAuthorInput', 'New editor');
    edit(dialog, 'settingsMySourceInput', 'My new page');
    submit(dialog); await flush();
    assert.equal(userInfo.author, 'New editor'); assert.equal(userInfo.source, 'My new page');
    dialog = activeDialog(); assert.equal(title(dialog), 'Map info');
    const mapInputs = dialog.querySelectorAll('input, select, textarea');
    assert.equal(mapInputs.length, 8, 'Map info omits repeated personal fields and the original uploaded date');
    assert.equal(mapInputs.find(input => input.id.endsWith('-settingsMapCreatedInput')).value, todayDate, 'Blank Created date defaults to local today');
    assert.equal(ctx.settingsMapCreatedInput.value, '', 'Default stays in the draft until confirmed');
    for (const id of ['settingsMapAuthorInput','settingsMapLicenseInput','settingsMapSourceInput','settingsMapUploadedInput']) {
      assert(!mapInputs.some(input => input.id.endsWith('-' + id)), 'No omitted save field: ' + id);
      assert(!dialog.querySelectorAll('label[for]').some(label => label.htmlFor.endsWith('-' + id)), 'No orphan label: ' + id);
    }
    assert.equal(ctx.settingsMapAuthorInput.value, 'Original author', 'Original author remains in Settings');
    assert.equal(ctx.settingsMapLicenseInput.value, 'GPL 2+');
    assert.equal(ctx.settingsMapSourceInput.value, 'Original page');
    assert.equal(mapInputs.find(input => input.id.endsWith('-settingsMapDescriptionInput')).value, 'Original description');
    assert(ctx.settingsMapLicenseInput.options.some(option => option.value === 'GPL 2+'), 'Nonstandard imported license is retained');
    assert(!dialog.querySelectorAll('button').some(button => button.id.endsWith('-mapLicenseHelpBtn')), 'No detached help button after omitting the License row');
    const allIds = doc.body.querySelectorAll('[id]').map(element => element.id);
    assert.equal(new Set(allIds).size, allIds.length, 'Cloned controls never duplicate Settings IDs');
    for (const label of dialog.querySelectorAll('label[for]')) assert(doc.getElementById(label.htmlFor), 'Labels target cloned fields');
    const key = new Event('keydown', {cancelable:true}); dialog.dispatchEvent(key);
    assert.equal(key.cancelBubble, true); assert.equal(key.defaultPrevented, false, 'Native keyboard behavior, including Escape, is retained');
    edit(dialog, 'settingsMapNameInput', 'Black edited');
    edit(dialog, 'settingsMapCreatedInput', '2014-01-13');
    edit(dialog, 'settingsMapDescriptionInput', 'Edited description\nSecond line');
    edit(dialog, 'settingsMapVersionInput', '2');
    submit(dialog); await saving;
    assert.deepEqual(picks, ['Black-edited.wz'], 'Filename is chosen after Map info edits');
    assert.equal(writes, 1); assert.equal(packed[0].author, 'Original author');
    assert.equal(packed[0].license, 'GPL 2+'); assert.equal(packed[0].source, 'Original page');
    assert.equal(packed[0].info.description, 'Edited description\nSecond line');
    assert.equal(packed[0].info.version, '2'); assert.equal(packed[0].info.scavengers, '', 'Untouched Auto remains automatic');
    assert.equal(packed[0].info.created, '2014-01-13', 'Created date remains editable in the save popup');
    assert.equal(packed[0].info.license, '', 'Untouched imported license is not replaced by a default');
    assert.equal(ctx.mapSaveInProgress, false); assert.equal(activeDialog(), undefined);
    assert.equal(doc.activeElement, fileName); assert.equal(mapPanel.style.display, 'none');

    const beforeCancel = JSON.stringify({userInfo,overrides:ctx.currentMapInfoOverrides,dirty});
    saving = ctx.saveCurrentMap(); await flush();
    edit(activeDialog(), 'settingsMyAuthorInput', 'Discard this'); cancel(activeDialog()); await saving;
    assert.equal(JSON.stringify({userInfo,overrides:ctx.currentMapInfoOverrides,dirty}), beforeCancel, 'Cancel discards unconfirmed My info edits');
    assert.equal(picks.length, 1); assert.equal(packed.length, 1);

    saving = ctx.saveCurrentMap(); await flush(); submit(activeDialog()); await flush();
    edit(activeDialog(), 'settingsMapNameInput', 'Discard map name'); activeDialog().close(); await saving;
    assert.equal(fileName.value, 'Black edited', 'Escape discards Map info edits');
    assert.equal(picks.length, 1); assert.equal(packed.length, 1); assert.equal(ctx.mapSaveInProgress, false);

    const beforeUnchanged = dirty;
    saving = ctx.saveCurrentMap(); await flush(); submit(activeDialog()); await flush();
    assert.equal(activeDialog().querySelectorAll('input').find(input => input.id.endsWith('-settingsMapCreatedInput')).value, '2014-01-13', 'An existing date is preserved');
    submit(activeDialog()); await saving;
    assert.equal(dirty, beforeUnchanged, 'Confirming unchanged forms does not mutate metadata');
    assert.equal(writes, 2);
    ctx.validation = {errors:['Invalid terrain'],warnings:[],info:[]}; await ctx.saveCurrentMap();
    assert.equal(activeDialog(), undefined); assert.equal(picks.length, 2, 'Validation errors still block export');
    ctx.validation = {errors:[],warnings:['Warning'],info:[]}; ctx.validationAccepted = false; await ctx.saveCurrentMap();
    assert.equal(activeDialog(), undefined); assert.equal(picks.length, 2, 'Existing validation cancellation still blocks export');

    // A fresh map adopts confirmed personal defaults before Map info opens.
    ctx.currentLevelJson = {name:'Fresh map',players:2}; ctx.currentMapInfoOverrides = ctx.getDefaultMapInfoOverrides();
    ctx.validation = {errors:[],warnings:[],info:[]};
    saving = ctx.saveCurrentMap(); await flush(); edit(activeDialog(), 'settingsMyAuthorInput', 'Fresh author'); submit(activeDialog()); await flush();
    assert.equal(ctx.settingsMapAuthorInput.value, 'Fresh author', 'First-page author is applied without asking again');
    assert.equal(ctx.settingsMapSourceInput.value, 'My new page', 'First-page webpage is applied without asking again');
    cancel(activeDialog()); await saving; assert.equal(picks.length, 2);
    assert.equal(ctx.currentMapInfoOverrides.created, '', 'Cancel does not commit the default date');

    userInfo = ctx.getDefaultUserMapInfo(); ctx.currentLevelJson = null;
    ctx.currentMapInfoOverrides = ctx.getDefaultMapInfoOverrides();
    ctx.syncMyInfoInputs(); ctx.updateMapInfoInputs();
    assert.equal(ctx.settingsMyLicenseInput.value, 'CC0-1.0');
    assert.equal(ctx.settingsMapLicenseInput.value, 'CC0-1.0');
    assert.equal(ctx.getSaveLicense(), 'CC0-1.0');
    assert.equal(JSON.parse(ctx.buildDefaultLevelJson('CC0 map')).license, 'CC0-1.0', 'New exported metadata includes the default');
    saving = ctx.saveCurrentMap(); await flush();
    assert.equal(activeDialog().querySelectorAll('select')[0].value, 'CC0-1.0', 'My info save popup uses CC0');
    submit(activeDialog()); await flush();
    assert.equal(ctx.settingsMapLicenseInput.value, 'CC0-1.0', 'First-page license remains in map metadata');
    submit(activeDialog()); await saving;
    assert.equal(packed.at(-1).license, 'CC0-1.0');
    assert.equal(packed.at(-1).info.created, todayDate, 'Confirming the default date saves it in map metadata');
    ctx.currentLevelJson = {'spdx-license-id':'MIT'}; ctx.currentMapInfoOverrides = ctx.getDefaultMapInfoOverrides();
    ctx.applyUserMapInfoToMapInfo();
    assert.equal(ctx.currentMapInfoOverrides.license, '', 'Default does not override an imported SPDX license');
    assert.equal(ctx.settingsMapLicenseInput.value, 'MIT'); assert.equal(ctx.getSaveLicense(), 'MIT');
    ctx.setMapInfoOverrideField('license','Unknown');
    assert.equal(ctx.settingsMapLicenseInput.value, 'Unknown'); assert.equal(ctx.getSaveLicense(), 'Unknown');
    ctx.currentMapInfoOverrides.scavengers = '0'; ctx.updateMapInfoInputs();
    saving = ctx.saveCurrentMap(); await flush(); submit(activeDialog()); await flush();
    const scavengerInput = activeDialog().querySelectorAll('select').find(input => input.id.endsWith('-settingsMapScavengersInput'));
    assert.equal(scavengerInput.value, '', 'Save popup defaults to Auto even when the loaded map had No');
    assert(scavengerInput.options.some(option => option.value === '0'));
    assert(scavengerInput.options.some(option => option.value === '1'));
    assert.equal(ctx.currentMapInfoOverrides.scavengers, '0', 'Opening the popup does not change the map');
    cancel(activeDialog()); await saving;
    assert.equal(ctx.currentMapInfoOverrides.scavengers, '0', 'Cancel preserves the previous setting');
    saving = ctx.saveCurrentMap(); await flush(); submit(activeDialog()); await flush(); submit(activeDialog()); await saving;
    assert.equal(packed.at(-1).info.scavengers, '', 'Confirming Auto resumes automatic scavenger detection');
    for (const choice of ['0','1']) {
      saving = ctx.saveCurrentMap(); await flush(); submit(activeDialog()); await flush();
      edit(activeDialog(), 'settingsMapScavengersInput', choice); submit(activeDialog()); await saving;
      assert.equal(packed.at(-1).info.scavengers, choice, 'Manual No/Yes remains available');
    }
    ctx.currentLevelJson = null; ctx.currentMapInfoOverrides = ctx.getDefaultMapInfoOverrides();
    ctx.savedMapVersion = ''; ctx.mapDirty = false; ctx.updateMapInfoInputs();
    assert.equal(ctx.settingsMapVersionInput.value, '1.0', 'Settings defaults to 1.0');
    const versionButton = dialog => dialog.querySelectorAll('button').find(button => /^Use /.test(button.textContent));
    const versionInput = dialog => dialog.querySelectorAll('input').find(input => input.id.endsWith('-settingsMapVersionInput'));
    saving = ctx.saveCurrentMap(); await flush(); submit(activeDialog()); await flush();
    assert.equal(versionInput(activeDialog()).value, '1.0');
    assert.equal(versionButton(activeDialog()), undefined, 'First save has no increment suggestion');
    submit(activeDialog()); await saving;
    assert.equal(packed.at(-1).version, '1.0'); assert.equal(ctx.savedMapVersion, '1.0');
    saving = ctx.saveCurrentMap(); await flush(); submit(activeDialog()); await flush();
    assert.equal(versionButton(activeDialog()), undefined, 'Unchanged save has no increment suggestion');
    cancel(activeDialog()); await saving;
    ctx.markMapDirty();
    saving = ctx.saveCurrentMap(); await flush(); submit(activeDialog()); await flush();
    assert.equal(versionInput(activeDialog()).value, '1.0', 'Suggestion does not silently change Version');
    assert.equal(versionButton(activeDialog()).textContent, 'Use 1.1');
    versionButton(activeDialog()).dispatchEvent(new Event('click'));
    assert.equal(versionInput(activeDialog()).value, '1.1');
    cancel(activeDialog()); await saving;
    assert.equal(ctx.getSaveMapVersion(), '1.0'); assert.equal(ctx.savedMapVersion, '1.0', 'Cancel does not advance the recorded version');
    saving = ctx.saveCurrentMap(); await flush(); submit(activeDialog()); await flush();
    assert.equal(versionButton(activeDialog()).textContent, 'Use 1.1', 'Reopening does not keep incrementing');
    versionButton(activeDialog()).dispatchEvent(new Event('click')); submit(activeDialog()); await saving;
    assert.equal(packed.at(-1).version, '1.1'); assert.equal(ctx.savedMapVersion, '1.1');
    saving = ctx.saveCurrentMap(); await flush(); submit(activeDialog()); await flush();
    assert.equal(versionButton(activeDialog()), undefined); cancel(activeDialog()); await saving;
    ctx.markMapDirty();
    saving = ctx.saveCurrentMap(); await flush(); submit(activeDialog()); await flush();
    assert.equal(versionButton(activeDialog()).textContent, 'Use 1.2');
    submit(activeDialog()); await saving;
    assert.equal(packed.at(-1).version, '1.1', 'Saving without accepting a suggestion keeps the version');
    ctx.setMapInfoOverrideField('version','4.0');
    saving = ctx.saveCurrentMap(); await flush(); submit(activeDialog()); await flush();
    assert.equal(versionInput(activeDialog()).value, '4.0');
    assert.equal(versionButton(activeDialog()), undefined, 'A manually entered version is not incremented again');
    submit(activeDialog()); await saving;
    assert.equal(packed.at(-1).version, '4.0');
    ctx.markMapDirty(); failWrite = true;
    const originalConsole = ctx.console; ctx.console = {error(){},warn(){}};
    saving = ctx.saveCurrentMap(); await flush(); submit(activeDialog()); await flush();
    assert.equal(versionButton(activeDialog()).textContent, 'Use 4.1');
    versionButton(activeDialog()).dispatchEvent(new Event('click')); submit(activeDialog()); await saving;
    assert.equal(ctx.savedMapVersion, '4.0', 'A failed write does not advance the saved version');
    assert.equal(ctx.mapDirty, true); assert.equal(ctx.mapSaveInProgress, false);
    failWrite = false; ctx.console = originalConsole;
    saving = ctx.saveCurrentMap(); await flush(); submit(activeDialog()); await flush();
    assert.equal(versionInput(activeDialog()).value, '4.1');
    assert.equal(versionButton(activeDialog()), undefined, 'Retry keeps the selected version instead of suggesting 4.2');
    submit(activeDialog()); await saving; assert.equal(ctx.savedMapVersion, '4.1');
    assert.equal(ctx.currentLevelJson.versionName, '4.1', 'Successful saves retain the recorded version in local-save metadata');
    console.log('PASS: save steps, license help, CC0 defaults in Settings/popups/exports, legacy preferences, existing licenses/Unknown choices, cancellation and validation; no browser used.');
  } finally { globalThis.document = oldDocument; }
})().catch(error => { console.error(error); process.exitCode = 1; });
