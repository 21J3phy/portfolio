import { THREE, Builder, box, cyl, extrude, lathe, defineMaterial } from './kit.js';

const PI = Math.PI, TAU = 2 * PI;
const WHEEL_RADIUS = .0603, TRACK_WIDTH = .37476, FLOOR_OFFSET = .004975;
const v = p => new THREE.Vector3(...p);
defineMaterial('marsroom:estop', () => new THREE.MeshStandardMaterial({color:0xb82e24, roughness:.38}));

function block(b, size, material, position, r = 0.001, rotation) {
  b.add(box(...size, Math.min(...size) <= .002 ? 0 : r, 1), material, { position, rotation });
}
function axial(b, radius, length, material, position, axis = [0, 1, 0], segments = 24) {
  const g = cyl(radius, radius, length, segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v([0, 1, 0]), v(axis)));
  b.add(g, material, { position });
}
function bolt(b, p, axis = [0, 1, 0], r = 0.003) {
  axial(b, r * 1.4, 0.0007, 'aluminumDark', p, axis, 8);
  axial(b, r, 0.002, 'aluminum', v(p).addScaledVector(v(axis), 0.001).toArray(), axis, 6);
  axial(b, r * 0.42, 0.0002, 'blackMetal', v(p).addScaledVector(v(axis), 0.0021).toArray(), axis, 6);
}
function polygon(points) {
  const s = new THREE.Shape(); s.moveTo(...points[0]);
  for (const p of points.slice(1)) s.lineTo(...p);
  s.closePath(); return s;
}
function freightOutline(scale = 1) {
  const s = new THREE.Shape();
  s.moveTo(-.150, -.284); s.bezierCurveTo(-.222, -.284, -.264, -.211, -.264, -.122);
  s.lineTo(-.264, .048); s.bezierCurveTo(-.264, .182, -.160, .2864, 0, .2864);
  s.bezierCurveTo(.160, .2864, .264, .182, .264, .048);
  s.lineTo(.264, -.122); s.bezierCurveTo(.264, -.211, .222, -.284, .150, -.284);
  s.lineTo(-.150, -.284); s.closePath();
  if (scale === 1) return s;
  return new THREE.Shape(s.getPoints(12).map(p => p.multiplyScalar(scale)));
}
function shellLayer(b, bottom, height, scale, material, bevel) {
  // Shape XY represents width/forward; rotate extrusion to world +Y.
  const g = extrude(freightOutline(scale), height, bevel);
  g.rotateX(PI / 2); // shape +Y -> +Z, depth -> -Y (centred, symmetric).
  b.add(g, material, { position: [0, bottom + height / 2 + FLOOR_OFFSET, 0] });
}
function freight(b) {
  // Underbody leaves rolling surfaces exposed; broad round-sided shell above.
  shellLayer(b, .070, .169, .99, 'freightGrey', .004);
  shellLayer(b, .242, .023, 1, 'freightGrey', .002);
  shellLayer(b, .268, .036, .965, 'blackMetal', .0015);
  shellLayer(b, .307, .037, 1, 'freightGrey', .003);
  shellLayer(b, .347, .010, .978, 'aluminumDark', .0015);
  shellLayer(b, .057, .013, .955, 'blackMetal', .001);
  // Scanning aperture, with a real inset SICK sensor and two status lenses.
  block(b, [.106, .036, .027], 'blackMetal', [0, .292775, .261], .005);
  block(b, [.067, .024, .027], 'rubber', [0, .292775, .276], .005);
  block(b, [.049, .004, .004], 'aluminumDark', [0, .312, .273], .001);
  for (const x of [-.039, .039]) bolt(b, [x, .315, .273], [0, 0, 1], .0015);
  // Access panel, hinge, connector recess and cooling louvers at rear.
  block(b, [.213, .135, .002], 'blackMetal', [0, .172, -.2835], .008);
  block(b, [.201, .122, .003], 'freightGrey', [0, .172, -.285], .006);
  for (const x of [-.086, .086]) for (const y of [.123, .222]) bolt(b, [x, y, -.287], [0, 0, -1], .0022);
  for (let i = 0; i < 6; i++) block(b, [.089, .004, .002], 'blackMetal', [0, .147 + .009*i, -.287], .001);
  block(b, [.062, .019, .005], 'blackMetal', [0, .221, -.287], .002);
  block(b, [.025, .008, .005], 'aluminumDark', [0, .221, -.290], .001);
  for (const s of [-1, 1]) {
    block(b, [.002, .136, .0015], 'blackMetal', [s * .261, .170, -.091], 0);
    for (const y of [.095, .229]) bolt(b, [s*.263, y, -.104], [s, 0, 0], .002);
  }
  // Rear LEFT mushroom switch: axis outward along +X, per Fetch URDF.
  axial(b, .021, .006, 'aluminumDark', [.261, .316245, -.12465], [1, 0, 0]);
  axial(b, .011, .012, 'blackMetal', [.268, .316245, -.12465], [1, 0, 0]);
  const cap = lathe([[0, -.008], [.013, -.008], [.018, -.004], [.019, .003], [.016, .008], [0, .009]], 24);
  cap.rotateZ(-PI / 2);
  b.add(cap, 'marsroom:estop', { position: [.281, .316245, -.12465] });
  // Four small passive casters; no invented steering actuators.
  for (const x of [-.118, .118]) for (const z of [-.210, .166]) {
    axial(b, .035, .022, 'rubber', [x, .035, z], [1, 0, 0], 20);
    for (const dx of [-.014, .014]) block(b, [.003, .041, .027], 'aluminumDark', [x + dx, .052, z], .002);
    axial(b, .009, .031, 'aluminum', [x, .035, z], [1, 0, 0], 12);
  }
  for (const s of [-1, 1]) {
    const x = s * TRACK_WIDTH / 2, y = WHEEL_RADIUS, z = .0012914;
    const tire = lathe([[.036, -.024], [.052, -.023], [.058, -.017], [WHEEL_RADIUS, -.008],
      [WHEEL_RADIUS, .008], [.058, .017], [.052, .023], [.036, .024]], 40);
    tire.rotateZ(PI / 2); b.add(tire, 'rubber', {position:[x,y,z]});
    axial(b,.039,.048,'aluminumDark',[x,y,z],[1,0,0],24);
    axial(b,.027,.003,'aluminum',[x+s*.025,y,z],[1,0,0]);
    for (let i=0;i<24;i++) {
      const a=i*TAU/24;
      block(b,[.023,.0012,.003],'rubber',[x,y+.0598*Math.cos(a),z+.0598*Math.sin(a)],0,[a,0,.2*s]);
    }
  }
}

// Attachment dimensions are in the production drawing's base_link coordinates
// (forward, left, up), millimetres. The chassis deck is 358.9 mm above base_link.
const cadVector = ([forward,left,up]) => v([left,up,forward]);
const cadPoint = p => cadVector(p).multiplyScalar(.001).add(v([0,FLOOR_OFFSET,0]));
function cadAxis(axis) {
  const unit = [0,0,0];
  unit[Math.abs(axis)-1] = Math.sign(axis);
  return cadVector(unit);
}

// Extrude a dimensioned outline in any principal plane. Use a right-handed
// local frame even on the opposite side, keeping normals and hole winding.
function solid(b, origin, u, w, normal, outline, depth, material, holes=[]) {
  const x=cadAxis(u), n=cadAxis(normal), y=n.clone().cross(x);
  const sign=y.dot(cadAxis(w));
  const shape=polygon(outline.map(([a,c])=>[a*.001,sign*c*.001]));
  for (const [a,c,r] of holes) {
    const path=new THREE.Path();
    path.absarc(a*.001,sign*c*.001,r*.001,0,TAU,true);
    shape.holes.push(path);
  }
  const g=new THREE.ExtrudeGeometry(shape,{depth:depth*.001,bevelEnabled:false,curveSegments:4});
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x,y,n));
  b.add(g,material,{position:cadPoint(origin).toArray()});
}

function stock(b, start, axis, length, width=40, height=40) {
  // Four lipped slots, or six on a double-width post. The end bore and
  // undercut are visible from the ends and catch highlights along each lip.
  const perimeter=[];
  for (let side=0;side<4;side++) {
    const span=side%2 ? height : width, deep=(side%2 ? width : height)/2;
    const edge=[[-span/2,-deep]];
    const pitch=Math.min(40,width,height), k=pitch/40;
    for (let mid=(-span+pitch)/2;mid<span/2;mid+=pitch) {
      for (const [dx,dy] of [[-4.1,0],[-4.1,3],[-7.2,3],[-7.2,9],[-3.7,12.6],
                             [3.7,12.6],[7.2,9],[7.2,3],[4.1,3],[4.1,0]]) {
        edge.push([mid+dx*k,-deep+dy*k]);
      }
    }
    for (const [x,y] of edge) {
      perimeter.push([[x,y],[-y,x],[-x,-y],[y,-x]][side]);
    }
  }
  const u=axis===2 ? 3 : axis===3 ? 1 : 2;
  const w=axis===2 ? 1 : axis===3 ? 2 : 3;
  const holes=width===80 ? [[-20,0,3.4],[20,0,3.4]] : [[0,0,width===20 ? 2.4 : 3.4]];
  solid(b,start,u,w,axis,perimeter,length,'extrusion',holes);
}

const rect=(a,c)=>[[0,0],[a,0],[a,c],[0,c]];
const plates={
  tee: [[[0,0],[120,0],[120,40],[80,120],[40,120],[0,40]],[[20,20],[60,20],[100,20],[60,60],[60,100]]],
  corner: [[[0,0],[120,0],[120,40],[40,120],[0,120]],[[20,20],[60,20],[100,20],[20,60],[20,100]]],
  wing: [[[0,0],[80,0],[80,40],[40,120],[0,120]],[[20,20],[60,20],[20,60],[20,100]]],
  six: [rect(120,80),[[20,20],[60,20],[100,20],[20,60],[60,60],[100,60]]],
  two: [rect(80,39.8),[[20,19.9],[60,19.9]]],
  three: [rect(120,39.8),[[20,19.9],[60,19.9],[100,19.9]]],
};
function screw(b, face, normal, small=false) {
  const at=d=>face.clone().addScaledVector(normal,d).toArray(), axis=normal.toArray();
  const r=small?.0043:.0068;
  axial(b,r*1.43,.0015,'aluminumDark',at(.00075),axis,10);
  axial(b,r,.005,'blackMetal',at(.004),axis,10);
  axial(b,r*.44,.00035,'rubber',at(.00665),axis,6);
}
function plate(b, type, origin, u,w,n, count=Infinity) {
  const [outline,holes]=plates[type];
  solid(b,origin,u,w,n,outline,6,'aluminum',holes.map(([x,y])=>[x,y,4.15]));
  for (const [x,y] of holes.slice(0,count)) {
    const top=cadPoint(origin).addScaledVector(cadAxis(n),.006)
        .addScaledVector(cadAxis(u),x*.001).addScaledVector(cadAxis(w),y*.001);
    screw(b,top,cadAxis(n));
  }
}
function bracket(b,x,y,z,s) {
  solid(b,[x-18,y,z],s*2,3,1,[[0,0],[40,0],[40,6],[6,6],[6,40],[0,40]],36,'aluminum');
  screw(b,cadPoint([x,y+s*20,z+6]),cadAxis(3),true);
  screw(b,cadPoint([x,y+s*6,z+20]),cadAxis(s*2),true);
}
function attachment(b) {
  const orange='printOrange', c=93.8;
  stock(b,[316.2,-277,c],2,554);
  stock(b,[595.95,-170,145.8],2,340);
  // Socket with twin recessed bolt wells and the aluminium-backed skin.
  solid(b,[556,-60,165.8],1,2,3,rect(59.95,120),80,orange,[[39.95,20,12.5],[39.95,100,12.5]]);
  stock(b,[555.9,0,223.6],1,160,20,40);
  solid(b,[615.95,0,201.8],1,2,3,[[0,-17.45],[2,-13],[6,-11.45],[104,-11.45],
    [104,11.45],[6,11.45],[2,13],[0,17.45]],44,orange);
  for (const s of [-1,1]) {
    const side=s*2, inward=-side;
    stock(b,[-240,s*190,378.9],1,370);
    stock(b,[50,s===1?210:-317,378.9],2,107);
    stock(b,[50,s*297,55],3,303.9);
    stock(b,[70,s*297,c],1,418.8);
    stock(b,[336.2,s*80,113.8],3,115,80,40);
    stock(b,[376.2,s*80,145.8],1,199.75);
    stock(b,[465,s*80,185.8],1,150.95);
    stock(b,[465,s*80,225.8],1,315);
    for (let x=-200;x<=100;x+=50) bracket(b,x,s*170,358.9,-s);
    bracket(b,316.2,s*100,113.8,s);
    bracket(b,316.2,s*60,113.8,-s);
    plate(b,'tee',[-10,s*170,398.9],1,side,3);
    plate(b,'three',[30,s*277.1,398.9],-3,side,-1);
    plate(b,'corner',[30,s*317,73.8],1,3,side);
    for (const n of [-1,1]) plate(b,'corner',[336.2,s*317,c+n*20],-1,inward,n*3);
    plate(b,'wing',[615.95,s*100,125.8],inward,-1,-3);
    for (const [y,n] of [[100,side],[60,inward]]) {
      plate(b,'six',[336.2,s*y,125.8],1,3,n,4);
      plate(b,'six',[475,s*y,125.8],3,1,n);
    }
    plate(b,'two',[576.05,s*100,165.8],3,1,side);
    // Five printed shapes, nine pieces: handed pairs except the tongue.
    const gussetHoles=[[245,378.9],[297,378.9],[297,338.9],[297,298.9]];
    solid(b,[70,0,0],side,3,1,[[225,398.9],[317,398.9],[317,278.9],[277,278.9],
      [277,350.9],[269,358.9],[225,358.9]],18,orange,gussetHoles.map(([x,y])=>[x,y,12.5]));
    for(const [y,z] of gussetHoles) screw(b,cadPoint([76,y*s,z]),cadAxis(1));
    solid(b,[615.95,0,75.8],side,3,1,rect(169.95,83),19.05,orange,[[40,70,12.5],[130,70,12.5]]);
    for(const y of [40,130]) screw(b,cadPoint([621.95,y*s,145.8]),cadAxis(1));
    // Open-topped fork sleeve, 4 mm sole, 8 mm wear face, filled flare root.
    solid(b,[615.95,0,201.8],1,side,3,[[0,52],[164.3,52],[244.05,100],[231.2,121.4],
      [205.7,106],[0,106]],4,orange);
    solid(b,[615.95,0,205.8],1,side,3,[[0,52],[164.3,52],[244.05,100],[231.2,121.4],
      [205.7,106],[0,106],[0,100.05],[164.3,100.05],[164.3,59.95],[0,59.95]],40,orange);
    for(const x of [650,710,760]) screw(b,cadPoint([x,s*106,225.8]),cadAxis(side));
    // Cradle mouth with mitered nose, outside sleeve and 8 mm hold-down strap.
    solid(b,[0,0,73.8],1,side,3,[[416.2,317],[488.8,317],[488.8,277],
      [549.3,293.2],[539,331.8],[521,327],[416.2,327]],40,orange);
    solid(b,[416.2,s*277,113.8],1,side,3,rect(73,50),8,orange);
    for(const x of [436,466]) screw(b,cadPoint([x,s*297,121.8]),cadAxis(3));
    for(const x of [432,460]) screw(b,cadPoint([x,s*327,93.8]),cadAxis(side));
    screw(b,cadPoint([595.95,s*40,171.8]),cadAxis(3));
  }
}
function finished(b) {
  const group=b.build(), bounds=new THREE.Box3().setFromObject(group);
  const centre=bounds.getCenter(new THREE.Vector3());
  for(const child of group.children) child.position.sub(v([centre.x,bounds.min.y,centre.z]));
  group.userData.size=bounds.getSize(new THREE.Vector3()).toArray();
  return group;
}
export function createFreight() {
  const b=new Builder('MARSChair Freight');
  freight(b);
  attachment(b);
  return finished(b);
}
export default createFreight;

// ---------------------------------------------------------------- the furniture, full size
// Modelled from the dimensions in the project's notes (docs/real_furniture.md): no maker's CAD is used here.
defineMaterial('marsroom:edge', () => new THREE.MeshStandardMaterial({ color: 0x2a2623, roughness: 0.6 }));
defineMaterial('marsroom:floor', () => new THREE.MeshStandardMaterial({ color: 0xd6d2c9, roughness: 0.85 }));
defineMaterial('marsroom:floorB', () => new THREE.MeshStandardMaterial({ color: 0xc7c2b8, roughness: 0.85 }));
defineMaterial('marsroom:wall', () => new THREE.MeshStandardMaterial({ color: 0xf4f1eb, roughness: 0.8 }));

/** The flip-top table: a 1829 × 610 mm top at 724 mm on two T-legs (twin 38 mm square columns), four casters. Long axis X. */
function tableParts(b, lite = false) {
  const L = 1.829, W = 0.61, H = 0.724, T = 0.028, legX = 0.72;
  b.add(box(L, T, W, lite ? 0 : 0.004), 'laminateCherry', { position: [0, H - T / 2, 0] });
  if (!lite) b.add(box(L + 0.004, T * 0.7, W + 0.004, 0.003), 'marsroom:edge', { position: [0, H - T / 2 - 0.004, 0] });   // edge band
  for (const sx of [-1, 1]) {
    const x = sx * legX;
    if (lite) b.add(box(0.05, H - T - 0.06, 0.11), 'aluminum', { position: [x, 0.06 + (H - T - 0.06) / 2, 0] });
    else for (const z of [-0.0318, 0.0318]) b.add(box(0.038, H - T - 0.075, 0.0381, 0.003), 'aluminum', { position: [x, 0.075 + (H - T - 0.075) / 2, z] });
    b.add(box(lite ? 0.06 : 0.045, lite ? 0.05 : 0.03, 0.56, lite ? 0 : 0.008), 'aluminum', { position: [x, lite ? 0.06 : 0.066, 0] });       // the foot
    if (!lite) {
      b.add(box(0.06, 0.02, 0.2, 0.004), 'aluminum', { position: [x, 0.086, 0] });                              // where the columns land
      b.add(box(0.09, 0.012, 0.3, 0.003), 'blackMetal', { position: [x, H - T - 0.006, 0] });                   // the flip hinge plate
      b.add(cyl(0.008, 0.008, 0.05, 10).rotateZ(PI / 2), 'blackMetal', { position: [x - sx * 0.05, H - T - 0.03, 0.1] });   // release handle
    }
    for (const z of [-0.255, 0.255]) {
      b.add(cyl(lite ? 0.04 : 0.0375, lite ? 0.04 : 0.0375, lite ? 0.04 : 0.026, lite ? 10 : 18).rotateZ(PI / 2), 'rubber', { position: [x, lite ? 0.04 : 0.0375, z] });
      if (!lite) b.add(box(0.034, 0.03, 0.05, 0.004), 'blackMetal', { position: [x, 0.058, z] });
    }
  }
  if (!lite) b.add(box(2 * legX, 0.04, 0.03, 0.004), 'aluminum', { position: [0, H - T - 0.05, 0] });           // the beam the top pivots on
}
export function createFlipTable() { const b = new Builder('flipTable'); tableParts(b); const g = b.build(); g.userData.size = [1.829, 0.724, 0.61]; return g; }

/** The sled-base chair: a grey moulded shell on a chrome wire-rod frame, 486.5 mm over the rear legs. Faces +Z. */
function chairParts(b, lite = false) {
  const half = 0.237, r = lite ? 0.018 : 0.00635;
  // the shell
  b.add(box(0.43, lite ? 0.04 : 0.022, 0.42, lite ? 0 : 0.01), 'shellGrey', { position: [0, 0.455, 0.02], rotation: [-0.05, 0, 0] });
  b.add(box(0.42, 0.34, lite ? 0.04 : 0.02, lite ? 0 : 0.01), 'shellGrey', { position: [0, 0.69, -0.2], rotation: [-0.2, 0, 0] });
  if (!lite) {
    b.add(box(0.36, 0.05, 0.02, 0.008), 'shellGrey', { position: [0, 0.5, -0.185], rotation: [-0.6, 0, 0] });   // where seat turns into back
    b.add(box(0.16, 0.03, 0.012, 0.005), 'marsroom:edge', { position: [0, 0.78, -0.235], rotation: [-0.2, 0, 0] });   // the hand slot
  }
  // the frame: each side is one rod, down the back, along the floor (the ski), and up to the front of the seat
  for (const sx of [-1, 1]) {
    const x = sx * half;
    if (lite) {
      b.add(box(r * 2, r * 2, 0.5), 'chrome', { position: [x, r, 0.0] });
      b.add(box(r * 2, 0.44, r * 2), 'chrome', { position: [x, 0.22, 0.2] });
      b.add(box(r * 2, 0.5, r * 2), 'chrome', { position: [x, 0.25, -0.2] });
    } else {
      const pts = [[x * 0.92, 0.84, -0.275], [x * 0.95, 0.5, -0.21], [x, 0.3, -0.2], [x, 0.03, -0.27], [x, 0.007, -0.2], [x, 0.007, 0.22], [x, 0.03, 0.27], [x * 0.98, 0.3, 0.21], [x * 0.9, 0.44, 0.19]];
      b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => v(p)), false, 'catmullrom', 0.25), 56, r, 8, false), 'chrome');
    }
  }
  if (!lite) for (const [y, z] of [[0.44, 0.19], [0.36, -0.2]]) b.add(cyl(0.00635, 0.00635, half * 1.86, 8).rotateZ(PI / 2), 'chrome', { position: [0, y, z] });   // cross rods under the seat
}
export function createSledChair() { const b = new Builder('sledChair'); chairParts(b); const g = b.build(); g.userData.size = [0.5, 0.86, 0.56]; return g; }

// ---------------------------------------------------------------- the building, with the recorded run playing in it
// Simulation frame: x east, y north, z up; here x → x, y → −z, yaw about +y. The run file holds, for the robot and
// every table and chair, an integer (mm, mm, mrad) pose per 0.2 s of simulated time, run-length folded (see
// room/dev/tools/export_marsroom.py).
const STAGE = {
  approach: 'approaching', enter: 'lining up', dock: 'docking under it', docked: 'carrying it to the conference room', undock: 'in place, backing out', exit: 'done',
  transit: 'driving back to storage', capture: 'capturing', pushing: 'pushing it to its table', release: 'tucked in',
};
function unfold({ poses, holds }, n) {
  const out = new Float32Array(n * 3), hold = new Map(); for (let i = 0; i < holds.length; i += 2) hold.set(holds[i], holds[i + 1]);
  let k = 0;
  for (let p = 0; p * 3 < poses.length && k < n; p++) {
    const reps = 1 + (hold.get(k) || 0);
    for (let j = 0; j < reps && k < n; j++, k++) { out[k * 3] = poses[p * 3] / 1000; out[k * 3 + 1] = poses[p * 3 + 1] / 1000; out[k * 3 + 2] = poses[p * 3 + 2] / 1000; }
  }
  for (; k < n; k++) { out[k * 3] = out[k * 3 - 3]; out[k * 3 + 1] = out[k * 3 - 2]; out[k * 3 + 2] = out[k * 3 - 1]; }
  return out;
}
function floorLabel(text, w) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d'); g.font = '500 54px Archivo, Arial, sans-serif'; g.fillStyle = 'rgba(40,42,46,.6)'; g.textBaseline = 'middle'; g.fillText(text, 6, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 96 / 512), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -PI / 2; m.renderOrder = 2; return m;
}
function contactShadow(w, d) {
  if (!contactShadow.tex) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    contactShadow.tex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: contactShadow.tex, transparent: true, depthWrite: false }));
  m.rotation.x = -PI / 2; m.position.y = 0.055; m.renderOrder = 1; return m;
}
let runFile = null;
const loadRun = () => runFile ||= fetch(new URL('../data/marsroom-run.json', import.meta.url)).then(r => { if (!r.ok) throw new Error('MARSChair replay HTTP ' + r.status); return r.json(); });

/**
 * The end of one chair placement from the same recorded run, at full size: the robot brings the chair in, turns it to
 * the table, tucks it under and backs away. The table is at the origin, its length along x; the robot comes from +z.
 * userData: { duration, setTime(seconds into the clip), phaseAt }.
 */
export async function createTuckDemo({ chair = 'chair2', from = 1077, to = 1103 } = {}) {
  const run = await loadRun(), n = run.samples, dt = 1 / run.hz, table = run.meta.chairs[chair].table;
  const group = new THREE.Group(); group.name = 'marsTuck';
  const turned = (o, dx = 0) => { const h = new THREE.Group(); o.rotation.y = PI / 2; o.position.x = dx; h.add(o); return h; };   // the models face +z; the run's heading is +x
  const make = name => name === 'robot' ? turned(createFreight(), 0.28) : name.startsWith('table') ? createFlipTable() : turned(createSledChair());   // (0.28: from the middle of the robot with its attachment back to the middle of its base)
  const names = ['robot', table, ...Object.keys(run.meta.chairs).filter(c => run.meta.chairs[c].table === table)], bodies = [];
  for (const name of names) { const g = make(name); g.name = name; group.add(g); bodies.push({ g, p: unfold(run.bodies[name], n) }); }
  const tp = bodies[1].p, tx = tp[(n - 1) * 3], ty = tp[(n - 1) * 3 + 1];
  function setTime(t) {
    const f = Math.max(0, Math.min(n - 1, (from + Math.max(0, Math.min(to - from, t)) - run.first) / dt)), a = Math.floor(f), c = Math.min(n - 1, a + 1), u = f - a;
    for (const { g, p } of bodies) {
      let d = p[c * 3 + 2] - p[a * 3 + 2]; d = Math.atan2(Math.sin(d), Math.cos(d));
      g.position.set(p[a * 3] + (p[c * 3] - p[a * 3]) * u - tx, 0, -(p[a * 3 + 1] + (p[c * 3 + 1] - p[a * 3 + 1]) * u - ty));
      g.rotation.y = p[a * 3 + 2] + d * u;
    }
  }
  setTime(0);
  group.userData = { duration: to - from, setTime, robot: bodies[0].g, phaseAt: t => { let s = run.stages[0]; for (const st of run.stages) { if (st[0] <= from + t) s = st; else break; } return s[1]; } };
  return group;
}

export async function createDiorama() {
  const run = await loadRun(), { meta } = run, B = meta.building, n = run.samples, dt = 1 / run.hz;
  const group = new THREE.Group(); group.name = 'marsDiorama';
  // the building: floors, and walls cut at 0.9 m so you can see in
  const b = new Builder('building');
  B.floors.forEach(([x0, x1, y0, y1], i) => b.add(box(x1 - x0, 0.05, y1 - y0), i === 0 || i === B.floors.length - 1 ? 'marsroom:floor' : 'marsroom:floorB', { position: [(x0 + x1) / 2, 0.025, -(y0 + y1) / 2] }));
  for (const [x0, x1, y0, y1] of B.walls) b.add(box(x1 - x0, 0.9, y1 - y0), 'marsroom:wall', { position: [(x0 + x1) / 2, 0.5, -(y0 + y1) / 2] });
  const xs = B.walls.flatMap(w => [w[0], w[1]]), ys = B.walls.flatMap(w => [w[2], w[3]]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  group.add(b.build());
  const S = B.rooms.storage, C = B.rooms.conference;
  for (const [text, x, y, w] of [['Storage', S[0] + 0.5, S[2] + 0.55, 2.6], ['Conference room', C[0] + 0.5, C[2] + 0.55, 2.6], ['Corridor', B.rooms.corridor[2][0] + 3.2, B.rooms.corridor[2][2] + 0.5, 2.2]]) {
    const l = floorLabel(text, w); l.position.set(x + w / 2, 0.056, -y); group.add(l);
  }
  // the pieces
  const mini = (name, build, shadow) => {
    const mb = new Builder(name); build(mb); const g = mb.build(); g.name = name; g.userData.dynamic = true;
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    g.add(contactShadow(...shadow)); group.add(g); return g;
  };
  const robotParts = mb => {
    mb.add(cyl(0.28, 0.29, 0.3, 20), 'freightGrey', { position: [0, 0.2, 0] });
    mb.add(cyl(0.2, 0.2, 0.02, 20), 'plasticBlack', { position: [0, 0.36, 0] });
    for (const z of [-0.26, 0.26]) { mb.add(box(0.62, 0.05, 0.05), 'extrusion', { position: [0.42, 0.13, z] }); mb.add(box(0.16, 0.09, 0.07), 'printOrange', { position: [0.76, 0.13, z * 1.08] }); }
    mb.add(box(0.06, 0.05, 0.58), 'extrusion', { position: [0.3, 0.13, 0] });
    mb.add(box(0.5, 0.05, 0.06), 'extrusion', { position: [0.52, 0.2, 0] });
    mb.add(box(0.16, 0.07, 0.12), 'printOrange', { position: [0.8, 0.2, 0] });   // the tongue
  };
  const bodies = {};
  for (const [name, track] of Object.entries(run.bodies)) {
    const kind = name.replace(/\d+$/, '');
    const g = kind === 'robot' ? mini(name, robotParts, [1.5, 1.0])
      : kind === 'table' ? mini(name, mb => tableParts(mb, true), [2.2, 0.95])
      : mini(name, mb => { const inner = mb.part('turn', { rotation: [0, PI / 2, 0] }); chairParts(inner, true); }, [0.85, 0.85]);   // the chair model faces +Z; the run's heading is +X
    bodies[name] = { g, p: unfold(track, n) };
  }
  // the robot's path so far, drawn on the floor
  const rp = bodies.robot.p, step = 2, count = Math.floor(n / step), line = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { line[i * 3] = rp[i * step * 3]; line[i * 3 + 1] = 0.062; line[i * 3 + 2] = -rp[i * step * 3 + 1]; }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(line, 3));
  const trail = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xe2540a, transparent: true, opacity: 0.55 })); trail.frustumCulled = false; trail.userData.noBake = true; group.add(trail);

  const duration = meta.duration, stages = run.stages;
  function setTime(t) {
    const f = Math.max(0, Math.min(n - 1, (Math.max(0, Math.min(duration, t)) - run.first) / dt)), a = Math.floor(f), c = Math.min(n - 1, a + 1), u = f - a;
    for (const { g, p } of Object.values(bodies)) {
      let d = p[c * 3 + 2] - p[a * 3 + 2]; d = Math.atan2(Math.sin(d), Math.cos(d));
      g.position.set(p[a * 3] + (p[c * 3] - p[a * 3]) * u, 0.05, -(p[a * 3 + 1] + (p[c * 3 + 1] - p[a * 3 + 1]) * u));
      g.rotation.y = p[a * 3 + 2] + d * u;
    }
    lg.setDrawRange(0, Math.max(2, Math.floor(a / step)));
  }
  function phaseAt(t) {
    let s = stages[0]; for (const st of stages) { if (st[0] <= t) s = st; else break; }
    const [what, stage] = s[1].split(':');
    if (!stage) return what === 'done' ? 'Room set' : 'Starting';
    const label = what.replace(/(\D+)(\d+)/, (_, k, i) => k[0].toUpperCase() + k.slice(1) + ' ' + i);
    return stage === 'transit' ? 'Driving back to storage' : stage === 'exit' ? label + ': placed' : label + ': ' + STAGE[stage];
  }
  setTime(0);
  group.userData = { duration, setTime, phaseAt, meta, robot: bodies.robot.g, size: [x1 - x0, y1 - y0] };
  return group;
}
