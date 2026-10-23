# Three.js r149 helpers

Pinned to the same r149 release as the existing `mapmaker/js/three.module.js`.
MIT license: see LICENSE in this directory.

Upstream: https://github.com/mrdoob/three.js/tree/r149/examples/jsm

- loaders/GLTFLoader.js
- utils/BufferGeometryUtils.js
- environments/RoomEnvironment.js

Local modifications replace the bare `three` imports with the existing relative
module path, update GLTFLoader's geometry-utils import to its sibling, and remove
mixed space/tab indentation from the RoomEnvironment import list.
There are no CDN requests at runtime.
