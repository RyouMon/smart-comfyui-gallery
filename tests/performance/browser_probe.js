// Inject into a dedicated test tab before navigation via CDP. No application
// behavior is changed; all measurements live in this tab and disappear on reload.
(() => {
    performance.setResourceTimingBufferSize(20000);
    const longTasks = [], events = [], frames = [];
    let previousFrame = 0;
    const observers = [];
    for (const [type, target] of [['longtask', longTasks], ['event', events]]) {
        try {
            const observer = new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    target.push({name: entry.name, start: entry.startTime, duration: entry.duration});
                }
            });
            observer.observe({type, buffered: true, durationThreshold: 16});
            observers.push(observer);
        } catch (_) {}
    }
    function frame(time) {
        if (previousFrame) frames.push({start: previousFrame, duration: time - previousFrame});
        previousFrame = time;
        if (frames.length > 12000) frames.splice(0, 6000);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    const percentile = (values, fraction) => {
        if (!values.length) return 0;
        const sorted = values.slice().sort((a, b) => a - b);
        return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] * 100) / 100;
    };
    window.__galleryProbe = {
        start: performance.now(),
        reset() { this.start = performance.now(); },
        snapshot() {
            const start = this.start;
            const gaps = frames.filter(f => f.start >= start).map(f => f.duration);
            const tasks = longTasks.filter(t => t.start >= start);
            const inputs = events.filter(e => e.start >= start);
            const resources = performance.getEntriesByType('resource');
            const cards = [...document.querySelectorAll('#gallery-container .gallery-item')];
            const visible = cards.filter(el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
            const navigation = performance.getEntriesByType('navigation')[0];
            const summary = prefix => {
                const matches = resources.filter(r => new URL(r.name).pathname.startsWith(prefix));
                return {requests: matches.length, bytes: matches.reduce((n,r) => n + r.transferSize, 0)};
            };
            return {
                elapsed_ms: Math.round(performance.now() - start),
                viewport: [innerWidth, innerHeight, devicePixelRatio],
                document_visible: document.visibilityState,
                dom_elements: document.querySelectorAll('*').length,
                mounted_cards: cards.length,
                visible_cards: visible.length,
                video_elements: document.querySelectorAll('#gallery-container video').length,
                video_sources: document.querySelectorAll('#gallery-container video[src]').length,
                decoded_images: [...document.images].filter(i=>i.complete && i.naturalWidth).length,
                heap_used_bytes: performance.memory?.usedJSHeapSize,
                animations: document.getAnimations().length,
                frame_samples: gaps.length,
                frame_gap_p50_ms: percentile(gaps, .5),
                frame_gap_p95_ms: percentile(gaps, .95),
                frame_gap_max_ms: percentile(gaps, 1),
                frames_over_50ms: gaps.filter(g=>g>50).length,
                long_tasks: tasks.length,
                long_task_total_ms: Math.round(tasks.reduce((n,t)=>n+t.duration,0)),
                long_task_max_ms: percentile(tasks.map(t=>t.duration), 1),
                input_events: inputs.length,
                input_duration_p95_ms: percentile(inputs.map(e=>e.duration), .95),
                thumbnails: summary('/galleryout/thumbnail/'),
                original_media: summary('/galleryout/file/'),
                pagination: summary('/galleryout/load_more'),
                navigation: navigation && {
                    ttfb_ms: Math.round(navigation.responseStart - navigation.requestStart),
                    dom_ready_ms: Math.round(navigation.domContentLoadedEventEnd),
                    load_ms: Math.round(navigation.loadEventEnd),
                    html_bytes: navigation.decodedBodySize,
                },
            };
        },
    };
})();
