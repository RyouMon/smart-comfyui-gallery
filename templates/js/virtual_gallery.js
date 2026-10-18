// Windowed rows for the existing vanilla-JS gallery. File metadata and
// selection outlive DOM cards; only visible rows plus overscan are mounted.
class WindowedGallery {
    constructor(container, options) {
        this.container = container;
        this.options = options;
        this.items = [];
        this.ids = [];
        this.rows = new Map();
        this.heights = new Map();
        this.offsets = [0];
        this.columns = 1;
        this.frame = 0;
        this.top = document.createElement('div');
        this.bottom = document.createElement('div');
        for (const spacer of [this.top, this.bottom]) {
            spacer.className = 'sg-virtual-spacer';
            spacer.setAttribute('aria-hidden', 'true');
        }
        container.classList.add('sg-virtual-gallery');
        container.replaceChildren(this.top, this.bottom);
        this.schedule = () => {
            if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
        };
        window.addEventListener('scroll', this.schedule, {passive: true});
        window.addEventListener('resize', this.schedule, {passive: true});
        this.sizeObserver = new ResizeObserver(this.schedule);
        this.sizeObserver.observe(container);
        this.bodyObserver = new MutationObserver(this.schedule);
        this.bodyObserver.observe(document.body, {attributes: true, attributeFilter: ['class']});
        this.rowObserver = new ResizeObserver(entries => {
            let changed = false;
            const origin = this.origin();
            const anchor = this.rowAt(Math.max(0, scrollY - origin));
            const previous = this.offsets[anchor] || 0;
            for (const entry of entries) {
                const row = Number(entry.target.dataset.virtualRow);
                if (this.rows.get(row)?.element !== entry.target) continue;
                const height = entry.borderBoxSize?.[0]?.blockSize || entry.target.getBoundingClientRect().height;
                if (height > 0 && Math.abs((this.heights.get(row) || 0) - height) > .5) {
                    this.heights.set(row, height);
                    changed = true;
                }
            }
            if (changed) {
                this.rebuildOffsets();
                const delta = (this.offsets[anchor] || 0) - previous;
                if (anchor > 0 && Math.abs(delta) > 1) scrollTo({top: scrollY + delta, behavior: 'instant'});
                this.schedule();
            }
        });
    }

    origin() { return this.container.getBoundingClientRect().top + scrollY + this.padding; }

    layout() {
        const style = getComputedStyle(this.container);
        const list = document.body.classList.contains('list-view-active');
        const focus = document.body.classList.contains('focus-mode');
        const width = this.container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const gap = parseFloat(style.columnGap) || 0;
        const minimum = parseFloat(style.getPropertyValue('--grid-item-size')) || 320;
        const columns = list ? 1 : (innerWidth <= 768 ? (document.body.classList.contains('mobile-two-cols') ? 2 : 1) : Math.max(1, Math.floor((width + gap) / (minimum + gap))));
        const key = [Math.round(width), columns, list, focus, gap].join(':');
        this.padding = parseFloat(style.paddingTop) || 0;
        if (key === this.layoutKey) return;
        this.layoutKey = key;
        this.columns = columns;
        this.gap = list ? 8 : gap;
        this.cellWidth = (width - gap * (columns - 1)) / columns;
        this.list = list;
        this.focus = focus;
        this.clearRows();
        this.heights.clear();
        this.rebuildOffsets();
    }

    estimate(row) {
        if (this.list) return 72;
        let media = this.cellWidth * .625;
        for (let index = row * this.columns; index < Math.min(this.items.length, (row + 1) * this.columns); index++) {
            const dimensions = String(this.items[index].dimensions || '').split('x').map(Number);
            if (dimensions.length === 2 && dimensions.every(value => value > 0)) {
                media = Math.max(media, this.cellWidth * dimensions[1] / dimensions[0]);
            }
        }
        return media + (this.focus ? 0 : 170);
    }

    rebuildOffsets() {
        const count = Math.ceil(this.items.length / this.columns);
        this.offsets = [0];
        for (let row = 0; row < count; row++) this.offsets.push(this.offsets[row] + (this.heights.get(row) || this.estimate(row)) + this.gap);
    }

    rowAt(offset) {
        let low = 0, high = Math.max(0, this.offsets.length - 2);
        while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (this.offsets[middle] <= offset) low = middle;
            else high = middle - 1;
        }
        return low;
    }

    clearRows() { for (const row of [...this.rows.keys()]) this.removeRow(row); }

    removeRow(index) {
        const row = this.rows.get(index);
        if (!row) return;
        this.rowObserver.unobserve(row.element);
        for (const [itemIndex, element] of row.cards) this.options.unmount(element, itemIndex);
        row.element.remove();
        this.rows.delete(index);
    }

    setItems(items) {
        if (!this.container.contains(this.top)) this.container.replaceChildren(this.top, this.bottom);
        const changed = this.ids.some((id, index) => !items[index] || id !== items[index].id);
        if (changed) { this.clearRows(); this.heights.clear(); }
        this.items = items;
        this.ids = items.map(file => file.id);
        this.layout();
        this.rebuildOffsets();
        // A partial last row must be recreated when another page fills it.
        for (const [index, row] of this.rows) {
            const expected = Math.min(this.columns, items.length - index * this.columns);
            if (row.cards.length !== expected) this.removeRow(index);
        }
        this.render();
    }

    render() {
        this.layout();
        if (!this.items.length) return;
        const position = Math.max(0, scrollY - this.origin());
        const start = Math.max(0, this.rowAt(position) - 2);
        const end = Math.min(this.offsets.length - 2, this.rowAt(position + innerHeight) + 2);
        for (const row of [...this.rows.keys()]) if (row < start || row > end) this.removeRow(row);
        this.top.style.height = this.offsets[start] + 'px';
        this.bottom.style.height = Math.max(0, this.offsets.at(-1) - this.offsets[end + 1]) + 'px';
        let previous = this.top;
        for (let rowIndex = start; rowIndex <= end; rowIndex++) {
            let row = this.rows.get(rowIndex);
            if (!row) {
                const element = document.createElement('div');
                element.className = 'sg-virtual-row';
                element.dataset.virtualRow = rowIndex;
                element.style.gridTemplateColumns = `repeat(${this.columns}, minmax(0, 1fr))`;
                element.style.columnGap = (this.list ? 0 : this.gap) + 'px';
                element.style.marginBottom = this.gap + 'px';
                const cards = [];
                for (let index = rowIndex * this.columns; index < Math.min(this.items.length, (rowIndex + 1) * this.columns); index++) {
                    const card = this.options.mount(this.items[index], index);
                    card.dataset.galleryIndex = index;
                    card.setAttribute('aria-posinset', index + 1);
                    card.setAttribute('aria-setsize', this.items.length);
                    const rowNumber = card.querySelector('.list-col-index');
                    if (rowNumber) rowNumber.dataset.rowNumber = index + 1;
                    element.appendChild(card);
                    cards.push([index, card]);
                }
                row = {element, cards};
                this.rows.set(rowIndex, row);
                this.rowObserver.observe(element);
                this.options.observe(element.querySelectorAll('.lazy'));
            }
            if (previous.nextSibling !== row.element) previous.after(row.element);
            previous = row.element;
        }
        this.container.dataset.mountedItems = [...this.rows.values()].reduce((count, row) => count + row.cards.length, 0);
        this.container.dataset.loadedItems = this.items.length;
    }

    ensureIndex(index) {
        if (index < 0 || index >= this.items.length) return null;
        this.layout();
        const row = Math.floor(index / this.columns);
        if (!this.rows.has(row)) {
            scrollTo({top: Math.max(0, this.origin() + this.offsets[row] - innerHeight / 3), behavior: 'instant'});
            this.render();
        }
        return this.rows.get(row)?.cards.find(([itemIndex]) => itemIndex === index)?.[1] || null;
    }
}
