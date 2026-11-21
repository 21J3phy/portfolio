// pack_driver.mjs <in.glb> <out.glb> — thin the keyframes, webp the textures, meshopt everything
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, meshopt, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
const [src, dst] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
await doc.transform(resample({ tolerance: 0.0015 }), dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 86 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(dst, doc);
console.log(doc.getRoot().listAnimations().map(a => a.getName() + ':' + a.listChannels().length).join(' '), '|', doc.getRoot().listTextures().map(t => t.getSize()?.join('x')).join(' '));
