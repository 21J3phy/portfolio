"""Record the D46 rows demo in a private scratch clone of MARSChair.

From the clone at SHA below, run:
    uv sync --frozen --no-dev
    .venv/bin/python /path/to/room/dev/tools/export_marsroom.py /path/to/marsroom-run.json

Each track contains absolute integer (mm, mm, mrad) triples. At sample index i,
a holds pair [i, n] repeats that triple for n *additional* ticks. The last
sample is at duration even when the last interval is shorter than 200 ms.
Only adjacent triples identical after quantization are folded.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path.cwd()
SHA = "1f76a188099e8c72216b89f81c3d2865e8281986"
sys.path[:0] = [str(ROOT), str(ROOT / "scripts")]
from acceptance_arrange import run
from models.world.arrange import ArrangeParams
from models.world.building import building_geometry


def building(params):
    walls, floors, rooms, _, doors = building_geometry(params)
    a, b, c = rooms["corridor"]
    polygon = [[a[0], a[2]], [a[1], a[2]], [b[1], c[2]], [c[1], c[2]],
               [c[1], c[3]], [c[0], c[3]], [b[0], a[3]], [a[0], a[3]]]
    return dict(rooms=rooms, corridor=polygon, walls=[w.bounds for w in walls],
                floors=[f.bounds for f in floors], doors=doors,
                doorWidths=[params.door1_width, params.door2_width])


def pack(poses):
    values, holds = [], []
    i = 0
    while i < len(poses):
        end = i + 1
        while end < len(poses) and poses[end] == poses[i]:
            end += 1
        values.extend(poses[i])
        if end > i + 1:
            holds.extend([i, end - i - 1])
        i = end
    return dict(poses=values, holds=holds)


def main(output):
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if sha != SHA:
        raise ValueError(f"Expected {SHA}, found {sha}")
    params = ArrangeParams()
    tracks = {key: [] for key in ("robot", *params.table_ids, *params.chair_ids)}
    stages = []
    last_robot = None
    times = []

    def sample(robot):
        poses = [robot.true_pose(), *(robot.true_table_pose(k) for k in params.table_ids),
                 *(robot.true_chair_pose(k) for k in params.chair_ids)]
        for track, p in zip(tracks.values(), poses, strict=True):
            track.append(tuple(round(v * 1000) for v in (p.x, p.y, p.theta)))
        times.append(round(robot.now(), 6))

    def hook(robot, stage):
        nonlocal last_robot
        last_robot = robot
        time = round(robot.now(), 6)
        if not stages or stages[-1][1] != stage:
            stages.append([time, stage])
        if not times or time >= times[0] + len(times) * 0.2 - 1e-7:
            sample(robot)

    result = run(0, "rows", "tables_first", frame_hook=hook, params=params)
    duration = result["sim_time_s"]
    if duration - times[-1] > 1e-6:
        sample(last_robot)
    meta = {k: result[k] for k in ("seed", "floor", "order", "noise_scale", "control_dt",
                                     "success", "failures", "tables", "chairs", "randomization")}
    meta.update(layout="rows", duration=duration, source="mujoco", commit=sha,
                building=building(params.building), runner="scripts/acceptance_arrange.py:run")
    data = dict(meta=meta, hz=5, first=times[0], samples=len(times), stages=stages,
                bodies={k: pack(seq) for k, seq in tracks.items()})
    output.write_text(json.dumps(data, separators=(",", ":"), allow_nan=False) + "\n")
    print(f"{len(times)} samples, {duration:.2f}s, success={result['success']}, {output.stat().st_size} bytes")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
