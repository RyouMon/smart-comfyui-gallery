// Run in the dedicated, read-only-media candidate browser tab after the
// performance workload has loaded all metadata. No media or DB writes.
(async () => {
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const results = {};
    check(currentItemCount === totalFiles, 'Load all metadata before regression tests');
    const count = allFilesData.length;
    check(count > 100, 'Expected a multi-window test library');
    const filterPanel = document.getElementById('desktop-search-panel');
    filterPanel.classList.remove('visible');
    document.getElementById('search-toggle-desktop').click();
    await frame();
    check(filterPanel.classList.contains('visible'), 'Filters did not open');
    document.getElementById('search-toggle-desktop').click();
    await frame();
    check(!filterPanel.classList.contains('visible'), 'Filters reopened while closing');
    results.filter_toggle = true;
    ensureGalleryItem(count-1);
    await frame();
    check(galleryItems[count-1]?.isConnected, 'Last item did not mount');
    results.last_item = true;

    deselectAll();
    let first = ensureGalleryItem(0);
    toggleSelection({shiftKey:false,stopPropagation(){}}, allFilesData[0].id, first);
    let distant = ensureGalleryItem(120);
    toggleSelection({shiftKey:true,stopPropagation(){}}, allFilesData[120].id, distant);
    check(selectedFiles.size === 121, 'Range selection lost unmounted files');
    deselectAll();
    await selectAll();
    check(selectedFiles.size === count, 'Select all lost unmounted files');
    deselectAll();
    results.range_and_select_all = true;

    const imageIndex = allFilesData.findLastIndex(file=>file.type==='image');
    openLightbox(null, allFilesData[0].id, true);
    showItemAtIndex(imageIndex);
    check(currentLightboxFile.id === allFilesData[imageIndex].id, 'Lightbox order depends on mounted DOM');
    currentLightboxIndex = imageIndex;
    closeLightbox();
    await frame();
    check(galleryItems[imageIndex]?.isConnected, 'Lightbox close did not restore its grid item');
    results.lightbox_cross_window = true;

    ensureGalleryItem(0);
    focusedItemIndex = Math.max(...[...document.querySelectorAll('.gallery-item')].map(item=>Number(item.dataset.galleryIndex)));
    const previousFocus = focusedItemIndex;
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
    await frame();
    check(focusedItemIndex > previousFocus && galleryItems[focusedItemIndex]?.isConnected, 'Keyboard navigation failed across window boundary');
    results.keyboard_cross_window = true;

    toggleLayoutMode();
    await frame();
    ensureGalleryItem(500);
    await frame();
    check(virtualGallery.columns === 1 && galleryItems[500]?.isConnected, 'List virtualization failed');
    check(document.querySelectorAll('.gallery-item').length < 60, 'List DOM grew with file count');
    check(galleryItems[500].querySelector('.list-col-index')?.dataset.rowNumber === '501', 'List row numbering is not global');
    toggleLayoutMode();
    await frame();
    results.grid_list_switch = true;

    const videoIndex = allFilesData.findIndex(file=>file.type==='video');
    videoAutoplay = false;
    ensureGalleryItem(videoIndex);
    await frame();
    const videoCard = ensureGalleryItem(videoIndex);
    const play = videoCard.querySelector('.video-play-overlay');
    check(!!play && !videoCard.querySelector('video'), 'Idle video should use an image poster');
    playVideoInGrid({preventDefault(){},stopPropagation(){}},play);
    const video = videoCard.querySelector('video');
    check(!!video?.getAttribute('src'), 'Click-to-play did not create video');
    ensureGalleryItem(count-1);
    await frame();
    check(!video.isConnected && !video.getAttribute('src'), 'Offscreen video retained media source');
    results.video_mount_and_release = true;

    // Scaling fixture: 10,000 synthetic audio cards with no media requests.
    // It tests DOM scaling only, not 10,000 real files or backend indexing.
    const example = allFilesData[0];
    allFilesData = Array.from({length:10000},(_,i)=>({...example,id:'fixture-'+i,name:'fixture_'+i+'.wav',type:'audio',dimensions:'',has_workflow:0}));
    totalFiles = currentItemCount = 10000;
    refreshVirtualGallery();
    ensureGalleryItem(9999);
    await frame();
    check(galleryItems[9999]?.isConnected, 'Scaling fixture last item inaccessible');
    check(document.querySelectorAll('.gallery-item').length < 60, 'Scaling fixture DOM is unbounded');
    await selectAll();
    check(selectedFiles.size === 10000, 'Scaling fixture select all failed');
    deselectAll();
    results.synthetic_10000 = {mounted:document.querySelectorAll('.gallery-item').length,metadata:allFilesData.length};
    const originalFetch = window.fetch;
    const originalCollection = currentFolderInfo.is_collection;
    const originalCollectionId = currentFolderInfo.collection_id;
    try {
        window.fetch = (url, options) => String(url).includes('/api/collections/tag_batch')
            ? Promise.resolve(new Response(JSON.stringify({status:'success'}),{headers:{'Content-Type':'application/json'}}))
            : originalFetch(url, options);
        currentFolderInfo.is_collection = true;
        currentFolderInfo.collection_id = 12345;
        selectedFiles.add(allFilesData[0].id);
        selectedFiles.add(allFilesData.at(-1).id);
        await untagCurrentCollection();
        check(allFilesData.length === 9998 && currentItemCount === 9998, 'Untag ignored an unmounted selection');
        results.untag_unmounted = true;
    } finally {
        window.fetch = originalFetch;
        currentFolderInfo.is_collection = originalCollection;
        currentFolderInfo.collection_id = originalCollectionId;
    }
    const originalNotes = currentNoteFiles;
    const originalNoteIndex = activeNoteIndex;
    const originalInspector = openFileInfoPanel;
    const metadataCount = allFilesData.length;
    let inspected = false;
    try {
        currentNoteFiles = [{id:'fixture-note',name:'fixture.md',type:'document'}];
        activeNoteIndex = 0;
        openFileInfoPanel = id => { inspected = inspectorOnlyFiles.has(id); };
        openNotesInfoPanel();
        check(inspected && allFilesData.length === metadataCount, 'Note inspector changed gallery order');
        results.note_inspector_separate = true;
    } finally {
        currentNoteFiles = originalNotes;
        activeNoteIndex = originalNoteIndex;
        openFileInfoPanel = originalInspector;
        inspectorOnlyFiles.delete('fixture-note');
    }
    results.status = 'passed';
    return results;
})()
