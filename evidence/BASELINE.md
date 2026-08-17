# Baseline — Fase 0

| Campo | Valor |
|---|---|
| Data/hora | 2026-08-17 10:45:43 MDT |
| Timezone da medição | MDT-0600 |
| Commit | 3edac23738b3d62cb0634589286154e8386aa59c |
| Commit curto | 3edac23 |
| Branch | main |
| Limpo? | NAO |
| Node | v26.7.0 |
| Plataforma | Darwin arm64 |

## Hashes dos ficheiros que importam

| Ficheiro | Bytes | SHA-256 (12) |
|---|---|---|
| `index.html` | 861544 | `128dd23460f0` |
| `sw.js` | 4061 | `58df96e283d4` |
| `manifest.json` | 468 | `73ebdbba514e` |
| `_headers` | 1556 | `881f91ac7887` |
| `firestore.rules` | 9094 | `eecd65a51d42` |

## Tamanho medido contra o que o documento afirmava

O documento de auditoria diz "~861 KB e mais de 12 mil linhas". Medido agora:

- `index.html`: **861544 bytes** (841.3 KB), **12367 linhas**
- Blocos `<script>` clássicos: 9
- Blocos `<script type="module">`: 1
- Chamadas `innerHTML`: 126
- Chamadas `escapeHtml`: 128
- Handlers inline: 129
- Acessos a `localStorage`: 89
- Assets de áudio: 672 ficheiros,  28M

## Suite no baseline


  2911 checks across 27 files — GREEN
