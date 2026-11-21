// Procedural lab furnishings. Static subassemblies bake their transforms before
// batching. Only the documented attachment points retain scene-graph pivots.
import { THREE, Builder, box, cyl, torus, sphere, tube, lathe, extrude, defineMaterial } from './kit.js';

const PI = Math.PI, TAU = 2 * PI, Z = [PI / 2, 0, 0], X = [0, 0, -PI / 2];
const dark = 'blackMetal', black = 'plasticBlack', grey = 'plasticGrey', silver = 'extrusion';
const orange = 'printOrange', white = 'paintWhite', rubber = 'rubber';
const v = a => new THREE.Vector3(...a);
function matrix({position = [0,0,0], rotation = [0,0,0], scale = [1,1,1]} = {}) {
  return new THREE.Matrix4().compose(v(position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), v(scale));
}
function local(b, position, rotation, scale) {
  const m = matrix({position, rotation, scale});
  return {add(g, material, t) { b.add(g.clone().applyMatrix4(m.clone().multiply(matrix(t))), material); }};
}
function block(b,m,x,y,z,w,h,d,r=0,rotation) {
  b.add(box(w,h,d,r,1),m,{position:[x,y,z],rotation});
}
function disc(b,m,x,y,z,rt,rb,h,seg=20,rotation) {
  b.add(cyl(rt,rb,h,seg),m,{position:[x,y,z],rotation});
}
function ring(b,m,x,y,z,r,t,rotation,segments=24,radial=6) {
  b.add(torus(r,t,radial,segments),m,{position:[x,y,z],rotation});
}
function oval(b,m,x,y,z,rx,ry,rz,rotation) {
  b.add(sphere(1,16,8),m,{position:[x,y,z],scale:[rx,ry,rz],rotation});
}
function rod(b,m,a,c,r,segments=8,rEnd=r) {
  const direction=v(c).sub(v(a));
  const g=cyl(rEnd,r,direction.length(),segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v([0,1,0]),direction.normalize()));
  b.add(g,m,{position:v(a).lerp(v(c),.5).toArray()});
}
function curve(b,m,points,r,segments=16,radial=6) { b.add(tube(points,r,segments,radial),m); }
function profile(b,m,points,d,z=0) {
  const shape=new THREE.Shape(points.map(([x,y])=>new THREE.Vector2(x,y)));
  b.add(extrude(shape,d),m,{position:[0,0,z]});
}
function finish(b, mount='floor') {
  const group=b.build();
  const bounds=new THREE.Box3().setFromObject(group,true);
  const c=bounds.getCenter(new THREE.Vector3());
  const offset=new THREE.Vector3(-c.x, mount==='wall' ? -c.y : mount==='ceiling' ? -bounds.max.y : -bounds.min.y, mount==='wall' ? -bounds.min.z : -c.z);
  for(const child of group.children) child.position.add(offset);
  group.userData.size=bounds.getSize(new THREE.Vector3()).toArray();
  group.updateMatrixWorld(true);
  return group;
}
function texture(w,h,draw) {
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  draw(c.getContext('2d'),w,h);
  const map=new THREE.CanvasTexture(c); map.colorSpace=THREE.SRGBColorSpace; map.anisotropy=4; return map;
}
function material(name,settings) {
  return defineMaterial('labkit:'+name,()=>new THREE.MeshStandardMaterial(settings()));
}
const lens=material('opal',()=>({color:0xfff4dd,emissive:0xffebcc,emissiveIntensity:1.3}));
const oak=material('oak',()=>({color:0xc09160,roughness:.72}));
const kraft='cardboard', tape=material('kraft tape',()=>({color:0xc69f70,roughness:.36}));
const lcd=material('lcd',()=>({color:0x80a397,roughness:.4}));
const green=material('enamel',()=>({color:0x214b40,metalness:.35,roughness:.39}));
function surface(b,name,w,h,p,basic=false) {
  const m=basic ? new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}) : new THREE.MeshStandardMaterial({color:0xffffff,roughness:.62});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);
  mesh.name=name; mesh.receiveShadow=!basic; b.object(mesh,{position:p}); return mesh;
}
function panelFrame(b,m,w,h,t,d,z) {
  for(const s of [-1,1]) {
    block(b,m,s*(w-t)/2,0,z,t,h,d);
    block(b,m,0,s*(h-t)/2,z,w-2*t,t,d);
  }
}
function spool(b,m,x,y,z,r,width,rotation=[0,0,0]) {
  const p=local(b,[x,y,z],rotation);
  // Turned hollow hubs, with the winding recessed between flange lips.
  p.add(lathe([[r*.24,-width/2],[r,-width/2],[r,-width*.42],[r*.82,-width*.42],
    [r*.82,width*.42],[r,width*.42],[r,width/2],[r*.24,width/2],[r*.24,-width/2]],24),dark);
  disc(p,m,0,0,0,r*.86,r*.86,width*.82,32);
  for(const s of [-1,1]) disc(p,black,0,s*width*.505,0,r*.245,r*.245,width*.012,18);
  for(let i=-2;i<=2;i++) ring(p,m,0,i*width*.14,0,r*.86,r*.012,Z,24,4);
}
function bin(b,m,x,y,z,w,h,d) {
  const p=local(b,[x,y,z]);
  block(p,m,0,.004,0,w,.008,d);
  block(p,m,0,h/2,-d/2+.004,w,h,.008);
  block(p,m,0,h*.20,d/2-.004,w,h*.40,.008);
  const side=[[-d/2,0],[d/2,0],[d/2,h*.4],[d*.26,h*.41],[d*.03,h],[-d/2,h]];
  for(const s of [-1,1]) profile(local(p,[s*(w/2-.004),0,0],[0,-PI/2,0]),m,side,.008);
  block(p,'paper',0,h*.22,d/2+.0005,w*.39,h*.14,.001);
}
function carton(b,x,y,z,w,h,d) {
  block(b,kraft,x,y+h/2,z,w,h,d,.002);
  block(b,tape,x,y+h+.0005,z,w*.14,.001,d);
  block(b,tape,x,y+h*.87,z+d/2+.0005,w*.14,h*.26,.001);
  block(b,'paper',x-w*.24,y+h*.61,z+d/2+.0008,w*.27,h*.25,.001);
  for(let i=0;i<9;i++) block(b,dark,x-w*.33+i*w*.021,y+h*.62,z+d/2+.0015,w*(i%3===0?.012:.006),h*.12,.0005);
}

export function createPrinter() {
  const b=new Builder('printer'), w=.333, d=.377;
  block(b,grey,0,.041,0,w,.068,d,.007);
  block(b,dark,0,.225,-.181,w,.407,.014,.003);
  for(const s of [-1,1]) {
    for(const t of [-1,1]) {
      block(b,rubber,s*.134,.006,t*.151,.038,.012,.043,.003);
      block(b,grey,s*.155,.257,t*.179,.022,.365,.022,.002);
      disc(b,silver,s*.151,.428,t*.19,.003,.003,.002,8,Z);
    }
    block(b,'glass',s*.16,.256,0,.003,.36,.337);
    block(b,grey,s*.156,.441,0,.02,.025,d,.002);
    block(b,grey,0,.441,s*.18,w-.04,.025,.017,.002);
    rod(b,'steel',[s*.132,.075,-.12],[s*.132,.417,-.12],.004);
    rod(b,'steel',[s*.136,.34,-.152],[s*.136,.34,.15],.004);
    block(b,lens,s*.141,.421,0,.005,.005,.28);
  }
  block(b,'glass',0,.448,0,.292,.005,.341);
  block(b,'glass',0,.255,.181,.288,.352,.004);
  block(b,black,.123,.254,.19,.01,.069,.014,.003);
  for(const y of [.138,.37]) block(b,dark,-.142,y,.183,.017,.032,.014,.002);
  rod(b,silver,[-.144,.338,.002],[.144,.338,.002],.006);
  block(b,black,0,.349,-.012,.29,.009,.012);
  const head=b.part('head',{position:[.026,.337,.002]});
  block(head,grey,0,-.01,.009,.045,.044,.039,.004);
  disc(head,black,0,-.009,.031,.014,.014,.004,16,Z);
  for(let i=-1;i<=1;i++) block(head,grey,0,-.009+i*.006,.034,.026,.002,.002);
  disc(head,'brass',0,-.038,.011,.007,.001,.013,10);
  const bed=b.part('bed',{position:[0,.245,0]});
  block(bed,grey,0,-.01,0,.254,.018,.245,.003);
  block(bed,'aluminumDark',0,.001,0,.26,.004,.251,.002);
  block(bed,orange,.015,.008,.017,.094,.01,.071,.001);
  for(const s of [-1,1]) {
    const ear=local(bed,[.015+s*.037,.012,.012],[0,PI/2,0]);
    profile(ear,orange,[[-.031,0],[.032,0],[.032,.008],[-.022,.04],[-.031,.04]],.011);
  }
  rod(b,dark,[.163,.245,-.035],[.228,.245,-.035],.011);
  spool(b,orange,.203,.245,-.035,.088,.061,X);
  curve(b,orange,[[.205,.307,.025],[.204,.383,.007],[.173,.431,-.08],[.15,.439,-.115]],.0016);
  block(b,black,-.075,.046,.194,.088,.04,.012,.003);
  block(b,lcd,-.083,.046,.201,.061,.025,.002);
  for(let i=0;i<3;i++) block(b,dark,-.098+i*.009,.047,.2025,.004,.013,.001);
  disc(b,'aluminumDark',-.042,.046,.204,.005,.005,.006,12,Z);
  const g=finish(b); for(const key of ['head','bed']) g.userData[key]=g.getObjectByName(key);
  return g;
}

export function createWhiteboard({w=1.8,h=1.1}={}) {
  const b=new Builder('whiteboard'), t=.014;
  block(b,grey,0,0,.007,w,h,.014);
  panelFrame(b,silver,w,h,t,.022,.017);
  const writing=surface(b,'surface',w-2*t,h-2*t,[0,0,.024]);
  const trayW=Math.min(.52,w*.8);
  block(b,silver,0,-h/2,.045,trayW,.006,.061);
  block(b,silver,0,-h/2+.004,.074,trayW,.012,.004);
  for(let i=0;i<3;i++) {
    const x=(i-1.4)*trayW*.235, len=trayW*.19;
    disc(b,white,x,-h/2+.011,.05,.007,.007,len,8,X);
    disc(b,[orange,'robotBlue',black][i],x+len*.53,-h/2+.011,.05,.008,.008,.017,8,X);
  }
  block(b,grey,trayW*.35,-h/2+.013,.049,trayW*.20,.019,.034,.002);
  const g=finish(b,'wall'); Object.assign(g.userData,{surface:writing,surfaceSize:[w-2*t,h-2*t]}); return g;
}
export function createFrame({w=.6,h=.8,mat=true}={}) {
  const b=new Builder('frame'), t=.012, margin=mat?Math.min(w,h)*.092:0;
  block(b,mat?'paper':black,0,0,.009,w,h,.018);
  panelFrame(b,dark,w,h,t,.03,.015);
  const sw=w-2*(margin+t), sh=h-2*(margin+t);
  const art=surface(b,'surface',sw,sh,[0,0,.019]);
  const g=finish(b,'wall'); Object.assign(g.userData,{surface:art,surfaceSize:[sw,sh]}); return g;
}
export function createDisplay({diag=27,stand='arm'}={}) {
  const b=new Builder('display'), h=diag*.0254/Math.sqrt(1+(16/9)**2), w=h*16/9;
  const y=stand==='wall'?0:h/2+.127, z=stand==='wall'?.055:.07;
  block(b,silver,0,y,z,w+.012,h+.016,.018,.004);
  block(b,black,0,y,z+.011,w+.01,h+.015,.006,.002);
  const screen=surface(b,'screen',w,h,[0,y+.002,z+.0145],true);
  // The screen's own material can accept a full-colour texture without tint.
  screen.material.color.setHex(0xffffff);
  const idle=texture(2,2,c=>{c.fillStyle='#10151b';c.fillRect(0,0,2,2);});
  screen.material.map=idle;
  block(b,grey,0,y,z-.018,.12,.12,.026,.006);
  if(stand==='wall') block(b,dark,0,y,.014,.114,.115,.028);
  else if(stand==='foot') {
    block(b,silver,0,.009,.03,.23,.018,.17,.004);
    rod(b,silver,[0,.017,.015],[0,y,z-.038],.017);
  } else {
    block(b,dark,-.17,.05,-.112,.074,.1,.009);
    for(const a of [.006,.095]) block(b,dark,-.17,a,-.085,.074,.012,.062);
    disc(b,silver,-.17,.038,-.075,.007,.007,.055,12);
    disc(b,black,-.17,.064,-.075,.019,.019,.006,16);
    rod(b,dark,[-.17,.1,-.083],[-.17,.22,-.083],.015);
    rod(b,'aluminumDark',[-.17,.214,-.083],[-.072,.285,-.144],.017);
    rod(b,dark,[-.072,.285,-.144],[0,y,z-.036],.013);
    for(const [x,cy,cz] of [[-.17,.214,-.083],[-.072,.285,-.144],[0,y,z-.036]])
      disc(b,grey,x,cy,cz,.021,.021,.033,12);
  }
  const g=finish(b,stand==='wall'?'wall':'floor'); Object.assign(g.userData,{screen,screenSize:[w,h]}); return g;
}

export function createTrackLight({length=2.4,heads=3}={}) {
  const b=new Builder('track-light');
  block(b,dark,0,-.018,0,length,.036,.045,.002);
  block(b,grey,0,-.037,0,length-.013,.003,.011);
  for(let i=0;i<heads;i++){
    const x=length*((i+.5)/heads-.5);
    block(b,black,x,-.046,0,.072,.018,.04,.002);
    rod(b,dark,[x,-.054,0],[x,-.104,0],.008);
    const p=b.part('spot-'+i,{position:[x,-.10,0],rotation:[-.24-i%2*.15,0,(i%3-1)*.32]});
    disc(p,dark,0,-.057,0,.047,.05,.124,24);
    disc(p,black,0,-.122,0,.049,.048,.006,24);
    disc(p,lens,0,-.1256,0,.039,.039,.002,24);
  }
  const g=finish(b,'ceiling'); g.userData.heads=g.children.filter(o=>o.isGroup); return g;
}
export function createPendant({length=1.2,drop=.9}={}) {
  const b=new Builder('pendant');
  for(const s of [-1,1]){
    const x=s*length*.34;
    disc(b,dark,x,-.009,0,.026,.026,.018,14);
    rod(b,'aluminumDark',[x,-.018,0],[x,-drop+.035,0],.0018);
  }
  block(b,dark,0,-drop+.019,0,length,.038,.052,.002);
  block(b,lens,0,-drop+.0002,0,length-.012,.002,.044);
  return finish(b,'ceiling');
}

const perforation=material('perforated enamel',()=>{
  const map=texture(64,64,(c)=>{
    c.fillStyle='#e5e1d7';c.fillRect(0,0,64,64);
    c.fillStyle='#a8a59b';c.beginPath();c.arc(32,33,7,0,TAU);c.fill();
    c.fillStyle='#504e49';c.beginPath();c.arc(32,31,6,0,TAU);c.fill();
  });
  map.wrapS=map.wrapT=THREE.RepeatWrapping; return {map,roughness:.78};
});
function wrench(b,length) {
  const p=local(b,[0,0,0],undefined,[length,length,length]);
  // Box end and a genuinely open, offset jaw.
  ring(p,silver,0,.42,0,.063,.018,undefined,12);
  profile(p,silver,[[-.039,.37],[.039,.37],[.026,-.28],[-.033,-.31]],.031);
  profile(p,silver,[[-.033,-.27],[.046,-.272],[.109,-.37],[.088,-.443],[.05,-.357],[-.018,-.381],[-.05,-.47],[-.098,-.409],[-.094,-.333]],.047);
}
function pliers(b,short) {
  for(const s of [-1,1]) {
    curve(b,black,[[s*.004,.02,0],[s*.006,-.005,0],[s*.021,-.054,0],[s*.032,-.10,0]],.006,10);
    curve(b,short?orange:grey,[[s*.014,-.03,0],[s*.024,-.06,0],[s*.032,-.102,0]],.010,8);
    profile(b,silver,[[s*.001,.011],[s*.014,.024],[s*(short?.01:.004),short?.051:.082],[s*.001,short?.047:.079]],.012);
  }
  disc(b,'steel',0,.016,.002,.011,.011,.017,12,Z);
}
export function createPegboard({w=1.6,h=.9}={}) {
  const b=new Builder('pegboard');
  block(b,grey,0,0,.012,w,h,.024);
  const face=new THREE.PlaneGeometry(w-.022,h-.022), uv=face.attributes.uv;
  for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*w/.025,uv.getY(i)*h/.025);
  b.add(face,perforation,{position:[0,0,.0243]});
  panelFrame(b,dark,w,h,.012,.031,.0155);
  const p=local(b,[0,0,.028],undefined,[w/1.6,h/.9,1]);
  const hook=(x,y,z=.039)=>curve(p,silver,[[x,y,0],[x,y,z],[x,y+.009,z+.003]],.003,5);
  for(let i=0;i<7;i++) {
    const len=.275-i*.021,x=-.715+i*.069,y=.32-len*.42;
    hook(x,.32); wrench(local(p,[x,y,.027]),len);
  }
  for(let i=0;i<2;i++){const x=-.19+i*.104;hook(x,.288);pliers(local(p,[x,.265,.027]),i===1);}
  block(p,dark,.144,.217,.024,.26,.019,.049,.002);
  for(let i=0;i<4;i++) {
    const x=.047+i*.064;
    disc(p,orange,x,.27,.033,.012,.017,.085,12);
    disc(p,black,x,.231,.033,.019,.019,.012,12);
    disc(p,silver,x,.151,.033,.003,.003,.15-i*.013,8);
  }
  for(let i=0;i<7;i++) {
    const x=.35+i*.019;
    rod(p,'steel',[x,.103+i*.006,.025],[x,.295+i*.005,.025],.004-i*.00023,6);
    rod(p,'steel',[x,.295+i*.005,.025],[x+.022,.295+i*.005,.025],.004-i*.00023,6);
  }
  block(p,orange,.412,.174,.024,.15,.041,.022,.004);
  for(let i=0;i<2;i++) {
    const x=.556+i*.117;hook(x,.306,.059);
    ring(p,i?black:orange,x,.279,.034,.038,.012,undefined,24,8);
  }
  // Bow saw, with a thin tensioned blade and sloped hand grip.
  const saw=local(p,[-.49,-.058,.032]);
  curve(saw,silver,[[-.204,-.043,0],[-.197,.038,0],[-.164,.061,0],[.134,.061,0],[.181,.019,0]],.009);
  rod(saw,'steel',[-.204,-.047,0],[.169,-.047,0],.003);
  curve(saw,orange,[[.139,.055,0],[.182,.038,0],[.199,-.046,0],[.173,-.051,0],[.147,.009,0]],.013,12);
  hook(-.63,.001); hook(-.39,.001);
  // Vernier beam, inside and outside jaws, slider and display.
  const cal=local(p,[-.49,-.216,.025]);
  block(cal,silver,0,0,0,.313,.014,.008);
  for(const x of [-.141,-.084]) {
    const s=x<-.1?1:-1;
    profile(cal,silver,[[x-.005,.026],[x+.005,.035],[x+.007,-.014],[x+s*.024,-.056],[x-.007,-.042]],.01);
  }
  block(cal,black,-.078,0,.008,.068,.031,.012,.002);
  block(cal,lcd,-.078,.002,.015,.045,.016,.002);
  for(const x of [-.624,-.39]) hook(x,-.223);
  block(p,silver,-.52,-.33,.018,.39,.029,.005);
  for(let i=0;i<39;i++)block(p,grey,-.707+i*.01,-.319-i%5*.0006,.021,.001,.006+(i%5===0?.009:0),.001);
  hook(-.698,-.332);
  // Battery drill in a folded steel cradle.
  const drill=local(p,[-.075,-.154,.062]);
  block(drill,dark,0,-.134,-.015,.193,.012,.097,.002);
  block(drill,dark,0,-.108,-.052,.18,.053,.009);
  block(drill,black,.031,-.107,0,.097,.038,.064,.005);
  block(drill,orange,.03,-.081,0,.082,.018,.059,.003);
  block(drill,grey,.03,-.024,0,.043,.106,.045,.008,[0,0,-.20]);
  block(drill,black,-.001,-.002,0,.023,.023,.026,.003);
  block(drill,orange,.019,.047,0,.128,.075,.066,.013);
  disc(drill,black,-.067,.046,0,.024,.035,.041,16,X);
  rod(drill,'steel',[-.116,.046,0],[-.085,.046,0],.003);
  for(let i=0;i<4;i++) block(drill,grey,.029+i*.009,.054,.033,.004,.023,.002);
  block(p,dark,.425,-.18,.008,.6,.031,.014);
  for(let i=0;i<3;i++)bin(p,i===1?grey:orange,.221+i*.19,-.286,.071,.171,.112,.138);
  return finish(b,'wall');
}

function caster(b,x,y,z,r) {
  disc(b,rubber,x,y+r,z,r,r,r*.67,16,X);
  for(const s of [-1,1]){
    block(b,'aluminumDark',x+s*r*.39,y+r*1.48,z,r*.13,r*1.03,r*.45);
    disc(b,silver,x+s*r*.48,y+r,z,r*.26,r*.26,r*.08,10,X);
  }
  block(b,'aluminumDark',x,y+r*2,z,r*.91,r*.19,r*.66);
  disc(b,'steel',x,y+r*2.3,z,r*.25,r*.25,r*.53,10);
}
export function createToolCart() {
  const b=new Builder('tool-cart');
  for(const x of [-.263,.263])for(const z of [-.163,.163]) caster(b,x,0,z,.044);
  block(b,dark,0,.485,0,.638,.747,.428,.008);
  for(let i=0;i<5;i++) {
    const height=i===0?.20:.123, y=i===0?.231:.337+(i-.5)*.123;
    block(b,grey,0,y,.215,.599,height-.007,.016,.003);
    block(b,silver,0,y+height*.31,.232,.537,.015,.023,.002);
    block(b,black,0,y+height*.31-.006,.246,.515,.005,.006);
  }
  block(b,dark,0,.858,0,.656,.022,.448,.004);
  block(b,rubber,0,.871,0,.636,.006,.429,.003);
  for(const z of [-.124,.124]) rod(b,dark,[.318,.787,z],[.369,.787,z],.008);
  rod(b,grey,[.369,.787,-.124],[.369,.787,.124],.012);
  const top=local(b,[-.088,.885,-.044],[0,.35,0]);
  rod(top,silver,[-.181,0,0],[.136,0,0],.008);
  rod(top,black,[-.18,0,0],[-.079,0,0],.011);
  disc(top,'steel',.146,0,0,.021,.021,.014,16);
  block(top,silver,.146,.011,0,.009,.009,.009);
  const meter=local(b,[.179,.886,.052],[0,-.19,0]);
  block(meter,orange,0,0,0,.089,.025,.153,.007);
  block(meter,black,0,.014,0,.077,.007,.14,.004);
  block(meter,lcd,0,.018,-.043,.063,.002,.031);
  disc(meter,grey,0,.022,.009,.019,.019,.009,16);
  for(const s of [-1,1])curve(meter,s>0?orange:black,[[s*.024,.018,.051],[s*.038,.007,.086],[s*.057,-.009,.093],[s*.064,-.009,.001]],.002,12);
  return finish(b);
}

function scope(b,x,y,z) {
  const p=local(b,[x,y,z]);
  block(p,'shellGrey',0,.084,0,.258,.164,.122,.009);
  block(p,grey,-.037,.087,.063,.158,.116,.006,.003);
  block(p,'screenOff',-.037,.087,.067,.143,.10,.003);
  const wave=[];
  for(let i=0;i<32;i++)wave.push([-.103+i*.00425,.087+.022*Math.sin(i*.48),.069]);
  curve(p,'ledGreen',wave,.0013,36,4);
  for(let i=0;i<6;i++) disc(p,i===5?orange:black,.062+(i%2)*.034,.129-Math.floor(i/2)*.039,.065,.009,.009,.012,12,Z);
}
export function createShelving({w=1.2,h=1.9,d=.45}={}) {
  const b=new Builder('shelving');
  const levels=[.075,h*.31,h*.57,h*.84];
  for(const s of [-1,1])for(const t of [-1,1]) {
    const x=s*(w/2-.019),z=t*(d/2-.016);
    block(b,dark,x,h/2,z,.038,h,.012);
    block(b,dark,x+s*.013,h/2,z-t*.014,.012,h,.019);
    for(let i=0;i<Math.floor(h/.068);i++)
      block(b,grey,x,i*.068+.031,z+t*.0067,.007,.019,.001);
  }
  for(const y of levels) {
    block(b,oak,0,y-.011,0,w-.041,.022,d-.024);
    for(const s of [-1,1]){
      block(b,dark,0,y-.04,s*(d/2-.022),w-.039,.043,.015);
      block(b,dark,s*(w/2-.023),y-.04,0,.013,.043,d-.035);
    }
  }
  // Inventory scales horizontally with the bay, preserving a central landing
  // area at the third deck. Side equipment is sized to the available margin.
  const stock=local(b,[0,0,0],undefined,[w/1.2,1,d/.45]);
  carton(stock,-.362,levels[0],-.012,.348,.272,.296);
  carton(stock,.008,levels[0],.012,.344,.196,.315);
  for(let i=0;i<4;i++) ring(stock,rubber,.397,levels[0]+.012+i*.017,0,.124,.012,Z,24);
  for(let i=0;i<4;i++)spool(stock,[orange,white,black,'robotBlue'][i],-.496+i*.097,levels[1]+.105,-.007,.105,.075,X);
  for(let i=0;i<2;i++)for(let j=0;j<2;j++)
    bin(stock,i===j?orange:grey,.119+i*.27,levels[1]+j*.094,0,.25,.094,.266);
  const sideScale=Math.min(1,Math.max(0,(w-.45-.08)/.66));
  if(sideScale>0)scope(local(b,[-w/2+.04,levels[2],0],undefined,[sideScale,1,d/.45]),.14,0,0);
  const bucket=local(stock,[.38,levels[3],-.024]);
  bucket.add(lathe([[0,0],[.077,0],[.088,.137],[.083,.137],[.073,.008],[0,.008]],24),grey);
  for(let i=0;i<6;i++) {
    const x=Math.cos(i*2.4)*.046,z=Math.sin(i*2.4)*.042,height=.179+(i%3)*.035;
    const bar=local(bucket,[x,.006,z],[.07*Math.cos(i),i*.73,.08*Math.sin(i)]);
    block(bar,silver,0,height/2,0,.018,height,.018);
    block(bar,grey,0,height/2,.0094,.004,height,.001);
    disc(bar,dark,0,height+.0003,0,.003,.003,.001,8);
  }
  const helmet=local(stock,[-.351,levels[3],.028]);
  oval(helmet,orange,0,.014,.018,.124,.013,.156);
  // Hemisphere seats directly on the brim.
  helmet.add(new THREE.SphereGeometry(1,28,10,0,TAU,0,PI/2),orange,{position:[0,.018,0],scale:[.109,.113,.126]});
  curve(helmet,orange,[[0,.054,-.115],[0,.122,-.052],[0,.135,0],[0,.12,.062],[0,.067,.113]],.006);
  const g=finish(b); g.userData.clearSpot=[0,levels[2],0]; return g;
}

// ---------------------------------------------------------------- added in the room's own hand (simpler than the above)
/** A 30 cm wall clock. userData.setTime(h, m, s) turns the hands. Back at z = 0. */
export function createWallClock() {
  const b = new Builder('wallClock'), R = 0.15;
  b.add(cyl(R, R, 0.03, 48).rotateX(PI / 2), dark, { position: [0, 0, 0.015] });
  const face = texture(512, 512, (g, w) => {
    g.fillStyle = '#f6f3ec'; g.fillRect(0, 0, w, w); g.translate(w / 2, w / 2);
    for (let i = 0; i < 60; i++) { g.save(); g.rotate(i * TAU / 60); g.fillStyle = '#1b1c1f'; g.fillRect(-(i % 5 ? 1.5 : 4), -236, i % 5 ? 3 : 8, i % 5 ? 12 : 30); g.restore(); }
    g.fillStyle = '#1b1c1f'; g.font = '600 44px Archivo, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) g.fillText(String(i), Math.sin(i * TAU / 12) * 176, -Math.cos(i * TAU / 12) * 176);
  });
  const dial = new THREE.Mesh(new THREE.CircleGeometry(R - 0.008, 48), new THREE.MeshStandardMaterial({ map: face, roughness: 0.8 })); dial.name = 'dial';
  b.object(dial, { position: [0, 0, 0.0305] });
  const hand = (name, len, wid, z, m) => { const p = b.part(name, { position: [0, 0, z] }); p.add(box(wid, len, 0.002).translate(0, len / 2 - 0.012, 0), m); return name; };
  hand('hourHand', 0.075, 0.008, 0.033, dark); hand('minuteHand', 0.115, 0.006, 0.0355, dark); hand('secondHand', 0.125, 0.002, 0.038, orange);
  b.add(cyl(0.007, 0.007, 0.01, 16).rotateX(PI / 2), dark, { position: [0, 0, 0.036] });
  const g = b.build(); g.userData.size = [0.3, 0.3, 0.04];
  const [hh, mm, ss] = ['hourHand', 'minuteHand', 'secondHand'].map(n => g.getObjectByName(n));
  g.userData.setTime = (h, m, s) => { hh.rotation.z = -((h % 12) + m / 60) * TAU / 12; mm.rotation.z = -(m + s / 60) * TAU / 60; ss.rotation.z = -s * TAU / 60; };
  g.userData.setTime(10, 10, 30);
  return g;
}
/** A road bike, leaning: diamond frame, drop bars, spoked wheels. About 1.7 m long; the wall it leans on is at −Z. */
export function createBike() {
  const b = new Builder('bike'), frame = material('bike paint', () => ({ color: 0x1f3d33, roughness: 0.35, metalness: 0.2 }));
  const WR = 0.335, rear = [-0.5, WR, 0], front = [0.5, WR, 0], bb = [-0.09, 0.27, 0], seat = [-0.2, 0.84, 0], head = [0.36, 0.86, 0], headLow = [0.4, 0.72, 0];
  const lean = b.part('lean', { rotation: [-0.14, 0, 0] });
  const wheel = c => {
    lean.add(torus(WR, 0.013, 8, 48), rubber, { position: c });
    lean.add(torus(WR - 0.02, 0.008, 6, 48), silver, { position: c });
    lean.add(cyl(0.02, 0.02, 0.09, 12).rotateX(PI / 2), silver, { position: c });
    for (let i = 0; i < 18; i++) { const a = i * TAU / 18; rod(lean, 'steel', [c[0], c[1], c[2] + (i % 2 ? 0.03 : -0.03)], [c[0] + Math.cos(a) * (WR - 0.022), c[1] + Math.sin(a) * (WR - 0.022), c[2]], 0.0012, 4); }
  };
  wheel(rear); wheel(front);
  for (const [a, c, r] of [[bb, seat, 0.016], [seat, head, 0.015], [bb, headLow, 0.019], [head, headLow, 0.018], [seat, [seat[0] - 0.03, 0.97, 0], 0.012]]) rod(lean, frame, a, c, r, 10);
  for (const z of [-0.05, 0.05]) { rod(lean, frame, [bb[0], bb[1], z * 0.6], [rear[0], rear[1], z], 0.009, 8); rod(lean, frame, [seat[0], seat[1] - 0.06, z * 0.3], [rear[0], rear[1], z], 0.007, 8); rod(lean, frame, [headLow[0] + 0.01, headLow[1], z * 0.5], [front[0], front[1], z], 0.011, 8, 0.007); }
  // saddle, stem and drop bars
  lean.add(box(0.25, 0.03, 0.13, 0.014), black, { position: [seat[0] - 0.04, 0.985, 0] });
  rod(lean, dark, head, [head[0] + 0.09, head[1] + 0.05, 0], 0.012, 8);
  const hx = head[0] + 0.09, hy = head[1] + 0.05;
  rod(lean, dark, [hx, hy, -0.2], [hx, hy, 0.2], 0.011, 8);
  for (const z of [-0.2, 0.2]) curve(lean, black, [[hx, hy, z], [hx + 0.08, hy - 0.01, z], [hx + 0.1, hy - 0.08, z], [hx + 0.05, hy - 0.14, z], [hx - 0.03, hy - 0.14, z]], 0.012, 20, 8);
  // drivetrain
  lean.add(cyl(0.095, 0.095, 0.004, 32).rotateX(PI / 2), silver, { position: [bb[0], bb[1], 0.045] });
  lean.add(cyl(0.045, 0.045, 0.03, 16).rotateX(PI / 2), silver, { position: [rear[0], rear[1], 0.04] });
  rod(lean, dark, [bb[0], bb[1], 0.06], [bb[0] + 0.12, bb[1] - 0.12, 0.07], 0.008, 6); rod(lean, dark, [bb[0], bb[1], -0.06], [bb[0] - 0.12, bb[1] + 0.12, -0.07], 0.008, 6);
  lean.add(box(0.09, 0.016, 0.06, 0.004), black, { position: [bb[0] + 0.12, bb[1] - 0.125, 0.11] }); lean.add(box(0.09, 0.016, 0.06, 0.004), black, { position: [bb[0] - 0.12, bb[1] + 0.125, -0.11] });
  for (const dy of [0.092, -0.042]) rod(lean, dark, [bb[0], bb[1] + dy, 0.045], [rear[0], rear[1] + dy * 0.47, 0.042], 0.003, 4);
  const g = b.build(); g.userData.size = [1.7, 1.0, 0.45]; return g;
}
/** Two shipping boxes and a crate of printed parts. */
export function createFloorBoxes() {
  const b = new Builder('floorBoxes');
  block(b, kraft, 0, 0.16, 0, 0.46, 0.32, 0.36, 0.004); block(b, tape, 0, 0.3205, 0, 0.46, 0.002, 0.05);
  block(b, kraft, 0.03, 0.42, -0.02, 0.34, 0.2, 0.28, 0.004, [0, 0.3, 0]); block(b, tape, 0.03, 0.5205, -0.02, 0.34, 0.002, 0.05, 0, [0, 0.3, 0]);
  block(b, grey, 0.52, 0.11, 0.05, 0.4, 0.22, 0.3, 0.008); block(b, black, 0.52, 0.2, 0.05, 0.37, 0.05, 0.27, 0.004);
  for (let i = 0; i < 5; i++) block(b, orange, 0.4 + i * 0.055, 0.235, 0.02 + (i % 2) * 0.07, 0.045, 0.03, 0.09, 0.006, [0, i * 0.5, 0]);
  return finish(b);
}
/** An architect's desk lamp, lit. userData.bulb marks the bulb. */
export function createDeskLamp() {
  const b = new Builder('deskLamp'), bulbMat = material('bulb', () => ({ color: 0x000000, emissive: 0xffd9a8, emissiveIntensity: 4 }));
  disc(b, dark, 0, 0.01, 0, 0.085, 0.09, 0.02, 32);
  rod(b, dark, [0, 0.02, 0], [0.02, 0.3, -0.1], 0.006, 8); rod(b, dark, [0.02, 0.3, -0.1], [0.06, 0.46, 0.14], 0.006, 8);
  oval(b, dark, 0.02, 0.3, -0.1, 0.014, 0.014, 0.014);
  b.add(new THREE.ConeGeometry(0.075, 0.11, 28, 1, true), dark, { position: [0.07, 0.43, 0.19], rotation: [0.9, 0, 0.1] });
  oval(b, bulbMat, 0.07, 0.425, 0.2, 0.026, 0.026, 0.026);
  const g = finish(b); const bulb = new THREE.Object3D(); bulb.position.set(0.07, 0.42, 0.2); g.add(bulb); g.userData.bulb = bulb; return g;
}

/** A fiddle-leaf fig, about 1.6 m, in a ribbed white pot: a leaning trunk, two branches, and big creased leaves. */
function figLeaf(len, wid, bend) {
  const g = new THREE.PlaneGeometry(wid, len, 4, 6); g.translate(0, len / 2, 0);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), t = Math.max(0, Math.min(1, y / len));
    const w = Math.sin(Math.PI * Math.pow(t, 0.75)) * (0.55 + 0.45 * t) + 0.06;   // violin outline: narrow waist, broad top
    P.setXYZ(i, x * w, y * Math.cos(bend * t), Math.abs(x * w) * 0.42 - Math.sin(bend * t) * y * 0.55 - 0.012 * Math.sin(t * 9) * Math.abs(x) / wid);
  }
  g.computeVertexNormals(); return g;
}
export function createPlantLarge() {
  const b = new Builder('figTree'), leafB = material('leaf light', () => ({ color: 0x4a8a45, roughness: 0.55, side: THREE.DoubleSide })), bark = material('bark', () => ({ color: 0x6a5140, roughness: 0.9 }));
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // pot: ribbed, matte white, with soil
  b.add(lathe([[0, 0], [0.15, 0], [0.19, 0.03], [0.215, 0.36], [0.2, 0.38], [0.19, 0.36]], 40), white);
  for (let i = 0; i < 28; i++) { const a = i * TAU / 28; b.add(cyl(0.006, 0.005, 0.3, 5), white, { position: [Math.cos(a) * 0.2, 0.2, Math.sin(a) * 0.2], rotation: [Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08] }); }
  disc(b, material('soil', () => ({ color: 0x2c221b, roughness: 1 })), 0, 0.34, 0, 0.19, 0.19, 0.02, 28);
  const stems = [
    [[0, 0.34, 0], [0.02, 0.7, 0.01], [-0.02, 1.05, 0.03], [0.03, 1.38, 0.0], [0.02, 1.56, -0.02]],
    [[-0.01, 0.82, 0.02], [-0.13, 1.0, 0.08], [-0.2, 1.22, 0.12], [-0.22, 1.36, 0.13]],
    [[0.01, 1.0, 0.02], [0.12, 1.15, -0.07], [0.19, 1.3, -0.12]],
  ];
  stems.forEach((pts, k) => {
    const curveC = new THREE.CatmullRomCurve3(pts.map(v));
    b.add(new THREE.TubeGeometry(curveC, 24, k ? 0.011 : 0.017, 7, false), bark);
    const n = k ? 9 : 22;
    for (let i = 0; i < n; i++) {
      const t = (k ? 0.25 : 0.32) + (i / n) * (k ? 0.75 : 0.68), p = curveC.getPoint(Math.min(1, t)), az = i * 2.4 + rnd() * 0.5 + k, tilt = 0.75 + rnd() * 0.5 - t * 0.35;
      const len = 0.2 + rnd() * 0.12 + (1 - Math.abs(t - 0.7)) * 0.06, g = figLeaf(len, len * 0.62, 0.5 + rnd() * 0.5);
      g.rotateX(tilt); g.rotateY(az);
      b.add(g, i % 3 ? 'leaf' : leafB, { position: [p.x + Math.sin(az) * 0.012, p.y, p.z + Math.cos(az) * 0.012] });
    }
  });
  return finish(b);
}
/** A small pilea on a saucer. */
export function createPlantSmall() {
  const b = new Builder('pilea'), terra = material('terracotta', () => ({ color: 0xb5613c, roughness: 0.85 }));
  b.add(lathe([[0, 0], [0.045, 0], [0.06, 0.09], [0.066, 0.1], [0.058, 0.1], [0.05, 0.02]], 28), terra, { position: [0, 0.008, 0] });
  disc(b, terra, 0, 0.004, 0, 0.075, 0.07, 0.008, 28);
  let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4, r = 0.03 + rnd() * 0.07, h = 0.14 + rnd() * 0.12;
    rod(b, 'leaf', [0, 0.1, 0], [Math.cos(a) * r, h, Math.sin(a) * r], 0.0016, 4);
    b.add(new THREE.CircleGeometry(0.024 + rnd() * 0.012, 14), 'leaf', { position: [Math.cos(a) * r, h + 0.002, Math.sin(a) * r], rotation: [-PI / 2 + (rnd() - 0.5) * 0.9, 0, (rnd() - 0.5) * 0.9] });
  }
  return finish(b);
}
/** A black backpack slumped against the wall (the wall is at −Z). */
export function createBackpack() {
  const b = new Builder('backpack'), fab = material('pack', () => ({ color: 0x1b1c20, roughness: 0.95 })), fab2 = material('pack panel', () => ({ color: 0x26282d, roughness: 0.9 }));
  oval(b, fab, 0, 0.21, 0, 0.155, 0.22, 0.1, [-0.16, 0, 0.05]);
  oval(b, fab2, 0, 0.14, 0.075, 0.12, 0.12, 0.05, [-0.2, 0, 0.05]);                    // front pocket
  curve(b, fab2, [[-0.11, 0.2, 0.09], [-0.05, 0.3, 0.105], [0.05, 0.3, 0.105], [0.11, 0.2, 0.09]], 0.004, 16, 5);   // zip line
  curve(b, fab, [[-0.04, 0.42, -0.02], [0, 0.47, -0.03], [0.04, 0.42, -0.02]], 0.008, 12, 6);                       // grab handle
  for (const sx of [-1, 1]) curve(b, fab, [[sx * 0.09, 0.4, -0.06], [sx * 0.13, 0.25, -0.12], [sx * 0.12, 0.08, -0.1], [sx * 0.1, 0.03, -0.03]], 0.014, 16, 6);   // straps
  oval(b, orange, 0.11, 0.3, 0.07, 0.012, 0.02, 0.006);                                // a zip pull
  return finish(b);
}
/** A wire-mesh cable tray under the ceiling, with a bundle lying in it and two drops. Hangs from y = 0, runs along X. */
export function createCableTray({ length = 3 } = {}) {
  const b = new Builder('cableTray'), W = 0.2, y = -0.2;
  for (const z of [-W / 2, 0, W / 2]) rod(b, 'steel', [-length / 2, y, z], [length / 2, y, z], 0.0025, 5);
  for (const z of [-W / 2, W / 2]) rod(b, 'steel', [-length / 2, y + 0.05, z], [length / 2, y + 0.05, z], 0.0025, 5);
  for (let x = -length / 2; x <= length / 2 + 1e-6; x += 0.1) curve(b, 'steel', [[x, y + 0.05, -W / 2], [x, y, -W / 2], [x, y, W / 2], [x, y + 0.05, W / 2]], 0.002, 6, 4);
  for (let x = -length / 2 + 0.3; x < length / 2; x += 1.2) for (const z of [-W / 2, W / 2]) rod(b, dark, [x, y + 0.05, z], [x, 0, z], 0.004, 5);   // hangers
  const cables = [[black, -0.05, 0.009], [black, -0.02, 0.007], [grey, 0.015, 0.008], [orange, 0.045, 0.006], ['accentBlue', 0.065, 0.005]];
  for (const [m, z, r] of cables) curve(b, m, [[-length / 2, y + r, z], [-length / 4, y + r + 0.004, z + 0.012], [0, y + r, z - 0.01], [length / 4, y + r + 0.003, z + 0.008], [length / 2, y + r, z]], r, 24, 6);
  for (const x of [-length * 0.3, length * 0.22]) curve(b, black, [[x - 0.2, y + 0.01, -0.05], [x, y + 0.012, -0.07], [x + 0.03, y - 0.05, -W / 2 - 0.01], [x + 0.03, y - 0.5, -W / 2 - 0.01]], 0.007, 16, 6);   // drops down the wall
  return finish(b, 'ceiling');
}
/** MARSChair's nine printed parts, laid out for inspection, with calipers. Sits on y = 0; about 0.8 × 0.4 m. */
export function createPrintedParts() {
  const b = new Builder('printedParts');
  const part = (x, z, w, h, d, r = 0.004, rot = 0) => block(b, orange, x, h / 2, z, w, h, d, r, [0, rot, 0]);
  part(-0.3, -0.1, 0.16, 0.05, 0.045, 0.005, 0.2);                       // tongue skin
  block(b, silver, -0.3, 0.06, -0.1, 0.02, 0.04, 0.04, 0, [0, 0.2, 0]);   // its aluminium core showing
  for (const [x, z, rot] of [[-0.08, -0.12, -0.3], [0.1, -0.1, 0.25]]) {   // the two fork guides
    part(x, z, 0.11, 0.05, 0.05, 0.004, rot);
    b.add(box(0.11, 0.05, 0.02, 0.004), orange, { position: [x + Math.sin(rot) * 0.03 + 0.03, 0.025, z + 0.04], rotation: [0, rot + 0.5, 0] });
  }
  for (const [x, z, rot] of [[0.3, -0.08, 0.1], [0.3, 0.1, -0.15]]) {      // the cradle flares, with their straps
    part(x, z, 0.14, 0.045, 0.045, 0.004, rot); block(b, orange, x - 0.03, 0.05, z, 0.05, 0.01, 0.06, 0.003, [0, rot, 0]);
  }
  for (const [x, z] of [[-0.3, 0.1], [-0.14, 0.1]]) part(x, z, 0.12, 0.02, 0.08, 0.006, 0.1);   // the dock face, in two halves
  for (const [x, z] of [[0.02, 0.1], [0.14, 0.12]]) { part(x, z, 0.06, 0.03, 0.06, 0.005, 0.4); disc(b, dark, x, 0.031, z, 0.009, 0.009, 0.003, 12); }   // spacers
  // calipers
  block(b, 'steel', 0.02, 0.004, -0.02, 0.22, 0.004, 0.016, 0.001, [0, -0.5, 0]);
  block(b, dark, -0.02, 0.008, 0.0, 0.05, 0.012, 0.035, 0.003, [0, -0.5, 0]);
  block(b, 'steel', -0.085, 0.005, 0.045, 0.006, 0.006, 0.05, 0, [0, -0.5, 0]);
  return finish(b);
}
