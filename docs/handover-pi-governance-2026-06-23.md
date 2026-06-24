```text
HANDOVER — Pi Governance Slices — Baum-OS Core Anchor
Repo: agentic_workflow/model-agnostic-workflow-system
Stand: 2026-06-23
Übergeben an: Claude Code (lokale Session, voller Filesystem-/Git-Zugriff)
Übergeben von: Cowork-Session (baum777 / Cheikh Kai)

ROLLE
Du bist Governance-/Docs-Agent für Pi-CLI-Integration (`@earendil-works/pi-coding-agent`)
in diesem Repo. Strikt docs-only, kein Code, keine Runtime-Aktivierung, kein
`providers/pi/`, kein `runtime/surfaces/pi/` ohne explizite neue Freigabe.

KONTEXT
Pi ist Execution Surface / CLI-Agent-Runner, KEIN LLM-Provider. Über mehrere
Governance-Slices wurde entschieden: Pi bleibt external prerequisite (Option A),
No Integration Yet (Option C, P-12), Owner-Host-only für Smoke-Ausführung. Drei
echte Tier-0-Smokes wurden bereits auf dem persistenten Owner-Host
(baum-Latitude-3440) ausgeführt:
  - minimax / MiniMax-M2.7 → ERFOLG, Marker PI_SMOKE_OK bestätigt
  - anthropic / claude-haiku-4-5 → FEHLER, HTTP 400, Billing-Limit ("extra usage")
  - openai-codex / gpt-5.4-mini → FEHLER, HTTP 429 usage_limit_reached, Quota leer
Alle drei Versuche sind sauber dokumentiert in `docs/pi-smoke-run-evidence.md`,
ohne Secret-Exposition.

OFFENER AUFTRAG (nicht abgeschlossen)
Correction-Slice für `docs/pi-provider-default-decision.md`. Der Owner hat
angemerkt, dass der Doc-Inhalt teilweise von der späteren echten Smoke-Evidence
abweicht. Konkret veraltet/zu korrigieren:
  1. Status-Zeile sagt "proposed — no smoke executed" — das ist falsch, drei
     Smokes wurden real ausgeführt.
  2. "Default model candidate: from pi --list-models openai-codex section" ist
     ein vager Platzhalter — sollte auf `gpt-5.3-codex-spark` konkretisiert werden,
     MIT explizitem Hinweis, dass dieses Modell durch Quota-Limit (noch) nicht
     smoke-verifiziert ist.
  3. "Co-confirmed provider: anthropic" — Auth-Pfad bleibt korrekt dokumentiert,
     aber muss um den Hinweis ergänzt werden, dass anthropic aktuell durch ein
     Billing-Limit smoke-blockiert ist (kein Architekturproblem).
  4. Wichtige Leitplanke: der ARCHITEKTONISCHE Default (openai-codex, wegen
     einfachstem Auth-Pfad via /login) soll NICHT rückwirkend zu minimax
     geändert werden, nur weil minimax aktuell der einzige smoke-verifizierte
     Provider ist. Diese zwei Achsen (architektonischer Default vs.
     smoke-verifiziert) müssen im Dokument klar getrennt bleiben — sonst wird
     genau der Fehler gemacht, den dieser ganze Slice-Prozess vermeiden soll
     ("Architektur der Validierung vorauslaufen lassen", nur in die andere
     Richtung).

Ein erster Korrekturversuch wurde in der Vorgänger-Session am Decision-Block
und Correction-History begonnen, aber NICHT committet (Edit-Tool brach wegen
eines Tool-internen Read-Status-Fehlers ab, kein Datei-Schaden). Der Stand der
Datei auf der Disk ist unverändert original — siehe RELEVANTE DATEIEN für
Volltext-Auszug der aktuellen Version.

RELEVANTE DATEIEN
- docs/pi-provider-default-decision.md — Zieldatei dieses Correction-Slices,
  Schreibfreigabe NUR diese eine Datei
- docs/pi-smoke-run-evidence.md — kanonische Quelle der echten Smoke-Ergebnisse
  (drei Abschnitte: minimax Erfolg, anthropic Billing-Fehler, openai-codex
  Quota-Fehler)
- docs/pi-smoke-command-design.md — kanonische Smoke-Command-Spec, Tier-Mapping,
  Evidence-Output-Contract, Forbidden Patterns
- docs/pi-execution-environment-boundary-decision.md — Owner-Host-only-Boundary
- docs/pi-workspace-reproducibility-decision.md — Option A (external prerequisite),
  enthält bereits ein Beispiel für genau diese Art von Correction-Slice
  (Environment-Clarification-Pattern, dort bereits erfolgreich durchgeführt
  und committet als b3e1295)

GOVERNANCE-REGELN (strikt einhalten, aus der gesamten bisherigen Session)
- Schreibfreigabe exakt EINE Datei: `docs/pi-provider-default-decision.md`
- Kein `git add .` / `git add -A` — immer exakt eine Datei explizit stagen
- Vor jedem Commit: `git diff --name-only`, Prüfung dass `providers/pi` und
  `runtime/surfaces/pi` NICHT existieren, `git status --short --untracked-files=all`,
  dann `git diff --cached --name-only` / `--stat`
- Keine Secrets lesen, anzeigen oder erzeugen (`.env`, `printenv`, `env`,
  `--api-key`-Flag) — auch nicht in Erklärtext
- Keine Architekturentscheidung rückwirkend ändern (z. B. Default-Provider) ohne
  explizite neue Owner-Freigabe — nur die Status-/Evidence-Lücke korrigieren
- Pflichttrennung im Output: observed / inferred / recommended explizit halten
- Pushback ist erwartet und gewünscht, wenn eine angeforderte Änderung der
  Validierung vorauslaufen würde

ERWARTETES AUSGABEFORMAT (wie in allen vorherigen Slices dieser Session)
Result / Commit / Owner-Scope / Applied / Decision / Verification /
Risks-Gaps / Next-Gate — siehe Commit-Historie dieses Repos für exakte Beispiele
(z. B. Commit b3e1295 für die strukturell identische Correction an
`pi-workspace-reproducibility-decision.md`).

NÄCHSTER SCHRITT FÜR CLAUDE CODE
1. `cat docs/pi-provider-default-decision.md` — aktuellen Stand lesen
2. Die vier oben genannten Korrekturpunkte einarbeiten (Edit, nicht Write/Rewrite)
3. Verification-Sequenz fahren
4. Einzeln stagen, committen mit klarer Commit-Message
  (Vorschlag: "docs: correct pi provider default decision against real smoke evidence")
5. Ausgabeformat wie oben liefern
```
