# Architektur und Entscheidungen

## Grenzen der Komponenten

- `src/shared/model.ts`: gemeinsame Validierung, Titelgrenze, reine Datums-/Heute-Semantik.
- `src/server/domain.ts`: Listenrechte, Aufgaben, persönliche Präferenzen, Transaktionen und Konflikte. Kein React-Bezug.
- `src/server/app.ts`: HTTP, Sitzung, Origin-Prüfung, Limits und SSE.
- `src/client/store.ts`: IndexedDB, persistente Mutationen, Serverabgleich, optimistische Ansicht. Keine Zugangstokens im lokalen Speicher.
- `src/client/main.tsx`: Oberfläche und Formulare. Notizen werden ausschließlich als Text gerendert; Links sind auf HTTP/HTTPS beschränkt.

Der vorgeschlagene Stack wurde beibehalten. PGlite ergänzt PostgreSQL für einen Start ohne Docker und schnelle isolierte Tests. Beide verwenden dieselbe SQL-Migration; PGlite ist kein Test-Dummy. Tests ersetzen trotzdem keine Prüfung gegen den im Compose-Paket ausgewählten PostgreSQL-Server.

Versionen wurden beim Projektbeginn aus dem Registry aufgelöst und im Lockfile fixiert. Offizielle Grundlage: [Vite 8](https://vite.dev/blog/announcing-vite8.html), [Fastify LTS](https://github.com/fastify/fastify/blob/main/docs/Reference/LTS.md), [PGlite-Dateisysteme](https://pglite.dev/docs/filesystems). Node 24 wird im Container verwendet. Native CSS folgt der vorgegebenen Palette; systemeigene Schrift und Phosphor-Icons vermeiden externe Font-/Asset-Abhängigkeiten.

## API

Alle Antworten unter `/api` sind `no-store`. Alle schreibenden Browseranfragen verlangen exakt `Origin == APP_ORIGIN`. Das gilt auch für Login. SameSite-Strict-/HttpOnly-Sitzungscookies, bei HTTPS zusätzlich Secure. Zufällige Sitzungstoken werden nur gehasht serverseitig gespeichert, Laufzeit 30 Tage. Passwörter verwenden Node-scrypt mit zufälligem 128-Bit-Salt und 64-Byte-Ausgabe. Login hat ein Limit von 10 Versuchen/15 Minuten je ermittelter Client-IP. `TRUSTED_PROXIES` konfiguriert ausdrücklich vertrauenswürdige Proxy-IP-Adressen/CIDRs. Fastify wertet die Kette von der Socket-Gegenstelle bis zum ersten nicht vertrauenswürdigen Hop aus; frei gesetzte Header direkter Clients ändern den Schlüssel nicht. Ohne Konfiguration bleiben Forwarding-Header unberücksichtigt. [Traefik-Betrieb](TRAEFIK.md) beschreibt die nötige VPS-Einstellung.

- `POST /api/login`: `{username,password}` → eigener Benutzer; setzt Cookie.
- `POST /api/logout`: Sitzung löschen.
- `GET /api/me`: eigener Benutzer.
- `GET /api/sync?cursor=N&device=UUID`: autorisierter vollständiger Stand und monotoner Cursor, `reset` bei veraltetem/unpassendem Cursor.
- `POST /api/mutations`: `{key,device,entity,id,version,patch}`. Entitäten `task`, `preference`, `list`. Version 0 bedeutet Anlegen.
- `GET /api/events`: SSE-Cursor/Heartbeat ohne Aufgabeninhalte.
- `GET /api/health`: Datenbank-Liveness, ohne Anmeldung.

Es gibt keine getrennten unsicheren Such-/Exportendpunkte: Suche läuft nur über den bereits autorisierten Cache. Die Liste vorhandener Benutzer (ID, Name, Benutzername, Zeitzone) ist angemeldeten Benutzern für ausdrückliches Teilen sichtbar. Das ist eine bewusste Entscheidung für die geschlossene Installation, kein öffentliches Benutzerverzeichnis.

## Synchronisation

Für den kleinen Datenbestand sendet Sync einen vollständigen autorisierten Snapshot, kein optimiertes Delta. Der Cursor entsteht aus einer in jeder Domänentransaktion gesperrten `sync_clock`-Zeile. Dadurch stimmen Cursor- und Commit-Reihenfolge überein. Ein reines SQL-Sequence-Wasserzeichen hätte diese Eigenschaft bei parallelen Commits nicht. Diese Serialisierung ist bewusst einfach und für zwei Benutzer ausgelegt; sie ist keine Lösung für hohe Last.

Ein globales Journal speichert Ereignisse und unabhängige Lösch-Tombstones. Nach 90 Tagen setzt die Bereinigung einen Mindestcursor; alte Clients erhalten `reset` mit vollständiger Wahrheit. Aufgabenedits verlangen eine existierende ID und eine passende Version; verschwundene Objekte mit älterer Version liefern 410. Persistente Idempotenzbelege verhindern das erneute Erzeugen nach verlorener Antwort. Diese Belege werden vorerst nicht zeitlich gelöscht (Wachstum als zukünftige Betriebsoptimierung).

Aufgaben und Präferenzen speichern je Feld die zuletzt ändernde Version. Bei veralteter Objektversion dürfen nur inzwischen unveränderte oder identisch gesetzte Felder automatisch zusammengeführt werden. Verschieben und Löschen sind strukturell und konservativer. Konfliktantworten enthalten die autorisierte Serverfassung. Ein abgelaufener Zugriff wird vor Idempotenz-Wiederholung geprüft.

Clientseitig werden Snapshot, Cursor und Queue in derselben IndexedDB-Transaktion gespeichert. Nach Serverbestätigung wird zuerst der autorisierte Snapshot geladen; erst dann werden Snapshot und Entfernung des Queue-Eintrags gemeinsam committed. Ein Abbruch vorher lässt den Idempotenzschlüssel zur sicheren Wiederholung erhalten. Nachfolgende Offline-Schritte werden nur weitergeführt, wenn ihre ursprünglichen Feldwerte zur bestätigten Fassung passen; andernfalls wird auch dort ein Konflikt erhalten.

Web Locks serialisieren Sync zwischen Tabs desselben Ursprungs; IndexedDB-Transaktionen verhindern verlorene Queue-Einträge. BroadcastChannel aktualisiert offene Tabs. Serverrechte und Objektversionen bleiben die maßgebliche Sicherung bei mehreren Geräten. Ein Konto-/Sessionwechsel wird vor dem Übernehmen eines Snapshots geprüft. Verschieben räumt persönliche Präferenzen/Erinnerungen inzwischen unberechtigter Benutzer auf.

## Aufbewahrung, Sicherheit und Betrieb

Die lokale Kopie liegt im Browserprofil und ist nicht zusätzlich anwendungsseitig verschlüsselt. Sie ist nach erfolgreicher Erstanmeldung offline verfügbar. Zugriffsschutz des Geräts ist Voraussetzung. Nach bekanntem Entzug verschwinden Cache und zugehörige ausstehende Zugriffe; keine Fernlösch-Garantie bei Offlinegeräten.

Die API protokolliert keine Request-Bodies, Passwörter oder Aufgaben. Serverfehler geben allgemeine Nachrichten zurück. Tokens liegen nicht in LocalStorage; dort liegt nur die Darstellungspräferenz.

Die initiale SQL-Migration reserviert unabhängige Erinnerungs- und Push-Tabellen, bietet aber keinerlei Zustellfunktion. Weitere Stufe-B-Erweiterungen erfordern Tags, Gruppen, Listengestaltung, Sortierung/Filter, Wiederholungsserien und idempotente Jobs. Bibliothekswahl für Wiederholungen erfolgt erst bei dieser Implementierung. Keine handgeschriebene Wiederholungsarithmetik ist vorweggenommen.

## Abgelehnte neue Listen

Client und Server verwenden dieselbe getrimmte Listenname-Validierung (1–80 Zeichen). Das Formular zeigt Fehler bei erhaltenen Eingaben. Die Queue validiert neue Clientaufrufe zusätzlich, berücksichtigt aber auch bereits gespeicherte Anfragen älterer Clients: Eine nie bestätigte neue Liste ist kein Beweis für Rechteentzug. Ihre Ablehnung bleibt in der persistenten Queue samt Fehlermeldung erhalten. Die Oberfläche kann diese Anlegeanfrage mit neuem Idempotenzschlüssel korrigieren oder ausdrücklich zusammen mit ihren lokalen Folgeänderungen verwerfen. Abhängige Aufgaben/Präferenzen warten auf eine erfolgreiche Listenanlage.

Bei tatsächlich entzogenen Listenrechten werden Snapshot und zugehörige Queue-Einträge weiterhin entfernt; auch die Elternliste rein lokaler Aufgaben wird dazu berücksichtigt. Servervalidierungen bleiben gegenüber manipulierten Requests maßgeblich. Es gibt keine Schemaänderung.


## Listenfarben

`src/shared/listColors.ts` definiert stabile Farbkennungen, deutsche Namen und beide Theme-Werte zentral. `auto` erhält die bisherige Ableitung aus Mitgliedschaften. Fehlende/unbekannte Werte aus alten Caches werden bei der Darstellung sicher auf `auto` zurückgeführt; neue Mutationen mit ungültigen Werten werden durch dasselbe Zod-Schema auf Client und Server abgewiesen.

Die additive Migration 002 ergänzt `lists.color` mit Default und CHECK-Constraint. Migration 001 bleibt unverändert. Der Upgrade-Schritt läuft transaktional unter der bestehenden Datenbanksperre. Sync und portable Backups transportieren die Listenfarbe mit der Liste; Restore alter Backups nutzt den Spaltenstandard.

Listen behalten ihre konservative Objektversionsprüfung: Jede zwischenzeitliche Listenänderung kann einen Konflikt auslösen, der bestehende Dialog erhält beide Fassungen. Die Farbe nutzt keine separate Queue oder persönliche Präferenz. Das Formular merkt sich die beim Öffnen gelesene Version und sendet nur veränderte Felder; die Auflösung eines Farbkonflikts überschreibt damit weder Namen noch Mitglieder. Nur der Besitzer darf Listen mutieren; diese bestehende serverseitige Prüfung gilt auch für Farben. Der Eingang bleibt gegen Änderungen gesperrt.

Die Auswahl verwendet native Radiobuttons (Pfeiltasten, Tab, Screenreader-Namen), 44×44-Pixel-Ziele, sichtbaren Fokus und ein zusätzliches Häkchen. Farben erscheinen nur als Navigationspunkt und schmaler Überschriftakzent. Abbrechen oder Schließen erzeugt keine Mutation.

## Unteraufgaben

Migration 003 ergänzt `subtasks` mit UUID, unveränderlichem `task_id`-Fremdschlüssel (ON DELETE CASCADE), eigener Feldversionierung und serverseitigem Erstellungszeitpunkt. Der Fremdschlüssel zeigt ausschließlich auf `tasks`; Verschachtelung und Zyklen sind dadurch ausgeschlossen. Unteraufgaben enthalten nur Titel, Erledigungs- und Entfernungsstatus. Entfernte Schritte bleiben als nicht editierbare Tombstones bis zum endgültigen Löschen der Hauptaufgabe erhalten. Der autorisierte Snapshot transportiert sie separat und sortiert nach Erstellungszeit/ID. Die UI zeigt nur aktive Schritte innerhalb ihrer Aufgabe.

`subtask`-Mutationen nutzen dieselbe Queue, Idempotenzbelege, Feldkonflikte und Transaktionssperre wie Aufgaben. Zugriff folgt immer der aktuellen Hauptaufgabe/Listenzugehörigkeit, auch vor Replay. Neue Schritte erfordern eine existierende Hauptaufgabe; sie können weder gelöschte Eltern ersetzen noch fremde Eltern referenzieren. Schritte im Papierkorb sind nicht editierbar. Das Verschieben benötigt wie bisher Quell- und Zielrechte und ändert keine Kind-IDs.

`completion` ist eine atomare Statusaktion an einer Hauptaufgabe: `complete` enthält die explizit bestätigten offenen IDs; `reopen` ändert nur den Elternstatus; `undo` verweist auf den Idempotenzschlüssel der ursprünglichen Aktion. Der Server prüft die aktuelle Menge offener Schritte, speichert die vorherigen Zustände/Statusversionen im Mutationsbeleg und stellt sie bei Undo nur wieder her, wenn keine dazwischenliegenden Statusänderungen oder entfernten Schritte entgegenstehen. Titeländerungen werden dabei nicht überschrieben. Auch der vorherige Erledigungszeitpunkt wird restauriert. Änderungen an Hauptaufgabe und Schritten werden unter derselben gesperrten Sync-Uhr committed.

Die optimistische Projektion bildet diese Regeln ab. Lokale Undo-Daten liegen mit der Queue in IndexedDB; nach Bestätigung dient der persistierte Serverbeleg als Grundlage. Bestätigte Mutationen laden erst einen autorisierten Snapshot und entfernen ihren Queue-Eintrag anschließend in derselben IndexedDB-Transaktion. Abhängige Schritte warten auf die Hauptaufgabenanlage; Statusaktionen warten auf vorausgehende Schritte. Nachfolgende Mutationen werden nur bei passenden Feldwerten auf bestätigte Versionen gesetzt. Konflikte sind einzeln auflösbar; bei atomaren Statuskonflikten verwirft man die abgelehnte Aktion und bestätigt den aktuellen Stand neu. Rechteentzug bereinigt auch rein lokale Kinder.

Backup `notera-2` enthält `subtasks` nach `tasks`; ein altes Programm lehnt das neue Format ab, statt Schritte still zu verlieren. Restore akzeptiert zusätzlich `notera-1` ohne Kindtabelle. Beide laufen vollständig in einer Transaktion. Der bestehende GitHub-Actions-Workflow bleibt der Prüf- und Containerweg; PRs veröffentlichen weiterhin keine Images.

## Aufklappbare Unteraufgabenansicht

Die Listenansicht nutzt dieselbe `Subtasks`-Komponente in einer kompakten Variante: Checkbox, Titel und zusätzliche Eingabe; die Detailvariante behält Bearbeiten/Entfernen und ergänzt einen schmalen Balken mit anzahlbezogenen ARIA-Werten. Beide lesen `store.projected()` und schreiben ausschließlich über das bestehende `enqueue("subtask", …)`. Datenmodell, Server, Queue und Statusregeln bleiben unverändert.

Eine UUID-basierte Menge im App-Zustand speichert ausschließlich lokal, welche Hauptaufgaben aufgeklappt sind. Sie wird bei Snapshot-Updates nicht ersetzt und ist von erledigten/gelöschten Statuswerten unabhängig. Pfeil, Fortschritt, Hauptcheckbox und Detailöffnung sind getrennte Buttons; es gibt keine ineinander verschachtelten Buttons. Unteraufgaben-Regionen sind über `aria-controls` zugeordnet, beide Aufklappbuttons tragen `aria-expanded`. Mehrere Instanzen bekommen über React `useId` eindeutige Formular-/Fehlerbeschriftungen.

Im Detailpanel steht das Unteraufgabenformular außerhalb des Hauptaufgabenformulars direkt nach dem Titel. Das Titelfeld bleibt über sein `form`-Attribut dem Hauptformular zugeordnet. Die bestehenden lokalen Entwürfe für Titel, Notizen, Links und Fälligkeit werden bei Unteraufgabenänderungen nicht neu initialisiert. Aufklappen geschieht ohne Animation; Fokus kehrt nach Escape zur Hinzufügen-Schaltfläche zurück. Im Papierkorb bleiben alle schreibenden Kindaktionen deaktiviert.
