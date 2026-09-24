/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { apiProxies, assetProxyPlugin } from './vite.proxy.ts'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), assetProxyPlugin()],
  resolve: {
    alias: {
      math: path.resolve(root, 'vendor/jsketcher/math'),
      gems: path.resolve(root, 'vendor/jsketcher/gems'),
      'jsketcher/constr': path.resolve(root, 'vendor/jsketcher/constr'),
    },
  },
  optimizeDeps: {
    include: ['numeric'],
  },
  server: {
    proxy: apiProxies,
  },
  preview: {
    proxy: apiProxies,
  },
  test: {
    environment: 'node',
  },
})
