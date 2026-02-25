export class SpatialHashGrid {
    constructor(bounds, cellSize) {
        this.bounds = bounds;
        this.cellSize = cellSize;
        this.cells = new Map();
    }

    _key(v) {
        const x = Math.floor(v.x / this.cellSize);
        const y = Math.floor(v.y / this.cellSize);
        const z = Math.floor(v.z / this.cellSize);
        return `${x},${y},${z}`;
    }

    clear() {
        this.cells.clear();
    }

    add(obj) {
        const key = this._key(obj.position);
        if (!this.cells.has(key)) {
            this.cells.set(key, []);
        }
        this.cells.get(key).push(obj);
    }

    getNearby(v, radius) {
        const results = [];
        const cellsToCheck = Math.ceil(radius / this.cellSize);
        const center_x = Math.floor(v.x / this.cellSize);
        const center_y = Math.floor(v.y / this.cellSize);
        const center_z = Math.floor(v.z / this.cellSize);

        for (let x = center_x - cellsToCheck; x <= center_x + cellsToCheck; x++) {
            for (let y = center_y - cellsToCheck; y <= center_y + cellsToCheck; y++) {
                for (let z = center_z - cellsToCheck; z <= center_z + cellsToCheck; z++) {
                    const key = `${x},${y},${z}`;
                    const cell = this.cells.get(key);
                    if (cell) {
                        results.push(...cell);
                    }
                }
            }
        }
        return results;
    }
}
