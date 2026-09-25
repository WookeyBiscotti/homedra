# SeedThree (adapted)

Source: https://github.com/SkyeShark/SeedThree  
License: MIT © SkyeShark (Utah Teapot) and Claudes.

The live app uses a WebGL-safe adapter in `src/landscape/seedthree.ts`:

- Species roster matches SeedThree (`src/landscape/species.ts`)
- Trees are generated with a Weber–Penn-lite / dichotomous stand-in
- Grass tufts follow `src/core/grass.js` (crossed quads, instancing)

Upstream `generate()` / `createTree()` target `three/webgpu` + TSL and cannot
drop into this project's R3F WebGL canvas (N8AO / SMAA / paint).
