// A deterministic workload for the browser CDP Runtime.evaluate development
// interface. Used unchanged before and after optimization. Run after installing
// browser_probe.js in a fresh authenticated full-library view.
(async () => {
    const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const sample = label => ({label, ...__galleryProbe.snapshot()});
    scrollTo({top:0,behavior:'instant'});
    await paint();
    const results = {first: sample('first_batch')};
    __galleryProbe.reset();
    let start = performance.now();
    let pages = 0;
    const loadMore = document.getElementById('load-more-btn');
    while (currentItemCount < totalFiles && pages < 250) {
        const previous = currentItemCount;
        loadMore.click();
        while (loadMore.disabled && currentItemCount < totalFiles) await new Promise(r => setTimeout(r, 10));
        if (previous === currentItemCount) throw new Error('Pagination stalled');
        pages++;
    }
    await paint();
    results.full = {...sample('all_metadata_loaded'), append_ms: Math.round(performance.now()-start), pages, loaded_items:currentItemCount,total_items:totalFiles};
    __galleryProbe.reset();
    start = performance.now();
    // 120 scroll positions covering 18,000 CSS pixels; each step waits for a
    // real animation frame. This is a controlled scroll workload, not a claim
    // about display FPS or a substitute for an input-latency field measurement.
    for (let i=0;i<120;i++) {
        scrollTo({top:Math.min(document.documentElement.scrollHeight-innerHeight, i*150),behavior:'instant'});
        await new Promise(requestAnimationFrame);
    }
    results.scroll = {...sample('120_scroll_steps'), scroll_work_ms:Math.round(performance.now()-start)};
    scrollTo({top:0,behavior:'instant'});
    await paint();
    const interactions = [];
    for (let i=0;i<6;i++) {
        __galleryProbe.reset();
        start = performance.now();
        document.getElementById('toggle-select-btn').click();
        const handler = performance.now()-start;
        await paint();
        interactions.push({handler_ms:Math.round(handler*100)/100,to_two_frames_ms:Math.round((performance.now()-start)*100)/100,...sample('select_all_toggle')});
    }
    results.selection = interactions;
    const menus = [];
    for (const id of ['tools-btn-desk','search-toggle-desktop']) {
        for (let i=0;i<4;i++) {
            start=performance.now();
            document.getElementById(id).click();
            const handler=performance.now()-start;
            await paint();
            menus.push({id,handler_ms:Math.round(handler*100)/100,to_two_frames_ms:Math.round((performance.now()-start)*100)/100});
        }
    }
    results.menus=menus;
    results.final = sample('final');
    return results;
})()
