# Prüfbericht: Einzelne Unteraufgaben verschieben – 14. November 2026

Basis: aktuelles `origin/main` bei `6379355`, eigener Branch `feat/move-subtasks`. Der Arbeitsbaum war sauber. In Repository und übergeordneten Verzeichnissen lagen keine `AGENTS.md`. Der ursprüngliche Entwicklungsauftrag unter `docs/reference/Entwicklungsauftrag.md` bleibt unverändert. Kein Merge oder produktiver Rollout.

## Umsetzung

Menüaktion in Übersicht und Detailpanel, nativer modaler Such-/Auswahldialog mit Radiogruppe, Tastatur-/Touchbedienung und Abbruch, unmittelbare Fortschrittsaktualisierung und Erfolgsmeldung nach Serverbestätigung. Nur andere Hauptaufgaben derselben Liste außerhalb des Papierkorbs. Eigene atomare Serveraktion mit aktuellen Rechten, exakten Struktur-/Zielversionen, Endposition, Statusregel und persistenter Idempotenz. Die vorhandene Offline-Queue unterstützt Neuanlagen, Neuladen, verlorene Antworten und abhängige Aktionen. Keine neue Migration, Abhängigkeit oder Backupformatänderung.

## Ausgeführte Prüfungen

- `npm test`: 24 Tests bestanden, einschließlich neuer gemeinsamer Verschiebeszenarien und erweiterter Offline-Regressionen mit echter API, IndexedDB und PGlite.
- `npm run build`: TypeScript und Produktionsbuild bestanden. Bestehende Vite-Warnung für ein JavaScript-Bundle über 500 kB bleibt.
- Rechte: fremdes Konto, fremdes Ziel, geteilte Liste und erneute Rechteprüfung vor Replay nach Mitgliederentzug.
- Status/Ordnung: unveränderte ID/Titel/Status, Anhängen nach vorhandenen Schritten, offener Schritt öffnet erledigtes Ziel, erledigter Schritt lässt erledigtes Ziel erledigt, Quelle behält ihren Status.
- Konkurrenz/Struktur: zwei konkurrierende Verschiebungen mit genau einem Gewinner; veraltete Kindbearbeitung und Sortierung; kein beliebiges `taskId`-Patchen; geändertes, endgültig entferntes, listenfremdes oder im Papierkorb liegendes Ziel; Quelle im Papierkorb.
- Completion/Undo: Verschieben nach Completion, Hin-/Rückverschieben und danach altes Undo; atomare Ablehnung ohne Statusänderung. Offline-Completion → Verschieben → Undo ergibt einen sichtbaren Konflikt. Alte Undo-Belege werden nach Elternwechsel auch lokal nicht mit falschen Statuswerten projiziert.
- Offline: lokal neue Quelle/Ziel/Schritte → Verschieben → Bearbeiten → Sortieren → Modul-Neuladen → Abgleich. Mehrere Offlineverschiebungen hintereinander; vorausgehende ausstehende Reopen-/Undo- und Sortieraktionen vor der Verschiebung. Verlorene Antwort mit anschließendem Neuladen und Replay ohne Duplikate. Nach abgelehntem Verschieben und Verwerfen bleibt eine abhängige Bearbeitung an ihren beabsichtigten Elternbezug gebunden und wird sicher abgelehnt.
- Backup/Restore: Verschiebeszenarien in frische PGlite-Datenbank wiederhergestellt; genau eine Unteraufgabe mit korrektem Elternbezug und erhaltenen Verschiebebelegen. Bestehende Backup-/Upgrade-Regressionen ebenfalls bestanden.

## Browser und Sichtprüfung

Der vollständige Chromium-Lauf prüft Übersicht und Detailpanel, Suchtreffer/Leerzustand, Ausschluss von Quelle/Papierkorb, Abbrechen, Escape ohne Schließen des Detailpanels, Zielwahl und Bestätigung per Tastatur sowie Touch bei 320 Pixeln. Zwei isolierte Browserkontexte mit unterschiedlichen Konten einer geteilten Liste prüfen tatsächlichen serverseitigen Abgleich in beide Richtungen, einschließlich Offlineverschieben und Neuladen vor Wiederverbindung.

Zusätzlich wurden die zwölf Aufnahmen `inline-subtasks-{light,dark}-{1360,360,320}.png` und `detail-subtasks-top-{light,dark}-{1360,360,320}.png` von Übersicht und Detail tatsächlich angesehen. Lange Titel umbrechen innerhalb der verfügbaren Breite; Menüzugänge bleiben erreichbar.

Die sechs Aufnahmen `test-results/move-{light,dark}-{1360,360,320}.png` wurden tatsächlich mit dem Bildbetrachter angesehen: lesbare Umbrüche, sichtbarer Fokus, erreichbare Zielauswahl/Abbruch und kein horizontales Abschneiden des Dialoginhalts. Die Aufnahmen werden vom bestehenden CI-Artefaktablauf erfasst; sie sind keine eingecheckten Binärdateien.

## Grenzen

Ein separater PostgreSQL-Server und Docker/psql sind in dieser Arbeitsumgebung nicht verfügbar. Der vorhandene PostgreSQL-Containercheck wurde um dieselben Verschiebe-/Konkurrenzfälle über zwei Datenbankverbindungen und Backup/Restore erweitert, aber hier nicht ausgeführt. PGlite ist geprüft; daraus wird kein eigenständiger PostgreSQL-Lauf behauptet. Physische Android-Hardware, Screenreader und physischer Zwei-Geräte-Abgleich bleiben unbestätigt. Geprüft sind Chromium, tatsächliche Touch-Ereignisse und getrennte Browserkonten. Keine produktiven Daten oder Sicherungen wurden benutzt.

Konflikte werden bewusst konservativ behandelt: Ein geändertes Ziel erfordert gegebenenfalls Verwerfen und Neuauswahl. Vollständige eigene Idempotenzbelege im Snapshot wachsen mit der Nutzung, entsprechend der vorhandenen Sortierstrategie. Listenübergreifendes Verschieben einzelner Schritte gehört weiterhin nicht zum Funktionsumfang.
