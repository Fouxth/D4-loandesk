import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(async () => {
  const { TanStackRouterVite } = await import('@tanstack/router-vite-plugin')
  const routerPlugins = TanStackRouterVite({
    routesDirectory: './src/routes',
    generatedRouteTree: './src/routeTree.gen.ts',
  })

  const plugins: PluginOption[] = [
    ...(Array.isArray(routerPlugins) ? routerPlugins : [routerPlugins]),
    react(),
    tailwindcss(),
  ]

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:9876',
          changeOrigin: true,
        },
      },
    },
  }
})
