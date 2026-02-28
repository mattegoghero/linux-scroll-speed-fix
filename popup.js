// User information elements
const osText = document.getElementById('osDetected');
const statusText = document.getElementById('statusText');

// User input elements
const scrollFactorInput = document.getElementById('scrollFactorInput');
const customSettingButton = document.getElementById('customSettingButton');


const flingEnabledButton = document.getElementById('flingEnabledButton');
const flingFrictionInput = document.getElementById('flingFrictionInput');
const flingThresholdInput = document.getElementById('flingThresholdInput');

const scrollFactorSlider = document.getElementById('scrollFactorSlider');
const flingFrictionSlider = document.getElementById('flingFrictionSlider');
const flingThresholdSlider = document.getElementById('flingThresholdSlider');

// Default scroll speed variables
const linuxSpeed = 0.15;
const windowsSpeed = 1.0;
const macSpeed = 1.0;

// *** INIT ***

init();

// Detects OS and set scroll speed
async function init() {

    let customSetting = await getCustomSetting();
    let disableExtension = await getDisableExtension();
    let os = await getOS();

    let flingEnabled = await getFlingEnabled();
    let flingFriction = await getFlingFriction();
    let flingThreshold = await getFlingThreshold();

    flingEnabledButton.checked = flingEnabled === 'true';
    flingFrictionInput.value = flingFriction;
    flingThresholdInput.value = flingThreshold;
    flingFrictionSlider.value = flingFriction;
    flingThresholdSlider.value = flingThreshold;

    // Do not initiate if custom settings is checked
    if (customSetting !== 'true') {
        if (os == 'linux') {
            // Set Linux values
            osText.innerHTML = 'Linux';
            statusText.innerHTML = 'Enabled';

            scrollFactorInput.value = linuxSpeed;
            scrollFactorSlider.value = linuxSpeed;
            scrollFactorInput.disabled = true;
            scrollFactorSlider.disabled = true;

            customSettingButton.checked = false;

            setScrollFactor(linuxSpeed);
        } else if (os == 'win') {

            // Set Windows values
            osText.innerHTML = 'Windows';
            statusText.innerHTML = 'Disabled';

            scrollFactorInput.value = windowsSpeed
            scrollFactorSlider.value = windowsSpeed;
            scrollFactorInput.disabled = true;
            scrollFactorSlider.disabled = true;

            customSettingButton.checked = false;

            setScrollFactor(windowsSpeed);
        } else if (os == 'mac') {
            osText.innerHTML = 'MacOS';
            statusText.innerHTML = 'Disabled'

            scrollFactorInput.value = macSpeed
            scrollFactorSlider.value = macSpeed;
            scrollFactorInput.disabled = true;
            scrollFactorSlider.disabled = true;

            customSettingButton.checked = false;

            setScrollFactor(macSpeed);
        }
    } else {
        // Custom settings
        let scrollFactor = await getScrollFactor();

        osText.innerHTML = 'Custom';
        statusText.innerHTML = 'Enabled';

        scrollFactorInput.value = scrollFactor;
        scrollFactorSlider.value = scrollFactor;
        scrollFactorInput.disabled = false;
        scrollFactorSlider.disabled = false;


        customSettingButton.checked = true;


    }


    updateDisableExtension(disableExtension);
}

// Detect OS
async function getOS() {
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.getPlatformInfo(function (info) {
                resolve(info.os);
            })
        }
        catch (ex) {
            reject(ex)
        }
    });
}

// *** SETTINGS ***

// Get setting key variable
async function getSetting(key) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.get(key, function (items) {
                resolve(items);
            })
        }
        catch (ex) {
            reject(ex);
        }
    });
}

// FLING PARAMETERS
async function getFlingEnabled() {
    let result = await getSetting('flingEnabled');
    return result.flingEnabled === undefined ? 'true' : result.flingEnabled;
}
function setFlingEnabled(value) {
    chrome.storage.local.set({ 'flingEnabled': value });
    updateFlingSettings();
}

async function getFlingFriction() {
    let result = await getSetting('flingFriction');
    return result.flingFriction === undefined ? 0.95 : parseFloat(result.flingFriction);
}
function setFlingFriction(value) {
    chrome.storage.local.set({ 'flingFriction': value });
    updateFlingSettings();
}

async function getFlingThreshold() {
    let result = await getSetting('flingThreshold');
    return result.flingThreshold === undefined ? 1.0 : parseFloat(result.flingThreshold);
}
function setFlingThreshold(value) {
    chrome.storage.local.set({ 'flingThreshold': value });
    updateFlingSettings();
}

function updateFlingSettings() {
    let params = {
        flingEnabled: flingEnabledButton.checked ? 'true' : 'false',
        flingFriction: parseFloat(flingFrictionInput.value),
        flingThreshold: parseFloat(flingThresholdInput.value)
    };
    chrome.tabs.query({ windowType: "normal" }, function (tabs) {
        for (let i = 0; i < tabs.length; i++) {
            chrome.tabs.sendMessage(tabs[i].id, {
                flingEnabled: params.flingEnabled,
                flingFriction: params.flingFriction,
                flingThreshold: params.flingThreshold,
                CSS: 'ChangeFlingSpeed'
            });
        }
    });
}

// SCROLL FACTOR

async function getScrollFactor() {
    let result = await getSetting('scrollFactor');

    return result.scrollFactor;
}

function setScrollFactor(value) {

    if (value < 0 || value > 1000) {
        return;
    } else {
        chrome.storage.local.set({ 'scrollFactor': value });
    }

    updateScrollFactor();
}

async function updateScrollFactor() {
    let value = parseFloat(await getScrollFactor());

    chrome.tabs.query({ windowType: "normal" }, function (tabs) {
        for (let i = 0; i < tabs.length; i++) {
            chrome.tabs.sendMessage(tabs[i].id, { scrollFactor: value, CSS: 'ChangeScrollSpeed' });
        }
    });

}


function executeScriptAllTabs(code) {

    chrome.tabs.query({ windowType: "normal" }, function (tabs) {

        for (let i = 0; i < tabs.length; i++) {
            try {
                if (tabs[i].url) {
                    chrome.tabs.executeScript(tabs[i].id, { code }, function () {
                        if (chrome.runtime.lastError) { } // Suppress error
                    });
                }
            }
            catch (err) {
                console.log(err);
            }
        }
    });
}

// REFRESH TABS
function refreshTab(message) {

    if ((message) && (confirm(message))) {
        chrome.tabs.getAllInWindow(null, function (tabs) {
            for (let i = 0; i < tabs.length; i++) {
                chrome.tabs.update(tabs[i].id, { url: tabs[i].url });
            }
        });
    } else {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.update(tabs[0].id, { url: tabs[0].url });
        });
    };
}

// CUSTOM SETTING

async function getCustomSetting() {
    let result = await getSetting('customSetting');

    return result.customSetting;
}

// Set custom setting variable
function setCustomSetting(value) {
    chrome.storage.local.set({ 'customSetting': value });
}

// Apply custom setting variable in popup.js
function updateCustomSetting() {

    // Enable custom settings
    if (customSettingButton.checked == true) {
        setCustomSetting('true');
    } else {
        setCustomSetting('false');
    }

    // Redetect settings
    init();
}

// DISABLE EXTENSION

async function getDisableExtension() {
    let result = await getSetting('disableExtension');

    return result.disableExtension;
}

function setDisableExtension(value) {
    chrome.storage.local.set({ 'disableExtension': value });
}

function updateDisableExtension(previousValue) {

    if (statusText.innerHTML == 'Enabled') {
        setDisableExtension('false');

        // Previous value - do refresh
        if (previousValue == 'true') {
            refreshTab('A tab refresh is required to enable the extension. Do you want to refresh all tabs? Press "Cancel" to just refresh current tab.')
        }
    } else {
        setDisableExtension('true');

        if (previousValue == 'false') {
            refreshTab('A tab refresh is required to disable the extension. Do you want to refresh all tabs? Press "Cancel" to just refresh current tab.')
        }
    }
}

// *** LISTENERS ***

// Custom setting button
customSettingButton.addEventListener('change', updateCustomSetting);

// Generic sync function for slider and input
function syncInputs(inputEl, sliderEl, setterFn) {
    inputEl.addEventListener('input', () => {
        sliderEl.value = inputEl.value;
    });
    inputEl.addEventListener('change', () => {
        setterFn(inputEl.value);
    });
    inputEl.addEventListener('keyup', () => {
        setterFn(inputEl.value);
    });

    sliderEl.addEventListener('input', () => {
        inputEl.value = sliderEl.value;
        setterFn(sliderEl.value);
    });
}

syncInputs(scrollFactorInput, scrollFactorSlider, setScrollFactor);
syncInputs(flingFrictionInput, flingFrictionSlider, setFlingFriction);
syncInputs(flingThresholdInput, flingThresholdSlider, setFlingThreshold);

flingEnabledButton.addEventListener('change', () => {
    setFlingEnabled(flingEnabledButton.checked ? 'true' : 'false');
});