name: Automatyczna Baza Statystyk

on:
  schedule:
    # Uruchamiaj co godzinę
    - cron: '0 * * * *'
  workflow_dispatch: # Przycisk do ręcznego uruchomienia

jobs:
  update-stats:
    runs-on: ubuntu-latest
    steps:
      - name: Pobierz repozytorium
        uses: actions/checkout@v4

      - name: Skonfiguruj Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Uruchom skrypt aktualizacji bazy
        run: node fetch_stats.mjs

      - name: Zapisz data.json w repozytorium
        run: |
          git config --global user.name 'github-actions[bot]'
          git config --global user.email 'github-actions[bot]@users.noreply.github.com'
          git add data.json
          git commit -m "Auto-update bazy bitew [skip ci]" || exit 0
          git push
