// Rendering policy only: scene objects, camera, and map export data are untouched.
export function previewPixelRatio(quality, deviceRatio=1) {
 return quality==='low'?0.5:quality==='high'?Math.min(deviceRatio||1,2):1;
}
export function wantsAntialias(quality){return quality!=='low';}
const requestedAntialias = new WeakMap();
export function replacePreviewRenderer(previous, THREE, quality, container) {
 const antialias=wantsAntialias(quality);
 if(previous && (requestedAntialias.has(previous)?requestedAntialias.get(previous):previous.getContext().getContextAttributes()?.antialias)===antialias)return previous;
 let next;
 try {
  next=new THREE.WebGLRenderer({antialias});requestedAntialias.set(next,antialias);
  next.setClearColor(0x151e28);
  if(previous?.domElement.style && next.domElement.style)next.domElement.style.cssText=previous.domElement.style.cssText;
  container.appendChild(next.domElement);
 } catch(error){next?.dispose();if(previous)return previous;throw error;}
 if(previous){previous.domElement.remove();previous.dispose();previous.forceContextLoss?.();}
 return next;
}
