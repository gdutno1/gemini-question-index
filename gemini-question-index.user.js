// ==UserScript==
// @name         Gemini 对话侧边快速索引
// @name:en      Gemini Question Index
// @namespace    http://tampermonkey.net/
// @version      1.4.0
// @description  在 Gemini 当前对话的右侧列出已加载的提问，点击即可定位。
// @description:en Jump to your prompts from a collapsible outline in the current Gemini chat.
// @author       gdutno1
// @homepageURL  https://github.com/gdutno1/gemini-question-index
// @supportURL   https://github.com/gdutno1/gemini-question-index/issues
// @match        https://gemini.google.com/*
// @grant        GM_addStyle
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const querySelector = 'user-query, [data-test-id="user-query"], [data-testid="user-query"], .user-query-container';
    const container = document.createElement('div');
    container.id = 'gemini-toc-container';
    if (document.getElementById(container.id)) return;

    GM_addStyle(`
        #gemini-toc-container {
            --toc-surface: light-dark(#fff, #202124);
            --toc-text: light-dark(#202124, #e8eaed);
            --toc-muted: light-dark(#5f6368, #bdc1c6);
            --toc-border: light-dark(#dadce0, #4c4f54);
            --toc-accent: light-dark(#174ea6, #a8c7fa);
            --toc-hover: light-dark(#e8f0fe, #303e55);
            color-scheme: light dark;
            position: fixed;
            inset: 84px 16px auto auto;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            width: min(290px, calc(100vw - 32px));
            color: var(--toc-text);
            font: 13px/1.45 "Segoe UI", sans-serif;
            pointer-events: none;
        }

        body.light-theme #gemini-toc-container { color-scheme: light; }
        body.dark-theme #gemini-toc-container { color-scheme: dark; }

        #gemini-toc-container button {
            color: inherit;
            font: inherit;
            cursor: pointer;
        }

        #gemini-toc-container button:focus-visible {
            outline: 2px solid var(--toc-accent);
            outline-offset: 1px;
        }

        #gemini-toc-toggle, #gemini-toc-panel {
            pointer-events: auto;
            background: var(--toc-surface);
            border: 1px solid var(--toc-border);
            box-shadow: 0 4px 16px rgb(0 0 0 / 12%);
        }

        #gemini-toc-toggle {
            border-radius: 20px;
            padding: 7px 13px;
        }

        #gemini-toc-panel-area {
            box-sizing: border-box;
            width: 100%;
            padding-top: 8px;
            pointer-events: auto;
        }

        #gemini-toc-panel-area[hidden] {
            display: none;
        }

        #gemini-toc-panel {
            display: flex;
            flex-direction: column;
            width: 100%;
            max-height: min(65vh, calc(100dvh - 140px));
            overflow: hidden;
            border-radius: 12px;
        }

        #gemini-toc-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            border-bottom: 1px solid var(--toc-border);
            font-weight: 600;
        }

        #gemini-toc-refresh {
            border: 0;
            border-radius: 5px;
            background: transparent;
            padding: 4px 7px;
        }

        #gemini-toc-list {
            margin: 0;
            padding: 6px;
            overflow-y: auto;
            overscroll-behavior: contain;
            list-style: none;
        }

        #gemini-toc-list button {
            display: grid;
            grid-template-columns: minmax(1.65em, auto) minmax(0, 1fr);
            gap: 5px;
            width: 100%;
            padding: 8px;
            border: 0;
            border-radius: 6px;
            background: transparent;
            text-align: start;
        }

        #gemini-toc-container button:hover, #gemini-toc-list button[aria-current] {
            background: var(--toc-hover);
        }

        .gemini-toc-index {
            color: var(--toc-accent);
            font-variant-numeric: tabular-nums;
        }

        .gemini-toc-summary {
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            overflow-wrap: anywhere;
        }

        #gemini-toc-empty {
            margin: 0;
            padding: 14px 12px;
            color: var(--toc-muted);
        }

        .gemini-toc-highlight {
            outline: 2px solid #6d9deb !important;
            outline-offset: 4px;
            border-radius: 10px;
        }
    `);

    function makeButton(label, id) {
        const button = document.createElement('button');
        button.type = 'button';
        if (id) button.id = id;
        button.textContent = label;
        return button;
    }

    const toggle = makeButton('提问目录 · 0', 'gemini-toc-toggle');
    const panelArea = document.createElement('div');
    panelArea.id = 'gemini-toc-panel-area';
    panelArea.hidden = true;
    const panel = document.createElement('nav');
    panel.id = 'gemini-toc-panel';
    panel.setAttribute('aria-label', '当前对话的提问');
    toggle.setAttribute('aria-controls', panel.id);
    toggle.setAttribute('aria-expanded', 'false');

    const header = document.createElement('div');
    header.id = 'gemini-toc-header';
    header.append(document.createTextNode('当前对话'));
    const refresh = makeButton('刷新', 'gemini-toc-refresh');
    refresh.setAttribute('aria-label', '刷新提问目录');
    header.append(refresh);

    const list = document.createElement('ol');
    list.id = 'gemini-toc-list';
    const empty = document.createElement('p');
    empty.id = 'gemini-toc-empty';
    empty.textContent = '当前没有已加载的提问';
    panel.append(header, list, empty);
    panelArea.append(panel);
    container.append(toggle, panelArea);
    document.body.append(container);

    function setPanelOpen(open) {
        if (panelArea.hidden === !open) return;
        if (!open && panel.contains(document.activeElement)) {
            toggle.focus({ preventScroll: true });
        }
        panelArea.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        if (open) updateIndex();
    }

    container.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'mouse') setPanelOpen(true);
    });
    container.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'mouse') setPanelOpen(false);
    });
    toggle.addEventListener('click', () => setPanelOpen(panelArea.hidden));
    refresh.addEventListener('click', updateIndex);

    function readQuestion(node) {
        const lines = node.querySelectorAll('.query-text-line');
        if (lines.length) {
            const text = Array.from(lines, (line) => line.innerText || line.textContent).join(' ');
            return normalizeText(text) || '图片或附件';
        }

        const content = node.querySelector('.query-text') ||
            node.querySelector('.user-query-bubble-with-background') || node;
        const narration = content.querySelector('.screen-reader-user-query-label, .cdk-visually-hidden');
        if (!narration) return normalizeText(content.innerText || content.textContent) || '图片或附件';

        // Gemini includes a second copy of the prompt for screen readers.
        const copy = content.cloneNode(true);
        for (const label of copy.querySelectorAll('.screen-reader-user-query-label, .cdk-visually-hidden')) {
            label.remove();
        }
        for (const lineBreak of copy.querySelectorAll('br')) lineBreak.replaceWith(' ');
        for (const block of copy.querySelectorAll('p, div, li, pre, blockquote')) block.append(' ');
        return normalizeText(copy.textContent) || '图片或附件';
    }

    function normalizeText(text) {
        return (text || '').replace(/\s+/g, ' ').trim();
    }

    let route = '';
    let entries = [];
    let selectedIndex = -1;
    let highlightedNode;
    let highlightTimer;

    function clearHighlight() {
        highlightedNode?.classList.remove('gemini-toc-highlight');
        highlightedNode = null;
        clearTimeout(highlightTimer);
    }

    function renderSelection() {
        list.querySelector('[aria-current]')?.removeAttribute('aria-current');
        list.children[selectedIndex]?.firstElementChild.setAttribute('aria-current', 'location');
    }

    function jumpToQuestion(index) {
        const intended = entries[index];
        const previousRoute = route;
        const sameList = updateIndex();
        if (!intended || route !== previousRoute) return;

        const liveIndex = sameList ? index : entries.findIndex((entry) =>
            entry.node === intended.node && entry.text === intended.text);
        const entry = entries[liveIndex];
        if (!entry) return;

        const target = entry.node.querySelector('.query-content[id^="user-query-content-"]') || entry.node;
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center', inline: 'nearest' });
        clearHighlight();
        highlightedNode = target;
        highlightedNode.classList.add('gemini-toc-highlight');
        highlightTimer = setTimeout(clearHighlight, 1600);
        selectedIndex = liveIndex;
        renderSelection();
    }

    function updateIndex() {
        if (!container.isConnected) document.body.append(container);

        const nextRoute = location.pathname;
        const routeChanged = route !== nextRoute;
        route = nextRoute;
        const next = Array.from(document.querySelectorAll(querySelector))
            .filter((node) => !node.parentElement?.closest(querySelector) && !node.closest('[hidden], [aria-hidden="true"]'))
            .map((node) => ({ node, text: readQuestion(node) }));

        const sameList = !routeChanged && next.length === entries.length &&
            next.every((entry, index) => entry.text === entries[index].text);
        const previousSelection = entries[selectedIndex];
        const nextSelection = routeChanged || !previousSelection ? -1 :
            next.findIndex((entry) => entry.node === previousSelection.node);
        entries = next;
        if (routeChanged) clearHighlight();
        if (sameList) return true;

        selectedIndex = nextSelection;
        const focusedIndex = Array.prototype.indexOf.call(list.children, document.activeElement?.parentElement);
        toggle.textContent = `提问目录 · ${entries.length}`;
        empty.hidden = entries.length > 0;
        list.hidden = entries.length === 0;

        const rows = entries.map((entry, index) => {
            const row = document.createElement('li');
            const button = makeButton('');
            button.title = entry.text;
            const number = document.createElement('span');
            number.className = 'gemini-toc-index';
            number.textContent = `${index + 1}.`;
            const summary = document.createElement('span');
            summary.className = 'gemini-toc-summary';
            summary.textContent = entry.text;
            button.append(number, summary);
            button.addEventListener('click', () => jumpToQuestion(index));
            row.append(button);
            return row;
        });
        list.replaceChildren(...rows);
        renderSelection();

        if (focusedIndex >= 0) {
            const focusTarget = (!routeChanged && rows[focusedIndex]?.firstElementChild) || toggle;
            focusTarget.focus({ preventScroll: true });
        }
        return false;
    }

    let updatePending = false;
    function scheduleUpdate() {
        if (updatePending) return;
        updatePending = true;
        requestAnimationFrame(() => {
            updatePending = false;
            updateIndex();
        });
    }

    function affectsQuestions(change) {
        if (container.contains(change.target)) return false;
        const element = change.target instanceof Element ? change.target : change.target.parentElement;
        if (element?.closest(querySelector)) return true;
        if (change.type === 'attributes') return Boolean(element?.querySelector(querySelector));
        return [...change.addedNodes, ...change.removedNodes].some((node) =>
            node instanceof Element && (node.matches(querySelector) || node.querySelector(querySelector)));
    }

    new MutationObserver((changes) => {
        if (!container.isConnected || route !== location.pathname || changes.some(affectsQuestions)) {
            scheduleUpdate();
        }
    }).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['hidden', 'aria-hidden']
    });
    window.navigation?.addEventListener('currententrychange', scheduleUpdate);
    window.addEventListener('popstate', scheduleUpdate);

    updateIndex();
})();
