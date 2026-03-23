/**
 * CSInterface bridge — wraps Adobe's CSInterface.js for TrimTake.
 * Falls back to mock mode when running outside of Premiere Pro.
 */

(function () {
  "use strict";

  var BACKEND_URL = "http://localhost:3333";
  var REQUEST_TIMEOUT = 120000; // 2 minutes

  // Detect if running inside CEP
  var isInCEP = (typeof CSInterface !== "undefined");

  var csInterface = null;
  if (isInCEP) {
    try {
      csInterface = new CSInterface();
    } catch (e) {
      // CSInterface not available
    }
  }

  /**
   * Evaluate an ExtendScript expression in Premiere Pro.
   * Returns a Promise that resolves with the result string.
   */
  function evalScript(script) {
    return new Promise(function (resolve, reject) {
      if (csInterface) {
        csInterface.evalScript(script, function (result) {
          if (result === "EvalScript error.") {
            reject(new Error("ExtendScript error"));
          } else {
            resolve(result);
          }
        });
      } else {
        // Mock mode — simulate realistic responses
        if (script.indexOf("getSequenceInfo") !== -1) {
          resolve(JSON.stringify({
            name: "Demo Sequence",
            id: "mock-seq-001",
            framerate: "254016000000",
            duration: "30.0",
            videoTrackCount: 3,
            audioTrackCount: 2,
            path: "/mock/path/interview.mp4",
          }));
        } else if (script.indexOf("applyCuts") !== -1) {
          resolve(JSON.stringify({ success: true, cutsApplied: 5 }));
        } else if (script.indexOf("addMarkers") !== -1) {
          resolve(JSON.stringify({ success: true, markersAdded: 5 }));
        } else {
          resolve("mock_result");
        }
      }
    });
  }

  /**
   * Call backend API with timeout.
   */
  function apiCall(method, path, body) {
    var controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var opts = {
      method: method,
      headers: { "Content-Type": "application/json" },
    };
    if (controller) opts.signal = controller.signal;
    if (body) opts.body = JSON.stringify(body);

    var timer = null;
    if (controller) {
      timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT);
    }

    return fetch(BACKEND_URL + path, opts)
      .then(function (r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            throw new Error(data.error || "API " + r.status + ": " + r.statusText);
          });
        }
        return r.json();
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        if (err.name === "AbortError") {
          throw new Error("Request timed out");
        }
        throw err;
      });
  }

  /**
   * Upload a file to the backend with timeout.
   */
  function uploadFile(path, file) {
    var controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var formData = new FormData();
    formData.append("audio", file);

    var opts = {
      method: "POST",
      body: formData,
    };
    if (controller) opts.signal = controller.signal;

    var timer = null;
    if (controller) {
      timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT);
    }

    return fetch(BACKEND_URL + path, opts)
      .then(function (r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) {
          return r.json().catch(function () { return {}; }).then(function (data) {
            throw new Error(data.error || "Upload " + r.status + ": " + r.statusText);
          });
        }
        return r.json();
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        if (err.name === "AbortError") {
          throw new Error("Upload timed out");
        }
        throw err;
      });
  }

  // Export
  window.TrimTakeBridge = {
    evalScript: evalScript,
    apiCall: apiCall,
    uploadFile: uploadFile,
    isInCEP: isInCEP,
    BACKEND_URL: BACKEND_URL,
  };
})();
