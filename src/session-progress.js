/**
 * Generate4U — session save/load, student-named backups, and sequential Full Suite Word export.
 * Loaded after index.html defines shared app globals (IEP_GOAL_AREAS, switchTab, etc.).
 */
(function () {
  'use strict';

  var PROGRESS_SAVE_VERSION = 3;
  var FALLBACK_PROGRESS_FILENAME = 'Student-Progress.json';
  var FULL_SUITE_DELAY_MS = 1500;
  var progressFileInputEl = null;
  var fullSuiteExportBarEl = null;
  var fullSuiteExportInFlight = false;

  var FULL_SUITE_STEPS = [
    {
      mode: 'IEP',
      step: 'iep',
      exportKind: 'iep',
      docKey: 'iep',
      suffix: '_IEP',
      label: 'IEP Word Document',
      buttonId: 'generateWordIep'
    },
    {
      mode: 'BSP',
      step: 'bsp',
      exportKind: 'bsp',
      docKey: 'bsp',
      suffix: '_BSP',
      label: 'BSP Word Document',
      buttonId: 'generateWordBsp'
    },
    {
      mode: 'Adjustments',
      step: 'classroom',
      exportKind: 'classroom',
      docKey: 'classroom',
      suffix: '_Adjustments',
      label: 'Classroom Adjustments Word Document',
      buttonId: 'generateWordClassroom'
    }
  ];

  var LAUNCHPAD_EXIT_MS = 520;

  function getForm() {
    return document.getElementById('planForm');
  }

  function delayMs(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function callApp(fnName) {
    var fn = window[fnName];
    if (typeof fn !== 'function') return undefined;
    return fn.apply(window, Array.prototype.slice.call(arguments, 1));
  }

  /**
   * Student Name field (Details tab) → "Jack-Nolan-Progress.json", else Student-Progress.json.
   */
  function getStudentNameFromForm() {
    var form = getForm();
    var el =
      document.getElementById('studentNameInput') ||
      (form ? form.querySelector('[name="name"]') : null) ||
      document.querySelector('#planForm [name="name"]');
    if (!el && form && form.elements && form.elements.name) {
      el = form.elements.name;
    }
    if (el && el.length !== undefined && !el.tagName) {
      el = el[0];
    }
    return el ? String(el.value || '').trim() : '';
  }

  function getProgressDownloadFilename() {
    var student = getStudentNameFromForm();
    if (!student) return FALLBACK_PROGRESS_FILENAME;
    var base = student
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return (base || 'Student') + '-Progress.json';
  }

  function shouldSkipProgressField(el) {
    if (!el || !el.tagName) return true;
    var tag = el.tagName.toLowerCase();
    if (tag === 'button') return true;
    var type = (el.type || '').toLowerCase();
    if (type === 'file' || type === 'submit' || type === 'reset') return true;
    if (el.classList && el.classList.contains('iep-goal-generated-store')) return true;
    if (el.name && /^bsp\d+_compiled$/.test(el.name)) return true;
    if (el.id === 'saveProgressBtn' || el.id === 'loadProgressBtn') return true;
    if (el.classList && el.classList.contains('doc-check')) return true;
    if (el.classList && el.classList.contains('btn-generate-all')) return true;
    if (el.classList && el.classList.contains('btn-export-full-suite')) return true;
    if (progressFileInputEl && el === progressFileInputEl) return true;
    return false;
  }

  function progressFieldKey(el) {
    if (el.name) return el.name;
    if (el.id) return '#' + el.id;
    return null;
  }

  function queryNamedControls(form, name) {
    if (!form || !name) return [];
    if (typeof CSS !== 'undefined' && CSS.escape) {
      return Array.from(form.querySelectorAll('[name="' + CSS.escape(name) + '"]'));
    }
    return Array.from(form.querySelectorAll('[name="' + name + '"]'));
  }

  function getControlByName(form, name) {
    var nodes = queryNamedControls(form, name);
    return nodes.length ? nodes[0] : null;
  }

  function syncDomBeforeProgressSave() {
    var form = getForm();
    if (!form) return;

    if (typeof window.syncFormControlsToDomAttributes === 'function') {
      window.syncFormControlsToDomAttributes(form);
    }
    if (typeof window.syncStudentPersonalizationFromForm === 'function') {
      window.syncStudentPersonalizationFromForm();
    }

    var areas = window.IEP_GOAL_AREAS;
    if (areas && typeof window.syncGoalCardToHiddenField === 'function') {
      areas.forEach(function (area) {
        try {
          window.syncGoalCardToHiddenField(area.key);
        } catch (e) {
          console.warn('Goal card sync before save failed for', area.key, e);
        }
      });
    }
  }

  function getSelectedDocumentsSnapshot() {
    if (typeof window.getSelectedDocuments === 'function') {
      return window.getSelectedDocuments();
    }
    return {
      iep: !!document.getElementById('docCheckIep')?.checked,
      bsp: !!document.getElementById('docCheckBsp')?.checked,
      classroom: !!document.getElementById('docCheckClassroom')?.checked
    };
  }

  function collectIepGoalProgressState() {
    var form = getForm();
    var areas = window.IEP_GOAL_AREAS;
    if (!form || !areas || !areas.length) return null;

    var goals = {};
    areas.forEach(function (area) {
      var p = area.prefix;
      var levelEl = getControlByName(form, p + '_currentLevel');
      var assessEl = getControlByName(form, p + '_assessment');
      var focusEl = getControlByName(form, p + '_focusArea');
      var genNodes = queryNamedControls(form, p + '_generated');
      var genEl = genNodes.length ? genNodes[0] : null;

      var entry = {
        currentLevel: levelEl ? levelEl.value : '',
        assessment: assessEl ? assessEl.value : '',
        focusArea: focusEl ? focusEl.value : '',
        generated: genEl ? genEl.value : ''
      };

      if (typeof window.readSmartGoalCardFromArea === 'function') {
        var card = window.readSmartGoalCardFromArea(area.key);
        if (card) entry.card = card;
      }
      goals[area.key] = entry;
    });

    var activeIepGoalBtn = document.querySelector('.iep-goal-tab-btn.active');
    return {
      activeTab: activeIepGoalBtn ? activeIepGoalBtn.dataset.iepGoal : 'english',
      areas: goals
    };
  }

  /**
   * Master JSON package: every input/textarea/select in the form (all tabs, including hidden/inactive).
   */
  function collectFormProgressState() {
    syncDomBeforeProgressSave();

    var form = getForm();
    if (!form) return null;

    var fields = {};
    var checkboxGroupNames = {};

    form.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (shouldSkipProgressField(el)) return;
      var key = progressFieldKey(el);
      if (!key) return;

      var type = (el.type || '').toLowerCase();
      var tag = el.tagName ? el.tagName.toLowerCase() : '';

      if (type === 'checkbox') {
        if (!el.name) return;
        checkboxGroupNames[el.name] = true;
        if (!fields[el.name] || !Array.isArray(fields[el.name])) {
          fields[el.name] = [];
        }
        if (el.checked && fields[el.name].indexOf(el.value) < 0) {
          fields[el.name].push(el.value);
        }
        return;
      }

      if (type === 'radio') {
        if (el.checked) {
          fields[key] = el.value;
        }
        return;
      }

      if (tag === 'select') {
        fields[key] = el.value != null ? String(el.value) : '';
        return;
      }

      fields[key] = el.value != null ? String(el.value) : '';
    });

    Object.keys(checkboxGroupNames).forEach(function (name) {
      if (!Array.isArray(fields[name])) {
        fields[name] = [];
      }
    });

    var activeTabBtn = form.querySelector('.tab-btn.active:not(.tab-doc-inactive)');

    return {
      version: PROGRESS_SAVE_VERSION,
      app: 'Generate4U',
      savedAt: new Date().toISOString(),
      studentName: getStudentNameFromForm(),
      selectedMode: window.selectedMode != null ? window.selectedMode : null,
      documents: getSelectedDocumentsSnapshot(),
      activeTab: activeTabBtn ? activeTabBtn.getAttribute('data-tab') : 'details',
      fields: fields,
      iepGoals: collectIepGoalProgressState()
    };
  }

  function notifyFieldUpdated(el) {
    if (!el) return;
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {
      var evtInput = document.createEvent('Event');
      evtInput.initEvent('input', true, true);
      el.dispatchEvent(evtInput);
      var evtChange = document.createEvent('Event');
      evtChange.initEvent('change', true, true);
      el.dispatchEvent(evtChange);
    }
  }

  function findProgressElements(key) {
    var form = getForm();
    var elements = [];

    if (key.indexOf('#') === 0) {
      var byId = document.getElementById(key.slice(1));
      if (byId) elements = [byId];
    } else if (form) {
      elements = queryNamedControls(form, key);
    }

    if (!elements.length) {
      var byIdOnly = document.getElementById(key);
      if (byIdOnly) elements = [byIdOnly];
    }

    return elements;
  }

  function applyProgressFieldValue(key, value) {
    var elements = findProgressElements(key);
    if (!elements.length) return;

    var first = elements[0];
    var type = (first.type || '').toLowerCase();

    if (type === 'checkbox') {
      var selected = Array.isArray(value) ? value.slice() : value ? [String(value)] : [];
      elements.forEach(function (el) {
        el.checked = selected.indexOf(el.value) >= 0;
        notifyFieldUpdated(el);
      });
      return;
    }

    if (type === 'radio') {
      elements.forEach(function (el) {
        el.checked = el.value === value;
        notifyFieldUpdated(el);
      });
      return;
    }

    if (first.tagName && first.tagName.toLowerCase() === 'select') {
      first.value = value != null ? String(value) : '';
      Array.prototype.forEach.call(first.options || [], function (opt) {
        opt.selected = opt.value === first.value;
      });
      notifyFieldUpdated(first);
      return;
    }

    elements.forEach(function (el) {
      if (el === first || (el.type || '').toLowerCase() !== 'radio') {
        el.value = value != null ? String(value) : '';
        notifyFieldUpdated(el);
      }
    });
  }

  function restoreIepGoalProgress(iepGoals) {
    if (!iepGoals) return;
    var form = getForm();
    var areas = window.IEP_GOAL_AREAS;
    if (!form || !areas) return;

    if (iepGoals.activeTab && typeof window.switchIepGoalTab === 'function') {
      window.switchIepGoalTab(iepGoals.activeTab);
    }

    var savedAreas = iepGoals.areas || {};
    areas.forEach(function (area) {
      var saved = savedAreas[area.key];
      if (!saved) return;
      var p = area.prefix;

      var levelEl = getControlByName(form, p + '_currentLevel');
      if (levelEl && saved.currentLevel != null) {
        levelEl.value = saved.currentLevel;
        notifyFieldUpdated(levelEl);
      }
      var assessEl = getControlByName(form, p + '_assessment');
      if (assessEl && saved.assessment != null) {
        assessEl.value = saved.assessment;
        notifyFieldUpdated(assessEl);
      }
      var focusEl = getControlByName(form, p + '_focusArea');
      if (focusEl && saved.focusArea != null) {
        focusEl.value = saved.focusArea;
        notifyFieldUpdated(focusEl);
      }

      var genEl = getControlByName(form, p + '_generated');
      if (genEl && saved.generated != null) {
        genEl.value = saved.generated;
      }

      var host = document.getElementById(p + '_resultHost');
      if (host) host.hidden = true;

      var card = saved.card;
      if (!card && saved.generated && typeof window.parseSmartGoalCardFromStoredText === 'function') {
        card = window.parseSmartGoalCardFromStoredText(saved.generated);
      }
      if (card && typeof window.mountSmartGoalResultCard === 'function') {
        window.mountSmartGoalResultCard(area.key, card);
      } else if (genEl) {
        genEl.value = saved.generated || '';
      }

      if (typeof window.syncIepGoalLevelFromDashboard === 'function') {
        window.syncIepGoalLevelFromDashboard(area);
      }
    });
  }

  function refreshUiAfterLoad() {
    callApp('syncFormControlsToDomAttributes', getForm());
    callApp('syncStudentPersonalizationFromForm');
    callApp('updateDocumentVisibility');
    callApp('updateFormRequiredFields');
    callApp('updateFormFieldDisabledState');
    callApp('updateLaunchpadBadge');
    callApp('renderFormValidationSummary');
  }

  function applyFormProgressState(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid progress file.');
    }

    if (document.body.classList.contains('launchpad-open') && typeof window.dismissLaunchpad === 'function') {
      window.dismissLaunchpad();
    }

    if (data.selectedMode && data.selectedMode !== 'ALL') {
      window.selectedMode = data.selectedMode;
    } else if (data.selectedMode === 'ALL') {
      window.selectedMode = null;
    }

    if (data.documents && typeof window.setDocumentSelection === 'function') {
      window.setDocumentSelection({
        iep: !!data.documents.iep,
        bsp: !!data.documents.bsp,
        classroom: !!data.documents.classroom
      });
    } else if (typeof window.syncSelectedModeFromDocuments === 'function') {
      window.syncSelectedModeFromDocuments();
    }

    var fields = data.fields || {};
    Object.keys(fields).forEach(function (key) {
      applyProgressFieldValue(key, fields[key]);
    });

    restoreIepGoalProgress(data.iepGoals);
    refreshUiAfterLoad();

    if (data.activeTab && typeof window.switchTab === 'function') {
      window.switchTab(data.activeTab);
    }

    refreshUiAfterLoad();

    var output = document.getElementById('output');
    if (output) output.innerHTML = '';
  }

  function triggerBrowserJsonDownload(json, filename) {
    return new Promise(function (resolve, reject) {
      try {
        var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.rel = 'noopener';
        link.style.cssText = 'position:fixed;left:-9999px;opacity:0;';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        resolve(true);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function saveProgressToLocalFile() {
    syncDomBeforeProgressSave();

    var payload = collectFormProgressState();
    if (!payload) {
      alert('Could not read form data to save.');
      return;
    }

    payload.studentName = getStudentNameFromForm();

    var json = JSON.stringify(payload, null, 2);
    var filename = getProgressDownloadFilename();

    if (window.electronAPI && typeof window.electronAPI.saveProgressJson === 'function') {
      try {
        var result = await window.electronAPI.saveProgressJson({
          content: json,
          suggestedFilename: filename
        });
        if (result && result.canceled) return;
        if (result && result.filePath) {
          console.log('Progress saved:', result.filePath);
        }
        return;
      } catch (err) {
        alert('Could not save progress file: ' + (err && err.message ? err.message : String(err)));
        return;
      }
    }

    try {
      await triggerBrowserJsonDownload(json, filename);
    } catch (err) {
      alert('Could not save progress file: ' + (err && err.message ? err.message : String(err)));
    }
  }

  function loadProgressFromText(text) {
    var data = JSON.parse(text || '{}');
    applyFormProgressState(data);
    requestAnimationFrame(function () {
      refreshUiAfterLoad();
      requestAnimationFrame(refreshUiAfterLoad);
    });
  }

  function loadProgressFromLocalFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        loadProgressFromText(String(reader.result || ''));
      } catch (err) {
        alert('Could not load progress file: ' + (err && err.message ? err.message : String(err)));
      }
    };
    reader.onerror = function () {
      alert('Could not read the selected file.');
    };
    reader.readAsText(file);
  }

  async function openLoadProgressDialog() {
    if (window.electronAPI && typeof window.electronAPI.loadProgressJson === 'function') {
      try {
        var result = await window.electronAPI.loadProgressJson();
        if (result && result.canceled) return;
        if (result && result.data) {
          applyFormProgressState(result.data);
          requestAnimationFrame(function () {
            refreshUiAfterLoad();
            requestAnimationFrame(refreshUiAfterLoad);
          });
        }
        return;
      } catch (err) {
        alert('Could not load progress file: ' + (err && err.message ? err.message : String(err)));
        return;
      }
    }

    if (!progressFileInputEl) {
      progressFileInputEl = document.createElement('input');
      progressFileInputEl.type = 'file';
      progressFileInputEl.accept = 'application/json,.json';
      progressFileInputEl.hidden = true;
      progressFileInputEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(progressFileInputEl);
      progressFileInputEl.addEventListener('change', function () {
        var file = progressFileInputEl.files && progressFileInputEl.files[0];
        progressFileInputEl.value = '';
        if (file) loadProgressFromLocalFile(file);
      });
    }
    progressFileInputEl.click();
  }

  function applyFullSuiteDocumentSelection() {
    if (typeof window.setDocumentSelection === 'function') {
      window.setDocumentSelection({ iep: true, bsp: true, classroom: true });
    }
    if (typeof window.updateDocumentVisibility === 'function') {
      window.updateDocumentVisibility();
    }
    if (typeof window.updateLaunchpadBadge === 'function') {
      window.updateLaunchpadBadge();
    }
  }

  function resolveActiveTabExportMode() {
    if (typeof window.resolveModeFromActiveTab === 'function') {
      return window.resolveModeFromActiveTab();
    }
    var form = getForm();
    if (!form) return null;
    var panel = form.querySelector('.tab-panel.active');
    if (!panel) return null;
    var rule = panel.getAttribute('data-doc-form') || '';
    if (rule.indexOf('bsp') >= 0) return 'BSP';
    if (rule.indexOf('iep') >= 0) return 'IEP';
    if (rule.indexOf('classroom') >= 0) return 'Adjustments';
    return null;
  }

  function isDocumentTypeSelected(mode, selected) {
    selected = selected || getSelectedDocumentsSnapshot();
    if (mode === 'IEP') return !!selected.iep;
    if (mode === 'BSP') return !!selected.bsp;
    return !!selected.classroom;
  }

  function getDocumentFillStatus(form) {
    form = form || getForm();
    var status = { iep: false, bsp: false, adjustments: false };

    if (typeof window.getDocumentSectionFillStatus === 'function') {
      status = window.getDocumentSectionFillStatus(form) || status;
    }

    if (!form) return status;

    if (!status.iep) {
      status.iep = !!(
        String((form.levelReading && form.levelReading.value) || '').trim() ||
        String((form.iepEnglish_focusArea && form.iepEnglish_focusArea.value) || '').trim() ||
        String((form.iepEnglish_specific && form.iepEnglish_specific.value) || '').trim() ||
        String((form.iepMath_specific && form.iepMath_specific.value) || '').trim() ||
        String((form.iepPersonal_specific && form.iepPersonal_specific.value) || '').trim() ||
        String((form.iepSupports && form.iepSupports.value) || '').trim()
      );
    }

    if (!status.bsp) {
      var behavioursConcern =
        form.querySelectorAll('input[name="behavioursConcern"]:checked').length > 0;
      status.bsp = !!(
        behavioursConcern ||
        String((form.bsp1_specific && form.bsp1_specific.value) || '').trim() ||
        String((form.bsp2_specific && form.bsp2_specific.value) || '').trim() ||
        String((form.bsp3_specific && form.bsp3_specific.value) || '').trim()
      );
    }

    if (!status.adjustments) {
      var dipFields = [
        'dipCommunication',
        'dipMobility',
        'dipSelfCare',
        'dipGeneralTasks',
        'dipInterpersonal',
        'dipLearning'
      ];
      status.adjustments = dipFields.some(function (name) {
        return String((form[name] && form[name].value) || '').trim();
      });
    }

    return status;
  }

  function getFilledExportModes(form) {
    var fill = getDocumentFillStatus(form);
    var modes = [];
    if (fill.iep) modes.push('IEP');
    if (fill.bsp) modes.push('BSP');
    if (fill.adjustments) modes.push('Adjustments');
    return modes;
  }

  function getBspStepForMode(mode) {
    for (var i = 0; i < FULL_SUITE_STEPS.length; i++) {
      if (FULL_SUITE_STEPS[i].mode === mode) return FULL_SUITE_STEPS[i];
    }
    return null;
  }

  function hasAnyDocumentCheckboxSelected(selected) {
    selected = selected || getSelectedDocumentsSnapshot();
    return !!(selected.iep || selected.bsp || selected.classroom);
  }

  /**
   * Decide which Word documents to export based on filled sections, doc checkboxes, and active tab.
   */
  function detectAdaptiveExportSteps(form) {
    form = form || getForm();
    var selected = getSelectedDocumentsSnapshot();
    var filledModes = getFilledExportModes(form);
    var anyDocSelected = hasAnyDocumentCheckboxSelected(selected);
    var steps = [];

    function modeAllowed(mode) {
      return !anyDocSelected || isDocumentTypeSelected(mode, selected);
    }

    function pushMode(mode) {
      if (!modeAllowed(mode)) return;
      var step = getBspStepForMode(mode);
      if (step && steps.indexOf(step) < 0) steps.push(step);
    }

    if (filledModes.length === 1) {
      pushMode(filledModes[0]);
    } else if (filledModes.length >= 2) {
      FULL_SUITE_STEPS.forEach(function (step) {
        if (filledModes.indexOf(step.mode) >= 0) pushMode(step.mode);
      });
    }

    if (!steps.length && anyDocSelected) {
      FULL_SUITE_STEPS.forEach(function (step) {
        if (isDocumentTypeSelected(step.mode, selected)) steps.push(step);
      });
    }

    if (!steps.length) {
      var activeMode = resolveActiveTabExportMode();
      if (activeMode && modeAllowed(activeMode)) {
        var activeStep = getBspStepForMode(activeMode);
        if (activeStep) steps.push(activeStep);
      }
    }

    return steps;
  }

  function getAdaptiveExportButtonLabel(steps) {
    steps = steps || [];
    if (steps.length === 0) return 'Export Document';
    if (steps.length === 1) {
      if (steps[0].mode === 'IEP') return 'Export IEP';
      if (steps[0].mode === 'BSP') return 'Export BSP';
      return 'Export Adjustments';
    }
    if (steps.length === FULL_SUITE_STEPS.length) return 'Export Full Suite';
    return 'Export ' + steps.length + ' Documents';
  }

  function getAdaptiveExportHint(steps) {
    steps = steps || [];
    if (!steps.length) {
      return 'Enter student details and complete a section to export.';
    }
    if (steps.length === 1) {
      return 'Ready to export: ' + steps[0].label + '.';
    }
    if (steps.length === FULL_SUITE_STEPS.length) {
      return 'Ready to export all three Word documents sequentially.';
    }
    return (
      'Ready to export ' +
      steps.length +
      ' documents: ' +
      steps
        .map(function (s) {
          return s.mode;
        })
        .join(', ') +
      '.'
    );
  }

  function updateAdaptiveExportButtonLabels() {
    var form = getForm();
    var steps = detectAdaptiveExportSteps(form);
    var label = getAdaptiveExportButtonLabel(steps);
    var hint = getAdaptiveExportHint(steps);
    var aria =
      steps.length === 1
        ? 'Export ' + steps[0].label
        : steps.length === FULL_SUITE_STEPS.length
          ? 'Export IEP, BSP, and Classroom Adjustments Word documents sequentially'
          : 'Export ' + steps.length + ' ready Word documents';

    var floatingBtn = document.getElementById('btn-export-full-suite');
    if (floatingBtn) {
      floatingBtn.textContent = label;
      floatingBtn.setAttribute('aria-label', aria);
    }

    if (fullSuiteExportBarEl) {
      var hintEl = fullSuiteExportBarEl.querySelector('.full-suite-export-bar__hint');
      if (hintEl) hintEl.textContent = hint;
    }

    document.querySelectorAll('.btn-generate-all').forEach(function (btn) {
      if (isLandingWorkspaceEntryButton(btn)) return;
      if (btn.id === 'generateAllHeaderBtn' && isWorkspaceVisible()) {
        btn.textContent = label;
        btn.setAttribute('aria-label', aria);
      }
    });
  }

  async function saveOneWordDocument(contentString, filename, docKey) {
    var safeName =
      typeof window.sanitizeDownloadFilename === 'function'
        ? window.sanitizeDownloadFilename(filename)
        : filename;

    if (window.electronAPI && typeof window.electronAPI.saveWordDocument === 'function') {
      return window.electronAPI.saveWordDocument({
        content: contentString,
        suggestedFilename: safeName,
        docKey: docKey
      });
    }

    if (typeof window.saveWordDocumentToDisk === 'function') {
      return window.saveWordDocumentToDisk(contentString, safeName, { docKey: docKey });
    }

    if (
      typeof window.triggerBlobDownload === 'function' &&
      typeof window.createWordBlobFromContentString === 'function'
    ) {
      var blob = window.createWordBlobFromContentString(contentString);
      await window.triggerBlobDownload(blob, safeName);
      return { canceled: false };
    }

    throw new Error('Word save is not available in this environment.');
  }

  function reportGenerateValidationFailure(validation) {
    if (!validation) return;
    if (validation.alertMessage) {
      alert(validation.alertMessage);
      return;
    }
    if (validation.missing && validation.missing.length) {
      var summary = document.getElementById('formValidationSummary');
      if (summary && summary.scrollIntoView) {
        summary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      if (typeof window.focusFirstMissingField === 'function') {
        window.focusFirstMissingField(validation.missing);
      }
    }
  }

  /**
   * One document export — same Word pipeline as each tab's Generate button (no batch compile).
   */
  async function runIndividualWordExportForMode(form, step, ctx) {
    ctx = ctx || {};

    if (typeof window.prepareFormForWordExport === 'function') {
      window.prepareFormForWordExport(form, step.mode);
    }

    var values =
      typeof window.getVisibleData === 'function' ? window.getVisibleData(form, step.mode) : null;
    if (!values) {
      throw new Error('Could not read form data for ' + step.label + '.');
    }

    var html =
      typeof window.buildDocExportWordHtml === 'function'
        ? window.buildDocExportWordHtml(values, step.exportKind)
        : '';
    if (!html) {
      throw new Error('Could not build ' + step.label + '.');
    }

    var docTypeLabel =
      window.WORD_DOC_TYPE_LABELS && window.WORD_DOC_TYPE_LABELS[step.mode]
        ? window.WORD_DOC_TYPE_LABELS[step.mode]
        : step.mode;

    var contentString =
      typeof window.buildWordDocumentContentString === 'function'
        ? window.buildWordDocumentContentString(html, ctx.styleText || '', {
            documentType: docTypeLabel,
            studentName: ctx.studentName || values.name || ''
          })
        : html;

    var baseName =
      ctx.baseName ||
      (typeof window.sanitizeExportBasename === 'function'
        ? window.sanitizeExportBasename(values.name)
        : 'Student');
    var filename = baseName + step.suffix + '.doc';

    return saveOneWordDocument(contentString, filename, step.docKey);
  }

  /**
   * Adaptive export: downloads only ready documents (one, two, or all three with delay).
   */
  async function runAdaptiveWordExport(steps) {
    if (fullSuiteExportInFlight) return;
    fullSuiteExportInFlight = true;

    var form = getForm();
    if (!form) {
      fullSuiteExportInFlight = false;
      alert('The form could not be found. Please refresh the page.');
      return;
    }

    steps = steps || detectAdaptiveExportSteps(form);
    if (!steps.length) {
      fullSuiteExportInFlight = false;
      alert('Complete at least one document section (IEP, BSP, or Adjustments) before exporting.');
      return;
    }

    try {
      if (typeof window.updateFormRequiredFields === 'function') {
        window.updateFormRequiredFields();
      }
      if (typeof window.updateFormFieldDisabledState === 'function') {
        window.updateFormFieldDisabledState();
      }

      if (typeof window.validateBeforeGenerate === 'function') {
        for (var vi = 0; vi < steps.length; vi++) {
          var validation = window.validateBeforeGenerate(form, steps[vi].mode);
          if (!validation.ok) {
            reportGenerateValidationFailure(validation);
            return;
          }
        }
      }

      var probeMode = steps[0].mode;
      var probe =
        typeof window.getVisibleData === 'function'
          ? window.getVisibleData(form, probeMode)
          : null;
      if (!probe) {
        alert('Could not read form data. Enter student details and try again.');
        return;
      }

      var exportCtx = {
        baseName:
          typeof window.sanitizeExportBasename === 'function'
            ? window.sanitizeExportBasename(probe.name)
            : 'Student',
        studentName: probe.name || '',
        styleText:
          typeof window.getWordDocumentStyles === 'function' ? window.getWordDocumentStyles() : ''
      };

      var downloadIssueCount = 0;

      for (var i = 0; i < steps.length; i++) {
        var step = steps[i];

        try {
          var saveResult = await runIndividualWordExportForMode(form, step, exportCtx);
          if (saveResult && saveResult.canceled) {
            downloadIssueCount++;
          }
        } catch (dlErr) {
          console.warn('Adaptive export save failed:', step.mode, dlErr);
          downloadIssueCount++;
        }

        if (i < steps.length - 1) {
          await delayMs(FULL_SUITE_DELAY_MS);
        }
      }

      if (downloadIssueCount > 0) {
        alert(
          'Export finished with some issues. ' +
            (steps.length === 1
              ? steps[0].label + ' may not have saved completely.'
              : 'One or more documents may not have saved completely.')
        );
      } else {
        console.log(
          'Adaptive export complete:',
          steps
            .map(function (s) {
              return s.mode;
            })
            .join(', ')
        );
      }
    } catch (err) {
      console.error('Adaptive export failed:', err);
      alert(
        'Could not complete export: ' + (err && err.message ? err.message : String(err))
      );
    } finally {
      fullSuiteExportInFlight = false;
      updateAdaptiveExportButtonLabels();
    }
  }

  async function runFullSuiteSequentialDownload() {
    var form = getForm();
    var steps = detectAdaptiveExportSteps(form);
    await runAdaptiveWordExport(steps);
  }

  function isLaunchpadVisible() {
    return document.body.classList.contains('launchpad-open');
  }

  function isWorkspaceVisible() {
    return document.body.classList.contains('app-ready');
  }

  function isFullSuiteDocumentsEnabled() {
    if (typeof window.isAllDocumentsMode === 'function') {
      return window.isAllDocumentsMode();
    }
    return !!(
      document.getElementById('docCheckIep')?.checked &&
      document.getElementById('docCheckBsp')?.checked &&
      document.getElementById('docCheckClassroom')?.checked
    );
  }

  function isLandingWorkspaceEntryButton(btn) {
    if (!btn) return false;
    if (btn.id === 'btn-enter-full-suite') return true;
    if (btn.classList && btn.classList.contains('launchpad__enter-full-suite')) return true;
    if (btn.closest && btn.closest('#launchpad')) return true;
    return false;
  }

  function isWorkspaceReadyForExport() {
    if (isLaunchpadVisible() || !isWorkspaceVisible()) return false;
    if (!getStudentNameFromForm()) return false;
    return detectAdaptiveExportSteps(getForm()).length > 0;
  }

  /**
   * Open IEP + BSP + Adjustments workspace (splash → form). Never starts Word export.
   */
  function revealFullSuiteWorkspace() {
    if (typeof window.applyFullSuiteWorkspaceEntry === 'function') {
      window.applyFullSuiteWorkspaceEntry();
    } else {
      applyFullSuiteDocumentSelection();
      window.selectedMode = null;
      if (typeof window.dismissLaunchpad === 'function') {
        window.dismissLaunchpad();
      }
      if (typeof window.switchTab === 'function') {
        window.switchTab('details');
      }
    }

    window.setTimeout(function () {
      updateFullSuiteExportBarVisibility();
    }, LAUNCHPAD_EXIT_MS);
  }

  function ensureFullSuiteExportActionBar() {
    if (fullSuiteExportBarEl && document.body.contains(fullSuiteExportBarEl)) {
      return fullSuiteExportBarEl;
    }

    var appMain = document.getElementById('appMain');
    if (!appMain) return null;

    var bar = document.createElement('div');
    bar.id = 'fullSuiteExportBar';
    bar.className = 'full-suite-export-bar no-print';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Full Suite export actions');
    bar.hidden = true;
    bar.style.cssText =
      'position:fixed;right:1.25rem;bottom:1.25rem;z-index:9000;display:flex;flex-direction:column;' +
      'align-items:flex-end;gap:0.35rem;max-width:min(320px,calc(100vw - 2rem));pointer-events:none;';

    var hint = document.createElement('p');
    hint.className = 'full-suite-export-bar__hint';
    hint.textContent = 'Complete the form, then export all three Word documents.';
    hint.style.cssText =
      'margin:0;padding:0.45rem 0.65rem;font-size:0.78rem;line-height:1.35;color:#1a202c;' +
      'background:rgba(255,255,255,0.96);border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,0.12);pointer-events:none;';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-export-full-suite';
    btn.className = 'btn-export-full-suite';
    btn.textContent = 'Export Document';
    btn.setAttribute('aria-label', 'Export ready Word document(s) from the current form');
    btn.style.cssText =
      'pointer-events:auto;padding:0.65rem 1.15rem;font-size:0.9rem;font-weight:700;border-radius:999px;' +
      'border:1px solid #0a7a3e;background:#0a7a3e;color:#fff;cursor:pointer;font-family:inherit;' +
      'box-shadow:0 6px 20px rgba(10,122,62,0.35);';

    bar.appendChild(hint);
    bar.appendChild(btn);
    appMain.appendChild(bar);

    bindExportFullSuiteButton(btn);

    fullSuiteExportBarEl = bar;
    return bar;
  }

  function updateFullSuiteExportBarVisibility() {
    var bar = ensureFullSuiteExportActionBar();
    if (!bar) return;
    var show = isWorkspaceVisible() && !!getStudentNameFromForm();
    bar.hidden = !show;
    updateAdaptiveExportButtonLabels();
  }

  function focusStudentNameField() {
    var el = document.getElementById('studentNameInput');
    if (!el) return;
    if (typeof window.switchTab === 'function') {
      window.switchTab('details');
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(function () {
      el.focus();
    }, 280);
  }

  async function handleExportFullSuiteClick() {
    if (fullSuiteExportInFlight) return;

    if (isLaunchpadVisible() || !isWorkspaceVisible()) {
      revealFullSuiteWorkspace();
      return;
    }

    if (!getStudentNameFromForm()) {
      updateFullSuiteExportBarVisibility();
      alert('Enter the student name on the Details tab before exporting.');
      focusStudentNameField();
      return;
    }

    var steps = detectAdaptiveExportSteps(getForm());
    if (!steps.length) {
      alert(
        'Complete at least one document section (IEP, BSP, or Adjustments), or open the tab you want to export.'
      );
      return;
    }

    await runAdaptiveWordExport(steps);
  }

  function handleWorkspaceEntryClick(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    revealFullSuiteWorkspace();
  }

  function ensureHeaderFullSuiteButton() {
    var host = document.querySelector('.progress-controls');
    if (!host) return;
    if (host.querySelector('.btn-generate-all')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-generate-all';
    btn.id = 'generateAllHeaderBtn';
    btn.textContent = 'Full Suite';
    btn.setAttribute('aria-label', 'Open or export Full Suite workspace');
    btn.style.cssText =
      'padding:0.42rem 0.75rem;font-size:0.82rem;font-weight:600;border-radius:999px;' +
      'border:1px solid var(--primary-dark);background:var(--primary-dark);color:#fff;cursor:pointer;font-family:inherit;';
    host.appendChild(btn);
  }

  function bindExportFullSuiteButton(btn) {
    if (!btn || btn.dataset.exportFullSuiteBound === '1') return;
    btn.dataset.exportFullSuiteBound = '1';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      handleExportFullSuiteClick().catch(function (err) {
        console.error('Export Full Suite failed:', err);
        alert(
          'Export Full Suite could not run: ' + (err && err.message ? err.message : String(err))
        );
      });
    });
  }

  function bindGenerateAllButton(btn) {
    if (!btn || btn.dataset.generateAllBound === '1') return;
    if (isLandingWorkspaceEntryButton(btn)) return;
    if (btn.classList && btn.classList.contains('btn-export-full-suite')) return;

    btn.dataset.generateAllBound = '1';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      handleExportFullSuiteClick().catch(function (err) {
        console.error('Full Suite header action failed:', err);
        alert(
          'Full Suite could not run: ' + (err && err.message ? err.message : String(err))
        );
      });
    });
  }

  function wireLandingFullSuiteEntry() {
    var entryBtn = document.getElementById('btn-enter-full-suite');
    if (!entryBtn || entryBtn.dataset.fullSuiteEntryBound === '1') return;
    entryBtn.dataset.fullSuiteEntryBound = '1';
    entryBtn.addEventListener('click', handleWorkspaceEntryClick);
  }

  function wireAllGenerateAllButtons() {
    document.querySelectorAll('.btn-generate-all').forEach(function (btn) {
      bindGenerateAllButton(btn);
    });

    var exportBtn = document.getElementById('btn-export-full-suite');
    if (exportBtn) {
      bindExportFullSuiteButton(exportBtn);
    }
  }

  function initFullSuiteExportBarWatchers() {
    document.querySelectorAll('.doc-check').forEach(function (cb) {
      if (cb.dataset.fullSuiteBarWatch) return;
      cb.dataset.fullSuiteBarWatch = '1';
      cb.addEventListener('change', updateFullSuiteExportBarVisibility);
    });

    var form = getForm();
    if (form && !form.dataset.adaptiveExportWatch) {
      form.dataset.adaptiveExportWatch = '1';
      var refreshLabels = function () {
        window.clearTimeout(form._adaptiveExportLabelTimer);
        form._adaptiveExportLabelTimer = window.setTimeout(function () {
          updateFullSuiteExportBarVisibility();
        }, 180);
      };
      form.addEventListener('input', refreshLabels);
      form.addEventListener('change', refreshLabels);
    }

    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      if (btn.dataset.adaptiveExportTabWatch) return;
      btn.dataset.adaptiveExportTabWatch = '1';
      btn.addEventListener('click', function () {
        window.setTimeout(updateAdaptiveExportButtonLabels, 80);
      });
    });
  }

  function initGenerateAllControls() {
    ensureHeaderFullSuiteButton();
    ensureFullSuiteExportActionBar();
    wireLandingFullSuiteEntry();
    wireAllGenerateAllButtons();
    initFullSuiteExportBarWatchers();
    updateFullSuiteExportBarVisibility();
  }

  function initLocalProgressControls() {
    var saveBtn =
      document.querySelector('.btn-save-progress') || document.getElementById('saveProgressBtn');
    var loadBtn =
      document.querySelector('.btn-load-progress') || document.getElementById('loadProgressBtn');
    if (!saveBtn || !loadBtn) {
      console.warn('Save/Load progress buttons not found in the DOM.');
      return;
    }

    if (!saveBtn.dataset.progressWired) {
      saveBtn.dataset.progressWired = '1';
      saveBtn.addEventListener('click', function (e) {
        e.preventDefault();
        saveProgressToLocalFile();
      });
    }

    if (!loadBtn.dataset.progressWired) {
      loadBtn.dataset.progressWired = '1';
      loadBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openLoadProgressDialog();
      });
    }
  }

  /* ── BSP SMART goal weaving engine (mirrors IEP goal polish) ── */

  var BSP_GOAL_COUNT = 3;

  function callWindowFn(fnName) {
    var fn = window[fnName];
    if (typeof fn !== 'function') return null;
    return fn;
  }

  function getBspPronounSet(form) {
    if (typeof window.getPronounSet === 'function') {
      return window.getPronounSet(form && form.studentGender ? form.studentGender.value : 'they');
    }
    var key = (form && form.studentGender && form.studentGender.value) || 'they';
    key = String(key).toLowerCase();
    if (key === 'he') {
      return {
        subj: 'he',
        obj: 'him',
        possDet: 'his',
        refl: 'himself',
        subjCap: 'He',
        contrIs: "he's",
        contrWill: "he'll"
      };
    }
    if (key === 'she') {
      return {
        subj: 'she',
        obj: 'her',
        possDet: 'her',
        refl: 'herself',
        subjCap: 'She',
        contrIs: "she's",
        contrWill: "she'll"
      };
    }
    return {
      subj: 'they',
      obj: 'them',
      possDet: 'their',
      refl: 'themselves',
      subjCap: 'They',
      contrIs: "they're",
      contrWill: "they'll"
    };
  }

  function getBspStudentDisplayName(form) {
    if (typeof window.getStudentDisplayNameForGoals === 'function') {
      return window.getStudentDisplayNameForGoals();
    }
    if (typeof window.formatStudentDisplayName === 'function') {
      return window.formatStudentDisplayName(getStudentNameFromForm() || 'the student');
    }
    return getStudentNameFromForm() || 'the student';
  }

  function getBspGoalPersonalizationInput(form) {
    form = form || getForm();
    var pron = getBspPronounSet(form);
    var displayName = getBspStudentDisplayName(form);
    var genderKey = form && form.studentGender ? form.studentGender.value : 'they';
    return {
      studentName: displayName,
      studentFirstName: displayName.split(/\s+/)[0] || displayName,
      preferredPronoun: genderKey,
      pronounKey: genderKey,
      pronouns: pron
    };
  }

  function sanitizeBspClauseText(text) {
    var out = String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .trim();
    if (!out) return '';
    out = out.replace(/^[-–—•\s]+/, '').replace(/[.!?]+$/, '').trim();
    return out;
  }

  function lowercaseLeadPhrase(text) {
    var t = sanitizeBspClauseText(text);
    if (!t) return '';
    return t.charAt(0).toLowerCase() + t.slice(1);
  }

  function ensureSentenceTerminal(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    if (!/[.!?]$/.test(t)) return t + '.';
    return t;
  }

  function normalizeStudentVoiceToThirdPerson(text, input) {
    var t = sanitizeBspClauseText(text);
    if (!t) return '';
    var pron = input.pronouns;
    t = t.replace(/^["']|["']$/g, '').trim();
    if (!/\b(i|i'm|i've|i'll|my|me)\b/i.test(t)) {
      return t;
    }
    if (pron.subj === 'they') {
      return t
        .replace(/\bI am\b/gi, 'they are')
        .replace(/\bI'm\b/gi, "they're")
        .replace(/\bI've\b/gi, "they've")
        .replace(/\bI'll\b/gi, "they'll")
        .replace(/\bI\b/g, 'they')
        .replace(/\bmy\b/gi, pron.possDet)
        .replace(/\bme\b/gi, pron.obj);
    }
    return t
      .replace(/\bI am\b/gi, pron.subj + ' is')
      .replace(/\bI'm\b/gi, pron.contrIs)
      .replace(/\bI've\b/gi, pron.subj + ' has')
      .replace(/\bI'll\b/gi, pron.contrWill)
      .replace(/\bI\b/gi, pron.subj)
      .replace(/\bmy\b/gi, pron.possDet)
      .replace(/\bme\b/gi, pron.obj);
  }

  function polishBspCompiledText(text, input) {
    var out = ensureSentenceTerminal(String(text || '').replace(/\s+/g, ' ').trim());
    if (typeof window.replaceGenericStudentTerms === 'function' && input) {
      out = window.replaceGenericStudentTerms(out, input.preferredPronoun, input.studentName);
    }
    if (typeof window.postProcessGoalText === 'function') {
      out = window.postProcessGoalText(out, { input: input, studentName: input.studentName });
    } else if (typeof window.cleanWordExportText === 'function') {
      out = window.cleanWordExportText(out);
    }
    return out;
  }

  function sanitizeBspInterestPhrase(text) {
    var t = sanitizeBspClauseText(text);
    if (!t) return '';
    t = t
      .replace(/^(to|and|or)\s+/i, '')
      .replace(/\b(with friends|at school|after school|during breaks|when upset|to calm down)\b/gi, '')
      .replace(/\b(a|an|the)\s+/gi, '')
      .trim();
    t = t
      .replace(/^(?:i\s+)?(?:really\s+|just\s+)?(?:like|likes|love|loves|enjoy|enjoys|prefer|prefers)\s+(?:to\s+)?/i, '')
      .replace(/^(?:playing|play|doing|going|watching)\s+/i, '')
      .replace(/\s+(?:because|when|if|so)\s+.+$/i, '')
      .trim();
    if (/basketball/i.test(t)) return 'basketball';
    if (/football|soccer|netball|afl|rugby/i.test(t)) return 'sport and physical activity';
    if (/draw|drawing|art|sketch|paint/i.test(t)) return 'drawing and creative art';
    if (/music|guitar|drum|piano|sing/i.test(t)) return 'music';
    if (/game|gaming|minecraft|fortnite|roblox/i.test(t)) return 'gaming';
    if (/read|reading|books|novel/i.test(t)) return 'reading';
    if (/lego|building|construct/i.test(t)) return 'building and construction play';
    if (/animal|dog|cat|horse|pet/i.test(t)) return 'animals';
    if (/cook|baking|food/i.test(t)) return 'cooking and baking';
    if (/dance|dancing/i.test(t)) return 'dance';
    if (/swim|swimming/i.test(t)) return 'swimming';
    if (/outside|outdoor|yard|playground/i.test(t)) return 'outdoor play';
    if (t.length > 48) t = t.split(/\s+/).slice(0, 5).join(' ');
    return lowercaseLeadPhrase(t);
  }

  /**
   * Grammar smoothing for interests — e.g. "I like basketball" → "basketball".
   */
  function smoothInterestForProse(text, input) {
    var raw = sanitizeBspClauseText(text);
    if (!raw) return 'preferred calming activities';

    var normalized = normalizeStudentVoiceToThirdPerson(raw, input);
    var fromPhrase = sanitizeBspInterestPhrase(normalized);
    if (fromPhrase) return fromPhrase;

    var likeMatch = normalized.match(
      /\b(?:like|likes|love|loves|enjoy|enjoys|prefer|prefers|interested in|passionate about|keen on)\s+(.+)/i
    );
    if (likeMatch) {
      fromPhrase = sanitizeBspInterestPhrase(likeMatch[1]);
      if (fromPhrase) return fromPhrase;
    }

    var playMatch = normalized.match(/\b(?:play|playing)\s+(.+)/i);
    if (playMatch) {
      fromPhrase = sanitizeBspInterestPhrase(playMatch[1]);
      if (fromPhrase) return fromPhrase;
    }

    return sanitizeBspInterestPhrase(normalized) || 'preferred calming activities';
  }

  /**
   * Step 1 — extract observed negative behaviour / aggression (never paste raw voice here).
   */
  function extractObservedBehaviourPhrase(behavioursTriggers, targetReplacement) {
    var raw = sanitizeBspClauseText(behavioursTriggers);
    var target = sanitizeBspClauseText(targetReplacement);
    var source = raw || target;
    if (!source) return 'escalating behaviour';

    var firstClause = source.split(/[;\n]/)[0].split(/,(?!\s*\d)/)[0].trim();
    firstClause = firstClause
      .replace(/^when\s+(?:experiencing|demonstrating|showing)\s+/i, '')
      .replace(/^during\s+/i, '')
      .replace(/^triggers?:\s*/i, '')
      .replace(/^observed:\s*/i, '')
      .trim();

    var lower = firstClause.toLowerCase();
    if (/aggress|hit|kick|punch|yell|shout|swear|throw|spit|bite|fight|attack/.test(lower)) {
      return 'aggressive behaviour';
    }
    if (/walk(?:s|ing)?\s+out|leave(?:s|ing)?\s+(?:the\s+)?(?:room|class)|flee|run(?:s|ning)?\s+away/.test(lower)) {
      return 'leaving the learning environment without permission';
    }
    if (/refus|defian|non-?compliance|won'?t\s+follow/.test(lower)) {
      return 'refusing to follow adult directions';
    }
    if (/disrupt|off[\s-]?task|not\s+ready\s+to\s+learn/.test(lower)) {
      return 'disruptive or off-task behaviour';
    }
    if (/escalat|dysregulat|meltdown|outburst/.test(lower)) {
      return 'escalating emotional dysregulation';
    }
    if (/trigger|transition|unstructured|noise|peer/.test(lower)) {
      return lowercaseLeadPhrase(firstClause);
    }
    return lowercaseLeadPhrase(firstClause);
  }

  /**
   * Step 3 inputs — parse interests, rewards, and regulation preferences from Student Voice.
   * Never returns the raw field text for insertion into compiled sentences.
   */
  function parseBspStudentVoiceProfile(text, input) {
    var profile = {
      interests: [],
      interestLabel: 'preferred calming activities',
      reinforcementInterest: 'preferred calming activities',
      regulationPreference: ''
    };

    var normalized = normalizeStudentVoiceToThirdPerson(text, input);
    if (!normalized) return profile;

    var chunks = normalized
      .split(/[\n;]+/)
      .map(function (part) {
        return sanitizeBspClauseText(part);
      })
      .filter(Boolean);

    var likePattern =
      /\b(?:like|likes|love|loves|enjoy|enjoys|prefer|prefers|interested in|passionate about|keen on|motivated by)\s+(.+)/i;
    var playPattern = /\b(?:play|playing)\s+(.+)/i;
    var wantPattern = /\b(?:want|wants|need|needs|would like)\s+(?:to\s+)?(.+)/i;

    chunks.forEach(function (chunk) {
      var interest = '';
      var m = chunk.match(likePattern);
      if (m) interest = sanitizeBspInterestPhrase(m[1]);
      if (!interest) {
        m = chunk.match(playPattern);
        if (m) interest = sanitizeBspInterestPhrase(m[1]);
      }
      if (!interest && /basketball/i.test(chunk)) interest = 'basketball';
      if (!interest && /(?:football|soccer|sport)/i.test(chunk)) interest = 'sport and physical activity';
      if (!interest && /(?:draw|drawing|art|sketch)/i.test(chunk)) interest = 'drawing and creative art';
      if (!interest && /(?:music|guitar|drum)/i.test(chunk)) interest = 'music';
      if (!interest && /(?:game|gaming|minecraft|fortnite)/i.test(chunk)) interest = 'gaming';
      if (!interest && /(?:read|reading|books)/i.test(chunk)) interest = 'reading';
      if (interest && profile.interests.indexOf(interest) < 0) profile.interests.push(interest);

      if (/quiet\s+(?:space|area|room|corner)/i.test(chunk)) {
        profile.regulationPreference = 'a quiet, low-stimulation space';
      } else if (/movement\s+break|break\s+pass|walk(?:\s+and)?\s+break/i.test(chunk)) {
        profile.regulationPreference = 'a brief supervised movement break';
      } else if (/headphone|listen(?:ing)?\s+to\s+music/i.test(chunk)) {
        profile.regulationPreference = 'listening to music with headphones';
      } else if (/deep\s+breath|breathing|mindful|calm\s+down/i.test(chunk)) {
        profile.regulationPreference = 'guided breathing and mindfulness strategies';
      } else if (/fidget|sensory\s+tool/i.test(chunk)) {
        profile.regulationPreference = 'an agreed sensory tool or fidget strategy';
      }

      m = chunk.match(wantPattern);
      if (m) {
        var wantText = sanitizeBspClauseText(m[1]);
        if (/quiet|space|break|move|basketball|draw|music|outside|yard|court/i.test(wantText)) {
          if (!profile.regulationPreference && /quiet|space/i.test(wantText)) {
            profile.regulationPreference = 'a quiet, low-stimulation space';
          }
          if (/basketball/i.test(wantText) && profile.interests.indexOf('basketball') < 0) {
            profile.interests.push('basketball');
          }
        }
      }
    });

    if (profile.interests.length) {
      profile.interestLabel = smoothInterestForProse(profile.interests[0], input);
      profile.reinforcementInterest = profile.interestLabel;
    } else if (profile.regulationPreference) {
      if (/quiet/i.test(profile.regulationPreference)) {
        profile.reinforcementInterest = 'quiet regulation time';
      } else if (/movement/i.test(profile.regulationPreference)) {
        profile.reinforcementInterest = 'movement breaks';
      } else if (/music/i.test(profile.regulationPreference)) {
        profile.reinforcementInterest = 'music';
      }
    }

    return profile;
  }

  function normalizeBehaviourLabelForList(label) {
    var t = sanitizeBspClauseText(label);
    if (!t) return '';
    return lowercaseLeadPhrase(t);
  }

  function joinBehaviourListPhrases(items) {
    var list = (items || [])
      .map(function (item) {
        return normalizeBehaviourLabelForList(item);
      })
      .filter(Boolean);
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    if (list.length === 2) return list[0] + ' and ' + list[1];
    return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
  }

  function getBehaviourConcernItems(form) {
    form = form || getForm();
    if (!form) return [];

    var container = form.querySelector('#tab-behaviours') || form;
    var checked = Array.prototype.slice.call(
      container.querySelectorAll('input[name="behavioursConcern"]:checked')
    );

    var items = checked
      .map(function (el) {
        var labelEl = el.closest('label');
        var labelText = labelEl
          ? labelEl.textContent.replace(el.value, '').trim()
          : el.value;
        return {
          value: sanitizeBspClauseText(el.value || ''),
          label: sanitizeBspClauseText(labelText || el.value)
        };
      })
      .filter(function (item) {
        return item.label;
      });

    var otherEl =
      form.behavioursConcernOther || form.querySelector('[name="behavioursConcernOther"]');
    var otherText = otherEl ? sanitizeBspClauseText(otherEl.value || '') : '';
    if (otherText) {
      items.push({ value: 'Other', label: otherText });
    }

    return items;
  }

  function mapBehaviourConcernItem(item) {
    if (!item || !item.label) return null;
    return {
      value: item.value,
      label: normalizeBehaviourLabelForList(item.label),
      display: item.label
    };
  }

  /**
   * First checked behaviour of concern — primary focus for Goal 1.
   */
  function getPrimaryBehaviourOfConcern(form) {
    var items = getBehaviourConcernItems(form);
    if (!items.length) return null;
    return mapBehaviourConcernItem(items[0]);
  }

  /**
   * Second checked behaviour of concern — focus for Goal 2 (null if fewer than two).
   */
  function getSecondaryBehaviourOfConcern(form) {
    var items = getBehaviourConcernItems(form);
    if (items.length < 2) return null;
    return mapBehaviourConcernItem(items[1]);
  }

  function getBaselineSecondaryRegulationBehaviour() {
    return {
      value: 'Baseline regulation',
      label: 'classroom emotional regulation',
      display: 'classroom emotional regulation'
    };
  }

  function getSelectedBehavioursOfConcern(form) {
    return joinBehaviourListPhrases(
      getBehaviourConcernItems(form).map(function (item) {
        return item.label;
      })
    );
  }

  function getPositiveBehaviourItems(form) {
    form = form || getForm();
    if (!form) return [];

    var container = form.querySelector('#tab-behaviours') || form;
    var checked = Array.prototype.slice.call(
      container.querySelectorAll('input[name="behavioursPositive"]:checked')
    );

    return checked
      .map(function (el) {
        var labelEl = el.closest('label');
        var labelText = labelEl
          ? labelEl.textContent.replace(el.value, '').trim()
          : el.value;
        return sanitizeBspClauseText(labelText || el.value);
      })
      .filter(Boolean);
  }

  function parseStrengthFromProfile(text) {
    var raw = sanitizeBspClauseText(text);
    if (!raw) return '';

    if (/hands-on|hands on|practical|building|construction|maker/i.test(raw)) {
      return 'hands-on tasks and practical learning';
    }
    if (/leadership|leader|mentor|role model/i.test(raw)) {
      return 'leadership and positive peer influence';
    }
    if (/kind|help(?:ing)? others|support(?:ing)? peers|inclusive/i.test(raw)) {
      return 'kindness and positive peer support';
    }
    if (/sport|basketball|football|active|physical/i.test(raw)) {
      return 'active engagement and positive play';
    }
    if (/art|creativ|music|draw/i.test(raw)) {
      return 'creative strengths and expressive learning';
    }

    var chunk = raw.split(/[\n;]+/)[0].split(/,(?!\s*\d)/)[0].trim();
    if (chunk.length > 72) chunk = chunk.split(/\s+/).slice(0, 10).join(' ');
    return lowercaseLeadPhrase(chunk);
  }

  function normalizeStrengthPhrase(label) {
    var t = lowercaseLeadPhrase(sanitizeBspClauseText(label));
    if (/leadership|peer support/.test(t)) return 'leadership and positive peer support';
    if (/cooperative|group/.test(t)) return 'cooperative teamwork and group learning';
    if (/hands-on|learning tasks|engages willingly/.test(t)) return 'hands-on tasks and engaged learning';
    if (/attendance|punctual/.test(t)) return 'positive attendance and punctuality';
    if (/persistence|challenging/.test(t)) return 'persistence with challenging tasks';
    if (/self-regulation/.test(t)) return 'successful use of self-regulation strategies';
    if (/safe.*play|movement/.test(t)) return 'safe, positive play and movement';
    return t;
  }

  /**
   * Primary strength focus for Goal 3 — positive behaviours, profile strengths, or baseline excellence.
   */
  function getPrimaryStrengthFocus(form) {
    form = form || getForm();
    if (!form) return null;

    var positives = getPositiveBehaviourItems(form);
    var otherEl =
      form.behavioursPositiveOther || form.querySelector('[name="behavioursPositiveOther"]');
    var otherText = otherEl ? sanitizeBspClauseText(otherEl.value || '') : '';
    var profileStrengths = (form.likesStrengths && form.likesStrengths.value) || '';

    if (positives.length) {
      return {
        source: 'positive-behaviour',
        phrase: normalizeStrengthPhrase(positives[0]),
        display: positives[0]
      };
    }
    if (otherText) {
      return {
        source: 'positive-other',
        phrase: parseStrengthFromProfile(otherText) || lowercaseLeadPhrase(otherText),
        display: otherText
      };
    }
    if (profileStrengths) {
      var parsed = parseStrengthFromProfile(profileStrengths);
      if (parsed) {
        return {
          source: 'profile',
          phrase: parsed,
          display: profileStrengths.split(/[\n;]+/)[0].trim()
        };
      }
    }

    return null;
  }

  function getBspBehaviourInterventionProfile(primary, input, options) {
    var pron = input.pronouns;
    var key = (primary && primary.value) || '';
    var isSecondary = options && options.secondary;
    var profiles = {
      Truancy: {
        target: 'attending all scheduled core classes daily',
        secondaryTarget: 'arriving prepared and settled for afternoon learning sessions',
        pbis: 'proactive school-wide engagement practices',
        secondaryPbis: 'proactive PBIS environmental adjustments and transition routines',
        measurable:
          pron.subjCap + ' attends all scheduled core classes daily across a four-week review period',
        secondaryMeasurable:
          pron.subjCap +
          ' arrives prepared for afternoon sessions in 4 out of 5 observed school days',
        relevant:
          'Consistent attendance supports learning, belonging, and re-engagement through positive behaviour support.',
        secondaryRelevant:
          'Afternoon readiness routines strengthen continuity of learning across the school day.'
      },
      'Fighting/Threats': {
        target: 'resolving conflict safely without physical aggression or threats',
        secondaryTarget: 'using calm problem-solving strategies during peer disagreements',
        pbis: 'restorative practices and PBIS-aligned conflict de-escalation workflows',
        secondaryPbis: 'proactive PBIS environmental adjustments and supervised peer-work structures',
        measurable:
          pron.subjCap +
          ' resolves peer conflict without physical aggression in 4 out of 5 observed situations',
        secondaryMeasurable:
          pron.subjCap +
          ' uses agreed calm-down strategies before conflict escalates in 4 out of 5 situations',
        relevant: 'Safe conflict resolution protects learning time and strengthens pro-social skills.',
        secondaryRelevant: 'Preventative regulation reduces incidents and supports classroom safety.'
      },
      'Verbal abuse': {
        target: 'communicating respectfully with peers and adults during moments of frustration',
        secondaryTarget: 'maintaining respectful communication during collaborative tasks',
        pbis: 'restorative communication routines and positive behaviour support check-ins',
        secondaryPbis: 'proactive PBIS environmental adjustments and restorative communication prompts',
        measurable:
          pron.subjCap +
          ' uses respectful language in 4 out of 5 previously challenging interactions over four weeks',
        secondaryMeasurable:
          pron.subjCap +
          ' maintains respectful tone during group work in 4 out of 5 observed sessions',
        relevant: 'Respectful communication supports positive relationships and classroom safety.',
        secondaryRelevant: 'Respectful collaboration protects peer relationships and learning flow.'
      },
      'Physical abuse': {
        target: 'keeping hands and body safe during moments of heightened emotion',
        secondaryTarget: 'maintaining safe personal space during whole-class learning periods',
        pbis: 'structured de-escalation pathways and supervised regulation breaks',
        secondaryPbis: 'proactive PBIS environmental adjustments and proximity support plans',
        measurable:
          pron.subjCap + ' maintains safe body boundaries in 4 out of 5 observed trigger situations',
        secondaryMeasurable:
          pron.subjCap +
          ' maintains safe body boundaries during 20-minute learning intervals in 4 out of 5 sessions',
        relevant: 'Physical safety is essential for learning and positive peer engagement.',
        secondaryRelevant: 'Consistent safe conduct supports uninterrupted instructional time.'
      },
      'Ongoing defiance': {
        target: 'following agreed classroom expectations with adult support',
        secondaryTarget: 'initiating tasks within agreed timeframes during structured lessons',
        pbis: 'predictable routines, choice-making, and positive reinforcement sequences',
        secondaryPbis: 'proactive PBIS environmental adjustments and visual schedule supports',
        measurable:
          pron.subjCap +
          ' follows adult directions within two prompts in 4 out of 5 observed opportunities',
        secondaryMeasurable:
          pron.subjCap +
          ' begins assigned tasks within five minutes in 4 out of 5 observed 20-minute blocks',
        relevant: 'Cooperative compliance supports access to learning and reduces escalation.',
        secondaryRelevant: 'Task initiation skills reduce instructional disruption and build independence.'
      },
      "Disrupting others' learning": {
        target: 'remaining engaged without disrupting the learning of others',
        secondaryTarget: 'maintaining focus on assigned tasks for 20-minute intervals',
        pbis: 'proactive environmental adjustments and scheduled regulation breaks',
        secondaryPbis: 'proactive PBIS environmental adjustments',
        measurable:
          pron.subjCap +
          ' remains on task without disrupting peers in 80% of observed learning blocks',
        secondaryMeasurable:
          pron.subjCap +
          ' maintains focus on assigned tasks for 20-minute intervals in 4 out of 5 observed sessions',
        relevant: 'On-task engagement protects instructional time for the whole class.',
        secondaryRelevant: 'Sustained focus intervals support academic progress and peer learning.'
      },
      Bullying: {
        target: 'interacting with peers in safe, respectful, and inclusive ways',
        secondaryTarget: 'demonstrating inclusive and respectful behaviour during unstructured periods',
        pbis: 'restorative practices, social skills coaching, and supervised peer interactions',
        secondaryPbis: 'proactive PBIS environmental adjustments and supervised social skills coaching',
        measurable:
          pron.subjCap +
          ' demonstrates respectful peer interactions in 4 out of 5 observed social situations',
        secondaryMeasurable:
          pron.subjCap +
          ' demonstrates inclusive peer interactions in 4 out of 5 observed yard or group situations',
        relevant: 'Respectful peer behaviour supports wellbeing and a positive school climate.',
        secondaryRelevant: 'Inclusive conduct strengthens belonging and reduces harm.'
      },
      'Not ready to learn': {
        target: 'using agreed readiness strategies before joining learning tasks',
        secondaryTarget: 'maintaining on-task engagement for 20-minute structured learning intervals',
        pbis: 'predictable arrival routines and readiness check-ins aligned with PBIS',
        secondaryPbis: 'proactive PBIS environmental adjustments and readiness cue systems',
        measurable:
          pron.subjCap +
          ' joins learning tasks within five minutes using agreed readiness strategies in 4 out of 5 sessions',
        secondaryMeasurable:
          pron.subjCap +
          ' sustains readiness and on-task behaviour across 20-minute intervals in 4 out of 5 sessions',
        relevant: 'Learning readiness supports participation and reduces lost instructional time.',
        secondaryRelevant: 'Sustained readiness builds stamina for classroom learning.'
      },
      'Baseline regulation': {
        target: 'maintaining calm, on-task engagement during structured learning periods',
        secondaryTarget: 'maintaining calm, on-task focus during structured 20-minute learning intervals',
        pbis: 'proactive PBIS environmental adjustments and scheduled regulation breaks',
        secondaryPbis: 'proactive PBIS environmental adjustments and scheduled regulation breaks',
        measurable:
          pron.subjCap +
          ' maintains regulated, on-task behaviour in 4 out of 5 observed learning sessions',
        secondaryMeasurable:
          pron.subjCap +
          ' maintains calm, on-task focus for 20-minute intervals in 4 out of 5 observed sessions',
        relevant: 'Classroom regulation supports learning access and positive behaviour growth.',
        secondaryRelevant: 'Consistent self-regulation strengthens engagement and reduces escalation.'
      }
    };

    var profile = profiles[key] || {
      target: 'utilizing safe, positive replacement actions during moments of concern',
      secondaryTarget: 'maintaining focus on assigned tasks for 20-minute intervals',
      pbis: 'positive behaviour support workflows and structured de-escalation pathways',
      secondaryPbis: 'proactive PBIS environmental adjustments',
      measurable:
        pron.subjCap +
        ' demonstrates replacement behaviours in 4 out of 5 observed opportunities over four weeks',
      secondaryMeasurable:
        pron.subjCap +
        ' maintains on-task engagement for 20-minute intervals in 4 out of 5 observed sessions',
      relevant: 'Targeted positive behaviour support reduces disruption and strengthens self-regulation.',
      secondaryRelevant: 'Sustained engagement supports academic progress and classroom harmony.'
    };

    if (isSecondary) {
      return {
        target: profile.secondaryTarget || profile.target,
        pbis: profile.secondaryPbis || profile.pbis,
        measurable: profile.secondaryMeasurable || profile.measurable,
        relevant: profile.secondaryRelevant || profile.relevant
      };
    }

    return {
      target: profile.target,
      pbis: profile.pbis,
      measurable: profile.measurable,
      relevant: profile.relevant
    };
  }

  function buildStudentVoiceInterventionHook(interest, name, pron, primary) {
    var behaviourKey = primary && primary.value;
    var hookInterest = interest || 'preferred calming activities';

    if (/basketball/i.test(hookInterest)) {
      if (behaviourKey === 'Truancy') {
        return (
          'matching ' +
          name +
          ' with a morning staff-student basketball check-in mentor to establish a positive connection upon arrival'
        );
      }
      return (
        'scheduling brief basketball-based staff-student check-ins that build connection before challenging transitions'
      );
    }
    if (/sport|physical activity/i.test(hookInterest)) {
      return (
        'embedding supervised ' +
        hookInterest +
        ' breaks that support regulation and positive staff-student connection'
      );
    }
    if (/music/i.test(hookInterest)) {
      return (
        'using brief music-based regulation breaks with a trusted staff member before re-engaging with learning tasks'
      );
    }
    if (/draw|art|creativ/i.test(hookInterest)) {
      return (
        'offering a short creative art break with staff support to reset before returning to classroom expectations'
      );
    }
    if (/gaming|game/i.test(hookInterest)) {
      return (
        'using agreed interest-based reward check-ins with staff to reinforce replacement behaviours and connection'
      );
    }
    if (/quiet|regulation/i.test(hookInterest)) {
      return (
        'providing access to a quiet regulation space with staff check-in before returning to learning tasks'
      );
    }

    return (
      'leveraging ' +
      pron.possDet +
      ' interest in ' +
      hookInterest +
      ' through structured staff-student connection activities that support regulation and re-engagement'
    );
  }

  function buildStudentVoiceSecondaryHook(interest, name, pron, behaviour) {
    var hookInterest = interest || 'preferred calming activities';
    var behaviourKey = behaviour && behaviour.value;

    if (/draw|art|creativ/i.test(hookInterest)) {
      return (
        'structuring a designated 5-minute creative cool-down reward period immediately following task completion'
      );
    }
    if (/basketball|sport|physical/i.test(hookInterest)) {
      return (
        'scheduling a brief supervised ' +
        hookInterest +
        ' reward break immediately following completed work intervals'
      );
    }
    if (/music/i.test(hookInterest)) {
      return (
        'providing a designated 5-minute music listening reward period immediately following task completion'
      );
    }
    if (/gaming|game/i.test(hookInterest)) {
      return (
        'offering a brief agreed gaming reward window with staff check-in after successful task completion'
      );
    }
    if (/quiet|regulation/i.test(hookInterest)) {
      return (
        'providing access to a quiet regulation space for five minutes immediately following completed tasks'
      );
    }
    if (behaviourKey === "Disrupting others' learning") {
      return (
        'structuring a brief interest-based reward period immediately following each completed 20-minute learning interval'
      );
    }

    return (
      'structuring a brief ' +
      hookInterest +
      '-based reward period immediately following successful task completion'
    );
  }

  /**
   * Goal 1 — Primary Targeted Support: first isolated behaviour, PBIS interventions, student-voice hook.
   */
  function buildBspTargetedSupportParagraph(params) {
    var input = params.input;
    var pron = input.pronouns;
    var name = input.studentName;
    var form = params.form || getForm();
    var primary =
      params.primaryBehaviour ||
      getPrimaryBehaviourOfConcern(form) ||
      (params.behavioursTriggers
        ? {
            value: '',
            label: lowercaseLeadPhrase(
              sanitizeBspClauseText(params.behavioursTriggers).split(/[;\n,]/)[0]
            ),
            display: params.behavioursTriggers
          }
        : null);

    if (!primary || !primary.label) {
      primary = { value: '', label: 'behavioural concern', display: 'behavioural concern' };
    }

    var profile = getBspBehaviourInterventionProfile(primary, input, { secondary: false });
    var voiceProfile = parseBspStudentVoiceProfile(params.studentVoice, input);
    var interest = smoothInterestForProse(
      voiceProfile.reinforcementInterest || params.studentVoice,
      input
    );
    var voiceHook = buildStudentVoiceInterventionHook(interest, name, pron, primary);
    var behaviourLabel = primary.label;

    var paragraph =
      'To address indicators of ' +
      behaviourLabel +
      ', ' +
      name +
      ' will work toward a target of ' +
      profile.target +
      '. To support this goal, staff will implement ' +
      profile.pbis +
      ', leveraging ' +
      pron.possDet +
      ' interest in ' +
      interest +
      ' by ' +
      voiceHook +
      '.';

    var polished = polishBspCompiledText(paragraph, input);

    return {
      paragraph: polished,
      goalType: 'targeted-support',
      primaryBehaviour: behaviourLabel,
      interest: interest,
      voiceProfile: voiceProfile,
      staffSupport:
        'Staff will implement ' + profile.pbis + ' using ' + interest + ' as the student-voice connection hook.',
      studentTarget: name + ' will work toward ' + profile.target + '.',
      measurableDefault: profile.measurable,
      relevantDefault: profile.relevant
    };
  }

  /**
   * Goal 2 — Secondary Targeted Support: second isolated behaviour or baseline regulation fallback.
   */
  function buildBspSecondaryTargetedSupportParagraph(params) {
    var input = params.input;
    var pron = input.pronouns;
    var name = input.studentName;
    var form = params.form || getForm();
    var secondary = params.primaryBehaviour || getSecondaryBehaviourOfConcern(form);
    var isBaseline = params.isBaselineFallback || !secondary;

    if (!secondary) {
      secondary = getBaselineSecondaryRegulationBehaviour();
      isBaseline = true;
    }

    var profile = getBspBehaviourInterventionProfile(secondary, input, { secondary: true });
    var voiceProfile = parseBspStudentVoiceProfile(params.studentVoice, input);
    var interest = smoothInterestForProse(
      voiceProfile.reinforcementInterest || params.studentVoice,
      input
    );
    var voiceHook = buildStudentVoiceSecondaryHook(interest, name, pron, secondary);
    var behaviourLabel = secondary.label;

    var paragraph;
    if (isBaseline) {
      paragraph =
        'To support ongoing classroom regulation and sustained engagement, ' +
        name +
        ' will work toward ' +
        profile.target +
        '. To facilitate this, staff will implement ' +
        profile.pbis +
        ', utilizing ' +
        pron.possDet +
        ' interest in ' +
        interest +
        ' by ' +
        voiceHook +
        '.';
    } else {
      paragraph =
        'To address secondary indicators of ' +
        behaviourLabel +
        ', ' +
        name +
        ' will work toward ' +
        profile.target +
        '. To facilitate this, staff will implement ' +
        profile.pbis +
        ', utilizing ' +
        pron.possDet +
        ' interest in ' +
        interest +
        ' by ' +
        voiceHook +
        '.';
    }

    var polished = polishBspCompiledText(paragraph, input);

    return {
      paragraph: polished,
      goalType: 'secondary-targeted-support',
      primaryBehaviour: behaviourLabel,
      isBaselineFallback: isBaseline,
      interest: interest,
      voiceProfile: voiceProfile,
      staffSupport:
        'Staff will implement ' +
        profile.pbis +
        ' using ' +
        interest +
        ' as the primary student-voice support vector.',
      studentTarget: name + ' will work toward ' + profile.target + '.',
      measurableDefault: profile.measurable,
      relevantDefault: profile.relevant
    };
  }

  /**
   * Goal 3 — Strength-Based Excellence: maintain and extend documented positive strengths.
   */
  function buildBspStrengthBasedParagraph(params) {
    var input = params.input;
    var pron = input.pronouns;
    var name = input.studentName;
    var form = params.form || getForm();
    var strength = params.strengthFocus || getPrimaryStrengthFocus(form);

    if (!strength || !strength.phrase) {
      return null;
    }

    var phrase = strength.phrase;
    var staffAction = '';
    var measurable = '';
    var lower = phrase.toLowerCase();

    if (/leadership|peer influence|peer support/.test(lower)) {
      staffAction =
        'Staff will provide opportunities for ' +
        name +
        ' to lead peer-group projects, reinforcing ' +
        pron.possDet +
        ' capability and promoting positive school identity.';
      measurable =
        pron.subjCap +
        ' leads or co-leads peer-group tasks successfully in 4 out of 5 observed opportunities';
    } else if (/hands-on|practical|engaged learning/.test(lower)) {
      staffAction =
        'Staff will provide structured hands-on leadership opportunities within collaborative projects, reinforcing ' +
        pron.possDet +
        ' practical capability and promoting positive school identity.';
      measurable =
        pron.subjCap +
        ' completes hands-on leadership responsibilities in 4 out of 5 planned project sessions';
    } else if (/cooperative|teamwork|group/.test(lower)) {
      staffAction =
        'Staff will offer facilitated collaborative learning roles that extend ' +
        pron.possDet +
        ' cooperative strengths and strengthen positive peer connections.';
      measurable =
        pron.subjCap +
        ' contributes constructively during group work in 80% of observed sessions';
    } else if (/attendance|punctual/.test(lower)) {
      staffAction =
        'Staff will recognise ' +
        pron.possDet +
        ' attendance reliability through trusted peer-mentor responsibilities that reinforce belonging and school pride.';
      measurable =
        pron.subjCap + ' maintains strong attendance while fulfilling agreed mentor responsibilities';
    } else if (/self-regulation/.test(lower)) {
      staffAction =
        'Staff will extend opportunities for ' +
        name +
        ' to model agreed regulation strategies with younger peers, reinforcing ' +
        pron.possDet +
        ' growing independence.';
      measurable =
        pron.subjCap +
        ' demonstrates self-regulation strategies independently in 4 out of 5 observed situations';
    } else {
      staffAction =
        'Staff will provide planned opportunities for ' +
        name +
        ' to demonstrate and extend this strength, reinforcing ' +
        pron.possDet +
        ' capability and promoting positive school identity.';
      measurable =
        pron.subjCap +
        ' sustains documented positive behaviours in 80% of weekly observations';
    }

    var paragraph =
      'Recognizing ' +
      name +
      "'s exceptional baseline strength in " +
      phrase +
      ', a strength-based excellence goal is established to foster continued growth in this space. ' +
      staffAction;

    var polished = polishBspCompiledText(paragraph, input);

    return {
      paragraph: polished,
      goalType: 'strength-based',
      strengthPhrase: phrase,
      staffSupport: staffAction,
      studentTarget: name + ' will maintain and extend ' + pron.possDet + ' strength in ' + phrase + '.',
      measurableDefault: measurable,
      relevantDefault:
        'Strength-based goals build school identity, wellbeing, and sustained positive behaviour.'
    };
  }

  function buildCompactBspGoalParagraph(params) {
    if (params.goalType === 'strength-based' || params.goalNum === 3) {
      return buildBspStrengthBasedParagraph(params) || buildBspSecondaryTargetedSupportParagraph(params);
    }
    if (params.goalType === 'secondary-targeted-support' || params.goalNum === 2) {
      return buildBspSecondaryTargetedSupportParagraph(params);
    }
    return buildBspTargetedSupportParagraph(params);
  }

  function buildCompiledBspWovenGoal(params) {
    return buildCompactBspGoalParagraph(params).paragraph;
  }

  function getBspFormField(form, name) {
    if (!form || !name) return null;
    if (form.elements && form.elements[name]) return form.elements[name];
    return form.querySelector('[name="' + name + '"]');
  }

  function readBspGoalInputs(goalNum, form) {
    form = form || getForm();
    var prefix = 'bsp' + goalNum + '_';
    return {
      behavioursTriggers: (getBspFormField(form, prefix + 'behavioursTriggers') || {}).value || '',
      studentVoice: (getBspFormField(form, prefix + 'studentVoice') || {}).value || '',
      targetReplacement: (getBspFormField(form, prefix + 'targetReplacement') || {}).value || '',
      specific: (getBspFormField(form, prefix + 'specific') || {}).value || '',
      measurable: (getBspFormField(form, prefix + 'measurable') || {}).value || '',
      achievable: (getBspFormField(form, prefix + 'achievable') || {}).value || '',
      relevant: (getBspFormField(form, prefix + 'relevant') || {}).value || '',
      timebound: (getBspFormField(form, prefix + 'timebound') || {}).value || ''
    };
  }

  function ensureBspCompiledStore(goalNum) {
    var form = getForm();
    if (!form) return null;
    var name = 'bsp' + goalNum + '_compiled';
    var existing = getBspFormField(form, name);
    if (existing) return existing;
    var ta = document.createElement('textarea');
    ta.name = name;
    ta.id = name;
    ta.className = 'iep-goal-generated-store';
    ta.setAttribute('aria-hidden', 'true');
    ta.tabIndex = -1;
    var panel = document.getElementById('bsp-goal-' + goalNum);
    if (panel) panel.appendChild(ta);
    else form.appendChild(ta);
    return ta;
  }

  function ensureBspCompiledPreview(goalNum) {
    var id = 'bsp' + goalNum + '_compiledPreview';
    var el = document.getElementById(id);
    if (el) return el;

    var host = document.querySelector('#bsp-goal-' + goalNum + ' .bsp-goal-smart-host');
    if (!host) return null;

    el = document.createElement('div');
    el.id = id;
    el.className = 'goal-compiled-section bsp-goal-compiled-output';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML =
      '<div class="goal-compiled-header">' +
      '<strong class="goal-compiled-label">Compiled SMART Goal</strong>' +
      '</div>' +
      '<div class="goal-compiled-output iep-goal-result-field" data-bsp-compiled-text></div>';
    host.insertBefore(el, host.firstChild);
    return el;
  }

  function renderBspCompiledPreview(goalNum, narrative) {
    var preview = ensureBspCompiledPreview(goalNum);
    if (!preview) return;
    var textEl = preview.querySelector('[data-bsp-compiled-text]');
    if (!textEl) return;
    var text = String(narrative || '').trim();
    if (!text) {
      preview.hidden = true;
      textEl.textContent = '';
      return;
    }
    preview.hidden = false;
    textEl.style.whiteSpace = 'normal';
    textEl.textContent = text;
  }

  function clearBspGoalOutput(goalNum) {
    var form = getForm();
    if (!form) return;

    renderBspCompiledPreview(goalNum, '');
    var store = ensureBspCompiledStore(goalNum);
    if (store) store.value = '';
  }

  function compileBspGoalFromForm(goalNum, form, seed) {
    form = form || getForm();
    if (!form) return null;

    var input = getBspGoalPersonalizationInput(form);
    var fields = readBspGoalInputs(goalNum, form);
    if (seed) {
      fields = Object.assign({}, fields, seed);
    }

    var studentVoice =
      sanitizeBspClauseText(fields.studentVoice) ||
      sanitizeBspClauseText((form.likesStrengths && form.likesStrengths.value) || '');

    var target =
      sanitizeBspClauseText(fields.targetReplacement) ||
      sanitizeBspClauseText(fields.specific) ||
      sanitizeBspClauseText(seed && seed.targetReplacement) ||
      sanitizeBspClauseText(seed && seed.specific);

    var measurable = sanitizeBspClauseText(fields.measurable || (seed && seed.measurable));
    var achievable = sanitizeBspClauseText(fields.achievable || (seed && seed.achievable));
    var relevant = sanitizeBspClauseText(fields.relevant || (seed && seed.relevant));
    var timebound = sanitizeBspClauseText(fields.timebound || (seed && seed.timebound));

    function defaultTimebound() {
      return typeof window.getSmartGoalTermPhrase === 'function'
        ? window.getSmartGoalTermPhrase()
        : 'the end of this term';
    }

    function packageCompiled(compact, targetReplacement) {
      if (!measurable) measurable = compact.measurableDefault;
      if (!timebound) timebound = defaultTimebound();
      if (!achievable) achievable = compact.staffSupport;
      if (!relevant) relevant = compact.relevantDefault;

      return {
        specific: compact.paragraph,
        measurable: measurable,
        achievable: achievable,
        relevant: relevant,
        timebound: timebound,
        compiledNarrative: compact.paragraph,
        targetReplacement: targetReplacement || compact.studentTarget,
        framework: compact
      };
    }

    if (goalNum === 3) {
      var strengthFocus = getPrimaryStrengthFocus(form);
      if (!strengthFocus && studentVoice) {
        var voiceStrength = parseStrengthFromProfile(studentVoice);
        if (voiceStrength) {
          strengthFocus = {
            source: 'student-voice',
            phrase: voiceStrength,
            display: studentVoice.split(/[\n;]+/)[0].trim()
          };
        }
      }
      if (!strengthFocus) {
        return null;
      }

      var strengthCompact = buildBspStrengthBasedParagraph({
        input: input,
        form: form,
        studentVoice: studentVoice,
        strengthFocus: strengthFocus,
        goalNum: 3,
        goalType: 'strength-based'
      });
      if (!strengthCompact) return null;
      return packageCompiled(strengthCompact, strengthCompact.studentTarget);
    }

    if (goalNum === 2) {
      var secondaryBehaviour = getSecondaryBehaviourOfConcern(form);
      var hasSecondaryContext =
        secondaryBehaviour ||
        getPrimaryBehaviourOfConcern(form) ||
        sanitizeBspClauseText(fields.behavioursTriggers) ||
        studentVoice;

      if (!hasSecondaryContext) {
        return null;
      }

      var secondaryCompact = buildBspSecondaryTargetedSupportParagraph({
        input: input,
        form: form,
        primaryBehaviour: secondaryBehaviour,
        isBaselineFallback: !secondaryBehaviour,
        behavioursTriggers: fields.behavioursTriggers,
        studentVoice: studentVoice,
        targetReplacement: target,
        goalNum: 2,
        goalType: 'secondary-targeted-support'
      });

      return packageCompiled(secondaryCompact, target || secondaryCompact.studentTarget);
    }

    var primaryBehaviour = getPrimaryBehaviourOfConcern(form);
    var hasConcernContext =
      primaryBehaviour ||
      sanitizeBspClauseText(fields.behavioursTriggers) ||
      studentVoice;

    if (!hasConcernContext) {
      return null;
    }

    var primaryCompact = buildBspTargetedSupportParagraph({
      input: input,
      form: form,
      primaryBehaviour: primaryBehaviour,
      behavioursTriggers: fields.behavioursTriggers,
      studentVoice: studentVoice,
      targetReplacement: target,
      goalNum: 1,
      goalType: 'targeted-support'
    });

    return packageCompiled(primaryCompact, target || primaryCompact.studentTarget);
  }

  function applyBspCompiledGoalToForm(goalNum, compiled) {
    if (!compiled) return;
    var form = getForm();
    if (!form) return;

    function setField(name, value) {
      var el = getBspFormField(form, name);
      if (el && value != null) el.value = String(value);
    }

    var prefix = 'bsp' + goalNum + '_';
    if (compiled.targetReplacement) {
      setField(prefix + 'targetReplacement', compiled.targetReplacement);
    }
    if (compiled.framework && compiled.framework.paragraph) {
      setField(prefix + 'specific', compiled.framework.paragraph);
      setField(prefix + 'achievable', compiled.framework.staffSupport || compiled.achievable);
      setField(prefix + 'relevant', compiled.relevant);
    } else {
      setField(prefix + 'specific', compiled.specific);
      setField(prefix + 'achievable', compiled.achievable);
      setField(prefix + 'relevant', compiled.relevant);
    }
    setField(prefix + 'measurable', compiled.measurable);
    setField(prefix + 'timebound', compiled.timebound);

    var store = ensureBspCompiledStore(goalNum);
    if (store) store.value = compiled.compiledNarrative || compiled.specific || '';

    renderBspCompiledPreview(goalNum, compiled.compiledNarrative || compiled.specific);
  }

  function getCheckedValues(form, name) {
    return Array.prototype.slice
      .call(form.querySelectorAll('input[name="' + name + '"]:checked'))
      .map(function (el) {
        return el.value;
      });
  }

  function runBspGoalSuggestionEngine(form) {
    form = form || getForm();
    if (!form) return;

    var primary = getPrimaryBehaviourOfConcern(form);
    var secondary = getSecondaryBehaviourOfConcern(form);
    var strength = getPrimaryStrengthFocus(form);
    var voiceSeed =
      (form.likesStrengths && form.likesStrengths.value) ||
      (form.supportsLearningStyles && form.supportsLearningStyles.value) ||
      '';
    var triggers = (form.triggers && form.triggers.value) || '';

    function setBspField(goalNum, suffix, value) {
      if (!value) return;
      var el = getBspFormField(form, 'bsp' + goalNum + '_' + suffix);
      if (el) el.value = String(value);
    }

    function seedVoiceIfEmpty(goalNum) {
      if (!voiceSeed) return;
      var voiceEl = getBspFormField(form, 'bsp' + goalNum + '_studentVoice');
      if (voiceEl && !sanitizeBspClauseText(voiceEl.value)) voiceEl.value = voiceSeed;
    }

    if (primary) {
      setBspField(1, 'behavioursTriggers', primary.display);
    } else if (triggers) {
      setBspField(1, 'behavioursTriggers', triggers);
    }

    if (secondary) {
      setBspField(2, 'behavioursTriggers', secondary.display);
    } else {
      setBspField(2, 'behavioursTriggers', 'Classroom emotional regulation and sustained on-task engagement');
    }

    if (strength) {
      setBspField(3, 'targetReplacement', 'maintain and extend ' + strength.phrase);
    }

    seedVoiceIfEmpty(1);
    seedVoiceIfEmpty(2);
    seedVoiceIfEmpty(3);

    for (var g = 1; g <= BSP_GOAL_COUNT; g++) {
      var compiled = compileBspGoalFromForm(g, form);
      if (compiled) applyBspCompiledGoalToForm(g, compiled);
      else clearBspGoalOutput(g);
    }
  }

  var bspCompileTimers = {};

  function scheduleBspGoalRecompile(goalNum) {
    if (!goalNum || goalNum < 1 || goalNum > BSP_GOAL_COUNT) return;
    window.clearTimeout(bspCompileTimers[goalNum]);
    bspCompileTimers[goalNum] = window.setTimeout(function () {
      var form = getForm();
      var compiled = compileBspGoalFromForm(goalNum, form);
      if (compiled) applyBspCompiledGoalToForm(goalNum, compiled);
      else clearBspGoalOutput(goalNum);
    }, 320);
  }

  function scheduleBspAllGoalsRecompile() {
    for (var g = 1; g <= BSP_GOAL_COUNT; g++) {
      scheduleBspGoalRecompile(g);
    }
  }

  function patchBspExportAndPreviewFormatters() {
    if (window.__bspWeaveExportPatched) return;
    window.__bspWeaveExportPatched = true;

    if (typeof window.buildGoalParagraphConcise === 'function') {
      var origConcise = window.buildGoalParagraphConcise;
      window.buildGoalParagraphConcise = function (g, studentName, genderKey) {
        if (g && g.compiledNarrative && String(g.compiledNarrative).trim()) {
          var input = getBspGoalPersonalizationInput(getForm());
          var flat = String(g.compiledNarrative)
            .replace(/\n\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          return polishBspCompiledText(flat, input);
        }
        if (g && g.framework && g.framework.paragraph) {
          var input2 = getBspGoalPersonalizationInput(getForm());
          return polishBspCompiledText(g.framework.paragraph, input2);
        }
        return origConcise(g, studentName, genderKey);
      };
    }

    if (typeof window.formatBspSmartGoalDocHtml === 'function') {
      var origDoc = window.formatBspSmartGoalDocHtml;
      window.formatBspSmartGoalDocHtml = function (g, index) {
        if (!g) return '';
        var narrative =
          g.compiledNarrative ||
          (g.framework && g.framework.paragraph) ||
          g.specific;
        if (narrative && typeof window.formatSmartGoalSmatTableHtml === 'function') {
          return window.formatSmartGoalSmatTableHtml(
            [
              { label: 'Short-Term SMART Goal', value: narrative },
              { label: 'Measurable', value: g.measurable },
              { label: 'Attainable', value: g.achievable },
              { label: 'Relevant', value: g.relevant },
              { label: 'Time-bound', value: g.timebound }
            ],
            { heading: 'Goal ' + (index + 1) }
          );
        }
        return origDoc(g, index);
      };
    }
  }

  function augmentVisibleDataBspGoals(values, form) {
    if (!values || !values.bspGoals || !values.bspGoals.length) return values;
    form = form || getForm();
    values.bspGoals = values.bspGoals.map(function (goal, idx) {
      var goalNum = idx + 1;
      var store = form ? getBspFormField(form, 'bsp' + goalNum + '_compiled') : null;
      var narrative =
        (store && store.value && store.value.trim()) ||
        goal.compiledNarrative ||
        goal.specific ||
        '';
      var framework = null;
      if (!narrative && form) {
        var compiled = compileBspGoalFromForm(goalNum, form);
        if (compiled) {
          narrative = compiled.compiledNarrative;
          framework = compiled.framework;
        }
      }
      if (form && !framework) {
        var recompiled = compileBspGoalFromForm(goalNum, form);
        if (recompiled && recompiled.framework) framework = recompiled.framework;
      }
      return Object.assign({}, goal, {
        specific: (framework && framework.paragraph) || narrative || goal.specific,
        achievable: (framework && framework.staffSupport) || goal.achievable,
        relevant: goal.relevant,
        compiledNarrative: (framework && framework.paragraph) || narrative || goal.compiledNarrative,
        framework: framework
      });
    });
    return values;
  }

  function patchGetVisibleDataForBspGoals() {
    if (window.__bspWeaveGetVisibleDataPatched || typeof window.getVisibleData !== 'function') return;
    window.__bspWeaveGetVisibleDataPatched = true;
    var original = window.getVisibleData;
    window.getVisibleData = function (form, mode) {
      var values = original(form, mode);
      return augmentVisibleDataBspGoals(values, form);
    };
  }

  function initBspGoalCompiler() {
    patchBspExportAndPreviewFormatters();
    patchGetVisibleDataForBspGoals();

    var form = getForm();
    if (!form) return;

    for (var n = 1; n <= BSP_GOAL_COUNT; n++) {
      ensureBspCompiledStore(n);
      ensureBspCompiledPreview(n);
      ['behavioursTriggers', 'studentVoice', 'targetReplacement', 'specific', 'measurable', 'achievable', 'relevant', 'timebound'].forEach(
        function (suffix) {
          var el = getBspFormField(form, 'bsp' + n + '_' + suffix);
          if (!el || el.dataset.bspWeaveWatch) return;
          el.dataset.bspWeaveWatch = '1';
          el.addEventListener('input', function () {
            scheduleBspGoalRecompile(n);
          });
          el.addEventListener('change', function () {
            scheduleBspGoalRecompile(n);
          });
        }
      );
    }

    function wireBehavioursOfConcernRecompile() {
      var concernInputs = form.querySelectorAll('input[name="behavioursConcern"]');
      for (var c = 0; c < concernInputs.length; c++) {
        if (concernInputs[c].dataset.bspWeaveWatch) continue;
        concernInputs[c].dataset.bspWeaveWatch = '1';
        concernInputs[c].addEventListener('change', function () {
          scheduleBspGoalRecompile(1);
          scheduleBspGoalRecompile(2);
        });
      }
      var otherConcernEl =
        form.behavioursConcernOther || form.querySelector('[name="behavioursConcernOther"]');
      if (otherConcernEl && !otherConcernEl.dataset.bspWeaveWatch) {
        otherConcernEl.dataset.bspWeaveWatch = '1';
        otherConcernEl.addEventListener('input', function () {
          scheduleBspGoalRecompile(1);
          scheduleBspGoalRecompile(2);
        });
      }
    }
    wireBehavioursOfConcernRecompile();

    function wireStrengthInputsRecompile() {
      var positiveInputs = form.querySelectorAll('input[name="behavioursPositive"]');
      for (var p = 0; p < positiveInputs.length; p++) {
        if (positiveInputs[p].dataset.bspWeaveWatch) continue;
        positiveInputs[p].dataset.bspWeaveWatch = '1';
        positiveInputs[p].addEventListener('change', function () {
          scheduleBspGoalRecompile(3);
        });
      }
      var otherPositiveEl =
        form.behavioursPositiveOther || form.querySelector('[name="behavioursPositiveOther"]');
      if (otherPositiveEl && !otherPositiveEl.dataset.bspWeaveWatch) {
        otherPositiveEl.dataset.bspWeaveWatch = '1';
        otherPositiveEl.addEventListener('input', function () {
          scheduleBspGoalRecompile(3);
        });
      }
      if (form.likesStrengths && !form.likesStrengths.dataset.bspWeaveWatch) {
        form.likesStrengths.dataset.bspWeaveWatch = '1';
        form.likesStrengths.addEventListener('input', function () {
          scheduleBspGoalRecompile(2);
          scheduleBspGoalRecompile(3);
        });
      }
    }
    wireStrengthInputsRecompile();

    var suggestBtn = document.getElementById('suggestGoalsBtn');
    if (suggestBtn && !suggestBtn.dataset.bspWeaveBound) {
      suggestBtn.dataset.bspWeaveBound = '1';
      suggestBtn.addEventListener(
        'click',
        function (e) {
          e.preventDefault();
          e.stopImmediatePropagation();
          runBspGoalSuggestionEngine(getForm());
        },
        true
      );
    }
  }

  /* ── Workflow tab progression (continue buttons + scroll reset) ── */

  function scrollWorkflowToTop() {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      window.scrollTo(0, 0);
    }
  }

  function ensureWorkflowContinueStyles() {
    if (document.getElementById('workflow-continue-styles')) return;
    var style = document.createElement('style');
    style.id = 'workflow-continue-styles';
    style.textContent =
      '.workflow-continue-wrap{margin-top:1.35rem;padding-top:1.1rem;border-top:1px solid var(--border,#e2e8f0);}' +
      '.workflow-continue-btn{width:100%;max-width:100%;padding:0.7rem 1rem;font-family:inherit;font-size:0.92rem;font-weight:600;}' +
      '.bsp-goal-panel .workflow-continue-wrap,.iep-goal-panel .workflow-continue-wrap{margin-top:1rem;}';
    document.head.appendChild(style);
  }

  function upsertWorkflowContinueButton(host, config) {
    if (!host) return;
    ensureWorkflowContinueStyles();

    if (config && config.remove) {
      var stale = host.querySelector(':scope > .workflow-continue-wrap');
      if (stale) stale.remove();
      return;
    }

    var wrap = host.querySelector(':scope > .workflow-continue-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'workflow-continue-wrap no-print';
      var exportActions = host.querySelector(':scope > .tab-export-actions');
      if (exportActions) {
        host.insertBefore(wrap, exportActions);
      } else {
        host.appendChild(wrap);
      }
    }

    var btn = wrap.querySelector('.workflow-continue-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary workflow-continue-btn';
      wrap.appendChild(btn);
    }

    btn.textContent = config.text || 'Continue to next section →';
    btn.onclick = function (e) {
      e.preventDefault();
      if (typeof config.onClick === 'function') config.onClick();
    };
  }

  function getVisibleMainTabIds() {
    var form = getForm();
    if (!form) return [];
    return Array.prototype.slice
      .call(form.querySelectorAll('.tab-btn:not(.tab-doc-inactive)'))
      .map(function (btn) {
        return btn.getAttribute('data-tab');
      })
      .filter(Boolean);
  }

  function getMainTabButtonLabel(tabId) {
    var btn = document.querySelector('.tab-btn[data-tab="' + tabId + '"]');
    if (!btn) return tabId;
    return btn.textContent.replace(/\s+/g, ' ').trim();
  }

  function patchSwitchTabWithScroll() {
    if (window.__workflowSwitchTabPatched) return true;
    if (typeof window.switchTab !== 'function') return false;

    var originalSwitchTab = window.switchTab;
    window.switchTab = function (tabId) {
      originalSwitchTab(tabId);
      scrollWorkflowToTop();
    };
    window.__workflowSwitchTabPatched = true;
    return true;
  }

  function activateBspGoalTab(goalKey) {
    document.querySelectorAll('.bsp-goal-tab-btn').forEach(function (btn) {
      var active = btn.dataset.bspGoal === String(goalKey);
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.bsp-goal-panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.id === 'bsp-goal-' + goalKey);
    });
    scrollWorkflowToTop();
  }

  function activateIepGoalTab(goalKey) {
    document.querySelectorAll('.iep-goal-tab-btn').forEach(function (btn) {
      var active = btn.dataset.iepGoal === goalKey;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.iep-goal-panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.id === 'iep-goal-' + goalKey);
    });
    scrollWorkflowToTop();
  }

  function getIepGoalTabSequence() {
    var areas = window.IEP_GOAL_AREAS;
    if (areas && areas.length) {
      return areas.map(function (area) {
        return area.key;
      });
    }
    return ['english', 'math', 'personal'];
  }

  function wireSubTabScrollOnClick(selector) {
    document.querySelectorAll(selector).forEach(function (btn) {
      if (btn.dataset.workflowScrollBound) return;
      btn.dataset.workflowScrollBound = '1';
      btn.addEventListener('click', function () {
        window.setTimeout(scrollWorkflowToTop, 60);
      });
    });
  }

  function refreshMainTabContinueButtons() {
    var tabs = getVisibleMainTabIds();
    document.querySelectorAll('#planForm > .tab-panel').forEach(function (panel) {
      var tabId = panel.id ? panel.id.replace(/^tab-/, '') : '';
      var idx = tabs.indexOf(tabId);
      if (idx < 0 || idx >= tabs.length - 1) {
        upsertWorkflowContinueButton(panel, { remove: true });
        return;
      }
      var nextTabId = tabs[idx + 1];
      upsertWorkflowContinueButton(panel, {
        text: 'Continue to ' + getMainTabButtonLabel(nextTabId) + ' →',
        onClick: function () {
          if (typeof window.switchTab === 'function') {
            window.switchTab(nextTabId);
          }
        }
      });
    });
  }

  function refreshBspGoalContinueButtons() {
    for (var n = 1; n <= BSP_GOAL_COUNT; n++) {
      var panel = document.getElementById('bsp-goal-' + n);
      if (!panel) continue;
      if (n >= BSP_GOAL_COUNT) {
        upsertWorkflowContinueButton(panel, { remove: true });
        continue;
      }
      (function (nextGoal) {
        upsertWorkflowContinueButton(panel, {
          text: 'Continue to Goal ' + nextGoal + ' →',
          onClick: function () {
            activateBspGoalTab(nextGoal);
          }
        });
      })(n + 1);
    }
  }

  function refreshIepGoalContinueButtons() {
    var sequence = getIepGoalTabSequence();
    sequence.forEach(function (key, idx) {
      var panel = document.getElementById('iep-goal-' + key);
      if (!panel) return;
      if (idx >= sequence.length - 1) {
        upsertWorkflowContinueButton(panel, { remove: true });
        return;
      }
      var nextKey = sequence[idx + 1];
      var nextBtn = document.querySelector('.iep-goal-tab-btn[data-iep-goal="' + nextKey + '"]');
      var nextLabel = nextBtn ? nextBtn.textContent.replace(/\s+/g, ' ').trim() : nextKey;
      upsertWorkflowContinueButton(panel, {
        text: 'Continue to ' + nextLabel + ' →',
        onClick: function () {
          activateIepGoalTab(nextKey);
          if (typeof window.syncIepGoalLevelFromDashboard === 'function' && window.IEP_GOAL_AREAS) {
            var area = window.IEP_GOAL_AREAS.find(function (a) {
              return a.key === nextKey;
            });
            if (area) window.syncIepGoalLevelFromDashboard(area);
          }
        }
      });
    });
  }

  function initWorkflowProgression() {
    patchSwitchTabWithScroll();
    wireSubTabScrollOnClick('.bsp-goal-tab-btn');
    wireSubTabScrollOnClick('.iep-goal-tab-btn');
    refreshMainTabContinueButtons();
    refreshBspGoalContinueButtons();
    refreshIepGoalContinueButtons();

    var form = getForm();
    if (form && !form.dataset.workflowDocWatch) {
      form.dataset.workflowDocWatch = '1';
      form.querySelectorAll('.doc-check').forEach(function (el) {
        el.addEventListener('change', function () {
          window.setTimeout(refreshMainTabContinueButtons, 120);
        });
      });
    }
  }

  function boot() {
    initLocalProgressControls();
    initGenerateAllControls();
    initBspGoalCompiler();
    initWorkflowProgression();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.setTimeout(function () {
    ensureHeaderFullSuiteButton();
    ensureFullSuiteExportActionBar();
    wireLandingFullSuiteEntry();
    wireAllGenerateAllButtons();
    initFullSuiteExportBarWatchers();
    updateFullSuiteExportBarVisibility();
    initBspGoalCompiler();
    patchSwitchTabWithScroll();
    initWorkflowProgression();
  }, 800);

  window.Generate4USessionProgress = {
    collect: collectFormProgressState,
    apply: applyFormProgressState,
    save: saveProgressToLocalFile,
    load: openLoadProgressDialog,
    getProgressDownloadFilename: getProgressDownloadFilename,
    revealFullSuiteWorkspace: revealFullSuiteWorkspace,
    runFullSuiteSequentialDownload: runFullSuiteSequentialDownload,
    runAdaptiveWordExport: runAdaptiveWordExport,
    detectAdaptiveExportSteps: detectAdaptiveExportSteps,
    exportFullSuite: handleExportFullSuiteClick,
    compileBspGoal: compileBspGoalFromForm,
    runBspGoalSuggestions: runBspGoalSuggestionEngine,
    getSelectedBehavioursOfConcern: getSelectedBehavioursOfConcern,
    getPrimaryBehaviourOfConcern: getPrimaryBehaviourOfConcern,
    getSecondaryBehaviourOfConcern: getSecondaryBehaviourOfConcern,
    getPrimaryStrengthFocus: getPrimaryStrengthFocus,
    scrollWorkflowToTop: scrollWorkflowToTop,
    refreshWorkflowContinueButtons: function () {
      refreshMainTabContinueButtons();
      refreshBspGoalContinueButtons();
      refreshIepGoalContinueButtons();
    }
  };
})();
