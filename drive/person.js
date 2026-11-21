// The driver: a rigged figure whose body agrees with what he is doing: sitting at the wheel, standing and looking,
// walking, running. The page moves him (drive/main.js); this picks and paces the motion.
//
// The figure and every motion are from Microsoft's Rocketbox avatar library (MIT licence): avatar Male_Adult_17 with
// eight of its recorded takes. dev/tools/convert_driver.html turns the FBX files into glTF in a browser and
// dev/tools/pack_driver.mjs compresses the result.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/meshopt/meshopt_decoder.module.js';

const WALK = 1.40, RUN = 3.08;   // m/s at which each recorded cycle's feet don't slide

export async function loadPerson() {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(new URL('./assets/driver.glb', import.meta.url).href);
  const fig = gltf.scene, group = new THREE.Group(); group.name = 'driver'; group.add(fig);
  fig.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;   // (a skinned mesh's bounds are its rest pose, which is not where he is sitting)
    const m = o.material; if (m && 'envMapIntensity' in m) { m.envMapIntensity = 0.8; if (!m.roughnessMap) m.roughness = Math.max(m.roughness, 0.55); }
  });
  const mixer = new THREE.AnimationMixer(fig), act = {};
  for (const clip of gltf.animations) { const a = mixer.clipAction(clip); a.play(); a.setEffectiveWeight(0); act[clip.name] = a; }
  const w = { sit: 1, idle: 0, look: 0, think: 0, crouch: 0, inspect: 0, walk: 0, run: 0 }, state = { sit: 1, speed: 0, phase: 0, still: 0 };
  const dur = n => act[n]?.getClip().duration || 1;
  const api = {
    group, fig, state, height: 1.81,
    /** sit: 0..1 (1 = seated); speed: m/s over the ground; study: 0..1, he is looking something over; down: 0..1, he is crouched to it. Returns footfalls since the last call. */
    update(dt, sit, speed, study = 0, still = dt, down = 0) {   // `still`: how much time has passed for his standing and sitting motions
      state.sit = sit; state.speed = speed; state.still = speed < 0.05 && sit < 0.5 ? state.still + still : 0;
      const moving = THREE.MathUtils.smoothstep(speed, 0.08, 0.5), running = THREE.MathUtils.smoothstep(speed, 2.0, 2.9), up = 1 - sit, rest = up * (1 - moving);
      // standing still he alternates between looking it over with a hand at his chin and glancing around
      const turn = Math.floor(state.still / dur('think')) % 2 === 0 ? 'think' : 'look';
      // crouched, he mostly just looks, and now and then points something out to himself
      const low = rest * down, high = rest * (1 - down), busy = Math.floor(state.still / dur('crouch')) % 3 === 1 ? 1 : 0;
      const want = { sit, idle: high * (1 - study), think: high * study * (turn === 'think' ? 1 : 0), look: high * study * (turn === 'look' ? 1 : 0), crouch: low * (1 - busy), inspect: low * busy, walk: up * moving * (1 - running), run: up * moving * running }, k = 1 - Math.exp(-dt * 7);
      for (const n in w) { w[n] += (want[n] - w[n]) * k; act[n]?.setEffectiveWeight(w[n]); }
      // one shared stride phase, so walk and run blend foot for foot and the cycle keeps pace with the ground
      const cycles = dt * (speed <= 0.01 ? 0 : THREE.MathUtils.lerp(speed / WALK / dur('walk'), speed / RUN / dur('run'), running));
      const before = Math.floor(state.phase * 2); state.phase += cycles; const steps = Math.max(0, Math.floor(state.phase * 2) - before);
      if (act.walk) act.walk.time = (state.phase % 1) * dur('walk');
      if (act.run) act.run.time = (state.phase % 1) * dur('run');
      for (const n of ['idle', 'look', 'think', 'sit', 'crouch', 'inspect']) if (act[n]) act[n].time = (act[n].time + still) % dur(n);
      mixer.update(0);
      return steps;
    },
  };
  api.update(0, 1, 0);
  return api;
}
