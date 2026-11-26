/* TraceyTech glass layer (React Three Fiber).
   One WebGL canvas hosts the map graph (env) and, in front of it, a slab of real
   refracting glass under every tile. The tiles stay HTML so text is crisp and
   accessible; each frame the slabs are placed exactly under them. */
import * as THREE from 'three';
import React,{useRef,useState,useMemo,useEffect} from 'react';
import {createRoot,events,useFrame,useThree} from '@react-three/fiber';
import {MeshTransmissionMaterial,Environment,Lightformer,useFBO} from '@react-three/drei';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
window.THREE=THREE;

const SEL='.board .tile,#pv.on .pv-panel';
const D=3;                       // slabs sit this far in front of the camera
const edgeColor=()=>getComputedStyle(document.documentElement).getPropertyValue('--edge').trim()||'#bfe3ff';
const edgeK=()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--edge-k'))||.85;

function Glass(){
  const {gl,scene,camera,size,viewport}=useThree();
  const group=useRef(),mat=useRef();
  const [col,setCol]=useState(edgeColor);
  const lo=Math.min(window.devicePixelRatio||1,1.25)*.5;
  const fbo=useFBO(Math.max(2,Math.round(size.width*lo)),Math.max(2,Math.round(size.height*lo)),{depthBuffer:true});
  const slabs=useMemo(()=>new Map(),[]);
  const st=useRef({n:0,els:[]});
  useEffect(()=>{camera.add(group.current);return()=>camera.remove(group.current);},[camera]);
  useFrame(()=>{
    const s=st.current,b=document.body;s.n++;
    if(s.n%20===1){s.els=[...document.querySelectorAll(SEL)];if(s.n%60===1){const c=edgeColor();if(c!==col)setCol(c);}}
    const cv=gl.domElement.getBoundingClientRect();
    const k=2*D*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/cv.height;
    const hideBoard=b.classList.contains('paned')||b.classList.contains('map')||b.classList.contains('focused');
    const seen=new Set();
    for(const el of s.els){
      if(!mat.current)break;
      const isPane=el.id==='pv-panel';
      if(!isPane&&hideBoard)continue;
      const r=el.getBoundingClientRect();
      if(r.width<4||r.bottom<cv.top-40||r.top>cv.bottom+40||r.right<cv.left||r.left>cv.right)continue;
      let m=slabs.get(el);
      if(!m){m=new THREE.Mesh(undefined,mat.current);m.userData={w:0,h:0};group.current.add(m);slabs.set(el,m);}
      const w=r.width*k,h=r.height*k;
      if(Math.abs(w-m.userData.w)>k*.75||Math.abs(h-m.userData.h)>k*.75){
        const rad=Math.min(26*k,w/2,h/2),dep=Math.max(rad*2+.002,.2);
        m.geometry&&m.geometry.dispose&&m.geometry!==undefined&&m.userData.w&&m.geometry.dispose();
        m.geometry=new RoundedBoxGeometry(w,h,dep,4,rad);m.userData.w=w;m.userData.h=h;m.userData.d=dep;}
      m.position.set((r.left+r.width/2-cv.left-cv.width/2)*k,-(r.top+r.height/2-cv.top-cv.height/2)*k,-D-m.userData.d/2);
      m.visible=true;seen.add(el);
    }
    for(const [el,m] of slabs){if(!seen.has(el)){m.visible=false;if(!el.isConnected){m.geometry.dispose();group.current.remove(m);slabs.delete(el);}}}
    // pass 1: the world without glass, at half resolution, for the glass to refract
    group.current.visible=false;gl.setRenderTarget(fbo);gl.render(scene,camera);
    // pass 2: everything
    group.current.visible=true;gl.setRenderTarget(null);gl.render(scene,camera);
  },1);
  const kk=edgeK();
  return <>
    <group ref={group}/>
    <mesh visible={false}><planeGeometry args={[.01,.01]}/>
      <MeshTransmissionMaterial ref={mat} buffer={fbo.texture} resolution={2} backsideResolution={2}
        transmission={1} thickness={.28} roughness={.12} ior={1.42} chromaticAberration={.22} anisotropicBlur={0}
        distortion={0} temporalDistortion={0} samples={4} color="#ffffff" attenuationColor="#ffffff" attenuationDistance={2}
        clearcoat={1} clearcoatRoughness={.08} envMapIntensity={.9+kk} specularIntensity={1}/>
    </mesh>
    <Environment key={col+kk} resolution={64} frames={1}>
      <Lightformer form="rect" intensity={3*kk} color={col} position={[0,4,1]} scale={[12,1.2,1]}/>
      <Lightformer form="rect" intensity={2.2*kk} color={col} position={[0,-4,1]} scale={[12,1,1]}/>
      <Lightformer form="rect" intensity={2.5*kk} color={col} position={[-5,0,1]} rotation-y={Math.PI/2} scale={[1,8,1]}/>
      <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[5,1,1]} rotation-y={-Math.PI/2} scale={[1,6,1]}/>
    </Environment>
  </>;
}

window.TTGlass={
  /* host: the fixed #env element. cb receives the renderer, scene and camera,
     plus advance(t) to draw one frame (the environment loop drives timing). */
  mount(host,cb){
    const canvas=document.createElement('canvas');canvas.className='env-c';host.appendChild(canvas);
    const small=Math.min(innerWidth,innerHeight)<700;
    const root=createRoot(canvas);
    const size=()=>({width:host.clientWidth||innerWidth,height:host.clientHeight||innerHeight,top:0,left:0});
    let w0=0;
    const conf=()=>root.configure({events,frameloop:'never',flat:true,linear:true,dpr:[1,1.25],size:size(),
      gl:{antialias:false,alpha:false,powerPreference:'high-performance'},
      camera:{fov:40,near:.1,far:300,position:[0,0,20],manual:true},
      onCreated:s=>{s.scene.add(s.camera);cb({gl:s.gl,scene:s.scene,camera:s.camera,advance:t=>s.advance(t)});}});
    conf();root.render(<Glass/>);
    // only a real size change resizes; the phone address bar showing or hiding does not
    addEventListener('resize',()=>{const z=size();if(z.width!==w0||Math.abs(z.height-(conf.h||0))>160){w0=z.width;conf.h=z.height;root.configure({size:z});}});
    w0=size().width;conf.h=size().height;
  }
};
