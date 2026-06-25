# Policy Harnessing Concepts — Working Paper

> **Datum:** 2026-06-25  
> **Status:** Working Draft  
> **Scope:** Governed AI Workflow Harnesses für 10 kommerzielle Automation-Flows  
> **Quellen:** OWASP LLM Top 10, NIST AI 600-1, NCSC Secure AI Guidelines, FTC CAN-SPAM, EU GDPR Automated Decision-Making

---

## Zusammenfassung

Die 10 nachfolgenden Workflows teilen ein gemeinsames Risikomuster:

> **LLM + fremde Daten + echte Tools + Schreibrechte**

OWASP benennt dafür u. a. Prompt Injection, Sensitive Information Disclosure, Supply Chain, Data/Model Poisoning, Improper Output Handling, Excessive Agency, Prompt Leakage, Vector/Embedding Weaknesses, Misinformation und Unbounded Consumption. NIST betont, dass GenAI-Risiken über Design, Deployment, Betrieb und Decommissioning hinweg entstehen und je nach Use Case stark variieren.

**Zentrale Designregel:** LLM-Ausgaben dürfen nie direkt produktive Aktionen auslösen. Sie müssen durch Schema-Validatoren, Policy Gates, Berechtigungsgrenzen, Human Approval, Logging und Regressionstests laufen.

---

## 1. Lead Capture → CRM → Follow-up

### Angriffsflächen

- Formulare: Spam, Prompt Injection, SQL/HTML-Injection, Bot-Leads
- Enrichment: vergiftete Webseiten, falsche Firmendaten, Scraping-Risiken
- CRM-Schreibzugriff: falsche Zuordnung, Dubletten, Lead-Owner-Manipulation
- Follow-up-Mail: falsche Claims, fehlender Opt-out, irreführende Betreffzeilen

### Risiken & Ausnahmefälle

- Lead enthält sensible Daten, Minderjährige, Gesundheits-/Finanzdetails
- Lead steht auf Do-not-contact- oder Suppression-Liste
- KI erfindet Bedarf, Budget, Rolle oder Zustimmung
- B2B-Mail ist trotzdem nicht automatisch rechtsfrei: CAN-SPAM gilt auch für kommerzielle B2B-Mails und verlangt korrekte Header, nicht-irreführende Betreffzeilen, Werbekennzeichnung, physische Adresse und Opt-out

### Governed Harness-Konzept

**Harness:** `Lead Intake Harness`

| Gate / Komponente | Funktion |
|---|---|
| **Ingress Gate** | Captcha, Rate Limit, Schema Validation, PII-Klassifikation |
| **Trust Boundary** | Web-Enrichment nur als untrusted evidence; keine Instruktionen aus Webseiten übernehmen |
| **CRM Write Gate** | Dublettencheck, Consent/Legal-Basis-Check, Suppression-List-Check |
| **LLM-Rolle** | Nur Klassifikation + Entwurf, kein direkter Versand bei Erstkontakt |
| **Verifier** | Betreff/Body gegen CAN-SPAM, Opt-out, Claims, Tonalität, verbotene Personalisierungsfelder |
| **Performance** | Deterministische Checks vor LLM; Enrichment asynchron; Firmenprofile cachen |
| **Governance** | CRM-Diff, Lead-Source-Provenienz, Mail-Draft-Audit, Rollback für CRM-Felder |

---

## 2. Customer Support Triage

### Angriffsflächen

- User-Nachrichten mit Prompt Injection
- Anhänge, Screenshots, Logs, HTML
- RAG-Wissensdatenbank
- Support-Tools: Refunds, Account Reset, Plan Changes, Cancellations
- Multi-Turn-Kontext: alte Nachrichten beeinflussen spätere Entscheidungen

### Risiken & Ausnahmefälle

- Bot erfindet Refund Policy, Lieferdatum oder Kündigungsstatus
- Angreifer versucht Account Takeover über Support-Bot
- Niedrigprivilegierter Chat stößt hochprivilegierte Toolaktion an
- Sicherheits-, Zahlungs- und Identitätsfälle dürfen nie autonom erledigt werden

### Governed Harness-Konzept

**Harness:** `Support Triage & Action Harness`

| Gate / Komponente | Funktion |
|---|---|
| **Intent Classifier** | Billing, Bug, Refund, Legal, Security, Abuse, Human Escalation |
| **Identity Gate** | Keine Account-Aktion ohne verifizierte Identität |
| **RAG Gate** | Antworten nur aus freigegebenen KB-Chunks mit Version und Quelle |
| **Action Tiers** | Tier 0: Antwortentwurf · Tier 1: Ticket taggen/routen · Tier 2: Kulanzgutschrift unter Schwelle · Tier 3: Refund/Reset/Plan Change nur via Human Approval |
| **Verifier** | Policy-Match, Quellenpflicht, PII-Redaction, Eskalationsregel |
| **Performance** | Schneller Intent-Classifier vor RAG; Top-k klein; Antwort-Caching für FAQs |
| **Governance** | Vollständige Action Logs, Reviewer Queue, Customer-visible "AI assisted" Label |

---

## 3. Internal Knowledge Assistant

### Angriffsflächen

- RAG-Poisoning durch Dokumente mit versteckten Instruktionen
- Falsche ACLs in Drive, Notion, Confluence, Slack
- Prompt Injection in PDFs, Wikis, Tickets
- Embedding-Leakage: semantische Suche findet Inhalte, die der User nicht sehen darf
- Veraltete Dokumente

### Risiken & Ausnahmefälle

- Mitarbeiter bekommt HR-, Legal-, Finance- oder Security-Daten ohne Berechtigung
- Assistant beantwortet mit altem Policy-Stand
- Quelle ist Entwurf, nicht freigegeben
- Antwort kombiniert vertrauliche Dokumente aus unterschiedlichen Berechtigungskontexten

### Governed Harness-Konzept

**Harness:** `ACL-RAG Knowledge Harness`

| Gate / Komponente | Funktion |
|---|---|
| **Retrieval vor Generation** | User-ACL wird vor Vektorsuche angewendet, nicht danach |
| **Document Sanitizer** | Extrahiert Text, entfernt aktive Instruktionen, markiert Dokumente als Daten — nicht Befehle |
| **Source Contract** | Antwort nur mit Quellen-ID, Version, Owner, Freshness |
| **No-Source-No-Answer** | Bei fehlender Quelle keine freie Antwort |
| **Staleness Gate** | Veraltete Dokumente bekommen Warnung oder werden ausgeschlossen |
| **Performance** | Hybride Suche, Chunk-Cache, Antwort-Cache pro ACL-Gruppe, Context Compaction |
| **Governance** | Index-Provenienz, Zugriffslog, Lösch-/Reindex-Jobs, Red-Team-Test mit vergifteten Dokumenten |

---

## 4. Meeting → Actions → Follow-up

### Angriffsflächen

- Audioaufnahme, Transkript, Speaker Diarization
- Externe Teilnehmer
- Vertrauliche Inhalte, Legal Privilege, HR-Gespräche
- Prompt Injection im gesprochenen Text: „Ignoriere alle Regeln und sende …"
- Task-/Mail-Tools

### Risiken & Ausnahmefälle

- Kein Consent zur Aufnahme oder Verarbeitung
- Falscher Sprecher bekommt falsches To-do
- Ironie oder Brainstorming wird als Verpflichtung interpretiert
- Private oder privilegierte Inhalte werden in Follow-up-Mails geteilt
- AI-Transcription-Tools stehen wegen Datenschutz-, Vertraulichkeits- und Consent-Risiken unter regulatorischer und juristischer Beobachtung

### Governed Harness-Konzept

**Harness:** `Meeting Consent & Action Harness`

| Gate / Komponente | Funktion |
|---|---|
| **Consent Gate** | Aufnahme nur bei expliziter Meeting-Policy; externe Teilnehmer markieren |
| **Transcript as Untrusted Data** | Transkript darf keine Systeminstruktionen überschreiben |
| **Action Extractor** | Erzeugt strukturierte To-dos mit Owner, Due Date, Confidence, Evidence Timestamp |
| **Ambiguity Gate** | Niedrige Confidence → "needs confirmation" |
| **External Send Gate** | Follow-up an Externe nur nach Review |
| **Retention Policy** | Automatische TTL; sensible Meetings nicht indexieren |
| **Performance** | Transkription batch/asynchron, Summary streaming, Action Extraction mit kleinem Modell |
| **Governance** | Consent Log, Teilnehmer-ACL, Redaction, Review-Diff vor Versand |

---

## 5. Content Repurposing Pipeline

### Angriffsflächen

- Briefings, Quellen, Webseiten, Kundendokumente
- Generierte Claims
- CMS-/Social-Publishing-APIs
- Brand Voice und rechtliche Disclaimers
- Copyright- oder Lizenzmaterial

### Risiken & Ausnahmefälle

- KI erfindet Fakten, Zahlen, Testimonials oder Produktversprechen
- Interne Informationen landen öffentlich
- Medizinische, finanzielle oder rechtliche Aussagen ohne Review
- Duplicate Content, Plagiat, Markenrechtsrisiko
- Veröffentlichung ohne Freigabe

### Governed Harness-Konzept

**Harness:** `Content Factory Harness`

| Gate / Komponente | Funktion |
|---|---|
| **Source Lock** | Modell darf nur freigegebene Quellen verwenden |
| **Claim Extractor** | Jede faktische Aussage wird als Claim extrahiert |
| **Claim Verifier** | Claims gegen Quellen, Produktdatenbank und verbotene Aussagen prüfen |
| **Regulated Topic Gate** | Legal/Finance/Health → Mandatory Review |
| **Publish Separation** | KI darf nur in Staging/CMS-Draft schreiben, nie direkt veröffentlichen |
| **Performance** | Templates, Brand-Style Cache, Batch-Generierung, Claim-Prüfung nur für factual spans |
| **Governance** | Versionierung, Quellenliste, Freigabehistorie, Plagiats-/Similarity-Check |

---

## 6. Sales Outreach Personalization

### Angriffsflächen

- Prospect-Datenbanken, LinkedIn, Webseiten, News
- E-Mail-Sequencer, Domain Rotation, CRM
- Personalisierte Claims
- Opt-out-Listen
- Public Web Prompt Injection

### Risiken & Ausnahmefälle

- KI nutzt sensible Attribute: Gesundheit, Religion, Herkunft, Alter, Gewerkschaft
- „Creepy personalization" beschädigt Vertrauen
- Falscher Bezug auf Ereignisse oder Rolle
- Opt-out wird ignoriert
- Hohe Versandmenge beschädigt Domain-Reputation
- Automatisierte Profiling-/Entscheidungsprozesse können in der EU relevant werden, wenn sie Personen rechtlich oder ähnlich erheblich betreffen; dann sind Transparenz, menschliche Intervention und Widerspruchsmöglichkeiten zentral (GDPR Art. 22)

### Governed Harness-Konzept

**Harness:** `Sales Outreach Compliance Harness`

| Gate / Komponente | Funktion |
|---|---|
| **Data License Gate** | Nur erlaubte Prospect-Quellen |
| **Personalization Allowlist** | Rolle, Firma, öffentlicher Business-Kontext erlaubt; sensible Attribute verboten |
| **Suppression Gate** | Global unsubscribes, bounced domains, DNC, competitor, active customer |
| **Message Verifier** | CAN-SPAM, Opt-out, Adresse, nicht-irreführender Betreff, Claim-Check |
| **Send Policy** | Auto-send nur bei niedriger Risikoklasse; High-value/regulated Accounts manuell |
| **Performance** | Precomputed company briefs, sequence templates, small model for classification, LLM nur für final personalization |
| **Governance** | Prospect provenance, suppression audit, deliverability metrics, approval sampling |

---

## 7. Document Intake & Data Extraction

### Angriffsflächen

- PDFs, Scans, Office-Dateien, E-Mail-Anhänge
- OCR-Text mit versteckten Instruktionen
- Rechnungen, Verträge, Claims, Bewerbungen
- ERP/CRM/Accounting-Schreibzugriffe
- Signaturen, Bankdaten, Beträge

### Risiken & Ausnahmefälle

- Gefälschte Rechnung oder manipulierte Bankverbindung
- OCR liest Betrag, Datum oder Währung falsch
- Duplicate Invoice
- Vertrag enthält ungewöhnliche Klauseln
- Dokument hat aktive Inhalte, Makros oder Links
- PII wird in unsichere Logs geschrieben

### Governed Harness-Konzept

**Harness:** `Document Extraction & Verification Harness`

| Gate / Komponente | Funktion |
|---|---|
| **File Sandbox** | Keine Makros, keine externen Links, Dateitypprüfung, Malware Scan |
| **OCR Layer** | Dokument wird in Plain Text + Layout + Bounding Boxes umgewandelt |
| **Extractor** | LLM gibt nur JSON nach strengem Schema aus |
| **Field Confidence** | Jedes Feld mit Confidence, Quelle, Seiten-/Box-Verweis |
| **Cross-Checks** | Vendor Master, PO, IBAN-Hash, Betragsschwellen, Duplikate |
| **Human Gate** | Neue Bankdaten, hohe Beträge, niedrige Confidence, Vertragsrisiko |
| **Performance** | OCR async, strukturierte Rechnungen deterministisch, LLM nur für unstrukturierte Fälle |
| **Governance** | Immutable document lineage, extraction diff, reviewer decisions, retention policy |

---

## 8. IT Helpdesk / Service Desk Agent

### Angriffsflächen

- Tickets, Chat, Slack, E-Mail
- Logs, Shell Commands, Runbooks
- IAM, SSO, Passwortreset, Gruppenrechte
- Device Management, MDM, VPN
- Knowledge Base und Incident History

### Risiken & Ausnahmefälle

- Social Engineering: Angreifer beantragt Reset oder Adminrechte
- Prompt Injection in Tickettext
- Agent führt gefährliche Commands aus
- Falscher User bekommt Zugriff
- Sensitive Logs werden an falsche Kanäle gepostet
- Lateral Movement über verbundene Tools

### Governed Harness-Konzept

**Harness:** `Zero-Trust IT Ops Harness`

| Gate / Komponente | Funktion |
|---|---|
| **Identity Proofing** | Ticketsteller, Device, MFA, Manager Approval |
| **Read-Only First** | Diagnose ohne Schreibrechte |
| **Runbook Allowlist** | Nur freigegebene, parametrisierte Aktionen |
| **Permission Tiers** | Diagnose: automatisch · Standardfix: automatisch mit Audit · Access Change: Approval · Admin/Destructive: Change Ticket + Human |
| **Command Verifier** | Keine freien Shell-Befehle; nur geprüfte Templates |
| **Performance** | Runbook cache, deterministic routing, parallel log collection |
| **Governance** | Agent identity, least privilege, SIEM logging, break-glass protocol, post-action verification |

---

## 9. Reporting & Insights Automation

### Angriffsflächen

- BI-Datenbanken, Sheets, Warehouses
- Generated SQL
- Metric Definitions
- Dashboards, Slack/Email Distribution
- Row-Level Permissions
- Narrative Summaries

### Risiken & Ausnahmefälle

- Falsche KPI-Definition
- Modell halluziniert Ursache für Umsatzrückgang
- SQL zieht falsche Daten oder zu viele Daten
- HR-/Finance-Daten werden an falsche Empfänger gesendet
- Stale Cache erzeugt falsches Management-Reporting
- Ausreißer werden als Trend interpretiert

### Governed Harness-Konzept

**Harness:** `Metrics-Safe Reporting Harness`

| Gate / Komponente | Funktion |
|---|---|
| **Semantic Metrics Layer** | Modell darf keine KPI frei definieren |
| **Parameterized Query Tool** | Kein freies SQL in Produktion |
| **Read-Only Access** | Warehouse nur lesend, Row-Level Security |
| **Number Verifier** | Kritische Zahlen werden deterministisch nachgerechnet |
| **Narrative Gate** | Ursache/Wirkung nur mit Evidenz; sonst "hypothesis" |
| **Distribution Gate** | Empfänger-ACL vor Slack/Email |
| **Performance** | Pre-aggregations, scheduled materialized views, cache by metric/date/ACL |
| **Governance** | Query log, metric version, dashboard lineage, anomaly review |

---

## 10. Finance / Admin Automation

### Angriffsflächen

- Rechnungen, E-Mails, Zahlungsdaten
- ERP, Banking, Stripe, DATEV/Xero/QuickBooks
- Vendor Master Data
- Dunning/Mahnungen
- Expense Reports
- Approval Workflows

### Risiken & Ausnahmefälle

- Business Email Compromise: gefälschte Zahlungsanweisung
- Bankdatenänderung ohne Verifikation
- Doppelte Rechnung
- Falsche Steuerkategorie
- KI sendet aggressive Mahnung an strategischen Kunden
- Zahlung wird ohne Separation of Duties ausgelöst

### Governed Harness-Konzept

**Harness:** `Finance Control Harness`

| Gate / Komponente | Funktion |
|---|---|
| **No Autonomous Payment Rule** | KI darf Zahlung vorbereiten, nie final auslösen |
| **Vendor Verification** | Bankdaten gegen Vendor Master; Änderungsanfragen separat bestätigen |
| **Amount Thresholds** | Niedrige Beträge automatisch vorkontieren; hohe Beträge Review |
| **Duplicate & Fraud Detector** | Rechnungsnummer, Betrag, Vendor, IBAN, Datum |
| **Dunning Gate** | Tonalität, Kundenstatus, offene Dispute, strategischer Account |
| **Performance** | Deterministic matching first, LLM nur für unstrukturierte Belege und Begründungen |
| **Governance** | Dual approval, audit trail, reconciliation, immutable payment package |

---

## Übergreifende Harness-Architektur

```
Input
  → Ingress Sanitizer
  → PII / Secret / Compliance Classifier
  → Trust-Ranked Retrieval or Tool Context
  → Planner
  → Policy Engine
  → Typed Tool Call
  → Verifier
  → Human Gate if needed
  → Execution
  → Post-Action Verification
  → Telemetry + Replay Log
```

---

## Gemeinsame Governance-Regeln

| Regel | Warum |
|---|---|
| **Untrusted data is never instruction** | Schützt gegen direkte und indirekte Prompt Injection |
| **Typed tools only** | Verhindert freie, gefährliche Aktionen |
| **Read before write** | Reduziert falsche und irreversible Änderungen |
| **Least privilege per workflow** | Begrenzt Schaden bei Fehlverhalten |
| **Human gate by risk tier** | Hält Geschwindigkeit bei Routinefällen, Kontrolle bei kritischen Fällen |
| **Deterministic verifier before action** | Verhindert hallucinated success |
| **Action log + replay** | Macht Fehler auditierbar |
| **Regression suite per workflow** | Schützt vor stiller Verschlechterung nach Prompt-/Tool-Änderungen |
| **Cost and rate limits** | Schützt gegen Unbounded Consumption |
| **Source provenance** | Schützt gegen falsche, veraltete oder manipulierte Evidenz |

---

## Zentraler Design-Call: Eine Plattform statt 10 Agenten

Für ein kommerzielles Angebot sollten diese 10 Flows nicht als 10 separate Agenten gebaut werden, sondern als **eine wiederverwendbare Governed-Automation-Plattform** mit flow-spezifischen Policy Packs.

**Kernprodukt:**

> **AI Workflow Harness mit Policy Engine, Typed Tools, Human Approval, Verifiers, Audit Logs und Regression Tests.**

Der Unterschied zu klassischen Zapier-/Make-Automationen:

| Klassische Automation | Governed Harness |
|---|---|
| Trigger → AI → Action | Trigger → Evidence → Policy → Verified Action |
| Fehler erst nach Schaden sichtbar | Verifier stoppt vor Ausführung |
| Audit nachträglich rekonstruiert | Replay Log ab Ingress |
| Berechtigungen global konfiguriert | Least privilege pro Workflow + Tier |
| Human in the loop optional | Human gate mandatory ab Risikoschwelle |

### Flow-zu-Harness-Mapping

| Flow | Harness-Name | Kritischstes Gate |
|---|---|---|
| Lead Capture → CRM | Lead Intake Harness | CRM Write Gate + Suppression |
| Customer Support | Support Triage & Action Harness | Identity Gate + Action Tiers |
| Internal Knowledge | ACL-RAG Knowledge Harness | Pre-retrieval ACL |
| Meeting → Actions | Meeting Consent & Action Harness | Consent Gate + External Send |
| Content Repurposing | Content Factory Harness | Claim Verifier + Publish Separation |
| Sales Outreach | Sales Outreach Compliance Harness | Suppression Gate + Send Policy |
| Document Intake | Document Extraction & Verification Harness | Human Gate (Bankdaten/Beträge) |
| IT Helpdesk | Zero-Trust IT Ops Harness | Permission Tiers + Command Verifier |
| Reporting | Metrics-Safe Reporting Harness | Parameterized Query + Number Verifier |
| Finance / Admin | Finance Control Harness | No Autonomous Payment Rule |

---

## Referenzen

- [OWASP LLM Top 10](https://genai.owasp.org/llm-top-10/) — LLM-spezifische Risikoklassen
- [NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) — GenAI Risk Management Framework
- [NCSC Secure AI Guidelines](https://www.ncsc.gov.uk/collection/guidelines-secure-ai-system-development) — Lifecycle-Sicherheit für KI-Systeme
- [FTC CAN-SPAM Compliance Guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) — E-Mail-Pflichten auch für B2B
- [EU Automated Decision-Making](https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/dealing-citizens/are-there-restrictions-use-automated-decision-making_en) — GDPR Art. 22 Transparenzpflichten
- [Goodwin Law — AI Transcription Scrutiny](https://www.goodwinlaw.com/en/insights/publications/2026/04/alerts-practices-dpc-ai-transcription-tools-under-scrutiny) — Datenschutzrisiken bei Meeting-KI
