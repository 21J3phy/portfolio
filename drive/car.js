// The car: a downloaded glTF model, set up for the drive:
//  - origin on the ground under the car's centre, pointing +Z, real-world size
//  - wheel pivots: steerFL/steerFR (turn about Y) containing wheelFL/wheelFR; wheelRL/wheelRR (spin about X)
//  - userData.setLights({ brake }) and userData.headlightPositions
//
// The default export is Nirav's car: "2012 Honda Civic Si Coupe" by Ddiaz Design (sketchfab.com/ddiaz-design),
// CC BY-NC-SA 4.0 — the 9th-generation Civic, repainted in his car's Taffeta White.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/meshopt/meshopt_decoder.module.js';

// how this particular file is built (its material names are Spanish: rin = rim, llanta = tyre, luz = lamp)
const CIVIC = {
  url: new URL('./assets/civic.glb', import.meta.url).href,
  length: 4.47, yaw: 0,                                 // it already faces +Z; 4,473 mm is the 2012 coupe's length
  paint: { match: /^CIVIC13$/, color: 0xdcdad4 },       // the body
  wheels: /rin|llanta|disk/,                            // rims, tyres, brake discs: everything that turns with the wheel
  lamps: /^CIVIC13_luz$/,                               // head and tail lamps share one textured material
  brake: /^CIVIC13_luz2$/,                              // the tail-lamp lenses
  glass: /^glass$/,                                     // the windows
  plate: { text: 'NIRAV', y: 0.72, z: -2.098, tilt: 0.28 },   // a US plate in the trunk-lid recess, leaning back with it (the model ships without one)
};

// a 12 × 6 in plate: white with dark blue letters, faintly lit like a real plate lamp
function plate({ text, y, z, tilt }) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#1b2a5a'; g.lineWidth = 10; g.strokeRect(12, 12, 488, 232);
  g.fillStyle = '#1b2a5a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 150px Overpass, "Arial Narrow", Arial, sans-serif'; g.fillText(text, 256, 134);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.305, 0.152), new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.12 }));
  m.rotation.set(tilt, Math.PI, 0); m.position.set(0, y, z); m.name = 'plate';
  return m;
}

export default function create() { return loadCar(CIVIC); }

export async function loadCar(fit) {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(fit.url);   // geometry is meshopt-compressed (dev/tools/pack_car.mjs)
  const src = gltf.scene;
  src.rotation.y = fit.yaw || 0;
  src.updateMatrixWorld(true);

  // real size, origin under the centre, tyres on y = 0
  let box = new THREE.Box3().setFromObject(src);
  const size = box.getSize(new THREE.Vector3());
  src.scale.multiplyScalar(fit.length / Math.max(size.x, size.z)); src.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(src);
  const c = box.getCenter(new THREE.Vector3());
  src.position.x -= c.x; src.position.z -= c.z; src.position.y -= box.min.y;
  const car = new THREE.Group(); car.name = 'civic'; car.add(src);
  car.updateMatrixWorld(true);

  // wheels: sort the turning meshes into four corners, then hang each corner on a pivot at its centre
  const corners = {};
  src.traverse(o => {
    if (!o.isMesh || !fit.wheels.test(o.material?.name || '')) return;
    const b = new THREE.Box3().setFromObject(o), p = b.getCenter(new THREE.Vector3());
    const id = (p.z > 0 ? 'F' : 'R') + (p.x > 0 ? 'L' : 'R');            // +X is the driver's left when facing +Z
    (corners[id] ||= { meshes: [], box: new THREE.Box3() }).meshes.push(o); corners[id].box.union(b);
  });
  let wheelRadius = 0.31;
  for (const [id, cn] of Object.entries(corners)) {
    const centre = cn.box.getCenter(new THREE.Vector3()), dims = cn.box.getSize(new THREE.Vector3());
    wheelRadius = Math.max(dims.y, dims.z) / 2;
    const pivot = new THREE.Group(); pivot.name = id[0] === 'F' ? 'steer' + id : 'upright' + id; pivot.position.copy(centre);
    const wheel = new THREE.Group(); wheel.name = 'wheel' + id; pivot.add(wheel); car.add(pivot);
    car.updateMatrixWorld(true);
    for (const m of cn.meshes) wheel.attach(m);                             // same place in the world, now relative to the pivot
  }

  // paint and lamps; every material is this car's own copy, so tinting it touches nothing else
  const brakeMats = [];
  src.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const m = o.material, name = m?.name || '';
    // a mirror-smooth surface turns the low sun into a point far brighter than a lens would hold; glass and chrome keep a little tooth
    if (m && 'roughness' in m && !m.roughnessMap) m.roughness = Math.max(m.roughness, 0.11);
    if (fit.paint.match.test(name)) {
      // white paint under a clear coat; the file's specular is set for its orange and reads dull on white at night
      m.color.set(fit.paint.color); m.metalness = 0.0; m.roughness = 0.34; m.specularIntensity = 1; m.envMapIntensity = 1.15;
      if ('clearcoat' in m) { m.clearcoat = 1; m.clearcoatRoughness = 0.09; }
    }
    // Glass is plain tinted transparency. (The file's own glass was "transmission", which makes the renderer draw the
    // whole scene a second time every frame to refract it; behind a car window nobody can tell the difference.)
    if (fit.glass?.test(name)) { m.transparent = true; m.opacity = 0.5; m.color.set(0x05080a); m.metalness = 0; m.roughness = 0.11; m.envMapIntensity = 2; m.depthWrite = false; }
    if (fit.brake.test(name)) { m.transparent = true; m.opacity = 0.82; m.depthWrite = false; }
    if (fit.lamps.test(name) && m.map) { m.emissiveMap = m.map; m.emissive.set(0xffffff); m.emissiveIntensity = 0.08; }
    if (fit.brake.test(name)) { m.emissive.set(0xff1a0e); if (m.map) m.emissiveMap = m.map; brakeMats.push(m); }
  });
  car.userData.setLights = ({ brake = 0 } = {}) => { for (const m of brakeMats) m.emissiveIntensity = 0.5 + 7 * brake; };
  car.userData.setLights({ brake: 0 });

  const hb = new THREE.Box3().setFromObject(src), f = corners.FL?.box.getCenter(new THREE.Vector3()), r = corners.RL?.box.getCenter(new THREE.Vector3());
  if (fit.plate) car.add(plate(fit.plate));
  car.userData.headlightPositions = [[0.62, 0.72, hb.max.z - 0.28], [-0.62, 0.72, hb.max.z - 0.28]];
  car.userData.wheelRadius = wheelRadius;
  car.userData.dimensions = { length: fit.length, width: hb.max.x - hb.min.x, height: hb.max.y - hb.min.y, wheelbase: f && r ? f.z - r.z : 2.62 };
  car.userData.credit = gltf.asset?.extras || null;
  return car;
}
