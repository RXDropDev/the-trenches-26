const SETTINGS_KEY = "trenches_overlay_settings_v1";
const DEFAULT_SETTINGS = { enabled: true, position: "top-right" };

function getSettings() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "TRENCHES_GET_SETTINGS" }, (res) => {
      resolve(res?.settings ? { ...DEFAULT_SETTINGS, ...res.settings } : { ...DEFAULT_SETTINGS });
    });
  });
}

function setSettings(partial) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "TRENCHES_SET_SETTINGS", settings: partial }, (res) => {
      resolve(res?.settings ? { ...DEFAULT_SETTINGS, ...res.settings } : null);
    });
  });
}

function setActivePos(pos) {
  document.querySelectorAll(".segBtn").forEach((b) => {
    b.classList.toggle("active", b.dataset.pos === pos);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("aodToggle");
  const posButtons = Array.from(document.querySelectorAll(".segBtn"));

  const s = await getSettings();

  toggle.checked = !!s.enabled;
  setActivePos(s.position);

  toggle.addEventListener("change", async () => {
    const next = await setSettings({ enabled: toggle.checked });
    if (next) {
      toggle.checked = !!next.enabled;
      setActivePos(next.position);
    }
  });

  posButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pos = btn.dataset.pos;
      setActivePos(pos); // instant UI feedback
      const next = await setSettings({ position: pos });
      if (next) setActivePos(next.position);
    });
  });
});
