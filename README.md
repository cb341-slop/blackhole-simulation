# Black Hole Simulation

An interactive, GPU-rendered exploration of black holes, naked singularities, gravitational lensing, orbits, spatial curvature, and tidal forces.

[Open the simulation](https://cb341-slop.github.io/blackhole-simulation/)

## Development

The deployed site is plain HTML, CSS, JavaScript, and static assets in `public/black-hole-simulation-static/`. It has no install or build step.

Preview it locally from the repository root:

```sh
python3 -m http.server 8000 --directory public/black-hole-simulation-static
```

Then open <http://localhost:8000>.

## Checks

Run the physics and interaction checks with Node.js:

```sh
for file in checks/*.mjs; do node "$file"; done
```

## Deployment

Pushes to `main` deploy the static directory through [GitHub Actions](.github/workflows/pages.yml). The workflow can also be run manually from the repository's **Actions** tab.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
