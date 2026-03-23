/**
 * TrimTake — Panel logic
 */

(function () {
  "use strict";

  var bridge = window.TrimTakeBridge;

  // DOM refs
  var statusDot = document.getElementById("statusDot");
  var statusText = document.getElementById("statusText");
  var settingsToggle = document.getElementById("settingsToggle");
  var settingsPanel = document.getElementById("settingsPanel");
  var sensitivity = document.getElementById("sensitivity");
  var sensitivityValue = document.getElementById("sensitivityValue");
  var paddingBefore = document.getElementById("paddingBefore");
  var paddingAfter = document.getElementById("paddingAfter");
  var fillerWords = document.getElementById("fillerWords");
  var btnAnalyzeSequence = document.getElementById("btnAnalyzeSequence");
  var btnUploadAudio = document.getElementById("btnUploadAudio");
  var audioFileInput = document.getElementById("audioFileInput");
  var progressContainer = document.getElementById("progressContainer");
  var progressBar = document.getElementById("progressBar");
  var progressLabel = document.getElementById("progressLabel");
  var resultsSection = document.getElementById("resultsSection");
  var resultsContainer = document.getElementById("resultsContainer");
  var selectAll = document.getElementById("selectAll");
  var resultCount = document.getElementById("resultCount");
  var btnApplyCuts = document.getElementById("btnApplyCuts");
  var btnExportMarkers = document.getElementById("btnExportMarkers");
  var emptyState = document.getElementById("emptyState");

  var detectedFillers = [];

  // --- Health check ---
  function checkBackend() {
    bridge.apiCall("GET", "/health")
      .then(function (data) {
        statusDot.classList.add("connected");
        statusText.textContent = "Backend connected";
      })
      .catch(function () {
        statusDot.classList.remove("connected");
        statusText.textContent = "Backend offline — start the server";
      });
  }

  // --- Settings ---
  settingsToggle.addEventListener("click", function () {
    settingsPanel.classList.toggle("active");
  });

  sensitivity.addEventListener("input", function () {
    sensitivityValue.textContent = sensitivity.value + "%";
  });

  function getSettings() {
    return {
      sensitivity: parseInt(sensitivity.value, 10) / 100,
      paddingBefore: parseInt(paddingBefore.value, 10),
      paddingAfter: parseInt(paddingAfter.value, 10),
      fillerWords: fillerWords.value.split(",").map(function (w) { return w.trim(); }).filter(Boolean),
    };
  }

  // --- Progress ---
  function showProgress(label, pct) {
    progressContainer.classList.add("active");
    progressLabel.textContent = label;
    progressBar.style.width = pct + "%";
  }

  function hideProgress() {
    progressContainer.classList.remove("active");
    progressBar.style.width = "0%";
  }

  // --- Results ---
  function renderResults(fillers) {
    detectedFillers = fillers;
    resultsContainer.innerHTML = "";

    if (!fillers.length) {
      resultsSection.style.display = "none";
      emptyState.style.display = "block";
      emptyState.querySelector("p").textContent = "No filler words detected!";
      return;
    }

    emptyState.style.display = "none";
    resultsSection.style.display = "block";
    resultCount.textContent = fillers.length + " item" + (fillers.length === 1 ? "" : "s");
    btnApplyCuts.disabled = false;

    fillers.forEach(function (f, i) {
      var item = document.createElement("div");
      item.className = "result-item";

      var confClass = f.confidence >= 0.8 ? "high" : "";

      item.innerHTML =
        '<input type="checkbox" data-index="' + i + '" checked>' +
        '<span class="result-word">' + escapeHtml(f.word) + '</span>' +
        '<span class="result-time">' + formatTime(f.start) + ' → ' + formatTime(f.end) + '</span>' +
        '<span class="result-confidence ' + confClass + '">' + Math.round(f.confidence * 100) + '%</span>';

      resultsContainer.appendChild(item);
    });

    selectAll.checked = true;
  }

  function getSelectedFillers() {
    var checks = resultsContainer.querySelectorAll('input[type="checkbox"]');
    var selected = [];
    checks.forEach(function (cb) {
      if (cb.checked) {
        selected.push(detectedFillers[parseInt(cb.dataset.index, 10)]);
      }
    });
    return selected;
  }

  // --- Select all ---
  selectAll.addEventListener("change", function () {
    var checks = resultsContainer.querySelectorAll('input[type="checkbox"]');
    checks.forEach(function (cb) { cb.checked = selectAll.checked; });
  });

  // --- Analyze current sequence ---
  btnAnalyzeSequence.addEventListener("click", function () {
    showProgress("Getting sequence info from Premiere...", 10);

    bridge.evalScript("trimtake_getSequenceInfo()")
      .then(function (result) {
        var seqInfo;
        try {
          seqInfo = JSON.parse(result);
        } catch (e) {
          seqInfo = { name: "Current Sequence", path: "" };
        }

        showProgress("Analyzing audio for filler words...", 30);

        var settings = getSettings();
        return bridge.apiCall("POST", "/analyze", {
          sequenceName: seqInfo.name,
          videoPath: seqInfo.path,
          settings: settings,
        });
      })
      .then(function (data) {
        showProgress("Analysis complete!", 100);
        setTimeout(function () { hideProgress(); }, 800);
        renderResults(data.fillers || []);
      })
      .catch(function (err) {
        hideProgress();
        alert("Analysis failed: " + err.message);
      });
  });

  // --- Upload audio ---
  btnUploadAudio.addEventListener("click", function () {
    audioFileInput.click();
  });

  audioFileInput.addEventListener("change", function () {
    var file = audioFileInput.files[0];
    if (!file) return;

    showProgress("Uploading " + file.name + "...", 20);

    bridge.uploadFile("/analyze", file)
      .then(function (data) {
        showProgress("Analysis complete!", 100);
        setTimeout(function () { hideProgress(); }, 800);
        renderResults(data.fillers || []);
      })
      .catch(function (err) {
        hideProgress();
        alert("Upload failed: " + err.message);
      });

    audioFileInput.value = "";
  });

  // --- Apply cuts ---
  btnApplyCuts.addEventListener("click", function () {
    var selected = getSelectedFillers();
    if (!selected.length) {
      alert("No filler words selected.");
      return;
    }

    var settings = getSettings();

    showProgress("Applying " + selected.length + " cuts...", 20);

    bridge.apiCall("POST", "/apply", {
      cuts: selected,
      paddingBefore: settings.paddingBefore,
      paddingAfter: settings.paddingAfter,
    })
      .then(function (data) {
        if (data.script) {
          return bridge.evalScript(data.script);
        }
        return Promise.resolve();
      })
      .then(function () {
        showProgress("Cuts applied!", 100);
        setTimeout(function () { hideProgress(); }, 1200);
      })
      .catch(function (err) {
        hideProgress();
        alert("Failed to apply cuts: " + err.message);
      });
  });

  // --- Export markers ---
  btnExportMarkers.addEventListener("click", function () {
    var selected = getSelectedFillers();
    if (!selected.length) {
      alert("No filler words selected.");
      return;
    }

    var markerScript = "trimtake_addMarkers(" + JSON.stringify(selected) + ")";
    bridge.evalScript(markerScript)
      .then(function () {
        alert("Markers added to sequence.");
      })
      .catch(function (err) {
        alert("Failed to add markers: " + err.message);
      });
  });

  // --- Utilities ---
  function formatTime(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = Math.floor(seconds % 60);
    var f = Math.round((seconds % 1) * 30); // assume 30fps
    return pad(h) + ":" + pad(m) + ":" + pad(s) + ":" + pad(f);
  }

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Init ---
  checkBackend();
  setInterval(checkBackend, 10000);
})();
