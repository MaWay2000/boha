let nextDialogId = 0;

// Reuse the Settings fields without moving them or changing live values on Cancel.
export function showSaveInfoDialog(sourcePanel, title, continueLabel, onLicenseHelp, omittedFields = [], suggestedVersion = '') {
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog save-info-dialog';
    const prefix = 'save-info-' + (++nextDialogId) + '-';
    const heading = document.createElement('div');
    heading.id = prefix + 'title';
    heading.className = 'app-dialog-title';
    heading.textContent = title;
    dialog.setAttribute('aria-labelledby', heading.id);

    const form = document.createElement('form');
    const fields = sourcePanel.cloneNode(true);
    fields.removeAttribute('id');
    fields.style.display = 'block';
    fields.querySelectorAll('input, select, textarea').forEach(input => {
      if (!omittedFields.includes(input.id)) return;
      fields.querySelectorAll('label[for]').forEach(label => {
        if (label.htmlFor === input.id) label.remove();
      });
      input.remove();
    });
    fields.querySelectorAll('button').forEach(button => {
      if (['licenseHelpBtn', 'mapLicenseHelpBtn'].includes(button.id) && onLicenseHelp) button.addEventListener('click', onLicenseHelp);
      else button.remove();
    });
    fields.querySelectorAll('div').forEach(row => {
      if (!row.children.length && !row.textContent.trim()) row.remove();
    });
    fields.querySelectorAll('[id]').forEach(element => { element.id = prefix + element.id; });
    fields.querySelectorAll('label[for]').forEach(label => { label.htmlFor = prefix + label.htmlFor; });
    const originals = Array.from(sourcePanel.querySelectorAll('input, select, textarea'))
      .filter(input => !omittedFields.includes(input.id));
    const inputs = Array.from(fields.querySelectorAll('input, select, textarea'));
    const initialValues = originals.map(input => input.value);
    inputs.forEach((input, index) => {
      input.value = initialValues[index];
      if (originals[index].id === 'settingsMapScavengersInput') input.value = '';
      if (originals[index].id === 'settingsMapVersionInput') {
        if (!input.value) input.value = '1.0';
        if (suggestedVersion && suggestedVersion !== input.value) {
          const currentVersion = input.value;
          const suggestion = document.createElement('div');
          suggestion.className = 'app-dialog-hint';
          suggestion.textContent = 'Map edited. Suggested version: ';
          const useVersion = document.createElement('button');
          useVersion.type = 'button';
          useVersion.className = 'action-btn';
          useVersion.textContent = 'Use ' + suggestedVersion;
          useVersion.addEventListener('click', () => {
            input.value = suggestedVersion;
            suggestion.hidden = true;
          });
          input.addEventListener('input', () => { suggestion.hidden = input.value !== currentVersion; });
          suggestion.append(useVersion);
          input.after(suggestion);
        }
      }
      if (originals[index].id === 'settingsMapCreatedInput' && !input.value) {
        const today = new Date();
        input.value = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'),
          String(today.getDate()).padStart(2, '0')].join('-');
      }
    });

    const actions = document.createElement('div');
    actions.className = 'app-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'action-btn';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => dialog.close('cancel'));
    const next = document.createElement('button');
    next.type = 'submit';
    next.className = 'action-btn active';
    next.textContent = continueLabel;
    actions.append(cancel, next);
    form.append(heading, fields, actions);
    dialog.append(form);

    form.addEventListener('submit', event => {
      event.preventDefault();
      // Untouched fields must not freeze automatic values or replace imported metadata.
      inputs.forEach((input, index) => {
        if (input.value === initialValues[index]) return;
        originals[index].value = input.value;
        originals[index].dispatchEvent(new Event('change', { bubbles: true }));
      });
      dialog.close('continue');
    });
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      resolve(dialog.returnValue === 'continue');
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
}

// Native modal help stays above the save form and leaves its draft fields intact.
export function showSaveLicenseHelp(sourceBody) {
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'app-dialog save-info-dialog save-license-help-dialog';
  dialog.setAttribute('aria-label', 'License help');
  const heading = document.createElement('div');
  heading.className = 'app-dialog-title';
  heading.textContent = 'License help';
  const body = sourceBody.cloneNode(true);
  body.removeAttribute('id');
  const actions = document.createElement('div');
  actions.className = 'app-dialog-actions';
  actions.style.gridTemplateColumns = '1fr';
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'action-btn active';
  ok.textContent = 'OK';
  ok.addEventListener('click', () => dialog.close());
  actions.append(ok);
  dialog.append(heading, body, actions);
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
}
