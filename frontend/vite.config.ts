import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [react(), tailwindcss()]

  if (command === 'serve') {
    const { TanStackRouterVite } = await import('@tanstack/router-vite-plugin')
    const routerPlugins = TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    })
    plugins.push(...(Array.isArray(routerPlugins) ? routerPlugins : [routerPlugins]))
  }

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
