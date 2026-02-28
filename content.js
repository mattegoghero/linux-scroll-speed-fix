'use strict';

let scrollFactor = 1.0;
let flingEnabled = true;
let flingFriction = 0.95;
let flingThreshold = 1.0;

let recentWheelEvents = [];
let isFlinging = false;
let flingRaf = null;
let flingTimeout = null;

async function getSetting(key) {
    return new Promise(resolve => {
        try {
            chrome.storage.local.get(key, items => resolve(items));
        } catch (e) {
            resolve({});
        }
    });
}

async function init() {
    let disabled = await getSetting('disableExtension');
    if (disabled && disabled.disableExtension === 'true') return;

    let sf = await getSetting('scrollFactor');
    if (sf && sf.scrollFactor !== undefined) scrollFactor = parseFloat(sf.scrollFactor);

    let ss = await getSetting('smoothScroll');
    if (ss && ss.smoothScroll === 'false') {
        const disableCSSSmoothScroll = () => {
            document.documentElement.style.scrollBehavior = "auto";
            if (document.body) document.body.style.scrollBehavior = "auto";
        };
        disableCSSSmoothScroll();
        window.addEventListener('DOMContentLoaded', disableCSSSmoothScroll);

        let observer = new MutationObserver(() => disableCSSSmoothScroll());
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    }

    let fE = await getSetting('flingEnabled');
    flingEnabled = fE && fE.flingEnabled !== undefined ? fE.flingEnabled === 'true' : true;

    let fF = await getSetting('flingFriction');
    flingFriction = fF && fF.flingFriction !== undefined ? parseFloat(fF.flingFriction) : 0.95;

    let fT = await getSetting('flingThreshold');
    flingThreshold = fT && fT.flingThreshold !== undefined ? parseFloat(fT.flingThreshold) : 1.0;

    window.addEventListener('wheel', handleWheel, { passive: false });

    // Support iframes dynamically
    window.addEventListener('message', (message) => {
        if (message.data && message.data.CSS === 'ChangeScrollSpeed') {
            // Re-dispatch or handle wheel event from iframe
            let event = message.data;
            event.target = getFrameByEvent(message.source);
            if (event.target) handleWheel(event);
        }
    });
}

function getFrameByEvent(source) {
    const iframes = document.getElementsByTagName('iframe');
    for (let i = 0; i < iframes.length; i++) {
        if (iframes[i].contentWindow === source) return iframes[i];
    }
    return null;
}

function stopFling() {
    if (flingRaf) {
        cancelAnimationFrame(flingRaf);
        flingRaf = null;
    }
    isFlinging = false;
}

function handleWheel(e) {
    if (e.defaultPrevented || e.ctrlKey) return;

    let deltaX = e.deltaX;
    let deltaY = e.deltaY;

    if (e.shiftKey && !(e.ctrlKey || e.altKey || e.metaKey)) {
        deltaX = deltaX || deltaY;
        deltaY = 0;
    }

    // Determine target
    let target = getScrollableParent(e.target, deltaX !== 0, deltaY !== 0);
    if (!target) return;

    // Stop any ongoing fling since user touched the trackpad/wheel
    stopFling();

    const now = performance.now();

    // Allow native history navigation if dominant horizontal scroll at edge
    if (Math.abs(deltaX) > Math.abs(deltaY) * 2 && Math.abs(deltaX) > 10 && !e.shiftKey) {
        // Let it through for back/forward swipe
        return;
    }

    let scaledX = deltaX * scrollFactor;
    let scaledY = deltaY * scrollFactor;

    // Apply immediate scroll to prevent lagging caused by batching
    applyScroll(target, scaledX, scaledY);

    if (flingEnabled) {
        recentWheelEvents.push({ x: scaledX, y: scaledY, time: now, target: target });
        // Keep only events from the last 150ms
        recentWheelEvents = recentWheelEvents.filter(ev => now - ev.time < 150);

        clearTimeout(flingTimeout);
        flingTimeout = setTimeout(() => attemptFling(target), 50);
    }

    e.preventDefault();
}

function applyScroll(target, dx, dy) {
    // Special cases
    if (window.location.hostname === 'youtube.com') {
        let ytdApp = target.getElementsByTagName ? target.getElementsByTagName('ytd-app')[0] : null;
        if (ytdApp && window.document.fullscreenElement) {
            target = ytdApp;
        }
    } else if (window.location.hostname === 'www.nexusmods.com') {
        target = document.scrollingElement || document.documentElement;
    }

    if (target === document.documentElement || target === document.scrollingElement || target === document.body) {
        window.scrollBy({ left: dx, top: dy, behavior: 'auto' });
    } else if (target.scrollBy) {
        target.scrollBy({ left: dx, top: dy, behavior: 'auto' });
    }
}

function attemptFling(target) {
    if (recentWheelEvents.length < 3) return;

    const now = performance.now();
    const lastEvent = recentWheelEvents[recentWheelEvents.length - 1];

    // Only fling if the last event was very recent (meaning the user lifted fingers while moving)
    if (now - lastEvent.time > 100) return;

    const firstEvent = recentWheelEvents[0];
    const dt = lastEvent.time - firstEvent.time;
    if (dt <= 0) return;

    let sumX = 0, sumY = 0;
    for (let i = 1; i < recentWheelEvents.length; i++) {
        sumX += recentWheelEvents[i].x;
        sumY += recentWheelEvents[i].y;
    }

    let velX = sumX / dt; // px per ms
    let velY = sumY / dt;

    let speed = Math.sqrt(velX * velX + velY * velY);
    if (speed < flingThreshold) return;

    // Deceleration check: dynamically analyze velocity trend
    // Instead of a static threshold, we check if the velocity over the recent points 
    // exhibits a consistent declining trend that indicates stopping.
    let isDecelerating = false;
    if (recentWheelEvents.length >= 4) {
        let vels = [];
        for (let i = 1; i < recentWheelEvents.length; i++) {
            let ev1 = recentWheelEvents[i - 1];
            let ev2 = recentWheelEvents[i];
            let idt = ev2.time - ev1.time;
            if (idt > 0) {
                let pVel = Math.sqrt(Math.pow(ev2.x, 2) + Math.pow(ev2.y, 2)) / idt;
                vels.push({ v: pVel, t: ev2.time });
            }
        }

        if (vels.length >= 3) {
            // Simple linear regression on velocities (v = m*t + q)
            // If m is significantly negative, user is decelerating
            let sumT = 0, sumV = 0, sumTV = 0, sumT2 = 0;
            let n = vels.length;
            let t0 = vels[0].t; // Normalize time to avoid large floats
            for (let point of vels) {
                let t = point.t - t0;
                sumT += t;
                sumV += point.v;
                sumTV += t * point.v;
                sumT2 += t * t;
            }

            let numerator = (n * sumTV) - (sumT * sumV);
            let denominator = (n * sumT2) - (sumT * sumT);

            if (denominator !== 0) {
                let slope = numerator / denominator;

                // If velocity is dropping consistently (negative slope) 
                // AND the final velocity is lower than the average velocity of the swipe
                let avgVel = sumV / n;
                let finalVel = vels[vels.length - 1].v;

                if (slope < -0.01 && finalVel < avgVel) {
                    isDecelerating = true;
                }
            }
        }
    }

    if (isDecelerating) {
        return;
    }

    isFlinging = true;
    startFlingAnimation(target, velX, velY, now);
}

function startFlingAnimation(target, velX, velY, startTime) {
    let lastTime = startTime;
    let remainderX = 0;
    let remainderY = 0;

    function step(currentTime) {
        if (!isFlinging) return;

        let frameDt = currentTime - lastTime;
        lastTime = currentTime;

        if (frameDt > 100) frameDt = 16.666; // Prevent jumps on lag
        else if (frameDt <= 0) frameDt = 16.666;

        let decay = Math.pow(flingFriction, frameDt / 16.666);
        velX *= decay;
        velY *= decay;

        if (Math.abs(velX) < 0.05 && Math.abs(velY) < 0.05) {
            isFlinging = false;
            return;
        }

        let exactDx = (velX * frameDt) + remainderX;
        let exactDy = (velY * frameDt) + remainderY;

        let dx = Math.trunc(exactDx);
        let dy = Math.trunc(exactDy);

        remainderX = exactDx - dx;
        remainderY = exactDy - dy;

        if (dx !== 0 || dy !== 0) {
            applyScroll(target, dx, dy);
        }

        flingRaf = requestAnimationFrame(step);
    }

    flingRaf = requestAnimationFrame(step);
}

function getScrollableParent(node, hasX, hasY) {
    if (node == null) return null;

    if (node === document.body || node === document.documentElement) {
        return document.scrollingElement || document.documentElement;
    }

    try {
        const style = window.getComputedStyle(node);
        const overflowY = style.getPropertyValue('overflow-y');
        const overflowX = style.getPropertyValue('overflow-x');
        const isScrollableY = (overflowY === 'auto' || overflowY === 'scroll');
        const isScrollableX = (overflowX === 'auto' || overflowX === 'scroll');

        // Check if actually scrollable by content size
        const canScrollY = isScrollableY && node.scrollHeight > node.clientHeight;
        const canScrollX = isScrollableX && node.scrollWidth > node.clientWidth;

        if ((hasY && canScrollY) || (hasX && canScrollX)) {
            return node;
        }
    } catch (e) {
        // Ignore errors from cross-origin/shadow DOM if any
    }

    return getScrollableParent(node.parentNode, hasX, hasY);
}

init();

chrome.runtime.onMessage.addListener((message) => {
    if (message.scrollFactor !== undefined) scrollFactor = parseFloat(message.scrollFactor);
    if (message.CSS === 'ChangeFlingSpeed') {
        if (message.flingEnabled !== undefined) flingEnabled = message.flingEnabled === 'true';
        if (message.flingFriction !== undefined) flingFriction = parseFloat(message.flingFriction);
        if (message.flingThreshold !== undefined) flingThreshold = parseFloat(message.flingThreshold);
    }
});
