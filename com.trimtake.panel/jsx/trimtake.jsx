/**
 * TrimTake — ExtendScript for Adobe Premiere Pro
 * Runs inside Premiere's scripting engine (ES3-compatible).
 */

/**
 * Get info about the currently active sequence.
 * Returns a JSON string with name, path, duration, and frame rate.
 */
function trimtake_getSequenceInfo() {
  try {
    var seq = app.project.activeSequence;
    if (!seq) {
      return JSON.stringify({ error: "No active sequence. Open a sequence first." });
    }

    var info = {
      name: seq.name,
      id: seq.sequenceID,
      framerate: seq.timebase,
      duration: seq.end,
      videoTrackCount: seq.videoTracks.numTracks,
      audioTrackCount: seq.audioTracks.numTracks,
      path: ""
    };

    // Try to get the file path of the first audio clip
    if (seq.audioTracks.numTracks > 0) {
      var track = seq.audioTracks[0];
      if (track.clips.numItems > 0) {
        var clip = track.clips[0];
        if (clip.projectItem && clip.projectItem.getMediaPath) {
          try {
            info.path = clip.projectItem.getMediaPath();
          } catch (pathErr) {
            // Media path not available for this clip type
          }
        }
      }
    }

    return JSON.stringify(info);
  } catch (e) {
    return JSON.stringify({ error: "Failed to get sequence info: " + e.message });
  }
}

/**
 * Apply razor cuts to the active sequence at the specified timecodes.
 * Accepts a JSON string of cut regions: [{ start, end }]
 * Cuts are applied in reverse order to preserve timecodes.
 */
function trimtake_applyCuts(cutsJSON) {
  try {
    var cuts = JSON.parse(cutsJSON);
    var seq = app.project.activeSequence;

    if (!seq) {
      return JSON.stringify({ error: "No active sequence" });
    }

    if (!cuts || cuts.length === 0) {
      return JSON.stringify({ error: "No cuts provided" });
    }

    // Sort cuts in reverse chronological order so indices don't shift
    cuts.sort(function (a, b) { return b.start - a.start; });

    var appliedCount = 0;

    for (var c = 0; c < cuts.length; c++) {
      var cut = cuts[c];

      // Validate cut data
      if (typeof cut.start !== "number" || typeof cut.end !== "number") continue;
      if (cut.start < 0 || cut.end <= cut.start) continue;

      var startTime = new Time();
      startTime.seconds = cut.start;
      var endTime = new Time();
      endTime.seconds = cut.end;

      // Apply razors to all audio tracks
      for (var t = 0; t < seq.audioTracks.numTracks; t++) {
        var track = seq.audioTracks[t];
        for (var i = track.clips.numItems - 1; i >= 0; i--) {
          var clip = track.clips[i];
          var clipStart = clip.start.seconds;
          var clipEnd = clip.end.seconds;

          if (cut.start < clipEnd && cut.end > clipStart) {
            if (cut.start > clipStart) {
              track.razor(startTime);
            }
            if (cut.end < clipEnd) {
              track.razor(endTime);
            }
            appliedCount++;
          }
        }
      }

      // Apply razors to all video tracks (for linked clips)
      for (var v = 0; v < seq.videoTracks.numTracks; v++) {
        var vTrack = seq.videoTracks[v];
        for (var j = vTrack.clips.numItems - 1; j >= 0; j--) {
          var vClip = vTrack.clips[j];
          var vClipStart = vClip.start.seconds;
          var vClipEnd = vClip.end.seconds;

          if (cut.start < vClipEnd && cut.end > vClipStart) {
            if (cut.start > vClipStart) {
              vTrack.razor(startTime);
            }
            if (cut.end < vClipEnd) {
              vTrack.razor(endTime);
            }
          }
        }
      }
    }

    // Remove the cut segments (filler word regions)
    // After razoring, these are isolated as their own clips
    for (var c2 = 0; c2 < cuts.length; c2++) {
      var cut2 = cuts[c2];

      for (var t2 = 0; t2 < seq.audioTracks.numTracks; t2++) {
        var aTrack = seq.audioTracks[t2];
        for (var k = aTrack.clips.numItems - 1; k >= 0; k--) {
          var aClip = aTrack.clips[k];
          var aStart = aClip.start.seconds;
          var aEnd = aClip.end.seconds;

          // Tolerance of 10ms for floating point comparison
          if (aStart >= cut2.start - 0.01 && aEnd <= cut2.end + 0.01) {
            aClip.remove(true, true); // ripple delete
          }
        }
      }

      for (var v2 = 0; v2 < seq.videoTracks.numTracks; v2++) {
        var vTrack2 = seq.videoTracks[v2];
        for (var m = vTrack2.clips.numItems - 1; m >= 0; m--) {
          var vClip2 = vTrack2.clips[m];
          var vStart = vClip2.start.seconds;
          var vEnd = vClip2.end.seconds;

          if (vStart >= cut2.start - 0.01 && vEnd <= cut2.end + 0.01) {
            vClip2.remove(true, true);
          }
        }
      }
    }

    return JSON.stringify({ success: true, cutsApplied: appliedCount });
  } catch (e) {
    return JSON.stringify({ error: "Failed to apply cuts: " + e.message });
  }
}

/**
 * Add sequence markers at detected filler word positions.
 * Accepts a JSON string: [{ word, start, end, confidence }]
 */
function trimtake_addMarkers(fillersJSON) {
  try {
    var fillers = JSON.parse(fillersJSON);
    var seq = app.project.activeSequence;

    if (!seq) {
      return JSON.stringify({ error: "No active sequence" });
    }

    if (!fillers || fillers.length === 0) {
      return JSON.stringify({ error: "No markers to add" });
    }

    var markers = seq.markers;
    var added = 0;

    for (var i = 0; i < fillers.length; i++) {
      var f = fillers[i];
      if (typeof f.start !== "number") continue;

      var markerTime = new Time();
      markerTime.seconds = f.start;

      var marker = markers.createMarker(markerTime);
      marker.name = "Filler: " + (f.word || "unknown");
      marker.comments = "Confidence: " + Math.round((f.confidence || 0) * 100) + "% | Duration: " + ((f.end || f.start) - f.start).toFixed(2) + "s";
      marker.setColorByIndex(4); // Yellow
      added++;
    }

    return JSON.stringify({ success: true, markersAdded: added });
  } catch (e) {
    return JSON.stringify({ error: "Failed to add markers: " + e.message });
  }
}

/**
 * Export markers as a JSON string (for external use).
 */
function trimtake_exportMarkers() {
  try {
    var seq = app.project.activeSequence;
    if (!seq) {
      return JSON.stringify({ error: "No active sequence" });
    }

    var markers = seq.markers;
    var result = [];

    for (var i = markers.numMarkers - 1; i >= 0; i--) {
      var m = markers[i];
      if (m) {
        result.push({
          name: m.name,
          comments: m.comments,
          start: m.start.seconds,
          end: m.end.seconds
        });
      }
    }

    return JSON.stringify(result);
  } catch (e) {
    return JSON.stringify({ error: "Failed to export markers: " + e.message });
  }
}
