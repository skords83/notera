# Entwicklungs- und Prüfbericht

Stand: 9. Oktober 2026. **Der vollständige Entwicklungsauftrag ist noch nicht abgeschlossen.** Stufe A ist implementiert und automatisiert geprüft, aber noch nicht vollständig abgenommen. Stufe B bleibt entsprechend der ausdrücklich vorgegebenen Abnahmereihenfolge offen.

## Vorhanden

- Eigenständiges React-/TypeScript-/Fastify-Projekt mit Lockfile, gemeinsamer Validierung und versionierter initialer SQL-Migration.
- Dauerhafter PostgreSQL-Speicher; lokal PGlite mit derselben Migration. Bootstrap-CLI für zwei getrennte Konten ohne Standardpasswörter.
- Sitzungen, scrypt-Passwörter, Origin-/CSRF-Prüfung, Login-Limit, Sicherheitsheader.
- Persönlicher Eingang, private und ausdrücklich geteilte Listen, Besitzer-/Mitgliedsrechte und validierte Zuweisung.
- Aufgaben mit Titel, Notizen, HTTP-/HTTPS-Links, Datum oder Uhrzeit mit Zeitzone; Bearbeiten, Verschieben, Erledigen, Wiederöffnen und Rückgängig.
- Persönliche Heute-Auswahl, Überfällige und frühere Auswahl, Suche, Geplant/Alle/Markiert/Erledigt, Papierkorb/Wiederherstellen.
- Dauerhafte IndexedDB-Queue mit UUIDs/Idempotenzschlüsseln, versionierte Konflikte, atomare Bestätigung, Abgleich bei Öffnen/Fokus/Online und Cursor-SSE.
- Rechteentzug bereinigt bekannten lokalen Zugriff. Sitzungsablauf bewahrt Änderungen. Mehrere Tabs verwenden IndexedDB-Transaktionen und Web Locks.
- App-Shell-Service-Worker, Manifest und PNG-Icons; responsive Navigation, Desktop-Detailpanel, Hell-/Dunkel-/Systemdarstellung, Tastaturfokus und native Dialoge.
- Compose, Healthchecks, persistentes DB-Volume, Backup-/Restore-CLI, Betriebshinweise.

## Tatsächlich ausgeführte Prüfungen

`npm test`: bestanden, zwei Testdateien. Direkt ausgeführt ergeben diese **acht Domänen-/API-Tests plus einen umfangreichen Offline-Integrationstest**. Der Node-26-Testprozess zeigt im Gesamtlauf die zwei Testdateien als Einheiten an.

Die Domänentests prüfen insbesondere:

1. Privater Eingang unsichtbar für den anderen Benutzer; unberechtigte Änderungen/Ziellisten abgewiesen; geteilte Bearbeitung und Besitzerrechte.
2. Berechtigungsentzug mit bereinigter Zuweisung; ab dann keine weiteren Aufgaben-/Sync-Zugriffe.
3. Wiederholung identischer Requests ohne doppelte Aufgabe; derselbe Schlüssel mit verändertem Inhalt abgewiesen.
4. Unabhängige parallele Feldänderungen erhalten; gleiche Felder sowie Löschen/Bearbeiten/Verschieben erzeugen Konflikte.
5. Persönliche Heute-Auswahl verändert den anderen Benutzer nicht; fällig und ausgewählt liefert eine Kategorie.
6. Leere/zu lange Titel, unzulässige Links/Zuweisungen, falsche Kalenderdaten sowie nicht existierende/mehrdeutige Berliner Uhrzeiten abgewiesen. Datumswerte bleiben über Zeitzonen unverändert.
7. Papierkorbbereinigung erzeugt unabhängige Tombstones; zu alte Cursor erfordern Reset; endgültig gelöschte Aufgaben werden nicht durch Edits wiederbelebt.
8. HTTP-Sitzungen, Origin-Schutz, Cookieattribute, Logout und Login-Limit.

Backup und Persistenz werden im selben Testpaket mit einer **echten PGlite-Datenbank** geprüft: Schließen und Wiederöffnen des Datenordners; vollständige Sicherung; Restore in einen zweiten frischen Datenordner; Vergleich der Aufgaben und Listen; Restore in eine bereits befüllte Instanz abgewiesen. Das ist kein Nachweis für Containerneustart oder PostgreSQL-Container-Restore.

Der Offline-Integrationstest verwendet den tatsächlichen Client-Store und die tatsächliche Fastify-API/PGlite-Datenbank. Browser-APIs und IndexedDB werden durch `fake-indexeddb`/Testadapter bereitgestellt; Netzwerkaufrufe laufen über Fastify Injection. Geprüft sind Offline-Anlegen/-Bearbeiten/-Erledigen, erneutes Laden des Clientmoduls aus gespeichertem Zustand, Antwortverlust nach Commit, Serverfehler, Sessionablauf mit erneuter Anmeldung, echte Versionskonflikte, explizite Wiederherstellung nach Löschkonflikt, Konflikte in späteren Queue-Schritten sowie Rechteentzug. **Das ersetzt keinen echten Browser-/Geräteneustart.**

`npm run build`: bestanden, einschließlich strikter TypeScript-Prüfung und Service-Worker-Erzeugung. Der Clientbundle beträgt rund 551 kB minifiziert / 162 kB gzip; Vite gibt eine Größenwarnung aus. Eine spätere Aufteilung ist möglich, aber keine Funktionsabnahme.

Produktionsdateien über Fastify Injection: `/`, Manifest, Service Worker, beide PNG-Icons und `/api/health` jeweils HTTP 200 mit korrektem Inhaltstyp. Keine realen TCP-Verbindungen in diesem Test.

Die Paketinstallation meldete keine bekannten Schwachstellen. Die abschließende separate Prüfung `npm audit --omit=dev` konnte wegen `EAI_AGAIN registry.npmjs.org` nicht abgeschlossen werden. Sie ist **nicht als bestandener vollständiger Sicherheitscheck** zu werten.

## Blockierte/noch offene Abnahme

- Lokaler Webserver: Start versucht, `listen EPERM 127.0.0.1:3000`. Die Ausführungsumgebung untersagt lokale Sockets.
- Chromium: Start versucht, `setsockopt: Operation not permitted`, Prozess beendet. Deshalb keine durchgeführte visuelle Desktop-/360px-/320px-Kontrolle, keine geprüften Screenshots, keine reale Tastatur-/Touch-Abnahme.
- Docker ist hier nicht installiert. Compose-Start, PostgreSQL-Container, Containerneustart und Container-Backup/Restore nicht durchgeführt.
- Echter Abgleich zwischen PC und Android, installierte Android-PWA, Offline-App-Neustart sowie Bildschirmtastatur nicht geprüft.
- Der vorbereitete `npm run test:browser`-Lauf wurde wegen dieser Umgebungssperren nicht vollständig ausgeführt. Er ist ein Startpunkt für echte Browserchecks, keine Behauptung bestandener Abnahme.
- Keine produktive Veröffentlichung und keine Änderung an einem laufenden Server.

## Nächste Abnahme in geeigneter Umgebung

1. Lokalen Produktionsbuild starten und `npm run test:browser` ausführen. Screenshots beider Farbschemata prüfen; Details, lange Texte, Navigation und Tastatur separat auf 320/360px kontrollieren.
2. Compose starten, Konten per CLI anlegen, gemeinsame Liste mit beiden Konten bearbeiten; private Daten auch über direkte API-Anfragen prüfen.
3. PWA auf echtem Android per HTTPS installieren; PC und Android gleichzeitig und offline bearbeiten, App offline neu starten, dann Konflikte und Abgleich prüfen.
4. Container neustarten, Persistenz prüfen, Sicherung in einer frischen Compose-Instanz wiederherstellen. Audit bei erreichbarem Registry wiederholen.
5. Nach erfolgreicher Stufe-A-Abnahme Stufe B implementieren und prüfen.

## Noch nicht implementiert

Stufe B: Unteraufgaben, Tags, Listengruppen, Listenfarben/-symbole, Prioritäten, manuelle Sortierung, gespeicherte intelligente Filter, Wiederholungsserien, mehrere Erinnerungen, Web Push, Snooze und Scheduler. Die persönliche Markierung sowie die verlangten Basisansichten sind bereits vorhanden; sie stellen keinen Abschluss von Stufe B dar. Reservierte Erinnerungs-/Push-Tabellen sind ausdrücklich kein funktionierendes Benachrichtigungssystem.

Stufe C bleibt wie beauftragt später: native Standortereignisse, Widgets, Anhänge, differenzierte Rollen und CalDAV.
