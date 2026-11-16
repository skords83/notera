# Notera

Selbst gehostete Aufgaben-App für zwei Personen. React/Vite-PWA, Fastify-API und PostgreSQL. Darkmode, optional Hell- und Systemmodus. Der Entwicklungsauftrag und die unveränderte Designreferenz liegen unter [`docs/reference/`](docs/reference/).

**Stand: Stufe A implementiert, Abnahme noch nicht vollständig.** Automatisierte Domänen-, API-, Offline-Queue- und Browserregressionen bestehen in GitHub Actions. Manuelle Screenshot-/Screenreader- und Android-Prüfungen bleiben offen. Docker-Build, Compose-Start mit PostgreSQL und Kontopersistenz nach Containerneustart wurden inzwischen in GitHub Actions erfolgreich geprüft. Listenfarben, Unteraufgaben, gemeinsame manuelle Reihenfolge und persönliche Markierung sind umgesetzt; weitere Funktionen aus Stufe B sind nicht enthalten. Details: [Prüfbericht](docs/STATUS.md).

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
docker compose pull
docker compose up -d

docker compose exec app npm run user:add -- sven "Sven"
docker compose exec app npm run user:add -- sandra "Sandra"
```

GitHub Actions baut und veröffentlicht das Image nach erfolgreichen Tests und einem Container-Starttest mit PostgreSQL. Der Server benötigt dadurch weder Node.js noch einen lokalen Build. Ein Update lädt mit `docker compose pull` das neue Image; `docker compose up -d` startet es. Vorher sichern.

- Registry: `ghcr.io/skords83/notera`
- `latest`: letzter erfolgreicher Build von `main`
- `sha-<vollständige Commit-SHA>`: Build eines bestimmten Commits
- `v*`: Versions-Tags werden unverändert als Image-Tag veröffentlicht
- Plattform: zunächst `linux/amd64` (x86-64-Server)
- Pull Requests prüfen Tests und Containerstart, veröffentlichen aber kein Image.
- Manuell: GitHub → Actions → **Test and publish Docker image** → **Run workflow**, Branch `main`.

Der Workflow nutzt das automatisch bereitgestellte `GITHUB_TOKEN`; zusätzliche Registry-Secrets sind nicht erforderlich. Ein neues GHCR-Paket kann zunächst privat sein, auch wenn das Repository öffentlich ist. Falls `docker compose pull` eine Anmeldung verlangt, unter GitHub → Profil → Packages → notera → Package settings die Sichtbarkeit bewusst auf Public setzen oder auf dem Server `docker login ghcr.io` mit einem Token mit `read:packages` verwenden. [GitHub-Dokumentation zur Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

Für einen ausdrücklich gewünschten lokalen Docker-Build bleibt ein Override verfügbar:

```sh
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

Die API bleibt standardmäßig an `127.0.0.1:${APP_PORT:-3000}` gebunden. Die Datenbank veröffentlicht keinen Port. Den vorhandenen HTTPS-Reverse-Proxy auf die App richten; bei einem Proxy in einem anderen Container ein passendes gemeinsames Netzwerk konfigurieren. Domain und Proxy bleiben Bereitstellungseinstellungen. `APP_ORIGIN=https://deine-domain` setzen. HTTPS aktiviert `Secure`-Cookies. HTTP darf nicht als Produktionsbetrieb genutzt werden.

**Traefik und Anmeldelimit:** Beim späteren VPS-Update `TRUSTED_PROXIES` auf die tatsächliche Traefik-Absenderadresse bzw. eine eng begrenzte vertrauenswürdige Proxy-Kette setzen. Ohne Konfiguration werden Forwarding-Header weiterhin ignoriert. Details, Netzwerkbeispiele und Prüfschritte: [Traefik-Konfiguration](docs/TRAEFIK.md). Niemals pauschal `trustProxy: true` oder alle privaten Netze freigeben.

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

Die Sicherungsdatei wird exklusiv neu angelegt (Unix-Modus 0600). Die Wiederherstellung verweigert eine Datenbank mit bestehenden Benutzern. Alle Tabellen werden in einer Transaktion gesichert bzw. wiederhergestellt. Nach Restore neu anmelden. Listenfarben sind im bestehenden JSON-Format enthalten; ältere Sicherungen ohne Farbspalte erhalten `auto`. Neue Sicherungen nutzen `notera-4` und benötigen zum Restore mindestens Schema 005. Ältere Formate 1–3 bleiben lesbar.

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

Die portablen JSON-Sicherungen sind für eine kleine persönliche Installation gedacht. Große Installationen sollten `pg_dump` und dessen Restore regelmäßig prüfen. Restore in frische PGlite-Datenordner und PostgreSQL-Testdatenbanken wird automatisiert geprüft, einschließlich Upgrade alter Formate, Unteraufgaben und manueller Positionen. Containerstart und Neustart mit PostgreSQL sind ebenfalls geprüft. Dies ersetzt weder die Wiederherstellung einer tatsächlichen produktiven Sicherung noch eine Abnahme des installierten VPS-Stands; Details im [Prüfbericht](docs/STATUS.md).

## Aktualisierung

1. Sicherung erstellen und Wiederherstellbarkeit prüfen.
2. Release-/Migrationshinweise lesen; Quellcode und Lockfile gemeinsam aktualisieren.
3. `npm ci`, `npm test`, `npm run build` ausführen, dann lokal neu starten bzw. `docker compose pull && docker compose up -d`.
4. Gesundheit, Anmeldung und Synchronisation prüfen.

Migration `001_initial.sql` wird nur bei einer frischen Datenbank ausgeführt und in `schema_migrations` erfasst. Für spätere Schemaänderungen müssen neue nummerierte Migrationen und gesonderte Upgrade-Anweisungen ergänzt werden. Migration `002_list_colors.sql` ergänzt beim Start transaktional `lists.color` (Standard `auto`); bestehende Daten bleiben erhalten. Sie läuft sowohl mit PostgreSQL als auch PGlite und wird nur einmal angewendet. Es gibt keine automatische destruktive Migration. Ein neuer Service Worker wartet, bis alte App-Tabs geschlossen sind; nach einem Update alle Tabs einmal schließen und neu öffnen.

## Bedienung und Grenzen

- Titel + Enter genügt. Titel werden beidseitig getrimmt, maximal 240 UTF-16-Codeeinheiten. Keine natürliche Datumserkennung.
- Eingang ist immer privat. Neue Listen sind privat, bis beim Anlegen oder Verwalten ausdrücklich Personen gewählt werden.
- Beim Anlegen und Verwalten einer Liste kann der Besitzer eine von zehn ruhigen Farben wählen. „Automatisch“ erhält die bisherige Darstellung (privat violett, geteilt grün). Speichern übernimmt die Auswahl auch offline; Abbrechen verwirft sie. Die Farbe gilt für alle Mitglieder, Eingang und Systemansichten bleiben unverändert.
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

Vor dem ersten Browserlauf `npx playwright install --with-deps chromium` ausführen (unter Linux gegebenenfalls Systemrechte für Browserbibliotheken nötig). Standardmäßig wird der zu Playwright passende Chromium verwendet; `CHROMIUM_PATH` kann den Browserpfad überschreiben. Browserchecks benutzen temporäre Konten/Datenbanken, Port 3217 und schreiben Desktop-/360px-/320px-Aufnahmen für Hell/Dunkel nach `test-results/`. Sie ersetzen weder die Sichtprüfung dieser Aufnahmen noch den Abgleich mit einem echten Android-Gerät.

Weitere technische Entscheidungen und API-Verhalten: [Architektur](docs/ARCHITECTURE.md).

Der bestehende GitHub-Workflow führt auch Browser-Regressionstests mit temporären Testkonten aus und stellt die Aufnahmen als `browser-screenshots`-Artefakt bereit. Für PRs laufen Tests und Container-Build; der Veröffentlichungsjob bleibt gesperrt.

## Unteraufgaben (Schema 003)

Im Aufgabendetail unter **Unteraufgaben** einen Titel eingeben und Enter drücken. Das Feld bleibt für den nächsten Schritt bereit. Titel anklicken zum Bearbeiten; Enter übernimmt, Escape verwirft die Bearbeitung. Titel werden getrimmt und sind wie Hauptaufgaben auf 240 UTF-16-Codeeinheiten begrenzt. Schritte haben eine gemeinsame manuelle Reihenfolge (siehe unten), ohne eigene Termine, Markierungen oder weitere Ebenen. In der Aufgabenliste steht beispielsweise „2 von 5“.

- Alle Schritte abzuhaken erledigt die Hauptaufgabe nicht automatisch.
- Bei offenen Schritten fragt das Erledigen mit deren Anzahl nach **Alles erledigen** oder **Abbrechen**. Die bestätigten Schritte und die Hauptaufgabe werden gemeinsam transaktional erledigt.
- Wiederöffnen der Hauptaufgabe lässt die Schritte unverändert. Ein neuer oder wieder geöffneter Schritt öffnet eine erledigte Hauptaufgabe wieder.
- **Rückgängig** stellt die von dieser Aktion geänderten Statuswerte und den Erledigungszeitpunkt atomar wieder her. Zwischenzeitliche Statusänderungen führen zu einem sichtbaren Konflikt statt zum Überschreiben anderer Arbeit.
- Listenmitglieder bearbeiten Schritte gemeinsam. Einzelne Schritte lassen sich innerhalb derselben Liste einer anderen Hauptaufgabe zuordnen (siehe unten). Listenwechsel, Papierkorb und Wiederherstellung der Hauptaufgabe betreffen weiterhin ihre verbleibenden Schritte; endgültiges Löschen entfernt diese Schritte.
- Offline funktioniert auch „neue Hauptaufgabe → sofort Schritte hinzufügen“. Einzelne Schritte haben eigene Versionen. Abgelehnte Änderungen bleiben in der Queue sichtbar; Rechteentzug entfernt nach dem Serverabgleich die betroffenen lokalen Daten entsprechend den bestehenden Regeln.

**Upgrade:** Vorher sichern. Migration `003_subtasks.sql` läuft beim App-Start automatisch und transaktional unter PostgreSQL/PGlite; 001/002 bleiben unverändert. Seit Schema 004 nutzen neue JSON-Sicherungen `notera-3`; zum Restore ist mindestens Schema 004 erforderlich. Alte `notera-1`-Sicherungen sind weiterhin importierbar und enthalten keine Unteraufgaben. Danach alle PWA-Tabs schließen und neu öffnen, damit der neue Service Worker aktiv wird. Alte Clients können Aufgaben mit offenen Schritten nicht ohne Bestätigung erledigen; ihre abgewiesene Änderung bleibt sichtbar.

Der bestehende Containerablauf bleibt: nach Review/Merge und erfolgreichem Image-Build auf dem VPS sichern, `docker compose pull`, `docker compose up -d`, anschließend Healthcheck, Anmeldung und Synchronisation prüfen. Dieser Entwicklungsauftrag rollt nichts produktiv aus.

### Unteraufgaben direkt in der Liste

Der Pfeil neben dem Haupttitel oder der Fortschritt („2 von 5 erledigt“, „Alle 5 erledigt“) klappen die Schritte unter einer Aufgabe auf. Der Fortschritt erscheint nur eingeklappt; aufgeklappt folgen direkt die eingerückten Schritte und **+ Unteraufgabe**. Eine Trennlinie schließt die gesamte Gruppe ab. In einer konkreten Liste entfällt der wiederholte Listenname, in listenübergreifenden Ansichten und Suchergebnissen bleibt er sichtbar. Fälligkeit und Zuweisung bleiben erhalten. Mehrere Aufgaben können gleichzeitig offen bleiben; der lokale Aufklappzustand übersteht Abhaken und Synchronisation, wird aber nicht zwischen Personen geteilt und darf nach Neuladen zurückgesetzt sein. Der Haupttitel öffnet weiterhin die Details, die Hauptcheckbox behält ihre Bestätigungs-/Rückgängig-Regeln.

Im aufgeklappten Bereich Schritte einzeln abhaken oder wieder öffnen. **Erledigte zeigen** steuert auch die Schritte: ausgeschaltet verschwinden erledigte Zeilen, eingeschaltet stehen sie durchgestrichen an ihrer gespeicherten Position. Fortschritt und Gesamtzahl zählen weiterhin alle nicht entfernten Schritte. Im Detailpanel steht dafür **Erledigte Unteraufgaben zeigen**; beide Schalter steuern dieselbe Ansicht. Beim Abhaken einer verschwindenden Zeile bleibt der Fokus bei einem sichtbaren Nachbarschritt oder der Hinzufügen-Eingabe. **+ Unteraufgabe** öffnet die Eingabe: Enter speichert und hält sie bereit, Escape verwirft den aktuellen Entwurf und setzt den Fokus zurück. Auch die erste Unteraufgabe lässt sich hier anlegen: **… → Unteraufgabe hinzufügen** öffnet direkt das fokussierte Eingabefeld. Das Menü ist auch ohne Hover erreichbar. Enter speichert und lässt die Gruppe offen; Escape verwirft die aktuelle Eingabe. Ohne vorhandene Schritte verschwindet dabei der leere Bereich und der Fokus kehrt zum Menübutton zurück. Bei Validierungsfehlern bleiben Text und Fehlermeldung sichtbar.

Im Detailpanel steht der vollständige Abschnitt direkt nach dem Titel, einschließlich Bearbeiten/Entfernen und schmalem Fortschrittsbalken ohne Prozentzahl. Unteraufgaben werden sofort über die bestehende Offline-Queue gespeichert; die übrigen Detailfelder behalten ihre ungespeicherten Eingaben bis **Speichern**. Im Papierkorb sind Schritte nur lesbar. Diese Darstellungsänderung erfordert keine neue Migration, keine zusätzlichen Abhängigkeiten und keine geänderten VPS-Einstellungen.


## Manuelle Reihenfolge (Schema 004)

In einer konkreten Liste einschließlich **Eingang** lassen sich Hauptaufgaben sortieren. Der ständig sichtbare **…**-Menübutton rechts lässt sich zusätzlich als Sortiergriff verwenden: **ziehen** zeigt eine Einfügelinie und bewegt die gesamte aufgeklappte Gruppe; **tippen, klicken oder Enter** öffnet das Aufgabenmenü mit **Nach oben** und **Nach unten**. Tab erreicht die Aktionen ohne Hover, nicht mögliche Richtungen sind deaktiviert. Escape, Zeigerabbruch oder Fokusverlust beim Ziehen verwerfen die Vorschau. An den oberen/unteren Rändern scrollt die Ansicht. Außerhalb des Griffs funktioniert normales Touchscrollen. Eine höfliche Screenreader-Meldung nennt nach dem Ablegen die neue lokale Position; der Synchronisationsstatus zeigt, ob sie bereits serverseitig bestätigt ist.

- Hauptaufgaben werden innerhalb ihres offenen beziehungsweise erledigten Statusbereichs sortiert. Bei **Erledigte zeigen** stehen beide Bereiche getrennt. Menüaktionen bewegen zur unmittelbar benachbarten sichtbaren Aufgabe desselben Bereichs. Abhaken oder Wiederöffnen verändert die gespeicherte Position nicht.
- **Heute, Geplant, Alle, Markiert, Erledigt, Suchergebnisse und Papierkorb** behalten ihre bisherige Hauptaufgabensortierung. Auch eine Suche aus einer konkreten Liste deaktiviert diese Sortierung. Ausgeblendete und gelöschte Aufgaben bleiben in der gespeicherten Reihenfolge; nur die ausdrücklich bewegte ID wechselt ihren Platz, die übrigen IDs behalten ihre relative Reihenfolge.
- Unteraufgaben lassen sich innerhalb ihrer Hauptaufgabe sowohl aufgeklappt in der Übersicht als auch im Detailpanel auf dieselben zwei Arten sortieren. Beide zeigen dieselbe Reihenfolge. Erledigte Schritte behalten darin ihre gespeicherte Position und werden über **Erledigte zeigen** sichtbar; Abhaken allein sortiert nichts um. Im Detailmenü steht zusätzlich **Unteraufgabe entfernen**, der Titel bleibt zum Bearbeiten anklickbar. Im Papierkorb sind keine Sortieraktionen verfügbar.
- Neue Haupt- und Unteraufgaben werden angehängt. Die bestehende Ziellisten-Funktion fügt eine Hauptaufgabe am Ende der anderen Liste ein; ihre Schritte behalten ihre Reihenfolge. Ziehen wechselt niemals die Liste; Unteraufgaben können dabei zwischen Hauptaufgaben derselben Liste wechseln. Papierkorb und Wiederherstellung behalten die Position; Sortierungen anderer Aufgaben können deren relative Umgebung verändern.
- Eine geteilte Liste hat eine gemeinsame Reihenfolge für alle bearbeitungsberechtigten Mitglieder. Lokal gespeicherte Verschiebungen funktionieren offline, auch unmittelbar nach einer Offlineanlage und über Neuladen hinweg. Nach Wiederverbindung erscheint die Reihenfolge auch bei Sandra.
- Wurde die bewegte Aufgabe oder der Zielnachbar inzwischen sortiert, gelöscht, verschoben oder in einen anderen Statusbereich versetzt, erscheint ein sichtbarer Konflikt. Die abgelehnte Sortierung wird nicht mehr als aktuelle Reihenfolge dargestellt. Unter **Änderungen prüfen** die Serverfassung behalten und die Position erneut wählen; bereits vorgemerkte Folgeverschiebungen müssen ebenfalls ausdrücklich geprüft und verworfen/neugewählt werden. Der Dialog nennt die betroffene Aufgabe, den gewünschten Nachbarn und die aktuelle Position. Rechteentzug entfernt die betroffenen Kopien/Queue-Einträge und hinterlässt einen bestätigbaren Hinweis, dass Änderungen nicht übernommen wurden.

**Upgrade:** Vorher sichern. Die additive Migration `004_manual_order.sql` läuft beim App-Start transaktional unter PostgreSQL und PGlite; Migrationen 001–003 bleiben unverändert. Bestehende Hauptaufgaben erhalten ihre bisherige Reihenfolge nach Änderungszeit, Schritte nach Erstellungszeit; UUIDs entscheiden Zeitgleichstände deterministisch. Neue Backups im Format `notera-3` enthalten Positionen, Reihenfolgeversionen und Idempotenzbelege. Restore akzeptiert weiterhin `notera-1`/`notera-2` und erzeugt für diese dieselbe Ausgangsreihenfolge. Neue Sicherungen nicht mit einer älteren App wiederherstellen.

Nach Review/Merge und erfolgreichem bestehenden Containerworkflow: VPS sichern, `docker compose pull`, `docker compose up -d`, Healthcheck und Synchronisation prüfen. Alle PWA-Tabs schließen und neu öffnen. Keine neuen Umgebungsvariablen oder Abhängigkeiten; kein produktiver Rollout durch diesen Auftrag. Echte Android-/Screenreader-Prüfung siehe [Prüfbericht](docs/STATUS.md).

### Einzelne Unteraufgaben verschieben

In der Übersicht zuerst den Pfeil links neben der Hauptaufgabe öffnen, dann rechts **…** an der gewünschten Unteraufgabe antippen (auch ohne Hover). Im Detailpanel steht derselbe Button rechts an jedem sichtbaren Schritt. Dort **Zu anderer Aufgabe verschieben** wählen. Erledigte Schritte gegebenenfalls zuerst über den Schalter einblenden. Der Dialog sucht nach Hauptaufgaben derselben Liste. Die aktuelle Hauptaufgabe und Aufgaben im Papierkorb sind ausgeschlossen. Ziel per Touch oder mit Tab/Pfeiltasten/Leertaste auswählen und **Verschieben** bestätigen; **Abbrechen** oder Escape schließen den Dialog ohne Änderung.

In der Übersicht lässt sich der bestehende **…**-Griff einer Unteraufgabe auch auf eine andere Hauptaufgabe derselben Liste ziehen. Das Ziel erhält einen deutlichen Rahmen. Nach kurzem Verweilen öffnet es sich vorübergehend; beim Ende des Ziehens gilt wieder der vorherige Klappzustand. Auf dem Haupttitel zeigt **Am Ende einfügen** die Endposition, an sichtbaren Schritten markiert eine Linie die genaue Einfügeposition. Ausgeblendete erledigte Schritte behalten ihre relative Reihenfolge. Innerhalb der bisherigen Hauptaufgabe bleibt das Sortieren unverändert. Randscrollen funktioniert beim Ziehen; außerhalb des Griffs bleibt normales Touchscrollen möglich. Escape, Touch-Abbruch und Ablegen außerhalb gültiger Ziele verwerfen die Vorschau. Menü und Suchdialog bleiben als Tastatur- und Touchalternative erhalten.

ID, Titel und Status bleiben erhalten; beim Menüverschieben erscheint der Schritt am Ende des Ziels. Ein offener Schritt öffnet eine erledigte Zielaufgabe wieder. Die Quelle wird nicht automatisch erledigt. Beide Fortschrittsanzeigen aktualisieren sich sofort. Offline bleibt die Verschiebung einschließlich lokaler Neuanlagen über Neuladen erhalten; der Synchronisationsstatus zeigt den noch ausstehenden Abgleich. Erst nach Serverbestätigung erscheint die Erfolgsmeldung.

Veränderte oder nicht mehr verfügbare Ziele erzeugen einen Konflikt unter **Änderungen prüfen**. Die Aktion verwerfen und das Ziel erneut wählen. Alte Completion-/Undo- und Sortieraktionen dürfen keine zwischenzeitlichen Elternwechsel überschreiben. Listenübergreifende Einzelverschiebungen bleiben ausgeschlossen. Die Einzelverschiebung selbst benötigt keine neue Migration; für den aktuellen Gesamtstand gelten Schema 005 und Backupformat `notera-4`. Nach Aktualisierung bestehende PWA-Tabs neu öffnen.

Prüfungen und verbleibende Grenzen: [Prüfbericht Unteraufgabenverschiebung](docs/SUBTASK-MOVE-CHECKS.md) und [Drag-and-drop-Prüfbericht](docs/SUBTASK-DRAG-CHECKS.md).


### Hauptaufgabe als Unteraufgabe verschieben

Prüfdetails: [Drag-and-drop-Umwandlung](docs/TASK-DRAG-CONVERSION-CHECKS.md).

In der manuellen Listenansicht den **…**-Griff einer Hauptaufgabe ziehen: Auf den Hauptzeilen zeigt eine horizontale Linie die Sortierposition. Während des Ziehens erscheint rechts an anderen Hauptaufgaben eine umrahmte **↳**-Zielzone über dem Aktionsgriff. Sie bietet die Umwandlung an; die beschriftete, eingerückte Vorschau am oberen Fensterrand nennt **Als Unteraufgabe ablegen** und die Endposition. Die Zielzone überlagert nur den Aktionsgriff: Titel und aufgeklappte Schritte bleiben frei, die Zeilenhöhe bleibt kompakt. Nach kurzem Verweilen öffnet sich das Ziel vorübergehend. Bekannte Sperrgründe erscheinen in der Vorschau; private Daten anderer Listenmitglieder werden erst beim verbindlichen Serverabgleich geprüft. Escape, Touch-Abbruch und Ablegen außerhalb gültiger Ziele ändern nichts. Außerhalb des Griffs bleibt Touchscrollen erhalten. Die folgende Menüalternative bleibt verfügbar.

Rechts an der Hauptaufgabe **… → Als Unteraufgabe verschieben** wählen; derselbe Menüeintrag steht oben im Detailpanel. Dort ungespeicherte Feldänderungen zuerst speichern. **Aufgabe suchen** filtert andere Hauptaufgaben derselben Liste außerhalb des Papierkorbs. Auch eine erledigte Hauptaufgabe kann Ziel sein. Ziel per Radioauswahl bestimmen und **Verschieben** bestätigen. Escape/Abbrechen ändern nichts.

Titel, Erledigungsstatus und UUID bleiben erhalten. Der Schritt wird am Ziel angehängt; ein offener Schritt öffnet ein erledigtes Ziel wieder. Umwandlungen bleiben offline über Neuladen erhalten und werden nach Wiederverbindung abgeglichen. Erfolg wird erst nach Serverbestätigung gemeldet.

Eine Hauptaufgabe mit eigenen Unteraufgaben kann noch nicht umgewandelt werden. Auch entfernte Schritte mit Verlauf verhindern den Wechsel. Notizen, Links, Termine, Zuweisungen, Erinnerungen und persönliche Auswahl/Markierungen eines beliebigen Mitglieds blockieren mit konkreter Erklärung. Solche Daten vorher bewusst entfernen; persönliche Einstellungen kann nur das betreffende Mitglied selbst entfernen. Es gibt keine automatische Kinderverschiebung, Archivkopie oder listenübergreifende Umwandlung. Konflikte unter **Änderungen prüfen** behalten den lokalen Text; abgelehnte Umwandlung verwerfen und das Ziel erneut wählen. Es gibt vorerst keine Rückumwandlung und kein Umwandlungs-Undo.

Schema 005 wird beim nächsten App-Start additiv angewendet; Migrationen 001–004 bleiben unverändert. Neue Sicherungen (`notera-4`) enthalten Identitätszuordnung und Aktionsbelege. Vor einem späteren regulären Update sichern und danach PWA-Tabs neu öffnen. Dieser Auftrag führt keinen Merge oder produktiven Rollout aus. Details: [Prüfbericht](docs/TASK-CONVERSION-CHECKS.md).
