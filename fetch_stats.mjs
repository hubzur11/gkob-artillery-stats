import fs from 'fs';

const WG_APP_ID = 'c2bbaa5d9a99bd479d3d3b52901ee525';
const CLAN_ID = '500012158';

const ROLE_MAP = {
    'commander': 'Dowódca',
    'executive_officer': 'Zastępca dowódcy',
    'personnel_officer': 'Oficer werbunkowy',
    'combat_officer': 'Oficer bojowy',
    'intelligence_officer': 'Oficer wywiadu',
    'quartermaster': 'Kwatermistrz',
    'recruitment_officer': 'Oficer rekrutacyjny',
    'junior_officer': 'Młodszy oficer',
    'private': 'Szer.',
    'recruit': 'Rekrut',
    'reservist': 'Rezerwista'
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
    try {
        console.log("1. Pobieranie encyklopedii pojazdów z Wargaming...");
        const encRes = await fetch(`https://api.worldoftanks.eu/wot/encyclopedia/vehicles/?application_id=${WG_APP_ID}&fields=tank_id,name,type,tier,short_name`);
        const encData = await encRes.json();

        if (!encData || encData.status !== 'ok') {
            throw new Error(`Błąd API Wargaming (Encyklopedia): ${JSON.stringify(encData?.error || encData)}`);
        }

        const spgDict = {};
        const spgIds = new Set();

        for (const id in encData.data) {
            const vehicle = encData.data[id];
            if (vehicle && vehicle.type === 'SPG') {
                const tankId = parseInt(id, 10);
                spgIds.add(tankId);
                spgDict[id] = vehicle;
            }
        }

        console.log(`Pomyślnie znaleziono ${spgIds.size} artylerii (SPG) w encyklopedii.`);
        if (spgIds.size === 0) {
            throw new Error("Błąd: Nie znaleziono żadnych pojazdów SPG w encyklopedii WG!");
        }

        console.log("2. Pobieranie członków klanu GKOB...");
        const clanRes = await fetch(`https://api.worldoftanks.eu/wot/clans/info/?application_id=${WG_APP_ID}&clan_id=${CLAN_ID}`);
        const clanData = await clanRes.json();

        if (!clanData || clanData.status !== 'ok' || !clanData.data[CLAN_ID]) {
            throw new Error(`Błąd API Wargaming (Klan): ${JSON.stringify(clanData?.error || clanData)}`);
        }

        const members = clanData.data[CLAN_ID].members || [];
        const accountIds = members.map(m => m.account_id);
        console.log(`Pobrano ${members.length} członków klanu.`);

        console.log("3. Pobieranie statystyk czołgów dla wszystkich graczy...");
        let tankStatsMap = {};

        for (let i = 0; i < accountIds.length; i += 20) {
            const chunk = accountIds.slice(i, i + 20).join(',');
            await sleep(300); // Odstęp czasowy 300ms, aby uniknąć bloku Wargaming API

            const tanksRes = await fetch(`https://api.worldoftanks.eu/wot/tanks/stats/?application_id=${WG_APP_ID}&account_id=${chunk}`);
            const tanksData = await tanksRes.json();

            if (!tanksData || tanksData.status !== 'ok') {
                console.error(`Błąd API dla paczki graczy ${i}:`, tanksData?.error);
                throw new Error(`Błąd pobierania statystyk graczy z Wargaming API: ${JSON.stringify(tanksData?.error)}`);
            }

            if (tanksData.data) {
                Object.assign(tankStatsMap, tanksData.data);
            }
        }

        const players = [];
        const currentBattlesMap = {};
        let grandTotalArtyBattles = 0;

        members.forEach(member => {
            const pTanks = tankStatsMap[member.account_id];
            let artyBattles = 0, artyWins = 0, artyDamage = 0;
            let spgList = [];

            if (pTanks && Array.isArray(pTanks)) {
                pTanks.forEach(t => {
                    const tId = parseInt(t.tank_id, 10);
                    if (spgIds.has(tId) && t.all && t.all.battles > 0) {
                        artyBattles += t.all.battles;
                        artyWins += t.all.wins;
                        artyDamage += t.all.damage_dealt;

                        const tankDetails = spgDict[t.tank_id];
                        spgList.push({
                            name: tankDetails ? (tankDetails.short_name || tankDetails.name) : `ID: ${t.tank_id}`,
                            tier: tankDetails ? tankDetails.tier : 0,
                            battles: t.all.battles
                        });
                    }
                });
            }

            spgList.sort((a, b) => b.battles - a.battles);
            currentBattlesMap[member.account_id] = artyBattles;
            grandTotalArtyBattles += artyBattles;

            players.push({
                id: member.account_id,
                name: member.account_name,
                role_i18n: ROLE_MAP[member.role] || member.role,
                battles: artyBattles,
                winrate: artyBattles > 0 ? (artyWins / artyBattles) * 100 : 0,
                avgDmg: artyBattles > 0 ? Math.round(artyDamage / artyBattles) : 0,
                topSpg: spgList.length > 0 ? spgList[0] : null
            });
        });

        console.log(`Zliczona łączna liczba bitew na artylerii: ${grandTotalArtyBattles}`);

        if (grandTotalArtyBattles === 0) {
            throw new Error("Suma bitew wyszła 0. Przerywam zapis, aby nie uszkodzić pliku data.json.");
        }

        const todayStr = new Date().toISOString().slice(0, 10);
        const monthStr = new Date().toISOString().slice(0, 7);

        let oldDb = { dailyDate: todayStr, monthlyDate: monthStr, daily: {}, monthly: {} };
        if (fs.existsSync('data.json')) {
            try {
                oldDb = JSON.parse(fs.readFileSync('data.json', 'utf8'));
            } catch (e) {}
        }

        const dailySnap = (oldDb.dailyDate === todayStr && oldDb.daily && Object.keys(oldDb.daily).length > 0) ? oldDb.daily : currentBattlesMap;
        const monthlySnap = (oldDb.monthlyDate === monthStr && oldDb.monthly && Object.keys(oldDb.monthly).length > 0) ? oldDb.monthly : currentBattlesMap;

        const finalData = {
            lastUpdated: new Date().toISOString(),
            dailyDate: todayStr,
            monthlyDate: monthStr,
            daily: dailySnap,
            monthly: monthlySnap,
            players: players
        };

        fs.writeFileSync('data.json', JSON.stringify(finalData, null, 2));
        console.log("SUKCES: Pomyślnie pobrano dane i zapisano plik data.json!");

    } catch (e) {
        console.error("BŁĄD:", e.message);
        process.exit(1);
    }
}

run();
