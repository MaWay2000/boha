self.onmessage = async ({data}) => {
  try {
    const url = new URL(data.url);
    if (url.origin !== self.location.origin) throw new Error('Invalid publication origin.');
    const response = await fetch(url, {cache: data.cache || 'default'});
    if (!response.ok) throw new Error('Unable to load published data (' + response.status + ').');
    const text = (await response.text()).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    if (data.sha256 && self.crypto?.subtle) {
      const digest = await self.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      if (hash !== data.sha256) throw new Error('Publication is still updating. Please retry shortly.');
    }
    self.postMessage({value: JSON.parse(text)});
  } catch (error) { self.postMessage({error: error.message}); }
};
