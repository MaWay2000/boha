const assert=require('node:assert/strict');
(async()=>{
 const {createCliffOverlay,disposeCliffOverlay}=await import('./js/cliffOverlay.js');
 class Geometry{setAttribute(key,value){this[key]=value;}setIndex(value){this.indices=value;}computeBoundingSphere(){}dispose(){this.disposed=(this.disposed||0)+1;}}
 class Material{constructor(options){Object.assign(this,options);}dispose(){this.disposed=(this.disposed||0)+1;}}
 class Object3D{constructor(geometry,material){this.geometry=geometry;this.material=material;this.children=[];this.layers={set:value=>{this.layer=value;}};}add(child){this.children.push(child);}traverse(fn){fn(this);this.children.forEach(c=>c.traverse(fn));}}
 const THREE={Group:Object3D,Mesh:Object3D,LineSegments:Object3D,BufferGeometry:Geometry,MeshBasicMaterial:Material,LineBasicMaterial:Material,Float32BufferAttribute:class{constructor(values,size){this.array=values;this.itemSize=size;}},DoubleSide:2};
 const tiles=[[0,1],[2,1]],types=[0,8,7],before=JSON.stringify(tiles);
 const group=createCliffOverlay(THREE,tiles,types,(x,y)=>x+2*y);
 assert.equal(group.children.length,2,'one fill and one line batch');
 const [fill,lines]=group.children;
 assert.equal(fill.geometry.position.array.length,2*5*3);
 assert.equal(fill.geometry.indices.length,2*12);
 assert.equal(lines.geometry.position.array.length,2*8*6,'four borders and four half diagonals per cliff');
 assert.equal(fill.material.color,0xff3030);assert.equal(lines.material.color,0xff3030);
 assert.equal(fill.material.depthWrite,false);assert.equal(lines.material.depthWrite,false);
 assert.equal(fill.layer,1);assert.equal(lines.layer,1,'overlay is outside normal map picking layer');
 assert.equal(fill.geometry.position.array[0],1.5);
 assert(Math.abs(fill.geometry.position.array[1]-2.56)<1e-8,'centre follows the terrain fan');
 assert.equal(JSON.stringify(tiles),before,'preview never modifies terrain');
 disposeCliffOverlay(group);
 for(const child of group.children){assert.equal(child.geometry.disposed,1);assert.equal(child.material.disposed,1);}
 assert.equal(createCliffOverlay(THREE,[[0,2]],types,()=>0).children.length,0,'normal ground and water are not marked');
 const large=createCliffOverlay(THREE,Array.from({length:255},()=>Array(255).fill(1)),types,()=>0);
 assert.equal(large.children.length,2,'maximum-size maps still use just two batches');disposeCliffOverlay(large);
 console.log('PASS: cliff-only red tint and X geometry, terrain alignment, picking isolation, no map mutation, batching and disposal.');
})().catch(error=>{console.error(error);process.exitCode=1;});
