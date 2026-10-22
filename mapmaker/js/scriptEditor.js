import { findScriptMatches, replaceScriptMatches, highlightScriptSearch } from './scriptSearch.js';

export function getScriptLineNumbers(source) {
  return Array.from({length:String(source).split('\n').length}, (_, index) => index + 1).join('\n');
}

export function mountScriptEditor(panel, {onChange, onRun}) {
  if (!panel) return null;
  panel.innerHTML = '<div class="panel-box">' +
    '<div class="script-header"><span class="script-title">Map script:</span>' +
    '<span data-script-filename class="script-filename"></span>' +
    '<button type="button" class="action-btn" data-script-find-open title="Find (Ctrl+F) / Replace (Ctrl+H)">Find / replace</button></div>' +
    '<div class="script-search" data-script-search hidden role="search" aria-label="Find in map script">' +
    '<div class="script-search-row">' +
    '<label for="mapScriptFind">Find</label><input id="mapScriptFind" type="text" spellcheck="false" autocomplete="off" aria-label="Find in script">' +
    '<span class="script-search-count" data-script-find-count role="status" aria-live="polite"></span>' +
    '<button type="button" class="action-btn" data-script-find-prev title="Previous match (Shift+Enter)" aria-label="Previous match">↑</button>' +
    '<button type="button" class="action-btn" data-script-find-next title="Next match (Enter)" aria-label="Next match">↓</button>' +
    '<label class="script-search-case"><input type="checkbox" data-script-find-case>Match case</label>' +
    '<button type="button" class="action-btn" data-script-replace-toggle>Replace</button>' +
    '<button type="button" class="action-btn" data-script-find-close title="Close (Esc)" aria-label="Close find and replace">×</button></div>' +
    '<div class="script-search-row" data-script-replace-row hidden>' +
    '<label for="mapScriptReplace">Replace</label><input id="mapScriptReplace" type="text" spellcheck="false" autocomplete="off" aria-label="Replace with">' +
    '<button type="button" class="action-btn" data-script-replace-one>Replace</button>' +
    '<button type="button" class="action-btn" data-script-replace-all>Replace all</button></div></div>' +
    '<div class="script-editor-frame">' +
    '<pre class="script-line-numbers" data-script-line-numbers aria-hidden="true">1</pre>' +
    '<div class="script-code-wrap">' +
    '<pre class="script-highlight" data-script-highlight aria-hidden="true"><code data-script-highlight-code></code></pre>' +
    '<textarea id="mapScriptSource" class="script-source" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off" aria-label="Map script source" aria-describedby="mapScriptHint"></textarea>' +
    '</div></div>' +
    '<button type="button" class="action-btn script-run" data-script-run>Run script</button>' +
    '<p id="mapScriptHint" class="script-hint">Run regenerates the terrain and objects, replacing manual map edits. Typing does not change the map.</p>' +
    '<p class="script-status" data-script-status role="status" aria-live="polite"></p>' +
    '</div>';
  const editor = panel.querySelector('#mapScriptSource');
  const lineNumbers = panel.querySelector('[data-script-line-numbers]');
  const highlight = panel.querySelector('[data-script-highlight]');
  const highlightedCode = panel.querySelector('[data-script-highlight-code]');
  const filename = panel.querySelector('[data-script-filename]');
  const run = panel.querySelector('[data-script-run]');
  const status = panel.querySelector('[data-script-status]');
  const search = panel.querySelector('[data-script-search]');
  const find = panel.querySelector('#mapScriptFind');
  const replacement = panel.querySelector('#mapScriptReplace');
  const count = panel.querySelector('[data-script-find-count]');
  const matchCase = panel.querySelector('[data-script-find-case]');
  const previous = panel.querySelector('[data-script-find-prev]');
  const next = panel.querySelector('[data-script-find-next]');
  const replaceRow = panel.querySelector('[data-script-replace-row]');
  const replaceOne = panel.querySelector('[data-script-replace-one]');
  const replaceAll = panel.querySelector('[data-script-replace-all]');
  const toggleReplace = panel.querySelector('[data-script-replace-toggle]');
  const open = panel.querySelector('[data-script-find-open]');
  const close = panel.querySelector('[data-script-find-close]');
  let script = null, busy = false, matches = [], activeMatch = -1;
  search.hidden = true;
  replaceRow.hidden = true;

  function syncScroll() {
    panel.style?.setProperty?.('--script-search-height', (search.hidden ? 0 : (search.offsetHeight || 0) + 6) + 'px');
    if (editor.clientWidth > 0) highlight.style.width = editor.clientWidth + 'px';
    if (editor.clientHeight > 0) {
      highlight.style.height = editor.clientHeight + 'px';
      lineNumbers.style.height = editor.clientHeight + 'px';
    }
    highlight.scrollTop = editor.scrollTop;
    highlight.scrollLeft = editor.scrollLeft;
    lineNumbers.scrollTop = editor.scrollTop;
  }
  function renderSource() {
    // Escaped token text only; search marks never affect the editable source.
    highlightedCode.innerHTML = highlightScriptSearch(editor.value, matches, activeMatch) + '\u200b';
    lineNumbers.textContent = getScriptLineNumbers(editor.value);
    syncScroll();
  }
  function updateControls() {
    const disabled = busy || !script;
    editor.disabled = disabled;
    run.disabled = disabled;
    run.textContent = busy ? 'Running…' : 'Run script';
    for (const control of [open, find, replacement, matchCase, toggleReplace]) control.disabled = disabled;
    for (const control of [previous, next, replaceOne, replaceAll]) control.disabled = disabled || !matches.length;
    count.textContent = matches.length ? (activeMatch + 1) + ' of ' + matches.length : '0 matches';
  }
  function refreshSearch(anchor = editor.selectionStart || 0) {
    matches = search.hidden ? [] : findScriptMatches(editor.value, find.value, matchCase.checked);
    activeMatch = matches.findIndex(match => match.start >= anchor);
    if (activeMatch < 0 && matches.length) activeMatch = 0;
    updateControls();
    renderSource();
  }
  function selectActiveMatch() {
    const match = matches[activeMatch];
    if (!match) return;
    editor.setSelectionRange(match.start, match.end);
    const mark = highlightedCode.querySelector?.('mark.is-current');
    if (mark && editor.getBoundingClientRect) {
      const bounds = editor.getBoundingClientRect(), rect = mark.getBoundingClientRect();
      if (rect.top < bounds.top + 8) editor.scrollTop += rect.top - bounds.top - 8;
      else if (rect.bottom > bounds.top + editor.clientHeight - 8)
        editor.scrollTop += rect.bottom - bounds.top - editor.clientHeight + 8;
      if (rect.left < bounds.left + 8) editor.scrollLeft += rect.left - bounds.left - 8;
      else if (rect.right > bounds.left + editor.clientWidth - 8)
        editor.scrollLeft += rect.right - bounds.left - editor.clientWidth + 8;
      syncScroll();
    }
  }
  function navigate(direction) {
    if (!matches.length || busy) return;
    activeMatch = (activeMatch + direction + matches.length) % matches.length;
    updateControls();
    renderSource();
    selectActiveMatch();
  }
  function openSearch(withReplace) {
    if (!script || busy) return;
    const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (selected && !/[\r\n]/.test(selected)) find.value = selected;
    search.hidden = false;
    replaceRow.hidden = !withReplace;
    toggleReplace.textContent = withReplace ? 'Hide replace' : 'Replace';
    refreshSearch();
    selectActiveMatch();
    find.focus();
    find.select();
  }
  function closeSearch() {
    search.hidden = true;
    refreshSearch();
    if (!editor.disabled) editor.focus();
  }
  function showStatus(text, error = false) {
    status.textContent = text;
    status.classList.toggle('script-error', error);
  }
  function commitSourceChange() {
    if (!script || busy) return;
    if (script.source !== editor.value) {
      script = {...script, source:editor.value, pendingChanges:true};
      onChange(script.source);
      showStatus('Script edited — Run script to update the map.');
    }
    refreshSearch();
  }
  function insertReplacement(start, end, text) {
    const expected = editor.value.slice(0, start) + text + editor.value.slice(end);
    editor.focus();
    editor.setSelectionRange(start, end);
    // insertText/delete preserve Chrome's native textarea undo history.
    // Standards-based range replacement is the fallback for other engines.
    try { editor.ownerDocument?.execCommand?.(text ? 'insertText' : 'delete', false, text); } catch {}
    if (editor.value !== expected) editor.setRangeText(text, start, end, 'end');
    // Some browsers emit input from execCommand, others do not. Notify once.
    if (script.source !== editor.value) commitSourceChange();
  }
  function replaceCurrent() {
    if (busy || !script || !matches.length) return;
    const match = matches[activeMatch];
    const text = replacement.value;
    insertReplacement(match.start, match.end, text);
    refreshSearch(match.start + text.length);
    selectActiveMatch();
    replacement.focus();
    showStatus('Replaced 1 match. Run script to update the map.');
  }
  function replaceEveryMatch() {
    if (busy || !script || !matches.length) return;
    const total = matches.length;
    const text = replaceScriptMatches(editor.value, matches, replacement.value);
    insertReplacement(0, editor.value.length, text);
    refreshSearch(0);
    selectActiveMatch();
    replacement.focus();
    showStatus('Replaced ' + total + ' match' + (total === 1 ? '' : 'es') + '. Run script to update the map.');
  }

  editor.addEventListener('scroll', syncScroll);
  editor.addEventListener('input', commitSourceChange);
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(syncScroll);
    observer.observe(search);
    observer.observe(editor);
  }
  open.addEventListener('click', () => openSearch(true));
  close.addEventListener('click', closeSearch);
  previous.addEventListener('click', () => navigate(-1));
  next.addEventListener('click', () => navigate(1));
  replaceOne.addEventListener('click', replaceCurrent);
  replaceAll.addEventListener('click', replaceEveryMatch);
  find.addEventListener('input', () => { refreshSearch(); selectActiveMatch(); });
  matchCase.addEventListener('change', () => { refreshSearch(); selectActiveMatch(); });
  toggleReplace.addEventListener('click', () => {
    replaceRow.hidden = !replaceRow.hidden;
    toggleReplace.textContent = replaceRow.hidden ? 'Replace' : 'Hide replace';
    syncScroll();
    (replaceRow.hidden ? find : replacement).focus();
  });
  // Scope shortcuts to this editor panel, never the browser/map/other tabs.
  panel.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (!busy && script && !event.altKey && (event.ctrlKey || event.metaKey) && (key === 'f' || key === 'h')) {
      event.preventDefault();
      event.stopPropagation();
      openSearch(key === 'h');
    } else if (!search.hidden && key === 'escape') {
      event.preventDefault();
      event.stopPropagation();
      closeSearch();
    } else if (!search.hidden && key === 'enter' && event.target === find) {
      event.preventDefault();
      event.stopPropagation();
      navigate(event.shiftKey ? -1 : 1);
    } else if (!search.hidden && key === 'enter' && event.target === replacement) {
      event.preventDefault();
      event.stopPropagation();
      replaceCurrent();
    }
  });
  run.addEventListener('click', async () => {
    if (!script || busy) return;
    busy = true;
    updateControls();
    showStatus('Generating map…');
    try {
      const result = await onRun({...script, source:editor.value});
      showStatus(result || 'Map updated from script.');
    } catch (error) {
      showStatus(error?.message || String(error), true);
    } finally {
      busy = false;
      updateControls();
    }
  });
  return {
    setScript(value) {
      script = value ? {...value} : null;
      editor.value = script?.source || '';
      if (!script) search.hidden = true;
      refreshSearch(0);
      filename.textContent = script?.filename || 'No script in this map.';
      editor.placeholder = script ? '' : 'Load a script-generated map to view and edit its game.js.';
      showStatus(script?.pendingChanges ? 'Script edited — Run script to update the map.' : '');
      updateControls();
    }
  };
}
