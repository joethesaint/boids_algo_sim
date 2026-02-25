export function setupUI(params, callbacks) {
    // Behavior controls
    document.getElementById('separation').addEventListener('input', (e) => {
        params.forces.separation = parseFloat(e.target.value);
        document.getElementById('separation-value').textContent = e.target.value;
    });
    
    document.getElementById('alignment').addEventListener('input', (e) => {
        params.forces.alignment = parseFloat(e.target.value);
        document.getElementById('alignment-value').textContent = e.target.value;
    });
    
    document.getElementById('cohesion').addEventListener('input', (e) => {
        params.forces.cohesion = parseFloat(e.target.value);
        document.getElementById('cohesion-value').textContent = e.target.value;
    });
    
    document.getElementById('avoidance').addEventListener('input', (e) => {
        params.forces.avoidance = parseFloat(e.target.value);
        document.getElementById('avoidance-value').textContent = e.target.value;
    });
    
    document.getElementById('fear').addEventListener('input', (e) => {
        params.forces.fear = parseFloat(e.target.value);
        document.getElementById('fear-value').textContent = e.target.value;
    });
    
    document.getElementById('food-attraction').addEventListener('input', (e) => {
        params.forces.foodAttraction = parseFloat(e.target.value);
        document.getElementById('food-attraction-value').textContent = e.target.value;
    });
    
    // Ecosystem controls
    document.getElementById('small-fish').addEventListener('input', (e) => {
        params.boidTypes.smallFishRatio = parseFloat(e.target.value) / 100;
        document.getElementById('small-fish-value').textContent = e.target.value;
    });
    
    document.getElementById('large-fish').addEventListener('input', (e) => {
        params.boidTypes.largeFishRatio = parseFloat(e.target.value) / 100;
        document.getElementById('large-fish-value').textContent = e.target.value;
    });
    
    document.getElementById('birds').addEventListener('input', (e) => {
        params.boidTypes.birdRatio = parseFloat(e.target.value) / 100;
        document.getElementById('birds-value').textContent = e.target.value;
    });
    
    document.getElementById('predator-count').addEventListener('input', (e) => {
        const newCount = parseInt(e.target.value);
        document.getElementById('predator-count-value').textContent = e.target.value;
        callbacks.onPredatorCountChange(newCount);
    });
    
    document.getElementById('food-count').addEventListener('input', (e) => {
        const newCount = parseInt(e.target.value);
        document.getElementById('food-count-value').textContent = e.target.value;
        callbacks.onFoodCountChange(newCount);
    });
    
    document.getElementById('food-spawn').addEventListener('input', (e) => {
        params.food.spawnRate = parseFloat(e.target.value);
        document.getElementById('food-spawn-value').textContent = e.target.value;
    });
    
    // Lighting controls
    document.getElementById('ambient').addEventListener('input', (e) => {
        params.lighting.ambient = parseFloat(e.target.value);
        document.getElementById('ambient-value').textContent = e.target.value;
        callbacks.onLightingChange();
    });
    
    document.getElementById('directional').addEventListener('input', (e) => {
        params.lighting.directional = parseFloat(e.target.value);
        document.getElementById('directional-value').textContent = e.target.value;
        callbacks.onLightingChange();
    });
    
    document.getElementById('edge').addEventListener('input', (e) => {
        params.lighting.edge = parseFloat(e.target.value);
        document.getElementById('edge-value').textContent = e.target.value;
        callbacks.onLightingChange();
    });
    
    // Buttons
    document.getElementById('pauseResume').addEventListener('click', function() {
        const isPaused = callbacks.onTogglePause();
        this.textContent = isPaused ? 'Resume' : 'Pause';
    });
    
    document.getElementById('reset').addEventListener('click', () => {
        callbacks.onReset();
        document.getElementById('pauseResume').textContent = 'Pause';
        document.getElementById('fps-view').textContent = 'Follow Random Boid';
        document.getElementById('fps-view').classList.remove('active');
    });
    
    document.getElementById('fps-view').addEventListener('click', function() {
        const isFollowing = callbacks.onToggleFollow();
        if (isFollowing) {
            this.textContent = 'Stop Following';
            this.classList.add('active');
        } else {
            this.textContent = 'Follow Random Boid';
            this.classList.remove('active');
        }
    });
    
    document.getElementById('addBoids').addEventListener('click', () => callbacks.onAddBoids(10));
    document.getElementById('removeBoids').addEventListener('click', () => callbacks.onRemoveBoids(10));

    // Global toggleSection for headers
    window.toggleSection = function(header) {
        const content = header.nextElementSibling;
        const arrow = header.querySelector('.arrow');
        header.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
        arrow.textContent = content.classList.contains('collapsed') ? '▼' : '▲';
    };
}

export function updateStats(boidCount, stats, fps) {
    document.getElementById('boidCount').textContent = 
        `${boidCount} (🐟${stats.smallFish} 🐠${stats.largeFish} 🐦${stats.birds})`;
    document.getElementById('fps').textContent = Math.floor(fps);
}
