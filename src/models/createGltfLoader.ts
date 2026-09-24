import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { publicUrl } from '../publicUrl'

/** Local copies from three/examples/jsm/libs/draco/gltf (Vite public/). */
export const DRACO_DECODER_PATH = publicUrl('draco/gltf/')

let sharedDraco: DRACOLoader | null = null

function getDracoLoader(): DRACOLoader {
  if (!sharedDraco) {
    sharedDraco = new DRACOLoader()
    sharedDraco.setDecoderPath(DRACO_DECODER_PATH)
  }
  return sharedDraco
}

/** GLTFLoader with Draco + Meshopt — matches drei useGLTF defaults. */
export function createGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader()
  loader.setDRACOLoader(getDracoLoader())
  loader.setMeshoptDecoder(MeshoptDecoder)
  return loader
}
