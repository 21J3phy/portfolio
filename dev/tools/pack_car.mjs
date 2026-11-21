// pack.mjs <in.glb> <out.glb> — strip transmission (the page uses plain transparency), webp the textures, meshopt the geometry
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsTransmission } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, meshopt, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
const [src, dst, level = 'medium'] = process.argv.slice(2);
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
for (const m of doc.getRoot().listMaterials()) { if (m.getExtension('KHR_materials_transmission')) { console.log('transmission off:', m.getName()); m.setExtension('KHR_materials_transmission', null); } }
for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'KHR_materials_transmission') e.dispose();
await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 86 }), meshopt({ encoder: MeshoptEncoder, level }));
await io.write(dst, doc);
console.log(doc.getRoot().listTextures().length, 'textures', doc.getRoot().listMaterials().map(m => m.getName()).join(','));
