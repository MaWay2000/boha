import * as THREE from './three.module.js';
import {drawSoftwareUnit} from './softwareUnitPreview.js';

// One small, on-demand viewport; release its context and meshes when the tab closes.
export function createUnitEditorPreview(host, {buildModel,disposeModel,createRenderer=()=>new THREE.WebGLRenderer({alpha:true,antialias:true}),drawSoftware=drawSoftwareUnit,requestFrame=fn=>requestAnimationFrame(fn),cancelFrame=id=>cancelAnimationFrame(id),observeResize=callback=>typeof ResizeObserver==='function'?new ResizeObserver(callback):null,now=()=>performance.now()}={}) {
  let visible=false,renderer=null,canvas=null,software=false,model=null,version=0,frame=null,resizeObserver=null;
  let desired=null,loadedKey='',loadingKey='',yaw=0,pitch=0.55,zoom=1,radius=1,drag=null,textureDeadline=0;
  const scene=new THREE.Scene(),pivot=new THREE.Group();scene.add(pivot);
  scene.add(new THREE.AmbientLight(0xffffff,0.9));
  const light=new THREE.DirectionalLight(0xffffff,1);light.position.set(3,5,4);scene.add(light);
  const camera=new THREE.PerspectiveCamera(36,1,0.01,1000);
  function releaseModel(item){if(item)disposeModel(item);}
  function pendingTextures(){let pending=false;model?.traverse(child=>{
    const materials=Array.isArray(child.material)?child.material:[child.material];
    for(const mat of materials){if(!mat)continue;for(const tex of [mat.map,mat.userData?.teamColorMask]){
      if(tex&&!tex.image?.complete)pending=true;
    }}
  });return pending;}
  function paint(){
    if(!visible||!model||!canvas)return;
    const width=Math.max(1,host.clientWidth||320),height=Math.max(1,host.clientHeight||220);
    pivot.rotation.y=yaw;model.scale.setScalar(software?zoom:1);
    if(software){drawSoftware(pivot,canvas);return;}
    renderer.setSize(width,height,false);camera.aspect=width/height;
    const half=Math.min(Math.PI/10,Math.atan(Math.tan(Math.PI/10)*camera.aspect));
    const distance=radius/Math.sin(half)*1.15/zoom;
    camera.near=Math.max(distance/1000,0.001);camera.far=Math.max(distance*20,radius*20);
    camera.position.set(Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(pitch)*distance);
    camera.lookAt(0,0,0);camera.updateProjectionMatrix();renderer.render(scene,camera);
  }
  function paintTextures(){
    frame=null;paint();
    if(visible&&model&&pendingTextures()&&now()<textureDeadline)frame=requestFrame(paintTextures);
  }
  function stopFrame(){if(frame!==null){cancelFrame(frame);frame=null;}}
  function startViewport(){
    host.textContent='';software=false;
    try{renderer=createRenderer();renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.5));renderer.setClearColor(0x101923,0);canvas=renderer.domElement;}
    catch(error){renderer?.dispose();renderer=null;software=true;canvas=host.ownerDocument.createElement('canvas');}
    canvas.setAttribute('aria-label','3D unit preview. Drag to rotate; scroll to zoom.');canvas.style.width='100%';canvas.style.height='100%';canvas.style.touchAction='none';host.append(canvas);
    canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={x:event.clientX,y:event.clientY};canvas.setPointerCapture?.(event.pointerId);event.preventDefault();});
    canvas.addEventListener('pointermove',event=>{if(!drag)return;yaw+=(event.clientX-drag.x)*0.015;pitch=Math.max(0.15,Math.min(1.3,pitch+(event.clientY-drag.y)*0.008));drag={x:event.clientX,y:event.clientY};paint();});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{drag=null;});
    canvas.addEventListener('wheel',event=>{event.preventDefault();event.stopPropagation();zoom=Math.max(0.6,Math.min(2.5,zoom*Math.exp(-event.deltaY*0.001)));paint();},{passive:false});
    resizeObserver=observeResize(paint);resizeObserver?.observe(host);
  }
  async function setDesign(design){
    desired=design;if(!visible||!design)return;
    const key=[design.body,design.propulsion,design.weapon,design.bodyScale??1,design.legsScale??1,design.weaponScale??1,...['body','legs','weapon'].map(p=>design.textures?.[p]?.dataURL||'')].join('|');
    if(key===loadedKey||key===loadingKey)return;
    const token=++version;loadingKey=key;delete host.dataset.previewError;host.setAttribute('aria-label','3D unit preview');host.setAttribute('aria-busy','true');
    try{
      const next=await buildModel({...design});
      if(!visible||token!==version){releaseModel(next);return;}
      if(!next)throw new Error('No unit model available.');
      stopFrame();if(model){pivot.remove(model);releaseModel(model);}
      model=next;model.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());
      radius=Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius,0.01);model.position.sub(center);pivot.add(model);
      loadedKey=key;loadingKey='';host.setAttribute('aria-busy','false');textureDeadline=now()+10000;paintTextures();
    }catch(error){if(token!==version||!visible)return;stopFrame();if(model){pivot.remove(model);releaseModel(model);model=null;}loadedKey='';loadingKey='';host.setAttribute('aria-busy','false');host.setAttribute('aria-label','Unit preview unavailable: '+error.message);host.dataset.previewError=error.message;}
  }
  function setVisible(value){
    if(visible===!!value)return;visible=!!value;
    if(visible){startViewport();void setDesign(desired);return;}
    version++;loadingKey='';loadedKey='';stopFrame();drag=null;resizeObserver?.disconnect();resizeObserver=null;
    if(model){pivot.remove(model);releaseModel(model);model=null;}
    renderer?.dispose();renderer?.forceContextLoss?.();renderer=null;canvas=null;host.replaceChildren();host.setAttribute('aria-busy','false');
  }
  return {setDesign,setVisible,dispose:()=>setVisible(false)};
}
