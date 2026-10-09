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

Alle Antworten unter `/api` sind `no-store`. Alle schreibenden Browseranfragen verlangen exakt `Origin == APP_ORIGIN`. Das gilt auch für Login. SameSite-Strict-/HttpOnly-Sitzungscookies, bei HTTPS zusätzlich Secure. Zufällige Sitzungstoken werden nur gehasht serverseitig gespeichert, Laufzeit 30 Tage. Passwörter verwenden Node-scrypt mit zufälligem 128-Bit-Salt und 64-Byte-Ausgabe. Login hat ein IP-Limit; bei Reverse-Proxy-Betrieb wird absichtlich keinem frei mitgelieferten `X-Forwarded-For` vertraut. Damit teilen sich hinter einem Proxy alle Geräte dessen Limit von 10 Versuchen/15 Minuten; für diese Zweipersoneninstallation akzeptiert.

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

Die initiale SQL-Migration reserviert unabhängige Erinnerungs- und Push-Tabellen, bietet aber keinerlei Zustellfunktion. Stufe B erfordert zusätzlich Unteraufgaben mit Zyklenschutz, Tags, Gruppen, Listengestaltung, Sortierung/Filter, Wiederholungsserien und idempotente Jobs. Bibliothekswahl für Wiederholungen erfolgt erst bei dieser Implementierung. Keine handgeschriebene Wiederholungsarithmetik ist vorweggenommen.
