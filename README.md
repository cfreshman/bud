# bud

procedural plant-life simulation with AI companions. each bud's personality emerges from its physical form and interactions.

## technical approach

### bone system
- hierarchical bones that can attach anywhere along parent bones
- physically reacts to mouse movement or wind in the scene
- able to resize bone width, length
- set attributes like color / material. these are inherited until overridden (e.g. thorn will have color set)

### rendering / simulation
- three.js for 3D visualization
- independent game engine decoupled from react UI

### ai personality
- traits influenced by physical attributes (thorny = prickly, flowery = friendly)
- conversation history shapes personality - so traits can change over time
- openai api for natural dialogue

## stack
- typescript
- three.js
- react
- node/express
- mongodb