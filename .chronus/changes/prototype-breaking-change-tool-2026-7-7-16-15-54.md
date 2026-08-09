---
changeKind: fix
packages:
  - "@azure-tools/typespec-breaking-change"
---

Carry declaration ModelProperty for parameter diffs so query, header, and path changes resolve back to their TypeSpec declarations.