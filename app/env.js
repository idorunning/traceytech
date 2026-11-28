/* ===================== environment (Three.js) =====================
   Your world as a map. A central hub, the sources it reads, the projects they
   feed, and every asset, email and event in between, joined where they really
   connect. It sits far back and out of focus so it never fights the words.
   Opening the map pulls it into focus; opening an item pulls focus to its node. */
const env={focus:0,target:0,look:null,hot:null,mx:.5,my:.5,tx:.5,ty:.5,scroll:0,map:0,mapGoal:0,think:0,thinkGoal:0,
  crit:()=>[],pick:null,onPulse:null,onFrame:null,live:false,burst:()=>{},ripple:()=>{},setNodes:()=>{},setGraph:()=>{},screen:()=>[]};
function initEnv(){
  const canvas=document.getElementById('env');let ok=false;
  try{
    if(!window.THREE)throw 0;
    const small=Math.min(innerWidth,innerHeight)<700;
    const renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,small?1.25:1.25));
    renderer.setClearColor(0x09090a,1);
    const scene=new THREE.Scene();
    const cam=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.1,300);
    const world=new THREE.Group();scene.add(world);
    const graphG=new THREE.Group();world.add(graphG);
    const PAPER=[.94,.93,.91],RED=[.9,.2,.17];
    const U={uT:{value:0},uPR:{value:renderer.getPixelRatio()},uFD:{value:10},uAp:{value:.3},uHot:{value:0},uMap:{value:0},uDim:{value:1}};
    const DRIFT=`vec3 drift(vec3 p,float s){return p+.09*vec3(sin(uT*.31+s*6.),sin(uT*.27+s*4.),cos(uT*.23+s*5.));}`;
    const driftJS=(p,s,t,o)=>o.set(p.x+.09*Math.sin(t*.31+s*6),p.y+.09*Math.sin(t*.27+s*4),p.z+.09*Math.cos(t*.23+s*5));

    /* nodes: soft bokeh discs whose blur grows with distance from the focal plane */
    const nodeMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:U,
      vertexShader:`uniform float uT,uPR,uFD,uAp,uHot,uDim;attribute float aSize,aA,aSeed,aRing,aHot;attribute vec3 aCol;
varying float vA,vCoc,vRing;varying vec3 vC;${DRIFT}
void main(){vec4 mv=modelViewMatrix*vec4(drift(position,aSeed),1.);float d=-mv.z;
float coc=min(abs(d-uFD)*uAp,3.5);vCoc=coc;vRing=aRing;vC=aCol;
float hot=uHot>.5?mix(.35,1.6,aHot):1.;
vA=aA*hot*uDim/(1.+coc*coc*.45);
gl_PointSize=clamp(aSize*uPR*340./d*(1.+coc*.9)*(1.+aHot*uHot*.5),1.5,120.);gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`varying float vA,vCoc,vRing;varying vec3 vC;
void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
float sharp=pow(max(0.,1.-r),2.2)+smoothstep(.42,.3,r)*.8;
float disc=smoothstep(1.,.86,r);float bokeh=disc*(.42+.58*smoothstep(.55,.95,r));
float ring=smoothstep(.5,.62,r)*smoothstep(.86,.72,r);
float k=mix(sharp,bokeh,clamp(vCoc*.8,0.,1.));k=mix(k,max(ring*1.3,bokeh*.5),vRing);
gl_FragColor=vec4(vC,k*vA);}`});
    /* links: faint lines that fade as they leave the focal plane */
    const lineMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:U,
      vertexShader:`uniform float uT,uFD,uAp,uHot,uDim;attribute float aA,aSeed,aHot;attribute vec3 aCol;varying float vA;varying vec3 vC;${DRIFT}
void main(){vec4 mv=modelViewMatrix*vec4(drift(position,aSeed),1.);float coc=min(abs(-mv.z-uFD)*uAp,3.5);
float hot=uHot>.5?mix(.18,2.6,aHot):1.;vA=aA*hot*uDim/(1.+coc*1.1);vC=aCol;gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`varying float vA;varying vec3 vC;void main(){gl_FragColor=vec4(vC,vA);}`});

    let G={nodes:[],edges:[],byId:new Map()};let pts=null,lines=null;
    const P=new Map();  // id -> Vector3, kept between refreshes so the map never jumps
    function layout(nodes,edges){
      const N=nodes.length,pos=nodes.map(n=>P.get(n.id)?.clone()),vel=nodes.map(()=>new THREE.Vector3());
      const idx=new Map(nodes.map((n,i)=>[n.id,i]));const fresh=pos.map(p=>!p);
      const fib=(i,n,r)=>{const y=1-(i+.5)/n*2,rr=Math.sqrt(1-y*y),a=i*2.39996;return new THREE.Vector3(Math.cos(a)*rr*r,y*r*.8,Math.sin(a)*rr*r);};
      const kinds=k=>nodes.filter(n=>n.kind===k);const S=kinds('source'),Pr=kinds('project');
      nodes.forEach((n,i)=>{if(pos[i])return;
        if(n.kind==='hub')pos[i]=new THREE.Vector3();
        else if(n.kind==='source')pos[i]=fib(S.indexOf(n),S.length,4.6);
        else if(n.kind==='project')pos[i]=fib(Pr.indexOf(n),Pr.length,2.6).applyAxisAngle(new THREE.Vector3(0,1,0),.6);
        else{const par=pos[idx.get(n.near)]||new THREE.Vector3();pos[i]=par.clone().add(new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(1.6));}});
      const E=edges.map(e=>[idx.get(e[0]),idx.get(e[1]),e[2]||1.4]).filter(e=>e[0]!=null&&e[1]!=null);
      const it=fresh.some(Boolean)?(fresh.every(Boolean)?320:120):0;const d=new THREE.Vector3();
      for(let s=0;s<it;s++){const cool=1-s/it;
        for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){d.subVectors(pos[i],pos[j]);let l2=d.lengthSq()+.04;if(l2>36)continue;
          const f=(nodes[i].w||1)*(nodes[j].w||1)*.022/l2;d.multiplyScalar(f/Math.sqrt(l2));vel[i].add(d);vel[j].sub(d);}
        E.forEach(([a,b,L])=>{d.subVectors(pos[b],pos[a]);const l=d.length()||.01;const f=(l-L)*.035;d.multiplyScalar(f/l);vel[a].add(d);vel[b].sub(d);});
        for(let i=0;i<N;i++){if(nodes[i].kind==='hub'){vel[i].set(0,0,0);continue;}
          vel[i].addScaledVector(pos[i],-.004);if(!fresh[i]&&it<200)vel[i].multiplyScalar(.2);
          vel[i].clampLength(0,.35*cool+.02);pos[i].add(vel[i]);vel[i].multiplyScalar(.6);}}
      nodes.forEach((n,i)=>P.set(n.id,pos[i]));return E;
    }
    const SIZE={hub:1.25,source:.5,project:.42,item:.26,asset:.13};
    /* each area (project, or the source for things outside a project) gets its own colour; red is kept for "needs you" */
    const AREA=['#8ab4f8','#81c995','#fdd663','#c58af9','#78d9ec','#ff9fd1','#fcad70','#a8dab5','#d7aefb','#aecbfa','#e6c9a8','#9fe3c8'];
    const rgb=h=>[1,3,5].map(k=>parseInt(h.slice(k,k+2),16)/255);
    function paint(nodes,edges){const by=new Map(nodes.map(n=>[n.id,n]));let c=0;
      nodes.forEach(n=>{n.col=n.kind==='hub'?'#efede8':n.kind==='project'?AREA[c++%AREA.length]:null;});
      nodes.forEach(n=>{if(n.kind==='source')n.col=AREA[c++%AREA.length];});
      const nb=new Map();edges.forEach(([a,b])=>{(nb.get(a)||nb.set(a,[]).get(a)).push(b);(nb.get(b)||nb.set(b,[]).get(b)).push(a);});
      nodes.forEach(n=>{if(n.col)return;const ns=(nb.get(n.id)||[]).map(id=>by.get(id)).filter(Boolean);
        const p=ns.find(x=>x.kind==='project')||ns.find(x=>x.kind==='source')||by.get(n.near);n.col=p&&p.col||'#efede8';n.area=p?p.label:'';});
      nodes.forEach(n=>{if(n.kind==='project'||n.kind==='source')n.area=n.label;});}
    function build(){
      const nodes=G.nodes;paint(nodes,G.edges);const E=layout(nodes,G.edges);G.E=E;
      const n=nodes.length,pos=new Float32Array(n*3),size=new Float32Array(n),a=new Float32Array(n),seed=new Float32Array(n),ring=new Float32Array(n),hot=new Float32Array(n),col=new Float32Array(n*3);
      nodes.forEach((x,i)=>{const p=P.get(x.id);pos.set([p.x,p.y,p.z],i*3);size[i]=(SIZE[x.kind]||.2)*(x.crit?1.55:1);
        a[i]=x.kind==='hub'?1:x.off?.28:x.kind==='asset'?.55:.9;seed[i]=x.kind==='hub'?0:(i*.618)%1*6.28;ring[i]=x.sample||x.off?1:0;
        col.set(x.crit?RED:rgb(x.col||'#efede8'),i*3);x.i=i;});
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSize',new THREE.BufferAttribute(size,1));g.setAttribute('aA',new THREE.BufferAttribute(a,1));
      g.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));g.setAttribute('aRing',new THREE.BufferAttribute(ring,1));g.setAttribute('aHot',new THREE.BufferAttribute(hot,1));g.setAttribute('aCol',new THREE.BufferAttribute(col,3));
      const m=E.length,lp=new Float32Array(m*6),la=new Float32Array(m*2),ls=new Float32Array(m*2),lh=new Float32Array(m*2),lc=new Float32Array(m*6);
      E.forEach(([i,j],k)=>{const A=nodes[i],B=nodes[j];lp.set([pos[i*3],pos[i*3+1],pos[i*3+2],pos[j*3],pos[j*3+1],pos[j*3+2]],k*6);
        const crit=A.crit||B.crit,kinds=A.kind+B.kind;
        const al=crit?.42:/hub/.test(kinds)?(/source/.test(kinds)?.3:.2):/item/.test(kinds)?.22:/project/.test(kinds)?.11:.07;
        la[k*2]=la[k*2+1]=al;ls[k*2]=seed[i];ls[k*2+1]=seed[j];const lcA=crit?RED:rgb(A.col||'#efede8'),lcB=crit?RED:rgb(B.col||'#efede8');lc.set(lcA,k*6);lc.set(lcB,k*6+3);});
      const lg=new THREE.BufferGeometry();
      lg.setAttribute('position',new THREE.BufferAttribute(lp,3));lg.setAttribute('aA',new THREE.BufferAttribute(la,1));lg.setAttribute('aSeed',new THREE.BufferAttribute(ls,1));
      lg.setAttribute('aHot',new THREE.BufferAttribute(lh,1));lg.setAttribute('aCol',new THREE.BufferAttribute(lc,3));
      if(pts){graphG.remove(pts);pts.geometry.dispose();}if(lines){graphG.remove(lines);lines.geometry.dispose();}
      lines=new THREE.LineSegments(lg,lineMat);lines.frustumCulled=false;graphG.add(lines);
      pts=new THREE.Points(g,nodeMat);pts.frustumCulled=false;graphG.add(pts);
      setHot(env.hot,true);
    }
    let hotNow=null;
    function setHot(id,force){if(!pts||(!force&&id===hotNow))return;hotNow=id;
      const h=pts.geometry.attributes.aHot,lh=lines.geometry.attributes.aHot;h.array.fill(0);lh.array.fill(0);
      const n=id&&G.byId.get(id);
      if(n){h.array[n.i]=1;G.E.forEach(([i,j],k)=>{if(i===n.i||j===n.i){lh.array[k*2]=lh.array[k*2+1]=1;h.array[i]=Math.max(h.array[i],.75);h.array[j]=Math.max(h.array[j],.75);}});}
      h.needsUpdate=true;lh.needsUpdate=true;}
    env.setGraph=(graph)=>{G={nodes:graph.nodes,edges:graph.edges,byId:new Map(graph.nodes.map(n=>[n.id,n]))};build();};

    /* the hub: one quiet light at the centre of everything */
    const tex=(draw,w=128)=>{const c=document.createElement('canvas');c.width=c.height=w;draw(c.getContext('2d'),w);return new THREE.CanvasTexture(c);};
    const glowT=tex((x,w)=>{const g=x.createRadialGradient(w/2,w/2,0,w/2,w/2,w/2);g.addColorStop(0,'rgba(255,253,248,.85)');g.addColorStop(.2,'rgba(255,253,248,.22)');g.addColorStop(1,'rgba(255,253,248,0)');x.fillStyle=g;x.fillRect(0,0,w,w);});
    const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glowT,transparent:true,opacity:.2,depthWrite:false,blending:THREE.AdditiveBlending}));halo.scale.set(5,5,1);graphG.add(halo);
    const haloRed=new THREE.Sprite(new THREE.SpriteMaterial({map:glowT,color:0xe5322b,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));haloRed.scale.set(4.2,4.2,1);graphG.add(haloRed);

    /* pulses: each reading travels along the real links into the hub */
    const PN=small?140:220;const pg=new THREE.BufferGeometry();const pp=new Float32Array(PN*3),pa=new Float32Array(PN),pc=new Float32Array(PN*3),ps=new Float32Array(PN),pz=new Float32Array(PN),pr=new Float32Array(PN);
    pg.setAttribute('position',new THREE.BufferAttribute(pp,3));pg.setAttribute('aA',new THREE.BufferAttribute(pa,1));pg.setAttribute('aCol',new THREE.BufferAttribute(pc,3));
    pg.setAttribute('aSize',new THREE.BufferAttribute(ps,1));pg.setAttribute('aSeed',new THREE.BufferAttribute(new Float32Array(PN),1));pg.setAttribute('aRing',new THREE.BufferAttribute(pr,1));pg.setAttribute('aHot',new THREE.BufferAttribute(pz,1));
    const pulses=new THREE.Points(pg,nodeMat);pulses.frustumCulled=false;graphG.add(pulses);
    const free=[...Array(PN).keys()];const flows=[];let rip=0;
    function spawn(name,msg){const src=G.nodes.find(n=>n.kind==='source'&&n.label===name);if(!src||free.length<8)return;
      const kids=G.E.filter(([i,j])=>i===src.i||j===src.i).map(([i,j])=>G.nodes[i===src.i?j:i]).filter(n=>n.kind!=='hub');
      const from=kids.length?kids[Math.floor(Math.random()*kids.length)]:null;
      const path=[from,src,G.nodes.find(n=>n.kind==='hub')].filter(Boolean).map(n=>P.get(n.id));
      const ids=free.splice(0,8);flows.push({path,ids,t:0,dur:1.6+path.length*.3,crit:!!(msg&&msg.crit),msg,done:false,src});}
    env.burst=()=>{G.nodes.filter(n=>n.kind==='source').forEach((n,i)=>setTimeout(()=>spawn(n.label,null),i*120));};
    env.ripple=()=>{rip=1;};
    env.setNodes=()=>{};
    const along=(path,u,o)=>{const L=path.length-1;const f=Math.min(L-1e-4,Math.max(0,u*L));const k=Math.floor(f),e=f-k;return o.lerpVectors(path[k],path[k+1],e);};

    /* far dust, deliberately out of focus */
    const DN=small?160:280;const dg=new THREE.BufferGeometry();const dp=new Float32Array(DN*3),da=new Float32Array(DN),dsz=new Float32Array(DN),dc=new Float32Array(DN*3),dsd=new Float32Array(DN);
    for(let k=0;k<DN;k++){const r=9+Math.random()*28,th=Math.random()*6.283,ph=Math.acos(2*Math.random()-1);
      dp.set([r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*.6,r*Math.sin(ph)*Math.sin(th)],k*3);da[k]=.08+Math.random()*.16;dsz[k]=.05+Math.random()*.12;dc.set(PAPER,k*3);dsd[k]=Math.random()*6.28;}
    dg.setAttribute('position',new THREE.BufferAttribute(dp,3));dg.setAttribute('aA',new THREE.BufferAttribute(da,1));dg.setAttribute('aSize',new THREE.BufferAttribute(dsz,1));
    dg.setAttribute('aCol',new THREE.BufferAttribute(dc,3));dg.setAttribute('aSeed',new THREE.BufferAttribute(dsd,1));dg.setAttribute('aRing',new THREE.BufferAttribute(new Float32Array(DN),1));dg.setAttribute('aHot',new THREE.BufferAttribute(new Float32Array(DN),1));
    const dust=new THREE.Points(dg,nodeMat);dust.frustumCulled=false;world.add(dust);

    /* layout + camera */
    let portrait=true;const base=new THREE.Vector3();
    let sw=0,sh=0;const size=()=>{const w=innerWidth,h=Math.max(innerHeight,document.documentElement.clientHeight);if(w===sw&&sh&&Math.abs(h-sh)<160)return;sh=w===sw?Math.max(h,sh):h;sw=w;renderer.setSize(sw,sh,false);cam.aspect=sw/sh;portrait=cam.aspect<1;
      cam.fov=portrait?50:38;if(portrait)base.set(0,2.6,0);else base.set(cam.aspect>1.5?3.4:2.2,.9,0);cam.updateProjectionMatrix();};
    size();addEventListener('resize',size);let lost=false;canvas.addEventListener('webglcontextlost',ev=>{ev.preventDefault();lost=true;},false);canvas.addEventListener('webglcontextrestored',()=>{lost=false;},false);
    addEventListener('deviceorientation',e=>{if(e.gamma==null)return;env.tx=.5+Math.max(-1,Math.min(1,e.gamma/35))*.5;env.ty=.5+Math.max(-1,Math.min(1,(e.beta-45)/35))*.5;},{passive:true});
    // in map mode: one finger turns it, two fingers pinch to zoom and slide it about, the wheel zooms, a double tap zooms in
    let drag=null,rotY=0,rotX=0,velY=.0;const ptr=new Map();let pinch=null,lastTap=0,moved=0;
    env.zoom=1;env.zoomGoal=1;env.pan={x:0,y:0};const panGoal={x:0,y:0};
    const clampZ=z=>Math.max(.5,Math.min(3.6,z));
    env.zoomBy=f=>{env.zoomGoal=clampZ(env.zoomGoal*f);};
    env.resetView=()=>{env.zoomGoal=1;panGoal.x=panGoal.y=0;rotX=0;};
    env.centre=()=>{panGoal.x=panGoal.y=0;env.zoomGoal=Math.max(env.zoomGoal,1.45);};
    const unit=()=>2*Math.tan(cam.fov*Math.PI/360)*Math.max(4,cam.position.z)/Math.max(1,sh);
    const two=()=>{const [a,b]=[...ptr.values()];return {d:Math.hypot(a.x-b.x,a.y-b.y)||1,x:(a.x+b.x)/2,y:(a.y+b.y)/2};};
    canvas.addEventListener('pointerdown',e=>{if(env.map<.5)return;ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});try{canvas.setPointerCapture(e.pointerId);}catch(_){}
      if(ptr.size===1){drag={x:e.clientX,y:e.clientY};moved=0;}else if(ptr.size===2){drag=null;pinch=two();pinch.z=env.zoomGoal;moved+=99;}});
    canvas.addEventListener('pointermove',e=>{if(!ptr.has(e.pointerId))return;ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(ptr.size>=2&&pinch){const c=two();env.zoomGoal=clampZ(pinch.z*c.d/pinch.d);const u=unit();panGoal.x+=(c.x-pinch.x)*u;panGoal.y-=(c.y-pinch.y)*u;pinch.x=c.x;pinch.y=c.y;return;}
      if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};moved+=Math.abs(dx)+Math.abs(dy);
      velY=dx*.006/Math.sqrt(env.zoom);rotY+=velY;rotX=Math.max(-.9,Math.min(.9,rotX+dy*.005/Math.sqrt(env.zoom)));});
    const endDrag=e=>{ptr.delete(e.pointerId);if(ptr.size<2)pinch=null;
      if(ptr.size===1){const [p]=[...ptr.values()];drag={x:p.x,y:p.y};return;}
      if(ptr.size===0&&drag&&moved<10&&e.type==='pointerup'){const now=performance.now();
        if(now-lastTap<330){lastTap=0;env.zoomBy(1.7);}else{lastTap=now;env.onEmptyTap&&env.onEmptyTap();}}
      drag=null;};
    canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
    canvas.addEventListener('wheel',e=>{if(env.map<.5)return;e.preventDefault();if(e.ctrlKey||Math.abs(e.deltaY)>=Math.abs(e.deltaX))env.zoomBy(Math.exp(-e.deltaY*(e.ctrlKey?.01:.0016)));else{panGoal.x-=e.deltaX*unit();}},{passive:false});
    addEventListener('keydown',e=>{if(env.map<.5||/INPUT|TEXTAREA/.test((e.target&&e.target.tagName)||''))return;
      if(e.key==='+'||e.key==='=')env.zoomBy(1.25);else if(e.key==='-'||e.key==='_')env.zoomBy(.8);else if(e.key==='0')env.resetView();
      else if(e.key==='ArrowLeft')rotY-=.15;else if(e.key==='ArrowRight')rotY+=.15;else if(e.key==='ArrowUp')rotX=Math.max(-.9,rotX-.1);else if(e.key==='ArrowDown')rotX=Math.min(.9,rotX+.1);});

    const look=new THREE.Vector3(),lookGoal=new THREE.Vector3(),tmp=new THREE.Vector3(),hubW=new THREE.Vector3(),hotW=new THREE.Vector3(),v=new THREE.Vector3();
    let last=performance.now(),t=0,next=.8,blurNow=-1,frame=0;
    env.screen=()=>{const out=[];const w=innerWidth,h=innerHeight;
      G.nodes.forEach(n=>{if(!n.label)return;driftJS(P.get(n.id),n.kind==='hub'?0:(n.i*.618)%1*6.28,t,tmp);
        v.copy(tmp);graphG.localToWorld(v);v.project(cam);if(v.z>1)return;out.push({n,x:(v.x*.5+.5)*w,y:(-v.y*.5+.5)*h,z:v.z});});return out;};
    const loop=(now)=>{
      const dt=Math.min(.05,(now-last)/1000);last=now;if(!reduce)t+=dt;
      env.mx+=(env.tx-env.mx)*.04;env.my+=(env.ty-env.my)*.04;env.focus+=(env.target-env.focus)*.06;
      env.map+=(env.mapGoal-env.map)*.06;env.think+=(env.thinkGoal-env.think)*.04;rip*=Math.pow(.3,dt);
      const M=env.map,sc=Math.min(1.4,env.scroll)*(1-M);const crit=env.crit().length>0;
      env.zoom+=(env.zoomGoal-env.zoom)*.18;env.pan.x+=(panGoal.x-env.pan.x)*.25;env.pan.y+=(panGoal.y-env.pan.y)*.25;
      U.uT.value=t;setHot(env.hot||(M<.5?env.look&&('s:'+env.look):null));U.uHot.value=hotNow?1:0;

      // the graph turns slowly; scrolling carries it further away
      if(!drag){rotY+=(M>.5?velY:0)+dt*(M>.5?.02:.035);velY*=.95;}
      graphG.rotation.y=rotY+(env.mx-.5)*.4*(1-M);graphG.rotation.x=rotX*M+(env.my-.5)*.15+.12;
      graphG.position.set(base.x*(1-M),base.y*(1-M)+sc*(portrait?2.2:1.2),-sc*6);
      const br=1+Math.sin(t*.9)*.05+rip*.25+env.think*.2;halo.scale.set(5*br,5*br,1);
      halo.material.opacity=(.16+env.think*.1+rip*.12)*(1-sc*.4);
      haloRed.material.opacity=(crit?.07+.06*Math.sin(t*2.4):0);

      // pulses
      for(let fi=flows.length-1;fi>=0;fi--){const f=flows[fi];f.t+=dt/f.dur;let alive=false;
        f.ids.forEach((k,j)=>{const u=f.t-j*.03;const vis=u>0&&u<1;if(vis)alive=true;along(f.path,Math.max(0,Math.min(1,u)),tmp);pp.set([tmp.x,tmp.y,tmp.z],k*3);
          pa[k]=vis?(1-j/8)*.95:0;ps[k]=j===0?.32:.16;pc.set(f.crit?RED:PAPER,k*3);});
        if(!f.done&&f.t>=1){f.done=true;rip=Math.min(1,rip+.5);env.onPulse&&f.msg&&env.onPulse(f.msg);}
        if(!alive&&f.done){f.ids.forEach(k=>{pa[k]=0;});free.push(...f.ids);flows.splice(fi,1);}}
      pg.attributes.position.needsUpdate=true;pg.attributes.aA.needsUpdate=true;pg.attributes.aCol.needsUpdate=true;pg.attributes.aSize.needsUpdate=true;
      if(env.live&&!document.hidden){next-=dt*(1+env.think*2);if(next<=0){const m=env.pick&&env.pick();if(m)spawn(m.name,m);next=1.6+Math.random()*1.6;}}
      dust.rotation.y=t*.01;

      // camera: far back and defocused, unless the map is open or an item is in focus
      graphG.getWorldPosition(hubW);
      const hn=hotNow&&G.byId.get(hotNow);
      if(hn){driftJS(P.get(hn.id),(hn.i*.618)%1*6.28,t,hotW);graphG.localToWorld(hotW);}
      const pull=hn?Math.max(env.focus,M):0;
      const z=M>.5?(portrait?30:19)/env.zoom:(portrait?19:15.5)+sc*2;
      lookGoal.copy(hubW);if(M<.5){lookGoal.y-=portrait?2.4:.5;lookGoal.x-=portrait?0:base.x*.92;}
      if(hn)lookGoal.lerp(hotW,.5*pull);
      look.lerp(lookGoal,.05);
      cam.position.x+=((env.mx-.5)*1.6*(1-M)+Math.sin(t*.07)*.4-cam.position.x)*.04;
      cam.position.y+=((.5-env.my)*1*(1-M)+Math.cos(t*.06)*.25-cam.position.y)*.04;
      cam.position.z+=(Math.max(2.6,z-pull*3/Math.max(1,env.zoom))-cam.position.z)*.05;
      const PX=env.pan.x*M,PY=env.pan.y*M;cam.position.x-=PX;cam.position.y-=PY;look.x-=PX;look.y-=PY;cam.lookAt(look);
      // focal plane: in front of the graph normally (so it reads as distant and soft), on it in map mode or on the item in focus
      const dHub=cam.position.distanceTo(hubW);const dHot=hn?cam.position.distanceTo(hotW):dHub;
      U.uFD.value+=(((M>.5||pull>.3)?dHot:dHub*.55)-U.uFD.value)*.06;
      U.uAp.value+=(((M>.5)?.05:pull>.3?.12:.4+sc*.12)-U.uAp.value)*.06;
      U.uDim.value+=((M>.5?1.15:(1-sc*.35)*(1-env.focus*.2))-U.uDim.value)*.06;
      // a gentle real blur on top keeps text crisp against it; it lifts as the map opens
      const blur=Math.round(((1-M)*(1.6+sc*2.6)+env.focus*2)*4)/4;
      
      frame++;if(!lost&&!document.hidden&&(M>.3||env.focus>.05||frame%2===0)){renderer.render(scene,cam);env.onFrame&&env.onFrame();}
      cam.position.x+=PX;cam.position.y+=PY;look.x+=PX;look.y+=PY;
      requestAnimationFrame(loop);};
    requestAnimationFrame(loop);ok=true;
  }catch(e){console.warn('3D scene unavailable',e);}
  if(!ok){canvas.remove();const d=document.createElement('div');d.className='env-fallback';document.body.prepend(d);}
  return ok;
}
