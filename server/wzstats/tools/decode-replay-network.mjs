class ReplayMessageReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.offset = 0;
    this.decoder = new TextDecoder('utf-8', { fatal: true });
  }

  ensure(length) {
    if (length < 0 || this.offset + length > this.bytes.length) throw new Error('Truncated message payload.');
  }

  uint8() { this.ensure(1); return this.bytes[this.offset++]; }
  int8() { const value = this.uint8(); return value > 127 ? value - 256 : value; }
  uint16() { this.ensure(2); const value = this.bytes[this.offset] * 256 + this.bytes[this.offset + 1]; this.offset += 2; return value; }

  uint32() {
    const factors = [78, 95, 32, 70, 0];
    const multipliers = [1, 78, 7410, 237120, 16598400];
    let value = 0;
    for (let index = 0; index < factors.length; index += 1) {
      const byte = this.uint8();
      const isLast = byte < 256 - factors[index];
      value += (isLast ? byte : 256 - factors[index] + 255 - byte) * multipliers[index];
      if (isLast) return value;
    }
    throw new Error('Invalid compressed integer.');
  }

  int32() { const value = this.uint32(); return value % 2 === 0 ? value / 2 : -((value + 1) / 2); }
  boolean() { return this.uint8() !== 0; }

  string() {
    const length = this.uint32();
    this.ensure(length);
    const value = this.decoder.decode(this.bytes.subarray(this.offset, this.offset + length));
    this.offset += length;
    return value;
  }

  done() { return this.offset === this.bytes.length; }
}

function decodeGameTime(payload) {
  const reader = new ReplayMessageReader(payload);
  reader.uint32();
  const gameTime = reader.uint32();
  reader.uint16();
  reader.uint16();
  if (!reader.done()) throw new Error('Unexpected game-time payload.');
  return gameTime;
}

function decodeProduction(payload) {
  const reader = new ReplayMessageReader(payload);
  const player = reader.uint8();
  const structureId = reader.uint32();
  const actionCode = reader.uint8();
  const actionNames = ['manufacture', 'cancelProduction', 'holdProduction', 'releaseProduction', 'holdResearch', 'releaseResearch'];
  const event = { player, structureId, action: actionNames[actionCode] || `structureAction${actionCode}` };
  if (actionCode === 0) {
    event.design = {
      templateName: reader.string(),
      templateId: reader.uint32(),
      droidType: reader.int32(),
      body: reader.uint8(),
      brain: reader.uint8(),
      propulsion: reader.uint8(),
      repairUnit: reader.uint8(),
      ecm: reader.uint8(),
      sensor: reader.uint8(),
      construct: reader.uint8(),
      weapons: [],
    };
    const weaponCount = reader.int8();
    if (weaponCount < 0 || weaponCount > 16) throw new Error('Invalid weapon count.');
    for (let index = 0; index < weaponCount; index += 1) event.design.weapons.push(reader.uint32());
  }
  if (!reader.done()) throw new Error('Unexpected production payload.');
  return event;
}

function decodeResearch(payload) {
  const reader = new ReplayMessageReader(payload);
  const event = {
    player: reader.uint8(),
    started: reader.boolean(),
    structureId: reader.uint32(),
    researchIndex: reader.uint32(),
  };
  if (!reader.done()) throw new Error('Unexpected research payload.');
  return event;
}

function decodePlayerLeft(payload) {
  const reader = new ReplayMessageReader(payload);
  const player = reader.uint32();
  if (!reader.done()) throw new Error('Unexpected player-left payload.');
  return { player };
}

function decodeChat(payload, type) {
  const reader = new ReplayMessageReader(payload);
  if (type === 36) {
    const sender = reader.int32();
    const teamSpecific = reader.boolean();
    const message = reader.string();
    if (!reader.done()) throw new Error('Unexpected chat payload.');
    return { sender, receiver: null, teamSpecific, message, channel: 'player' };
  }
  if (type === 43) {
    const sender = reader.uint32();
    const receiver = reader.uint32();
    const message = reader.string();
    if (!reader.done()) throw new Error('Unexpected AI chat payload.');
    return { sender, receiver, teamSpecific: null, message, channel: 'ai' };
  }
  const sender = reader.uint32();
  const message = reader.string();
  if (!reader.done()) throw new Error('Unexpected spectator chat payload.');
  return { sender, receiver: null, teamSpecific: false, message, channel: 'spectator' };
}

function decodeDroidOrder(payload) {
  const reader = new ReplayMessageReader(payload);
  const player = reader.uint8();
  const subType = reader.uint32();
  const event = { player, subType, droidIds: [] };
  if (subType === 0 || subType === 1) {
    event.order = reader.uint32();
    if (subType === 0) {
      event.targetId = reader.uint32();
      event.targetType = reader.uint32();
    } else {
      event.x = reader.int32();
      event.y = reader.int32();
    }
    if (event.order === 4 || event.order === 6) {
      event.structureRef = reader.uint32();
      event.direction = reader.uint16();
    }
    if (event.order === 6) {
      event.x2 = reader.int32();
      event.y2 = reader.int32();
    }
    if (event.order === 20) event.moduleIndex = reader.uint32();
    event.add = reader.boolean();
  } else if (subType === 2) {
    event.secondaryOrder = reader.uint32();
    event.secondaryState = reader.uint32();
  } else {
    throw new Error(`Unknown droid-order subtype ${subType}.`);
  }
  const count = reader.uint32();
  if (count > 10000) throw new Error('Invalid droid-order count.');
  let droidId = 0;
  for (let index = 0; index < count; index += 1) {
    droidId += reader.uint32();
    event.droidIds.push(droidId);
  }
  if (!reader.done()) throw new Error('Unexpected droid-order payload.');
  return event;
}

function addTimedEvent(collection, event, queuePlayer, queueTimes) {
  collection.push({
    timeMilliseconds: queueTimes.get(queuePlayer) ?? null,
    queuePlayer,
    ...event,
  });
}

export function decodeReplayNetwork(replayBuffer) {
  const bytes = new Uint8Array(replayBuffer.buffer, replayBuffer.byteOffset, replayBuffer.byteLength);
  const view = new DataView(replayBuffer.buffer, replayBuffer.byteOffset, replayBuffer.byteLength);
  if (bytes.length < 16 || view.getUint32(0, false) !== 0x575a7270) throw new Error('Invalid WZrp replay.');
  const headerLength = view.getUint32(4, false);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLength)));
  let cursor = 8 + headerLength;
  if (Number(header.replayFormatVer || 0) >= 2) {
    const embeddedMapBytes = view.getUint32(cursor + 4, false);
    cursor += 8 + embeddedMapBytes;
  }
  const endJsonLength = view.getUint32(bytes.length - 4, false);
  const messageEnd = bytes.length - 4 - endJsonLength - 4;
  const queueTimes = new Map();
  const result = {
    productionTimeline: [],
    constructionOrders: [],
    attackOrders: [],
    researchOrders: [],
    playerDepartures: [],
    chatMessages: [],
    playerActivity: {},
    decodeErrors: {},
  };
  const activity = (player, category, time) => {
    if (!result.playerActivity[player]) result.playerActivity[player] = { lastActivityMilliseconds: null, counts: {} };
    const record = result.playerActivity[player];
    record.counts[category] = (record.counts[category] || 0) + 1;
    if (time != null) record.lastActivityMilliseconds = Math.max(record.lastActivityMilliseconds ?? 0, time);
  };

  while (cursor < messageEnd) {
    const queuePlayer = view.getUint8(cursor);
    const type = view.getUint8(cursor + 1);
    const payloadLength = view.getUint16(cursor + 2, false);
    cursor += 4;
    const payload = bytes.subarray(cursor, cursor + payloadLength);
    try {
      if (type === 120) {
        queueTimes.set(queuePlayer, decodeGameTime(payload));
      } else if (type === 113) {
        const event = decodeProduction(payload);
        addTimedEvent(result.productionTimeline, event, queuePlayer, queueTimes);
        activity(event.player, 'production', queueTimes.get(queuePlayer));
      } else if (type === 114) {
        const event = decodeResearch(payload);
        addTimedEvent(result.researchOrders, event, queuePlayer, queueTimes);
        activity(event.player, 'research', queueTimes.get(queuePlayer));
      } else if (type === 121) {
        const event = decodePlayerLeft(payload);
        addTimedEvent(result.playerDepartures, event, queuePlayer, queueTimes);
        activity(event.player, 'departure', queueTimes.get(queuePlayer));
      } else if (type === 36 || type === 43 || type === 66) {
        const event = decodeChat(payload, type);
        addTimedEvent(result.chatMessages, event, queuePlayer, queueTimes);
        if (event.sender >= 0) activity(event.sender, 'chat', queueTimes.get(queuePlayer));
      } else if (type === 112) {
        const event = decodeDroidOrder(payload);
        const time = queueTimes.get(queuePlayer);
        activity(event.player, 'droidOrder', time);
        if (event.order === 4 || event.order === 6 || event.order === 20) {
          addTimedEvent(result.constructionOrders, event, queuePlayer, queueTimes);
        } else if (event.order === 3 || event.order === 18) {
          addTimedEvent(result.attackOrders, event, queuePlayer, queueTimes);
        }
      }
    } catch (error) {
      result.decodeErrors[type] = (result.decodeErrors[type] || 0) + 1;
    }
    cursor += payloadLength;
  }

  const designs = new Map();
  result.productionTimeline.filter((event) => event.design).forEach((event) => {
    const key = JSON.stringify(event.design);
    const existing = designs.get(key) || { ...event.design, manufactureCommands: 0, players: {} };
    existing.manufactureCommands += 1;
    existing.players[event.player] = (existing.players[event.player] || 0) + 1;
    designs.set(key, existing);
  });
  result.unitDesigns = [...designs.values()];
  return result;
}
