// Debounced, serialized editor updates. Opening Generate never changes the map.
export function createLiveMapGeneration({bridge, generate, onStatus, onResult, onError, onUndo, delay=350, automatic=true}) {
  let timer, revision=0, pending=null, queue=Promise.resolve(), before=null, saveId=null, valid=true;
  let catalogPromise;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const catalog=()=>catalogPromise||(catalogPromise=Promise.resolve().then(()=>bridge.catalog()).catch(error=>{catalogPromise=null;throw error;}));
  const run=()=>{
    clearTimeout(timer);
    if(!pending)return queue;
    const request=pending;pending=null;
    queue=queue.then(async()=>{
      if(request.revision!==revision)return;
      let original, applying=false;
      try {
        const definitions=await catalog();
        if(request.revision!==revision)return;
        original=clone(bridge.snapshot());
        const result=generate(request.options,definitions,original);
        if(request.revision!==revision)return;
        if(result.report.errors.length){valid=false;onResult(result,false);return;}
        const snapshot=clone(result.snapshot);
        if(saveId)snapshot.id=saveId;
        applying=true;
        const id=await bridge.apply(snapshot);
        if(!before)before=original;
        saveId=id||snapshot.id||null;
        onUndo(true);
        if(request.revision===revision){valid=true;onResult(result,true);}
      } catch(error) {
        if(applying){try{await bridge.apply(original);}catch(rollback){error=new Error(`${error.message}. Restore failed: ${rollback.message}`);}}
        if(request.revision===revision){valid=false;onError(error);}
      }
    });
    return queue;
  };
  return {
    request(options){revision++;pending={revision,options:clone(options)};valid=false;clearTimeout(timer);onStatus(automatic?'Updating map…':'Settings changed. Click Update map to apply.');if(automatic)timer=setTimeout(run,delay);},
    reject(error){revision++;pending=null;clearTimeout(timer);valid=false;onError(error);},
    cancel(){revision++;pending=null;clearTimeout(timer);valid=true;},
    async flush(){await run();return valid;},
    async undo(){
      revision++;pending=null;clearTimeout(timer);
      queue=queue.then(async()=>{
        if(!before)return;
        try{await bridge.apply(before);before=null;saveId=null;valid=true;onUndo(false);onStatus('Previous map restored. Change an option to generate again.');}
        catch(error){valid=false;onError(error);}
      });
      await queue;
    }
  };
}
