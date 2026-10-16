const assert=require('node:assert/strict');
(async()=>{
  for(const path of ['./js/localSavePreview.js']){
    const {buildLocalSavePreview}=await import(path);
    assert.equal(buildLocalSavePreview(null),null);
    assert.equal(buildLocalSavePreview({mapW:99999,mapH:10,mapTiles:[],mapHeights:[]}),null);
    const map={name:'Small map',mapW:3,mapH:2,tilesetIndex:0,mapTiles:[[0,1,2],[0,0,0]],mapHeights:[[0,30,60],[0,30,60]],tileTypesById:[0,7,8],
      structures:[{position:[128,128,0],startpos:1},{position:[-1,0,0],startpos:0}],droids:[{position:{x:64,y:64},player:0}],
      features:[{name:'OilResource',position:[256,128,0]},{name:'Tree',position:[128,128,0]}]};
    const original=JSON.stringify(map),a=buildLocalSavePreview(map);
    assert.equal(a.width,3);assert.equal(a.height,2);assert.equal(a.pixels.length,24);
    assert.equal(a.markers.length,3);assert.equal(a.markers[0].color,'#ffd447');
    assert(a.pixels[6]>a.pixels[4],'water is blue');
    assert.notDeepEqual([...a.pixels.slice(12,15)],[...a.pixels.slice(20,23)],'elevation shading is visible');
    assert.equal(JSON.stringify(map),original,'preview does not mutate the saved map');
    assert.deepEqual(buildLocalSavePreview(map),a,'preview is deterministic');
    const urban=buildLocalSavePreview({...map,tilesetIndex:1});assert.notDeepEqual(urban.pixels,a.pixels,'tileset affects terrain colors');
  }
  console.log('PASS: saved preview terrain, water, elevation, tilesets, dots, aspect dimensions, invalid data and no map mutation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
