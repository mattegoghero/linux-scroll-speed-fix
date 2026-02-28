'use strict';

let scrollFactor = 1.0;

// *** SETTINGS FETCHERS ***

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

async function getScrollFactor() {
    let result = await getSetting('scrollFactor');

    return result.scrollFactor;
}

async function getDisableExtension() {
    let result = await getSetting('disableExtension');

    return result.disableExtension;
}

async function getSmoothScroll() {
    let result = await getSetting('smoothScroll');

    return result.smoothScroll;
}

// FLING SETTINGS

async function getFlingEnabled() {
    let result = await getSetting('flingEnabled');
    return result.flingEnabled === undefined ? 'true' : result.flingEnabled;
}
async function getFlingFriction() {
    let result = await getSetting('flingFriction');
    return result.flingFriction === undefined ? 0.95 : parseFloat(result.flingFriction);
}
async function getFlingThreshold() {
    let result = await getSetting('flingThreshold');
    return result.flingThreshold === undefined ? 1.0 : parseFloat(result.flingThreshold);
}

let flingEnabled = true;
let flingFriction = 0.95;
let flingThreshold = 1.0;

let flingScrollHistory = [];
let flingRafId = null;
let flingTimeoutId = null;

// *** INIT ***

init();

async function init() {
    let disableExtension = await getDisableExtension();
    let smoothScroll = await getSmoothScroll();

    // Check if extension is disabled. If not run main function.
    if (disableExtension == 'false') {

        // Disable smooth scroll if needed
        if (smoothScroll == 'false') {
            try {
                window.onload = () => {
                    document.querySelectorAll("html")[0].style.scrollBehavior = "auto";
                    document.querySelector("body").style.scrollBehavior = "auto"
                }
            }
            catch (err) {
                console.log(err);
            }
        }

        // Run main function
        main();
    }
}

// Main function
async function main() {

    let smoothScroll = await getSmoothScroll();

    //Check for changes in html element to deal with banners changing smooth scrolling behavior
    let mutationObserver = new MutationObserver(function (mutations) {
        mutations.forEach(async function () {

            smoothScroll = await getSmoothScroll();

            if (smoothScroll == 'false') {
                window.onload = () => {
                    document.querySelectorAll("html")[0].style.scrollBehavior = "auto";
                    document.querySelector("body").style.scrollBehavior = "auto"
                }

            }
        });
    });

    try {
        mutationObserver.observe(document.querySelectorAll("html")[0], {
            attributes: true,
        });
    } catch (err) {
        console.log(err)
    }


    if (scrollFactor !== undefined) {
        scrollFactor = await getScrollFactor();
    }

    let _flingEnabled = await getFlingEnabled();
    flingEnabled = (_flingEnabled === 'true');
    flingFriction = await getFlingFriction();
    flingThreshold = await getFlingThreshold();

    // This function runs every time a scroll is made
    function wheel(event) {
        if (flingRafId) {
            cancelAnimationFrame(flingRafId);
            flingRafId = null;
        }

        const target = event.target;

        if (event.defaultPrevented || event.ctrlKey) {
            return true;
        }

        let deltaX = event.deltaX;
        let deltaY = event.deltaY;

        if (event.shiftKey && !(event.ctrlKey || event.altKey || event.metaKey)) {
            deltaX = deltaX || deltaY;
            deltaY = 0;
        }

        const xOnly = (deltaX && !deltaY);

        let element = overflowingAncestor(target, xOnly);

        if (element === getScrollRoot()) {
            element = window;
        }

        const isFrame = window.top !== window.self;

        if (!element) {
            if (isFrame) {

                if (event.preventDefault) {
                    // TODO
                    // Is there a better solution for the iFrames?
                    // Disabled due to cross site security blocking on some sites
                    // Will hopefully not cause issues
                }
            }

            return true;
        }

        /* SPECIAL SOLUTIONS */

        // Youtube fullscreen

        if (window.location.hostname === 'youtube.com') {
            youtubeFullScreen = element.getElementsByTagName('ytd-app')[0]

            if (youtubeFullScreen && window.document.fullscreenElement) {
                youtubeFullScreen.scrollBy({ left: deltaX * scrollFactor, top: deltaY * scrollFactor, behavior: 'auto' });
            }
        }

        else if (window.location.hostname === 'www.nexusmods.com') {
            getRealRoot().scrollBy({ left: deltaX * scrollFactor, top: deltaY * scrollFactor, behavior: 'auto' });
        }

        // Apply scrolling
        else {
            // Allow TouchpadOverscrollHistoryNavigation (2-finger swipe) to work
            // If horizontal scroll dominates and shift is not pressed, let the event through
            if (Math.abs(deltaX) > Math.abs(deltaY) * 2 && Math.abs(deltaX) > 10 && !event.shiftKey) {
                return true;
            }

            element.scrollBy({ left: deltaX * scrollFactor, top: deltaY * scrollFactor, behavior: 'auto' });

        }

        if (flingEnabled) {
            const now = performance.now();
            flingScrollHistory.push({
                x: deltaX * scrollFactor,
                y: deltaY * scrollFactor,
                t: now,
                element: element
            });

            flingScrollHistory = flingScrollHistory.filter(item => now - item.t < 100);

            if (flingTimeoutId) clearTimeout(flingTimeoutId);

            flingTimeoutId = setTimeout(() => {
                startFling();
            }, 50);
        }

        event.preventDefault();
    }

    function startFling() {
        if (flingScrollHistory.length < 2) return;

        const latest = flingScrollHistory[flingScrollHistory.length - 1];
        const oldest = flingScrollHistory[0];

        // Compute delta time in ms 
        let dt = latest.t - oldest.t;
        if (dt === 0) dt = 16.6;

        let sumX = 0;
        let sumY = 0;
        for (let item of flingScrollHistory) {
            sumX += item.x;
            sumY += item.y;
        }

        // Velocity array: px per ms
        let velX = sumX / dt;
        let velY = sumY / dt;

        let speed = Math.sqrt(velX * velX + velY * velY);
        if (speed < flingThreshold) return;

        let currentVelX = velX;
        let currentVelY = velY;
        let lastTime = performance.now();
        let targetElement = latest.element;

        function MathClamp(val, min, max) {
            return Math.min(Math.max(val, min), max);
        }

        function flingStep(time) {
            let frameDt = time - lastTime;
            lastTime = time;

            // Frame time cap to prevent huge jumps if tab was inactive
            if (frameDt > 100) frameDt = 16.666;

            let frictionFactor = Math.pow(flingFriction, frameDt / 16.666);
            currentVelX *= frictionFactor;
            currentVelY *= frictionFactor;

            let moveX = currentVelX * frameDt;
            let moveY = currentVelY * frameDt;

            if (Math.abs(currentVelX) < 0.05 && Math.abs(currentVelY) < 0.05) {
                flingRafId = null;
                return;
            }

            // Apply the move delta based on site logic
            if (window.location.hostname === 'youtube.com') {
                let ytdApp = targetElement ? targetElement.getElementsByTagName('ytd-app')[0] : null;
                if (ytdApp && window.document.fullscreenElement) {
                    ytdApp.scrollBy({ left: moveX, top: moveY, behavior: 'auto' });
                } else if (targetElement && targetElement.scrollBy) {
                    targetElement.scrollBy({ left: moveX, top: moveY, behavior: 'auto' });
                }
            } else if (window.location.hostname === 'www.nexusmods.com') {
                getRealRoot().scrollBy({ left: moveX, top: moveY, behavior: 'auto' });
            } else if (targetElement && targetElement.scrollBy) {
                targetElement.scrollBy({ left: moveX, top: moveY, behavior: 'auto' });
            }

            flingRafId = requestAnimationFrame(flingStep);
        }

        flingRafId = requestAnimationFrame(flingStep);
    }

    function overflowingAncestor(element, horizontal) {
        const body = document.body;
        const root = window.document.documentElement
        const rootScrollHeight = root.scrollHeight;
        const rootScrollWidth = root.scrollWidth;
        const isFrame = window.top !== window.self;

        do {
            if (horizontal && rootScrollWidth === element.scrollWidth ||
                !horizontal && rootScrollHeight === element.scrollHeight) {
                const topOverflowsNotHidden = overflowNotHidden(root, horizontal) && overflowNotHidden(body, horizontal);
                const isOverflowCSS = topOverflowsNotHidden || overflowAutoOrScroll(root, horizontal);

                if (isFrame && isContentOverflowing(root, horizontal) || !isFrame && isOverflowCSS) {

                    return getScrollRoot()
                }
            } else if (isContentOverflowing(element, horizontal) && overflowAutoOrScroll(element, horizontal)) {
                return element;
            }
        } while ((element = element.parentElement));
    }

    function isContentOverflowing(element, horizontal) {
        const client = horizontal ? element.clientWidth : element.clientHeight;
        const scroll = horizontal ? element.scrollWidth : element.scrollHeight;

        return (client + 10 < scroll);
    }

    function computedOverflow(element, horizontal) {
        return getComputedStyle(element, '').getPropertyValue(horizontal ? 'overflow-x' : 'overflow-y');
    }

    function overflowNotHidden(element, horizontal) {
        return computedOverflow(element, horizontal) !== 'hidden';
    }

    function overflowAutoOrScroll(element, horizontal) {
        return /^(scroll|auto)$/.test(computedOverflow(element, horizontal));
    }

    function getScrollRoot() {
        return (document.scrollingElement || document.body);
    }

    function getRealRoot() {
        return document.scrollingElement;
    }

    function message(message) {
        if (message.data.CSS !== 'ChangeScrollSpeed') {
            return;
        }

        let event = message.data;
        event.target = getFrameByEvent(message.source);
        wheel(event)
    }

    function getFrameByEvent(source) {
        const iframes = document.getElementsByTagName('iframe');

        return [].filter.call(iframes, function (iframe) {
            return iframe.contentWindow === source;
        })[0];
    }

    function chromeMessage(message) {
        if (message.scrollFactor) {
            scrollFactor = message.scrollFactor
        }
        if (message.CSS === 'ChangeFlingSpeed') {
            if (message.flingEnabled !== undefined) flingEnabled = (message.flingEnabled === 'true');
            if (message.flingFriction !== undefined) flingFriction = message.flingFriction;
            if (message.flingThreshold !== undefined) flingThreshold = message.flingThreshold;
        }
    }

    const wheelEvent = 'onwheel' in document.createElement('div') ? 'wheel' : 'mousewheel';

    const el = (window.document || window.document.body || window)

    el.addEventListener(wheelEvent, wheel, { passive: false })

    function getIFrame(frame) {
        if ((frame !== null) && (frame !== 'undefined') && (frame.width > 0)) {
            let el = frame;
            el.addEventListener(wheelEvent, wheel, { passive: false })
        }
    }

    getIFrame(window.document.querySelector('iframe'));

    window.addEventListener('message', message);

    chrome.runtime.onMessage.addListener(chromeMessage);
}