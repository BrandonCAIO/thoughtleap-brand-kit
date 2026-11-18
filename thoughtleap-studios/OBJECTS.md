# Studios object source and motion

## Production object

The unchanged source is under `source/`, retaining its import paths. The website entry point is `source/brand-sites/shared/mountObject.js`; call mountObject with `variant: 'studios'`. It supplies production overrides, pointer handling, collision behavior and the render loop. `source/object-atelier-v4/src/scene/createObjectScene.js` assembles the scene. `precisionGeometry.js` generates the meshes. `settings.js` defines the contract.

`presets/live-studios.json` is the resolved result of the production settings function, suitable as Remotion props. It explicitly turns off the extra bevel. The imported dependency named double-bevel-dark-stage.json remains byte-exact and must not be used by itself as the final appearance.

## Local viewer

On a development machine where dependency installation is authorized:

```sh
cd thoughtleap-studios/source/object-atelier-v4
npm ci
cd ..
object-atelier-v4/node_modules/.bin/vite --config vite.config.mjs
```

Open the localhost address printed by Vite. The viewer uses the existing Studios wrapper, with pause/resume, reset and opt-in manipulation. It is a kit inspection example, not a replacement landing page. Dependencies live under object-atelier-v4; vite.config.mjs resolves the shared Three.js imports there.

## Remotion

From `thoughtleap-studios/source/object-atelier-v4`:

```sh
npm run studio
npx remotion render src/film/index.jsx ObjectStudy ../../../exports/studios-object.mp4 --props=../../presets/live-studios.json
```

The composition is ObjectStudy, 1920 × 1080 at 60 fps. Duration comes from motionDuration in the preset (24 seconds for this snapshot). The supplied composition defaults are older generic settings: load the provided props for the Studios appearance. No video render or rendering license is included by installing the code; follow Remotion's applicable terms.

## Existing film

`media/making-960.mp4` and `media/making-640.mp4` are the actual live website encodes: 24.2 seconds, 60 fps, silent. `media/provenance.json` records hashes and dimensions. These files came from the already-existing making film, not a new render in this task.

## Parent brand

The wrapper's optional variant named ai is an earlier companion study. It is not the object currently deployed on thoughtleap.ai. The actual parent stage is separately preserved in `thoughtleap-ai/source/site/js/stage.js`.
