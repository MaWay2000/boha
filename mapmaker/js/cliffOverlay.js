// Preview-only, batched geometry: no map data or textures are modified.
export function createCliffOverlay(THREE,mapTiles,tileTypes,heightAt) {
  const fill=[],indices=[],lines=[];
  for(let y=0;y<mapTiles.length;y++)for(let x=0;x<(mapTiles[y]?.length||0);x++){
    if(tileTypes[mapTiles[y][x]]!==8)continue;
    const corners=[[x,heightAt(x,y)+0.06,y],[x+1,heightAt(x+1,y)+0.06,y],[x+1,heightAt(x+1,y+1)+0.06,y+1],[x,heightAt(x,y+1)+0.06,y+1]];
    const centre=[x+0.5,corners.reduce((n,p)=>n+p[1],0)/4,y+0.5],base=fill.length/3;
    fill.push(...centre,...corners.flat());
    for(let i=0;i<4;i++){
      indices.push(base,base+1+(i+1)%4,base+1+i);
      const a=corners[i],b=corners[(i+1)%4];
      lines.push(a[0],a[1]+0.02,a[2],b[0],b[1]+0.02,b[2]);
      lines.push(a[0],a[1]+0.02,a[2],centre[0],centre[1]+0.02,centre[2]);
    }
  }
  const group=new THREE.Group();
  if(!fill.length)return group;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(fill,3));geometry.setIndex(indices);geometry.computeBoundingSphere();
  const tint=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xff3030,transparent:true,opacity:0.24,side:THREE.DoubleSide,depthWrite:false}));
  tint.layers.set(1);tint.renderOrder=5;group.add(tint);
  const wire=new THREE.BufferGeometry();wire.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));wire.computeBoundingSphere();
  const crosses=new THREE.LineSegments(wire,new THREE.LineBasicMaterial({color:0xff3030,transparent:true,opacity:0.95,depthWrite:false}));
  crosses.layers.set(1);crosses.renderOrder=6;group.add(crosses);
  return group;
}
export function disposeCliffOverlay(group) {
  if(!group)return;
  group.traverse(child=>{child.geometry?.dispose();child.material?.dispose();});
}
