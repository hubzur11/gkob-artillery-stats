const WG_APP_ID = 'c2bbaa5d9a99bd479d3d3b52901ee525';
let spgTankIds = new Set();
let spgTankDictionary = {};
let rawPlayerData = [];
let filteredPlayerData = [];
let currentSort = { column: 'battles', asc: false };

const ROLE_MAP = {
    'commander': 'Dowódca',
    'executive_officer': 'Zastępca dowódcy',
    'personnel_officer': 'Oficer werbunkowy',
    'combat_officer': 'Oficer bojowy',
    'intelligence_officer': 'Oficer wywiadu',
    'quartermaster': 'Kwatermistrz',
    'recruitment_officer': 'Oficer rekrutacyjny',
    'junior_officer': 'Młodszy oficer',
    'private': 'Rezerwista / Szer.',
    'recruit': 'Rekrut'
};

async function apiFetch(targetUrl) {
    const proxies = [
        url => url,
        url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        url => `https://corsproxy.io/?${encodeURIComponent(url)}`
    ];

    for (const proxyFn of proxies) {
        try {
            const urlToFetch = proxyFn(targetUrl);
            const res = await fetch(urlToFetch);
            if (!res.ok) continue;

            const json = await res.json();
            if (json && json.status === 'error') {
                throw new Error(`WG API Error: ${json.error?.message || 'Błąd API'}`);
            }
            if (json && json.status === 'ok') {
                return json;
            }
        } catch (e) {
            if (e.message.startsWith('WG API Error')) throw e;
        }
    }
    throw new Error('Błąd połączenia z serwerami Wargaming.');
}

async function loadSpgEncyclopedia() {
    updateProgress("Pobieranie listy artylerii (SPG)...", 5);
    const data = await apiFetch(`https://api.worldoftanks.eu/wot/encyclopedia/vehicles/?application_id=${WG_APP_ID}&fields=tank_id,name,type,tier,short_name`);
    if (data && data.data) {
        for (const id in data.data) {
            if (data.data[id].type === 'SPG') {
                spgTankIds.add(parseInt(id, 10));
                spgTankDictionary[id] = data.data[id];
            }
        }
    }
}

async function startAnalysis() {
    const clanInputEl = document.getElementById('clanTagInput');
    const clanInput = clanInputEl ? clanInputEl.value.trim() : 'GKOB';
    if (!clanInput) return alert("Proszę wprowadzić tag, ID klanu lub link!");

    const fetchBtn = document.getElementById('fetchBtn');
    const fetchIcon = document.getElementById('fetchIcon');
    const progressContainer = document.getElementById('progressContainer');

    if (fetchBtn) fetchBtn.disabled = true;
    if (fetchIcon) fetchIcon.classList.add('fa-spin');
    if (progressContainer) progressContainer.classList.remove('hidden');
    rawPlayerData = [];

    try {
        if (spgTankIds.size === 0) {
            await loadSpgEncyclopedia();
        }

        let clanId = null;

        const urlMatch = clanInput.match(/\/(\d+)\/?/);
        if (urlMatch) {
            clanId = urlMatch[1];
        } else if (/^\d+$/.test(clanInput)) {
            clanId = clanInput;
        }

        if (!clanId && clanInput.toUpperCase() === 'GKOB') {
            clanId = '500012158';
        }

        if (!clanId) {
            updateProgress(`Szukanie klanu [${clanInput}]...`, 15);
            const clanListData = await apiFetch(`https://api.worldoftanks.eu/wot/clans/list/?application_id=${WG_APP_ID}&search=${encodeURIComponent(clanInput)}`);
            if (clanListData && clanListData.data && clanListData.data.length > 0) {
                const foundClan = clanListData.data.find(c => c.tag.toUpperCase() === clanInput.toUpperCase()) || clanListData.data[0];
                clanId = foundClan.clan_id;
            }
        }

        if (!clanId) {
            throw new Error(`Nie znaleziono klanu "${clanInput}". Użyj ID: 500012158`);
        }

        updateProgress(`Pobieranie listy graczy klanu (ID: ${clanId})...`, 30);
        const clanInfoData = await apiFetch(`https://api.worldoftanks.eu/wot/clans/info/?application_id=${WG_APP_ID}&clan_id=${clanId}`);

        if (!clanInfoData || !clanInfoData.data || !clanInfoData.data[clanId]) {
            throw new Error(`Brak danych dla klanu ID: ${clanId}`);
        }

        const clanMembers = clanInfoData.data[clanId].members;
        if (!clanMembers || clanMembers.length === 0) {
            throw new Error("Klan nie posiada członków.");
        }

        const accountIds = clanMembers
            .map(m => m.account_id)
            .filter(id => id != null && id !== '');

        let tankStatsMap = {};

        for (let i = 0; i < accountIds.length; i += 20) {
            const chunkArray = accountIds.slice(i, i + 20);
            const chunk = chunkArray.join(',');

            try {
                const tanksData = await apiFetch(`https://api.worldoftanks.eu/wot/tanks/stats/?application_id=${WG_APP_ID}&account_id=${chunk}`);
                if (tanksData && tanksData.data) {
                    Object.assign(tankStatsMap, tanksData.data);
                }
            } catch (chunkErr) {
                for (const singleId of chunkArray) {
                    try {
                        const singleData = await apiFetch(`https://api.worldoftanks.eu/wot/tanks/stats/?application_id=${WG_APP_ID}&account_id=${singleId}`);
                        if (singleData && singleData.data) {
                            Object.assign(tankStatsMap, singleData.data);
                        }
                    } catch (e) {
                        console.warn(`Pominięto nieaktywne konto ID: ${singleId}`);
                    }
                }
            }

            const percent = Math.floor(30 + (i / accountIds.length) * 60);
            updateProgress(`Pobieranie statystyk graczy (${i}/${accountIds.length})...`, percent);
        }

        clanMembers.forEach(member => {
            const pTanks = tankStatsMap[member.account_id];
            let artyBattles = 0, artyWins = 0, artyDamage = 0, artyFrags = 0;
            let spgList = [];

            if (pTanks && Array.isArray(pTanks)) {
                pTanks.forEach(t => {
                    if (spgTankIds.has(t.tank_id) && t.all && t.all.battles > 0) {
                        artyBattles += t.all.battles;
                        artyWins += t.all.wins;
                        artyDamage += t.all.damage_dealt;
                        artyFrags += t.all.frags;

                        const tankDetails = spgTankDictionary[t.tank_id];
                        spgList.push({
                            name: tankDetails ? (tankDetails.short_name || tankDetails.name) : `ID: ${t.tank_id}`,
                            tier: tankDetails ? tankDetails.tier : 0,
                            battles: t.all.battles
                        });
                    }
                });
            }

            spgList.sort((a, b) => b.battles - a.battles);

            rawPlayerData.push({
                id: member.account_id,
                name: member.account_name,
                role: member.role,
                role_i18n: ROLE_MAP[member.role] || member.role,
                battles: artyBattles,
                wins: artyWins,
                winrate: artyBattles > 0 ? (artyWins / artyBattles) * 100 : 0,
                avgDmg: artyBattles > 0 ? Math.round(artyDamage / artyBattles) : 0,
                avgFrags: artyBattles > 0 ? (artyFrags / artyBattles).toFixed(2) : '0.00',
                topSpg: spgList.length > 0 ? spgList[0] : null
            });
        });

        updateProgress("Gotowe!", 100);
        setTimeout(() => {
            if (progressContainer) progressContainer.classList.add('hidden');
        }, 500);

        processSnapshotsAndRenderTop3();
        filterTable();

    } catch (err) {
        console.error(err);
        alert("Wystąpił błąd: " + err.message);
    } finally {
        if (fetchBtn) fetchBtn.disabled = false;
        if (fetchIcon) fetchIcon.classList.remove('fa-spin');
    }
}

function processSnapshotsAndRenderTop3() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const monthStr = new Date().toISOString().slice(0, 7);

    let store = JSON.parse(localStorage.getItem('gkob_arty_snapshots') || '{}');

    if (!store.daily || store.dailyDate !== todayStr) {
        if (store.daily) store.yesterday = store.daily;
        store.daily = {};
        store.dailyDate = todayStr;
        rawPlayerData.forEach(p => { store.daily[p.id] = p.battles; });
    }

    if (!store.monthly || store.monthlyDate !== monthStr) {
        store.monthly = {};
        store.monthlyDate = monthStr;
        rawPlayerData.forEach(p => { store.monthly[p.id] = p.battles; });
    }

    localStorage.setItem('gkob_arty_snapshots', JSON.stringify(store));

    const playersWithDeltas = rawPlayerData.map(p => {
        const startDayBattles = (store.yesterday && store.yesterday[p.id] !== undefined) ? store.yesterday[p.id] : (store.daily[p.id] || p.battles);
        const startMonthBattles = store.monthly[p.id] !== undefined ? store.monthly[p.id] : p.battles;

        return {
            ...p,
            dailyDelta: Math.max(0, p.battles - startDayBattles),
            monthlyDelta: Math.max(0, p.battles - startMonthBattles)
        };
    });

    const topDaily = [...playersWithDeltas].sort((a, b) => b.dailyDelta - a.dailyDelta || b.battles - a.battles).slice(0, 3);
    const topMonthly = [...playersWithDeltas].sort((a, b) => b.monthlyDelta - a.monthlyDelta || b.battles - a.battles).slice(0, 3);
    const topAllTime = [...playersWithDeltas].sort((a, b) => b.battles - a.battles).slice(0, 3);

    renderTop3Box('topDailyContainer', topDaily, 'dailyDelta', 'bitew dzisiaj');
    renderTop3Box('topMonthlyContainer', topMonthly, 'monthlyDelta', 'bitew w m-cu');
    renderTop3Box('topAllTimeContainer', topAllTime, 'battles', 'bitew ogółem');
}

function renderTop3Box(containerId, list, statKey, label) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!list || list.length === 0 || list.every(p => p[statKey] === 0 && statKey !== 'battles')) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-6 text-slate-500">
                <i class="fa-solid fa-chart-line text-2xl mb-1 opacity-30"></i>
                <p class="text-xs">Brak aktywności w tym okresie</p>
            </div>`;
        return;
    }

    const RANK_STYLES = [
        {
            border: 'border-amber-500/40 hover:border-amber-400/70',
            bg: 'bg-gradient-to-r from-amber-500/15 via-slate-900/80 to-slate-900/90',
            badge: 'bg-amber-500/20 border-amber-500/40 shadow-[0_0_12px_rgba(251,191,36,0.25)]',
            crown: '<i class="fa-solid fa-crown text-amber-400 text-sm drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]"></i>',
            textVal: 'text-amber-400 font-extrabold'
        },
        {
            border: 'border-slate-400/40 hover:border-slate-300/70',
            bg: 'bg-gradient-to-r from-slate-400/15 via-slate-900/80 to-slate-900/90',
            badge: 'bg-slate-400/20 border-slate-400/40 shadow-[0_0_12px_rgba(203,213,225,0.25)]',
            crown: '<i class="fa-solid fa-crown text-slate-300 text-sm drop-shadow-[0_0_8px_rgba(203,213,225,0.8)]"></i>',
            textVal: 'text-slate-200 font-bold'
        },
        {
            border: 'border-amber-700/40 hover:border-amber-600/70',
            bg: 'bg-gradient-to-r from-amber-700/15 via-slate-900/80 to-slate-900/90',
            badge: 'bg-amber-700/20 border-amber-700/40 shadow-[0_0_12px_rgba(180,83,9,0.25)]',
            crown: '<i class="fa-solid fa-crown text-amber-600 text-sm drop-shadow-[0_0_8px_rgba(180,83,9,0.8)]"></i>',
            textVal: 'text-amber-500 font-bold'
        }
    ];

    container.innerHTML = list.map((player, idx) => {
        const style = RANK_STYLES[idx] || RANK_STYLES[2];
        const prefix = statKey !== 'battles' ? '+' : '';
        const valFormatted = prefix + player[statKey].toLocaleString('pl-PL');

        return `
            <div class="flex items-center justify-between p-3 rounded-xl border ${style.border} ${style.bg} transition-all duration-200 hover:scale-[1.01] shadow-md">
                <div class="flex items-center gap-3 truncate">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${style.badge}">
                        ${style.crown}
                    </div>
                    <div class="truncate">
                        <p class="text-sm font-bold text-white truncate tracking-wide">${player.name}</p>
                        <p class="text-[10px] text-slate-400 truncate">${player.role_i18n}</p>
                    </div>
                </div>
                <div class="text-right shrink-0 pl-2">
                    <p class="text-base font-mono ${style.textVal}">${valFormatted}</p>
                    <p class="text-[9px] uppercase tracking-wider font-semibold text-slate-500">${label}</p>
                </div>
            </div>`;
    }).join('');
}

function updateProgress(text, percent) {
    const status = document.getElementById('progressStatus');
    const percentEl = document.getElementById('progressPercent');
    const bar = document.getElementById('progressBar');
    if (status) status.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-amber-500"></i> ${text}`;
    if (percentEl) percentEl.innerText = `${percent}%`;
    if (bar) bar.style.width = `${percent}%`;
}

function filterTable() {
    const searchEl = document.getElementById('searchInput');
    const searchQuery = searchEl ? searchEl.value.toLowerCase().trim() : '';
    filteredPlayerData = rawPlayerData.filter(p => p.name.toLowerCase().includes(searchQuery));
    applySort();
    renderTable();
}

function sortTable(column) {
    if (currentSort.column === column) {
        currentSort.asc = !currentSort.asc;
    } else {
        currentSort.column = column;
        currentSort.asc = false;
    }
    applySort();
    renderTable();
}

function applySort() {
    const col = currentSort.column;
    const dir = currentSort.asc ? 1 : -1;

    filteredPlayerData.sort((a, b) => {
        let valA = a[col];
        let valB = b[col];
        if (typeof valA === 'string') return valA.localeCompare(valB) * dir;
        return (valA - valB) * dir;
    });
}

function renderTable() {
    const tbody = document.getElementById('statsTableBody');
    const recordBadge = document.getElementById('recordBadge');
    if (recordBadge) recordBadge.innerText = `${filteredPlayerData.length} graczy`;
    if (!tbody) return;

    if (filteredPlayerData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-500">Brak danych</td></tr>`;
        return;
    }

    tbody.innerHTML = filteredPlayerData.map((p, idx) => {
        const topSpgBadge = p.topSpg ? `<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-xs"><b class="text-amber-400">T${p.topSpg.tier}</b> ${p.topSpg.name} (${p.topSpg.battles}b)</span>` : '-';
        return `
            <tr class="hover:bg-slate-800/40">
                <td class="py-3.5 px-4 text-center font-mono text-xs text-slate-500">${idx + 1}</td>
                <td class="py-3.5 px-4 font-semibold text-white">${p.name}</td>
                <td class="py-3.5 px-4 text-center text-xs text-slate-400">${p.role_i18n}</td>
                <td class="py-3.5 px-4 text-right font-mono font-bold text-amber-400">${p.battles.toLocaleString('pl-PL')}</td>
                <td class="py-3.5 px-4 text-right font-mono">${p.battles > 0 ? p.winrate.toFixed(2) + '%' : '-'}</td>
                <td class="py-3.5 px-4 text-right font-mono">${p.battles > 0 ? p.avgDmg.toLocaleString('pl-PL') : '-'}</td>
                <td class="py-3.5 px-4 text-left">${topSpgBadge}</td>
                <td class="py-3.5 px-4 text-center">
                    <a href="https://tomato.gg/stats/EU/${p.name}-${p.id}" target="_blank" class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white transition-all">
                        <i class="fa-solid fa-chart-simple text-xs"></i>
                    </a>
                </td>
            </tr>`;
    }).join('');
}

function exportToCSV() {
    if (filteredPlayerData.length === 0) return alert("Brak danych!");
    
    let csv = "\uFEFFLp.;Gracz;Rola;Bitwy SPG;Wygrana %;Srednie Obrazenia;Ulubiona Artyleria\n";
    filteredPlayerData.forEach((p, idx) => {
        const topName = p.topSpg ? `${p.topSpg.name} (T${p.topSpg.tier})` : '-';
        csv += `${idx + 1};"${p.name}";"${p.role_i18n}";${p.battles};"${p.winrate.toFixed(2)}%";${p.avgDmg};"${topName}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `GKOB_Arty_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}

// --- INICJALIZACJA I AUTOMATYCZNE ODŚWIEŻANIE CO GODZINĘ ---
window.addEventListener('DOMContentLoaded', () => {
    // 1. Pierwsze wczytanie danych po otwarciu strony
    startAnalysis();

    // 2. Automatyczne odświeżanie co 1 godzinę (3 600 000 ms) gdy strona jest otwarta
    setInterval(() => {
        console.log("Automatyczne odświeżanie statystyk z API Wargaming...");
        startAnalysis();
    }, 3600000);
});