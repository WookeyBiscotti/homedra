# SeedThree (adapted)

Source: https://github.com/SkyeShark/SeedThree  
License: MIT © SkyeShark (Utah Teapot) and Claudes.

The live app uses a WebGL-safe adapter in `src/landscape/seedthree.ts`:

- Species roster matches SeedThree (`src/landscape/species.ts`)
- Trees are generated with a Weber–Penn-lite / dichotomous stand-in
  (or EZ-Tree presets via `src/landscape/eztree.ts`)
- Meadow grass uses the EZ-Tree demo tuft (`public/models/landscape/grass.glb`
  + `src/landscape/ezGrass.ts`), not SeedThree crossed quads

Upstream `generate()` / `createTree()` target `three/webgpu` + TSL and cannot
drop into this project's R3F WebGL canvas (N8AO / SMAA / paint).
