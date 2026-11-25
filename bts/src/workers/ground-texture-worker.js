// Ground textures for a baked campus ground (src/engine/ground-bake.js): the ten 512x512 synthetic tiles of
// src/ground-materials.js, computed here while the campus models download and transferred back as bytes.
// Same pure function as the main thread uses, so the bytes are the same.
import { GROUND_TEXTURES, groundTexturePixels } from '../ground-materials.js?v=realism14';

self.onmessage = () => {
  const pixels = {}, transfer = [];
  for (const t of GROUND_TEXTURES) { const data = groundTexturePixels(t.kind, t.height); pixels[t.name] = data; transfer.push(data.buffer); }
  self.postMessage({ pixels }, transfer);
};
