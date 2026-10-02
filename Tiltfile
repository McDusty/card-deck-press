# Local plugin development only; no Docker or Kubernetes resources are needed.
plugin_dir = os.path.dirname(__file__)

local_resource(
    'cardforge-deps',
    cmd=['npm', 'ci'],
    dir=plugin_dir,
    deps=[os.path.join(plugin_dir, path) for path in ['package.json', 'package-lock.json']],
    labels=['cardforge'],
)

# Tilt owns file watching and rebuilds. Use a plain preview, not another watcher.
local_resource(
    'cardforge',
    cmd=['npm', 'run', 'build'],
    serve_cmd=['npm', 'exec', '--', 'vite', 'preview'],
    dir=plugin_dir,
    serve_dir=plugin_dir,
    resource_deps=['cardforge-deps'],
    deps=[os.path.join(plugin_dir, path) for path in [
        'src',
        'public',
        'index.html',
        'vite.config.ts',
        'tsconfig.json',
        'package.json',
        'package-lock.json',
    ]],
    readiness_probe=probe(
        http_get=http_get_action(port=4400, host='localhost', path='/manifest.json'),
        period_secs=2,
        timeout_secs=2,
    ),
    links=[
        link('http://localhost:4400/manifest.json', 'Install in Penpot'),
        link('http://localhost:4400/', 'Plugin preview'),
    ],
    labels=['cardforge'],
)
