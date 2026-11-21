"""Record the RASC-AL demo with the source repo's locked Python 3.12 environment.

From the cloned rasc-al directory: uv sync --frozen, then run
uv run --frozen python /absolute/site/room/dev/tools/export_hopper.py
The source revision is recorded from that checkout. No CAD export or GL needed.
"""
import json
import math
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path.cwd()))
import mujoco
import numpy as np
from hopper.demo import feet_in_body, glide, restep, run
from hopper.jump import jump_trial
from hopper.params import ASM, Design
from hopper.rover import Rover
from hopper.sizing import size
from hopper.walk import Walker, gait_speed

FPS = 30
OUT = Path(__file__).resolve().parents[2] / "data/hopper-run.json"


def main():
    sized = size(Design(6, 600, 8))
    rv = Rover(sized, timestep=0.0005)
    names = [rv.model.joint(i).name for i in range(1, rv.model.njnt)]
    times, poses, contacts, phases = [], [], [], []
    flight = landing = caught = None
    monitor_jump = False

    def mark(label):
        phases.append(dict(t=round(rv.t, 6), label=label))

    def record(rv):
        nonlocal flight, landing, caught
        flags = rv.foot_contact()
        times.append(rv.t)
        poses.append(rv.data.qpos.copy())
        contacts.append(sum(1 << i for i in np.flatnonzero(flags)))
        if monitor_jump:
            if flight is None and not rv.locked.any() and not flags.any() and (rv.plunger > rv.geo.stroke - 0.005).all():
                flight = rv.t
                mark("Flight")
            elif flight is not None and landing is None and rv.t - flight > 0.3 and flags.any():
                landing = rv.t
                mark("Touchdown")
            elif landing is not None and caught is None and rv.locked.all():
                caught = rv.t
                mark("Landing, springs re-caught")

    mark("Walking, tripod gait")
    record(rv)
    walker = Walker(rv, "alt", gait_speed(rv.n, "alt"))
    run(rv, record, 5.0, lambda _: rv.set_q(rv.ik(walker.targets(rv.t))))
    speed = float(rv.pos[0] / rv.t)
    mark("Stopping")
    nom = rv.nominal_feet()
    cur = feet_in_body(rv)
    cur[:, 2] = nom[:, 2]
    restep(rv, record, cur, nom, 0.7)
    mark("Crouching, springs latched")
    tilt = math.radians(ASM.jump_tilt_deg)
    strut = rv.strut_feet(np.array([math.sin(tilt), 0, math.cos(tilt)]))
    under = strut.copy()
    under[:, 2] = nom[:, 2]
    restep(rv, record, nom, under, 0.9)
    glide(rv, record, under, strut, 1.6)
    monitor_jump = True
    result = jump_trial(sized, rv=rv, frame_cb=record, settle=0.8)
    if not result["ok"] or caught is None:
        raise RuntimeError(result)
    monitor_jump = False
    mark("Settling")
    q0, hold = rv.plunger.copy(), rv.data.ctrl.copy()

    def wind(a):
        rv.set_q(hold)
        rv.lock(np.arange(rv.n), True, target=q0 * (1 - min(1, a)))

    run(rv, record, 3.0, wind)
    rv.lock(np.arange(rv.n), True, target=0)
    run(rv, record, 0.6, lambda _: rv.set_q(hold))
    # Interpolate controller callbacks onto an exact 30 Hz simulation timeline.
    grid = np.arange(math.floor(rv.t * FPS) + 1) / FPS
    poses = np.array(poses)
    frames = np.array([np.interp(grid, times, col) for col in poses.T]).T
    # Sign-continuous, near-identical quaternions across each 2-4 ms interval.
    frames[:, 3:7] /= np.linalg.norm(frames[:, 3:7], axis=1)[:, None]
    quantized = np.rint(frames * 10000).astype(int)
    nearest = np.searchsorted((np.array(times[1:]) + times[:-1]) / 2, grid)
    meta = dict(source="mujoco", design=sized.design.tag, gravity=rv.model.opt.gravity.tolist(),
                commit=subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
                mujocoVersion=mujoco.__version__, fps=FPS, timestep=rv.model.opt.timestep,
                duration=grid[-1], walkingSpeed=speed, jumpDistance=result["rng"],
                apexHeight=result["apex"], apexReference="torso rise above pre-release height",
                legsCaught=result["legs_caught"], phases=phases, jointOrder=names,
                jointAxes=[rv.model.joint(n).axis.tolist() for n in names],
                hipZ=sized.z_hip, scale=0.0001, quaternionOrder="wxyz",
                coordinates="MuJoCo +X forward, +Z up; contacts bit i = pad i")
    data = dict(source="mujoco", meta=meta, position=quantized[:, :3].ravel().tolist(),
                quaternion=quantized[:, 3:7].ravel().tolist(),
                joints=quantized[:, 7:].ravel().tolist(), contacts=np.array(contacts, int)[nearest].tolist())
    OUT.write_text(json.dumps(data, separators=(",", ":"), allow_nan=False) + "\n")
    print(meta, OUT.stat().st_size)


if __name__ == "__main__":
    main()
