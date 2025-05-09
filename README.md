Wanderworld - Infinite Procedural Generation
-- Three.js, Rapier.js
-- Chunk Based Rendering
--

> Basic WASD controls and camera movement with pointer lock (click to lock mouse in window, 'esc' to exit)

>'R' to sprint (can change 'SPRINT_SPEED' constant at top of utils.js)
note: sometimes if character velocity is too high with high 'SPRINT_SPEED' values you will go through the colliders in the physics engine and can end up under the map or stuck inside the terrain.


> 'Space' to jump (can hold space to continously jump and keep flying to travel around faster)

> 'G' to wave (built-in animation in character model)

Other Options

In terrain.js:

> can use Three.js Water object for better graphics and reflections (worse performance)

> can use static texture on terrain meshes for better performance and visual shadows present (single texture for all meshes)





