# 🛡️ PayGuard

**PayGuard is a real-time, event-driven income protection system that automatically detects disruptions, evaluates fraud risk, and processes payouts with minimal user intervention.**

> Guidewire DEVTrails 2026 | Persona: Grocery/Q-Commerce (Zepto/Blinkit)
>
> _Predict. Protect. Pay._

---
## System Architecture
![payguard_architecture_v2](https://github.com/user-attachments/assets/2693a3af-a339-4b82-a337-8bfcab21b69a)
![payguard_claims_flow_v2](https://github.com/user-attachments/assets/41c04c0b-fc85-4964-b406-130f8a44b7bb)

---

## The Problem

Ravi is a Blinkit delivery partner in Chennai. He earns ₹700/day doing 25–30 deliveries. During monsoon, heavy rain halts his zone 3–4 times a month. Each event = 3–4 hours lost = ₹250–350 gone. Monthly income loss: ₹1,000–1,400.

He has zero protection — no app, no form, no insurance product exists for this.

---

## What is PayGuard?

PayGuard is a mobile-first PWA platform that automatically detects disruptions in a worker's zone, initiates and approves claims without the worker doing anything, and deposits lost income to UPI within 10 minutes — all powered by AI with zero human intervention.

---

## Persona & Scenarios

**Target:** Zepto/Blinkit delivery partners in Tier-1 Indian cities (Chennai, Mumbai, Delhi, Bengaluru)

| Scenario | Trigger | Income Impact |
|---|---|---|
| Chennai monsoon flooding | Rainfall >15mm/hr in worker's GPS zone | Zone closed, 3–4 hrs of deliveries lost |
| Delhi heatwave (May) | Feels-like temp >42°C for 2+ hrs | Morning peak hours lost |
| Delhi/Mumbai AQI crisis | AQI >300 for 3+ hrs | Outdoor work advisory, 50% income drop |
| Local curfew / bandh | Government alert in worker's zone | Full day lockdown, 100% income loss |
| Platform outage | Blinkit/Zepto app down >90 mins | No order assignment, 75% earnings lost |

---

## Core Framework

| 🔮 PREDICT | 🛡️ PROTECT | 💸 PAY |
|---|---|---|
| AI forecasts disruption before it happens. Adjusts premium every Monday. | Coverage activates automatically when triggers fire. Zero worker action needed. | Money hits worker's UPI in under 10 minutes. Personalized to their actual earnings. |

---

## Weekly Premium Model

PayGuard is structured on a **weekly pricing model** aligned with gig workers' weekly earnings cycle.

| Tier | Worker Pays | Blinkit/Zepto Pays | Total Premium | Max Payout/Week |
|---|---|---|---|---|
| Basic | ₹25 | ₹30 | ₹55 | ₹2000 |
| Standard | ₹55 | ₹30 | ₹85 | ₹5000 |
| Pro | ₹95 | ₹30 | ₹125 | ₹10000 |

**Why co-premium?** Blinkit/Zepto benefit from worker retention, ESG reporting, and faster fulfillment even in bad weather. Worker pays just ₹29–69/week — less than a chai per day.

**Dynamic adjustment:** Every Monday, the AI engine reads IMD forecasts + historical zone risk data and adjusts next week's premium. High-risk week in a flood-prone zone = slightly higher premium with a warning SMS. Calm week = lower premium, loyalty discount applied.

In the prototype, the worker pays the weekly premium directly. 
In a production deployment, platforms like Blinkit or Zepto could 
co-contribute to the premium to improve worker protection.
---

## The 5 Parametric Triggers

> PayGuard insures **lost income only**. No vehicle repairs, no health, no accidents.

| Trigger | Data Source | Threshold | Payout |
|---|---|---|---|
| Heavy Rainfall | OpenWeatherMap + IMD API | >15mm/hr in worker's GPS zone | Sliding scale: 25% / 50% / 100% |
| Extreme Heat | OpenWeatherMap API | Feels-like >42°C for 2+ hrs | 50–100% of expected earnings |
| Severe AQI | CPCB API | AQI >300 for 3+ hrs | 50% payout |
| Platform Downtime | Heartbeat mock API | App down >90 mins | 75% of expected earnings |
| Local Curfew / Bandh | Government alert API (mock) | Zone alert active | 100% full day payout |

All triggers are **verified against ≥2 independent data sources** before initiating a claim.

---

## What Makes PayGuard Different

### 2. Income Guard — Predictive Layer
Risk Awareness Layer

The system informs users about high-risk conditions based on current weather data and zone activity.


### 4. Platform: Mobile-First PWA
No app download required. Works on any Android browser. Critical for Tier-2 city adoption where storage-constrained phones are common.

---

## AI/ML Integration Plan

PayGuard uses a lightweight, feature-engineered fraud detection model inspired by logistic regression.

Key features:
- Claim frequency patterns
- Weather validation (API vs claim)
- GPS consistency checks (simulated)
- Behavioral signals (timing, repetition)

The system computes a fraud probability score (0–100) and provides explainable reasons for each decision.

Note: The architecture is designed to support advanced ML models in production.

---

## Adversarial Defense & Anti-Spoofing Strategy

> **Critical Security Section** — Added in response to GPS spoofing threat identified during Phase 1.

### The Threat
A coordinated syndicate using GPS spoofing apps to falsely place themselves inside active weather-disruption zones, triggering automatic parametric payouts while physically sitting at home.

### 1. Differentiation: Genuine Worker vs. Bad Actor

PayGuard uses a **Multi-Signal Trust Score (MSTS)** — no single data point decides anything. A genuine worker stranded in a flood zone naturally produces a _cluster_ of consistent signals. A spoofer sitting at home cannot fake all of them simultaneously.

| Signal Layer | Genuine Worker | GPS Spoofer |
|---|---|---|
| Accelerometer / Gyroscope | Micro-vibrations from sitting on bike in rain | Flat/stationary phone on a desk |
| Cell tower ID | Matches spoofed GPS zone's tower | Home tower — geographic mismatch 🚩 |
| Wi-Fi SSID | Not connected to any home Wi-Fi | Connected to home network 🚩 |
| Order activity history | Had active orders before disruption, then went silent | No orders in last 2 hrs before claim 🚩 |
| App heartbeat | Delivery app open, GPS pinging every 30s | Delivery app closed or backgrounded 🚩 |
| Peer density check | 3–8 workers claiming same zone = normal | 50+ workers claiming exact same coordinates = syndicate flag 🚨 |

A claim requires **4 of 6 signals to be consistent** before auto-approval.

### 2. Data Points Beyond GPS

**Device Telemetry (via PayGuard App SDK)**
- Accelerometer data — is the device stationary or moving consistent with outdoor conditions?
- Battery drain rate — higher outdoors with GPS + rain sensor active
- Screen brightness auto-adjust — outdoors in a storm = max brightness; indoors = low
- Wi-Fi SSID presence — connected to home Wi-Fi = not stranded outdoors

**Network Intelligence**
- Cell tower ID vs. GPS coordinates — mismatch = hard flag
- IP geolocation cross-check — coarse IP must roughly match claimed GPS zone

**Behavioral & Historical Analytics**
- Pre-disruption order velocity — was the worker actually taking orders in that zone before the event?
- Claim timing pattern — claims submitted within 90 seconds of a trigger going live are flagged (bots react faster than real workers)
- Worker's historical zone consistency — does this zone match their last 4 weeks of activity?
- Social graph clustering — if 20+ workers from the same referral group claim simultaneously, the entire cluster is escalated

**Cross-Platform Corroboration**
- Delivery platform GPS pings — PayGuard requests last-known location from Blinkit/Zepto mock API at trigger time
- Weather confirmation — trigger validated by ≥2 independent sources (OpenWeatherMap + IMD)

### 3. UX Balance: Flagged Claims Without Penalizing Honest Workers

```
Claim Submitted
      │
      ▼
 MSTS Score Calculated
      │
 ┌────┴────┬──────────────┐
 ▼         ▼              ▼
Score     Score          Score
 > 75     40–75          < 40
  │         │              │
AUTO      SOFT           HARD
APPROVE   REVIEW         FLAG
  │         │              │
Payout    Grace          Freeze +
in 10     Period         Investigate
 min      (2 hrs)        (no payout)
```

**SOFT REVIEW — Benefit of Doubt Protocol:**
Worker receives: _"We're verifying your claim — this usually takes under 2 hours. Your payout is reserved and will not be lost. If you're genuinely stranded, simply keep the PayGuard app open."_
- Worker keeps app open 15 more minutes → passive telemetry collected
- Signals resolve in their favor → auto-approve, payout released
- Worker is **never asked to prove anything manually** — no photo uploads, no forms

**Network Drop Grace Rule:**
If a worker's GPS signal drops for <8 minutes during an active disruption window, the system uses their last confirmed location + cell tower data to maintain continuity. A network drop alone is never grounds for rejection.

**Syndicate-Specific Counter:**
- Normal disruption: 5–15 workers claim per zone per hour
- Anomaly threshold: >40 claims from same zone in <10 minutes
- Response: Automatic liquidity protection freeze on that zone — all new claims queued, existing approved claims paid normally
- ML model flags common attributes (same device models, same referral chain, same claim timing) and builds a syndicate fingerprint for future prevention

---
## Business Metrics

| Metric | Value |
|---|---|
| Gig workers in India | 7–8 crore |
| Delivery partners | ~1 crore |
| Target Year 1 users | 1 lakh |
| Avg weekly premium | ₹79 |
| Monthly premium pool (1L users) | ₹31.6 lakh |
| Expected claim ratio | 35% |
| Monthly payouts | ₹11 lakh |
| Platform gross margin | ~65% |
| Monthly gross margin | ₹20.6 lakh |

> 1,000 workers × ₹79/week × 4 weeks = ₹3,16,000 pool → ₹1,10,600 payouts → ₹2,05,400 margin

---
## Live Demo Scenario

| Time | Event |
|---|---|
| 11:58 AM | Heavy rain starts in Velachery zone · 68mm/hr |
| 12:00 PM | PayGuard trigger fires · IMD + OWM both confirm |
| 12:01 PM | Ravi's location verified · GPS + cell tower match |
| 12:02 PM | Earnings Twin calculates · Tue lunch rush = ₹280 expected |
| 12:03 PM | MSTS fraud score: 18/100 · Auto approved ✅ |
| 12:05 PM | ₹280 credited to ravi@upi · WhatsApp alert sent |

---
## UI Screens
![img1_payguard](https://github.com/user-attachments/assets/68df6088-58e7-4033-98f1-8231a36319f8)
![img2_payguard](https://github.com/user-attachments/assets/d0801b14-613c-4cd3-9f4a-f89059da7422)
![img3_payguard](https://github.com/user-attachments/assets/936e8e7c-3608-4de8-8477-d60f12569960)
![img4_payguard](https://github.com/user-attachments/assets/ea76a32e-5c02-48d9-aed9-36d00b6467a4)


---
## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React.js PWA (mobile-first, no app download) |
| Backend | Node.js + Express |
| Database | Sqlite |
| Dynamic Pricing Engine | Risk-based premium calculation (JavaScript logic, ML-ready architecture) |
| Weather/AQI | OpenWeatherMap API + IMD + CPCB API (all free tiers) |
| Payments | Razorpay test mode/UPI payout simulation |
| Notifications | Twilio WhatsApp API |
| Hosting | AWS free tier / Render |
| Claims Engine | Automated parametric claim pipeline |

---

## 6-Week Build Plan

| Phase | Weeks | Deliverables |
|---|---|---|
| Phase 1 — Seed | Week 1–2 (by Mar 20) | README, idea doc, onboarding flow wireframes, tech setup, 2-min video |
| Phase 2 — Scale | Week 3–4 (by Apr 4) | Registration flow, policy activation, dynamic premium engine, automated triggers, zero-touch claim pipeline |
| Phase 3 — Soar | Week 5–6 (by Apr 17) | Fraud detection (MSTS), dual dashboard, Resilience Score, final demo video + pitch deck |

---

## Regulatory Model

PayGuard is **not the insurer**. It is the insurtech infrastructure layer — handling tech, UX, AI, and triggers. The actual insurance product is underwritten by a licensed IRDAI partner (e.g., Digit Insurance / Acko). This is exactly how Turtlemint and Policybazaar operate. Clean, credible, and realistic.

---

## Coverage Exclusions (Mandatory)

PayGuard strictly excludes:
- ❌ Health insurance or medical bills
- ❌ Life insurance
- ❌ Accident coverage
- ❌ Vehicle repair payouts
- ❌ War or armed conflict
- ❌ Pandemic lockdowns or nationwide emergencies
- ❌ Fraudulent or manipulated claims

**PayGuard covers lost income only.**

---

*PayGuard — Predict. Protect. Pay. | Guidewire DEVTrails 2026*

