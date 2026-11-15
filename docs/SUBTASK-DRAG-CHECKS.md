# Prüfbericht: Unteraufgaben per Drag-and-drop – 15. November 2026

Basis: zuerst `git fetch origin main`, `origin/main` bei `814fe26`, eigener Branch `feat/subtask-drag-transfer`. Arbeitsbaum anfangs sauber; bisheriger Branch `feat/task-subtask-improvements` unverändert erhalten. Keine `AGENTS.md` im Repository oder in übergeordneten Verzeichnissen gefunden. Kein automatischer Merge oder produktiver Rollout.

## Umsetzung

Bestehender Griff in der Übersicht, Pointer-Schwelle, gleichlistige lebende Hauptaufgaben als Ziele, deutlicher Rahmen und Einfügekante beziehungsweise beschriftete Endposition. Eingeklappte Ziele öffnen nach 550 ms vorübergehend. Der ursprüngliche Klappzustand bleibt erhalten. Titelablage hängt an, Ablage an sichtbaren Schritten fügt davor/dahinter ein. Unsichtbare erledigte Schritte bleiben in ihrer relativen Reihenfolge. Die bestehende Sortieraktion innerhalb einer Hauptaufgabe und Menü/Suchdialog bleiben erhalten. Randscrollen und `touch-action: none` ausschließlich am Griff bleiben bestehen.

Die vorhandene `subtaskMove`-Aktion erhält einen optionalen Anker mit Sortierversion und Seite. Ankerprüfung, Zielreihenfolge, Elternwechsel und Statusregel laufen atomar in der vorhandenen serialisierten Transaktion. Rechte, Kind-/Zielversion, Offline-Queue und persistente Idempotenzbelege gelten weiter. ID/Titel/Status bleiben erhalten; offene Schritte öffnen erledigte Ziele und beide Fortschrittsanzeigen werden lokal unmittelbar neu berechnet. Keine Migration, neue Abhängigkeit oder zusätzliche Funktion.

## Automatisierte Prüfungen

- `npm test`: 25 Tests bestanden. Ergänzt: atomare Ablehnung einer veralteten Zielposition ohne Eltern-/Statusänderung, gezieltes Einfügen, identischer Beleg bei Antwortwiederholung. Gemeinsame Verschiebeszenarien werden auch vom bestehenden PostgreSQL-CI-Skript verwendet.
- Echte API und IndexedDB: Zielposition bei Offline-Neuanlagen, Folgeänderung und Sortierung, Modul-Neuladen und Replay; Zielposition bei verlorener Antwort mit Reload. Bestehende Prüfungen für konkurrierende Verschiebungen, fremde Listen, Papierkorb, veränderte Ziele, Rechteentzug und veraltete Folgeaktionen bestehen weiter.
- `npm run build`: TypeScript, Vite und Service Worker erfolgreich. Bestehende Warnung für ein JavaScript-Bundle über 500 kB.

## Browser und Sichtprüfung

`npm run test:browser` vollständig erfolgreich: bestehende Regressionen, Sortierung in Übersicht/Detail, Maus-Randscrollen, normales Touchscrollen außerhalb des Griffs, Touch-Abbruch, Menü-/Dialogalternative, Umwandlung und neue Drag-and-drop-Prüfungen. Die neue Sequenz prüft eingeklappte Ziele mit Verweilen und Wiederherstellung nach Escape, Maus-Anhängen, Touch-Anhängen und Touch-Abbruch, ungültige Ablage außerhalb, gezieltes Einfügen vor einem sichtbaren Anker bei ausgeblendetem erledigtem Schritt, Offline-Reload und anschließenden Abgleich mit dem zweiten Konto einer geteilten Liste. Nach erneutem Einblenden wird auch die gespeicherte Position des erledigten Schritts geprüft.

Die sechs Aufnahmen `test-results/drag-{light,dark}-{1360,360,320}.png` wurden tatsächlich im Bildbetrachter angesehen: kontrastierender Zielrahmen, sichtbare Einfügelinie, lesbare Vorschau, umbrechende Titel und kein horizontaler Überlauf. Die schwebende Kopie wird an die aktuelle Fensterbreite angepasst. Nach der abschließenden Aktualisierung der Vorschau bei temporärem Aufklappen wurde die gezielte Menü-/Drag-/Offline-/Zwei-Konten-Sequenz mit frisch gebauten Assets nochmals erfolgreich ausgeführt und alle sechs Aufnahmen erneut angesehen. Screenshots werden über den bestehenden CI-Artefaktablauf bereitgestellt.

Ein vorheriger Gesamtlauf scheiterte vor den neuen Dragprüfungen einmal in der bestehenden `immediateUndo`-Synchronisationsprüfung (`scripts/browser-sync.ts:102`, erwarteter Request wurde nicht innerhalb von fünf Sekunden beobachtet). Der Wiederholungslauf bestand vollständig; an dieser fachfremden Undo-Logik wurde nichts geändert. Beim Entwickeln des neuen Klapptests wurde dessen Erwartung auf tatsächliche Unsichtbarkeit korrigiert: eingeklappte Schritte bleiben im vorhandenen DOM gemountet.

## Offene physische Abnahme

Kein physisches Android-Gerät verfügbar. Android-Abnahme, physischer Zwei-Geräte-Abgleich und Screenreader bleiben ausdrücklich offen. Touch wird mit echten Chromium-Touchereignissen emuliert. Ein separater PostgreSQL-Server und Docker sind lokal nicht verfügbar; der PostgreSQL-/Container-Nachweis für diesen PR muss aus CI kommen. Es wurden ausschließlich temporäre Testkonten und Datenbanken verwendet.
