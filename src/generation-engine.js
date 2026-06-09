/**
 * Generate4U — multi-document Word export (sequential Full Suite) and .btn-generate-all handling.
 * DESKTOP OPTIONAL: not loaded by index.html. Browser users rely on src/session-progress.js only.
 * Pure browser IIFE — no require/module.exports. Requires index.html app globals.
 */
(function () {
  'use strict';

  var FULL_SUITE_DELAY_MS = 1500;
  var fullSuiteExportInFlight = false;

  var FULL_SUITE_STEPS = [
    { mode: 'IEP', step: 'iep', exportKind: 'iep', docKey: 'iep', suffix: '_IEP' },
    { mode: 'BSP', step: 'bsp', exportKind: 'bsp', docKey: 'bsp', suffix: '_BSP' },
    { mode: 'Adjustments', step: 'classroom', exportKind: 'classroom', docKey: 'classroom', suffix: '_Adjustments' }
  ];

  function delayMs(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function callGlobal(fnName) {
    var fn = window[fnName];
    if (typeof fn !== 'function') return undefined;
    return fn.apply(window, Array.prototype.slice.call(arguments, 1));
  }

  function getPlanForm() {
    return document.getElementById('planForm');
  }

  function ensureAppFullSuiteButton() {
    var host = document.querySelector('.progress-controls');
    if (!host || host.querySelector('.btn-generate-all.btn-export-full-suite')) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-generate-all btn-export-full-suite';
    btn.textContent = 'Generate full suite (3 Word files)';
    btn.setAttribute(
      'aria-label',
      'Generate and save Individual Education Plan, Behaviour Support Plan, and Classroom Adjustments Word documents one at a time'
    );
    btn.style.cssText =
      'margin-left:0.35rem;padding:0.42rem 0.85rem;font-size:0.82rem;font-weight:600;border-radius:999px;' +
      'border:1px solid var(--primary);background:#fff;color:var(--primary-dark);cursor:pointer;font-family:inherit;';
    host.appendChild(btn);
  }

  function applyFullSuiteDocumentSelection() {
    window.selectedMode = 'ALL';
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

  function launchpadFullSuiteEntry() {
    document.querySelectorAll('.launchpad__card').forEach(function (b) {
      b.classList.remove('launchpad__card--selected');
    });
    var generateAllBtn = document.querySelector('#launchpad .btn-generate-all');
    if (generateAllBtn) generateAllBtn.classList.add('launchpad__card--selected');
    if (typeof window.applyLaunchpadChoice === 'function') {
      window.applyLaunchpadChoice('all');
    } else {
      applyFullSuiteDocumentSelection();
      if (typeof window.dismissLaunchpad === 'function') {
        window.dismissLaunchpad();
      }
    }
  }

  async function saveOneWordDocument(contentString, filename, docKey, exportMeta) {
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
      return window.saveWordDocumentToDisk(contentString, safeName);
    }

    if (typeof window.triggerBlobDownload === 'function' && typeof window.createWordBlobFromContentString === 'function') {
      var blob = window.createWordBlobFromContentString(contentString);
      await window.triggerBlobDownload(blob, safeName);
      return { canceled: false };
    }

    throw new Error('Word save is not available in this environment.');
  }

  /**
   * Compile and save IEP, BSP, and Adjustments sequentially so save dialogs never overlap.
   */
  async function runFullSuiteSequentialDownload() {
    if (fullSuiteExportInFlight) return;
    fullSuiteExportInFlight = true;

    var form = getPlanForm();
    if (!form) {
      fullSuiteExportInFlight = false;
      alert('The form could not be found. Please refresh the page.');
      return;
    }

    try {
      applyFullSuiteDocumentSelection();

      if (typeof window.updateFormRequiredFields === 'function') {
        window.updateFormRequiredFields();
      }
      if (typeof window.updateFormFieldDisabledState === 'function') {
        window.updateFormFieldDisabledState();
      }

      if (typeof window.validateBeforeGenerate === 'function') {
        var validation = window.validateBeforeGenerate(form);
        if (!validation.ok) {
          if (validation.alertMessage) {
            alert(validation.alertMessage);
            if (validation.scrollToLaunchpad && typeof window.showLaunchpad === 'function') {
              window.showLaunchpad();
            } else if (validation.focusTab && typeof window.switchTab === 'function') {
              window.switchTab(validation.focusTab);
            }
            return;
          }
          if (validation.missing && validation.missing.length) {
            document.getElementById('formValidationSummary')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            if (typeof window.focusFirstMissingField === 'function') {
              window.focusFirstMissingField(validation.missing);
            }
            return;
          }
          return;
        }
      }

      var valuesIep =
        typeof window.getVisibleData === 'function' ? window.getVisibleData(form, 'IEP') : null;
      var valuesBsp =
        typeof window.getVisibleData === 'function' ? window.getVisibleData(form, 'BSP') : null;
      var valuesAdj =
        typeof window.getVisibleData === 'function' ? window.getVisibleData(form, 'Adjustments') : null;
      var baseNameSource = valuesIep || valuesBsp || valuesAdj;
      if (!baseNameSource) {
        alert('Could not read form data. Enter student details and try again.');
        return;
      }

      var baseName =
        typeof window.sanitizeExportBasename === 'function'
          ? window.sanitizeExportBasename(baseNameSource.name)
          : 'Student';
      var studentName = baseNameSource.name || '';
      var styleText =
        typeof window.getWordDocumentStyles === 'function' ? window.getWordDocumentStyles() : '';
      var results = [];
      var downloadIssueCount = 0;

      if (typeof window.showGenerationProgressOverlay === 'function') {
        window.showGenerationProgressOverlay();
      }

      for (var i = 0; i < FULL_SUITE_STEPS.length; i++) {
        var step = FULL_SUITE_STEPS[i];

        if (typeof window.setGenerationProgressDocumentStatus === 'function') {
          window.setGenerationProgressDocumentStatus(i + 1, FULL_SUITE_STEPS.length);
        }
        if (typeof window.setGenerationProgressStep === 'function') {
          window.setGenerationProgressStep(step.step, 'active');
        }
        if (typeof window.setGenerationProgressBar === 'function') {
          window.setGenerationProgressBar((i / FULL_SUITE_STEPS.length) * 100);
        }

        if (typeof window.prepareFormForWordExport === 'function') {
          window.prepareFormForWordExport(form, step.mode);
        }

        var values =
          typeof window.getVisibleData === 'function'
            ? window.getVisibleData(form, step.mode)
            : null;
        if (!values) {
          console.warn('Skipping empty export for step:', step.step);
          downloadIssueCount++;
          continue;
        }

        var html =
          typeof window.buildDocExportWordHtml === 'function'
            ? window.buildDocExportWordHtml(values, step.exportKind)
            : '';
        if (!html) {
          console.warn('Skipping empty HTML for step:', step.step);
          downloadIssueCount++;
          continue;
        }

        var docTypeLabel =
          window.WORD_DOC_TYPE_LABELS && window.WORD_DOC_TYPE_LABELS[step.mode]
            ? window.WORD_DOC_TYPE_LABELS[step.mode]
            : step.mode;

        var contentString =
          typeof window.buildWordDocumentContentString === 'function'
            ? window.buildWordDocumentContentString(html, styleText, {
                documentType: docTypeLabel,
                studentName: studentName
              })
            : html;

        var filename = baseName + step.suffix + '.doc';
        var entry = {
          step: step.step,
          filename:
            typeof window.sanitizeDownloadFilename === 'function'
              ? window.sanitizeDownloadFilename(filename)
              : filename,
          blob:
            typeof window.createWordBlobFromContentString === 'function'
              ? window.createWordBlobFromContentString(contentString)
              : null,
          contentString: contentString
        };
        results.push(entry);

        try {
          var saveResult = await saveOneWordDocument(
            contentString,
            entry.filename,
            step.docKey,
            { documentType: docTypeLabel, studentName: studentName }
          );
          entry.downloadTriggered = !(saveResult && saveResult.canceled);
          if (saveResult && saveResult.canceled) {
            entry.downloadCanceled = true;
            downloadIssueCount++;
          }
        } catch (dlErr) {
          console.warn('Full suite download failed for ' + entry.filename, dlErr);
          downloadIssueCount++;
          entry.downloadTriggered = false;
        }

        if (typeof window.setGenerationProgressStep === 'function') {
          window.setGenerationProgressStep(step.step, 'done');
        }
        if (typeof window.setGenerationProgressBar === 'function') {
          window.setGenerationProgressBar(((i + 0.65) / FULL_SUITE_STEPS.length) * 100);
        }

        if (i < FULL_SUITE_STEPS.length - 1) {
          await delayMs(FULL_SUITE_DELAY_MS);
        }
      }

      if (typeof window.setGenerationProgressBar === 'function') {
        window.setGenerationProgressBar(100);
      }

      if (typeof window.completeGenerationProgressOverlay === 'function') {
        window.completeGenerationProgressOverlay(results, {
          successMessage:
            downloadIssueCount > 0
              ? 'Full suite finished. Some files may need to be saved again from the links below.'
              : 'Success! IEP, BSP, and Adjustments Word documents have been saved.',
          showManualLinks: downloadIssueCount > 0
        });
      } else if (downloadIssueCount > 0) {
        alert(
          'Full suite finished with ' +
            downloadIssueCount +
            ' issue(s). Check your Downloads folder or try individual Generate Word Document buttons.'
        );
      }
    } catch (err) {
      console.error('Full suite export failed:', err);
      if (typeof window.failGenerationProgressOverlay === 'function') {
        window.failGenerationProgressOverlay(
          'Full suite export encountered an issue. ' + (err && err.message ? err.message : String(err))
        );
      } else {
        alert('Could not complete full suite export: ' + (err && err.message ? err.message : String(err)));
      }
    } finally {
      fullSuiteExportInFlight = false;
    }
  }

  function handleGenerateAllClick() {
    if (document.body.classList.contains('launchpad-open')) {
      launchpadFullSuiteEntry();
      return;
    }
    runFullSuiteSequentialDownload();
  }

  function initGenerateAllControls() {
    ensureAppFullSuiteButton();

    if (document.documentElement.dataset.generateAllBound === '1') return;
    document.documentElement.dataset.generateAllBound = '1';

    document.addEventListener(
      'click',
      function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.btn-generate-all') : null;
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        handleGenerateAllClick();
      },
      true
    );
  }

  function boot() {
    initGenerateAllControls();
    if (document.body.classList.contains('app-ready')) {
      ensureAppFullSuiteButton();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('DOMContentLoaded', function () {
    window.setTimeout(ensureAppFullSuiteButton, 600);
  });

  window.Generate4UGenerationEngine = {
    runFullSuiteSequentialDownload: runFullSuiteSequentialDownload,
    handleGenerateAllClick: handleGenerateAllClick
  };
})();
