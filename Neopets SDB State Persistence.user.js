// ==UserScript==
// @name         # Neopets SDB - State Persistence
// @namespace    local-advisor-fork
// @version      2026-11-22.1
// @description  Preserves SDB page, category, sort and per-page across refreshes and via browser back/forward
// @author       Austin Ryder
// @match        *://www.neopets.com/safetydeposit.phtml*
// @grant        none
// @license      MIT
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20SDB%20State%20Persistence.user.js
// @updateURL    https://raw.githubusercontent.com/peach300/neopets-optimization/main/Neopets%20SDB%20State%20Persistence.user.js
// ==/UserScript==

(function () {
    'use strict';

    // State persistence: injects the page/category/sort/per-page/search into the
    // URL by intercepting the SDB's requests, so a refresh or back/forward lands
    // you back on the view you were looking at.
    //
    // HISTORY: this script used to do a second thing — clone the pagination and
    // the filter bar so both appeared above AND below the item list, because the
    // SDB rendered them above only. Neopets has since shipped that itself:
    // NP-44891 added a native top pagination row (<sdb-pagination position="top">)
    // and NP-45694 added the Sort panel with a rarity range. The clones became
    // redundant, and worse, actively wrong:
    //
    //   injectBottomControls() located the pager with
    //       document.querySelector('.sdb-pagination.text-cafeteria')
    //   which, once a native top pager existed, matched the TOP one instead of
    //   the bottom one. So the pagination clone was inserted next to a pager that
    //   was already there, and injectFiltersClone's `paginationEl.after(...)` put
    //   the cloned filter bar — search box, category picker, per-page, Sort —
    //   just below the top pagination rather than below the item list. Result:
    //   two search boxes and two filter bars stacked near the top of the page.
    //
    // The whole cloning half is removed here, along with the MutationObserver on
    // document.body that re-injected it on every Vue DOM touch. If Neopets ever
    // drops its native top pager, the clone logic is in git history rather than
    // worth keeping alive on a selector that silently changes meaning.

    // --- Config ---

    const SDB_ENDPOINT = '/np-templates/ajax/safetydeposit/get-items.php';
    const P_PAGE = 'sdb_page';
    const P_CAT  = 'sdb_cat';
    const P_SORT = 'sdb_sort';
    const P_PER  = 'sdb_per';
    const DEFAULT_PER = 30;

    // --- State persistence ---
    // The SDB is a Vue app with zero URL routing of its own, so the query string
    // is the only place we can stash "what you were looking at" that survives a
    // refresh or hitting back/forward.

    function readState() {
        const params = new URLSearchParams(location.search);
        return {
            page:     parseInt(params.get(P_PAGE)) || 1,
            category: params.get(P_CAT) || '',
            sort:     params.get(P_SORT) || '',
            per_page: parseInt(params.get(P_PER)) || DEFAULT_PER,
            search:   params.get('obj_name') || '',
        };
    }

    function writeState(state, mode) {
        const url = new URL(location.href);
        state.page > 1
            ? url.searchParams.set(P_PAGE, state.page)
            : url.searchParams.delete(P_PAGE);
        state.category
            ? url.searchParams.set(P_CAT, state.category)
            : url.searchParams.delete(P_CAT);
        state.sort
            ? url.searchParams.set(P_SORT, state.sort)
            : url.searchParams.delete(P_SORT);
        state.per_page !== DEFAULT_PER
            ? url.searchParams.set(P_PER, state.per_page)
            : url.searchParams.delete(P_PER);
        if (mode === 'push') {
            history.pushState(null, '', url);
        } else {
            history.replaceState(null, '', url);
        }
    }

    // Reads the URL-shaped state off an outgoing request body, whether it was the user
    // clicking around or the script injecting saved state below.
    function stateFromRequestBody(body) {
        return {
            page:     body.page     || 1,
            category: body.category || '',
            sort:     body.sort     || '',
            per_page: body.per_page || DEFAULT_PER,
        };
    }

    // --- Vue app introspection ---
    // The SDB doesn't expose any public API for this, so we just reach into
    // Vue's internals directly.

    // SdbApp is the app root's only child (<sdb-app></sdb-app> inside
    // #sdb-vue-app), so its instance always sits exactly one level below the
    // app root
    function getSdbInstance() {
        const sdbAppEl = document.getElementById('sdb-vue-app');
        if (!sdbAppEl) return null;

        const rootInstance =
            (sdbAppEl._vnode && sdbAppEl._vnode.component) ||
            (sdbAppEl.__vue_app__ && sdbAppEl.__vue_app__._instance) ||
            null;

        return (rootInstance && rootInstance.subTree && rootInstance.subTree.component) || null;
    }

    // Pokes Vue's reactive setupState directly. Only call this right before a
    // fetch we've already hijacked below - it's just cosmetic sync for the
    // dropdowns/page indicator while that request is in flight, not a way to
    // actually navigate on its own.
    function patchVueState(instance, state) {
        if (!instance) return;
        try {
            const setupState = instance.setupState;
            setupState.currentPage      = state.page;
            setupState.selectedCategory = state.category;
            setupState.sortBy           = state.sort;
            setupState.perPage          = state.per_page;
            setupState.searchQuery      = state.search;
        } catch (err) {
            console.warn('[SDB State Persistence and QoL] Vue state patch failed:', err);
        }
    }

    // --- Fetch interception ---
    // This is where the actual syncing happens: sneak saved state into the SDB's
    // very first data request (so a refresh/deep link lands you back where you
    // were), then mirror every later request's params back into the URL as you
    // paginate, filter or sort on-page.

    let isFirstFetch = true;
    let restoringFromHistory = false; // true while replaying a popstate below, so we replace the history entry instead of pushing a new one
    const originalFetch = window.fetch;

    function isSdbListRequest(url, opts) {
        return typeof url === 'string' && url.includes(SDB_ENDPOINT) && opts && opts.method === 'POST';
    }

    window.fetch = function (url, opts) {
        if (isSdbListRequest(url, opts)) {
            let body;
            try { body = JSON.parse(opts.body || '{}'); } catch (_) { body = {}; }

            if (isFirstFetch) {
                isFirstFetch = false;
                const saved = readState();
                const hasNonDefault =
                    saved.page > 1 || saved.category || saved.sort ||
                    saved.per_page !== DEFAULT_PER || saved.search;

                if (hasNonDefault) {
                    body.page     = saved.page;
                    body.category = saved.category;
                    body.sort     = saved.sort;
                    body.per_page = saved.per_page;
                    body.search   = saved.search;
                    opts = Object.assign({}, opts, { body: JSON.stringify(body) });

                    patchVueState(getSdbInstance(), saved);
                }

                writeState(stateFromRequestBody(body), 'replace');

            } else {
                writeState(stateFromRequestBody(body), restoringFromHistory ? 'replace' : 'push');
                restoringFromHistory = false;
            }
        }

        return originalFetch.call(this, url, opts);
    };

    // --- Browser back/forward ---
    // Popstate only hands us the URL back - we still have to shove that state
    // into Vue ourselves. Category/sort/per-page are reactive fields the app
    // already watches, so just assigning them is enough to trigger a re-fetch.
    // The page is the odd one out: it needs the exposed onPageChange handler to
    // actually turn the page, which loops back through the fetch override above

    window.addEventListener('popstate', function () {
        const instance = getSdbInstance();
        if (!instance || !instance.proxy) return;

        restoringFromHistory = true;
        const saved = readState();

        const setupState = instance.setupState;
        setupState.selectedCategory = saved.category;
        setupState.sortBy           = saved.sort;
        setupState.perPage          = saved.per_page;
        setupState.searchQuery      = saved.search;

        if (typeof instance.proxy.onPageChange === 'function') {
            instance.proxy.onPageChange(saved.page);
        }
    });
})();
