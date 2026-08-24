import fs from 'fs';

const WG_APP_ID = 'c2bbaa5d9a99bd479d3d3b52901ee525';
const CLAN_ID = '500012158'; // ID klanu GKOB

async function run() {
    try {
        console.log("1. Pobieranie listy SPG...");
        const encRes = await fetch(`https://api.worldoftanks.eu/wot/encyclopedia/vehicles/?application_id=${WG_APP_ID}&fields=tank_id,type`);
        const encData = await encRes.json();
        const spgIds = new Set();
        if (encData.data) {
            for (const id in encData.data) {
                if (encData.data[id].type === 'SPG') spgIds.add(parseInt(id, 10));
            }
        }

        console.log("2. Pobieranie członków klanu...");
        const clanRes = await fetch(`https://api.worldoftanks.eu/wot/clans/info/?application_id=${WG_APP_ID}&clan_id=${CLAN_ID}`);
        const clanData = await clanRes.json();
        const members = clanData.data[CLAN_ID].members;
        const accountIds = members.map(m => m.account_id);

        console.log("3. Pobieranie bitew graczy...");
        const currentStats = {};
        for (let i = 0; i < accountIds.length; i += 20) {
            const chunk = accountIds.slice(i, i + 20).join(',');
            const tanksRes = await fetch(`https://api.worldoftanks.eu/wot/tanks/stats/?application_id=${WG_APP_ID}&account_id=${chunk}`);
            const tanksData = await tanksRes.json();
            
            if (tanksData.data) {
                for (const accId in tanksData.data) {
                    let artyBattles = 0;
                    const pTanks = tanksData.data[accId];
                    if (Array.isArray(pTanks)) {
                        pTanks.forEach(t => {
                            if (spgIds.has(t.tank_id) && t.all) {
                                artyBattles += t.all.battles;
                            }
                        });
                    }
                    currentStats[accId] = artyBattles;
                }
            }
        }

        const todayStr = new Date().toISOString().slice(0, 10);
        const monthStr = new Date().toISOString().slice(0, 7);

        let database = { dailyDate: todayStr, monthlyDate: monthStr, daily: {}, monthly: {} };
        if (fs.existsSync('data.json')) {
            try {
                database = JSON.parse(fs.readFileSync('data.json', 'utf8'));
            } catch (e) {}
        }

        // Jeśli nastał nowy dzień, zaktualizuj bazę startową dnia
        if (database.dailyDate !== todayStr || !database.daily) {
            database.dailyDate = todayStr;
            database.daily = { ...currentStats };
        }

        // Jeśli nastał nowy miesiąc, zaktualizuj bazę startową miesiąca
        if (database.monthlyDate !== monthStr || !database.monthly) {
            database.monthlyDate = monthStr;
            database.monthly = { ...currentStats };
        }

        database.lastUpdated = new Date().toISOString();
        fs.writeFileSync('data.json', JSON.stringify(database, null, 2));
        console.log("Baza data.json została pomyślnie zaktualizowana!");

    } catch (err) {
        console.error("Błąd podczas aktualizacji danych:", err);
        process.exit(1);
    }
}

run();