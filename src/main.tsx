import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useGLTF } from '@react-three/drei'
import App from './App'
import { DRACO_DECODER_PATH } from './models/createGltfLoader'
import './index.css'

// Same local Draco path as upload / createGltfLoader (IKEA etc. use KHR_draco).
useGLTF.setDecoderPath(DRACO_DECODER_PATH)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
