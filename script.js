let rawPlayerData = [];
let filteredPlayerData = [];
let globalData = null;
let currentSort = { column: 'battles', asc: false };

async function loadDashboard() {
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressStatus = document.getElementById('progressStatus');

    if (progressContainer) progressContainer.classList.remove('hidden');
    if (progressBar) progressBar.style.width = '30%';
    if (progressStatus) progressStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-amber-500"></i> Ładowanie danych klanu...';

    try {
        const res = await fetch('data.json?t=' + Date.now());
        if (!res.ok) {
            throw new Error("Brak pliku data.json. Poczekaj na pierwszą automatyczną aktualizację GitHuba.");
        }

        globalData = await res.json();
        rawPlayerData = globalData.players || [];

        if (progressBar) progressBar.style.width = '100%';

        processTop3();
        filterTable();

    } catch (err) {
        console.error(err);
        if (progressStatus) {
            progressStatus.innerHTML = `<span class="text-red-400"><i class="fa-solid fa-triangle-exclamation"></i> Błąd: ${err.message}</span>`;
        }
    } finally {
        setTimeout(() => {
            if (progressContainer) progressContainer.classList.add('hidden');
        }, 300);
    }
}

function processTop3() {
    if (!globalData) return;

    const dailyMap = globalData.daily || {};
    const monthlyMap = globalData.monthly || {};

    const playersWithDeltas = rawPlayerData.map(p => {
        const startDay = dailyMap[p.id] !== undefined ? dailyMap[p.id] : p.battles;
        const startMonth = monthlyMap[p.id] !== undefined ? monthlyMap[p.id] : p.battles;

        return {
            ...p,
            dailyDelta: Math.max(0, p.battles - startDay),
            monthlyDelta: Math.max(0, p.battles - startMonth)
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

    const RANK_STYLES = [
        { border: 'border-amber-500/40', bg: 'bg-gradient-to-r from-amber-500/15 via-slate-900/80 to-slate-900/90', textVal: 'text-amber-400 font-extrabold' },
        { border: 'border-slate-400/40', bg: 'bg-gradient-to-r from-slate-400/15 via-slate-900/80 to-slate-900/90', textVal: 'text-slate-200 font-bold' },
        { border: 'border-amber-700/40', bg: 'bg-gradient-to-r from-amber-700/15 via-slate-900/80 to-slate-900/90', textVal: 'text-amber-500 font-bold' }
    ];

    container.innerHTML = list.map((player, idx) => {
        const style = RANK_STYLES[idx] || RANK_STYLES[2];
        const prefix = statKey !== 'battles' ? '+' : '';
        const valFormatted = prefix + player[statKey].toLocaleString('pl-PL');

        return `
            <div class="flex items-center justify-between p-3 rounded-xl border ${style.border} ${style.bg} mb-2 shadow-md">
                <div class="truncate">
                    <p class="text-sm font-bold text-white truncate">${player.name}</p>
                    <p class="text-[10px] text-slate-400">${player.role_i18n}</p>
                </div>
                <div class="text-right shrink-0 pl-2">
                    <p class="text-base font-mono ${style.textVal}">${valFormatted}</p>
                    <p class="text-[9px] uppercase font-semibold text-slate-500">${label}</p>
                </div>
            </div>`;
    }).join('');
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
                <td class="py-3.5 px-4 text-center text-xs text-slate-500 font-mono">${idx + 1}</td>
                <td class="py-3.5 px-4 font-semibold text-white">${p.name}</td>
                <td class="py-3.5 px-4 text-center text-xs text-slate-400">${p.role_i18n}</td>
                <td class="py-3.5 px-4 text-right font-mono font-bold text-amber-400">${p.battles.toLocaleString('pl-PL')}</td>
                <td class="py-3.5 px-4 text-right font-mono">${p.winrate > 0 ? p.winrate.toFixed(2) + '%' : '-'}</td>
                <td class="py-3.5 px-4 text-right font-mono">${p.avgDmg > 0 ? p.avgDmg.toLocaleString('pl-PL') : '-'}</td>
                <td class="py-3.5 px-4">${topSpgBadge}</td>
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

window.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
});
