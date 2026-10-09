# Notera

Selbst gehostete Aufgaben-App für zwei Personen. React/Vite-PWA, Fastify-API und PostgreSQL. Darkmode, optional Hell- und Systemmodus. Der Entwicklungsauftrag und die unveränderte Designreferenz liegen unter [`docs/reference/`](docs/reference/).

**Stand: Stufe A implementiert, Abnahme noch nicht vollständig.** Automatisierte Domänen-, API- und Offline-Queue-Tests bestehen. Browser-/Android-Prüfungen und der Compose-Start sind in der Entwicklungsumgebung blockiert und noch offen. Stufe B wurde entsprechend der vorgeschriebenen Reihenfolge noch nicht begonnen. Details: [Prüfbericht](docs/STATUS.md).

## Lokal starten

Node.js 24 LTS empfohlen; Lockfile mitliefern und `npm ci` verwenden. Keine produktiven Passwörter oder Demokonten sind voreingestellt.

```sh
npm ci
npm run user:add -- sven "Sven"
npm run user:add -- sandra "Sandra"
npm run build
npm start
```

Die CLI fragt das Passwort verdeckt ab (mindestens 12 Zeichen). Ohne `DATABASE_URL` wird eine dauerhafte PGlite-Datenbank in `.data/postgres` angelegt. **PGlite darf nur von einem Prozess geöffnet werden:** Konten vor dem App-Start anlegen, App für Backup/Restore/CLI stoppen. Nicht zwei App-Instanzen mit demselben lokalen Datenordner starten. PostgreSQL im Compose-Betrieb unterstützt parallele Zugriffe.

Danach `http://localhost:3000` öffnen. Android benötigt im normalen Netz HTTPS; HTTP-`localhost` ist nur eine lokale Entwicklungs-Ausnahme. Beim ersten Öffnen anmelden, danach bleiben geladene Daten offline verfügbar. Installation über das Browsermenü. Ein Service Worker wird nur im Produktionsbuild aktiviert.

Passwort alternativ als `NOTERA_BOOTSTRAP_PASSWORD` über eine geschützte Umgebung/Secret zuführen, nicht als CLI-Argument oder im Repository. Ein anderes Benutzerzeitgebiet ist als drittes Argument möglich: `npm run user:add -- sven "Sven" "Europe/Berlin"`. Die Server-CLI ist der administrative Einrichtungsweg; es gibt keine öffentliche Registrierung oder administrativen Browserzugang.

### Entwicklung mit Hot Reload

In zwei Terminals:

```sh
APP_ORIGIN=http://localhost:5173 npm run dev
npm run dev:web
```

`http://localhost:5173` verwenden. Vite leitet `/api` an Port 3000 weiter. `APP_ORIGIN` muss exakt dem Ursprung im Browser entsprechen (Schema, Host, Port); `localhost` und `127.0.0.1` sind unterschiedliche Ursprünge. `.env` wird vom lokalen Node-Prozess nicht automatisch geladen; Variablen in der Umgebung setzen. Docker Compose liest seine `.env` selbst.

## Docker Compose und eigener Server

```sh
cp .env.example .env
# APP_ORIGIN und ein langes zufälliges Hex-Datenbankpasswort in .env eintragen.
docker compose up -d --build

docker compose exec app npm run user:add -- sven "Sven"
docker compose exec app npm run user:add -- sandra "Sandra"
```

Die API bleibt standardmäßig an `127.0.0.1:${APP_PORT:-3000}` gebunden. Die Datenbank veröffentlicht keinen Port. Den vorhandenen HTTPS-Reverse-Proxy auf die App richten; bei einem Proxy in einem anderen Container ein passendes gemeinsames Netzwerk konfigurieren. Domain und Proxy bleiben Bereitstellungseinstellungen. `APP_ORIGIN=https://deine-domain` setzen. HTTPS aktiviert `Secure`-Cookies. HTTP darf nicht als Produktionsbetrieb genutzt werden.

Für `/api/events` Proxy-Pufferung deaktivieren und längere Read-Timeouts zulassen. Heartbeats erfolgen alle zwei Sekunden. Es werden nur Änderungscursor übertragen; Inhalte werden anschließend über die authentifizierte Sync-API abgerufen. Bei Verbindungsabbrüchen holt der Client beim nächsten Sync den vollständigen autorisierten Stand. Ohne SSE erfolgt zusätzlich alle 30 Sekunden ein Sync, solange die App sichtbar ist.

App und Datenbank haben Healthchecks. Das Volume `postgres` enthält die Daten. Keine `docker compose down -v`-Befehle verwenden, wenn Daten erhalten bleiben sollen. Die stündliche Papierkorbbereinigung läuft im App-Prozess; Stufe A braucht keinen separaten Worker. Ein dauerhafter Push-Scheduler gehört zur noch ausstehenden Stufe B.

## Sicherung und Wiederherstellung

Sicherungen enthalten private Texte und Passwort-Hashes. Verschlüsselt und zugriffsgeschützt außerhalb des Servers aufbewahren. Sitzungen werden bewusst nicht gesichert.

Lokales PGlite, während die App gestoppt ist:

```sh
mkdir -p backups
npm run backup -- backups/notera.json
# Frische Zieldatenbank, niemals bestehende Daten überschreiben:
DATA_DIR=.data/restored npm run restore -- backups/notera.json
DATA_DIR=.data/restored npm start
```

Die Sicherungsdatei wird exklusiv neu angelegt (Unix-Modus 0600). Die Wiederherstellung verweigert eine Datenbank mit bestehenden Benutzern. Alle Tabellen werden in einer Transaktion gesichert bzw. wiederhergestellt. Nach Restore neu anmelden.

Compose:

```sh
docker compose exec app npm run backup -- /tmp/notera-backup.json
docker compose cp app:/tmp/notera-backup.json ./notera-backup.json
# Nach Kopie die temporäre Datei im Container entfernen.
# In einer FRISCHEN Compose-Instanz:
docker compose cp ./notera-backup.json app:/tmp/notera-backup.json
docker compose exec app npm run restore -- /tmp/notera-backup.json
```

Zusätzlich sind klassische PostgreSQL-Sicherungen möglich:

```sh
docker compose exec -T db pg_dump -U notera -d notera -Fc > notera.dump
# Nur in eine frische leere Datenbank, bevor die App ihr Schema angelegt hat:
docker compose exec -T db pg_restore -U notera -d notera --no-owner < notera.dump
```

Die portablen JSON-Sicherungen sind für eine kleine persönliche Installation gedacht. Große Installationen sollten `pg_dump` und dessen Restore regelmäßig prüfen. Ein Restore in einen neuen PGlite-Datenordner wurde automatisiert geprüft; ein Restore mit dem PostgreSQL-Container ist noch offen.

## Aktualisierung

1. Sicherung erstellen und Wiederherstellbarkeit prüfen.
2. Release-/Migrationshinweise lesen; Quellcode und Lockfile gemeinsam aktualisieren.
3. `npm ci`, `npm test`, `npm run build` ausführen, dann lokal neu starten bzw. `docker compose up -d --build`.
4. Gesundheit, Anmeldung und Synchronisation prüfen.

Migration `001_initial.sql` wird nur bei einer frischen Datenbank ausgeführt und in `schema_migrations` erfasst. Für spätere Schemaänderungen müssen neue nummerierte Migrationen und gesonderte Upgrade-Anweisungen ergänzt werden. Es gibt keine automatische destruktive Migration. Ein neuer Service Worker wartet, bis alte App-Tabs geschlossen sind; nach einem Update alle Tabs einmal schließen und neu öffnen.

## Bedienung und Grenzen

- Titel + Enter genügt. Titel werden beidseitig getrimmt, maximal 240 UTF-16-Codeeinheiten. Keine natürliche Datumserkennung.
- Eingang ist immer privat. Neue Listen sind privat, bis beim Anlegen oder Verwalten ausdrücklich Personen gewählt werden.
- Mitglieder können Aufgaben bearbeiten, verschieben und erledigen. Nur Besitzer verwalten Listen/Mitgliedschaften. Eine Liste lässt sich nur löschen, wenn sie einschließlich Papierkorb leer ist.
- Heute-Auswahl und Markierung sind persönlich. Überfällige Aufgaben stehen separat; ausgeblendete Überfällige bleiben in ihrer Liste. Frühere persönliche Auswahl erscheint unter „Nicht geschafft“.
- Eine Fälligkeit erzeugt keine Erinnerung. Datumswerte bleiben Kalenderdaten; Uhrzeiten haben eine explizite Zeitzone. Mehrdeutige oder nicht existierende Uhrzeiten werden abgewiesen.
- Löschen verschiebt Aufgaben für standardmäßig 30 Tage in den Papierkorb. `TRASH_DAYS` konfiguriert diese Dauer. Tombstones leben unabhängig im 90-Tage-Änderungsjournal; danach erzwingt dessen Cursorgrenze einen Vollabgleich.
- Browserdaten sind ein Offlinecache mit persistenter Queue, keine zusätzliche Quelle der Wahrheit. Browserdaten nicht löschen, solange Änderungen ausstehen. Der Browser kann Site-Speicher unter Speicherdruck entfernen; es gibt keine Garantie gegen Geräteverlust oder manuell gelöschte Browserdaten.
- Konflikte erhalten lokale Änderungen und Serverfassung. Explizites Wiederherstellen einer gelöschten Aufgabe ist eine eigene Entscheidung. Endgültig gelöschte Aufgaben werden nicht automatisch neu angelegt.
- Abmelden leert den Cache und ist bei offenen Änderungen gesperrt. Abgelaufene Sitzungen bewahren die Queue. Nach bekanntem Rechteentzug werden lokale Kopien und zugehörige Queue-Einträge entfernt; ein offline befindliches Gerät kann nicht sofort ferngelöscht werden.
- App-Shell und bisher geladene Daten sind offline vorgesehen. Bei geschlossener App wird keine laufende Synchronisation versprochen. Keine Standort-, Widget-, CalDAV- oder Push-Funktion in diesem Stand.

## Tests

```sh
npm test
npm run build
# Benötigt einen startbaren Chromium und lokale TCP-Sockets:
npm run test:browser
```

`CHROMIUM_PATH` kann den Browserpfad überschreiben. Browserchecks benutzen temporäre Konten/Datenbanken, Port 3217 und schreiben Desktop-/360px-/320px-Aufnahmen für Hell/Dunkel nach `test-results/`. Sie ersetzen weder die Sichtprüfung dieser Aufnahmen noch den Abgleich mit einem echten Android-Gerät.

Weitere technische Entscheidungen und API-Verhalten: [Architektur](docs/ARCHITECTURE.md).
