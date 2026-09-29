/* ============================================================================
   Wake — a D2Q9 lattice-Boltzmann flow solver that runs on the GPU (WebGL2).

   A cylinder (bluff body) in a uniform stream sheds a Kármán vortex street —
   the wake the passive-vortex-propulsion fin harvests thrust from.

   Per frame:   S × [ pull-stream + BGK collide ]   (3 float targets, MRT)
                1 × dye advection (semi-Lagrangian, 2× grid resolution)
                1 × display (analytic obstacles, tone-mapped dye + vorticity)
   Obstacles use halfway bounce-back; the draggable cylinder adds the moving-
   wall momentum term, so pushing it actually pushes the fluid.
   A probe one wake-length downstream reads v_y back from the GPU; its zero
   crossings give the shedding frequency, and St = f·D / U.
   ========================================================================== */
(function () {
  'use strict';

  var VS = '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  // Shared GLSL: obstacle geometry. Cylinder = circle; fin = NACA 0012 section.
  var GEOM = [
    'uniform vec3 cyl;   // centre x, y, radius (cells); r <= 0 → absent',
    'uniform vec4 fin;   // leading edge x, y, chord, angle (rad); chord <= 0 → absent',
    'float naca(float t){ t=clamp(t,0.,1.); return 0.6*(0.2969*sqrt(t)-0.1260*t-0.3516*t*t+0.2843*t*t*t-0.1036*t*t*t*t); }',
    'vec2 finLocal(vec2 x){ vec2 d=x-fin.xy; float c=cos(fin.w),s=sin(fin.w); return vec2(c*d.x+s*d.y,-s*d.x+c*d.y); }',
    'bool inCyl(vec2 x){ return cyl.z>0. && distance(x,cyl.xy)<cyl.z; }',
    'bool inFin(vec2 x){ if(fin.z<=0.) return false; vec2 q=finLocal(x); float t=q.x/fin.z; return t>=0. && t<=1. && abs(q.y)<=fin.z*naca(t)+.35; }',
    'bool solid(vec2 x){ return inCyl(x) || inFin(x); }'
  ].join('\n');

  var STEP = [
    '#version 300 es',
    'precision highp float; precision highp sampler2D; precision highp int;',
    'uniform sampler2D F0; uniform sampler2D F1; uniform sampler2D F2;',
    'uniform ivec2 N; uniform float omega; uniform float u0; uniform vec2 cylV; uniform int init;',
    'uniform vec3 finRot;  // fin pivot x, y and angular velocity (rad/step)',
    GEOM,
    'layout(location=0) out vec4 o0; layout(location=1) out vec4 o1; layout(location=2) out vec4 o2;',
    'const ivec2 E[9]=ivec2[9](ivec2(0,0),ivec2(1,0),ivec2(0,1),ivec2(-1,0),ivec2(0,-1),ivec2(1,1),ivec2(-1,1),ivec2(-1,-1),ivec2(1,-1));',
    'const int OPP[9]=int[9](0,3,4,1,2,7,8,5,6);',
    'const float W[9]=float[9](4./9.,1./9.,1./9.,1./9.,1./9.,1./36.,1./36.,1./36.,1./36.);',
    'float pick(vec4 v,int k){ return k==0?v.x:k==1?v.y:k==2?v.z:v.w; }',
    'float fetchF(ivec2 c,int i){ if(i<4) return pick(texelFetch(F0,c,0),i); if(i<8) return pick(texelFetch(F1,c,0),i-4); return texelFetch(F2,c,0).x; }',
    'void emit(float f[9],vec2 u,float r){ o0=vec4(f[0],f[1],f[2],f[3]); o1=vec4(f[4],f[5],f[6],f[7]); o2=vec4(f[8],u,r); }',
    'vec2 wallV(vec2 p){ if(inCyl(p)) return cylV; if(inFin(p)) return finRot.z*vec2(-(p.y-finRot.y),p.x-finRot.x); return vec2(0.); }',
    'void equi(float r,vec2 u,out float f[9]){ float q=1.5*dot(u,u); for(int i=0;i<9;i++){ float eu=3.*dot(vec2(E[i]),u); f[i]=W[i]*r*(1.+eu+.5*eu*eu-q);} }',
    'void main(){',
    '  ivec2 x=ivec2(gl_FragCoord.xy); vec2 xf=vec2(x); float f[9];',
    // start from free stream plus a lopsided transverse kick behind the body, so shedding locks in during warm-up
    '  if(init==1){ float r=max(cyl.z,4.); vec2 q=xf-cyl.xy-vec2(3.*r,.5*r); vec2 u=vec2(u0,.35*u0*exp(-dot(q,q)/(3.*r*r))); if(solid(xf)) u=vec2(0.); equi(1.,u,f); emit(f,u,1.); return; }',
    '  if(x.x==0||x.y==0||x.y==N.y-1){ vec2 u=vec2(u0,0.); equi(1.,u,f); emit(f,u,1.); return; }',
    '  if(solid(xf)){ vec2 u=wallV(xf); equi(1.,u,f); emit(f,u,1.); return; }',
    '  vec4 a0=texelFetch(F0,x,0),a1=texelFetch(F1,x,0),a2=texelFetch(F2,x,0);',
    '  float fs[9]=float[9](a0.x,a0.y,a0.z,a0.w,a1.x,a1.y,a1.z,a1.w,a2.x);',
    '  for(int i=0;i<9;i++){',
    '    ivec2 s=clamp(x-E[i],ivec2(0),N-1);',
    '    vec2 sf=vec2(s);',
    '    if(i>0 && solid(sf)){ f[i]=fs[OPP[i]]+6.*W[i]*dot(vec2(E[i]),wallV(sf)); }',
    '    else f[i]=fetchF(s,i);',
    '  }',
    '  float r=0.; vec2 u=vec2(0.);',
    '  for(int i=0;i<9;i++){ r+=f[i]; u+=f[i]*vec2(E[i]); }',
    '  u/=r;',
    '  if(!(r>.3 && r<3.) || !(abs(u.x)<1.) || !(abs(u.y)<1.)){ r=1.; u=vec2(u0,0.); }',   // NaN / blow-up guard
    '  float ul=length(u); if(ul>.3) u*=.3/ul;',
    '  float om=omega;',
    '  float sp=smoothstep(float(N.x)*.86,float(N.x),xf.x); om=mix(om,1./.95,sp);',        // outflow sponge
    '  float q=1.5*dot(u,u);',
    '  for(int i=0;i<9;i++){ float eu=3.*dot(vec2(E[i]),u); float fe=W[i]*r*(1.+eu+.5*eu*eu-q); f[i]+=om*(fe-f[i]); }',
    '  emit(f,u,r);',
    '}'
  ].join('\n');

  var DYE = [
    '#version 300 es',
    'precision highp float; precision highp sampler2D; precision highp int;',
    'uniform sampler2D D; uniform sampler2D F2; uniform ivec2 N; uniform vec2 DN; uniform float dt; uniform float decay; uniform int mode; uniform float rake;',
    GEOM,
    'out vec4 o;',
    'vec2 vel(vec2 p){ vec2 b=floor(p),t=p-b; ivec2 i=ivec2(b); ivec2 M=N-1;',
    '  vec2 a=texelFetch(F2,clamp(i,ivec2(0),M),0).yz, c=texelFetch(F2,clamp(i+ivec2(1,0),ivec2(0),M),0).yz;',
    '  vec2 d=texelFetch(F2,clamp(i+ivec2(0,1),ivec2(0),M),0).yz, e=texelFetch(F2,clamp(i+ivec2(1,1),ivec2(0),M),0).yz;',
    '  return mix(mix(a,c,t.x),mix(d,e,t.x),t.y); }',
    'void main(){',
    '  vec2 ps=gl_FragCoord.xy*(vec2(N)/DN)-.5;',
    '  vec2 back=ps-vel(ps)*dt;',
    '  vec4 d=texture(D,(back+.5)/vec2(N))*decay;',
    '  if(mode==0 && cyl.z>0.){',                                   // two-colour dye from the cylinder surface
    '    float r=distance(ps,cyl.xy);',
    '    float k=1.-smoothstep(cyl.z+.3,cyl.z+1.9,r);',
    '    if(k>0.){ float up=smoothstep(cyl.y-.8,cyl.y+.8,ps.y); d=mix(d,vec4(up,1.-up,0.,0.),k); }',
    '  }',
    '  if(mode==1 && ps.x<2.5){',                                   // smoke rake at the inlet
    '    float k=abs(fract(ps.y/rake)-.5)*rake;',
    '    d.b=max(d.b,1.-smoothstep(.35,1.1,k));',
    '  }',
    '  if(solid(ps)) d*=0.;',
    // vorticity from bilinearly-interpolated velocity, at dye resolution → smooth field for display
    '  float h=.75; vec2 ex=vec2(h,0.), ey=vec2(0.,h);',
    '  d.a=(vel(ps+ex).y-vel(ps-ex).y-vel(ps+ey).x+vel(ps-ey).x)/(2.*h);',
    '  o=d;',
    '}'
  ].join('\n');

  var SHOW = [
    '#version 300 es',
    'precision highp float; precision highp sampler2D; precision highp int;',
    'uniform sampler2D D; uniform sampler2D F2; uniform ivec2 N; uniform vec2 R; uniform int mode;',
    'uniform vec3 cA; uniform vec3 cB; uniform vec3 cS; uniform vec3 bg; uniform float vort;',
    GEOM,
    'out vec4 o;',
    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/R;',
    '  vec2 ps=uv*vec2(N)-.5;',
    '  float px=float(N.y)/R.y;',                                       // grid cells per device pixel
    '  vec4 d=texture(D,uv);',
    '  float w=d.a;',
    '  vec3 col=bg;',
    '  float wv=clamp(abs(w)*vort,0.,1.)*smoothstep(1.,7.,min(ps.y,float(N.y)-1.-ps.y));',  // no glow on the free-stream boundary rows
    '  col+=(w<0.?cA:cB)*wv*wv*.22;',                                   // faint vorticity field: clockwise (upper layer) = A
    '  if(mode==0){ col+=cA*pow(d.r,.75)*1.05+cB*pow(d.g,.75)*1.05; }',
    '  else { float s=pow(d.b,.8); col+=mix(cS,(w<0.?cA:cB),clamp(abs(w)*vort*1.6,0.,.85))*s*1.1; }',
    '  col=1.-exp(-col*1.25);',                                          // soft tone map
    // analytic, anti-aliased obstacles on top of the flow
    '  float a=0., edge=0.;',
    '  if(cyl.z>0.){ float dc=distance(ps,cyl.xy)-cyl.z; a=max(a,1.-smoothstep(-px,px,dc)); edge=max(edge,1.-smoothstep(0.,1.6*px,abs(dc))); }',
    '  if(fin.z>0.){ vec2 q=finLocal(ps); float t=q.x/fin.z; float h=fin.z*naca(t); float df=(t<0.||t>1.)?1e3:abs(q.y)-h;',
    '    if(t<0.) df=length(q); if(t>1.) df=length(q-vec2(fin.z,0.));',
    '    a=max(a,1.-smoothstep(-px,px,df)); edge=max(edge,1.-smoothstep(0.,1.6*px,abs(df))); }',
    '  col=mix(col,vec3(.055,.06,.07),a);',
    '  col=mix(col,vec3(.93,.92,.9),edge*.85);',
    '  o=vec4(col,1.);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
    return { p: p, u: u };
  }
  function hex(h) { h = parseInt(h.replace('#', ''), 16); return [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]; }

  /**
   * new Wake(canvas, opts)
   *  opts.mode      0 = two-colour dye shed from the cylinder, 1 = inlet smoke rake
   *  opts.cells     approximate lattice size (cells)
   *  opts.cyl       [x, y] cylinder home, as fractions of the domain
   *  opts.d         cylinder diameter as a fraction of domain height
   *  opts.fin       null | { x: leading edge, from cylinder centre in diameters, chord: in diameters }
   *  opts.re        Reynolds number (based on cylinder diameter)
   *  opts.onProbe   fn({st, trace}) called ~15×/s with the probe signal
   */
  function Wake(canvas, opts) {
    this.o = opts || {};
    this.canvas = canvas;
    var gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('WebGL2 float render targets unavailable');
    this.gl = gl;
    this.pStep = program(gl, STEP);
    this.pDye = program(gl, DYE);
    this.pShow = program(gl, SHOW);
    var vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.u0 = 0.1;
    this.cyl = [0, 0, 0]; this.cylTarget = null; this.cylV = [0, 0];
    this.finOn = !!this.o.fin; this.cylOn = true;
    this.steps = 10; this.running = false; this.visible = true;
    this.finAngle = 0; this.finOmega = 0; this._n = 0; this._last = 0;
    this.trace = new Float32Array(180); this.traceN = 0;
    this.stepCount = 0; this.crossings = []; this.lastV = 0; this.st = null;
    this.colors = { a: hex(this.o.colorA || '#ff5b1f'), b: hex(this.o.colorB || '#4fb4ff'), s: hex('#d9d6cf'), bg: hex(this.o.bg || '#07080a') };
    this.resize(true);
    this._frame = this._frame.bind(this);
  }

  Wake.prototype.resize = function (force) {
    var gl = this.gl, c = this.canvas;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    // a canvas that hasn't been laid out yet (hidden tab, zero-size pane) falls back to the window's shape
    var cw = c.clientWidth || window.innerWidth || 1280, ch = c.clientHeight || window.innerHeight || 720;
    if (this.o.fixed) { cw = this.o.fixed[0]; ch = this.o.fixed[1]; dpr = 1; }   // fixed pixel size, e.g. when used as a texture
    var w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    var asp = Math.min(4, Math.max(0.35, cw / ch));
    var cells = this.o.cells || 90000;
    var NY = Math.round(Math.sqrt(cells / asp)), NX = Math.round(NY * asp);
    NY = Math.max(90, NY); NX = Math.max(120, NX);
    if (!force && Math.abs(NX - this.NX) < 8 && Math.abs(NY - this.NY) < 8) return;   // ignore tiny (mobile URL-bar) resizes
    this.NX = NX; this.NY = NY;
    // geometry scales with the shorter side so the wake reads the same on phones and monitors
    var D = Math.max(10, Math.round((this.o.d || 0.11) * Math.min(NY, NX * 0.62)));
    this.D = D;
    var home = this.o.cyl || [0.22, 0.5];
    this.cyl = [home[0] * NX, home[1] * NY, D / 2];
    this.home = [this.cyl[0], this.cyl[1]];
    if (this.o.fin) {
      // the fin turns freely about a vertical bearing just behind its leading edge
      var chord = this.o.fin.chord * D;
      this.finPivot = [this.cyl[0] + this.o.fin.x * D + 0.15 * chord, this.cyl[1]];
      this.finGeom = [0, 0, chord, 0];
      this.finAngle = 0; this.finOmega = 0; this._placeFin();
    }
    var nu = this.u0 * D / (this.o.re || 160);
    this.omega = 1 / (3 * nu + 0.5);
    this._alloc();
    this.reset();
  };

  Wake.prototype._tex = function (w, h, internal, filter) {
    var gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, internal, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  Wake.prototype._alloc = function () {
    var gl = this.gl, self = this;
    (this._gpu || []).forEach(function (o) { o.tex && o.tex.forEach(function (t) { gl.deleteTexture(t); }); gl.deleteFramebuffer(o.fb); });
    function set(n, w, h, internal, filter) {
      var tex = [], fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      for (var i = 0; i < n; i++) {
        tex.push(self._tex(w, h, internal, filter));
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex[i], 0);
      }
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('incomplete framebuffer');
      return { tex: tex, fb: fb, n: n };
    }
    this.F = [set(3, this.NX, this.NY, gl.RGBA32F, gl.NEAREST), set(3, this.NX, this.NY, gl.RGBA32F, gl.NEAREST)];
    var ds = this.o.dyeScale || 3;
    this.DN = [this.NX * ds, this.NY * ds];
    this.Dy = [set(1, this.DN[0], this.DN[1], gl.RGBA16F, gl.LINEAR), set(1, this.DN[0], this.DN[1], gl.RGBA16F, gl.LINEAR)];
    this._gpu = this.F.concat(this.Dy);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  Wake.prototype._geom = function (P) {
    var gl = this.gl;
    gl.uniform3f(P.u.cyl, this.cyl[0], this.cyl[1], this.cylOn ? this.cyl[2] : 0);
    var f = this.finGeom;
    gl.uniform4f(P.u.fin, f ? f[0] : 0, f ? f[1] : 0, f && this.finOn ? f[2] : 0, f ? f[3] : 0);
  };

  Wake.prototype._bindF = function (P, set) {
    var gl = this.gl;
    for (var i = 0; i < 3; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, set.tex[i]); }
    gl.uniform1i(P.u.F0, 0); gl.uniform1i(P.u.F1, 1); gl.uniform1i(P.u.F2, 2);
  };

  Wake.prototype._step = function (init) {
    var gl = this.gl, P = this.pStep, src = this.F[0], dst = this.F[1];
    gl.useProgram(P.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    gl.viewport(0, 0, this.NX, this.NY);
    this._bindF(P, src);
    gl.uniform2i(P.u.N, this.NX, this.NY);
    gl.uniform1f(P.u.omega, this.omega);
    gl.uniform1f(P.u.u0, this.u0);
    gl.uniform2f(P.u.cylV, this.cylV[0], this.cylV[1]);
    gl.uniform1i(P.u.init, init ? 1 : 0);
    var fp = this.finPivot || [0, 0];
    gl.uniform3f(P.u.finRot, fp[0], fp[1], this.finOn ? this.finOmega : 0);
    this._geom(P);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.F = [dst, src];
  };

  Wake.prototype._dye = function (dt) {
    var gl = this.gl, P = this.pDye, src = this.Dy[0], dst = this.Dy[1];
    gl.useProgram(P.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, this.DN[0], this.DN[1]);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex[0]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.F[0].tex[2]);
    gl.uniform1i(P.u.D, 0); gl.uniform1i(P.u.F2, 1);
    gl.uniform2i(P.u.N, this.NX, this.NY);
    gl.uniform2f(P.u.DN, this.DN[0], this.DN[1]);
    gl.uniform1f(P.u.dt, dt);
    gl.uniform1f(P.u.decay, Math.pow(this.o.decay || 0.9965, dt / 10));
    gl.uniform1i(P.u.mode, this.o.mode || 0);
    gl.uniform1f(P.u.rake, Math.max(6, this.D * 0.42));
    this._geom(P);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.Dy = [dst, src];
  };

  Wake.prototype._show = function () {
    var gl = this.gl, P = this.pShow, c = this.colors;
    gl.useProgram(P.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.Dy[0].tex[0]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.F[0].tex[2]);
    gl.uniform1i(P.u.D, 0); gl.uniform1i(P.u.F2, 1);
    gl.uniform2i(P.u.N, this.NX, this.NY);
    gl.uniform2f(P.u.R, this.canvas.width, this.canvas.height);
    gl.uniform1i(P.u.mode, this.o.mode || 0);
    gl.uniform3fv(P.u.cA, c.a); gl.uniform3fv(P.u.cB, c.b); gl.uniform3fv(P.u.cS, c.s); gl.uniform3fv(P.u.bg, c.bg);
    gl.uniform1f(P.u.vort, 1 / (this.u0 / this.D * 2.2));
    this._geom(P);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  Wake.prototype.reset = function () {
    this._step(true); this._step(true);
    var gl = this.gl;
    this.Dy.forEach(function (s) { gl.bindFramebuffer(gl.FRAMEBUFFER, s.fb); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); });
    this.crossings = []; this.st = null; this.traceN = 0; this.stepCount = 0;
    // develop a fully shed street before it is shown: ~one flow-through, spread over a few frames
    this.warm = Math.round(this.NX / this.u0 * 1.1);
  };

  // Read the velocity of one lattice cell back from the GPU → [ux, uy] in lattice units.
  Wake.prototype._sample = function (x, y) {
    var gl = this.gl, buf = this._pb || (this._pb = new Float32Array(4));
    x = Math.max(0, Math.min(this.NX - 1, Math.round(x))); y = Math.max(0, Math.min(this.NY - 1, Math.round(y)));
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.F[0].fb);
    gl.readBuffer(gl.COLOR_ATTACHMENT2);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, buf);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    return [buf[1], buf[2]];
  };

  Wake.prototype._placeFin = function () {
    var c = this.finGeom[2], a = this.finAngle, p = this.finPivot;
    this.finGeom[0] = p[0] - 0.15 * c * Math.cos(a);
    this.finGeom[1] = p[1] - 0.15 * c * Math.sin(a);
    this.finGeom[3] = a;
  };

  // Passive pitch. The fin sits on a free bearing, so the wake — not a script — sets its angle:
  // it weathervanes toward the flow arriving at its leading edge, which swings side to side as each
  // vortex of the street goes by. A torsional spring–damper (the bearing's inertia and friction)
  // turns that into a smooth slalom; the fin's rotation feeds back into the flow as a moving wall.
  Wake.prototype._pitch = function (dt) {
    if (!this.finGeom) return;
    if (!this.finOn) { this.finAngle = this.finOmega = 0; this._placeFin(); return; }
    var c = this.finGeom[2], p = this.finPivot;
    var u = this._sample(p[0] - 0.6 * c, p[1]);
    var alpha = Math.atan2(u[1], Math.max(1e-4, u[0]));
    var fs = 0.19 * this.u0 / this.D;                       // expected shedding frequency, per step
    var wn = 2 * Math.PI * fs * 2.4, zeta = 0.5, lim = 0.55;
    var target = Math.max(-lim, Math.min(lim, alpha * 1.1));
    var n = Math.max(1, Math.ceil(dt / 4)), h = dt / n, a = this.finAngle, w = this.finOmega;
    for (var i = 0; i < n; i++) { w += (wn * wn * (target - a) - 2 * zeta * wn * w) * h; a += w * h; }
    if (a > lim) { a = lim; w = Math.min(w, 0); } else if (a < -lim) { a = -lim; w = Math.max(w, 0); }
    this.finAngle = a; this.finOmega = w;
    this._placeFin();
  };

  // Probe: v_y one wake-length behind the cylinder → Strouhal number from zero crossings.
  Wake.prototype._probe = function () {
    var v = this._sample(Math.min(this.NX - 3, this.cyl[0] + 4.5 * this.D), this.cyl[1])[1] / this.u0;
    this.trace.copyWithin(0, 1); this.trace[this.trace.length - 1] = v; this.traceN++;
    // upward zero crossings (with hysteresis) → shedding period in lattice steps
    if (this.lastV < -0.02 && v >= 0 && this._armed !== false) {
      this.crossings.push(this.stepCount); this._armed = false;
      if (this.crossings.length > 6) this.crossings.shift();
    }
    if (v < -0.05) this._armed = true;
    this.lastV = v;
    var cr = this.crossings;
    if (cr.length >= 3 && this.stepCount - cr[cr.length - 1] < 3 * (cr[cr.length - 1] - cr[cr.length - 2])) {
      var T = (cr[cr.length - 1] - cr[0]) / (cr.length - 1);
      this.st = this.D / (T * this.u0);
    } else if (cr.length && this.stepCount - cr[cr.length - 1] > 4000) { this.st = null; this.crossings = []; }
  };

  Wake.prototype.moveTo = function (fx, fy) {       // fractions of the canvas, y down
    this.cylTarget = [fx * this.NX, (1 - fy) * this.NY];
  };
  Wake.prototype.goHome = function () { this.cylTarget = this.home.slice(); };

  Wake.prototype.setObstacles = function (cylOn, finOn) {
    this.cylOn = cylOn; this.finOn = finOn;
    this.crossings = []; this.st = null;
  };

  Wake.prototype._frame = function (t) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this._frame);
    this.tick(t);
  };

  /** Advance and draw one frame. Returns true once the flow is developed. */
  Wake.prototype.tick = function (t) {
    if (t == null) t = performance.now();
    if (this.warm > 0) {                                  // warm-up in chunks so no single frame blocks the GPU
      var n = Math.min(this.warm, 300);
      for (var w = 0; w < n; w += 10) { for (var k = 0; k < 10; k++) this._step(false); this._dye(10); }
      this.warm -= n; this.stepCount += n;
      this._show();
      if (this.warm <= 0) { this._last = 0; this.o.onReady && this.o.onReady(); }
      return false;
    }
    var dtms = this._last ? t - this._last : 16.7; this._last = t;
    // adapt work per frame to the device: aim for a steady frame, never a stutter
    this._ft = this._ft ? this._ft * 0.92 + dtms * 0.08 : dtms;
    if (++this._n % 30 === 0) {
      if (this._ft > 21 && this.steps > 4) this.steps -= 2;
      else if (this._ft < 17.5 && this.steps < 14) this.steps += 1;
    }
    // ease the cylinder toward the pointer at a stable lattice speed (≤ 0.05 cells/step)
    this.cylV = [0, 0];
    if (this.cylTarget && this.cylOn) {
      var dx = this.cylTarget[0] - this.cyl[0], dy = this.cylTarget[1] - this.cyl[1];
      var R = this.cyl[2], NX = this.NX, NY = this.NY;
      var dist = Math.hypot(dx, dy);
      if (dist > 0.05) {
        var sp = Math.min(dist / this.steps * 0.12, 0.05);
        var vx = dx / dist * sp, vy = dy / dist * sp;
        this.cylV = [vx, vy];
      }
    }
    for (var i = 0; i < this.steps; i++) {
      if (this.cylV[0] || this.cylV[1]) {
        this.cyl[0] = Math.min(this.NX * 0.6, Math.max(this.cyl[2] + 6, this.cyl[0] + this.cylV[0]));
        this.cyl[1] = Math.min(this.NY - this.cyl[2] - 6, Math.max(this.cyl[2] + 6, this.cyl[1] + this.cylV[1]));
      }
      this._step(false); this.stepCount++;
    }
    this._pitch(this.steps);
    this._dye(this.steps);
    this._show();
    if (this.o.onProbe && this._n % 2 === 0) {
      this._probe();
      if (this._n % 4 === 0) this.o.onProbe({ st: this.st, trace: this.trace, steps: this.steps, grid: [this.NX, this.NY], re: this.o.re || 160, fps: 1000 / this._ft });
    }
    return true;
  };

  Wake.prototype.start = function () {
    if (this.running) return;
    this.running = true; this._last = 0; this._n = this._n || 0;
    this.raf = requestAnimationFrame(this._frame);
  };
  Wake.prototype.stop = function () { this.running = false; cancelAnimationFrame(this.raf); };

  window.Wake = Wake;
})();
