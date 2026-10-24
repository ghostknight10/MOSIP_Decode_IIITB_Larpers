# Architecture Design Document: In-Memory Protocol Audit Logger
### MOSIP VC Interoperability Playground

This document provides the formal architectural specifications and interactive **Mermaid.js** diagrams for the **In-Memory Protocol Audit Logger**, embedded within the Node.js / Express Backend-For-Frontend (BFF) Orchestrator.

---

## 1. System Overview & Interceptor Pipeline

The In-Memory Protocol Audit Logger functions as an inspection engine embedded directly within the Express BFF Orchestrator. Operating as an HTTP middleware interceptor, it transparently captures, sanitizes, and buffers inbound and outbound network traffic passing between the client UI, mock standards engines, and the MOSIP Collab Sandbox.

```mermaid
flowchart TD
    classDef client fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef bff fill:#1e293b,stroke:#64748b,stroke-width:2px,color:#f8fafc;
    classDef interceptor fill:#0284c7,stroke:#38bdf8,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef buffer fill:#047857,stroke:#34d399,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef target fill:#312e81,stroke:#818cf8,stroke-width:2px,color:#f8fafc;

    subgraph CLIENT_LAYER["Client Layer"]
        UI["Browser UI / Identity Wallet Client"]:::client
    end

    subgraph BFF_CONTAINER["Node.js Express BFF Orchestrator"]
        INBOUND["Inbound HTTP Request Gateway"]:::bff
        INTERCEPTOR["Interceptor Middleware<br/>(Capture, Redact & Timestamp)"]:::interceptor
        HANDLERS["Express Route Handlers<br/>(/api/playground/*)"]:::bff
        BUFFER[("Pre-Allocated Ring Buffer<br/>(Fixed 350 Audit Frames Pool)")]:::buffer
    end

    subgraph TARGET_ENGINES["Target Execution Nodes"]
        MOSIP["MOSIP Collab Sandbox<br/>(Inji Certify / Verify)"]:::target
        MOCK["Mock Standards Engine<br/>(OpenID4VCI & OpenID4VP)"]:::target
    end

    UI -->|"1. HTTP Transaction"| INBOUND
    INBOUND -->|"2. Forward"| INTERCEPTOR
    INTERCEPTOR -->|"3a. Sanitized Frame"| BUFFER
    INTERCEPTOR -->|"3b. Route Execution"| HANDLERS
    HANDLERS -->|"4a. Proxy Exchange"| MOSIP
    HANDLERS -->|"4b. Emulated Exchange"| MOCK
    HANDLERS -.->|"5. Capture Outbound Response"| INTERCEPTOR
    INTERCEPTOR -.->|"6. Update Audit Frame"| BUFFER
    HANDLERS -->|"7. Coupled HTTP Response + Audit Logs"| UI
```

---

## 2. Memory Management: Pre-Allocated Circular Ring Buffer

To prevent V8 garbage collection pauses, memory leaks, and dynamic reallocation overhead under continuous evaluation workloads, the logger employs a pre-allocated fixed-size circular array object pool of **350 Audit Frames**.

### Sizing Model & Eviction Semantics:
* **Capacity**: Exactly 350 fixed slots (`Array(350)`).
* **Flow Sizing**: Average end-to-end VC transaction (Issuance or Presentation) generates 4 to 5 network frames.
* **Concurrency**: Preserves the complete audit history for approximately **70 concurrent user flows**.
* **Zero-Allocation Overwrites**: Uses a circular write pointer `pointer = (pointer + 1) % 350` to overwrite expired slots in $O(1)$ constant time.

```mermaid
flowchart LR
    classDef activeSlot fill:#0369a1,stroke:#38bdf8,stroke-width:2px,color:#ffffff;
    classDef headSlot fill:#047857,stroke:#34d399,stroke-width:3px,color:#ffffff,font-weight:bold;
    classDef evictSlot fill:#b91c1c,stroke:#f87171,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef pointer fill:#1e293b,stroke:#94a3b8,stroke-width:2px,color:#f8fafc;

    HEAD_PTR["[ Head Pointer / Active Write ]<br/>Index = (k + 1) % 350"]:::pointer
    EVICT_PTR["[ FIFO Eviction Point ]<br/>Oldest Frame Overwritten"]:::pointer

    HEAD_PTR --> S3
    EVICT_PTR --> S0

    subgraph RING_BUFFER["Pre-Allocated Circular Array (Capacity: 350 Slots)"]
        direction LR
        S0["Slot 0<br/>(Oldest)"]:::evictSlot
        S1["Slot 1"]:::activeSlot
        S2["Slot 2"]:::activeSlot
        S3["Slot 3<br/>(Current Write)"]:::headSlot
        DOTS["..."]
        S348["Slot 348"]:::activeSlot
        S349["Slot 349<br/>(Wrap Point)"]:::activeSlot

        S0 --- S1 --- S2 --- S3 --- DOTS --- S348 --- S349
        S349 -.->|"Circular Wrap: (i + 1) % 350"| S0
    end
```

---

## 3. Security & Redaction Pipeline (Selective VC Retention)

Standard security logging naively redacts all sensitive tokens, which breaks identity testing tools by hiding verifiable presentations. The Interceptor enforces a **Strict VC Exemption Rule**:

* **Redacted**: Authentication tokens (`Bearer`, `dpop`), cookies, client secrets, and OAuth assertions.
* **Exempt / Retained**: Cryptographic identity proofs (`vp_token`, `verifiableCredential`, `proof`, and claims).

```mermaid
flowchart TD
    classDef startNode fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef decision fill:#334155,stroke:#94a3b8,stroke-width:2px,color:#f8fafc;
    classDef redact fill:#b91c1c,stroke:#f87171,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef retain fill:#047857,stroke:#34d399,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef output fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#ffffff;

    RAW["Intercepted HTTP Frame<br/>(Headers, Query, Body)"]:::startNode
    INSPECT["Recursive Key-Value Traverser"]:::startNode
    
    IS_VC{"Is Key in VC Exemption List?<br/>(vp_token, proof, credential,<br/>verifiableCredential)"}:::decision
    IS_AUTH{"Is Key in Sensitive Auth List?<br/>(authorization, dpop, cookie,<br/>client_secret, access_token)"}:::decision

    REDACT_ACTION["Replace value with:<br/>'[REDACTED]'"]:::redact
    RETAIN_ACTION["Retain Raw Cryptographic Payload<br/>(Preserve wire proof & claims)"]:::retain
    PASSTHROUGH["Pass through metadata<br/>(method, url, status, latency)"]:::retain

    AUDIT_FRAME["Normalized Audit Frame Ready<br/>for Ring Buffer Storage"]:::output

    RAW --> INSPECT
    INSPECT --> IS_VC
    IS_VC -->|"YES (Match)"| RETAIN_ACTION
    IS_VC -->|"NO"| IS_AUTH

    IS_AUTH -->|"YES (Match)"| REDACT_ACTION
    IS_AUTH -->|"NO"| PASSTHROUGH

    REDACT_ACTION --> AUDIT_FRAME
    RETAIN_ACTION --> AUDIT_FRAME
    PASSTHROUGH --> AUDIT_FRAME
```

### Redaction Rules Reference:

| Domain | Keys Monitored | Sanitization Action |
|:-------|:---------------|:--------------------|
| **HTTP Transport Headers** | `authorization`, `dpop`, `cookie`, `set-cookie` | Value replaced with `"[REDACTED]"` |
| **OAuth / OIDC Credentials** | `client_secret`, `access_token`, `refresh_token`, `id_token`, `client_assertion` | String replaced with `"[REDACTED]"` |
| **Verifiable Credential Payloads** | `vp_token`, `credential`, `verifiableCredential`, `proof`, `claims` | **EXEMPT**: Retained unredacted for developer inspection |

---

## 4. Frontend Telemetry Delivery Models

The architecture supports dual delivery models to feed live network telemetry to the browser client:

```mermaid
flowchart TD
    classDef cache fill:#047857,stroke:#34d399,stroke-width:2px,color:#ffffff,font-weight:bold;
    classDef model fill:#0369a1,stroke:#38bdf8,stroke-width:2px,color:#ffffff;
    classDef ui fill:#1e293b,stroke:#64748b,stroke-width:2px,color:#f8fafc;

    CACHE[("In-Memory Ring Buffer Cache<br/>(350 Audit Frames)")]:::cache

    subgraph PHASE1["Phase 1: Response-Payload Coupling (Active Implementation)"]
        COUPLED["Inline Response Coupling<br/>(Appends protocolLogs to immediate JSON response)"]:::model
        UI_SYNC["UI Protocol Inspector & Sequence Visualizer<br/>(Synchronous render upon action completion)"]:::ui
    end

    subgraph PHASE2["Phase 2: Server-Sent Events / SSE (Roadmap)"]
        SSE_ENDPOINT["Persistent SSE Stream<br/>(GET /api/v1/audit/stream)"]:::model
        UI_ASYNC["Live Telemetry Inspector Dashboard<br/>(Real-time reactive streaming push)"]:::ui
    end

    CACHE -->|"Coupled on HTTP completion"| COUPLED
    COUPLED -->|"Fast, atomic response"| UI_SYNC

    CACHE -.->|"Stream live events"| SSE_ENDPOINT
    SSE_ENDPOINT -.->|"Push stream over HTTP connection"| UI_ASYNC
```

---

## 5. End-to-End Protocol Audit Sequence Diagram

Here is the complete end-to-end sequence showing how the Audit Logger transparently captures a two-party OpenID4VCI / OpenID4VP transaction and correlates telemetry across each specification step:

```mermaid
sequenceDiagram
    autonumber
    actor Developer as Developer / UI Client
    participant Interceptor as BFF Interceptor Middleware
    participant Logger as Ring Buffer Object Pool
    participant Engine as Target Node (Inji / Mock)

    Note over Developer,Engine: Step 1: OpenID4VCI Credential Issuance Flow
    Developer->>Interceptor: POST /api/playground/issue (format: w3c-vc)
    activate Interceptor
    Interceptor->>Interceptor: Generate transactionId (UUID) & start timer
    Interceptor->>Engine: OpenID4VCI Request (GET /.well-known & POST /credential)
    activate Engine
    Engine-->>Interceptor: Return Credential Offer + Signed VC
    deactivate Engine
    Interceptor->>Interceptor: Mask Authorization Headers (Exempt VC proof)
    Interceptor->>Logger: Write Audit Frame 1 & 2 to Ring Buffer
    Interceptor-->>Developer: HTTP 200 OK + issuedCredential + protocolLogs
    deactivate Interceptor

    Note over Developer,Engine: Step 2: OpenID4VP Verifiable Presentation Flow
    Developer->>Interceptor: POST /api/playground/verify (vp_token presentation)
    activate Interceptor
    Interceptor->>Interceptor: Correlate with transactionId & increment sequenceNo
    alt Tamper Mode Enabled (Negative Test)
        Interceptor->>Interceptor: Flag tamperFlag.isTampered = true
    end
    Interceptor->>Engine: OpenID4VP Verification (POST /vp-response)
    activate Engine
    Engine-->>Interceptor: Verification Result (Status: VALID or EXPIRED)
    deactivate Engine
    Interceptor->>Logger: Write Audit Frame 3 & 4 to Ring Buffer
    Interceptor-->>Developer: HTTP 200 OK + verificationResult + protocolLogs
    deactivate Interceptor

    Note over Developer,Logger: Developer reviews raw HTTP payloads in Live Wire Inspector
```

---

## 6. Audit Frame JSON Specification

Every frame in the ring buffer adheres to the normalized schema below:

```json
{
  "transactionId": "tx-8f9b2c3d-4e5f-4321-ba98-123456789abc",
  "sequenceNo": 3,
  "isSandbox": true,
  "origin": "holder-wallet-app",
  "destination": "verifier-backend",
  "tamperFlag": {
    "isTampered": true,
    "message": "Signature verification failed: DPoP proof HTTP method mismatch."
  },
  "protocolContext": {
    "protocol": "OpenID4VP",
    "complianceStandard": "OID4VP Draft 21",
    "credentialFormat": "w3c-vc",
    "specStep": "Authorization Response Verification"
  },
  "packet": {
    "latencyMs": 142,
    "request": {
      "method": "POST",
      "url": "https://verify.collab.mosip.net/v1/verify/presentation",
      "headers": {
        "content-type": "application/x-www-form-urlencoded",
        "authorization": "[REDACTED]"
      },
      "body": {
        "vp_token": "eyJhbGciOiJFUzI1NiIs..."
      }
    },
    "response": {
      "statusCode": 200,
      "headers": {
        "content-type": "application/json"
      },
      "body": {
        "status": "VALID"
      }
    }
  }
}
```
