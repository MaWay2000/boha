export const eloBase = 1500;
export const eloThreshold = 10;

export function gather(results, playerPublicKeys, filterGames) {
	const accounts = new Map();
	let games = [];
	for (const result of results) {
		const game = {
			replayUrl: result.replayUrl,
			version: result.game.version,
			startDate: result.game.startDate,
			endDate: result.endDate,
			duration: result.game.timeGameEnd,
			mapName: result.game.mapName,
			mods: result.game.mods,
			alliancesType: result.game.alliancesType,
			timeout: result.game.timeout,
			cheated: result.game.cheated,
			slots: [], players: [], teams: new Map(),
			eloDelta: null
		};
		games.push(game)

		result.playerData.sort((a, b) => a.position - b.position);
		for(const [index, player] of result.playerData.entries()) {
			let {publicKey, name} = player, id, bot;

			if (name.length > 2 && (name.endsWith('_2') || name.endsWith('_3') || name.endsWith('_4')))
				name = name.substring(0, name.length - 2);

			if (publicKey) {
				if (publicKey.length !== 44) bot = true;
				else {
					bot = false;
					if (false) // nodejs < 25: TypeError: Uint8Array.fromBase64 is not a function
						try { Uint8Array.fromBase64(publicKey, {lastChunkHandling: 'strict'}); }
						catch (e) { if (e instanceof TypeError) bot = true; else throw e; }
					else
						try { atob(publicKey); }
						catch (e) { if (e instanceof DOMException) bot = true; else throw e; }
				}
				if (bot) id = publicKey;
				else {
					const mainPublicKey = playerPublicKeys[publicKey];
					id = mainPublicKey ? mainPublicKey : publicKey;
				}
			} else {
				bot = name || player.usertype && player.usertype !== 'spectator';
				if (name)
					for(const color of ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink', 'Grey', 'Black']) {
						if (name.startsWith(color + '-')) {
							name = name.substring((color + '-').length);
							break;
						}
					}
				else name = player.usertype === 'spectator' ? 'spectator' : player.usertype ? 'generic' : 'empty slot';
				if (bot) publicKey = name;
				id = name;
			}

			let account = accounts.get(id);
			if (!account) {
				account = {
					mainPublicKey: publicKey ? id : null,
					publicKeys: publicKey ? new Set([id]) : new Set(),
					name: null, names: new Map(),
					bot: bot,
					games: [],
					elo: eloBase,
					winCount: 0, loseCount: 0, drawCount: 0,
					discounted: !publicKey
				};
				accounts.set(id, account);
			}
			if (publicKey) account.publicKeys.add(publicKey);
			account.games.push(game);
			const nameCount = account.names.get(name);
			account.names.set(name, nameCount ? nameCount + 1 : 1);

			const teamIndex = game.alliancesType ? player.team : index
			let team = game.teams.get(teamIndex);
			if (!team) {
				team = {
					name: String.fromCharCode('A'.charCodeAt(0) + player.team),
					userType: null,
					slots: [],
					players: []
				};
				game.teams.set(teamIndex, team);
			}

			const slot = {
				userType: player.usertype,
				account: account,
				elo: null,
				eloDelta: null
			};
			game.slots.push(slot);
			team.slots.push(slot);
			switch (slot.userType) {
				case 'winner': case 'loser': case 'contender':
					game.players.push(slot);
					team.players.push(slot);
			}
		}

		game.teams = Array.from(game.teams.values());
		for (const team of game.teams) {
			let userType = null;
			for (const player of team.players)
				if (!userType) userType = player.userType;
				else if (userType !== player.userType) {
					userType = null;
					break;
				}
			team.userType = userType;
		}
		// winner reported as contender (one case found: game.startDate === 1770998439288, i was playing in loser team)
		if (!game.timeout) {
			const contenders = game.teams.filter(team => team.userType === 'contender');
			if (contenders.length === 1) {
				contenders[0].userType = 'winner';
				for (const player of contenders[0].players) player.userType = 'winner';
			}
		}
	}

	for (const account of accounts.values()) {
		let mostFrequentName = null, highestCount = 0;
		for (const [name, count] of account.names.entries())
			if (count > highestCount) {
				mostFrequentName = name;
				highestCount = count;
			}
		account.name = mostFrequentName;
		const boringNames = []
		for (const name of account.names.keys()) {
			if (name === account.name) continue;
			let boring = false;
			switch (name) { case 'Player': case 'Alpha': case 'Beta': boring = true; }
			boring |= name.toLowerCase().includes('test');
			if (boring) boringNames.push(name);
		}
		for (const name of boringNames) {
			account.names.set(account.name, account.names.get(account.name) + account.names.get(name));
			account.names.delete(name);
		}
		if (account.games.length < eloThreshold) account.discounted = true;
	}

	games = Array.from(filterGames(games));

	{ const gameSet = new Set(games.map(game => game.startDate));
		for (const account of accounts.values())
			account.games = account.games.filter(game => gameSet.has(game.startDate));
	}
	{ const accountsWithoutGames = [];
		for (const [id, account] of accounts.entries()) if (!account.games.length) accountsWithoutGames.push(id);
		for (const id of accountsWithoutGames) accounts.delete(id);
	}

	return {accounts, games};
}

export function calculate(games) {
	for (const game of games) {
		if (game.cheated || game.duration < 3 * 60 * 1000 || game.teams.every(team => team.userType === 'loser')) continue;

		let smallestTeam = null, biggestTeam = null;
		for (const team of game.teams) {
			if (!smallestTeam || team.players.length < smallestTeam.players.length) smallestTeam = team;
			if (!biggestTeam || team.players.length > biggestTeam.players.length) biggestTeam = team;
		}
		if (smallestTeam.players.length !== biggestTeam.players.length)
			if (false) {
				if (!biggestTeam.players.every(player => player.account.bot)) continue;
			} else continue;

		const teams = []
		for (const team of game.teams) {
			const players = team.players.filter(player => !player.account.discounted);
			if (players.length) teams.push({
				userType: team.userType,
				players: players,
				elo: null, eloDelta: 0
			});
		}

		for (const team of teams) {
			for (const player of team.players) player.elo = player.account.elo;
			team.elo = team.players.reduce((sum, player) => sum + player.elo, 0) / team.players.length;
		}

		const winners = [], losers = [], contenders = [];
		for (const team of teams) switch (team.userType) {
			case 'winner': winners.push(team); break;
			case 'loser': losers.push(team); break;
			case 'contender': contenders.push(team); break;
		}

		function calcEloDelta(actual, elo1, elo2) { return 20 * (actual - 1 / (1 + Math.pow(10, (elo2 - elo1) / 400))); }

		const survivors = winners.length ? winners : contenders;
		if (survivors.length) {
			let best1 = null, best2 = null;
			for (const team of teams) {
				if (!best1) best1 = team;
				else if (best1.elo < team.elo) {
					best2 = best1;
					best1 = team;
				} else if (!best2) best2 = team;
				else if (best2.elo < team.elo) best2 = team;
			}

			for (const loser of losers) {
				const best = loser !== best1 ? best1 : best2;
				if (!best) continue;
				let eloDelta = calcEloDelta(1, best.elo, loser.elo);
				game.eloDelta = (game.eloDelta ?? 0) + eloDelta;
				eloDelta *= loser.players.length;
				loser.eloDelta = -eloDelta;
				const survivorEloDelta = +eloDelta / survivors.length;
				for (const survivor of survivors) survivor.eloDelta += survivorEloDelta;
			}
		}

		for (const [index1, contender1] of contenders.entries())
			for (const contender2 of contenders.slice(index1 + 1)) {
				let eloDelta = calcEloDelta(0.5, contender1.elo, contender2.elo);
				game.eloDelta = (game.eloDelta ?? 0) + Math.abs(eloDelta);
				eloDelta *= (contender1.players.length + contender2.players.length) / 2;
				contender1.eloDelta += eloDelta;
				contender2.eloDelta -= eloDelta;
		}

		for (const team of teams) for (const player of team.players) if (team.eloDelta) {
			player.eloDelta = team.eloDelta / team.players.length;
			player.account.elo += player.eloDelta;
		}

		for (const team of game.teams) switch(team.userType) {
			case 'winner': for (const player of team.players) ++player.account.winCount; break;
			case 'loser': for (const player of team.players) ++player.account.loseCount; break;
			case 'contender': for (const player of team.players) ++player.account.drawCount; break;
		}
	}
}
